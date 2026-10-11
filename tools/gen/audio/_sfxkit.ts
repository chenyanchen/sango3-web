// Building blocks for sound effects: impacts, metal, whooshes, fire, water,
// thunder, explosions, formant voices and crowds. All mono at the given rate.
import { Biquad, clamp, envAD, mixInto, mtof, noise, OnePole, partials, TAU, type Partial, type Rng } from './_dsp.ts';

export const SR = 22050;
export const mk = (sec: number, rate = SR) => new Float32Array(Math.max(1, Math.round(sec * rate)));
export const at = (b: Float32Array, src: Float32Array, sec: number, gain = 1, rate = SR) => mixInto(b, src, sec * rate, gain);

/** noise shaped by a band-pass whose centre follows f(t) (Hz), envelope e(t) */
export function sweepNoise(r: Rng, sec: number, f: (t: number) => number, e: (t: number) => number, q = 1.2, rate = SR) {
  const b = mk(sec, rate);
  const bp = new Biquad(rate);
  for (let i = 0; i < b.length; i++) {
    const t = i / rate;
    if ((i & 15) === 0) bp.bp(clamp(f(t), 30, rate * 0.45), q);
    b[i] = bp.tick(r.next() * 2 - 1) * e(t);
  }
  return b;
}

/** smooth bell-shaped envelope peaking at `pk` (0..1 of length) */
export const hump = (len: number, pk = 0.4, pow = 1.5) => (t: number) => {
  const x = t / len;
  if (x <= 0 || x >= 1) return 0;
  return x < pk ? Math.pow(x / pk, pow) : Math.pow((1 - x) / (1 - pk), pow);
};
export const decay = (t60: number, att = 0.002) => (t: number) => (t < att ? t / att : Math.exp((-6.9 * (t - att)) / t60));

/** swing / swish */
export function whoosh(r: Rng, sec: number, f0: number, f1: number, q = 1.5, pk = 0.45) {
  const env = hump(sec, pk, 1.6);
  return sweepNoise(r, sec, (t) => f0 * Math.pow(f1 / f0, t / sec), env, q);
}

/** body impact: pitched thump + short noise crack */
export function thud(r: Rng, f: number, sec = 0.35, crack = 0.5, rate = SR) {
  const b = mk(sec, rate);
  partials(b, rate, [
    { f: f * 1.8, a: 0.9, t60: sec * 0.6, g: 1 / 1.8, gt: 0.03 },
    { f: f * 2.7, a: 0.3, t60: sec * 0.3, g: 1 / 1.5, gt: 0.03 },
  ]);
  const n = mk(Math.min(sec, 0.12), rate);
  noise(r, n);
  new Biquad(rate).lp(1800 + crack * 2500).run(n);
  envAD(n, rate, 0.0005, 0.06);
  mixInto(b, n, 0, 0.9 * crack + 0.3);
  return b;
}

/** metal: inharmonic partials (blade, armour, bell-ish), with a strike click */
export function clang(r: Rng, f: number, sec = 0.6, bright = 1, rate = SR) {
  const b = mk(sec, rate);
  const ratios = [1, 2.32, 3.86, 4.9, 5.73, 7.1, 8.6];
  const ps: Partial[] = ratios.map((k, i) => ({ f: f * k * (1 + r.gauss() * 0.01), a: (i === 0 ? 0.5 : 0.35 / (1 + i * 0.4)) * (i > 2 ? bright : 1), t60: sec * (i === 0 ? 1 : 0.8 / (1 + i * 0.3)), ph: r.next() * TAU }));
  partials(b, rate, ps);
  const n = mk(0.03, rate);
  noise(r, n);
  new Biquad(rate).hp(2500).run(n);
  envAD(n, rate, 0.0003, 0.02);
  mixInto(b, n, 0, 0.7);
  return b;
}

