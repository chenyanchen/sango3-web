// Synthesized Chinese instruments for the music generator. Each instrument
// renders mono Float32Arrays; the Mix places them in a stereo field with a
// reverb send. Percussion and plucks are cached per track (by pitch/variant)
// so rendering a whole arrangement stays fast.
import { Biquad, blep, envAD, mixInto, mtof, noise, OnePole, partials, pluck, reverb, rng, TAU, type Partial, type Rng } from './_dsp.ts';

// ------------------------------------------------------------------ mix bus
export class Mix {
  /** loop length in samples: material placed before t=0 wraps to the loop end */
  loop = 0;
  L: Float32Array;
  R: Float32Array;
  send: Float32Array;
  constructor(public rate: number, public len: number) {
    this.L = new Float32Array(len);
    this.R = new Float32Array(len);
    this.send = new Float32Array(len);
  }
  /** add a mono source at `t` seconds, pan -1..1, reverb send amount */
  add(src: Float32Array, t: number, gain: number, pan = 0, rev = 0.2) {
    const o = Math.round(t * this.rate);
    const a = ((pan + 1) * Math.PI) / 4;
    const gl = Math.cos(a) * gain * Math.SQRT2, gr = Math.sin(a) * gain * Math.SQRT2;
    const gs = gain * rev;
    const from = Math.max(0, -o), to = Math.min(src.length, this.len - o);
    const L = this.L, R = this.R, S = this.send;
    if (o < 0 && this.loop > 0)
      for (let i = 0; i < Math.min(-o, src.length); i++) {
        const j = this.loop + o + i;
        if (j < 0) continue;
        const v = src[i];
        L[j] += v * gl;
        R[j] += v * gr;
        S[j] += v * gs;
      }
    for (let i = from; i < to; i++) {
      const v = src[i];
      L[o + i] += v * gl;
      R[o + i] += v * gr;
      S[o + i] += v * gs;
    }
  }
  /** add a stereo pair */
  add2(l: Float32Array, r: Float32Array, t: number, gain: number, rev = 0.2) {
    mixInto(this.L, l, t * this.rate, gain);
    mixInto(this.R, r, t * this.rate, gain);
    mixInto(this.send, l, t * this.rate, gain * rev * 0.5);
    mixInto(this.send, r, t * this.rate, gain * rev * 0.5);
  }
  reverb(o: { t60?: number; damp?: number; wet?: number }) {
    reverb(this.rate, this.send, this.L, this.R, o);
  }
}

// ------------------------------------------------------------------ plucked strings
export type PluckIns = 'zheng' | 'pipa' | 'qin' | 'ruan';

interface PluckDef {
  t60: (f: number) => number;
  damp: number;
  bright: number;
  pos: number;
  body: [f: number, q: number, db: number][];
  hp: number;
  len: number;
  click: number;
}
const PLUCKS: Record<PluckIns, PluckDef> = {
  // 古筝: bright, long ringing, silk-steel strings over a big box
  zheng: { t60: (f) => Math.min(4.5, 2.2 * Math.pow(440 / f, 0.45)), damp: 0.25, bright: 7000, pos: 0.12, body: [[180, 1.6, 4], [420, 2, 3], [1900, 1.2, 2]], hp: 70, len: 3.2, click: 0.25 },
  // 琵琶: crisp, shorter, nasal
  pipa: { t60: (f) => Math.min(1.6, 0.9 * Math.pow(440 / f, 0.4)), damp: 0.35, bright: 9000, pos: 0.07, body: [[330, 2, 4], [1250, 2, 4], [3200, 1.5, 2]], hp: 120, len: 1.6, click: 0.4 },
  // 古琴: deep, mellow, long
  qin: { t60: (f) => Math.min(5, 3 * Math.pow(220 / f, 0.35)), damp: 0.7, bright: 2600, pos: 0.18, body: [[110, 1.2, 5], [300, 1.5, 3]], hp: 45, len: 4, click: 0.05 },
  // 阮: round mid plucks (bass / accompaniment)
  ruan: { t60: (f) => Math.min(2.4, 1.4 * Math.pow(220 / f, 0.4)), damp: 0.55, bright: 4000, pos: 0.15, body: [[160, 1.5, 4], [600, 1.8, 2]], hp: 50, len: 2.2, click: 0.12 },
};

