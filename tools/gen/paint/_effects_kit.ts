// Raster kit for the effect painters: scalar ink/heat fields and premultiplied
// RGBA layers, drawn directly into typed arrays (no SVG filters — thousands of
// frames must render in seconds). Fields are shaped with soft dabs, textured
// brush strokes and polygons, then mapped through colour ramps (fire: dark →
// vermilion → gamboge → pale gold; ink: wash grey → black).
import { rng, type Rng } from '../ink.ts';

export type RGB = [number, number, number];
export type Pt = [number, number];

export const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
export const clamp = (v: number, lo = 0, hi = 1) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};
export const ease = {
  out: (t: number) => 1 - (1 - t) * (1 - t),
  in: (t: number) => t * t,
  inout: (t: number) => (t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t)),
};

// ------------------------------------------------------------------ noise
const NS = 256;
let noiseTex: Float32Array | null = null;
/** Tileable fbm value noise, 256×256, computed once. */
function buildNoise() {
  const r = rng('effects-noise');
  const lat = (n: number) => {
    const g = new Float32Array(n * n);
    for (let i = 0; i < g.length; i++) g[i] = r.next();
    return g;
  };
  const out = new Float32Array(NS * NS);
  let amp = 1, tot = 0;
  for (const cells of [8, 16, 32, 64, 128]) {
    const g = lat(cells);
    const k = cells / NS;
    for (let y = 0; y < NS; y++)
      for (let x = 0; x < NS; x++) {
        const fx = x * k, fy = y * k;
        const x0 = Math.floor(fx), y0 = Math.floor(fy);
        let tx = fx - x0, ty = fy - y0;
        tx = tx * tx * (3 - 2 * tx);
        ty = ty * ty * (3 - 2 * ty);
        const a = g[(y0 % cells) * cells + (x0 % cells)], b = g[(y0 % cells) * cells + ((x0 + 1) % cells)];
        const c = g[((y0 + 1) % cells) * cells + (x0 % cells)], d = g[((y0 + 1) % cells) * cells + ((x0 + 1) % cells)];
        out[y * NS + x] += amp * lerp(lerp(a, b, tx), lerp(c, d, tx), ty);
      }
    tot += amp;
    amp *= 0.55;
  }
  // normalise to 0..1 with stretched contrast
  let lo = 1e9, hi = -1e9;
  for (let i = 0; i < out.length; i++) (lo = Math.min(lo, out[i])), (hi = Math.max(hi, out[i]));
  for (let i = 0; i < out.length; i++) out[i] = (out[i] - lo) / (hi - lo);
  void tot;
  return out;
}
/** fbm noise in [0,1]; period 256 px at unit frequency. */
export function noise(x: number, y: number) {
  const t = (noiseTex ??= buildNoise());
  const fx = ((x % NS) + NS) % NS, fy = ((y % NS) + NS) % NS;
  const x0 = fx | 0, y0 = fy | 0;
  const tx = fx - x0, ty = fy - y0;
  const x1 = (x0 + 1) & (NS - 1), y1 = (y0 + 1) & (NS - 1);
  const a = t[y0 * NS + x0], b = t[y0 * NS + x1], c = t[y1 * NS + x0], d = t[y1 * NS + x1];
  return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
}

// ------------------------------------------------------------------ scalar field
export type Mode = 'add' | 'max' | 'over' | 'sub' | 'mul';