/** explosion: sub thump + roaring noise with falling cutoff + crackle */
export function boom(r: Rng, sec: number, size = 1, rate = SR) {
  const b = mk(sec, rate);
  partials(b, rate, [{ f: 90 * (1.3 - size * 0.3), a: 0.9, t60: 0.5 * size, g: 0.45, gt: 0.25 }]);
  const n = mk(sec, rate);
  noise(r, n);
  const lp = new Biquad(rate);
  for (let i = 0; i < n.length; i++) {
    const t = i / rate;
    if ((i & 15) === 0) lp.lp(clamp(4000 * Math.exp(-t * (4 / size)) + 150, 100, 9000), 0.9);
    const e = (t < 0.004 ? t / 0.004 : 1) * Math.exp((-t * 4.5) / size) * (1 + 0.5 * Math.sin(t * 37 + r.next() * 0.2));
    n[i] = lp.tick(n[i]) * e;
  }
  mixInto(b, n, 0, 1.2);
  mixInto(b, crackle(r, sec * 0.8, 50 / size, rate), sec * 0.05, 0.25 * size);
  return b;
}

/** random impulsive crackles (fire, debris) */
export function crackle(r: Rng, sec: number, perSec: number, rate = SR, bright = 3000) {
  const b = mk(sec, rate);
  const n = Math.round(sec * perSec);
  for (let k = 0; k < n; k++) {
    const t = r.next() * sec;
    const len = Math.round(rate * r.range(0.002, 0.008));
    const o = Math.round(t * rate);
    const a = r.range(0.2, 1) * (1 - t / sec * 0.5);
    for (let i = 0; i < len && o + i < b.length; i++) b[o + i] += (r.next() * 2 - 1) * a * (1 - i / len);
  }
  new Biquad(rate).hp(bright * 0.3).run(b);
  new Biquad(rate).lp(bright * 2).run(b);
  return b;
}

/** fire roar: low-passed, slowly modulated noise + crackle */
export function fire(r: Rng, sec: number, intensity = 1, rate = SR) {
  const b = mk(sec, rate);
  const lp = new Biquad(rate).lp(700 * intensity + 300, 0.7);
  const m = new OnePole(rate, 6);
  for (let i = 0; i < b.length; i++) {
    const mod = 0.6 + 0.8 * Math.abs(m.tick(r.next() * 2 - 1)) * 3;
    b[i] = lp.tick(r.next() * 2 - 1) * mod;
  }
  mixInto(b, crackle(r, sec, 40 * intensity, rate), 0, 0.5);
  const env = hump(sec, 0.25, 0.8);
  for (let i = 0; i < b.length; i++) b[i] *= env(i / rate);
  return b;
}

/** thunder: bright crack then long rolling rumble */
export function thunder(r: Rng, sec: number, crack = 1, rate = SR) {
  const b = mk(sec, rate);
  const c = mk(0.25, rate);
  noise(r, c);
  new Biquad(rate).hp(800).run(c);
  envAD(c, rate, 0.001, 0.12);
  mixInto(b, c, 0, crack);
  const n = mk(sec, rate);
  noise(r, n);
  new Biquad(rate).lp(380, 0.8).run(n);
  new Biquad(rate).lp(500, 0.7).run(n);
  // rolling: several random swells
  const sw: [number, number][] = [];
  for (let k = 0; k < 6; k++) sw.push([r.range(0.03, sec * 0.6), r.range(0.4, 1)]);
  for (let i = 0; i < n.length; i++) {
    const t = i / rate;
    let e = 0;
    for (const [s, a] of sw) e += t > s ? a * Math.exp(-(t - s) * 3) * Math.min(1, (t - s) / 0.05) : 0;
    n[i] *= e * Math.exp(-t / sec);
  }
  mixInto(b, n, 0, 2.2);
  return b;
}

/** water: splash noise + bubbles (upward sine chirps) */
export function water(r: Rng, sec: number, bubbles = 20, rate = SR) {
  const b = sweepNoise(r, sec, (t) => 1800 - t * 800, hump(sec, 0.1, 1.2), 0.6, rate);
  for (let k = 0; k < bubbles; k++) {
    const t0 = r.range(0, sec * 0.85);
    const f = r.range(500, 1600);
    const len = r.range(0.03, 0.09);
    const n = Math.round(len * rate);
    const o = Math.round(t0 * rate);
    let ph = 0;
    for (let i = 0; i < n && o + i < b.length; i++) {
      const x = i / n;
      ph += (TAU * f * (1 + x * 1.5)) / rate;
      b[o + i] += Math.sin(ph) * Math.sin(Math.PI * x) * 0.25;
    }
  }
  return b;
}

