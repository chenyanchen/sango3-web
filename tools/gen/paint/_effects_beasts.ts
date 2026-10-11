// Charging beasts of the 武将技 (normal blending, facing left): leopard,
// tiger, war elephant and fire bull — a small quadruped rig with a gallop
// cycle, painted as ink line over ochre/gamboge/grey washes.
import type { PaintOut } from '../types.ts';
import { mix } from '../ink.ts';
import type { Ctx, Rule } from './_effects_ctx.ts';
import { blobPts, rng, spline, type Pt, type Rng } from './_effects_kit.ts';
import { TAU } from './_effects_fx.ts';
import { C, Ink } from './_effects_paint.ts';

interface Species {
  L: number; // body length
  H: number; // body depth
  leg: number; // leg length
  legW: number;
  coat: string;
  belly: string;
  dark: string;
  gait: 'gallop' | 'walk';
  amp: number; // stride amplitude (px)
  head: 'cat' | 'elephant' | 'bull';
  pattern: 'stripes' | 'spots' | 'none';
}
const SP: Record<string, Species> = {
  leopard: { L: 104, H: 28, leg: 34, legW: 7, coat: mix(C.gamboge, C.ochre, 0.3), belly: C.paper, dark: C.ink, gait: 'gallop', amp: 26, head: 'cat', pattern: 'spots' },
  tiger: { L: 108, H: 34, leg: 32, legW: 9, coat: mix(C.ochre, C.cinnabar, 0.25), belly: C.paper, dark: C.ink, gait: 'gallop', amp: 24, head: 'cat', pattern: 'stripes' },
  elephant: { L: 120, H: 66, leg: 46, legW: 18, coat: mix(C.inkWash, C.paperDark, 0.35), belly: mix(C.inkWash, C.paperDark, 0.15), dark: C.inkSoft, gait: 'walk', amp: 14, head: 'elephant', pattern: 'none' },
  bull: { L: 98, H: 44, leg: 32, legW: 9, coat: mix(C.ochre, C.ink, 0.25), belly: mix(C.ochre, C.paper, 0.3), dark: C.ink, gait: 'gallop', amp: 20, head: 'bull', pattern: 'none' },
};

/** Two-segment leg from hip to foot; the joint bends backward (+x). */
function leg(ink: Ink, hip: Pt, foot: Pt, len: number, w: number, col: string, bendBack = 1) {
  const dx = foot[0] - hip[0], dy = foot[1] - hip[1];
  const d = Math.min(Math.hypot(dx, dy), len * 0.98);
  const a = len / 2;
  const h = Math.sqrt(Math.max(0, a * a - (d / 2) ** 2));
  const mx = hip[0] + dx / 2, my = hip[1] + dy / 2;
  const L = Math.hypot(dx, dy) || 1;
  const knee: Pt = [mx + (-dy / L) * h * -bendBack, my + (dx / L) * h * -bendBack];
  ink.line([hip, knee, foot], w, col, 1, { taperIn: 0, taperOut: 0.35, rag: 0.1 });
  ink.line([hip, knee, foot], Math.max(1, w * 0.18), C.ink, 0.9, { taperIn: 0.3, taperOut: 0.1, dry: 0.3 });
  ink.ell(foot[0] - 2, foot[1] - 1, w * 0.55, w * 0.32, C.ink, 1);
}

