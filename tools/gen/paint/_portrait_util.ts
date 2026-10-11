// Small SVG helpers shared by the portrait painter modules.
import { brush, f2, smoothPath, type Pt, type Rng } from '../ink.ts';

export const P = (pts: Pt[], closed = false, t = 0.5) => smoothPath(pts, closed, t);

/** Filled path element. */
export const fill = (d: string, col: string, op = 1, extra = '') =>
  d ? `<path d="${d}" fill="${col}"${op < 1 ? ` opacity="${f2(op)}"` : ''}${extra ? ' ' + extra : ''}/>` : '';

/** Brush stroke element. */
export function stroke(pts: Pt[], w: number, col: string, r: Rng, op = 1, o: { taperIn?: number; taperOut?: number; jitter?: number } = {}) {
  return fill(brush(pts, w, r, o), col, op);
}

/** A constant-width ribbon along a polyline (collars, bands, straps). */
export function band(pts: Pt[], w: number, w2 = w) {
  const L: Pt[] = [], R: Pt[] = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    let nx = -(b[1] - a[1]), ny = b[0] - a[0];
    const l = Math.hypot(nx, ny) || 1;
    nx /= l;
    ny /= l;
    const hw = (w + (w2 - w) * (i / Math.max(1, n - 1))) / 2;
    L.push([pts[i][0] + nx * hw, pts[i][1] + ny * hw]);
    R.push([pts[i][0] - nx * hw, pts[i][1] - ny * hw]);
  }
  return P([...L, ...R.reverse()], true, 0.3);
}

/** Points along a quadratic-ish curve a → c with control b, n samples. */
export function qpts(a: Pt, b: Pt, c: Pt, n = 8): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, s = 1 - t;
    out.push([s * s * a[0] + 2 * s * t * b[0] + t * t * c[0], s * s * a[1] + 2 * s * t * b[1] + t * t * c[1]]);
  }
  return out;
}

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const lp = (a: Pt, b: Pt, t: number): Pt => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];

/** Ellipse path (optionally rotated, degrees). */
export function ell(cx: number, cy: number, rx: number, ry: number, rot = 0) {
  const pts: Pt[] = [];
  const c = Math.cos((rot * Math.PI) / 180), s = Math.sin((rot * Math.PI) / 180);
  for (let i = 0; i < 16; i++) {
    const t = (i / 16) * Math.PI * 2;
    const x = Math.cos(t) * rx, y = Math.sin(t) * ry;
    pts.push([cx + x * c - y * s, cy + x * s + y * c]);
  }
  return P(pts, true);
}

export const circ = (cx: number, cy: number, r: number, col: string, op = 1, extra = '') =>
  `<circle cx="${f2(cx)}" cy="${f2(cy)}" r="${f2(r)}" fill="${col}"${op < 1 ? ` opacity="${f2(op)}"` : ''}${extra ? ' ' + extra : ''}/>`;

export const g = (body: string, attrs = '') => (body ? `<g ${attrs}>${body}</g>` : '');

/** Point at fraction t along a polyline (by vertex index). */
export function along(pts: Pt[], t: number): Pt {
  const f = Math.max(0, Math.min(1, t)) * (pts.length - 1);
  const i = Math.min(pts.length - 2, Math.floor(f));
  return lp(pts[i], pts[i + 1], f - i);
}
