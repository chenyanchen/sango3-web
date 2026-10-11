// Small DSP kit for the audio generators: seeded rng, filters, envelopes,
// oscillators, Karplus-Strong strings, a feedback-delay-network reverb and a
// mastering limiter. Everything works on Float32Arrays in place; no per-sample
// allocations.

export const TAU = Math.PI * 2;

/** mulberry32: deterministic, fast. */
export function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (lo: number, hi: number) => lo + (hi - lo) * next(),
    int: (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1)),
    chance: (p: number) => next() < p,
    pick: <T>(a: readonly T[]): T => a[Math.floor(next() * a.length)],
    /** roughly normal, mean 0, sd 1 */
    gauss: () => (next() + next() + next() + next() - 2) * 1.732,
  };
}
export type Rng = ReturnType<typeof rng>;

export function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
export const db = (d: number) => Math.pow(10, d / 20);
export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

// ------------------------------------------------------------------ filters
/** RBJ biquad. Use `tick` per sample or `run` over a buffer. Coefficients may be changed on the fly. */
export class Biquad {
  b0 = 1; b1 = 0; b2 = 0; a1 = 0; a2 = 0;
  private x1 = 0; private x2 = 0; private y1 = 0; private y2 = 0;
  constructor(public rate: number) {}
  private set(b0: number, b1: number, b2: number, a0: number, a1: number, a2: number) {
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = a1 / a0; this.a2 = a2 / a0;
    return this;
  }
  lp(f: number, q = 0.707) {
    const w = (TAU * Math.min(f, this.rate * 0.49)) / this.rate, c = Math.cos(w), al = Math.sin(w) / (2 * q);
    return this.set((1 - c) / 2, 1 - c, (1 - c) / 2, 1 + al, -2 * c, 1 - al);
  }
  hp(f: number, q = 0.707) {
    const w = (TAU * Math.min(f, this.rate * 0.49)) / this.rate, c = Math.cos(w), al = Math.sin(w) / (2 * q);
    return this.set((1 + c) / 2, -(1 + c), (1 + c) / 2, 1 + al, -2 * c, 1 - al);
  }
  /** band-pass, constant 0 dB peak gain */
  bp(f: number, q = 1) {
    const w = (TAU * Math.min(f, this.rate * 0.49)) / this.rate, c = Math.cos(w), al = Math.sin(w) / (2 * q);
    return this.set(al, 0, -al, 1 + al, -2 * c, 1 - al);
  }
  peak(f: number, q: number, gainDb: number) {
    const A = Math.pow(10, gainDb / 40), w = (TAU * Math.min(f, this.rate * 0.49)) / this.rate, c = Math.cos(w), al = Math.sin(w) / (2 * q);
    return this.set(1 + al * A, -2 * c, 1 - al * A, 1 + al / A, -2 * c, 1 - al / A);
  }
  lowshelf(f: number, gainDb: number) {
    const A = Math.pow(10, gainDb / 40), w = (TAU * f) / this.rate, c = Math.cos(w), s = Math.sin(w), al = (s / 2) * Math.SQRT2, r = 2 * Math.sqrt(A) * al;
    return this.set(A * (A + 1 - (A - 1) * c + r), 2 * A * (A - 1 - (A + 1) * c), A * (A + 1 - (A - 1) * c - r), A + 1 + (A - 1) * c + r, -2 * (A - 1 + (A + 1) * c), A + 1 + (A - 1) * c - r);
  }
  tick(x: number) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
    return y;
  }
  run(buf: Float32Array, from = 0, to = buf.length) {
    for (let i = from; i < to; i++) buf[i] = this.tick(buf[i]);
    return buf;
  }
  reset() {
    this.x1 = this.x2 = this.y1 = this.y2 = 0;
    return this;
  }
}

/** One-pole low-pass (smoother). */
export class OnePole {
  y = 0;
  k: number;
  constructor(rate: number, f: number) {
    this.k = 1 - Math.exp((-TAU * f) / rate);
  }
  setF(rate: number, f: number) {
    this.k = 1 - Math.exp((-TAU * f) / rate);
  }
  tick(x: number) {
    return (this.y += this.k * (x - this.y));
  }
}

