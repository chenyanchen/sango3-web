// More light effects: pillars of light, rings, sparkles, comets, glyphs,
// glowing weapons, wind, water, ice, taiji, bagua, holy fans, vortexes.
import type { PaintOut } from '../types.ts';
import { FONT_BRUSH } from '../ink.ts';
import type { Ctx, Rule } from './_effects_ctx.ts';
import { AZURE, CRIMSON, DUST, FIRE, GOLD, INK, JADE, VIOLET, type Ramp } from './_effects_kit.ts';
import { arc, blobPts, bolt, burst, clamp, Cv, ease, erode, flame, Fld, halo, lerp, lit, out, pool, rng, seedNum, smooth, splatter, svgFld, TAU, xform, type Pt, type Rng } from './_effects_fx.ts';
import { EMBER, ICE, PALE, explosion, flameLoop, lightning, shock } from './_effects_glow.ts';

/** Faint additive haze (dust puff): low alpha so it never blows out. */
export const HAZE: Ramp = [
  [0, '#6a5a40', 0],
  [0.4, '#8a7a5a', 0.3],
  [1, '#c8b890', 0.55],
];
export const ROSE: Ramp = [
  [0, '#3a0a20', 0],
  [0.3, '#7a1a40', 0.6],
  [0.6, '#c84070', 0.95],
  [0.85, '#f0a0b8', 1],
  [1, '#fff0f4', 1],
];

const box = (c: Ctx) => ({ w: c.box[0], h: c.box[1], ax: c.box[2], ay: c.box[3] });

/** A line through the box along its long axis (or along `ang` if the anchor is central). */
export function lineInBox(w: number, h: number, ax: number, ay: number, fallback: number, margin = 3): [Pt, Pt] {
  const cx = w / 2, cy = h / 2;
  let ang = fallback;
  if (Math.hypot(ax - cx, ay - cy) > Math.min(w, h) * 0.12) ang = Math.atan2(cy - ay, cx - ax);
  const dx = Math.cos(ang), dy = Math.sin(ang);
  const tx = Math.abs(dx) > 1e-6 ? (w / 2 - margin) / Math.abs(dx) : 1e9;
  const ty = Math.abs(dy) > 1e-6 ? (h / 2 - margin) / Math.abs(dy) : 1e9;
  const L = Math.min(tx, ty);
  return [[cx - dx * L, cy - dy * L], [cx + dx * L, cy + dy * L]];
}

// ------------------------------------------------------------------ pillars
/** Column of light: strongest at the anchor end, brushed vertical streaks. */
function pillar(ramp: Ramp, o: { wK?: number; streaks?: number; grow?: boolean } = {}) {
  return (c: Ctx): PaintOut => {
    const { w, h, ax, ay } = box(c);
    const f = new Fld(w, h);
    const r = rng(c.seed);
    const W = w * (o.wK ?? 0.5);
    const down = ay < h / 2; // hangs below the anchor
    const n = o.streaks ?? 5;
    for (let k = 0; k < n; k++) {
      const x = ax + (k / (n - 1) - 0.5) * W * 0.8 + r.range(-2, 2);
      const y0 = down ? Math.max(0, ay) : Math.min(h, ay), y1 = down ? h - 2 : 2;
      f.stroke([[x, y0], [x + r.range(-3, 3), lerp(y0, y1, 0.5)], [x, y1]], W * r.range(0.25, 0.45), r.range(0.5, 0.8), { taperIn: 0.05, taperOut: 0.95, dry: 0.5, seed: k + 3, rag: 0.15 });
    }
    f.dab(ax, Math.max(2, Math.min(h - 2, ay)), W * 0.6, 0.9, { hard: 0.2, sy: 0.45 });
    f.tex(0.03, 0.75, 1.1, 0, c.i * 9);
    return out(lit(f, ramp, Math.max(2, W * 0.12), 0.5), ax, ay);
  };
}

// ------------------------------------------------------------------ sparkles
/** Four-point star glint (刀光). */
function sparkle(ramp: Ramp, o: { rot?: number } = {}) {
  return (c: Ctx): PaintOut => {
    const { w, h } = box(c);
    const W = Math.max(w, 9), H = Math.max(h, 9);
    const cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.48;
    const f = new Fld(W, H);
    const a = (o.rot ?? 0) + c.i * 0.4;
    for (const k of [0, 1]) {
      const an = a + (k * Math.PI) / 2;
      const L = R * (k ? 0.65 : 1);
      f.stroke([[cx - Math.cos(an) * L, cy - Math.sin(an) * L], [cx, cy], [cx + Math.cos(an) * L, cy + Math.sin(an) * L]], Math.max(2, R * 0.3), 1, { taperIn: 0.45, taperOut: 0.45, rag: 0 });
    }
    f.dab(cx, cy, R * 0.35, 1, { hard: 0.3 });
    return out(lit(f, ramp, Math.max(1, R * 0.2), 0.5), cx, cy);
  };
}
/** Soft glowing mote (rising particles). */
function mote(ramp: Ramp) {
  return (c: Ctx): PaintOut => {
    const { w, h } = box(c);
    const W = Math.max(w, 6), H = Math.max(h, 6);
    const f = new Fld(W, H);
    f.dab(W / 2, H / 2, Math.min(W, H) * 0.45, 1, { hard: 0.15 });
    f.dab(W / 2, H / 2, Math.min(W, H) * 0.18, 1, { hard: 0.5 });
    return out(f.ramp(ramp), W / 2, H / 2);
  };
}

// ------------------------------------------------------------------ rings
function ring(ramp: Ramp, o: { wK?: number; turns?: number; spin?: number; gaps?: number; alpha?: number } = {}) {
  return (c: Ctx): PaintOut => {
    const { w, h } = box(c);
    const cx = w / 2, cy = h / 2;
    const f = new Fld(w, h);
    const r = rng(c.seed);
    const rx = w * 0.44, ry = h * 0.42;
    const wd = Math.max(2, Math.min(w, h) * (o.wK ?? 0.12));
    const segs = o.gaps ?? 3;
    const rot = (o.spin ?? 0.5) * c.i;
    for (let k = 0; k < segs; k++) {
      const a0 = rot + (k / segs) * TAU + r.range(0, 0.3);
      arc(f, cx, cy, rx * r.range(0.95, 1.03), ry * r.range(0.95, 1.03), a0, a0 + (TAU / segs) * r.range(0.8, 1.05), wd, (o.alpha ?? 0.9) * r.range(0.8, 1), { dry: 0.45, seed: k + c.i });
    }
    return out(lit(f, ramp, Math.max(2, wd * 0.5), 0.5), cx, cy);
  };
}

