// Solid props drawn in ink (normal blending): debris chips, rolling boulders /
// snowballs / spiked rollers, powder kegs, erupting rocks, blades, arrows,
// flying swords, gore pieces and the root-dir weather/screen frames.
import type { PaintOut } from '../types.ts';
import { FONT_BRUSH, FONT_SEAL, mix } from '../ink.ts';
import type { Ctx, Rule } from './_effects_ctx.ts';
import { blobPts, clamp, Cv, Fld, lerp, noise, rng, xform, type Pt, type Rng } from './_effects_kit.ts';
import { svgCv, TAU } from './_effects_fx.ts';
import { C, Ink } from './_effects_paint.ts';

const box = (c: Ctx) => ({ w: c.box[0], h: c.box[1], ax: c.box[2], ay: c.box[3] });
const rotOf = (name: string) => ({ a: 0, b: 1, c: 2, d: 3 })[name.slice(-1) as 'a'] ?? 0;

/** Ink-wash rock with 皴 texture strokes (ink layer, centred on cx, cy). */
export function rock(ink: Ink, cx: number, cy: number, rx: number, ry: number, r: Rng, o: { rot?: number; tone?: string; lw?: number; spin?: number } = {}) {
  const pts = blobPts(cx, cy, rx, ry, r, 0.35, 9, o.rot ?? 0);
  const lw = o.lw ?? Math.max(1.2, Math.min(rx, ry) * 0.12);
  ink.fill(pts, o.tone ?? mix(C.inkWash, C.ochre, 0.25), 0.95, { tex: 0.45, texF: 0.12 });
  // darker shadow side (lower right)
  ink.fill(blobPts(cx + rx * 0.25, cy + ry * 0.28, rx * 0.7, ry * 0.6, r, 0.3, 8, o.rot ?? 0), C.inkSoft, 0.45, { tex: 0.5, texF: 0.1 });
  // texture strokes (rotate with spin)
  const sp = o.spin ?? 0;
  for (let k = 0; k < 4; k++) {
    const a = sp + (k / 4) * TAU + r.range(-0.4, 0.4);
    const d = r.range(0.1, 0.6);
    const x = cx + Math.cos(a) * rx * d, y = cy + Math.sin(a) * ry * d;
    if (Math.cos(a - sp) < -0.7 && sp) continue;
    ink.line([[x, y], [x + rx * r.range(0.15, 0.35) * Math.cos(a + 1.3), y + ry * r.range(0.15, 0.35) * Math.sin(a + 1.3)]], lw * 0.8, C.ink, 0.8, { taperIn: 0.2, taperOut: 0.7, dry: 0.5, seed: k });
  }
  ink.outline(pts, lw, C.ink, 1, { dry: 0.35, seed: 3 });
  return pts;
}

// ------------------------------------------------------------------ debris (a..d = 4 tumbling poses)
type Chip = 'wood' | 'stave' | 'rock' | 'snow' | 'pebble';
function chip(kind: Chip) {
  return (c: Ctx): PaintOut => {
    const { w, h, ax, ay } = box(c);
    const W = Math.round(Math.max(w, h) * 1.3) + 6;
    const ink = new Ink(W, W);
    const cx = W / 2, cy = W / 2;
    const r = rng(c.seed);
    const rot = rotOf(c.name) * (Math.PI / 2) + r.range(0, 0.4);
    const L = Math.max(w, h) * 0.42, T = Math.min(w, h) * 0.33;
    if (kind === 'wood' || kind === 'stave') {
      const bend = kind === 'stave' ? 0.25 : 0;
      const pts: Pt[] = [];
      for (let i = 0; i <= 6; i++) pts.push([-L + (2 * L * i) / 6, -T * 0.5 + Math.sin((i / 6) * Math.PI) * T * bend]);
      for (let i = 6; i >= 0; i--) pts.push([-L + (2 * L * i) / 6 + (i === 6 ? -T * 0.4 : 0), T * 0.5 + Math.sin((i / 6) * Math.PI) * T * bend]);
      const P = xform(pts, 0, 0, rot, 1, cx, cy);
      ink.fill(P, kind === 'stave' ? mix(C.ochre, C.inkWash, 0.3) : C.ochre, 1, { tex: 0.35 });
      ink.line(xform([[-L * 0.8, 0], [L * 0.7, T * 0.05]], 0, 0, rot, 1, cx, cy), Math.max(1, T * 0.15), C.inkSoft, 0.7, { dry: 0.6 });
      if (kind === 'stave') ink.line(xform([[-L * 0.2, -T * 0.6], [-L * 0.2, T * 0.6]], 0, 0, rot, 1, cx, cy), Math.max(1.5, T * 0.35), C.inkSoft, 0.9);
      ink.outline(P, Math.max(1, T * 0.18), C.ink, 1, { dry: 0.3 });
    } else if (kind === 'snow') {
      const P = blobPts(cx, cy, L, T * 1.1, r, 0.4, 8, rot);
      ink.fill(P, C.white, 1, { tex: 0.1 });
      ink.fill(blobPts(cx + T * 0.2, cy + T * 0.3, L * 0.7, T * 0.6, r, 0.3, 8, rot), mix(C.azurite, C.white, 0.6), 0.6, { tex: 0.3 });
      ink.outline(P, Math.max(1, T * 0.12), C.inkWash, 1, { dry: 0.4 });
    } else {
      rock(ink, cx, cy, L, kind === 'pebble' ? L * 0.8 : T * 1.1, r, { rot, lw: Math.max(1, T * 0.16) });
    }
    return ink.out(cx - (w / 2 - ax), cy - (h / 2 - ay));
  };
}