/** wind / vortex: band noise with wandering centre */
export function wind(r: Rng, sec: number, base = 500, rate = SR) {
  const p1 = r.range(0.2, 0.6), p2 = r.range(0.7, 1.4);
  return sweepNoise(r, sec, (t) => base * (1 + 0.6 * Math.sin(TAU * p1 * t) + 0.3 * Math.sin(TAU * p2 * t + 1)), hump(sec, 0.35, 0.9), 4, rate);
}

/** sparkles: many short high sine pings (magic) */
export function sparkle(r: Rng, sec: number, n: number, lo = 2000, hi = 6000, rate = SR) {
  const b = mk(sec, rate);
  for (let k = 0; k < n; k++) {
    const t = r.range(0, sec * 0.8);
    const ps: Partial[] = [{ f: r.range(lo, hi), a: r.range(0.05, 0.15), t60: r.range(0.08, 0.3) }];
    partials(b, rate, ps, t);
  }
  return b;
}

/** pentatonic bell/chime notes (midi list) at times */
export function chimes(r: Rng, notes: [t: number, midi: number, a: number][], sec: number, rate = SR) {
  const b = mk(sec, rate);
  for (const [t, m, a] of notes) {
    const f = mtof(m);
    partials(b, rate, [
      { f, a: 0.5 * a, t60: 1.6 },
      { f: f * 2.0, a: 0.2 * a, t60: 0.8 },
      { f: f * 2.76, a: 0.12 * a, t60: 0.5 },
      { f: f * 5.4, a: 0.05 * a, t60: 0.2, ph: r.next() },
    ], t);
  }
  return b;
}

/** creak (wood under strain): resonant band noise with jittery pulses */
export function creak(r: Rng, sec: number, f = 600, rate = SR) {
  const b = mk(sec, rate);
  const bp = new Biquad(rate).bp(f, 8);
  let ph = 0;
  for (let i = 0; i < b.length; i++) {
    const t = i / rate;
    ph += (55 + 40 * Math.sin(t * 9)) / rate;
    let x = 0;
    if (ph >= 1) {
      ph -= 1;
      x = r.range(0.5, 1);
    }
    b[i] = bp.tick(x) * 6 * hump(sec, 0.5, 1)(t);
  }
  return b;
}

/** hooves: n hoof clops in gallop groups of 3 */
export function hooves(r: Rng, sec: number, per: number, horses = 1, rate = SR) {
  const b = mk(sec, rate);
  for (let h = 0; h < horses; h++) {
    let t = r.range(0, per * 0.8);
    const sp = per * r.range(0.9, 1.1);
    while (t < sec - 0.1) {
      for (const off of [0, 0.07, 0.15]) {
        const c = thud(r, r.range(220, 320), 0.09, 0.9, rate);
        at(b, c, t + off * sp / 0.6, r.range(0.4, 0.8) / Math.sqrt(horses), rate);
      }
      t += sp;
    }
  }
  return b;
}