// ------------------------------------------------------------------ comets / projectiles
/** Head at the anchor, tail streaming toward the far side of the box. */
function comet(ramp: Ramp, o: { head?: number; tails?: number; core?: Ramp; tailDir?: number } = {}) {
  return (c: Ctx): PaintOut => {
    const { w, h, ax, ay } = box(c);
    const f = new Fld(w, h);
    const r = rng(c.seed + c.i);
    let ang = o.tailDir ?? Math.atan2(h / 2 - ay, w / 2 - ax);
    if (o.tailDir === undefined && Math.hypot(h / 2 - ay, w / 2 - ax) < 3) ang = -Math.PI / 4;
    const dx = Math.cos(ang), dy = Math.sin(ang);
    const L = Math.min(Math.abs(dx) > 0.01 ? (dx > 0 ? w - ax : ax) / Math.abs(dx) : 1e9, Math.abs(dy) > 0.01 ? (dy > 0 ? h - ay : ay) / Math.abs(dy) : 1e9) - 3;
    const HR = Math.max(3, Math.min(w, h) * (o.head ?? 0.22));
    const nx = -dy, ny = dx;
    const nt = o.tails ?? 4;
    for (let k = 0; k < nt; k++) {
      const off = (k / Math.max(1, nt - 1) - 0.5) * HR * 1.1;
      const Lk = L * r.range(0.6, 1);
      const wig = r.range(-0.15, 0.15) * HR;
      f.stroke([[ax + nx * off * 0.3, ay + ny * off * 0.3], [ax + dx * Lk * 0.5 + nx * (off + wig), ay + dy * Lk * 0.5 + ny * (off + wig)], [ax + dx * Lk + nx * off * 1.4, ay + dy * Lk + ny * off * 1.4]], HR * r.range(0.7, 1.15), r.range(0.55, 0.85), { taperIn: 0.02, taperOut: 0.95, dry: 0.55, seed: k + c.i * 7, rag: 0.25, afn: (t) => (1 - t) ** 1.3 });
    }
    f.dab(ax, ay, HR, 1, { hard: 0.35, tex: 0.3, texF: 3 });
    return out(lit(f, ramp, Math.max(2, HR * 0.4), 0.5), ax, ay);
  };
}

// ------------------------------------------------------------------ crescents (slash waves)
/** Crescent slash, convex toward +x (the art faces right). */
function crescent(ramp: Ramp) {
  return (c: Ctx): PaintOut => {
    const { w, h, ax, ay } = box(c);
    const f = new Fld(w, h);
    const cx = w * 0.18, cy = h / 2, R = Math.min(w * 0.72, h * 0.47);
    const n = 24;
    const outer: Pt[] = [], inner: Pt[] = [];
    for (let i = 0; i <= n; i++) {
      const a = -Math.PI / 2 + (i / n) * Math.PI;
      const th = Math.sin((i / n) * Math.PI);
      outer.push([cx + Math.cos(a) * R, cy + Math.sin(a) * R]);
      inner.push([cx + Math.cos(a) * R * (1 - 0.42 * th), cy + Math.sin(a) * R * (0.97 - 0.1 * th)]);
    }
    f.poly([...outer, ...inner.reverse()], 0.95);
    // bristle streaks along the blade
    for (let k = 0; k < 4; k++) arc(f, cx, cy, R * (0.72 + k * 0.07), R * (0.94 + k * 0.015), -Math.PI / 2 + 0.2, Math.PI / 2 - 0.2, Math.max(2, R * 0.05), 0.45, { dry: 0.6, seed: k + c.i * 5 });
    pool(f, Math.max(2, R * 0.08), 0.35);
    // trailing flame licks behind (left)
    const r = rng(c.seed + c.i);
    for (let k = 0; k < 6; k++) {
      const a = -Math.PI / 2 + ((k + 0.5) / 6) * Math.PI;
      const px = cx + Math.cos(a) * R * 0.75, py = cy + Math.sin(a) * R * 0.95;
      f.stroke([[px, py], [px - R * r.range(0.25, 0.5), py + r.range(-4, 4)]], R * 0.09, 0.5, { taperIn: 0.05, taperOut: 0.9, dry: 0.5, seed: k });
    }
    return out(lit(f, ramp, Math.max(2, R * 0.08), 0.5), ax, ay);
  };
}

// ------------------------------------------------------------------ glyphs
/** Calligraphy character glowing (status marks, eight gates). */
function glyph(ch: (c: Ctx) => string, ramp: Ramp, o: { size?: number } = {}) {
  return async (c: Ctx): Promise<PaintOut> => {
    const { w, h, ax, ay } = box(c);
    const s = Math.min(w, h) * (o.size ?? 0.86);
    const f = await svgFld(w, h, `<text x="${w / 2}" y="${h / 2 + s * 0.36}" font-size="${s}" text-anchor="middle" font-family="${FONT_BRUSH}" fill="#000" stroke="#000" stroke-width="${(s * 0.05).toFixed(1)}" stroke-linejoin="round">${ch(c)}</text>`);
    pool(f, 2, 0.3);
    return out(lit(f, ramp, Math.max(2, s * 0.08), 0.6), ax, ay);
  };
}