// ------------------------------------------------------------------ rolling things (toward the camera)
/** Snowball (15-frame roll): white ball, azurite shading, features scrolling downward. */
function snowball(c: Ctx): PaintOut {
  const W = 216, H = 250, cx = 109, base = 212;
  const R = 92, cy = base - R - 8;
  const ink = new Ink(W, H);
  const r = rng(c.seed);
  ink.shadow(cx, base - 4, R * 0.95, 14, 0.4);
  const P = blobPts(cx, cy, R, R * 0.98, r, 0.06, 18);
  ink.fill(P, C.white, 1, { tex: 0.06 });
  ink.fill(blobPts(cx + R * 0.25, cy + R * 0.3, R * 0.8, R * 0.7, rng(c.seed + 'sh'), 0.12, 14), mix(C.azurite, C.white, 0.55), 0.55, { tex: 0.4, texF: 0.05 });
  // packed-snow clumps rolling: angle advances each frame
  const ph = (c.i / c.n) * TAU;
  for (let k = 0; k < 9; k++) {
    const lat = r.range(-1, 1) * 0.9;
    const a = ph + (k / 9) * TAU;
    const z = Math.cos(a);
    if (z < 0.05) continue;
    const y = cy - Math.sin(a) * R * 0.9;
    const x = cx + lat * R * Math.sqrt(1 - (Math.sin(a) * 0.9) ** 2) * 0.9;
    const s = (6 + r.next() * 8) * z;
    ink.line([[x - s, y], [x + s * 0.6, y + s * 0.3]], 2.2 * z + 0.6, C.inkWash, 0.7 * z, { dry: 0.6, seed: k });
  }
  ink.outline(P, 3.2, C.inkSoft, 1, { dry: 0.35 });
  return ink.out(cx, base);
}
/** Boulder (15-frame roll). */
function boulder(c: Ctx): PaintOut {
  const W = 218, H = 252, cx = 111, base = 216;
  const R = 92, cy = base - R - 8;
  const ink = new Ink(W, H);
  const r = rng(c.seed);
  ink.shadow(cx, base - 4, R, 15, 0.45);
  const ph = (c.i / c.n) * TAU;
  const P = blobPts(cx, cy, R, R * 0.96, r, 0.12, 14);
  ink.fill(P, mix(C.inkWash, C.ochre, 0.3), 1, { tex: 0.45, texF: 0.05 });
  ink.fill(blobPts(cx + R * 0.3, cy + R * 0.35, R * 0.75, R * 0.6, rng(c.seed + 's'), 0.2, 12), C.inkSoft, 0.5, { tex: 0.5 });
  // cracks / 皴 strokes rolling down
  for (let k = 0; k < 12; k++) {
    const lat = r.range(-0.85, 0.85);
    const a = ph + (k / 12) * TAU;
    const z = Math.cos(a);
    if (z < 0.1) continue;
    const y = cy - Math.sin(a) * R * 0.88;
    const x = cx + lat * R * Math.sqrt(Math.max(0, 1 - (Math.sin(a) * 0.88) ** 2));
    const L = (10 + r.next() * 16) * z;
    ink.line([[x - L * 0.5, y - L * 0.2], [x, y + L * 0.1], [x + L * 0.5, y - L * 0.1]], 3 * z + 0.5, C.ink, 0.85, { dry: 0.55, seed: k });
  }
  ink.outline(P, 4, C.ink, 1, { dry: 0.35 });
  return ink.out(cx, base);
}
/** Spiked roller (擂木) seen from the front, rolling toward the camera (3 frames). */
function roller(c: Ctx): PaintOut {
  const W = 164, H = 112, cx = 81, base = 88;
  const ink = new Ink(W, H);
  ink.shadow(cx, base - 2, 74, 9, 0.4);
  const top = 22, bot = 80, x0 = 14, x1 = 148;
  // drum
  ink.fill([[x0, top], [x1, top], [x1, bot], [x0, bot]], C.ochre, 1, { tex: 0.35 });
  ink.fill([[x0, (top + bot) / 2 + 6], [x1, (top + bot) / 2 + 6], [x1, bot], [x0, bot]], C.inkSoft, 0.35, { tex: 0.4 });
  // end caps
  for (const x of [x0, x1]) ink.fill(Ink.ellPts(x, (top + bot) / 2, 7, (bot - top) / 2), mix(C.ochre, C.ink, 0.35), 1);
  // spikes in rows; rows scroll downward with the roll
  const ph = c.i / 3;
  for (let row = 0; row < 4; row++) {
    const q = (row + ph) / 4;
    const a = q * Math.PI; // 0 top → π bottom of the visible half
    const y = (top + bot) / 2 - Math.cos(a) * (bot - top) * 0.5;
    const len = 14 * Math.sin(a) + 3;
    for (let k = 0; k < 7; k++) {
      const x = x0 + 12 + k * 20 + (row % 2) * 10;
      if (x > x1 - 6) continue;
      ink.fill([[x - 4, y], [x + 4, y], [x, y - len * (Math.cos(a) > 0 ? 1 : -0.4) - 2]], C.inkSoft, 1, { tex: 0 });
      ink.dot(x, y, 2.5, C.ink);
    }
  }
  ink.outline([[x0, top], [x1, top], [x1, bot], [x0, bot]], 3, C.ink, 1, { dry: 0.3 });
  // iron bands
  for (const x of [x0 + 30, x1 - 30]) ink.line([[x, top], [x, bot]], 3, C.ink, 0.8);
  return ink.out(cx, base);
}
/** Powder keg with a sputtering fuse. */
function keg(c: Ctx): PaintOut {
  const { w, h, ax, ay } = box(c);
  const ink = new Ink(w, h);
  const cx = ax, b = ay - 2, t = 14;
  const P: Pt[] = [[cx - 14, b], [cx - 17, (b + t) / 2], [cx - 14, t], [cx + 14, t], [cx + 17, (b + t) / 2], [cx + 14, b]];
  ink.shadow(cx, ay - 1, 16, 3);
  ink.fill(P, C.ochre, 1, { tex: 0.4 });
  for (let k = -1; k <= 1; k++) ink.line([[cx + k * 9, t + 1], [cx + k * 10.5, (b + t) / 2], [cx + k * 9, b - 1]], 1.2, C.inkSoft, 0.7);
  for (const y of [t + 6, b - 6]) ink.line([[cx - 15, y], [cx + 15, y]], 2.4, C.ink);
  ink.fill([[cx - 6, (b + t) / 2 - 5], [cx + 6, (b + t) / 2 - 5], [cx + 6, (b + t) / 2 + 5], [cx - 6, (b + t) / 2 + 5]], C.cinnabar, 0.95, { tex: 0.1 });
  ink.outline(P, 2.2, C.ink);
  // fuse + spark
  ink.line([[cx + 2, t], [cx + 6, t - 6], [cx + 4, t - 10]], 1.6, C.ink);
  const sp = c.i % 2 ? 4 : 2.5;
  ink.dot(cx + 4, t - 10, sp, C.gamboge, 1, 0.3);
  ink.dot(cx + 4, t - 10, sp * 0.45, C.white, 1);
  return ink.out(ax, ay);
}