// ------------------------------------------------------------------ buffers
export const buf = (rate: number, sec: number) => new Float32Array(Math.max(1, Math.round(rate * sec)));

export function mixInto(dst: Float32Array, src: Float32Array, at: number, gain = 1) {
  const o = Math.round(at);
  const from = Math.max(0, -o), to = Math.min(src.length, dst.length - o);
  for (let i = from; i < to; i++) dst[o + i] += src[i] * gain;
}

export function peak(b: Float32Array) {
  let p = 0;
  for (let i = 0; i < b.length; i++) {
    const v = Math.abs(b[i]);
    if (v > p) p = v;
  }
  return p;
}
export function rms(b: Float32Array) {
  let s = 0;
  for (let i = 0; i < b.length; i++) s += b[i] * b[i];
  return Math.sqrt(s / Math.max(1, b.length));
}
export function normalize(b: Float32Array, to = 0.89) {
  const p = peak(b);
  if (p > 0) for (let i = 0; i < b.length; i++) b[i] *= to / p;
  return b;
}
/** short fades so one-shots start and end on zero (no clicks). */
export function fadeEdges(b: Float32Array, rate: number, inMs = 1.5, outMs = 12) {
  const fi = Math.min(b.length, Math.round((rate * inMs) / 1000)), fo = Math.min(b.length, Math.round((rate * outMs) / 1000));
  for (let i = 0; i < fi; i++) b[i] *= i / fi;
  for (let i = 0; i < fo; i++) b[b.length - 1 - i] *= i / fo;
  return b;
}
/** Trim trailing near-silence (keeps a short tail). */
export function trimTail(b: Float32Array, rate: number, thr = 0.0008) {
  let end = b.length;
  while (end > 1 && Math.abs(b[end - 1]) < thr) end--;
  end = Math.min(b.length, end + Math.round(rate * 0.01));
  return b.subarray(0, end).slice();
}

// ------------------------------------------------------------------ sources
export function noise(r: Rng, b: Float32Array, gain = 1) {
  for (let i = 0; i < b.length; i++) b[i] += (r.next() * 2 - 1) * gain;
  return b;
}

/** Exponential decay envelope multiplied in place: attack (s) then decay to -60 dB over t60 (s). */
export function envAD(b: Float32Array, rate: number, att: number, t60: number, from = 0) {
  const na = Math.max(1, Math.round(att * rate));
  const k = Math.exp(-6.9 / Math.max(1, t60 * rate));
  let g = 1;
  for (let i = from; i < b.length; i++) {
    const j = i - from;
    if (j < na) b[i] *= j / na;
    else {
      b[i] *= g;
      g *= k;
    }
  }
  return b;
}

/** Sine partial bank: sum of decaying partials (bells, gongs, drums). */
export interface Partial {
  f: number;
  a: number;
  t60: number;
  /** pitch glide: frequency multiplier reached after `gt` seconds (exponential) */
  g?: number;
  gt?: number;
  ph?: number;
}
export function partials(b: Float32Array, rate: number, ps: Partial[], at = 0, att = 0.002) {
  const o = Math.round(at * rate);
  const na = Math.max(1, Math.round(att * rate));
  for (const p of ps) {
    if (p.f >= rate * 0.48) continue;
    let ph = p.ph ?? 0;
    let amp = p.a;
    const k = Math.exp(-6.9 / (p.t60 * rate));
    const n = Math.min(b.length - o, Math.round(p.t60 * rate * 1.05));
    const gk = p.g && p.g !== 1 ? Math.pow(p.g, 1 / ((p.gt ?? 0.2) * rate)) : 1;
    let f = p.f;
    const gEnd = p.g ? p.f * p.g : p.f;
    for (let i = 0; i < n; i++) {
      const e = i < na ? i / na : 1;
      b[o + i] += Math.sin(ph) * amp * e;
      ph += (TAU * f) / rate;
      amp *= k;
      if (gk !== 1 && (gk > 1 ? f < gEnd : f > gEnd)) f *= gk;
    }
  }
  return b;
}

/** Band-limited sawtooth step (polyBLEP correction). */
export function blep(t: number, dt: number) {
  if (t < dt) {
    t /= dt;
    return t + t - t * t - 1;
  }
  if (t > 1 - dt) {
    t = (t - 1) / dt;
    return t * t + t + t + 1;
  }
  return 0;
}

