// 2D skeletal rig for the battle figures (generals, soldiers, riders) and a
// tiny SVG canvas that tracks its own bounds. Figures are authored facing +x
// (forward) in "body space" (pelvis at origin, +y down) and mirrored at the end,
// because the battle sprites face left.
import { brush, f2, smoothPath, type Pt, type Rng } from '../ink.ts';

export type V = Pt;
export const rad = (d: number) => (d * Math.PI) / 180;
/** Unit vector for an angle measured from straight down, + toward forward (+x). */
export const dir = (deg: number): V => [Math.sin(rad(deg)), Math.cos(rad(deg))];
export const add = (a: V, b: V): V => [a[0] + b[0], a[1] + b[1]];
export const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1]];
export const mul = (a: V, k: number): V => [a[0] * k, a[1] * k];
export const len = (a: V) => Math.hypot(a[0], a[1]);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const lerpV = (a: V, b: V, t: number): V => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
export const angOf = (v: V) => (Math.atan2(v[0], v[1]) * 180) / Math.PI; // inverse of dir()
export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
export const smooth = (t: number) => t * t * (3 - 2 * t);
export const perp = (a: V): V => [-a[1], a[0]];
export const norm = (a: V): V => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l];
};

/** Two-bone IK: elbow/knee position. `side` picks the bend (+1 / -1 relative to root→target). */
export function ik(root: V, target: V, a: number, b: number, side: number): { mid: V; end: V } {
  const d0 = sub(target, root);
  const dist = clamp(len(d0), Math.abs(a - b) + 0.01, a + b - 0.01);
  const u = norm(d0);
  const cosA = clamp((a * a + dist * dist - b * b) / (2 * a * dist), -1, 1);
  const sinA = Math.sqrt(1 - cosA * cosA) * side;
  // rotate u by ±A
  const m: V = [u[0] * cosA - u[1] * sinA, u[0] * sinA + u[1] * cosA];
  const mid = add(root, mul(m, a));
  const end = add(mid, mul(norm(sub(add(root, mul(u, dist)), mid)), b));
  return { mid, end };
}