// ------------------------------------------------------------------ erupting stone
/** Rock spike growing out of the ground (40490: 10 frames). */
function rockRise(c: Ctx): PaintOut {
  const { w, h, ax, ay } = box(c);
  const W = c.gw + 10, H = c.gh + 6;
  const ink = new Ink(W, H);
  const X = W / 2, Y = H - 3;
  const g = (c.i + 1) / c.n;
  const r = rng(c.seed);
  ink.shadow(X, Y - 1, 18 + 26 * g, 5 + 3 * g, 0.4);
  const hh = (H - 8) * g, ww = 12 + 30 * g;
  const pts: Pt[] = [[X - ww, Y], [X - ww * 0.7, Y - hh * 0.45], [X - ww * 0.35, Y - hh * 0.8], [X + ww * 0.05, Y - hh], [X + ww * 0.45, Y - hh * 0.7], [X + ww * 0.75, Y - hh * 0.35], [X + ww, Y]];
  ink.fill(pts, mix(C.inkWash, C.ochre, 0.3), 1, { tex: 0.45, texF: 0.1 });
  ink.fill([[X + ww * 0.05, Y - hh], [X + ww * 0.45, Y - hh * 0.7], [X + ww * 0.75, Y - hh * 0.35], [X + ww, Y], [X + ww * 0.1, Y]], C.inkSoft, 0.5, { tex: 0.4 });
  for (let k = 0; k < 3; k++) ink.line([[X - ww * 0.4 + k * ww * 0.3, Y - hh * (0.2 + r.next() * 0.2)], [X - ww * 0.3 + k * ww * 0.3, Y - hh * (0.5 + r.next() * 0.3)]], 2, C.ink, 0.8, { dry: 0.6, seed: k });
  ink.outline(pts.concat([[X, Y + 1]]), Math.max(1.5, 2 + 1.5 * g), C.ink, 1, { dry: 0.35 });
  // dirt clods kicked up
  for (let k = 0; k < 5; k++) ink.dot(X + r.range(-1, 1) * ww * 1.3, Y - r.range(0, 0.5) * hh * (1 - g), 1.5 + r.next() * 2, C.inkSoft, 0.8 * (1 - g * 0.5));
  void w, h, ax, ay;
  return ink.out(X, Y);
}
/** Stone pillar (40540) and the crack decal (ma52004). */
function stonePillar(c: Ctx): PaintOut {
  const { w, h, ax, ay } = box(c);
  if (c.name === 'ma52004') {
    const ink = new Ink(w + 8, h + 8);
    const r = rng(c.seed);
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * TAU + r.range(-0.3, 0.3);
      ink.line([[ax + 4, ay + 4], [ax + 4 + Math.cos(a) * (w * 0.45), ay + 4 + Math.sin(a) * h * 0.5]], 2, C.ink, 0.8, { taperIn: 0.1, taperOut: 0.9, dry: 0.3, seed: k });
    }
    ink.ell(ax + 4, ay + 4, w * 0.3, h * 0.35, C.inkSoft, 0.4, 0, 0.3);
    return ink.out(ax + 4, ay + 4);
  }
  const ink = new Ink(w + 8, h + 6);
  const X = ax + 4, Y = ay + 2;
  const hh = h - 6, ww = w * 0.45;
  const pts: Pt[] = [[X - ww, Y], [X - ww * 0.8, Y - hh * 0.75], [X - ww * 0.2, Y - hh], [X + ww * 0.55, Y - hh * 0.88], [X + ww * 0.85, Y - hh * 0.3], [X + ww, Y]];
  ink.fill(pts, mix(C.inkWash, C.azurite, 0.15), 1, { tex: 0.4, texF: 0.1 });
  ink.fill([[X - ww * 0.2, Y - hh], [X + ww * 0.55, Y - hh * 0.88], [X + ww * 0.85, Y - hh * 0.3], [X + ww, Y], [X + ww * 0.05, Y]], C.inkSoft, 0.55, { tex: 0.4 });
  ink.line([[X - ww * 0.2, Y - hh], [X + ww * 0.05, Y]], 1.6, C.ink, 0.7, { dry: 0.4 });
  ink.outline(pts, 2.4, C.ink, 1, { dry: 0.3 });
  return ink.out(X, Y);
}
/** Steel blade rising out of the ground (ws-0001..5). */
function bladeRise(c: Ctx): PaintOut {
  const { w, h, ax, ay } = box(c);
  const ink = new Ink(w + 10, h + 4);
  const X = ax + 5, Y = ay + 2;
  const hh = h - 4;
  const bw = Math.min(8, 3 + hh * 0.04);
  const pts: Pt[] = [[X - bw, Y], [X - bw, Y - hh * 0.85], [X, Y - hh], [X + bw * 0.6, Y - hh * 0.85], [X + bw * 0.6, Y]];
  ink.fill(pts, mix(C.white, C.azurite, 0.25), 1, { tex: 0.15 });
  ink.line([[X - bw * 0.2, Y], [X - bw * 0.2, Y - hh * 0.9]], 1.2, C.inkWash, 0.8);
  ink.outline(pts, 1.6, C.ink, 1, { dry: 0.2 });
  ink.ell(X, Y, bw * 2, 2, C.inkSoft, 0.6);
  return ink.out(X, Y);
}

