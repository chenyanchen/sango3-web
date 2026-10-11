// Effect motifs (light/ink fields) shared by the effect painters. Each motif
// draws one animation frame at progress t ∈ [0, 1] with geometry fixed by a
// seed, so the frames of one sequence animate coherently.
import sharp from 'sharp';
import { blobPts, clamp, Cv, ease, Fld, hex, lerp, rng, smooth, spline, xform, type Pt, type Ramp, type Rng } from './_effects_kit.ts';

export const TAU = Math.PI * 2;

// ------------------------------------------------------------------ svg → raster
/** Rasterizes an SVG body (w×h) into an RGBA layer. */
export async function svgCv(w: number, h: number, body: string, defs = ''): Promise<Cv> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${defs ? `<defs>${defs}</defs>` : ''}${body}</svg>`;
  const { data, info } = await sharp(Buffer.from(svg), { density: 72 }).resize(w, h, { fit: 'fill' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return Cv.from(new Uint8Array(data.buffer, data.byteOffset, data.byteLength), info.width, info.height);
}
/** Rasterizes an SVG body into a scalar field (its alpha). */
export async function svgFld(w: number, h: number, body: string): Promise<Fld> {
  const cv = await svgCv(w, h, body);
  const f = new Fld(w, h);
  for (let i = 0; i < w * h; i++) f.v[i] = cv.c[i * 4 + 3];
  return f;
}

/** Adds a soft halo: blurred copy of the field scaled by k (for additive glows). */
export function halo(f: Fld, r: number, k = 0.5) {
  const g = f.clone().blur(r, 2).scale(k);
  for (let i = 0; i < f.v.length; i++) f.v[i] = Math.max(f.v[i], g.v[i]) + g.v[i] * 0.25;
  return f;
}

/**
 * Ink pooling (积墨): pigment gathers at the edges of a wash, so the rim is
 * denser than the middle. `k` = how much the interior is lightened.
 */
export function pool(f: Fld, r: number, k = 0.5) {
  const b = f.clone().blur(r, 2);
  for (let i = 0; i < f.v.length; i++) {
    const v = f.v[i];
    if (v <= 0) continue;
    const inner = Math.min(1, b.v[i] * 1.15);
    f.v[i] = v * (1 - k * inner * inner) + Math.max(0, v - b.v[i]) * k * 0.8;
  }
  return f;
}

/** Progressive erosion: noise-driven dissolve as `k` goes 0 → 1 (ink breaking up). */
export function erode(f: Fld, k: number, freq = 1.4, seed = 0) {
  if (k <= 0) return f;
  const { w, h } = f;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (f.v[i] <= 0) continue;
      const n = noiseAt(x * freq + seed * 37, y * freq + seed * 11);
      f.v[i] *= smooth(k - 0.15, k + 0.15, n * 1.1);
    }
  return f;
}
import { noise as noiseAt } from './_effects_kit.ts';

// ------------------------------------------------------------------ burst (explosions, impacts, blood)
export interface BurstOpt {
  /** max radius (px) */
  R: number;
  /** number of splash strokes */
  rays?: number;
  /** splatter dots */
  dots?: number;
  /** squash vertically (ground perspective) */
  sy?: number;
  /** extra upward drift of the cloud late in the animation */
  rise?: number;
  /** core heat multiplier */
  heat?: number;
  /** stroke width factor */
  thick?: number;
  /** cloud (billowy) instead of splash */
  cloud?: number;
}
/**
 * Ink burst: a hot core, splash strokes thrown outward, splatter dots, then
 * the whole splash dissolves. Returns a heat field (map with a ramp).
 */
export function burst(w: number, h: number, cx: number, cy: number, t: number, seed: string, o: BurstOpt): Fld {
  const r = rng(seed);
  const f = new Fld(w, h);
  const R = o.R, sy = o.sy ?? 0.85, heat = o.heat ?? 1, rays = o.rays ?? 9, dots = o.dots ?? 18, thick = o.thick ?? 1, cloud = o.cloud ?? 0;
  const grow = ease.out(clamp(t * 1.6));
  const decay = 1 - smooth(0.35, 1, t);
  const lift = (o.rise ?? 0) * t * R;
  // core flash
  const flash = Math.max(0, 1 - t * 3.2);
  if (flash > 0) f.dab(cx, cy, R * (0.25 + 0.35 * ease.out(t * 3)), heat * flash, { hard: 0.35 });
  // billow cloud lobes
  const lobes = cloud ? Math.round(6 + cloud * 6) : 4;
  for (let k = 0; k < lobes; k++) {
    const a = r.next() * TAU, d = r.range(0.1, 0.55) * R * grow;
    const rr = R * r.range(0.22, 0.42) * (0.4 + 0.6 * grow) * (cloud ? 1.1 : 0.8);
    f.dab(cx + Math.cos(a) * d, cy + Math.sin(a) * d * sy - lift, rr, (0.55 + 0.35 * r.next()) * decay * heat, { hard: 0.2, tex: 0.5, texF: 2.2 });
  }
  // splash strokes
  for (let k = 0; k < rays; k++) {
    const a = (k / rays) * TAU + r.range(-0.3, 0.3);
    const L = R * r.range(0.6, 1.05) * grow;
    const L0 = R * 0.12 * grow;
    const bend = r.range(-0.35, 0.35);
    const pts: Pt[] = [];
    for (let s = 0; s <= 4; s++) {
      const q = s / 4, d = L0 + (L - L0) * q, aa = a + bend * q * q;
      pts.push([cx + Math.cos(aa) * d, cy + Math.sin(aa) * d * sy - lift * q]);
    }
    f.stroke(pts, R * r.range(0.14, 0.26) * thick * (1 - 0.4 * t), decay * heat * r.range(0.7, 1), { taperIn: 0.05, taperOut: 0.7, dry: 0.3 + 0.6 * t, seed: k + 1, rag: 0.3 });
  }
  // splatter dots fly out
  for (let k = 0; k < dots; k++) {
    const a = r.next() * TAU, d = R * r.range(0.55, 1.25) * ease.out(clamp(t * 1.3));
    const s = R * r.range(0.025, 0.07) * (1 - 0.5 * t);
    f.dab(cx + Math.cos(a) * d, cy + Math.sin(a) * d * sy - lift + t * t * R * 0.15, s, decay * heat * 0.9, { hard: 0.6 });
  }
  erode(f, smooth(0.25, 1.05, t) * 0.95, 1.6, seedNum(seed));
  return f;
}
export const seedNum = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 997;
  return h;
};

// ------------------------------------------------------------------ flame
export interface FlameOpt {
  /** base width, height (px) */
  W: number;
  H: number;
  tongues?: number;
  /** 0..1 how much it leans/sways */
  sway?: number;
  heat?: number;
}
/**
 * Calligraphic flame: upward brush strokes (tongues) from a base point
 * (bx, by = bottom centre). `ph` animates the flicker (loopable over 0..1).
 */
export function flame(f: Fld, bx: number, by: number, ph: number, seed: string, o: FlameOpt) {
  const r = rng(seed);
  const n = o.tongues ?? 5, heat = o.heat ?? 1, sway = o.sway ?? 0.5;
  const P = ph * TAU;
  // body
  f.dab(bx, by - o.H * 0.2, o.W * 0.4, 0.6 * heat, { hard: 0.2, sy: 1.3, tex: 0.4, texF: 2 });
  for (let k = 0; k < n; k++) {
    const off = (k / Math.max(1, n - 1) - 0.5) * o.W * 0.7;
    const hk = o.H * (k === Math.floor(n / 2) ? 1 : r.range(0.45, 0.85)) * (0.85 + 0.15 * Math.sin(P * (k % 2 ? 1 : 2) + k * 1.7));
    const ph2 = r.next() * TAU;
    const pts: Pt[] = [];
    for (let s = 0; s <= 6; s++) {
      const q = s / 6;
      // S-curve that curls at the tip (火焰纹)
      const wob = Math.sin(P * 2 + q * 4.5 + ph2) * o.W * 0.2 * sway * q + Math.sin(q * 3.2 + ph2) * o.W * 0.12 * q * q;
      pts.push([bx + off * (1 - q * 0.8) + wob, by - o.H * 0.05 - hk * q]);
    }
    f.stroke(pts, o.W * r.range(0.22, 0.36) * (1 - 0.6 * Math.abs(off) / o.W), heat * r.range(0.7, 0.95), { taperIn: 0.12, taperOut: 0.9, dry: 0.3, seed: k + seedNum(seed), rag: 0.25, mode: 'max' });
  }
  // embers
  for (let k = 0; k < 3; k++) {
    const q = (ph + k / 3 + r.next() * 0.2) % 1;
    f.dab(bx + Math.sin(q * 9 + k) * o.W * 0.3, by - o.H * (0.6 + q * 0.6), Math.max(0.8, o.W * 0.05), heat * (1 - q), { hard: 0.5 });
  }
  return f;
}

// ------------------------------------------------------------------ lightning
/** Jagged dry-brush bolt from p0 to p1 with forks; returns the points of the trunk. */
export function bolt(f: Fld, p0: Pt, p1: Pt, r: Rng, o: { w: number; jag?: number; forks?: number; a?: number; dry?: number }): Pt[] {
  const n = Math.max(4, Math.round(Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) / 18));
  const jag = o.jag ?? 0.12;
  const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
  const nx = -(p1[1] - p0[1]) / (len || 1), ny = (p1[0] - p0[0]) / (len || 1);
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const q = i / n;
    const d = i === 0 || i === n ? 0 : r.gauss() * len * jag * 0.5;
    pts.push([lerp(p0[0], p1[0], q) + nx * d, lerp(p0[1], p1[1], q) + ny * d]);
  }
  const a = o.a ?? 1;
  f.stroke(pts, o.w, a, { taperIn: 0.05, taperOut: 0.25, dry: o.dry ?? 0.35, seed: r.int(0, 99), rag: 0.35, wfn: (t) => 0.55 + 0.45 * Math.sin(t * 9 + 1) ** 2 });
  for (let k = 0; k < (o.forks ?? 2); k++) {
    const i = r.int(1, n - 2);
    const s = pts[i];
    const L = len * r.range(0.12, 0.3);
    const ang = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]) + r.pick([-1, 1]) * r.range(0.4, 0.9);
    const q: Pt[] = [s];
    for (let j = 1; j <= 3; j++) q.push([s[0] + Math.cos(ang) * L * (j / 3) + r.gauss() * L * 0.08, s[1] + Math.sin(ang) * L * (j / 3) + r.gauss() * L * 0.08]);
    f.stroke(q, o.w * 0.5, a * 0.8, { taperIn: 0.02, taperOut: 0.8, dry: 0.4, seed: k + 40, rag: 0.3 });
  }
  return pts;
}

// ------------------------------------------------------------------ rings / arcs
/** Brushed elliptical ring (open arc from a0 to a1). */
export function arc(f: Fld, cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, w: number, a = 1, o: { dry?: number; seed?: number; rot?: number; taperIn?: number; taperOut?: number } = {}) {
  const n = Math.max(8, Math.ceil((Math.abs(a1 - a0) * Math.max(rx, ry)) / 6));
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = a0 + ((a1 - a0) * i) / n;
    pts.push([cx + Math.cos(t) * rx, cy + Math.sin(t) * ry]);
  }
  const P = o.rot ? xform(pts, cx, cy, o.rot) : pts;
  f.stroke(P, w, a, { taperIn: o.taperIn ?? 0.15, taperOut: o.taperOut ?? 0.4, dry: o.dry ?? 0.3, seed: o.seed ?? 3, rag: 0.2 });
  return f;
}

// ------------------------------------------------------------------ helpers for output
export type Out = { rgba: Uint8Array; w: number; h: number; ax: number; ay: number };
export const out = (cv: Cv, ax: number, ay: number): Out => ({ rgba: cv.rgba(), w: cv.w, h: cv.h, ax: Math.round(ax), ay: Math.round(ay) });

/** Field → ramp layer, with optional halo. */
export function lit(f: Fld, ramp: Ramp, glow = 0, glowK = 0.5) {
  if (glow > 0) halo(f, glow, glowK);
  return f.ramp(ramp);
}

/** Random splatter of ink dots around a point. */
export function splatter(f: Fld, cx: number, cy: number, R: number, n: number, r: Rng, a = 1, size = 0.05) {
  for (let k = 0; k < n; k++) {
    const ang = r.next() * TAU, d = R * Math.sqrt(r.next());
    f.dab(cx + Math.cos(ang) * d, cy + Math.sin(ang) * d, Math.max(0.7, R * size * r.range(0.4, 1.4)), a * r.range(0.6, 1), { hard: 0.55 });
  }
  return f;
}

/** Ink wash blob (rock, cloud, ink pool) as a polygon with textured interior. */
export function washBlob(f: Fld, cx: number, cy: number, rx: number, ry: number, r: Rng, a = 1, wob = 0.25, rot = 0) {
  f.poly(blobPts(cx, cy, rx, ry, r, wob, 12, rot), a);
  return f;
}

export { blobPts, clamp, Cv, ease, Fld, hex, lerp, rng, smooth, spline, xform, type Pt, type Ramp, type Rng };
