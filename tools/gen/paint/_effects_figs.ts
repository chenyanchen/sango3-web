// Figures inside effect dirs (archers behind the lines, summoned ink
// soldiers, charging spearmen and cavalry, golden phantom riders) reuse the
// battle-unit rig (paintSoldier in units' _units_sol.ts) so they match the
// regular troops; here they're re-coloured per skill. Villagers and trees
// of the scenery objects are drawn with the local crew/ink helpers.
import sharp from 'sharp';
import { mix } from '../ink.ts';
import type { FrameJob, PaintOut } from '../types.ts';
import type { Ctx, Rule } from './_effects_ctx.ts';
import { Cv, Fld, GOLD, rng, scaled, type Pt } from './_effects_kit.ts';
import { lit, TAU } from './_effects_fx.ts';
import { crew } from './_effects_machines.ts';
import { C, Ink } from './_effects_paint.ts';
import { paintSoldier } from './_units_sol.ts';

/** Renders a soldier frame of bf/sol/<dirNum> (act: w r a h d f, idx 1-based) to RGBA. */
async function soldier(dirNum: number, act: string, idx: number): Promise<{ cv: Cv; ax: number; ay: number }> {
  const job: FrameJob = { dir: `bf/sol/${String(dirNum).padStart(3, '0')}`, name: `a1${act}1${String(idx).padStart(4, '0')}`, box: [1, 1, 0, 0], single: false, uses: [] };
  const o = paintSoldier(job);
  if ('rgba' in o) return { cv: Cv.from(o.rgba, o.w, o.h), ax: o.ax, ay: o.ay };
  const { data, info } = await sharp(Buffer.from(o.svg), { density: 72 }).resize(o.w, o.h, { fit: 'fill' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { cv: Cv.from(new Uint8Array(data.buffer, data.byteOffset, data.byteLength), info.width, info.height), ax: o.ax, ay: o.ay };
}

type Recolor = (cv: Cv) => Cv;
/** Ink soldiers: desaturate toward monochrome ink with a faint pigment glaze. */
const inky = (k: number, glaze: string): Recolor => (cv) => {
  const g = [parseInt(glaze.slice(1, 3), 16) / 255, parseInt(glaze.slice(3, 5), 16) / 255, parseInt(glaze.slice(5, 7), 16) / 255];
  for (let i = 0; i < cv.w * cv.h; i++) {
    const a = cv.c[i * 4 + 3];
    if (a <= 0) continue;
    const r = cv.c[i * 4] / a, gg = cv.c[i * 4 + 1] / a, b = cv.c[i * 4 + 2] / a;
    const l = 0.3 * r + 0.55 * gg + 0.15 * b;
    const ink = [l * 0.92 + 0.03, l * 0.9 + 0.03, l * 0.86 + 0.03];
    for (let c = 0; c < 3; c++) {
      const tone = ink[c] * (1 - 0.25) + g[c] * l * 0.25;
      cv.c[i * 4 + c] = ((1 - k) * [r, gg, b][c] + k * tone) * a;
    }
  }
  return cv;
};
/** Gold phantom (additive): dark ink contours become bright gold lines, washes a dim glow. */
const golden: Recolor = (cv) => {
  const f = new Fld(cv.w, cv.h);
  for (let i = 0; i < cv.w * cv.h; i++) {
    const a = cv.c[i * 4 + 3];
    if (a <= 0) continue;
    const l = (0.3 * cv.c[i * 4] + 0.55 * cv.c[i * 4 + 1] + 0.15 * cv.c[i * 4 + 2]) / a;
    f.v[i] = a * (0.42 + 0.55 * (1 - l));
  }
  return lit(f, GOLD, 2, 0.4);
};

/**
 * Figure frame rule: maps each frame of a group to a soldier act/idx.
 * `map(c)` → [act, idx]; dirNum by team letter.
 */
function fig(o: { blue: (c: Ctx) => boolean; dirB: number; dirR: number; map: (c: Ctx) => [string, number]; scale?: number; recolor?: Recolor; pad?: number }) {
  return async (c: Ctx): Promise<PaintOut> => {
    const [act, idx] = o.map(c);
    const s = await soldier(o.blue(c) ? o.dirB : o.dirR, act, idx);
    let cv = scaled(s.cv, o.scale ?? 1);
    if (o.recolor) cv = o.recolor(cv);
    const k = o.scale ?? 1;
    return { rgba: cv.rgba(), w: cv.w, h: cv.h, ax: Math.round(s.ax * k), ay: Math.round(s.ay * k) };
  };
}

// archers (40010 blue 'archerb', 40016 red 'archerr'): 1 = wait, 2..9 = attack (8 frames)
const archer = fig({
  blue: (c) => c.name.startsWith('archerb'),
  dirB: 2,
  dirR: 12,
  scale: 1.1,
  map: (c) => {
    const k = +c.name.slice(-1);
    return k <= 1 ? ['w', 1] : ['a', 1 + Math.round(((k - 2) * 13) / 7)];
  },
});
// summoned troops (40150..40153): u1 = ink sabre-men, u2 = ink spearmen; a wait(8) b run(11) c attack(14) d hurt(4)
const summon = (kind: 1 | 2) =>
  fig({
    blue: (c) => c.name[2] === 'b',
    dirB: kind === 1 ? 101 : 103,
    dirR: kind === 1 ? 111 : 113,
    scale: 1.12,
    recolor: inky(kind === 1 ? 0.85 : 0.7, kind === 1 ? C.malachite : C.indigo),
    map: (c) => {
      const g = c.name[3], k = +c.name.slice(-4);
      if (g === 'a') return ['w', ((k - 1) % 4) + 1];
      if (g === 'b') return ['r', 1 + Math.round(((k - 3) * 11) / 10) % 12];
      if (g === 'c') return ['a', Math.min(14, k)];
      return ['h', Math.min(4, k)];
    },
  });
// charging long-spearmen (40440 blue 'laba', 40441 red 'lana'): 12-frame run
const spearman = fig({ blue: (c) => c.name.startsWith('laba'), dirB: 3, dirR: 13, scale: 1.1, map: (c) => ['r', ((+c.name.slice(-4) - 1) % 12) + 1] });
// iron cavalry (41200 blue 'labb', 41201 red 'labr'): 23-frame gallop
const cavalry = fig({ blue: (c) => c.name.startsWith('labb'), dirB: 104, dirR: 114, scale: 1.1, map: (c) => ['r', (Math.round(((+c.name.slice(-4) - 1) * 24) / 23) % 12) + 1] });
// golden phantom riders (41060, additive): 20-frame gallop
const clone = fig({ blue: () => true, dirB: 104, dirR: 104, scale: 1.2, recolor: golden, map: (c) => ['r', (Math.round(((+c.name.slice(-4) - 1) * 24) / 20) % 12) + 1] });

// ------------------------------------------------------------------ villagers & trees (scenery objects)
function villager(kind: 'child' | 'lady' | 'men' | 'oldmen') {
  return (c: Ctx): PaintOut => {
    const W = 90, H = 120, ax = 40, ay = 110;
    const ink = new Ink(W, H);
    const ph = (c.i / c.n) * TAU;
    const s = kind === 'child' ? 0.75 : kind === 'oldmen' ? 1.05 : 1.2;
    const col = { child: C.ochre, lady: mix(C.rouge, C.paper, 0.4), men: mix(C.malachite, C.paperDark, 0.3), oldmen: mix(C.indigo, C.paper, 0.45) }[kind];
    ink.shadow(ax, ay - 1, 14 * s, 3);
    crew(ink, ax, ay - 1, s, col, { lean: kind === 'oldmen' ? 0.5 : 0.15, step: Math.sin(ph), arm: 0.4 + Math.sin(ph) * 0.5, arm2: 0.4 - Math.sin(ph) * 0.5 });
    if (kind === 'oldmen') ink.line([[ax - 14, ay - 1], [ax - 12, ay - 38]], 2, C.ochre); // cane
    if (kind === 'lady') ink.fill([[ax - 9 * s, ay - 22 * s], [ax + 9 * s, ay - 22 * s], [ax + 12 * s, ay - 2], [ax - 12 * s, ay - 2]], col, 1); // long skirt
    return ink.out(ax, ay);
  };
}
/** Ink-wash tree: trunk strokes + leaf-dot clusters (day / evening / night tones). */
function tree(c: Ctx): PaintOut {
  const m = /^tree(\d)(\d)(\d)$/.exec(c.name)!;
  const tod = +m[2], kind = +m[3];
  const W = 150, H = 160, ax = 74, ay = 154;
  const ink = new Ink(W, H);
  const r = rng('tree' + kind);
  const leaf = [mix(C.malachite, C.ink, 0.15), mix(C.ochre, C.cinnabar, 0.25), mix(C.indigo, C.ink, 0.45)][tod - 1] ?? C.malachite;
  const trunkC = tod === 3 ? C.ink : C.inkSoft;
  ink.shadow(ax, ay - 2, 40, 6, 0.3);
  // trunk & branches
  const top: Pt = [ax + r.range(-8, 8), ay - 90];
  ink.line([[ax, ay - 2], [ax - 3, ay - 40], top], 12, trunkC, 1, { taperIn: 0, taperOut: 0.6, dry: 0.4 });
  for (let k = 0; k < 4; k++) {
    const y = ay - 50 - k * 12, sd = k % 2 ? 1 : -1;
    ink.line([[ax + sd * 2, y], [ax + sd * r.range(25, 45), y - r.range(15, 30)]], 5, trunkC, 1, { taperIn: 0, taperOut: 0.8, dry: 0.5, seed: k });
  }
  // foliage: clusters of dabbed dots (点叶)
  for (let k = 0; k < (kind === 2 ? 9 : 12); k++) {
    const cx = ax + r.range(-55, 55), cy = ay - 70 - r.range(0, 70);
    const rr = r.range(14, 26);
    ink.fill(Ink.ellPts(cx, cy, rr, rr * 0.75), leaf, 0.75, { tex: 0.5, texF: 0.15 });
    for (let j = 0; j < 6; j++) ink.dot(cx + r.range(-rr, rr), cy + r.range(-rr, rr) * 0.7, r.range(2, 4), mix(leaf, C.ink, 0.4), 0.85);
  }
  return ink.out(ax, ay);
}
/** Bonfire wood pile (42106). */
function woodpile(c: Ctx): PaintOut {
  const ink = new Ink(30, 66);
  for (let k = 0; k < 4; k++) ink.line([[4 + k * 6, 63], [24 - k * 5, 46]], 4, C.inkSoft, 1, { seed: k });
  ink.ell(15, 62, 12, 3, C.ink, 0.5);
  void c;
  return ink.out(13, 62);
}

export const figRules: Rule[] = [
  { dir: 'magic/001', group: (n) => n.slice(0, 7), gen: archer },
  { dir: 'magic/015', name: /^u1/, group: (n) => n.slice(0, 4), gen: summon(1) },
  { dir: 'magic/015', name: /^u2/, group: (n) => n.slice(0, 4), gen: summon(2) },
  { dir: 'magic/044', group: (n) => n.slice(0, 4), gen: spearman },
  { dir: 'magic/120', group: (n) => n.slice(0, 4), gen: cavalry },
  { dir: 'magic/106', name: /^clon/, gen: clone },
  { dir: 'magic/bg/obj', name: /^child/, gen: villager('child') },
  { dir: 'magic/bg/obj', name: /^lady/, gen: villager('lady') },
  { dir: 'magic/bg/obj', name: /^men/, gen: villager('men') },
  { dir: 'magic/bg/obj', name: /^oldmen/, gen: villager('oldmen') },
  { dir: 'magic/bg/obj', name: /^tree/, group: (n) => n, gen: tree },
  { dir: 'magic/bg/obj', name: /^bfire$/, gen: woodpile },
];
