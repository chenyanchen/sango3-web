// 野战 ground tiles (sf/map fills and corner transitions), rendered straight to
// RGBA. Every pixel is a function of the tile-local iso coordinates (s, t) in
// [0,1]²: base colour + lattice-periodic paper grain + a transition field that
// only depends on the four corner classes and on period-1 noise, so any two
// tiles that share an edge agree along it (seamless). Interior marks (grass
// strokes, pebbles, ripples, dunes) stay away from the edges.
import { hash, rng, type Rng } from '../ink.ts';
import type { Cls } from '../maps/_tiles.ts';

export const GW = 96, GH = 36, GAX = 48, GAY = 18;

type RGB = [number, number, number];
const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

/** class palettes: base, light, dark (wash), mark ink */
const PAL: Record<Cls, { base: RGB; lo: RGB; hi: RGB; ink: RGB }> = {
  P: { base: hex('#ddd0ae'), lo: hex('#cdbd95'), hi: hex('#e8dcbd'), ink: hex('#6e604a') },
  G: { base: hex('#c3c995'), lo: hex('#a9b47c'), hi: hex('#d2d6a8'), ink: hex('#4f6a3e') },
  S: { base: hex('#e4e8e8'), lo: hex('#c9d3dc'), hi: hex('#f2f3ef'), ink: hex('#7f8e9e') },
  A: { base: hex('#9db3bd'), lo: hex('#86a0ae'), hi: hex('#bccbd0'), ink: hex('#4d6b80') },
  D: { base: hex('#e2bd7a'), lo: hex('#d1a660'), hi: hex('#eccf98'), ink: hex('#946a34') },
  R: { base: hex('#c7b291'), lo: hex('#b39c7a'), hi: hex('#d5c3a4'), ink: hex('#6a5640') },
};