// ------------------------------------------------------------------ arrows
/** Arrow from tail to tip: shaft, fletching, iron head. */
export function arrow(ink: Ink, tail: Pt, tip: Pt, s = 1) {
  const dx = tip[0] - tail[0], dy = tip[1] - tail[1], L = Math.hypot(dx, dy) || 1;
  const ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
  ink.line([tail, [tip[0] - ux * 5 * s, tip[1] - uy * 5 * s]], 1.6 * s, C.inkSoft, 1, { taperIn: 0, taperOut: 0, rag: 0 });
  ink.fill([[tip[0], tip[1]], [tip[0] - ux * 7 * s + nx * 2.4 * s, tip[1] - uy * 7 * s + ny * 2.4 * s], [tip[0] - ux * 7 * s - nx * 2.4 * s, tip[1] - uy * 7 * s - ny * 2.4 * s]], C.ink, 1, { tex: 0 });
  for (const sd of [-1, 1]) ink.fill([[tail[0] + ux * 2 * s, tail[1] + uy * 2 * s], [tail[0] + ux * 9 * s, tail[1] + uy * 9 * s], [tail[0] + ux * 1 * s + nx * sd * 3.5 * s, tail[1] + uy * 1 * s + ny * sd * 3.5 * s]], C.cinnabar, 0.9, { tex: 0 });
}
/** Arrow across the box: tip at the anchor if the anchor sits at an end, else tip at the far end. */
function arrowFrame(o: { tipAtAnchor?: boolean; stuck?: boolean } = {}) {
  return (c: Ctx): PaintOut => {
    const { w, h, ax, ay } = box(c);
    const ink = new Ink(w + 8, h + 8);
    const A: Pt = [ax + 4, ay + 4];
    const far: Pt = [w - ax + 4 > w / 2 + 4 ? w + 2 : 6, h - ay + 4 > h / 2 + 4 ? h + 2 : 6];
    // the corner opposite the anchor
    const B: Pt = [ax < w / 2 ? w + 1 : 7, ay < h / 2 ? h + 1 : 7];
    void far;
    if (o.stuck) {
      // tip buried at the anchor: draw only the shaft out of the ground with a tuft of dirt
      const L = Math.hypot(B[0] - A[0], B[1] - A[1]);
      const ux = (B[0] - A[0]) / L, uy = (B[1] - A[1]) / L;
      arrow(ink, B, [A[0] - ux * 4, A[1] - uy * 4], 0.9);
      ink.ell(A[0], A[1], 4, 1.6, C.inkSoft, 0.7);
    } else if (o.tipAtAnchor) arrow(ink, B, A);
    else arrow(ink, A, B);
    return ink.out(A[0], A[1]);
  };
}