/** Scalar field (ink density / heat), usually 0..1. */
export class Fld {
  v: Float32Array;
  constructor(public w: number, public h: number) {
    this.v = new Float32Array(Math.max(1, w * h));
  }
  private put(i: number, a: number, mode: Mode) {
    const v = this.v;
    switch (mode) {
      case 'add': v[i] += a; break;
      case 'max': if (a > v[i]) v[i] = a; break;
      case 'over': v[i] = v[i] + a * (1 - v[i]); break;
      case 'sub': v[i] = Math.max(0, v[i] - a); break;
      case 'mul': v[i] *= 1 - a; break;
    }
  }
  /**
   * Soft elliptical dab. `hard` = fraction of the radius at full strength.
   * `sx/sy` stretch, `rot` rotation (radians).
   */
  dab(x: number, y: number, r: number, a = 1, o: { hard?: number; sx?: number; sy?: number; rot?: number; mode?: Mode; tex?: number; texF?: number } = {}) {
    if (r <= 0.05 || a <= 0) return this;
    const hard = o.hard ?? 0.3, sx = o.sx ?? 1, sy = o.sy ?? 1, rot = o.rot ?? 0, mode = o.mode ?? 'over';
    const tex = o.tex ?? 0, texF = o.texF ?? 1;
    const R = r * Math.max(sx, sy) + 1;
    const x0 = Math.max(0, Math.floor(x - R)), x1 = Math.min(this.w - 1, Math.ceil(x + R));
    const y0 = Math.max(0, Math.floor(y - R)), y1 = Math.min(this.h - 1, Math.ceil(y + R));
    const c = Math.cos(rot), s = Math.sin(rot);
    for (let py = y0; py <= y1; py++)
      for (let px = x0; px <= x1; px++) {
        const dx = px + 0.5 - x, dy = py + 0.5 - y;
        const u = (dx * c + dy * s) / (r * sx), w = (-dx * s + dy * c) / (r * sy);
        let d = Math.sqrt(u * u + w * w);
        if (tex) d *= 1 + tex * (noise(px * texF + 31, py * texF + 17) - 0.5) * 2;
        if (d >= 1) continue;
        const k = d <= hard ? 1 : 1 - smooth(hard, 1, d);
        this.put(py * this.w + px, a * k, mode);
      }
    return this;
  }
  /**
   * Brush stroke along a polyline: tapered width, ragged edges, optional
   * dry-brush bristle streaks (飞白). `w` = max width (px).
   */
  stroke(pts: Pt[], w: number, a = 1, o: { taperIn?: number; taperOut?: number; dry?: number; rag?: number; seed?: number; mode?: Mode; soft?: number; wfn?: (t: number) => number; afn?: (t: number) => number; bristle?: number } = {}) {
    const P = densify(pts, 2);
    if (P.length < 2) return this;
    const tin = o.taperIn ?? 0.15, tout = o.taperOut ?? 0.35, dry = o.dry ?? 0, rag = o.rag ?? 0.25, mode = o.mode ?? 'over';
    const soft = o.soft ?? 1, seed = o.seed ?? 0, bristle = o.bristle ?? 0.35;
    // cumulative length
    const L = [0];
    for (let i = 1; i < P.length; i++) L.push(L[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
    const total = L[L.length - 1] || 1;
    const hwAt = (t: number) => {
      const press = Math.min(1, t / Math.max(1e-3, tin), (1 - t) / Math.max(1e-3, tout));
      return (w / 2) * (o.wfn ? o.wfn(t) : 0.2 + 0.8 * Math.sqrt(Math.max(0, press)));
    };
    // per-pixel nearest (dist², u, v-sign)
    let bx0 = 1e9, by0 = 1e9, bx1 = -1e9, by1 = -1e9;
    const pad = w / 2 + 3;
    for (const p of P) (bx0 = Math.min(bx0, p[0])), (by0 = Math.min(by0, p[1])), (bx1 = Math.max(bx1, p[0])), (by1 = Math.max(by1, p[1]));
    const X0 = Math.max(0, Math.floor(bx0 - pad)), X1 = Math.min(this.w - 1, Math.ceil(bx1 + pad));
    const Y0 = Math.max(0, Math.floor(by0 - pad)), Y1 = Math.min(this.h - 1, Math.ceil(by1 + pad));
    if (X1 < X0 || Y1 < Y0) return this;
    const BW = X1 - X0 + 1, BH = Y1 - Y0 + 1;
    const D = new Float32Array(BW * BH).fill(1e12), U = new Float32Array(BW * BH), V = new Float32Array(BW * BH);
    for (let i = 0; i < P.length - 1; i++) {
      const [ax, ay] = P[i], [bx, by] = P[i + 1];
      const hw = Math.max(hwAt(L[i] / total), hwAt(L[i + 1] / total)) * (1 + rag) + 2;
      const sx0 = Math.max(X0, Math.floor(Math.min(ax, bx) - hw)), sx1 = Math.min(X1, Math.ceil(Math.max(ax, bx) + hw));
      const sy0 = Math.max(Y0, Math.floor(Math.min(ay, by) - hw)), sy1 = Math.min(Y1, Math.ceil(Math.max(ay, by) + hw));
      const ex = bx - ax, ey = by - ay, el = ex * ex + ey * ey || 1e-6, len = Math.sqrt(el);
      for (let py = sy0; py <= sy1; py++)
        for (let px = sx0; px <= sx1; px++) {
          const qx = px + 0.5 - ax, qy = py + 0.5 - ay;
          let t = (qx * ex + qy * ey) / el;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const dx = qx - ex * t, dy = qy - ey * t;
          const d2 = dx * dx + dy * dy;
          const k = (py - Y0) * BW + (px - X0);
          if (d2 < D[k]) {
            D[k] = d2;
            U[k] = L[i] + t * len;
            V[k] = (ex * qy - ey * qx) >= 0 ? 1 : -1;
          }
        }
    }
    for (let py = Y0; py <= Y1; py++)
      for (let px = X0; px <= X1; px++) {
        const k = (py - Y0) * BW + (px - X0);
        if (D[k] >= 1e11) continue;
        const u = U[k], t = u / total;
        const d = Math.sqrt(D[k]);
        let hw = hwAt(t);
        const side = V[k];
        hw *= 1 + rag * (noise(u * 0.09 + seed * 13.7, side * 40 + seed) - 0.5) * 2;
        if (d > hw + 1) continue;
        let cov = clamp((hw - d) / soft + 0.5);
        if (dry > 0) {
          // bristle streaks run along the stroke; dryer toward the end
          const vn = (side * d) / Math.max(1, hw);
          const br = noise(u * 0.012 + seed * 7.1, vn * 9 + seed * 3.3 + 50);
          const thr = dry * (0.25 + 0.75 * t) * bristle * 2.2;
          cov *= smooth(thr - 0.08, thr + 0.08, br);
        }
        const af = o.afn ? o.afn(t) : 1;
        if (cov > 0) this.put(py * this.w + px, a * cov * af, mode);
      }
    return this;
  }
  /** Filled polygon (non-zero), 4× supersampled edges. */
  poly(pts: Pt[], a = 1, mode: Mode = 'over') {
    if (pts.length < 3) return this;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const p of pts) (x0 = Math.min(x0, p[0])), (y0 = Math.min(y0, p[1])), (x1 = Math.max(x1, p[0])), (y1 = Math.max(y1, p[1]));
    const X0 = Math.max(0, Math.floor(x0)), X1 = Math.min(this.w - 1, Math.ceil(x1));
    const Y0 = Math.max(0, Math.floor(y0)), Y1 = Math.min(this.h - 1, Math.ceil(y1));
    const n = pts.length;
    const SS = [0.25, 0.75];
    for (let py = Y0; py <= Y1; py++) {
      // crossing lists for the two sub-scanlines
      const rows = SS.map((o) => {
        const yy = py + o;
        const xs: [number, number][] = [];
        for (let i = 0; i < n; i++) {
          const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % n];
          if ((ay <= yy && by > yy) || (by <= yy && ay > yy)) xs.push([ax + ((yy - ay) / (by - ay)) * (bx - ax), by > ay ? 1 : -1]);
        }
        return xs.sort((p, q) => p[0] - q[0]);
      });
      for (let px = X0; px <= X1; px++) {
        let cov = 0;
        for (const xs of rows)
          for (const ox of SS) {
            const xx = px + ox;
            let wn = 0;
            for (const [cx, dir] of xs) if (cx < xx) wn += dir;
            if (wn !== 0) cov += 0.25;
          }
        if (cov > 0) this.put(py * this.w + px, a * cov, mode);
      }
    }
    return this;
  }
  /** Separable box blur, `passes` times (≈ gaussian). */
  blur(r: number, passes = 2) {
    r = Math.round(r);
    if (r < 1) return this;
    const { w, h } = this;
    const tmp = new Float32Array(Math.max(w, h));
    for (let p = 0; p < passes; p++) {
      for (let y = 0; y < h; y++) {
        let acc = 0;
        const row = y * w;
        for (let x = -r; x <= r; x++) acc += this.v[row + clampI(x, w)];
        for (let x = 0; x < w; x++) {
          tmp[x] = acc / (2 * r + 1);
          acc += this.v[row + clampI(x + r + 1, w)] - this.v[row + clampI(x - r, w)];
        }
        this.v.set(tmp.subarray(0, w), row);
      }
      for (let x = 0; x < w; x++) {
        let acc = 0;
        for (let y = -r; y <= r; y++) acc += this.v[clampI(y, h) * w + x];
        for (let y = 0; y < h; y++) {
          tmp[y] = acc / (2 * r + 1);
          acc += this.v[clampI(y + r + 1, h) * w + x] - this.v[clampI(y - r, h) * w + x];
        }
        for (let y = 0; y < h; y++) this.v[y * w + x] = tmp[y];
      }
    }
    return this;
  }
  /** Multiplies by fbm noise remapped to [lo, hi] (wash texture). */
  tex(f: number, lo: number, hi: number, ox = 0, oy = 0) {
    const { w, h } = this;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (this.v[i] > 0) this.v[i] *= lo + (hi - lo) * noise(x * f + ox, y * f + oy);
      }
    return this;
  }
  /** Contrast curve: v → smooth(e0, e1, v) (ink pooling / hard flame edge). */
  curve(e0: number, e1: number) {
    for (let i = 0; i < this.v.length; i++) this.v[i] = smooth(e0, e1, this.v[i]);
    return this;
  }
  scale(k: number) {
    for (let i = 0; i < this.v.length; i++) this.v[i] *= k;
    return this;
  }
  /** Adds another field (offset). */
  addF(f: Fld, k = 1, dx = 0, dy = 0) {
    for (let y = 0; y < f.h; y++)
      for (let x = 0; x < f.w; x++) {
        const X = x + dx, Y = y + dy;
        if (X < 0 || Y < 0 || X >= this.w || Y >= this.h) continue;
        this.v[Y * this.w + X] += f.v[y * f.w + x] * k;
      }
    return this;
  }
  clone() {
    const f = new Fld(this.w, this.h);
    f.v.set(this.v);
    return f;
  }
  /** Maps through a colour ramp into a new RGBA layer. */
  ramp(stops: Ramp, alphaK = 1) {
    const cv = new Cv(this.w, this.h);
    const lut = rampLut(stops);
    for (let i = 0; i < this.v.length; i++) {
      const v = this.v[i];
      if (v <= 0.002) continue;
      const k = Math.min(255, Math.floor(clamp(v) * 255)) * 4;
      const a = lut[k + 3] * alphaK;
      cv.c[i * 4] = lut[k] * a;
      cv.c[i * 4 + 1] = lut[k + 1] * a;
      cv.c[i * 4 + 2] = lut[k + 2] * a;
      cv.c[i * 4 + 3] = a;
    }
    return cv;
  }
  /** Flat colour with the field as alpha. */
  color(c: RGB, alphaK = 1) {
    const cv = new Cv(this.w, this.h);
    for (let i = 0; i < this.v.length; i++) {
      const a = clamp(this.v[i] * alphaK);
      if (a <= 0) continue;
      cv.c[i * 4] = c[0] * a;
      cv.c[i * 4 + 1] = c[1] * a;
      cv.c[i * 4 + 2] = c[2] * a;
      cv.c[i * 4 + 3] = a;
    }
    return cv;
  }
}
const clampI = (i: number, n: number) => (i < 0 ? 0 : i >= n ? n - 1 : i);