// ------------------------------------------------------------------ Karplus-Strong
export interface PluckOpts {
  /** seconds rendered */
  dur: number;
  /** loss per period (0..1, closer to 1 = longer sustain) */
  sustain?: number;
  /** loop lowpass mix (0 = bright, 1 = dull) */
  damp?: number;
  /** excitation brightness (lowpass cutoff in Hz) */
  bright?: number;
  /** pluck position (0..0.5): comb on the excitation */
  pos?: number;
  /** pitch bend: multiplier and when (s) and how long (s) */
  bend?: { to: number; at: number; len: number };
  /** vibrato depth (ratio) and rate (Hz), starting after `at` s */
  vib?: { depth: number; rate: number; at: number };
}
/** A plucked string (fractional delay via linear interpolation, so bends work). */
export function pluck(rate: number, f: number, r: Rng, o: PluckOpts): Float32Array {
  const n = Math.round(o.dur * rate);
  const out = new Float32Array(n);
  const maxD = Math.ceil(rate / Math.max(20, f * Math.min(1, o.bend?.to ?? 1)) * 1.1) + 4;
  const size = 1 << Math.ceil(Math.log2(maxD + 2));
  const mask = size - 1;
  const line = new Float32Array(size);
  const P = rate / f;
  // excitation: filtered noise, pick-position comb
  const exLen = Math.max(2, Math.floor(P));
  const ex = new Float32Array(exLen);
  const lp = new OnePole(rate, o.bright ?? 6000);
  for (let i = 0; i < exLen; i++) ex[i] = lp.tick(r.next() * 2 - 1);
  const pos = Math.max(1, Math.floor(exLen * (o.pos ?? 0.13)));
  let mean = 0;
  for (let i = 0; i < exLen; i++) {
    const v = ex[i] - (i >= pos ? ex[i - pos] * 0.9 : 0);
    line[i] = v;
    mean += v;
  }
  mean /= exLen;
  for (let i = 0; i < exLen; i++) line[i] -= mean;
  let w = exLen;
  const loss = o.sustain ?? 0.996;
  const damp = o.damp ?? 0.5;
  let prev = 0;
  const bend = o.bend, vib = o.vib;
  const bs = bend ? Math.round(bend.at * rate) : 0, bl = bend ? Math.max(1, Math.round(bend.len * rate)) : 1;
  let dc = 0;
  for (let i = 0; i < n; i++) {
    let d = P;
    if (bend && i > bs) d = P / (1 + (bend.to - 1) * Math.min(1, (i - bs) / bl));
    if (vib && i > vib.at * rate) d /= 1 + vib.depth * Math.sin((TAU * vib.rate * (i - vib.at * rate)) / rate);
    const rp = w - d;
    const ri = Math.floor(rp), fr = rp - ri;
    const a = line[ri & mask], b = line[(ri + 1) & mask];
    const y = a + (b - a) * fr;
    // loop filter: averaging lowpass + loss
    const v = (y * (1 - damp * 0.5) + prev * damp * 0.5) * loss;
    prev = y;
    line[w & mask] = v;
    w++;
    dc += 0.001 * (y - dc);
    out[i] = y - dc;
  }
  return out;
}

// ------------------------------------------------------------------ reverb
/**
 * 8-line feedback delay network with a Householder matrix and damping.
 * In: mono send. Out: added to stereo L/R. `t60` in seconds.
 */