export function renderPluck(rate: number, ins: PluckIns, midi: number, r: Rng, o: { bend?: { to: number; at: number; len: number }; vib?: { depth: number; rate: number; at: number }; len?: number } = {}) {
  const d = PLUCKS[ins];
  const f = mtof(midi);
  const t60 = d.t60(f);
  const dur = o.len ?? Math.min(d.len, t60 * 1.1);
  const sustain = Math.pow(10, -3 / (f * t60));
  const out = pluck(rate, f, r, { dur, sustain, damp: d.damp, bright: d.bright, pos: d.pos, bend: o.bend, vib: o.vib });
  // nail/plectrum click
  if (d.click > 0) {
    const n = Math.round(rate * 0.006);
    const hp = new Biquad(rate).hp(2500);
    for (let i = 0; i < n && i < out.length; i++) out[i] += hp.tick(r.next() * 2 - 1) * d.click * (1 - i / n);
  }
  for (const [bf, q, g] of d.body) new Biquad(rate).peak(bf, q, g).run(out);
  new Biquad(rate).hp(d.hp).run(out);
  // end fade
  const fo = Math.min(out.length, Math.round(rate * 0.08));
  for (let i = 0; i < fo; i++) out[out.length - 1 - i] *= i / fo;
  // level: roughly normalize per pitch
  let p = 0;
  for (let i = 0; i < Math.min(out.length, rate * 0.05); i++) p = Math.max(p, Math.abs(out[i]));
  if (p > 0) for (let i = 0; i < out.length; i++) out[i] *= 0.6 / p;
  return out;
}

// ------------------------------------------------------------------ line instruments (continuous voices)
export type LineIns = 'dizi' | 'xiao' | 'erhu' | 'suona' | 'cello';
export interface LineNote {
  t: number; // seconds
  d: number; // seconds
  m: number; // midi
  v: number; // 0..1
  /** grace note from this midi (quick) */
  g?: number;
  /** slide into the note from the previous one (legato portamento) */
  slide?: boolean;
}
interface LineDef {
  att: number;
  rel: number;
  port: number;
  vib: number;
  vibRate: number;
  vibDelay: number;
  breath: number;
  osc: 'flute' | 'saw' | 'reed';
  formants: [number, number, number][];
  lp: number;
  hp: number;
}
const LINES: Record<LineIns, LineDef> = {
  dizi: { att: 0.035, rel: 0.09, port: 0.025, vib: 0.006, vibRate: 5.6, vibDelay: 0.22, breath: 0.12, osc: 'flute', formants: [[2600, 2.5, 5], [4800, 2, 4]], lp: 9000, hp: 200 },
  xiao: { att: 0.07, rel: 0.16, port: 0.05, vib: 0.004, vibRate: 4.8, vibDelay: 0.3, breath: 0.22, osc: 'flute', formants: [[900, 1.5, 2]], lp: 3800, hp: 120 },
  erhu: { att: 0.06, rel: 0.12, port: 0.07, vib: 0.011, vibRate: 6.1, vibDelay: 0.12, breath: 0.03, osc: 'saw', formants: [[650, 1.6, 9], [1500, 2, 6], [3100, 2.5, 4]], lp: 5200, hp: 260 },
  suona: { att: 0.025, rel: 0.06, port: 0.03, vib: 0.007, vibRate: 6.5, vibDelay: 0.18, breath: 0.03, osc: 'reed', formants: [[1100, 2, 8], [2400, 2.2, 7], [3800, 2.5, 3]], lp: 7000, hp: 300 },
  cello: { att: 0.12, rel: 0.25, port: 0.08, vib: 0.004, vibRate: 5, vibDelay: 0.25, breath: 0.01, osc: 'saw', formants: [[250, 1.2, 5], [800, 1.6, 3]], lp: 1600, hp: 40 },
};