// ------------------------------------------------------------------ weapons of light
/** 剑: blade from p0 (hilt) to p1 (tip) into a field. */
export function jian(f: Fld, p0: Pt, p1: Pt, wd: number, a = 1) {
  const dx = p1[0] - p0[0], dy = p1[1] - p0[1], L = Math.hypot(dx, dy) || 1;
  const ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
  const g: Pt = [p0[0] + ux * L * 0.24, p0[1] + uy * L * 0.24];
  // blade
  f.poly([[g[0] + nx * wd * 0.5, g[1] + ny * wd * 0.5], [p1[0] - ux * wd * 1.2 + nx * wd * 0.42, p1[1] - uy * wd * 1.2 + ny * wd * 0.42], p1, [p1[0] - ux * wd * 1.2 - nx * wd * 0.42, p1[1] - uy * wd * 1.2 - ny * wd * 0.42], [g[0] - nx * wd * 0.5, g[1] - ny * wd * 0.5]], a);
  // guard
  f.stroke([[g[0] + nx * wd * 1.5, g[1] + ny * wd * 1.5], [g[0] - nx * wd * 1.5, g[1] - ny * wd * 1.5]], wd * 0.7, a, { taperIn: 0.3, taperOut: 0.3, rag: 0 });
  // grip + pommel
  f.stroke([p0, g], wd * 0.6, a, { taperIn: 0, taperOut: 0, rag: 0 });
  f.dab(p0[0], p0[1], wd * 0.55, a, { hard: 0.6 });
  return f;
}
function glowSword(ramp: Ramp, o: { set?: (c: Ctx) => { ang: number; k: number }; sink?: boolean } = {}) {
  return (c: Ctx): PaintOut => {
    const { w, h, ax, ay } = box(c);
    const W = w + 8, H = h + 8;
    const f = new Fld(W, H);
    const fb = o.set ? o.set(c).ang : -Math.PI / 2;
    if (o.sink) {
      // vertical sword, tip down into the ground at the anchor; only the part above shows
      const L = 90;
      jian(f, [ax + 4, ay + 4 - L], [ax + 4, ay + 4 + 30], Math.max(3, w * 0.12));
      for (let y = Math.min(H, ay + 4); y < H; y++) for (let x = 0; x < W; x++) f.v[y * W + x] = 0;
      f.dab(ax + 4, ay + 4, w * 0.4, 0.8, { hard: 0.2, sy: 0.35 });
    } else {
      const [pa, pb] = lineInBox(w, h, ax, ay, fb, 4);
      jian(f, [pa[0] + 4, pa[1] + 4], [pb[0] + 4, pb[1] + 4], Math.max(3, Math.min(w, h) * 0.12));
    }
    return out(lit(f, ramp, 4, 0.7), ax + 4, ay + 4);
  };
}
/** Golden rod (如意 staff) pivoting at the anchor. */
function rod(ramp: Ramp) {
  return (c: Ctx): PaintOut => {
    const { w, h, ax, ay } = box(c);
    const f = new Fld(w + 6, h + 6);
    const p1: Pt = [w - ax + 3, h - ay + 3], p0: Pt = [ax + 3, ay + 3];
    f.stroke([p0, p1], Math.max(4, Math.min(w, h) * 0.32), 0.85, { taperIn: 0, taperOut: 0.1, rag: 0.05, dry: 0.15 });
    f.dab(p1[0], p1[1], Math.max(4, Math.min(w, h) * 0.3), 1, { hard: 0.5 });
    return out(lit(f, ramp, 3, 0.6), ax + 3, ay + 3);
  };
}
/** 方天画戟 halberd of light, rotating (16 frames). */
function halberd(ramp: Ramp) {
  return (c: Ctx): PaintOut => {
    const { w, h, ax, ay } = box(c);
    const W = 110, H = 110, cx = W / 2, cy = H / 2;
    const f = new Fld(W, H);
    const ang = (c.i / c.n) * TAU;
    const L = 50;
    const ux = Math.cos(ang), uy = Math.sin(ang), nx = -uy, ny = ux;
    const P = (s: number, n = 0): Pt => [cx + ux * s + nx * n, cy + uy * s + ny * n];
    f.stroke([P(-L), P(L * 0.55)], 4, 0.8, { taperIn: 0, taperOut: 0, rag: 0 });
    // spear head
    f.poly([P(L * 0.5, -4), P(L, 0), P(L * 0.5, 4)], 1);
    // crescent blades (月牙) on both sides
    for (const sd of [-1, 1]) f.poly([P(L * 0.45, sd * 3), P(L * 0.62, sd * 16), P(L * 0.42, sd * 14), P(L * 0.3, sd * 18), P(L * 0.33, sd * 3)], 1);
    f.dab(...P(L * 0.3), 3, 1, { hard: 0.5 });
    void w, h;
    return out(lit(f, ramp, 4, 0.7), cx - (w / 2 - ax), cy - (h / 2 - ay));
  };
}

// ------------------------------------------------------------------ dust / smoke
function dust(ramp: Ramp, o: { up?: boolean } = {}) {
  return (c: Ctx): PaintOut => {
    const { w, h, ax, ay } = box(c);
    const f = new Fld(w, h);
    const r = rng(c.seed);
    const cy = o.up ? ay - h * 0.32 : h / 2;
    for (let k = 0; k < 6; k++) f.dab(w / 2 + r.range(-w, w) * 0.22, cy + r.range(-h, h) * 0.15, Math.min(w, h) * r.range(0.22, 0.32), r.range(0.5, 0.8), { hard: 0.1, tex: 0.6, texF: 2.5 });
    pool(f, 3, 0.5);
    return out(f.ramp(ramp), ax, ay);
  };
}
function shadow() {
  return (c: Ctx): PaintOut => {
    const { w, h, ax, ay } = box(c);
    const W = w + 4, H = h + 4;
    const f = new Fld(W, H);
    f.dab(W / 2, H / 2, W / 2 - 1, 0.55, { hard: 0.3, sy: H / W });
    return out(f.color([0.08, 0.06, 0.05]), ax + 2, ay + 2);
  };
}