/** Colour ramp stops: [t, '#rrggbb', alpha]. */
export type Ramp = [number, string, number][];
const lutCache = new Map<Ramp, Float32Array>();
function rampLut(stops: Ramp) {
  let l = lutCache.get(stops);
  if (l) return l;
  l = new Float32Array(256 * 4);
  const S = stops.map(([t, c, a]) => [t, ...hex(c), a] as const);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let j = 0;
    while (j < S.length - 2 && t > S[j + 1][0]) j++;
    const A = S[j], B = S[Math.min(S.length - 1, j + 1)];
    const k = B[0] === A[0] ? 0 : clamp((t - A[0]) / (B[0] - A[0]));
    for (let c = 0; c < 4; c++) l[i * 4 + c] = lerp(A[1 + c], B[1 + c], k);
  }
  lutCache.set(stops, l);
  return l;
}

// ------------------------------------------------------------------ RGBA layer
/** Premultiplied RGBA float layer. */
export class Cv {
  c: Float32Array;
  constructor(public w: number, public h: number) {
    this.c = new Float32Array(Math.max(1, w * h) * 4);
  }
  /** Composites `o` on top (offset dx, dy). mode 'over' = normal, 'add' = light (alpha union). */
  draw(o: Cv, dx = 0, dy = 0, mode: 'over' | 'add' | 'under' = 'over', k = 1) {
    for (let y = 0; y < o.h; y++) {
      const Y = y + dy;
      if (Y < 0 || Y >= this.h) continue;
      for (let x = 0; x < o.w; x++) {
        const X = x + dx;
        if (X < 0 || X >= this.w) continue;
        const s = (y * o.w + x) * 4, d = (Y * this.w + X) * 4;
        const sa = o.c[s + 3] * k;
        if (sa <= 0) continue;
        if (mode === 'over') {
          const ia = 1 - sa;
          for (let c = 0; c < 3; c++) this.c[d + c] = o.c[s + c] * k + this.c[d + c] * ia;
          this.c[d + 3] = sa + this.c[d + 3] * ia;
        } else if (mode === 'under') {
          const ia = 1 - this.c[d + 3];
          for (let c = 0; c < 3; c++) this.c[d + c] += o.c[s + c] * k * ia;
          this.c[d + 3] += sa * ia;
        } else {
          for (let c = 0; c < 3; c++) this.c[d + c] = Math.min(1, this.c[d + c] + o.c[s + c] * k);
          this.c[d + 3] = Math.min(1, this.c[d + 3] + sa * (1 - this.c[d + 3]));
        }
      }
    }
    return this;
  }
  /** Fills with colour `col` where field `f` > 0 (normal over). */
  paint(f: Fld, col: RGB | string, k = 1) {
    return this.draw(f.color(typeof col === 'string' ? hex(col) : col, k));
  }
  /** Multiplies alpha (and colour) by (1 - f) — erase. */
  erase(f: Fld, k = 1) {
    for (let i = 0; i < f.v.length; i++) {
      const m = 1 - clamp(f.v[i] * k);
      if (m >= 1) continue;
      for (let c = 0; c < 4; c++) this.c[i * 4 + c] *= m;
    }
    return this;
  }
  /** Multiplies colour+alpha by a global factor (fade). */
  fade(k: number) {
    if (k >= 1) return this;
    for (let i = 0; i < this.c.length; i++) this.c[i] *= k;
    return this;
  }
  /** Straight-alpha 8-bit output. */
  rgba() {
    const out = new Uint8Array(this.w * this.h * 4);
    for (let i = 0; i < this.w * this.h; i++) {
      const a = this.c[i * 4 + 3];
      if (a <= 1 / 512) continue;
      for (let c = 0; c < 3; c++) out[i * 4 + c] = Math.round(clamp(this.c[i * 4 + c] / a) * 255);
      out[i * 4 + 3] = Math.round(clamp(a) * 255);
    }
    return out;
  }
  /** Imports straight-alpha RGBA8 (e.g. a rasterized SVG). */
  static from(rgba: Uint8Array, w: number, h: number) {
    const cv = new Cv(w, h);
    for (let i = 0; i < w * h; i++) {
      const a = rgba[i * 4 + 3] / 255;
      for (let c = 0; c < 3; c++) cv.c[i * 4 + c] = (rgba[i * 4 + c] / 255) * a;
      cv.c[i * 4 + 3] = a;
    }
    return cv;
  }
}