function beast(kind: keyof typeof SP) {
  const S = SP[kind];
  return (c: Ctx): PaintOut => {
    const W = 236, H = kind === 'elephant' ? 196 : 150, ax = 112, ay = H - 22;
    const ink = new Ink(W, H);
    const r = rng(c.seed);
    const p = c.i / c.n;
    const ph = p * TAU;
    const bob = S.gait === 'gallop' ? -Math.abs(Math.sin(ph)) * 5 : Math.sin(ph * 2) * 1.5;
    const pitch = S.gait === 'gallop' ? Math.sin(ph) * 0.06 : 0;
    ink.shadow(ax, ay - 1, S.L * 0.55, 6, 0.3);
    ink.ox = ax;
    ink.oy = ay;
    const by = -S.leg - S.H / 2 + bob; // body centre y
    const rot = (q: Pt): Pt => [q[0], q[1] + q[0] * pitch];
    const B = (x: number, y: number): Pt => rot([x, by + y]);
    const shoulder = B(-S.L * 0.33, S.H * 0.15), hip = B(S.L * 0.33, S.H * 0.1);
    const phases = S.gait === 'gallop' ? { hn: 0, hf: 0.12, fn: 0.5, ff: 0.62 } : { hn: 0, hf: 0.5, fn: 0.25, ff: 0.75 };
    const footAt = (base: Pt, q: number, front: boolean): Pt => {
      const a = (p + q) * TAU;
      const x = base[0] + Math.cos(a) * S.amp * (front ? -1 : -1);
      const lift = Math.max(0, Math.sin(a)) * S.leg * (S.gait === 'gallop' ? 0.45 : 0.22);
      return [x + (front ? -4 : 4), -lift];
    };
    const farCol = mix(S.coat, C.ink, 0.35);
    // far legs
    leg(ink, [hip[0] + 4, hip[1]], footAt([hip[0] + 4, 0], phases.hf, false), S.leg + S.H * 0.3, S.legW, farCol, 1);
    leg(ink, [shoulder[0] + 4, shoulder[1]], footAt([shoulder[0] + 4, 0], phases.ff, true), S.leg + S.H * 0.25, S.legW * 0.9, farCol, 1);
    // tail
    const tb = B(S.L * 0.5, -S.H * 0.25);
    if (kind === 'elephant' || kind === 'bull') ink.line([tb, [tb[0] + 8, tb[1] + 10], [tb[0] + 10 + Math.sin(ph) * 4, tb[1] + 26]], 2.5, C.ink, 1, { taperIn: 0.1, taperOut: 0.6 });
    else ink.line(spline([tb, [tb[0] + 20, tb[1] - 4 + Math.sin(ph) * 6], [tb[0] + 38, tb[1] - 14 + Math.sin(ph + 1) * 10], [tb[0] + 46, tb[1] - 28 + Math.sin(ph + 2) * 8]], 4), 6, S.coat, 1, { taperIn: 0.1, taperOut: 0.5 });
    if (kind === 'tiger') for (let k = 1; k <= 4; k++) ink.dot(tb[0] + k * 10, tb[1] - k * 5 + Math.sin(ph + k * 0.5) * 6, 3, C.ink, 0.9);
    // body
    const L = S.L, Hh = S.H;
    const body = [B(-L * 0.5, -Hh * 0.05), B(-L * 0.36, -Hh * 0.52), B(-L * 0.05, -Hh * 0.42), B(L * 0.3, -Hh * 0.52), B(L * 0.5, -Hh * 0.2), B(L * 0.46, Hh * 0.35), B(L * 0.2, Hh * 0.5), B(-L * 0.2, Hh * 0.52), B(-L * 0.46, Hh * 0.32)];
    const bp = spline([...body, body[0], body[1], body[2]], 5).slice(0, body.length * 5);
    ink.fill(bp, S.coat, 1, { tex: 0.35, texF: 0.07 });
    ink.fill(spline([B(-L * 0.38, Hh * 0.28), B(0, Hh * 0.46), B(L * 0.35, Hh * 0.3), B(0, Hh * 0.2), B(-L * 0.38, Hh * 0.28)], 4), S.belly, 0.75, { tex: 0.3 });
    // markings
    if (S.pattern === 'stripes') for (let k = 0; k < 9; k++) {
      const x = -L * 0.38 + k * L * 0.1 + r.range(-3, 3);
      ink.line([B(x, -Hh * 0.5), B(x + 4, -Hh * 0.1), B(x - 2, Hh * 0.18)], 4, C.ink, 0.9, { taperIn: 0.2, taperOut: 0.9, dry: 0.3, seed: k });
    }
    if (S.pattern === 'spots') for (let k = 0; k < 22; k++) {
      const x = r.range(-0.42, 0.42) * L, y = r.range(-0.42, 0.25) * Hh;
      const q = B(x, y);
      ink.outline(Ink.ellPts(q[0], q[1], 3, 2.4, 0, 8), 1.6, C.ink, 0.85, { dry: 0.4 });
    }
    if (kind === 'elephant') {
      // war cloth + howdah rail
      const cloth = [B(-L * 0.3, -Hh * 0.5), B(L * 0.28, -Hh * 0.52), B(L * 0.25, Hh * 0.15), B(-L * 0.28, Hh * 0.2)];
      ink.fill(cloth, C.malachite, 0.95, { tex: 0.3 });
      ink.fill([B(-L * 0.3, Hh * 0.08), B(L * 0.25, Hh * 0.04), B(L * 0.25, Hh * 0.15), B(-L * 0.28, Hh * 0.2)], C.azurite, 0.95);
      ink.outline(cloth, 1.8, C.ink);
      const hw = [B(-L * 0.22, -Hh * 0.52), B(L * 0.2, -Hh * 0.54), B(L * 0.18, -Hh * 0.9), B(-L * 0.2, -Hh * 0.88)];
      ink.fill(hw, mix(C.ochre, C.paperDark, 0.2), 1, { tex: 0.3 });
      ink.outline(hw, 1.8, C.ink);
      for (let k = 0; k < 4; k++) ink.line([B(-L * 0.18 + k * L * 0.12, -Hh * 0.88), B(-L * 0.18 + k * L * 0.12, -Hh * 0.53)], 1.2, C.ink, 0.7);
    }
    if (kind === 'bull') {
      const cloth = [B(-L * 0.25, -Hh * 0.45), B(L * 0.22, -Hh * 0.48), B(L * 0.2, Hh * 0.1), B(-L * 0.22, Hh * 0.12)];
      ink.fill(cloth, C.cinnabar, 0.95, { tex: 0.3 });
      ink.outline(cloth, 1.6, C.ink);
      // blades lashed to the horns are drawn with the head; torch bundle on the tail
      ink.line([tb, [tb[0] + 10, tb[1] - 6]], 5, C.gamboge, 1);
    }
    ink.outline(bp, kind === 'elephant' ? 2.6 : 2.2, C.ink, 1, { dry: 0.3 });
    // near legs
    leg(ink, hip, footAt([hip[0], 0], phases.hn, false), S.leg + S.H * 0.3, S.legW * 1.1, S.coat, 1);
    leg(ink, shoulder, footAt([shoulder[0], 0], phases.fn, true), S.leg + S.H * 0.25, S.legW, S.coat, 1);
    // head
    const nk = B(-L * 0.48, -Hh * 0.25);
    head(ink, S, nk, ph, r);
    return ink.out(ax, ay);
  };
}