// ------------------------------------------------------------------ water / ice
/** Water column rising from the anchor (ma3019..34): azurite wash streaks with foam crest. */
function waterColumn(c: Ctx): PaintOut {
  const W = c.gw, H = c.gh;
  const ax = W / 2, ay = H;
  const hh = c.box[1];
  const f = new Fld(W, H);
  const r = rng(c.seed);
  for (let k = 0; k < 7; k++) {
    const x = ax + (k / 6 - 0.5) * W * 0.6;
    const ph = c.i * 0.9 + k;
    const pts: Pt[] = [];
    for (let s = 0; s <= 6; s++) pts.push([x + Math.sin(ph + s * 1.3) * 3, ay - 2 - (hh - 6) * (s / 6)]);
    f.stroke(pts, W * r.range(0.14, 0.22), r.range(0.38, 0.6), { taperIn: 0.02, taperOut: 0.25, dry: 0.55, seed: k + c.i * 3, rag: 0.2, mode: 'max' });
  }
  // crest foam
  const top = ay - hh + 6;
  for (let k = 0; k < 6; k++) f.dab(ax + r.range(-0.3, 0.3) * W, top + r.range(-3, 6), W * r.range(0.08, 0.14), 0.75, { hard: 0.4, mode: 'max' });
  f.dab(ax, ay - 4, W * 0.4, 0.55, { hard: 0.2, sy: 0.3, mode: 'max' });
  return out(lit(f, AZURE, 3, 0.5), ax, ay);
}
function spray(c: Ctx): PaintOut {
  const { w, h, ax, ay } = box(c);
  const f = new Fld(w, h);
  const r = rng(c.seed);
  const g = 0.6 + 0.4 * c.t;
  for (let k = 0; k < 18; k++) {
    const a = -Math.PI * r.range(0.1, 0.9);
    const d = r.range(0.2, 1) * w * 0.45 * g;
    f.dab(ax + Math.cos(a) * d, ay + Math.sin(a) * d * 0.6 + c.t * 6, r.range(2, 5), 1 - c.t * 0.5, { hard: 0.5 });
  }
  for (let k = 0; k < 5; k++) f.stroke([[ax, ay], [ax + r.range(-0.45, 0.45) * w * g, ay - r.range(0.2, 0.6) * h * g]], 6, 0.6 * (1 - c.t * 0.6), { taperIn: 0.1, taperOut: 0.9, dry: 0.5, seed: k });
  return out(lit(f, AZURE, 2, 0.5), ax, ay);
}
function drop(ramp: Ramp) {
  return (c: Ctx): PaintOut => {
    const { w, h, ax, ay } = box(c);
    const f = new Fld(w + 4, h + 4);
    const R = Math.min(w, h) * 0.32;
    const a = c.i * 0.9;
    f.dab(ax + 2, ay + 2, R, 1, { hard: 0.45, sx: 1.3, sy: 0.8, rot: a });
    f.dab(ax + 2 - Math.cos(a) * R, ay + 2 - Math.sin(a) * R, R * 0.5, 0.7, { hard: 0.5 });
    return out(lit(f, ramp, 1, 0.5), ax + 2, ay + 2);
  };
}
/** Ice crystal cluster growing from the anchor (bottom). */
function iceGrow(c: Ctx): PaintOut {
  const W = c.gw + 10, H = c.gh + 4;
  const ax = W / 2, ay = H - 4;
  const hh = c.box[1] - 4;
  const f = new Fld(W, H);
  const r = rng(c.seed);
  const shards: [number, number, number][] = [[0, 1, 0.34], [-0.35, 0.65, 0.26], [0.32, 0.72, 0.24], [-0.15, 0.45, 0.2], [0.2, 0.4, 0.18]];
  for (const [ang, len, wd] of shards) {
    const L = hh * len, Wd = Math.max(3, hh * wd * 0.5 + 4);
    const tip: Pt = [ax + Math.sin(ang) * L, ay - Math.cos(ang) * L];
    const nx = Math.cos(ang), ny = Math.sin(ang);
    const base1: Pt = [ax + nx * Wd * 0.5, ay + ny * Wd * 0.5], base2: Pt = [ax - nx * Wd * 0.5, ay - ny * Wd * 0.5];
    const mid1: Pt = [lerp(base1[0], tip[0], 0.7) + nx * Wd * 0.25, lerp(base1[1], tip[1], 0.7)];
    const mid2: Pt = [lerp(base2[0], tip[0], 0.7) - nx * Wd * 0.25, lerp(base2[1], tip[1], 0.7)];
    f.poly([base1, mid1, tip, mid2, base2], 0.55);
    // bright facet edge
    f.stroke([[ax, ay], tip], Math.max(1.5, Wd * 0.18), 0.9, { taperIn: 0.1, taperOut: 0.2, rag: 0 });
    f.stroke([mid1, tip], Math.max(1.5, Wd * 0.12), 1, { rag: 0 });
  }
  void r;
  return out(lit(f, ICE, 2, 0.6), ax, ay);
}
function iceShard(c: Ctx): PaintOut {
  const { w, h, ax, ay } = box(c);
  const f = new Fld(w + 4, h + 4);
  const a = c.i * 1.1 + 0.4;
  const L = Math.max(w, h) * 0.42;
  const P = xform([[0, -L], [L * 0.28, 0], [0, L * 0.6], [-L * 0.28, 0]], 0, 0, a, 1, ax + 2, ay + 2);
  f.poly(P, 0.65);
  f.stroke([P[0], P[2]], 2, 1, { rag: 0 });
  return out(lit(f, ICE, 2, 0.6), ax + 2, ay + 2);
}
function frost(c: Ctx): PaintOut {
  const { w, h, ax, ay } = box(c);
  const f = new Fld(w, h);
  const r = rng(c.seed);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * TAU + r.range(-0.2, 0.2);
    f.stroke([[ax, ay], [ax + Math.cos(a) * w * 0.45, ay + Math.sin(a) * h * 0.45]], 4, 0.8, { taperIn: 0.05, taperOut: 0.8, rag: 0.1 });
  }
  f.dab(ax, ay, Math.min(w, h) * 0.25, 0.8, { hard: 0.3, tex: 0.5, texF: 3 });
  return out(lit(f, ICE, 3, 0.6), ax, ay);
}

// ------------------------------------------------------------------ wind
/** Tornado band: sweeping grey-jade brush arcs around an ellipse (3 frames loop). */
function windRing(c: Ctx): PaintOut {
  const { w, h, ax, ay } = box(c);
  const f = new Fld(w, h);
  const r = rng(c.seed);
  const rx = w * 0.45, ry = h * 0.38;
  const ph = c.i * 0.8;
  for (let k = 0; k < 6; k++) {
    const a0 = ph + (k / 6) * TAU + r.range(0, 0.4);
    arc(f, ax, ay, rx * r.range(0.8, 1.02), ry * r.range(0.75, 1.05), a0, a0 + r.range(1.2, 2.2), Math.max(3, h * r.range(0.06, 0.12)), r.range(0.4, 0.7), { dry: 0.75, seed: k + c.i * 11, taperIn: 0.1, taperOut: 0.85 });
  }
  return out(lit(f, PALE, 2, 0.4), ax, ay);
}