/** Render a monophonic phrase (notes sorted by time). Returns buffer starting at the first note's t (minus a little). */
export function renderLine(rate: number, ins: LineIns, notes: LineNote[], seed: number): { t0: number; data: Float32Array } {
  const d = LINES[ins];
  const r = rng(seed);
  if (!notes.length) return { t0: 0, data: new Float32Array(1) };
  const t0 = Math.max(0, notes[0].t - 0.05);
  const last = notes[notes.length - 1];
  const tEnd = last.t + last.d + d.rel + 0.3;
  const n = Math.round((tEnd - t0) * rate);
  const out = new Float32Array(n);
  // per-sample control: freq & amp, computed from note list
  let ni = 0;
  let f = mtof(notes[0].m), amp = 0, ph = 0, ph2 = 0;
  const portK = 1 - Math.exp(-1 / (d.port * rate));
  const ampUp = 1 - Math.exp(-1 / (d.att * rate));
  const ampDn = 1 - Math.exp(-1 / (d.rel * rate));
  const bnoise = new Biquad(rate);
  const bhp = new Biquad(rate).hp(1500);
  const nlp = new OnePole(rate, 3000);
  let vibPh = r.next() * TAU;
  let drift = 0;
  for (let i = 0; i < n; i++) {
    const t = t0 + i / rate;
    while (ni + 1 < notes.length && t >= notes[ni + 1].t) ni++;
    const nt = notes[ni];
    const on = t >= nt.t && t < nt.t + nt.d;
    const since = t - nt.t;
    let target = mtof(nt.m);
    if (nt.g !== undefined && since < 0.07 && since >= 0) target = mtof(nt.g);
    // jump vs glide: slide notes glide, others move fast (tongued)
    const k = nt.slide || ins === 'erhu' || ins === 'cello' ? portK : Math.min(1, portK * 4);
    if (since >= 0 && since < 0.002 && !nt.slide && ins !== 'erhu' && ins !== 'cello') f = target;
    f += (target - f) * k;
    // amplitude: attack, slight swell, articulation dip at each onset
    let a = on ? nt.v : 0;
    if (on && since < 0.03 && !nt.slide) a *= 0.55 + 0.45 * (since / 0.03);
    if (on) a *= 1 + 0.08 * Math.min(1, since / 0.6);
    amp += (a - amp) * (a > amp ? ampUp : ampDn);
    drift += (r.next() - 0.5) * 0.0004;
    drift *= 0.999;
    // vibrato (delayed onset per note)
    const vd = since > d.vibDelay ? Math.min(1, (since - d.vibDelay) / 0.3) : 0;
    vibPh += (TAU * d.vibRate) / rate;
    const ff = f * (1 + d.vib * vd * Math.sin(vibPh) + drift * 0.01);
    const dt = ff / rate;
    ph += dt;
    if (ph >= 1) ph -= 1;
    let s = 0;
    if (d.osc === 'flute') {
      const x = ph * TAU;
      const br = 0.25 + amp * 0.6;
      s = Math.sin(x) + br * 0.45 * Math.sin(2 * x) + br * br * 0.22 * Math.sin(3 * x) + br * br * 0.08 * Math.sin(4 * x);
      // breath: noise band-passed around the pitch + broad hiss
      if ((i & 63) === 0) bnoise.bp(ff * 2, 6);
      const nz = r.next() * 2 - 1;
      s += bnoise.tick(nz) * d.breath * 3 + bhp.tick(nz) * d.breath * 0.25;
    } else if (d.osc === 'saw') {
      s = 2 * ph - 1 - blep(ph, dt);
      // bow noise follows amplitude
      s += nlp.tick(r.next() * 2 - 1) * d.breath * 4;
    } else {
      // reed: narrow pulse (bright, buzzy), plus a touch of saw
      ph2 += dt;
      if (ph2 >= 1) ph2 -= 1;
      let p2 = ph + 0.28;
      if (p2 >= 1) p2 -= 1;
      s = (2 * ph - 1 - blep(ph, dt)) - (2 * p2 - 1 - blep(p2, dt));
      s = Math.tanh(s * 1.4);
    }
    out[i] = s * amp;
  }
  for (const [ff, q, g] of d.formants) new Biquad(rate).peak(ff, q, g).run(out);
  new Biquad(rate).lp(d.lp).run(out);
  new Biquad(rate).hp(d.hp).run(out);
  if (ins === 'dizi') {
    // 笛膜 membrane buzz: a soft-saturated band added on top
    const bp = new Biquad(rate).bp(3500, 1.2);
    for (let i = 0; i < n; i++) out[i] += bp.tick(Math.tanh(out[i] * 3)) * 0.18;
  }
  return { t0, data: out };
}