// ------------------------------------------------------------------ flying swords (magic/109)
/** Steel jian in ink: blade outline, ridge, guard, grip. */
export function steelSword(ink: Ink, p0: Pt, p1: Pt, wd: number, o: { foreshort?: number } = {}) {
  const dx = p1[0] - p0[0], dy = p1[1] - p0[1], L = Math.hypot(dx, dy) || 1;
  const ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
  const k = o.foreshort ?? 1;
  const bw = wd * 0.5 * Math.max(0.15, k);
  const g: Pt = [p0[0] + ux * L * 0.22, p0[1] + uy * L * 0.22];
  const blade: Pt[] = [[g[0] + nx * bw, g[1] + ny * bw], [p1[0] - ux * wd * 1.4 + nx * bw * 0.9, p1[1] - uy * wd * 1.4 + ny * bw * 0.9], p1, [p1[0] - ux * wd * 1.4 - nx * bw * 0.9, p1[1] - uy * wd * 1.4 - ny * bw * 0.9], [g[0] - nx * bw, g[1] - ny * bw]];
  ink.fill(blade, mix(C.white, C.azurite, 0.2), 1, { tex: 0.1 });
  ink.line([g, [p1[0] - ux * wd, p1[1] - uy * wd]], Math.max(0.8, wd * 0.15), C.inkWash, 0.8, { rag: 0 });
  ink.outline(blade, Math.max(1, wd * 0.18), C.ink, 1, { dry: 0.2 });
  const gw = wd * 1.4 * Math.max(0.3, k);
  ink.line([[g[0] + nx * gw, g[1] + ny * gw], [g[0] - nx * gw, g[1] - ny * gw]], wd * 0.55, C.gold, 1, { taperIn: 0.2, taperOut: 0.2, rag: 0 });
  ink.line([p0, g], wd * 0.55, C.ink, 1, { taperIn: 0, taperOut: 0, rag: 0 });
  ink.line([p0, [p0[0] - ux * wd * 2.5 + nx * wd, p0[1] - uy * wd * 2.5 + ny * wd]], 1, C.cinnabar, 0.9, { rag: 0.3 }); // tassel
}
/** 16-frame spin sets: csa = in-plane spin, other sets tumble with foreshortening. cssa = flat shadow. */
function flyingSword(c: Ctx): PaintOut {
  const { w, h, ax, ay } = box(c);
  const m = /^(css?[ab])(\d{4})$/.exec(c.name)!;
  const idx = +m[2];
  const set = Math.floor(idx / 16), k = idx % 16;
  const shadow = m[1].startsWith('css');
  const L = 128;
  const W = Math.max(w, 20) + 10, H = Math.max(h, 20) + 10;
  const ink = new Ink(W, H);
  const cx = W / 2, cy = H / 2;
  const spin = (k / 16) * TAU;
  // project a 3D sword: set picks the spin axis
  const axisTilt = (set % 4) * (Math.PI / 4);
  const fx = Math.cos(spin), fy = Math.sin(spin);
  let dir: Pt, fore = 1;
  if (set % 2 === 0) dir = [fx * Math.cos(axisTilt) - fy * Math.sin(axisTilt), fx * Math.sin(axisTilt) + fy * Math.cos(axisTilt)];
  else {
    dir = [Math.sin(axisTilt) * fx * 0.25, -1];
    fore = Math.abs(fx);
  }
  if (shadow) {
    const len = Math.max(4, Math.abs(Math.cos(spin)) * L * 0.5 + 6);
    ink.ell(cx, cy, len / 2, Math.max(1, h / 2), C.ink, 0.45, 0, 0.4);
    return ink.out(cx - (w / 2 - ax), cy - (h / 2 - ay));
  }
  const ext = (Math.min(w, h) > 0 ? Math.max(w, h) : L) * 0.46;
  const dl = Math.hypot(dir[0], dir[1]) || 1;
  const d: Pt = [dir[0] / dl, dir[1] / dl];
  // fit the sword into the frame box
  const fitX = d[0] ? (w / 2 - 3) / Math.abs(d[0]) : 1e9, fitY = d[1] ? (h / 2 - 3) / Math.abs(d[1]) : 1e9;
  const half = Math.min(ext, fitX, fitY);
  steelSword(ink, [cx - d[0] * half, cy - d[1] * half], [cx + d[0] * half, cy + d[1] * half], m[1].endsWith('b') ? 6 : 5, { foreshort: fore });
  return ink.out(cx - (w / 2 - ax), cy - (h / 2 - ay));
}