// ------------------------------------------------------------------ taiji / bagua
/** Taiji disc on the ground in perspective; rays rise as it grows (sequence grows then shrinks). */
function taiji(c: Ctx): PaintOut {
  const W = 280, H = 200, ax = 128, ay = 152;
  const f = new Fld(W, H);
  // ma101001..006 grow, 008..013 shrink (mirror order)
  const idx = c.i < 6 ? c.i : 11 - c.i;
  const g = (idx + 1) / 6;
  const R = 60 + 40 * g, sy = 0.36;
  const rot = c.i * 0.5;
  arc(f, ax, ay, R, R * sy, rot, rot + TAU * 0.98, 7, 0.9, { dry: 0.3, seed: 1 });
  // S-curve divider and eyes
  const S: Pt[] = [];
  for (let i = 0; i <= 20; i++) {
    const q = i / 20, a = rot + q * Math.PI;
    const rr = R * 0.5;
    const cx = q < 0.5 ? R * 0.5 : -R * 0.5;
    void cx;
    const t2 = q * 2 - 1;
    S.push([ax + Math.cos(rot) * t2 * R + Math.cos(a + Math.PI / 2) * rr * Math.sin(q * TAU) * 0.6, ay + (Math.sin(rot) * t2 * R + Math.sin(a + Math.PI / 2) * rr * Math.sin(q * TAU) * 0.6) * sy]);
  }
  f.stroke(S, 6, 0.85, { taperIn: 0.2, taperOut: 0.2, dry: 0.3 });
  for (const s of [-1, 1]) f.dab(ax + Math.cos(rot) * R * 0.5 * s, ay + Math.sin(rot) * R * 0.5 * s * sy, R * 0.12, 1, { hard: 0.5, sy: sy * 1.6 });
  // inner wash
  f.dab(ax, ay, R, 0.25, { hard: 0.6, sy });
  // rising light rays
  if (idx >= 3) {
    const k = (idx - 2) / 3;
    for (let j = 0; j < 7; j++) {
      const a = (j / 7) * TAU + rot;
      const x = ax + Math.cos(a) * R * 0.85, y = ay + Math.sin(a) * R * 0.85 * sy;
      f.stroke([[x, y], [x + Math.cos(a) * 10, y - 70 * k - 20]], 14, 0.45 * k, { taperIn: 0.05, taperOut: 0.95, dry: 0.6, seed: j });
    }
  }
  return out(lit(f, AZURE, 4, 0.5), ax, ay);
}
/** Big burst of light (taiji detonation / generic flare). */
function flare(ramp: Ramp) {
  return (c: Ctx): PaintOut => {
    const { w, h, ax, ay } = box(c);
    const f = new Fld(w, h);
    const r = rng(c.seed);
    const R = Math.min(w, h) * 0.45;
    f.dab(ax, ay, R * 0.35, 1, { hard: 0.3 });
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * TAU + r.range(-0.1, 0.1);
      const L = R * r.range(0.5, 1.1);
      f.stroke([[ax, ay], [ax + Math.cos(a) * L, ay + Math.sin(a) * L * (h / w)]], R * 0.12, r.range(0.4, 0.8), { taperIn: 0.05, taperOut: 0.95, dry: 0.5, seed: k });
    }
    return out(lit(f, ramp, Math.max(3, R * 0.1), 0.5), ax, ay);
  };
}
const TRIGRAMS = [0b111, 0b110, 0b101, 0b100, 0b011, 0b010, 0b001, 0b000]; // 乾兑离震巽坎艮坤
/** Trigram (三爻) glowing bars, rotated to face the centre of the bagua circle. */
function trigram(c: Ctx): PaintOut {
  const { w, h, ax, ay } = box(c);
  const W = Math.max(w, 70), H = Math.max(h, 70);
  const cx = W / 2, cy = H / 2;
  const f = new Fld(W, H);
  const k = c.i;
  const rot = (k / 8) * TAU;
  const bits = TRIGRAMS[k % 8];
  for (let b = 0; b < 3; b++) {
    const off = (b - 1) * 13;
    const solid = (bits >> (2 - b)) & 1;
    const segs: [number, number][] = solid ? [[-28, 28]] : [[-28, -6], [6, 28]];
    for (const [x0, x1] of segs) f.stroke(xform([[x0, off], [x1, off]], 0, 0, rot, 1, cx, cy), 9, 0.95, { taperIn: 0.1, taperOut: 0.1, dry: 0.25, seed: b + k * 3, rag: 0.1 });
  }
  return out(lit(f, GOLD, 3, 0.6), ax + (W - w) / 2, ay + (H - h) / 2);
}
function dome(ramp: Ramp) {
  return (c: Ctx): PaintOut => {
    const { w, h, ax, ay } = box(c);
    const f = new Fld(w, h);
    const R = Math.min(w / 2, h) * 0.9;
    const base = Math.min(h - 3, ay + R * 0.25);
    f.dab(w / 2, base, R, 0.45, { hard: 0.7, sy: 0.75 });
    arc(f, w / 2, base, R * 0.95, R * 0.72, Math.PI, TAU, Math.max(3, R * 0.12), 0.9, { dry: 0.35 });
    arc(f, w / 2, base, R * 0.95, R * 0.25, 0, TAU, Math.max(2, R * 0.08), 0.8, { dry: 0.3, seed: 5 });
    f.dab(w / 2 - R * 0.35, base - R * 0.45, R * 0.18, 0.9, { hard: 0.3 });
    for (let y = Math.ceil(base + R * 0.3); y < h; y++) for (let x = 0; x < w; x++) f.v[y * w + x] = 0;
    return out(lit(f, ramp, 3, 0.5), ax, ay);
  };
}