/** Catmull-Rom resampling of a polyline into a smooth dense curve. */
export function catmull(pts: V[], per = 5): V[] {
  if (pts.length < 3) return pts;
  const out: V[] = [];
  const P = [pts[0], ...pts, pts[pts.length - 1]];
  for (let i = 1; i < P.length - 2; i++) {
    const [p0, p1, p2, p3] = [P[i - 1], P[i], P[i + 1], P[i + 2]];
    for (let k = 0; k < per; k++) {
      const t = k / per, t2 = t * t, t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

// ------------------------------------------------------------------ canvas
/** Collects SVG fragments in world coordinates and tracks the bounding box. */
export class Canvas {
  parts: string[] = [];
  x0 = Infinity;
  y0 = Infinity;
  x1 = -Infinity;
  y1 = -Infinity;
  ext(p: V, r = 0) {
    if (!Number.isFinite(p[0]) || !Number.isFinite(p[1])) return;
    if (p[0] - r < this.x0) this.x0 = p[0] - r;
    if (p[1] - r < this.y0) this.y0 = p[1] - r;
    if (p[0] + r > this.x1) this.x1 = p[0] + r;
    if (p[1] + r > this.y1) this.y1 = p[1] + r;
  }
  raw(s: string) {
    this.parts.push(s);
  }
  /** Stroked polyline (round caps/joins). */
  line(pts: V[], w: number, color: string, op = 1) {
    if (pts.length < 2) return;
    for (const p of pts) this.ext(p, w / 2);
    let d = `M${f2(pts[0][0])},${f2(pts[0][1])}`;
    for (let i = 1; i < pts.length; i++) d += `L${f2(pts[i][0])},${f2(pts[i][1])}`;
    this.parts.push(`<path d="${d}" fill="none" stroke="${color}" stroke-width="${f2(w)}" stroke-linecap="round" stroke-linejoin="round"${op < 1 ? ` opacity="${f2(op)}"` : ''}/>`);
  }
  /** Smooth open curve, stroked. */
  curve(pts: V[], w: number, color: string, op = 1) {
    if (pts.length < 2) return;
    for (const p of pts) this.ext(p, w / 2);
    this.parts.push(`<path d="${smoothPath(pts)}" fill="none" stroke="${color}" stroke-width="${f2(w)}" stroke-linecap="round" stroke-linejoin="round"${op < 1 ? ` opacity="${f2(op)}"` : ''}/>`);
  }
  /** Filled shape (straight or smooth), optional ink outline. */
  shape(pts: V[], fill: string, stroke?: string, sw = 0, smoothIt = false, op = 1) {
    if (pts.length < 3) return;
    for (const p of pts) this.ext(p, sw / 2);
    let d: string;
    if (smoothIt) d = smoothPath(pts, true, 0.45);
    else {
      d = `M${f2(pts[0][0])},${f2(pts[0][1])}`;
      for (let i = 1; i < pts.length; i++) d += `L${f2(pts[i][0])},${f2(pts[i][1])}`;
      d += 'Z';
    }
    this.parts.push(
      `<path d="${d}" fill="${fill}"${stroke ? ` stroke="${stroke}" stroke-width="${f2(sw)}" stroke-linejoin="round"` : ''}${op < 1 ? ` opacity="${f2(op)}"` : ''}/>`,
    );
  }
  circle(c: V, r: number, fill: string, stroke?: string, sw = 0, op = 1) {
    this.ext(c, r + sw / 2);
    this.parts.push(
      `<circle cx="${f2(c[0])}" cy="${f2(c[1])}" r="${f2(r)}" fill="${fill}"${stroke ? ` stroke="${stroke}" stroke-width="${f2(sw)}"` : ''}${op < 1 ? ` opacity="${f2(op)}"` : ''}/>`,
    );
  }
  ellipse(c: V, rx: number, ry: number, ang: number, fill: string, stroke?: string, sw = 0, op = 1) {
    this.ext(c, Math.max(rx, ry) + sw / 2);
    this.parts.push(
      `<ellipse cx="${f2(c[0])}" cy="${f2(c[1])}" rx="${f2(rx)}" ry="${f2(ry)}" transform="rotate(${f2(ang)} ${f2(c[0])} ${f2(c[1])})" fill="${fill}"${stroke ? ` stroke="${stroke}" stroke-width="${f2(sw)}"` : ''}${op < 1 ? ` opacity="${f2(op)}"` : ''}/>`,
    );
  }
  /** Calligraphic tapered stroke (ink.ts brush). */
  brush(pts: V[], w: number, color: string, r?: Rng, op = 1, opts: { taperIn?: number; taperOut?: number; jitter?: number } = {}) {
    if (pts.length < 2) return;
    for (const p of pts) this.ext(p, w / 2);
    this.parts.push(`<path d="${brush(pts.length > 2 ? catmull(pts, 4) : pts, w, r, opts)}" fill="${color}"${op < 1 ? ` opacity="${f2(op)}"` : ''}/>`);
  }
  /**
   * Final SVG. `mirror` flips horizontally (sprites face left). The anchor is
   * world (0,0). Returns the PaintOut fields.
   */
  /** ink-wash texture: ragged edges + mottled washes (one cheap filter per sprite) */
  wash: { seed: number; edge: number; mottle: number } | null = null;
  out(mirror: boolean, pad = 3, minW = 4, minH = 4, padB = pad) {
    if (!Number.isFinite(this.x0)) {
      this.x0 = this.y0 = -1;
      this.x1 = this.y1 = 1;
    }
    const x0 = Math.floor(this.x0 - pad), x1 = Math.ceil(this.x1 + pad);
    const y0 = Math.floor(this.y0 - pad), y1 = Math.ceil(this.y1 + padB);
    const w = Math.max(minW, x1 - x0), h = Math.max(minH, y1 - y0);
    const ax = mirror ? x1 : -x0, ay = -y0;
    const tr = mirror ? `translate(${x1},${-y0}) scale(-1,1)` : `translate(${-x0},${-y0})`;
    let defs = '', fa = '';
    if (this.wash) {
      const { seed, edge, mottle } = this.wash;
      defs = `<defs><filter id="w" x="-4%" y="-4%" width="108%" height="108%" color-interpolation-filters="sRGB">` +
        `<feTurbulence type="fractalNoise" baseFrequency="0.11" numOctaves="1" seed="${seed % 997}" result="n"/>` +
        `<feDisplacementMap in="SourceGraphic" in2="n" scale="${edge}" xChannelSelector="R" yChannelSelector="G" result="d"/>` +
        `<feColorMatrix in="n" type="matrix" values="0 0 0 0 0.97  0 0 0 0 0.95  0 0 0 0 0.9  ${mottle * 3} 0 0 0 ${-mottle * 1.2}" result="m"/>` +
        `<feComposite in="m" in2="d" operator="atop" result="o"/></filter></defs>`;
      fa = ' filter="url(#w)"';
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${defs}<g${fa}><g transform="${tr}">${this.parts.join('')}</g></g></svg>`;
    return { svg, w, h, ax, ay };
  }
}

// ------------------------------------------------------------------ pose
/**
 * A body pose in body space (pelvis = origin before the global offset), +x
 * forward, +y down. Angles in degrees "from down, + toward forward":
 * 0 = down, 90 = forward, 180 = up, -90 = backward.
 */
export interface Pose {
  /** pelvis offset (px, before scale) from its neutral spot */
  x: number;
  y: number;
  /** whole-body pitch around the pelvis (+ = forward / face down) */
  rot: number;
  /** torso lean (+ forward) */
  lean: number;
  /** head tilt relative to the torso (+ = chin down / forward) */
  head: number;
  /** near (weapon) hand target, relative to pelvis */
  h1: V;
  /** far hand target (used when g2 is 0) */
  h2: V;
  /** far hand on the weapon shaft: offset along the shaft from the near hand (px, + toward the tip); 0 = free hand */
  g2: number;
  /** weapon direction */
  w: number;
  /** near / far foot targets relative to pelvis */
  f1: V;
  f2: V;
  /** 0 = main weapon in hand, 1 = bow drawn (far hand holds bow), 2 = weapon dropped */
  mode: number;
  /** bow draw 0..1 (mode 1) */
  draw: number;
  /** elbow bend side flips (1 = natural) */
  e1: number;
  e2: number;
  /** knee bend flips (1 = knees forward) */
  k1: number;
  k2: number;
  /** cape / ribbon wind (0..1, + = streaming back strongly) */
  wind: number;
}

export const BASE: Pose = {
  x: 0, y: 0, rot: 0, lean: 4, head: 0,
  h1: [12, -14], h2: [-4, -4], g2: 0, w: 165,
  f1: [9, 44], f2: [-9, 44],
  mode: 0, draw: 0, e1: 1, e2: 1, k1: 1, k2: 1, wind: 0.3,
};

export type Key = Partial<Pose>;

const NUM_KEYS: (keyof Pose)[] = ['x', 'y', 'rot', 'lean', 'head', 'g2', 'w', 'draw', 'wind'];
const VEC_KEYS: (keyof Pose)[] = ['h1', 'h2', 'f1', 'f2'];

export function mixPose(a: Pose, b: Pose, t: number): Pose {
  const o = { ...a } as Pose;
  const rec = o as unknown as Record<string, unknown>;
  for (const k of NUM_KEYS) rec[k] = lerp(a[k] as number, b[k] as number, t);
  for (const k of VEC_KEYS) rec[k] = lerpV(a[k] as V, b[k] as V, t);
  // discrete fields switch at the midpoint
  for (const k of ['mode', 'e1', 'e2', 'k1', 'k2'] as const) o[k] = t < 0.5 ? a[k] : b[k];
  // grip blends only when both have the far hand on the shaft
  if (!a.g2 || !b.g2) o.g2 = t < 0.5 ? a.g2 : b.g2;
  return o;
}

/**
 * Keyframed sequence: keys at frame indices (0..n-1), each a partial pose
 * applied cumulatively on top of `base`. Returns the eased pose at frame i.
 * A key may carry `ease: 'lin'` to move linearly (fast strike) into it.
 */
export type SeqKey = [number, Key & { ease?: 'lin' | 'in' | 'out' }];
export function seq(base: Pose, keys: SeqKey[], i: number): Pose {
  const full: [number, Pose, string | undefined][] = [];
  let cur = base;
  for (const [f, k] of keys) {
    const { ease, ...rest } = k;
    cur = { ...cur, ...rest } as Pose;
    full.push([f, cur, ease]);
  }
  if (i <= full[0][0]) return full[0][1];
  for (let j = 0; j < full.length - 1; j++) {
    const [fa, pa] = full[j], [fb, pb, e] = full[j + 1];
    if (i >= fa && i <= fb) {
      let t = fb === fa ? 1 : (i - fa) / (fb - fa);
      t = e === 'lin' ? t : e === 'in' ? t * t : e === 'out' ? 1 - (1 - t) * (1 - t) : smooth(t);
      return mixPose(pa, pb, t);
    }
  }
  return full[full.length - 1][1];
}

// ------------------------------------------------------------------ skeleton
export interface Dims {
  torso: number;
  neck: number;
  headR: number;
  ua: number;
  fa: number;
  th: number;
  sh: number;
  /** stroke widths */
  wUa: number;
  wFa: number;
  wTh: number;
  wSh: number;
  chest: number;
  waist: number;
  ol: number;
}
export const DIMS: Dims = {
  torso: 31, neck: 10, headR: 9, ua: 16.5, fa: 16, th: 23, sh: 23,
  wUa: 7.5, wFa: 6.4, wTh: 9.8, wSh: 8, chest: 17, waist: 13.5, ol: 1.7,
};

export interface Skel {
  P: V;
  N: V;
  H: V;
  /** torso up direction & head direction (unit) */
  up: V;
  hd: V;
  fwd: V;
  S1: V;
  S2: V;
  E1: V;
  E2: V;
  W1: V;
  W2: V;
  Hp1: V;
  Hp2: V;
  K1: V;
  K2: V;
  A1: V;
  A2: V;
  /** weapon direction (unit, world) */
  wd: V;
  rot: number;
}

/**
 * Solves the skeleton in world space. `org` is the world position of the
 * neutral pelvis, `s` the scale.
 */
export function solve(p: Pose, d: Dims, org: V, s: number): Skel {
  const r = rad(-p.rot);
  const cr = Math.cos(r), sr = Math.sin(r);
  // body space → world. rotation by -rot in "angle-from-down" space equals rotating vectors
  const R = (v: V): V => [v[0] * cr + v[1] * sr, -v[0] * sr + v[1] * cr];
  const P: V = add(org, mul([p.x, p.y], s));
  const W = (v: V): V => add(P, mul(R(v), s));
  // body space joints
  const upB = dir(180 - p.lean);
  const Nb = mul(upB, d.torso);
  const hdB = dir(180 - p.lean - p.head);
  const Hb = add(Nb, mul(hdB, d.neck));
  const S1b = add(Nb, add(mul(upB, -2.5), [1.5, 0]));
  const S2b = add(Nb, add(mul(upB, -3), [-2, 0]));
  const wdB = dir(p.w);
  const Hp1b: V = [1.5, 1], Hp2b: V = [-1.5, 0];
  // ik() bend sign: pick the knee that points forward
  const fixKnee = (hip: V, foot: V, k: number) => {
    const a = ik(hip, foot, d.th, d.sh, 1), b = ik(hip, foot, d.th, d.sh, -1);
    const fa = a.mid[0] >= b.mid[0] ? a : b, ba = a.mid[0] >= b.mid[0] ? b : a;
    return k >= 0 ? fa : ba;
  };
  const l1 = fixKnee(Hp1b, p.f1, p.k1), l2 = fixKnee(Hp2b, p.f2, p.k2);
  const fixElbow = (sh: V, tgt: V, e: number) => {
    const a = ik(sh, tgt, d.ua, d.fa, 1), b = ik(sh, tgt, d.ua, d.fa, -1);
    // natural elbow: lower (larger y) and behind
    const sa = a.mid[1] * 1 - a.mid[0] * 0.35, sb = b.mid[1] * 1 - b.mid[0] * 0.35;
    const nat = sa >= sb ? a : b, oth = sa >= sb ? b : a;
    return e >= 0 ? nat : oth;
  };
  const a1 = fixElbow(S1b, p.h1, p.e1);
  const t2b: V = p.g2 ? add(a1.end, mul(wdB, p.g2)) : p.h2;
  const a2 = fixElbow(S2b, t2b, p.e2);
  const wd = R(wdB);
  return {
    P,
    N: W(Nb),
    H: W(Hb),
    up: R(upB),
    hd: R(hdB),
    fwd: R([1, 0]),
    S1: W(S1b),
    S2: W(S2b),
    E1: W(a1.mid),
    E2: W(a2.mid),
    W1: W(a1.end),
    W2: W(a2.end),
    Hp1: W(Hp1b),
    Hp2: W(Hp2b),
    K1: W(l1.mid),
    K2: W(l2.mid),
    A1: W(l1.end),
    A2: W(l2.end),
    wd,
    rot: p.rot,
  };
}