// ------------------------------------------------------------------ gore (magic/015 2ba*/2re*: 7 pieces × 8 tumbles)
function gore(c: Ctx): PaintOut {
  const { w, h, ax, ay } = box(c);
  const m = /^2(ba|re)([b1-6])(\d{4})$/.exec(c.name)!;
  const team = m[1] === 'ba' ? C.indigo : C.cinnabar;
  const piece = m[2];
  const k = +m[3] - 1;
  const W = Math.max(w, h) + 8;
  const ink = new Ink(W, W);
  const cx = W / 2, cy = W / 2;
  const rot = (k / 8) * TAU;
  const P = (pts: Pt[]) => xform(pts, 0, 0, rot, 1, cx, cy);
  const S = Math.max(w, h) * 0.45;
  switch (piece) {
    case 'b': // torso in team coat
      ink.fill(P([[-S * 0.5, -S * 0.25], [S * 0.6, -S * 0.3], [S * 0.7, S * 0.2], [-S * 0.4, S * 0.3]]), team, 1, { tex: 0.3 });
      ink.outline(P([[-S * 0.5, -S * 0.25], [S * 0.6, -S * 0.3], [S * 0.7, S * 0.2], [-S * 0.4, S * 0.3]]), 2, C.ink);
      ink.fill(P([[-S * 0.55, -S * 0.1], [-S * 0.75, 0], [-S * 0.55, S * 0.12]]), C.rouge, 0.9);
      break;
    case '1': // head with helmet
      ink.dot(cx, cy, S * 0.55, C.skin);
      ink.fill(P([[-S * 0.6, -S * 0.1], [-S * 0.4, -S * 0.6], [S * 0.4, -S * 0.6], [S * 0.6, -S * 0.1]]), team, 1);
      ink.outline(Ink.ellPts(cx, cy, S * 0.55, S * 0.55), 1.8, C.ink);
      break;
    case '2': case '3': // arms
    case '4': case '5': { // legs
      const leg = piece === '4' || piece === '5';
      const pts = P([[-S, 0], [0, S * 0.08], [S * 0.9, 0]]);
      ink.line(pts, S * (leg ? 0.32 : 0.26), leg ? C.inkSoft : team, 1, { taperIn: 0, taperOut: 0 });
      ink.line(P([[S * 0.7, 0], [S, 0]]), S * 0.24, leg ? C.ink : C.skin, 1, { taperIn: 0, taperOut: 0.3 });
      ink.dot(...P([[-S, 0]])[0], S * 0.14, C.rouge, 0.9);
      break;
    }
    default: // 6: dropped weapon
      steelSword(ink, P([[-S, 0]])[0], P([[S, 0]])[0], 4);
  }
  return ink.out(cx - (w / 2 - ax), cy - (h / 2 - ay));
}