// ------------------------------------------------------------------ holy fan / vortex / sphere
/** 光刃: a quarter fan of light sweeping up-right from the anchor (bottom-left). */
function holyFan(c: Ctx): PaintOut {
  const { w, h, ax, ay } = box(c);
  const f = new Fld(w, h);
  const R = Math.min(w - ax, ay) * 0.95;
  const sweep = 0.3 + 0.7 * ease.out((c.i + 1) / c.n);
  for (let k = 0; k < 7; k++) {
    const rr = R * (0.35 + k * 0.1);
    arc(f, ax, ay, rr, rr, -Math.PI / 2, -Math.PI / 2 + (Math.PI / 2) * sweep, Math.max(3, R * 0.12), 0.55 + k * 0.05, { dry: 0.55, seed: k + c.i * 7, taperIn: 0.05, taperOut: 0.6 });
  }
  return out(lit(f, GOLD, 4, 0.5), ax, ay);
}
function vortexRing(c: Ctx): PaintOut {
  const { w, h, ax, ay } = box(c);
  const f = new Fld(w, h);
  const R = Math.min(w, h) * 0.44;
  const r = rng(c.seed);
  for (let k = 0; k < 9; k++) {
    const a0 = (k / 9) * TAU + c.i * 0.35;
    const pts: Pt[] = [];
    for (let s = 0; s <= 10; s++) {
      const q = s / 10, a = a0 + q * 1.6, rr = R * (1 - q * 0.45);
      pts.push([ax + Math.cos(a) * rr, ay + Math.sin(a) * rr]);
    }
    f.stroke(pts, R * r.range(0.08, 0.14), r.range(0.5, 0.85), { taperIn: 0.1, taperOut: 0.9, dry: 0.5, seed: k + c.i });
  }
  arc(f, ax, ay, R, R, 0, TAU, R * 0.06, 0.8, { dry: 0.3, seed: 77 + c.i });
  return out(lit(f, VIOLET, 4, 0.5), ax, ay);
}
/** Ink vortex disc (drawn with multiply: dark ink spiral). */
function inkVortex(c: Ctx): PaintOut {
  const { w, h, ax, ay } = box(c);
  const f = new Fld(w, h);
  const R = Math.min(w, h) * 0.46;
  f.dab(ax, ay, R * 0.55, 0.85, { hard: 0.3, tex: 0.4, texF: 2 });
  for (let k = 0; k < 7; k++) {
    const a0 = (k / 7) * TAU;
    const pts: Pt[] = [];
    for (let s = 0; s <= 12; s++) {
      const q = s / 12, a = a0 + q * 2.4, rr = R * (0.2 + q * 0.8);
      pts.push([ax + Math.cos(a) * rr, ay + Math.sin(a) * rr]);
    }
    f.stroke(pts, R * 0.16, 0.7, { taperIn: 0.05, taperOut: 0.95, dry: 0.45, seed: k });
  }
  pool(f, 3, 0.3);
  return out(f.ramp(INK), ax, ay);
}
/** Crackling sphere of lightning (thunder ball), new crackle every frame. */
function plasma(c: Ctx): PaintOut {
  const { w, h, ax, ay } = box(c);
  const f = new Fld(w, h);
  const R = Math.min(w, h) * 0.45;
  const r = rng(c.seed + c.i);
  arc(f, ax, ay, R, R, r.next() * TAU, r.next() * TAU + TAU * 0.9, R * 0.05, 0.75, { dry: 0.5, seed: c.i });
  for (let k = 0; k < 7; k++) {
    const a = r.next() * TAU, b = a + r.range(1.5, 3.5);
    bolt(f, [ax + Math.cos(a) * R * 0.95, ay + Math.sin(a) * R * 0.95], [ax + Math.cos(b) * R * 0.95, ay + Math.sin(b) * R * 0.95], r, { w: R * 0.04, forks: 1, jag: 0.15, a: 0.7 });
  }
  f.dab(ax, ay, R, 0.18, { hard: 0.7 });
  return out(lit(f, VIOLET, 4, 0.5), ax, ay);
}
function arcs(ramp: Ramp) {
  return (c: Ctx): PaintOut => {
    const { w, h, ax, ay } = box(c);
    const f = new Fld(w, h);
    const r = rng(c.seed + c.i);
    for (let k = 0; k < 3; k++) {
      const p0: Pt = [r.range(0.05, 0.4) * w, r.range(0.2, 0.8) * h], p1: Pt = [r.range(0.6, 0.95) * w, r.range(0.2, 0.8) * h];
      bolt(f, p0, p1, r, { w: Math.max(2, h * 0.12), forks: 1, jag: 0.25, a: 0.9 });
    }
    return out(lit(f, ramp, 2, 0.6), ax, ay);
  };
}

/** Gold-leaf flakes bursting outward (42104: s0010..s0100 grows). */
function goldFlakes(c: Ctx): PaintOut {
  const { w, h, ax, ay } = box(c);
  const f = new Fld(w, h);
  const r = rng(c.seed);
  const R = Math.min(w, h) * 0.46;
  for (let k = 0; k < 30; k++) {
    const a = r.next() * TAU, d = R * Math.sqrt(r.next());
    const s = R * r.range(0.05, 0.12);
    f.dab(ax + Math.cos(a) * d, ay + Math.sin(a) * d, s, r.range(0.6, 1), { hard: 0.7, sx: 1.4, sy: 0.7, rot: r.next() * 3 });
  }
  return out(lit(f, GOLD, 2, 0.5), ax, ay);
}

/** Fire strike (ma50001..009): ground ring of flame → tall flame → embers. */
function fireStrike(c: Ctx): PaintOut {
  const { w, h, ax, ay } = box(c);
  const n = +c.name.slice(-1);
  const f = new Fld(w + 50, h + 60);
  const X = ax + 25, Y = ay + 50;
  if (n === 1 || n === 2 || n === 8 || n === 9) {
    const r = rng(c.seed);
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * TAU;
      flame(f, X + Math.cos(a) * w * 0.38, Y + Math.sin(a) * h * 0.3 + 4, k * 0.13 + n * 0.2, c.seed + k, { W: 8, H: h * 0.9, tongues: 2 });
    }
    void r;
  } else {
    // a cluster of three flames, the middle one tallest
    for (const [dx, k] of [[-w * 0.3, 0.6], [w * 0.3, 0.7], [0, 1]] as [number, number][]) flame(f, X + dx, Y + 4, n * 0.17 + k, c.seed + k, { W: w * 0.55, H: (ay + 40) * k, tongues: 4, sway: 0.6 });
  }
  pool(f, 3, 0.35);
  return out(lit(f, FIRE, 3, 0.5), X, Y);
}
/** Firewall (40350): ring of embers grows, a wall of flames rages, then dies down. */
function fireWall(c: Ctx): PaintOut {
  const k = +c.name.slice(-2);
  if (k <= 7 || k >= 27) {
    const g = k <= 7 ? k / 7 : (34 - k) / 7;
    const W = 70, H = 36, X = 31, Y = 18;
    const f = new Fld(W, H);
    const r = rng(c.seed);
    for (let j = 0; j < 10; j++) {
      const a = (j / 10) * TAU;
      f.dab(X + Math.cos(a) * 28 * g, Y + Math.sin(a) * 12 * g, 3 + 2 * r.next(), 0.9, { hard: 0.4 });
    }
    f.dab(X, Y, 24 * g, 0.3, { hard: 0.2, sy: 0.45 });
    return out(lit(f, FIRE, 2, 0.5), X, Y);
  }
  // 8..26: wall of flame (grows 8..12, rages, falls 22..26)
  const q = (k - 8) / 18;
  const g = q < 0.22 ? 0.15 + 0.85 * ease.out(q / 0.22) : q > 0.78 ? 1 - ease.in((q - 0.78) / 0.22) * 0.85 : 1;
  const W = 309, H = 239, X = 157, Y = 190;
  const f = new Fld(W, H);
  for (let j = 0; j < 5; j++) {
    const off = (j - 2) * 38;
    const hk = (j === 2 ? 170 : j % 2 ? 140 : 115) * g;
    if (hk > 4) flame(f, X + off, Y + 6 - Math.abs(off) * 0.12, k * 0.16 + j * 0.31, c.seed + j, { W: 46, H: hk, tongues: 4, sway: 0.7 });
  }
  pool(f, 4, 0.35);
  return out(lit(f, FIRE, 5, 0.5), X, Y);
}