// ------------------------------------------------------------------ sustained pads (low strings ensemble)
export function renderPad(rate: number, midis: number[], dur: number, seed: number, o: { att?: number; rel?: number; cut?: number; bright?: number } = {}): [Float32Array, Float32Array] {
  const r = rng(seed);
  const att = o.att ?? 0.8, rel = o.rel ?? 1.2;
  const n = Math.round((dur + rel) * rate);
  const L = new Float32Array(n), R = new Float32Array(n);
  for (const m of midis) {
    for (let v = 0; v < 3; v++) {
      const f = mtof(m) * (1 + (v - 1) * 0.0045 + r.gauss() * 0.0008);
      let ph = r.next();
      const dt = f / rate;
      const pan = (v - 1) * 0.7;
      const gl = Math.cos(((pan + 1) * Math.PI) / 4), gr = Math.sin(((pan + 1) * Math.PI) / 4);
      const lfo = r.range(0.15, 0.4), lph = r.next() * TAU;
      for (let i = 0; i < n; i++) {
        ph += dt * (1 + 0.0015 * Math.sin(lph + (TAU * lfo * i) / rate));
        if (ph >= 1) ph -= 1;
        const s = 2 * ph - 1 - blep(ph, dt);
        L[i] += s * gl;
        R[i] += s * gr;
      }
    }
  }
  const cut = o.cut ?? 1400;
  for (const b of [L, R]) {
    new Biquad(rate).lp(cut, 0.6).run(b);
    new Biquad(rate).lp(cut * 1.3, 0.6).run(b);
    new Biquad(rate).hp(60).run(b);
    const na = Math.round(att * rate), nd = Math.round(dur * rate);
    const g = 0.22 / Math.sqrt(midis.length * 3);
    for (let i = 0; i < n; i++) {
      let e = i < na ? 0.5 - 0.5 * Math.cos((Math.PI * i) / na) : 1;
      if (i > nd) e *= Math.max(0, 1 - (i - nd) / (rel * rate));
      b[i] *= e * g;
    }
  }
  return [L, R];
}

// ------------------------------------------------------------------ percussion
export type Perc = 'dagu' | 'dagu2' | 'tanggu' | 'xiaogu' | 'rim' | 'muyu' | 'bangzi' | 'bo' | 'bochoke' | 'luo' | 'xiaoluo' | 'tamtam' | 'shaker';