// ------------------------------------------------------------------ skill failure (ink ring breaking apart)
function failBits(c: Ctx): PaintOut {
  const { w, h, ax, ay } = box(c);
  const ink = new Ink(w + 6, h + 6);
  const r = rng(c.seed + c.i);
  const a0 = c.i * 1.05;
  const pts: Pt[] = [];
  for (let k = 0; k <= 6; k++) {
    const a = a0 + (k / 6) * 1.4;
    pts.push([ax + 3 + Math.cos(a) * (w * 0.4), ay + 3 + Math.sin(a) * (h * 0.4)]);
  }
  ink.line(pts, Math.max(3, Math.min(w, h) * 0.25), C.inkWash, 0.9, { taperIn: 0.3, taperOut: 0.6, dry: 0.6, seed: r.int(1, 99) });
  return ink.out(ax + 3, ay + 3);
}

// ------------------------------------------------------------------ root dir
function rootFrame(c: Ctx): PaintOut | Promise<PaintOut> {
  const { w, h, ax, ay } = box(c);
  switch (c.name) {
    case 'raindrop':
    case 'sf_raindrop': {
      // drawn additive: a pale, slanted streak
      const f = new Fld(w + 4, h + 4);
      f.stroke([[w * 0.75 + 2, 2], [w * 0.25 + 2, h + 1]], Math.max(1.5, w * 0.16), 0.75, { taperIn: 0.7, taperOut: 0.1, rag: 0 });
      return { rgba: f.color([0.82, 0.86, 0.9]).rgba(), w: w + 4, h: h + 4, ax: ax + 2, ay: ay + 2 };
    }
    case 'snowball':
    case 'sf_snowball': {
      const f = new Fld(w + 2, h + 2);
      f.dab((w + 2) / 2, (h + 2) / 2, Math.min(w, h) * 0.5, 0.95, { hard: 0.35, tex: 0.3, texF: 4 });
      return { rgba: f.color([0.97, 0.97, 0.95]).rgba(), w: w + 2, h: h + 2, ax: ax + 1, ay: ay + 1 };
    }
    case 'black640x480':
    case 'white640x480': {
      const cv = new Cv(w, h);
      const v = c.name.startsWith('black') ? 0 : 1;
      for (let i = 0; i < w * h; i++) (cv.c[i * 4] = cv.c[i * 4 + 1] = cv.c[i * 4 + 2] = v), (cv.c[i * 4 + 3] = 1);
      return { rgba: cv.rgba(), w, h, ax, ay };
    }
    case 'mark01':
      return markFrame(w, h);
    case 'default01': {
      const ink = new Ink(w, h);
      ink.fill(Ink.ellPts(w / 2, h / 2, w * 0.42, h * 0.42), C.paper, 1);
      ink.outline(Ink.ellPts(w / 2, h / 2, w * 0.42, h * 0.42), 3, C.ink);
      ink.line([[w * 0.38, h * 0.36], [w * 0.5, h * 0.27], [w * 0.62, h * 0.36], [w * 0.5, h * 0.5], [w * 0.5, h * 0.6]], 4, C.cinnabar);
      ink.dot(w * 0.5, h * 0.72, 3, C.cinnabar);
      return ink.out(ax, ay);
    }
    default:
      return { rgba: new Uint8Array(Math.max(1, w * h) * 4), w: Math.max(1, w), h: Math.max(1, h), ax, ay };
  }
}
/** Splash mark: paper with the game title and a seal. */
async function markFrame(w: number, h: number): Promise<PaintOut> {
  const body = `<rect width="${w}" height="${h}" fill="${C.paper}"/>
<text x="${w / 2}" y="${h / 2 + 10}" font-size="78" text-anchor="middle" font-family="${FONT_BRUSH}" fill="${C.ink}" stroke="${C.ink}" stroke-width="2.5" stroke-linejoin="round">三国墨英传</text>
<rect x="${w / 2 + 150}" y="${h / 2 + 30}" width="44" height="44" fill="${C.cinnabar}" rx="3"/>
<text x="${w / 2 + 172}" y="${h / 2 + 64}" font-size="32" text-anchor="middle" font-family="${FONT_SEAL}" fill="${C.paper}">墨</text>
<text x="${w / 2}" y="${h - 40}" font-size="16" text-anchor="middle" font-family="${FONT_BRUSH}" fill="${C.inkWash}">© 三国墨英传 · 程序生成</text>`;
  const cv = await svgCv(w, h, body);
  // paper fibre texture
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const n = 0.94 + 0.06 * noise(x * 0.8, y * 0.05) + 0.03 * (noise(x * 0.02 + 50, y * 0.02) - 0.5);
      for (let k = 0; k < 3; k++) cv.c[i + k] = clamp(cv.c[i + k] * n);
    }
  return { rgba: cv.rgba(), w, h, ax: 0, ay: 0 };
}