function head(ink: Ink, S: Species, nk: Pt, ph: number, r: Rng) {
  const [x, y] = nk;
  if (S.head === 'cat') {
    const hx = x - 14, hy = y - 6;
    const skull = blobPts(hx, hy, 15, 13, rng('cathead'), 0.08, 10);
    ink.fill(skull, S.coat, 1, { tex: 0.2 });
    // muzzle
    ink.fill(Ink.ellPts(hx - 12, hy + 5, 9, 6), S.belly, 1);
    const open = (Math.sin(ph) + 1) * 2.5;
    ink.fill([[hx - 20, hy + 8], [hx - 6, hy + 8], [hx - 10, hy + 12 + open]], C.rouge, 1);
    ink.outline(skull, 2, C.ink);
    ink.line([[hx - 20, hy + 7], [hx - 8, hy + 9]], 1.6, C.ink);
    // ear
    ink.fill([[hx + 4, hy - 10], [hx + 10, hy - 20], [hx + 13, hy - 8]], S.coat, 1);
    ink.outline([[hx + 4, hy - 10], [hx + 10, hy - 20], [hx + 13, hy - 8]], 1.4, C.ink);
    // eye + brow
    ink.dot(hx - 6, hy - 3, 2, C.gamboge);
    ink.dot(hx - 6.5, hy - 3, 1, C.ink);
    ink.line([[hx - 10, hy - 6], [hx - 2, hy - 7]], 1.8, C.ink);
    ink.dot(hx - 21, hy + 3, 1.8, C.ink);
    if (S.pattern === 'stripes') for (let k = 0; k < 3; k++) ink.line([[hx - 2 + k * 5, hy - 12], [hx + k * 5, hy - 4]], 2, C.ink, 0.9, { taperOut: 0.8 });
  } else if (S.head === 'elephant') {
    const hx = x - 10, hy = y - 8;
    const skull = blobPts(hx, hy, 24, 22, rng('elehead'), 0.06, 10);
    ink.fill(skull, S.coat, 1, { tex: 0.3 });
    // trunk swinging
    const sw = Math.sin(ph * 2) * 6;
    ink.line(spline([[hx - 16, hy + 6], [hx - 26, hy + 24], [hx - 24 + sw, hy + 42], [hx - 32 + sw, hy + 54]], 4), 12, S.coat, 1, { taperIn: 0, taperOut: 0.7 });
    ink.line(spline([[hx - 16, hy + 6], [hx - 26, hy + 24], [hx - 24 + sw, hy + 42], [hx - 32 + sw, hy + 54]], 4), 2, C.ink, 0.9, { taperIn: 0, taperOut: 0.5 });
    // tusk
    ink.line([[hx - 12, hy + 16], [hx - 26, hy + 26], [hx - 38, hy + 22]], 4, C.white, 1, { taperIn: 0, taperOut: 0.8 });
    ink.outline(skull, 2.4, C.ink);
    // ear flap
    const ear = blobPts(hx + 16, hy + 2, 13, 19, rng('eleear'), 0.15, 10);
    ink.fill(ear, mix(S.coat, C.ink, 0.15), 1, { tex: 0.3 });
    ink.outline(ear, 2, C.ink);
    ink.dot(hx - 6, hy - 6, 2, C.ink);
    // armoured headpiece
    ink.fill([[hx - 14, hy - 20], [hx + 6, hy - 24], [hx + 2, hy - 10], [hx - 16, hy - 8]], C.gold, 0.9);
  } else {
    // bull: lowered head with horns (and a blade lashed between them)
    const hx = x - 12, hy = y + 4;
    const skull = blobPts(hx, hy, 16, 12, rng('bullhead'), 0.08, 10, 0.5);
    ink.fill(skull, S.coat, 1, { tex: 0.3 });
    ink.fill(Ink.ellPts(hx - 13, hy + 9, 7, 6), mix(S.belly, C.rouge, 0.3), 1);
    ink.outline(skull, 2, C.ink);
    for (const sd of [-1, 1]) ink.line([[hx + 2, hy - 8], [hx - 6 + sd * 2, hy - 20], [hx - 20, hy - 22 + sd * 3]], 4.5, C.paper, 1, { taperIn: 0, taperOut: 0.8 });
    ink.line([[hx + 2, hy - 8], [hx - 6, hy - 20], [hx - 20, hy - 22]], 1.2, C.ink, 0.9);
    ink.line([[hx - 4, hy - 16], [hx - 32, hy - 14]], 3, mix(C.white, C.azurite, 0.2), 1, { taperIn: 0, taperOut: 0.6 });
    ink.dot(hx - 6, hy - 3, 2.2, C.white);
    ink.dot(hx - 6, hy - 3, 1.2, C.ink);
    ink.dot(hx - 18, hy + 8, 1.4, C.ink);
  }
  void r;
}

export const beastRules: Rule[] = [
  { dir: 'magic/066', name: /^pant/, gen: beast('leopard') },
  { dir: 'magic/066', name: /^tiger/, gen: beast('tiger') },
  { dir: 'magic/066', name: /^hs104/, gen: beast('elephant') },
  { dir: 'magic/068', name: /^cow/, gen: beast('bull') },
];
