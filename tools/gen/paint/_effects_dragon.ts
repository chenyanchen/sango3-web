// Dragons of light (drawn additively): the gold dragon descending in coils
// (黄龙天翔), the jade sky dragon (飞龙在天) and the fire dragon's heads and
// flaming body segments. Painted as bright gold-line brushwork over a dimmer
// wash — like gold-leaf drawing on a dark lacquer screen.
import type { PaintOut } from '../types.ts';
import type { Ctx, Rule } from './_effects_ctx.ts';
import { FIRE, GOLD, JADE, type Ramp } from './_effects_kit.ts';
import { clamp, ease, Fld, lerp, lit, out, pool, rng, spline, TAU, xform, type Pt } from './_effects_fx.ts';
import { flame } from './_effects_fx.ts';

const P = (a: Pt, b: Pt, t: number): Pt => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];

/** Resample a polyline to n points evenly by length. */
function resample(pts: Pt[], n: number): Pt[] {
  const L = [0];
  for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const tot = L[L.length - 1] || 1;
  const out: Pt[] = [];
  let j = 0;
  for (let k = 0; k < n; k++) {
    const d = (k / (n - 1)) * tot;
    while (j < L.length - 2 && L[j + 1] < d) j++;
    const seg = L[j + 1] - L[j] || 1;
    out.push(P(pts[j], pts[j + 1] ?? pts[j], (d - L[j]) / seg));
  }
  return out;
}

/**
 * Dragon body along `spine` (head first). `w` = body width near the head.
 * Field values: wash 0.45, scales/outline ~0.9.
 */