// ------------------------------------------------------------------ periodic noise on the tile torus
function torusNoise(seed: number, n: number) {
  const g = new Float32Array(n * n);
  const r = rng(seed);
  for (let i = 0; i < g.length; i++) g[i] = r.next();
  const sm = (t: number) => t * t * (3 - 2 * t);
  return (s: number, t: number) => {
    const x = (((s % 1) + 1) % 1) * n, y = (((t % 1) + 1) % 1) * n;
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = sm(x - x0), fy = sm(y - y0);
    const at = (a: number, b: number) => g[((b + n) % n) * n + ((a + n) % n)];
    const a = at(x0, y0), b = at(x0 + 1, y0), c = at(x0, y0 + 1), d = at(x0 + 1, y0 + 1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
}
const grainA = torusNoise(11, 12), grainB = torusNoise(23, 24), grainC = torusNoise(37, 5);
const edgeNoise: Record<string, (s: number, t: number) => number> = {};
const edgeN = (c: Cls) => (edgeNoise[c] ??= ((a, b) => (s: number, t: number) => a(s, t) * 0.65 + b(s, t) * 0.35)(torusNoise(hash('edge' + c), 5), torusNoise(hash('edge2' + c), 11)));

const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const lerp3 = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** pixel → tile coords */
function st(px: number, py: number): [number, number] {
  const dx = (px - GAX) / 48, dy = (py - GAY) / 18;
  return [(dx + dy + 1) / 2, (dy - dx + 1) / 2];
}
/** tile coords → pixel */
function xy(s: number, t: number): [number, number] {
  return [GAX + (s - t) * 48, GAY + (s + t - 1) * 18];
}

/** colour of a class at (s,t) without marks */
function ground(c: Cls, s: number, t: number): RGB {
  const p = PAL[c];
  const g1 = grainA(s, t), g2 = grainB(s, t), g3 = grainC(s, t);
  let col = lerp3(p.base, g3 > 0.5 ? p.hi : p.lo, Math.abs(g3 - 0.5) * 0.7);
  col = lerp3(col, g1 > 0.5 ? p.hi : p.lo, Math.abs(g1 - 0.5) * 0.45);
  col = lerp3(col, p.lo, Math.max(0, g2 - 0.62) * 0.9);
  if (c === 'A') {
    // long soft swell bands across the water (period-1 in s+t keeps them seamless)
    const band = Math.sin((s - t) * Math.PI * 2 * 2 + g1 * 2.2) * 0.5 + 0.5;
    col = lerp3(col, p.hi, band * 0.18);
  }
  return col;
}

// ------------------------------------------------------------------ marks (rasterized strokes)
class Canvas {
  readonly rgb: Float32Array;
  readonly a: Uint8Array;
  constructor() {
    this.rgb = new Float32Array(GW * GH * 3);
    this.a = new Uint8Array(GW * GH);
  }
  /** blends a capsule (segment with radius r0→r1) of colour c, opacity op */
  seg(x0: number, y0: number, x1: number, y1: number, r0: number, r1: number, c: RGB, op: number) {
    const minx = Math.max(0, Math.floor(Math.min(x0, x1) - Math.max(r0, r1) - 1)), maxx = Math.min(GW - 1, Math.ceil(Math.max(x0, x1) + Math.max(r0, r1) + 1));
    const miny = Math.max(0, Math.floor(Math.min(y0, y1) - Math.max(r0, r1) - 1)), maxy = Math.min(GH - 1, Math.ceil(Math.max(y0, y1) + Math.max(r0, r1) + 1));
    const dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy || 1e-6;
    for (let y = miny; y <= maxy; y++) for (let x = minx; x <= maxx; x++) {
      const i = y * GW + x;
      if (!this.a[i]) continue;
      const px = x + 0.5, py = y + 0.5;
      const k = Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / L2));
      const d = Math.hypot(px - (x0 + dx * k), py - (y0 + dy * k));
      const r = r0 + (r1 - r0) * k;
      const cov = Math.max(0, Math.min(1, r + 0.5 - d)) * op;
      if (cov <= 0) continue;
      for (let ch = 0; ch < 3; ch++) this.rgb[i * 3 + ch] += (c[ch] - this.rgb[i * 3 + ch]) * cov;
    }
  }
  dot(x: number, y: number, r: number, c: RGB, op: number) {
    this.seg(x, y, x + 0.01, y, r, r, c, op);
  }
  /** soft elliptical wash */
  wash(x: number, y: number, rx: number, ry: number, c: RGB, op: number) {
    for (let yy = Math.max(0, Math.floor(y - ry)); yy <= Math.min(GH - 1, Math.ceil(y + ry)); yy++)
      for (let xx = Math.max(0, Math.floor(x - rx)); xx <= Math.min(GW - 1, Math.ceil(x + rx)); xx++) {
        const i = yy * GW + xx;
        if (!this.a[i]) continue;
        const d = Math.hypot((xx + 0.5 - x) / rx, (yy + 0.5 - y) / ry);
        const cov = Math.max(0, 1 - d) ** 1.5 * op;
        for (let ch = 0; ch < 3; ch++) this.rgb[i * 3 + ch] += (c[ch] - this.rgb[i * 3 + ch]) * cov;
      }
  }
}