export function renderPerc(rate: number, kind: Perc, seed: number): Float32Array {
  const r = rng(seed);
  const mk = (sec: number) => new Float32Array(Math.round(sec * rate));
  switch (kind) {
    case 'dagu':
    case 'dagu2': {
      // 大鼓 / 战鼓: big membrane, pitch drops on impact
      const f0 = kind === 'dagu' ? r.range(56, 62) : r.range(72, 80);
      const b = mk(1.6);
      partials(b, rate, [
        { f: f0 * 1.6, a: 0.9, t60: 1.1, g: 1 / 1.6, gt: 0.05 },
        { f: f0 * 1.59 * 1.4, a: 0.35, t60: 0.5, g: 1 / 1.4, gt: 0.05 },
        { f: f0 * 2.14 * 1.3, a: 0.2, t60: 0.35, g: 1 / 1.3, gt: 0.05 },
        { f: f0 * 2.65, a: 0.1, t60: 0.25 },
      ]);
      // skin slap + air
      const nz = mk(0.25);
      noise(r, nz);
      new Biquad(rate).lp(900).run(nz);
      envAD(nz, rate, 0.001, 0.18);
      mixInto(b, nz, 0, 0.9);
      const cl = mk(0.02);
      noise(r, cl);
      new Biquad(rate).bp(2200, 0.8).run(cl);
      envAD(cl, rate, 0.0005, 0.015);
      mixInto(b, cl, 0, 0.5);
      return b;
    }
    case 'tanggu': {
      // 堂鼓: tighter, higher
      const f0 = r.range(150, 170);
      const b = mk(0.7);
      partials(b, rate, [
        { f: f0 * 1.3, a: 0.8, t60: 0.45, g: 1 / 1.3, gt: 0.03 },
        { f: f0 * 1.59, a: 0.35, t60: 0.25 },
        { f: f0 * 2.3, a: 0.15, t60: 0.15 },
      ]);
      const nz = mk(0.12);
      noise(r, nz);
      new Biquad(rate).bp(1200, 0.7).run(nz);
      envAD(nz, rate, 0.0005, 0.07);
      mixInto(b, nz, 0, 0.6);
      return b;
    }
    case 'xiaogu': {
      // 小鼓/板鼓: dry crack
      const b = mk(0.25);
      partials(b, rate, [{ f: 420, a: 0.5, t60: 0.08 }, { f: 690, a: 0.3, t60: 0.06 }]);
      const nz = mk(0.12);
      noise(r, nz);
      new Biquad(rate).bp(2600, 0.9).run(nz);
      envAD(nz, rate, 0.0005, 0.05);
      mixInto(b, nz, 0, 1);
      return b;
    }
    case 'rim': {
      const b = mk(0.1);
      partials(b, rate, [{ f: 1650, a: 0.6, t60: 0.03 }, { f: 2900, a: 0.3, t60: 0.02 }]);
      return b;
    }
    case 'muyu': {
      // 木鱼: hollow wood
      const f = r.range(740, 780);
      const b = mk(0.3);
      partials(b, rate, [{ f, a: 0.8, t60: 0.12 }, { f: f * 2.71, a: 0.15, t60: 0.05 }]);
      return b;
    }
    case 'bangzi': {
      // 梆子: hard high clap of wood
      const b = mk(0.15);
      partials(b, rate, [{ f: 1850, a: 0.7, t60: 0.06 }, { f: 3020, a: 0.3, t60: 0.04 }]);
      const nz = mk(0.01);
      noise(r, nz, 0.5);
      mixInto(b, nz, 0, 1);
      return b;
    }
    case 'bo':
    case 'bochoke': {
      // 钹: two plates clashed — dense metallic noise with inharmonic ring
      const len = kind === 'bo' ? 1.8 : 0.18;
      const b = mk(len);
      const ps: Partial[] = [];
      for (let i = 0; i < 24; i++) ps.push({ f: r.range(400, 9000), a: r.range(0.02, 0.06), t60: len * r.range(0.4, 1), ph: r.next() * TAU });
      partials(b, rate, ps);
      const nz = mk(len);
      noise(r, nz);
      const hp = new Biquad(rate).hp(2500);
      hp.run(nz);
      new Biquad(rate).peak(6000, 1, 6).run(nz);
      envAD(nz, rate, 0.002, len * 0.7);
      mixInto(b, nz, 0, 0.5);
      return b;
    }
    case 'luo': {
      // 大锣: falling pitch opera gong
      const b = mk(3);
      const f = r.range(205, 225);
      partials(b, rate, [
        { f, a: 0.8, t60: 2.4, g: 0.82, gt: 0.5 },
        { f: f * 1.48, a: 0.3, t60: 1.6, g: 0.86, gt: 0.5 },
        { f: f * 2.04, a: 0.2, t60: 1.2, g: 0.88, gt: 0.5 },
        { f: f * 2.79, a: 0.12, t60: 0.8 },
        { f: f * 3.6, a: 0.08, t60: 0.6 },
      ], 0, 0.004);
      const nz = mk(0.6);
      noise(r, nz);
      new Biquad(rate).bp(1800, 0.8).run(nz);
      envAD(nz, rate, 0.001, 0.4);
      mixInto(b, nz, 0, 0.25);
      return b;
    }
    case 'xiaoluo': {
      // 小锣: rising "tang"
      const b = mk(1.4);
      const f = r.range(640, 700);
      partials(b, rate, [
        { f, a: 0.7, t60: 1.2, g: 1.12, gt: 0.2 },
        { f: f * 1.51, a: 0.25, t60: 0.7, g: 1.1, gt: 0.2 },
        { f: f * 2.23, a: 0.12, t60: 0.5 },
      ]);
      return b;
    }
    case 'tamtam': {
      // big tam-tam swell: many partials blooming
      const b = mk(6);
      const base = r.range(70, 90);
      const ps: Partial[] = [];
      for (let i = 0; i < 40; i++) {
        const f = base * Math.pow(2, r.range(0, 5));
        ps.push({ f, a: r.range(0.02, 0.07) * Math.pow(base / f, 0.25), t60: r.range(2.5, 5.5), ph: r.next() * TAU });
      }
      partials(b, rate, ps, 0, 0.06);
      // bloom: slow fade-in of the shimmer
      const nz = mk(5);
      noise(r, nz);
      new Biquad(rate).bp(2500, 0.7).run(nz);
      for (let i = 0; i < nz.length; i++) {
        const t = i / rate;
        nz[i] *= Math.min(1, t / 0.6) * Math.exp(-t / 1.3) * 0.08;
      }
      mixInto(b, nz, 0, 1);
      const th = mk(0.3);
      noise(r, th);
      new Biquad(rate).lp(300).run(th);
      envAD(th, rate, 0.002, 0.25);
      mixInto(b, th, 0, 0.6);
      return b;
    }
    case 'shaker': {
      const b = mk(0.08);
      noise(r, b);
      new Biquad(rate).hp(5000).run(b);
      envAD(b, rate, 0.01, 0.06);
      return b;
    }
  }
}