export function dragonBody(f: Fld, spine: Pt[], w: number, seed: string, o: { legs?: boolean; fins?: boolean } = {}) {
  const S = resample(spine, 48);
  const wfn = (t: number) => (t < 0.06 ? 0.75 + t * 4 : 1 - 0.85 * Math.pow(t, 1.4));
  f.stroke(S, w, 0.42, { wfn, taperIn: 0, taperOut: 0, rag: 0.08, mode: 'max', seed: 2 });
  const N = S.length;
  const nrm = (i: number): Pt => {
    const a = S[Math.max(0, i - 1)], b = S[Math.min(N - 1, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
    return [-dy / l, dx / l];
  };
  // flanks (bright outline both sides)
  for (const sd of [-1, 1]) {
    const edge = S.map((p, i): Pt => {
      const n = nrm(i), hw = (w / 2) * wfn(i / (N - 1)) * 0.92;
      return [p[0] + n[0] * hw * sd, p[1] + n[1] * hw * sd];
    });
    f.stroke(edge, Math.max(1.5, w * 0.09), 0.9, { taperIn: 0.05, taperOut: 0.6, dry: 0.25, seed: sd + 5, mode: 'max' });
  }
  // scale chevrons
  for (let i = 3; i < N - 4; i += 2) {
    const t = i / (N - 1), hw = (w / 2) * wfn(t) * 0.8;
    const n = nrm(i), p = S[i], q = S[i + 1];
    const back: Pt = [q[0] - p[0], q[1] - p[1]];
    f.stroke([[p[0] + n[0] * hw, p[1] + n[1] * hw], [p[0] + back[0] * 1.2, p[1] + back[1] * 1.2], [p[0] - n[0] * hw, p[1] - n[1] * hw]], Math.max(1, w * 0.06), 0.75, { taperIn: 0.2, taperOut: 0.2, rag: 0.1, mode: 'max', seed: i });
  }
  // dorsal fins (flame-like spikes on the upper side)
  if (o.fins !== false)
    for (let i = 4; i < N - 6; i += 3) {
      const t = i / (N - 1), hw = (w / 2) * wfn(t);
      let n = nrm(i);
      if (n[1] > 0) n = [-n[0], -n[1]]; // fins point up
      const p = S[i], q = S[Math.min(N - 1, i + 2)];
      const base: Pt = [p[0] + n[0] * hw, p[1] + n[1] * hw];
      const tip: Pt = [base[0] + n[0] * hw * 0.9 + (q[0] - p[0]) * 0.8, base[1] + n[1] * hw * 0.9 + (q[1] - p[1]) * 0.8];
      f.stroke([base, tip], Math.max(2, hw * 0.55), 0.7, { taperIn: 0.05, taperOut: 0.95, dry: 0.3, mode: 'max', seed: i });
    }
  // legs with three-toed claws
  if (o.legs !== false)
    for (const u of [0.16, 0.42]) {
      const i = Math.round(u * (N - 1));
      let n = nrm(i);
      if (n[1] < 0) n = [-n[0], -n[1]]; // legs hang down
      const p = S[i], hw = (w / 2) * wfn(u);
      const knee: Pt = [p[0] + n[0] * hw * 1.4 + (S[i + 2][0] - p[0]) * 1.2, p[1] + n[1] * hw * 1.4 + (S[i + 2][1] - p[1]) * 1.2];
      const paw: Pt = [knee[0] + n[0] * hw * 0.9 - (S[i + 2][0] - p[0]) * 1.5, knee[1] + n[1] * hw * 0.9 - (S[i + 2][1] - p[1]) * 1.5];
      f.stroke([p, knee, paw], Math.max(2, hw * 0.55), 0.6, { taperIn: 0, taperOut: 0.3, mode: 'max', seed: i });
      for (let k = -1; k <= 1; k++) {
        const a = Math.atan2(paw[1] - knee[1], paw[0] - knee[0]) + k * 0.6;
        f.stroke([paw, [paw[0] + Math.cos(a) * hw * 0.6, paw[1] + Math.sin(a) * hw * 0.6], [paw[0] + Math.cos(a + 0.5) * hw * 0.8, paw[1] + Math.sin(a + 0.5) * hw * 0.8]], Math.max(1.5, hw * 0.18), 0.95, { taperIn: 0.1, taperOut: 0.9, mode: 'max' });
      }
    }
  // tail tuft
  const tail = S[N - 1], pre = S[N - 4];
  const ta = Math.atan2(tail[1] - pre[1], tail[0] - pre[0]);
  for (let k = -1; k <= 1; k++) f.stroke([tail, [tail[0] + Math.cos(ta + k * 0.5) * w * 0.9, tail[1] + Math.sin(ta + k * 0.5) * w * 0.9]], w * 0.25, 0.7, { taperIn: 0.1, taperOut: 0.9, dry: 0.4, mode: 'max', seed: k + 20 });
  void seed;
}

/**
 * Dragon head at `at` (neck joint) facing angle `face` (radians, direction
 * the snout points). `s` = head length (px). `open` 0..1 jaw.
 */
export function dragonHead(f: Fld, at: Pt, face: number, s: number, open: number, ph = 0) {
  const flipY = Math.cos(face) > 0 ? -1 : 1; // keep the crown on top
  const rot = face - Math.PI;
  const T0 = (pts: Pt[]): Pt[] => xform(pts.map(([x, y]): Pt => [x * s, y * s * flipY]), 0, 0, rot, 1, at[0], at[1]);
  const T = (pts: Pt[]): Pt[] => T0(pts);
  const TS = (pts: Pt[]): Pt[] => spline(T0(pts), 6);
  const jawA = open * 0.45;
  const jaw = xform([[-0.15, 0.08], [-0.85, 0.12], [-0.78, 0.24], [-0.2, 0.3]], -0.15, 0.08, -jawA, 1);
  // wash
  f.poly(T([[0.05, -0.3], [-0.45, -0.34], [-0.82, -0.2], [-1.02, -0.05], [-0.95, 0.08], [-0.45, 0.06], [0.05, 0.25]]), 0.5, 'max');
  f.poly(T(jaw), 0.45, 'max');
  // bright contour lines
  f.stroke(TS([[0.05, -0.3], [-0.45, -0.34], [-0.82, -0.2], [-1.02, -0.05], [-0.95, 0.08]]), Math.max(1.5, s * 0.06), 0.95, { taperIn: 0.1, taperOut: 0.2, mode: 'max' });
  f.stroke(T(jaw), Math.max(1.5, s * 0.05), 0.9, { taperIn: 0.1, taperOut: 0.2, mode: 'max' });
  // fangs
  for (const x of [-0.8, -0.55]) f.stroke(T([[x, 0.07], [x + 0.03, 0.17]]), Math.max(1, s * 0.04), 1, { taperIn: 0, taperOut: 0.9, mode: 'max' });
  // eye + brow ridge
  f.dab(...T([[-0.48, -0.17]])[0], Math.max(1.5, s * 0.06), 1, { hard: 0.6 });
  f.stroke(TS([[-0.65, -0.3], [-0.45, -0.38], [-0.2, -0.32]]), Math.max(1.5, s * 0.07), 0.95, { taperIn: 0.2, taperOut: 0.6, mode: 'max' });
  // antlers
  for (const k of [0, 1]) {
    const o = k * 0.12;
    f.stroke(TS([[-0.2 + o, -0.32], [0.1 + o, -0.6], [0.55 + o, -0.75]]), Math.max(2, s * 0.08), 0.9, { taperIn: 0.05, taperOut: 0.9, mode: 'max' });
    f.stroke(T([[0.05 + o, -0.52], [0.12 + o, -0.8]]), Math.max(1.5, s * 0.06), 0.85, { taperIn: 0.05, taperOut: 0.9, mode: 'max' });
  }
  // mane (flowing back)
  for (let k = 0; k < 6; k++) {
    const y0 = -0.25 + k * 0.1;
    const wv = Math.sin(ph * TAU + k) * 0.08;
    f.stroke(TS([[0, y0], [0.35, y0 + 0.05 + wv], [0.7, y0 + 0.15 - wv]]), Math.max(2, s * 0.09), 0.7, { taperIn: 0.1, taperOut: 0.95, dry: 0.4, mode: 'max', seed: k });
  }
  // whiskers
  for (const sd of [0, 1]) {
    const wv = Math.sin(ph * TAU + sd * 2) * 0.15;
    f.stroke(TS([[-0.95, -0.02 + sd * 0.08], [-0.75, 0.2 + sd * 0.1 + wv], [-0.4, 0.3 + sd * 0.15 - wv], [0, 0.42 + sd * 0.12 + wv], [0.35, 0.36 + sd * 0.22 - wv]]), Math.max(1.2, s * 0.035), 0.85, { taperIn: 0.05, taperOut: 0.95, mode: 'max', seed: sd + 40 });
  }
  // flaming pearl breath glow at the jaws
  f.dab(...T([[-0.9, 0.12]])[0], s * 0.08, 0.8 * open, { hard: 0.3 });
}

// ------------------------------------------------------------------ gold dragon (40460: dray0003..0023)
function goldDragon(c: Ctx): PaintOut {
  const W = 400, H = 380, ax = 200, ay = 350;
  const f = new Fld(W, H);
  const k = +c.name.slice(-4); // 3..23
  const t = clamp((k - 3) / 20);
  const sc = lerp(0.35, 1, ease.out(clamp(t * 1.4)));
  // helix around a vertical axis, the head leading downward as t grows
  const cx = ax + lerp(-120, 0, ease.out(clamp(t * 1.6)));
  const top = lerp(30, 50, t);
  const span = lerp(140, 240, t) * sc;
  const R = lerp(50, 110, ease.out(t)) * sc;
  const spin = t * 5.5;
  const pts: Pt[] = [];
  for (let i = 0; i <= 40; i++) {
    const u = i / 40;
    const a = spin - u * 3.6 * Math.PI;
    const depthY = Math.sin(a) * R * 0.25;
    pts.push([cx + Math.cos(a) * R * (1 - u * 0.25), top + (1 - u) * span * (0.35 + 0.65 * t) + depthY + 30 * u]);
  }
  const w = 44 * sc;
  dragonBody(f, pts, w, c.seed);
  const face = Math.atan2(pts[0][1] - pts[2][1], pts[0][0] - pts[2][0]);
  dragonHead(f, pts[0], face, 64 * sc, k >= 20 ? 1 : 0.4 + 0.3 * Math.sin(k), k / 6);
  pool(f, 2, 0.2);
  return out(lit(f, GOLD, Math.max(2, 4 * sc), 0.45), ax, ay);
}

// ------------------------------------------------------------------ sky dragon (41270: 45f0000..0045)
function skyDragon(c: Ctx): PaintOut {
  const W = 580, H = 120, ax = 310, ay = 104;
  const f = new Fld(W, H);
  const ph = c.i / c.n;
  const pts: Pt[] = [];
  for (let i = 0; i <= 50; i++) {
    const u = i / 50;
    const x = 40 + u * 500;
    const y = 52 + Math.sin((u * 1.6 - ph) * TAU) * 22 * (0.4 + u * 0.6);
    pts.push([x, y]);
  }
  dragonBody(f, pts, 26, c.seed);
  const face = Math.atan2(pts[0][1] - pts[2][1], pts[0][0] - pts[2][0]);
  dragonHead(f, pts[0], face, 40, 0.5 + 0.5 * Math.sin(ph * TAU * 2), ph * 3);
  // trailing clouds
  for (let k = 0; k < 4; k++) {
    const u = 0.2 + k * 0.2;
    const p = pts[Math.round(u * 50)];
    f.stroke([[p[0] - 20, p[1] + 16], [p[0], p[1] + 22], [p[0] + 26, p[1] + 16]], 7, 0.35, { taperIn: 0.3, taperOut: 0.6, dry: 0.6, mode: 'max', seed: k });
  }
  return out(lit(f, JADE, 3, 0.45), ax, ay);
}

// ------------------------------------------------------------------ fire dragon parts (40110 heads, 40111 segments, 40112 small heads)
function fireHead(dirKind: 'n' | 'u' | 'd', small = false) {
  return (c: Ctx): PaintOut => {
    const W = small ? 96 : 124, H = small ? 86 : 120;
    const ax = W / 2, ay = H / 2;
    const f = new Fld(W, H);
    const k = c.i; // 0..7 cycle
    const face = Math.PI + (dirKind === 'u' ? 0.5 : dirKind === 'd' ? -0.5 : 0) * -1;
    const s = small ? 44 : 60;
    const at: Pt = [ax + s * 0.45, ay + 2];
    // flame mane behind
    const ff = new Fld(W, H);
    flame(ff, ax + s * 0.5, ay + s * 0.35, k / 8, c.seed, { W: s * 0.7, H: s * 0.9, tongues: 4, sway: 0.8 });
    for (let i = 0; i < f.v.length; i++) f.v[i] = Math.max(f.v[i], ff.v[i] * 0.55);
    dragonHead(f, at, face, s, 0.5 + 0.5 * Math.sin((k / 8) * TAU), k / 8);
    pool(f, 2, 0.25);
    return out(lit(f, FIRE, 3, 0.5), ax, ay);
  };
}
/** Flaming body segment: an orb of fire with scale arcs (11-frame flicker). */
function fireSegment(c: Ctx): PaintOut {
  const W = 74, H = 88, ax = 36, ay = 58;
  const f = new Fld(W, H);
  const r = rng(c.seed);
  f.dab(ax, ay - 6, 24, 0.55, { hard: 0.3, tex: 0.4, texF: 3 });
  // scale arcs
  for (let k = 0; k < 3; k++) {
    const y = ay - 18 + k * 10;
    f.stroke([[ax - 18 + k * 2, y], [ax, y + 6], [ax + 18 - k * 2, y]], 3, 0.85, { taperIn: 0.2, taperOut: 0.2, mode: 'max' });
  }
  flame(f, ax, ay + 10, c.i / c.n, c.seed, { W: 30, H: 62, tongues: 4, sway: 0.8, heat: 0.75 });
  void r;
  pool(f, 2, 0.3);
  return out(lit(f, FIRE, 3, 0.5), ax, ay);
}

export const dragonRules: Rule[] = [
  { dir: 'magic/046', name: /^dray/, gen: goldDragon },
  { dir: 'magic/127', gen: skyDragon },
  { dir: 'magic/011', name: /^dfbn/, gen: fireSegment },
  { dir: 'magic/011', name: /^dfhn/, gen: fireHead('n') },
  { dir: 'magic/011', name: /^dfhu/, gen: fireHead('u') },
  { dir: 'magic/011', name: /^dfhd/, gen: fireHead('d') },
  { dir: 'magic/011', name: /^e8n/, gen: fireHead('n', true) },
  { dir: 'magic/011', name: /^e8u/, gen: fireHead('u', true) },
  { dir: 'magic/011', name: /^e8d/, gen: fireHead('d', true) },
];

void GOLD;
export type { Ramp };
