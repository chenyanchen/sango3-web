// Geometry helpers for the strategy map painter: dense smooth polylines with
// natural wiggle, point-in-polygon, distances.
import type { Pt, Rng } from '../ink.ts';

/** Catmull-Rom resample of a polyline, roughly every `step` px. */
export function resample(pts: Pt[], step = 4, closed = false): Pt[] {
  if (pts.length < 2) return pts.slice();
  const P = closed ? [pts[pts.length - 1], ...pts, pts[0], pts[1]] : [pts[0], ...pts, pts[pts.length - 1]];
  const out: Pt[] = [];
  for (let i = 1; i < P.length - 2; i++) {
    const [p0, p1, p2, p3] = [P[i - 1], P[i], P[i + 1], P[i + 2]];
    const n = Math.max(1, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  if (!closed) out.push(pts[pts.length - 1]);
  return out;
}

/** Smooth 1-D value noise (sum of octaves), deterministic per rng. */
export function noise1(r: Rng, octaves = 3) {
  const tabs = Array.from({ length: octaves }, () => Array.from({ length: 256 }, () => r.next() * 2 - 1));
  return (x: number) => {
    let s = 0, amp = 1, norm = 0;
    for (let o = 0; o < octaves; o++) {
      const fx = x * (1 << o);
      const i = Math.floor(fx), t = fx - i;
      const a = tabs[o][i & 255], b = tabs[o][(i + 1) & 255];
      const u = t * t * (3 - 2 * t);
      s += (a + (b - a) * u) * amp;
      norm += amp;
      amp *= 0.5;
    }
    return s / norm;
  };
}

/** Offsets a dense polyline sideways by smooth noise (meanders, ragged coasts). */
export function wiggle(pts: Pt[], r: Rng, amp: number, wavelength: number, pinEnds = true): Pt[] {
  const nz = noise1(r, 3);
  let s = 0;
  return pts.map((p, i) => {
    if (i > 0) s += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]);
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let nx = -(b[1] - a[1]), ny = b[0] - a[0];
    const l = Math.hypot(nx, ny) || 1;
    nx /= l;
    ny /= l;
    let k = 1;
    if (pinEnds) k = Math.min(1, i / 6, (pts.length - 1 - i) / 6);
    const o = nz(s / wavelength) * amp * k;
    return [p[0] + nx * o, p[1] + ny * o];
  });
}

/** Offsets a dense polyline by a fixed distance along its left normal (negative = right). */
export function offset(pts: Pt[], d: number): Pt[] {
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 2)], b = pts[Math.min(pts.length - 1, i + 2)];
    let nx = -(b[1] - a[1]), ny = b[0] - a[0];
    const l = Math.hypot(nx, ny) || 1;
    nx /= l;
    ny /= l;
    return [p[0] + nx * d, p[1] + ny * d];
  });
}

export function inPoly(x: number, y: number, poly: Pt[]) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

/** Min distance from a point to a dense polyline (vertex distance; fine for dense lines). */
export function distTo(x: number, y: number, pts: Pt[]) {
  let d = Infinity;
  for (const p of pts) d = Math.min(d, (p[0] - x) ** 2 + (p[1] - y) ** 2);
  return Math.sqrt(d);
}

export const pathD = (pts: Pt[], closed = false) =>
  pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('') + (closed ? 'Z' : '');

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export const overlap = (a: Rect, b: Rect) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
export const hitsRect = (x: number, y: number, r: Rect, m = 0) => x > r.x - m && x < r.x + r.w + m && y > r.y - m && y < r.y + r.h + m;