/** 编钟 / 磬: bronze bell with a strike transient. */
export function renderBell(rate: number, midi: number, seed: number, kind: 'zhong' | 'qing' = 'zhong'): Float32Array {
  const r = rng(seed);
  const f = mtof(midi);
  const b = new Float32Array(Math.round(rate * (kind === 'zhong' ? 3.5 : 2)));
  if (kind === 'zhong') {
    partials(b, rate, [
      { f: f * 0.5, a: 0.25, t60: 3.4 },
      { f, a: 0.7, t60: 2.6 },
      { f: f * 1.19 * (1 + r.gauss() * 0.002), a: 0.18, t60: 1.6 },
      { f: f * 1.5, a: 0.12, t60: 1.4 },
      { f: f * 2.0, a: 0.25, t60: 1.2 },
      { f: f * 2.53, a: 0.1, t60: 0.7 },
      { f: f * 3.01, a: 0.08, t60: 0.5 },
      { f: f * 4.1, a: 0.05, t60: 0.3 },
    ]);
  } else {
    partials(b, rate, [
      { f, a: 0.7, t60: 1.8 },
      { f: f * 2.76, a: 0.25, t60: 0.8 },
      { f: f * 5.4, a: 0.1, t60: 0.3 },
    ]);
  }
  const cl = new Float32Array(Math.round(rate * 0.01));
  noise(r, cl, 0.3);
  new Biquad(rate).hp(3000).run(cl);
  mixInto(b, cl, 0, 1);
  return b;
}