export const propRules: Rule[] = [
  { dir: 'magic/006', name: /^m039/, group: (n) => n.slice(0, -1), gen: chip('wood') },
  { dir: 'magic/006', name: /^tw/, gen: roller },
  { dir: 'magic/007', name: /^snp/, group: (n) => n.slice(0, -1), gen: chip('snow') },
  { dir: 'magic/007', name: /^snob/, gen: snowball },
  { dir: 'magic/009', name: /^m034/, group: (n) => n.slice(0, -1), gen: chip('stave') },
  { dir: 'magic/009', name: /^lm/, gen: keg },
  { dir: 'magic/059', name: /^m028/, group: (n) => n.slice(0, -1), gen: chip('rock') },
  { dir: 'magic/059', name: /^rock/, gen: boulder },
  { dir: 'magic/049', gen: rockRise },
  { dir: 'magic/054', gen: stonePillar },
  { dir: 'magic/063', name: /^ws-/, gen: bladeRise },
  { dir: 'magic', name: /^(ma4900[4-9]|ma53001[0-3]|rock)$/, group: (n) => n, gen: chip('pebble') },
  { dir: 'magic', name: /^ma7100[4-7]$/, group: (n) => n, gen: chip('rock') },
  { dir: 'magic', name: /^bow002$/, gen: arrowFrame({ tipAtAnchor: true }) },
  { dir: 'magic', name: /^bow005$/, gen: arrowFrame({ tipAtAnchor: true }) },
  { dir: 'magic', name: /^arrow$/, gen: arrowFrame({ tipAtAnchor: false }) },
  { dir: 'magic', name: /^damage00\d$/, group: (n) => n, gen: arrowFrame({ stuck: true }) },
  { dir: 'magic', name: /^m000fail/, gen: failBits },
  { dir: 'magic', name: /^d001$/, gen: (c) => { const ink = new Ink(4, 28); ink.line([[2, 1], [2, 27]], 1.5, C.inkSoft); return ink.out(c.box[2] + 1, c.box[3] + 1); } },
  { dir: 'magic/109', gen: flyingSword },
  { dir: 'magic/015', name: /^2(ba|re)/, group: (n) => n.slice(0, 4), gen: gore },
  { dir: '', gen: rootFrame, group: (n) => n },
];

void lerp, noise;
export { Cv, Fld };