// ------------------------------------------------------------------ voices
export type Vowel = 'a' | 'o' | 'u' | 'e' | 'i' | 'n' | 'ei';
const FORM: Record<Exclude<Vowel, 'ei'>, [number, number, number]> = {
  a: [780, 1250, 2600],
  o: [520, 880, 2500],
  u: [360, 760, 2400],
  e: [480, 1750, 2600],
  i: [300, 2150, 2950],
  n: [260, 1300, 2400],
};
export interface VoiceOpts {
  sec: number;
  /** f0 in Hz over time */
  f0: (t: number) => number;
  /** vowel over time: either fixed or a sequence of [time, vowel] */
  vowel: Vowel | [number, Exclude<Vowel, 'ei'>][];
  amp: (t: number) => number;
  /** aspiration 0..1 over time */
  breath?: (t: number) => number;
  female?: boolean;
  /** 0..1: vocal effort (brighter, rougher) */
  effort?: number;
  /** formant scale (vocal tract size) */
  tract?: number;
}
export function voice(r: Rng, o: VoiceOpts, rate = SR) {
  const b = mk(o.sec, rate);
  const fs = (o.female ? 1.17 : 1) * (o.tract ?? 1);
  const bp = [new Biquad(rate), new Biquad(rate), new Biquad(rate)];
  const bn = [new Biquad(rate), new Biquad(rate), new Biquad(rate)];
  const gains = [1, 0.55, 0.28];
  const eff = o.effort ?? 0.6;
  const seq = typeof o.vowel === 'string' ? null : o.vowel;
  const fixed = typeof o.vowel === 'string' ? (o.vowel === 'ei' ? FORM.e : FORM[o.vowel]) : FORM.a;
  let ph = 0, prevG = 0;
  const jit = new OnePole(rate, 25);
  const open = 0.55 - eff * 0.15;
  let F = fixed.slice();
  for (let i = 0; i < b.length; i++) {
    const t = i / rate;
    if ((i & 31) === 0) {
      if (seq) {
        // interpolate between vowel targets
        let k = 0;
        while (k + 1 < seq.length && seq[k + 1][0] <= t) k++;
        const a0 = FORM[seq[k][1]], a1 = k + 1 < seq.length ? FORM[seq[k + 1][1]] : a0;
        const span = k + 1 < seq.length ? seq[k + 1][0] - seq[k][0] : 1;
        const x = clamp((t - seq[k][0]) / Math.max(0.001, span), 0, 1);
        const xs = x * x * (3 - 2 * x);
        F = [0, 1, 2].map((j) => a0[j] + (a1[j] - a0[j]) * Math.max(0, (xs - 0.5) * 2));
      }
      for (let j = 0; j < 3; j++) {
        const f = F[j] * fs;
        bp[j].bp(f, f / (60 + j * 40 + eff * 40));
        bn[j].bp(f, f / (120 + j * 60));
      }
    }
    const f0 = o.f0(t) * (1 + jit.tick(r.gauss()) * (0.02 + eff * 0.03));
    ph += f0 / rate;
    if (ph >= 1) ph -= 1;
    // Rosenberg-like glottal flow, differentiated
    const p = ph;
    const g = p < open ? 0.5 * (1 - Math.cos((Math.PI * p) / open)) : p < open + 0.12 + (1 - eff) * 0.1 ? Math.cos((Math.PI * (p - open)) / (2 * (0.12 + (1 - eff) * 0.1))) : 0;
    const src = (g - prevG) * 18;
    prevG = g;
    const a = o.amp(t);
    const br = o.breath ? o.breath(t) : 0.15;
    const nz = (r.next() * 2 - 1) * 0.6;
    let y = 0;
    for (let j = 0; j < 3; j++) y += bp[j].tick(src * (1 - br * 0.7) * a) * gains[j] + bn[j].tick(nz * br * a) * gains[j] * 1.2;
    b[i] = y;
  }
  new Biquad(rate).hp(90).run(b);
  if (eff > 0.7) for (let i = 0; i < b.length; i++) b[i] = Math.tanh(b[i] * (1 + eff)) / (1 + eff * 0.3);
  return b;
}

/** a crowd shouting: many voices + band noise */
export function crowd(r: Rng, sec: number, n: number, o: { f0: [number, number]; vowel: Vowel | [number, Exclude<Vowel, 'ei'>][]; female?: number; rise?: number }, rate = SR) {
  const b = mk(sec, rate);
  for (let k = 0; k < n; k++) {
    const st = r.range(0, 0.35);
    const len = sec - st - r.range(0, 0.4);
    const f = r.range(o.f0[0], o.f0[1]);
    const rise = o.rise ?? 1.15;
    const fem = r.next() < (o.female ?? 0);
    const v = voice(r, {
      sec: len,
      f0: (t) => (fem ? f * 1.8 : f) * (1 + (rise - 1) * Math.min(1, t / 0.4)) * (1 - 0.1 * Math.max(0, t - len * 0.6) / len),
      vowel: o.vowel,
      amp: hump(len, 0.2, 0.6),
      breath: () => 0.3,
      effort: 0.85,
      female: fem,
      tract: r.range(0.92, 1.08),
    }, rate);
    at(b, v, st, 1 / Math.sqrt(n), rate);
  }
  const bn = sweepNoise(r, sec, () => 1100, hump(sec, 0.25, 0.8), 0.5, rate);
  mixInto(b, bn, 0, 0.25);
  return b;
}