/** interior marks of a class around (s,t) (only called away from the edges) */
function marks(cv: Canvas, c: Cls, r: Rng, s: number, t: number, density: number) {
  const [x, y] = xy(s, t);
  const p = PAL[c];
  switch (c) {
    case 'P': {
      const k = r.next();
      if (k < 0.45) {
        // pebbles / dry ink dots
        for (let n = r.int(1, 3); n > 0; n--) cv.dot(x + r.range(-4, 4), y + r.range(-1.5, 1.5), r.range(0.5, 1.1), p.ink, r.range(0.25, 0.5));
      } else if (k < 0.8) {
        // sparse grass tuft
        for (let n = r.int(2, 4); n > 0; n--) {
          const bx = x + r.range(-3, 3);
          cv.seg(bx, y, bx + r.range(-2, 2), y - r.range(2.5, 4.5), 0.55, 0.15, lerp3(p.ink, PAL.G.ink, 0.6), 0.45);
        }
      } else cv.wash(x, y, r.range(6, 10), r.range(2, 3.5), p.lo, 0.35 * density);
      break;
    }
    case 'G': {
      if (r.next() < 0.7) {
        for (let n = r.int(3, 6); n > 0; n--) {
          const bx = x + r.range(-4, 4), by = y + r.range(-1, 1);
          cv.seg(bx, by, bx + r.range(-2.5, 2.5), by - r.range(3, 6), 0.65, 0.15, p.ink, r.range(0.45, 0.75));
        }
      } else for (let n = r.int(2, 4); n > 0; n--) cv.dot(x + r.range(-4, 4), y + r.range(-1.5, 1.5), r.range(0.7, 1.3), lerp3(p.ink, [30, 40, 25], 0.3), 0.7);
      break;
    }
    case 'S': {
      cv.wash(x, y + 1, r.range(6, 12), r.range(1.5, 2.5), p.lo, 0.5);
      if (r.chance(0.4)) cv.seg(x - 3, y, x + 3, y - 0.5, 0.4, 0.2, p.ink, 0.35);
      break;
    }
    case 'A': {
      // ripple: two thin arcs (light over dark)
      const w = r.range(4, 8);
      cv.seg(x - w, y + 0.6, x, y - 0.4, 0.45, 0.35, p.ink, 0.45);
      cv.seg(x, y - 0.4, x + w, y + 0.6, 0.35, 0.15, p.ink, 0.45);
      if (r.chance(0.6)) cv.seg(x - w * 0.6, y + 2, x + w * 0.7, y + 1.6, 0.4, 0.2, p.hi, 0.6);
      break;
    }
    case 'D': {
      const w = r.range(6, 11);
      cv.seg(x - w, y + 1, x - w * 0.2, y - 0.6, 0.55, 0.45, p.ink, 0.35);
      cv.seg(x - w * 0.2, y - 0.6, x + w, y + 0.4, 0.45, 0.15, p.ink, 0.3);
      cv.wash(x, y + 2, w, 1.6, p.hi, 0.5);
      break;
    }
    case 'R': {
      for (let n = r.int(1, 3); n > 0; n--) cv.dot(x + r.range(-5, 5), y + r.range(-1.5, 1.5), r.range(0.6, 1.2), p.ink, r.range(0.25, 0.45));
      break;
    }
  }
}