export const glow2Rules: Rule[] = [
  // ---- magic (root effect dir)
  { dir: 'magic', name: /^a00[123]/, group: (n) => n, gen: (c) => pillar({ a001: JADE, a002: AZURE, a003: GOLD }[c.name.slice(0, 4) as 'a001'] ?? GOLD)(c) },
  { dir: 'magic', name: /^b00/, gen: explosion(AZURE, { rays: 7, dots: 10 }) },
  { dir: 'magic', name: /^c00[34]/, group: (n) => n, gen: glyph(() => '乱', FIRE) },
  { dir: 'magic', name: /^c00/, group: (n) => n, gen: glyph(() => '封', AZURE) },
  { dir: 'magic', name: /^circle$/, gen: ring(EMBER, { wK: 0.14, gaps: 2 }) },
  { dir: 'magic', name: /^m008circle$/, gen: ring(PALE, { wK: 0.12, gaps: 3 }) },
  { dir: 'magic', name: /^efir005/, group: (n) => n, gen: flameLoop(FIRE, { tongues: 3, scaleW: 0.9 }) },
  { dir: 'magic', name: /^elec/, gen: arcs(VIOLET) },
  { dir: 'magic', name: /^f00/, gen: (c) => vortexFire(c) },
  { dir: 'magic', name: /^jade$/, gen: mote(JADE) },
  { dir: 'magic', name: /^l-m/, group: (n) => n, gen: comet(AZURE, { head: 0.12, tails: 3 }) },
  { dir: 'magic', name: /^m005thunder/, group: (n) => n, gen: lightning(VIOLET, { w: 0.25 }) },
  { dir: 'magic', name: /^m025taichi02$/, gen: dome(AZURE) },
  { dir: 'magic', name: /^ma1001[34]$/, group: (n) => n, gen: sparkle(GOLD) },
  { dir: 'magic', name: /^ma1001[5-9]$/, gen: arcs(VIOLET) },
  { dir: 'magic', name: /^ma1002[0-3]$/, gen: arcs(VIOLET) },
  { dir: 'magic', name: /^ma100(2[4-9]|3[01])$/, gen: explosion(VIOLET, { rays: 6, dots: 18, cloud: 0.4 }) },
  { dir: 'magic', name: /^ma1300/, group: (n) => n, gen: (c) => (/0[12]$/.test(c.name) ? comet(FIRE, { head: 0.3, tails: 5 })(c) : crescentV(FIRE)(c)) },
  { dir: 'magic', name: /^ma130[1-4]$/, group: (n) => n, gen: (c) => (/[12]$/.test(c.name) ? comet(VIOLET, { head: 0.3, tails: 5 })(c) : crescentV(VIOLET)(c)) },
  { dir: 'magic', name: /^ma300[1-4]$/, gen: spray },
  { dir: 'magic', name: /^ma30(0[5-9]|1[0-7])$/, gen: drop(AZURE) },
  { dir: 'magic', name: /^ma40(0[2-7]|1[1267])$/, group: (n) => n, gen: (c) => sparkle(({ ma4002: AZURE, ma4003: PALE, ma4004: GOLD, ma4005: JADE, ma4006: ROSE, ma4007: GOLD, ma4011: VIOLET, ma4012: FIRE, ma4016: AZURE, ma4017: JADE } as Record<string, Ramp>)[c.name] ?? GOLD)(c) },
  { dir: 'magic', name: /^ma40(08|09|10|12_2|14|15)$/, group: (n) => n, gen: (c) => pillar(({ ma4008: VIOLET, ma4009: JADE, ma4010: GOLD, ma4012_2: JADE, ma4014: AZURE, ma4015: VIOLET } as Record<string, Ramp>)[c.name] ?? GOLD)(c) },
  { dir: 'magic', name: /^ma5000/, gen: fireStrike },
  { dir: 'magic', name: /^ma77007$/, gen: mote(AZURE) },
  { dir: 'magic', name: /^s0\d+$/, gen: goldFlakes },
  { dir: 'magic', name: /^shadow/, group: (n) => n, gen: shadow() },
  { dir: 'magic', name: /^a_shadow$/, gen: shadow() },
  { dir: 'magic', name: /^smoke_y2?$/, group: (n) => n, gen: (c) => dust(HAZE, { up: c.name === 'smoke_y' })(c) },
  { dir: 'magic', name: /^smoke$/, gen: dust(INK, { up: true }) },
  { dir: 'magic', name: /^ma8010$/, gen: flare(VIOLET) },
  // ---- numbered effect dirs
  { dir: 'magic/003', gen: waterColumn },
  { dir: 'magic/004', group: (n) => n, gen: (c) => pillar(c.name === 'ma4013' ? GOLD : ROSE, { wK: 0.55 })(c) },
  { dir: 'magic/046', name: /^m018e074/, gen: comet(FIRE, { head: 0.22, tails: 4 }) },
  { dir: 'magic/046', name: /^m018firea/, group: (n) => n, gen: comet(GOLD, { head: 0.3, tails: 3 }) },
  { dir: 'magic/050', name: /^ma5000/, gen: plasma },
  { dir: 'magic/055', name: /^ma54000[1-4]$/, gen: iceGrow },
  { dir: 'magic/055', name: /^ma54000[5-8]$/, gen: iceShard },
  { dir: 'magic/055', name: /^ma540009$/, gen: frost },
  { dir: 'magic/056', group: (n) => n.slice(0, 5), gen: windRing },
  { dir: 'magic/058', gen: halberd(AZURE) },
  { dir: 'magic/060', name: /^ma1010(0[1-68-9]|1[0-3])$/, group: () => 'taiji', gen: taiji },
  { dir: 'magic/060', name: /^ma101007$/, gen: flare(AZURE) },
  { dir: 'magic/061', name: /^sf/, group: (n) => (+n.slice(2) <= 5 ? 'up' : 'down'), gen: comet(FIRE, { head: 0.2, tails: 5 }) },
  { dir: 'magic/062', name: /^m00\d$/, gen: glowSword(AZURE, { sink: true }) },
  { dir: 'magic/062', name: /^m015ballc/, gen: mote(AZURE) },
  { dir: 'magic/062', name: /^m015sword\d$/, gen: glowSword(AZURE, { set: (c) => ({ ang: -Math.PI / 2 + (c.i / 8) * TAU, k: c.i }) }) },
  { dir: 'magic/062', name: /^m015swordb1$/, gen: glowSword(AZURE) },
  { dir: 'magic/067', name: /^dh0/, gen: comet(FIRE, { head: 0.3, tails: 4, tailDir: -Math.PI / 4 }) },
  { dir: 'magic/071', name: /^ma6900[12]$/, group: (n) => n, gen: comet(GOLD, { head: 0.28, tails: 6 }) },
  { dir: 'magic/071', name: /^ma69003$/, gen: ring(GOLD, { wK: 0.25, gaps: 2 }) },
  { dir: ['magic/072', 'bf/magic'], gen: crescent(FIRE) },
  { dir: 'magic/081', name: /^mar/, group: (n) => n, gen: glyph((c) => '休生伤杜景死惊开'[+c.name.slice(-1) - 1] ?? '门', CRIMSON) },
  { dir: 'magic/081', group: (n) => n, gen: glyph((c) => '休生伤杜景死惊开'[+c.name.slice(-1) - 1] ?? '门', VIOLET) },
  { dir: 'magic/084', name: /^ma10900[234]$/, gen: vortexRing },
  { dir: 'magic/084', name: /^ma109005$/, gen: inkVortex },
  { dir: 'magic/084', name: /^ma10900[67]$/, group: (n) => n, gen: arcs(VIOLET) },
  { dir: 'magic/089', gen: rod(GOLD) },
  { dir: 'magic/105', group: (n) => n.slice(0, 6), gen: glowSword(AZURE, { set: (c) => ({ ang: -Math.PI / 2 + (c.i / 16) * TAU, k: c.i }) }) },
  { dir: 'magic/106', name: /^m012wave/, gen: fireWave },
  { dir: 'magic/107', name: /^m029effect02$/, gen: dome(GOLD) },
  { dir: 'magic/107', name: /^m029effect03/, gen: trigram },
  { dir: 'magic/107', name: /^m029effect04$/, gen: pillar(GOLD, { wK: 0.8, streaks: 2 }) },
  { dir: 'magic/107', name: /^m029effect05a$/, gen: pillar(EMBER, { wK: 0.6 }) },
  { dir: 'magic/107', name: /^m029effect05b$/, gen: ring(EMBER, { wK: 0.12, gaps: 3 }) },
  { dir: 'magic/107', name: /^m029effect05c$/, gen: ring(PALE, { wK: 0.12, gaps: 3 }) },
  { dir: 'magic/112', name: /^ma9300[1-7]$/, gen: holyFan },
  { dir: 'magic/112', name: /^ma9300[89]$/, group: (n) => n, gen: comet(GOLD, { head: 0.25, tails: 5 }) },
  { dir: 'magic/117', name: /^m031effect07/, group: (n) => n, gen: flameLoop(FIRE, { tongues: 7, scaleW: 1.6 }) },
  { dir: 'magic/117', name: /^m031fireball/, gen: comet(FIRE, { head: 0.35, tails: 4, tailDir: Math.PI / 2 }) },
  { dir: 'magic/035', gen: fireWall },
  { dir: 'magic/bg/obj', name: /^bfire0/, gen: flameLoop(FIRE, { tongues: 4 }) },
];