/** Scales a layer (bilinear) — figures in effect dirs are sometimes drawn larger. */
export function scaled(src: Cv, k: number): Cv {
  if (Math.abs(k - 1) < 0.01) return src;
  const W = Math.max(1, Math.round(src.w * k)), H = Math.max(1, Math.round(src.h * k));
  const o = new Cv(W, H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const fx = Math.min(src.w - 1.001, Math.max(0, (x + 0.5) / k - 0.5)), fy = Math.min(src.h - 1.001, Math.max(0, (y + 0.5) / k - 0.5));
      const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
      for (let c = 0; c < 4; c++) {
        const a = src.c[(y0 * src.w + x0) * 4 + c], b = src.c[(y0 * src.w + x0 + 1) * 4 + c];
        const d = src.c[((y0 + 1) * src.w + x0) * 4 + c], e = src.c[((y0 + 1) * src.w + x0 + 1) * 4 + c];
        o.c[(y * W + x) * 4 + c] = (a + (b - a) * tx) * (1 - ty) + (d + (e - d) * tx) * ty;
      }
    }
  return o;
}


// ------------------------------------------------------------------ geometry
/** Resamples a polyline so no segment is longer than `step`. */
export function densify(pts: Pt[], step: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [a, b] = [pts[i], pts[i + 1]];
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    for (let k = 0; k < n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  if (pts.length) out.push(pts[pts.length - 1]);
  return out;
}

/** Catmull-Rom spline through the points (open), `per` samples per span. */
export function spline(pts: Pt[], per = 8): Pt[] {
  if (pts.length < 3) return pts;
  const P = [pts[0], ...pts, pts[pts.length - 1]];
  const out: Pt[] = [];
  for (let i = 1; i < P.length - 2; i++) {
    const [p0, p1, p2, p3] = [P[i - 1], P[i], P[i + 1], P[i + 2]];
    for (let k = 0; k < per; k++) {
      const t = k / per, t2 = t * t, t3 = t2 * t;
      out.push([
        0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/** Wobbly closed outline around (cx, cy). */
export function blobPts(cx: number, cy: number, rx: number, ry: number, r: Rng, wob = 0.2, n = 14, rot = 0): Pt[] {
  const ph = r.next() * Math.PI * 2;
  const ks = Array.from({ length: n }, () => 1 + r.gauss() * wob * 0.5);
  const raw: Pt[] = ks.map((k, i) => {
    const a = ph + (i / n) * Math.PI * 2;
    const x = Math.cos(a) * rx * k, y = Math.sin(a) * ry * k;
    return [cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot)];
  });
  // closed spline
  const P = [...raw, raw[0], raw[1], raw[2]];
  const sm = spline(P, 4);
  return sm.slice(0, n * 4);
}

/** Rotates/scales points about a centre. */
export function xform(pts: Pt[], cx: number, cy: number, rot: number, s = 1, tx = cx, ty = cy): Pt[] {
  const c = Math.cos(rot) * s, sn = Math.sin(rot) * s;
  return pts.map(([x, y]) => [tx + (x - cx) * c - (y - cy) * sn, ty + (x - cx) * sn + (y - cy) * c]);
}

export { rng, type Rng };

// ------------------------------------------------------------------ palettes (ramps)
/** Fire under additive blending: no dark ink (it would vanish) — ember red → vermilion → gamboge → pale gold. */
export const FIRE: Ramp = [
  [0, '#5a0d04', 0],
  [0.18, '#8a1a08', 0.55],
  [0.4, '#c8401a', 0.9],
  [0.65, '#e88a2a', 1],
  [0.85, '#f6c860', 1],
  [1, '#fff3cf', 1],
];
/** Cool azure light (water/ice/lightning glow). */
export const AZURE: Ramp = [
  [0, '#0a1a3a', 0],
  [0.25, '#1d3f78', 0.6],
  [0.5, '#3f78b8', 0.9],
  [0.75, '#8fc0e8', 1],
  [1, '#f2fbff', 1],
];
export const VIOLET: Ramp = [
  [0, '#1a0a3a', 0],
  [0.25, '#3a1d78', 0.6],
  [0.5, '#7048c0', 0.9],
  [0.78, '#c0a8f0', 1],
  [1, '#fbf6ff', 1],
];
export const GOLD: Ramp = [
  [0, '#3a2a08', 0],
  [0.25, '#7a5a14', 0.6],
  [0.55, '#c9a24a', 0.95],
  [0.8, '#f0d890', 1],
  [1, '#fffbe8', 1],
];
export const JADE: Ramp = [
  [0, '#08281a', 0],
  [0.25, '#1d5a3a', 0.6],
  [0.55, '#4f9a6a', 0.95],
  [0.8, '#a8e0b8', 1],
  [1, '#f4fff6', 1],
];
export const CRIMSON: Ramp = [
  [0, '#300408', 0],
  [0.3, '#6a0c14', 0.7],
  [0.6, '#a81c24', 0.95],
  [0.85, '#d8503a', 1],
  [1, '#f8a080', 1],
];
/** Ink on paper (normal blending): pale wash → black. */
export const INK: Ramp = [
  [0, '#6b6255', 0],
  [0.15, '#6b6255', 0.35],
  [0.45, '#3b342b', 0.75],
  [0.75, '#1b1712', 0.95],
  [1, '#0e0b08', 1],
];
/** Pale mist/dust that reads both normal and additive (warm grey). */
export const DUST: Ramp = [
  [0, '#8a7a60', 0],
  [0.4, '#a89878', 0.45],
  [1, '#d8ccb0', 0.8],
];