/** a ground tile. a = X class, mask = corners that are X (N=1 E=2 S=4 W=8); variant seeds the marks */
export function paintGround(x: Cls, mask: number, variant: number, name: string): { rgba: Uint8Array; w: number; h: number; ax: number; ay: number } {
  const cv = new Canvas();
  const cN = mask & 1 ? 1 : 0, cE = mask & 2 ? 1 : 0, cS = mask & 4 ? 1 : 0, cW = mask & 8 ? 1 : 0;
  const en = edgeN(x);
  const theta = x === 'R' ? 0.56 : x === 'A' ? 0.52 : 0.5;
  const alpha = new Float32Array(GW * GH);
  const dither = rng(hash(name));
  const pad = 1.1 / 36; // overlap neighbours by ~1px so seams never show
  for (let py = 0; py < GH; py++) for (let px = 0; px < GW; px++) {
    const i = py * GW + px;
    const [s, t] = st(px + 0.5, py + 0.5);
    if (s < -pad || s > 1 + pad || t < -pad || t > 1 + pad) continue;
    cv.a[i] = 255;
    const sc = Math.max(0, Math.min(1, s)), tc = Math.max(0, Math.min(1, t));
    // bilinear over corners: N(0,0) E(1,0) S(1,1) W(0,1)
    const f = cN * (1 - sc) * (1 - tc) + cE * sc * (1 - tc) + cS * sc * tc + cW * (1 - sc) * tc;
    let a = mask === 15 ? 1 : mask === 0 ? 0 : smooth(theta - 0.06, theta + 0.06, f + (en(s, t) - 0.5) * 0.42);
    alpha[i] = a;
    const P = ground('P', s, t), X = ground(x, s, t);
    let col = lerp3(P, X, a);
    if (mask !== 0 && mask !== 15) {
      // ink-wash rims along the boundary
      const rim = Math.exp(-(((a - 0.62) / 0.16) ** 2));
      if (x === 'A') col = lerp3(col, PAL.A.ink, rim * 0.45);
      else if (x === 'R') col = lerp3(col, PAL.R.lo, rim * 0.5);
      else if (x === 'G') col = lerp3(col, PAL.G.lo, rim * 0.35);
      else if (x === 'D') col = lerp3(col, PAL.D.hi, rim * 0.4);
      else if (x === 'S') col = lerp3(col, PAL.S.lo, rim * 0.5);
      // damp sand on the land side of water
      if (x === 'A') col = lerp3(col, hex('#c8bd9a'), Math.exp(-(((a - 0.3) / 0.15) ** 2)) * 0.35);
    }
    const d = (dither.next() - 0.5) * 5;
    cv.rgb[i * 3] = col[0] + d;
    cv.rgb[i * 3 + 1] = col[1] + d;
    cv.rgb[i * 3 + 2] = col[2] + d;
  }
  // marks: jittered grid of candidate spots inside the tile, away from the edges
  const r = rng(hash(`${name}:${variant}`));
  const n = 4;
  for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) {
    const s = 0.16 + (a + r.range(0.15, 0.85)) * (0.68 / n), t = 0.16 + (b + r.range(0.15, 0.85)) * (0.68 / n);
    const [px, py] = xy(s, t);
    const ia = Math.max(0, Math.min(GW * GH - 1, Math.round(py) * GW + Math.round(px)));
    const ax = alpha[ia];
    const cls: Cls = ax > 0.75 ? x : ax < 0.25 ? 'P' : 'P';
    if (ax >= 0.25 && ax <= 0.75) continue;
    const dens = cls === 'G' ? 0.55 : cls === 'A' ? 0.35 : cls === 'D' ? 0.3 : cls === 'S' ? 0.3 : cls === 'R' ? 0.35 : 0.22;
    if (!r.chance(dens)) {
      r.next();
      continue;
    }
    marks(cv, cls, r, s, t, 1);
  }
  const out = new Uint8Array(GW * GH * 4);
  for (let i = 0; i < GW * GH; i++) {
    if (!cv.a[i]) continue;
    out[i * 4] = Math.max(0, Math.min(255, Math.round(cv.rgb[i * 3])));
    out[i * 4 + 1] = Math.max(0, Math.min(255, Math.round(cv.rgb[i * 3 + 1])));
    out[i * 4 + 2] = Math.max(0, Math.min(255, Math.round(cv.rgb[i * 3 + 2])));
    out[i * 4 + 3] = 255;
  }
  return { rgba: out, w: GW, h: GH, ax: GAX, ay: GAY };
}

/** selection masks: a tinted diamond with a soft brushed rim */
export function paintMask(kind: 'movable' | 'fightable' | 'castable' | 'active') {
  const col = { movable: hex('#3f6fae'), fightable: hex('#c23a28'), castable: hex('#8a3fa0'), active: hex('#e0b23a') }[kind];
  const out = new Uint8Array(GW * GH * 4);
  for (let py = 0; py < GH; py++) for (let px = 0; px < GW; px++) {
    const [s, t] = st(px + 0.5, py + 0.5);
    const e = Math.min(s, 1 - s, t, 1 - t);
    if (e < 0.012) continue;
    const i = (py * GW + px) * 4;
    const rim = smooth(0.13, 0.03, e);
    const a = 0.5 + rim * 0.5;
    const c = lerp3(col, [255, 255, 255], (1 - rim) * 0.12);
    out[i] = c[0];
    out[i + 1] = c[1];
    out[i + 2] = c[2];
    out[i + 3] = Math.round(255 * a * Math.min(1, (e - 0.012) / 0.02));
  }
  return { rgba: out, w: GW, h: GH, ax: GAX, ay: GAY };
}