/** Low wave of flame rolling along the ground, right of the anchor. */
function fireWave(c: Ctx): PaintOut {
  const W = 140, H = 64, ax = 4, ay = 52;
  const f = new Fld(W, H);
  for (let k = 0; k < 6; k++) flame(f, ax + 30 + k * 17, ay, c.i * 0.5 + k * 0.23, c.seed + k, { W: 22, H: 26 + 14 * Math.sin(k + c.i), tongues: 3, sway: 0.8 });
  pool(f, 2, 0.3);
  return out(lit(f, FIRE, 3, 0.5), ax, ay);
}

/** Moon/sun crescent hit (vertical crescent). */
function crescentV(ramp: Ramp) {
  return (c: Ctx): PaintOut => {
    const { w, h, ax, ay } = box(c);
    const f = new Fld(w, h);
    const R = h * 0.46;
    arc(f, w * 0.85, h / 2, w * 0.7, R, Math.PI * 0.55, Math.PI * 1.45, Math.max(4, w * 0.3), 1, { dry: 0.3, taperIn: 0.4, taperOut: 0.4 });
    return out(lit(f, ramp, 3, 0.6), ax, ay);
  };
}
/** Spiral fire vortex (f001..f004 rotate). */
function vortexFire(c: Ctx): PaintOut {
  const { w, h, ax, ay } = box(c);
  const f = new Fld(w, h);
  const R = Math.min(w, h) * 0.46;
  for (let k = 0; k < 6; k++) {
    const a0 = (k / 6) * TAU - c.i * 0.5;
    const pts: Pt[] = [];
    for (let s = 0; s <= 12; s++) {
      const q = s / 12, a = a0 + q * 3, rr = R * (0.08 + q * 0.92);
      pts.push([ax + Math.cos(a) * rr, ay + Math.sin(a) * rr]);
    }
    f.stroke(pts, R * 0.2, 0.8, { taperIn: 0.3, taperOut: 0.95, dry: 0.45, seed: k });
  }
  f.dab(ax, ay, R * 0.25, 1, { hard: 0.3 });
  return out(lit(f, FIRE, 3, 0.5), ax, ay);
}

void [blobPts, burst, clamp, Cv, DUST, erode, halo, seedNum, smooth, splatter, shock];
export type { Rng };