export function reverb(rate: number, send: Float32Array, L: Float32Array, R: Float32Array, o: { t60?: number; damp?: number; wet?: number; pre?: number } = {}) {
  const t60 = o.t60 ?? 2.2, wet = o.wet ?? 1;
  const lens = [1031, 1327, 1523, 1801, 2063, 2333, 2621, 2927].map((x) => Math.round((x * rate) / 44100));
  const lines = lens.map((l) => new Float32Array(l));
  const idx = new Int32Array(8);
  const g = lens.map((l) => Math.pow(10, (-3 * l) / (t60 * rate)));
  const lpk = 1 - Math.exp((-TAU * (o.damp ?? 5000)) / rate);
  const lpz = new Float64Array(8);
  const pre = Math.round((o.pre ?? 0.02) * rate);
  // input diffusion: two allpasses
  const ap = [Math.round(0.0047 * rate), Math.round(0.0127 * rate)].map((l) => ({ b: new Float32Array(l), i: 0 }));
  const y = new Float64Array(8);
  const n = Math.min(send.length, L.length);
  for (let t = 0; t < n; t++) {
    let x = t >= pre ? send[t - pre] : 0;
    for (const a of ap) {
      const d = a.b[a.i];
      const v = x + d * 0.6;
      a.b[a.i] = v;
      x = d - v * 0.6;
      a.i = a.i + 1 === a.b.length ? 0 : a.i + 1;
    }
    let s = 0;
    for (let k = 0; k < 8; k++) {
      const v = lines[k][idx[k]];
      lpz[k] += lpk * (v - lpz[k]);
      y[k] = lpz[k] * g[k];
      s += y[k];
    }
    s *= 0.25; // Householder: y - 2/N * sum
    for (let k = 0; k < 8; k++) {
      lines[k][idx[k]] = y[k] - s + x * 0.35;
      idx[k] = idx[k] + 1 === lens[k] ? 0 : idx[k] + 1;
    }
    L[t] += (y[0] - y[2] + y[4] + y[6] - y[7] * 0.5) * 0.3 * wet;
    R[t] += (y[1] - y[3] + y[5] - y[6] * 0.5 + y[7]) * 0.3 * wet;
  }
}

/** Simple mono feedback-delay reverb for one-shots (comb + allpass, Schroeder). */
export function monoVerb(rate: number, b: Float32Array, mix = 0.2, t60 = 1.2, damp = 4000) {
  const L = new Float32Array(b.length), R = new Float32Array(b.length);
  reverb(rate, b, L, R, { t60, damp, pre: 0.008 });
  for (let i = 0; i < b.length; i++) b[i] += (L[i] + R[i]) * mix;
  return b;
}

// ------------------------------------------------------------------ mastering
/** Look-ahead peak limiter on stereo (or mono when R omitted), ceiling in linear. `loop` wraps the windows around. */
export function limit(rate: number, L: Float32Array, R: Float32Array | null, ceil = 0.89, loop = false) {
  const n = L.length;
  const look = Math.max(1, Math.round(0.005 * rate));
  const need = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.max(Math.abs(L[i]), R ? Math.abs(R[i]) : 0);
    need[i] = a > ceil ? ceil / a : 1;
  }
  const at = (i: number) => (loop ? need[((i % n) + n) % n] : i >= 0 && i < n ? need[i] : 1);
  // m[i] = min(need[i .. i+look]) over the extended range [-look, n)
  const E = n + look;
  const m = new Float32Array(E);
  const dq = new Int32Array(E + look + 1);
  let h = 0, t = 0;
  for (let i = n - 1 + look; i >= -look; i--) {
    const v = at(i);
    while (t > h && at(dq[t - 1]) >= v) t--;
    dq[t++] = i;
    while (dq[h] > i + look) h++;
    if (i < n) m[i + look] = at(dq[h]);
  }
  // moving average over [i-look, i] → smooth attack that reaches the needed gain on the peak
  const g = new Float32Array(n);
  let sum = 0;
  for (let j = 0; j <= look; j++) sum += m[j];
  for (let i = 0; i < n; i++) {
    g[i] = sum / (look + 1);
    if (i + 1 < n) sum += m[i + 1 + look] - m[i];
  }
  // release: recover slowly, never above the computed gain
  const rel = 1 - Math.exp(-1 / (0.15 * rate));
  let c = 1;
  const passes = loop ? 2 : 1;
  for (let p = 0; p < passes; p++) {
    for (let i = 0; i < n; i++) {
      c = Math.min(g[i], c + (1 - c) * rel);
      if (p === passes - 1) {
        L[i] *= c;
        if (R) R[i] *= c;
      }
    }
  }
  for (let i = 0; i < n; i++) {
    if (L[i] > ceil) L[i] = ceil; else if (L[i] < -ceil) L[i] = -ceil;
    if (R) { if (R[i] > ceil) R[i] = ceil; else if (R[i] < -ceil) R[i] = -ceil; }
  }
}
