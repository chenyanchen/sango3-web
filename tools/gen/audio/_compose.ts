// Composition engine: pentatonic theory (宫商角徵羽), melodic periods with
// motif/sequence/cadence structure, bass roots chosen to fit the melody, and a
// section-based arranger that renders a looping stereo track.
import { db, limit, mtof, rms, rng, type Rng } from './_dsp.ts';
import { Mix, renderBell, renderLine, renderPad, renderPerc, renderPluck, type LineIns, type LineNote, type Perc, type PluckIns } from './_instr.ts';

export const PENTA = [0, 2, 4, 7, 9];
export const MODE = { gong: 0, shang: 1, jue: 2, zhi: 3, yu: 4 } as const;
export type ModeName = keyof typeof MODE;

export class Scale {
  constructor(public key: number, public mode: number) {}
  midi(s: number) {
    const o = Math.floor(s / 5);
    return this.key + PENTA[s - o * 5] + 12 * o;
  }
  /** scale index of the mode's tonic in octave `o` (o=0 around key) */
  tonic(o = 0) {
    return this.mode + 5 * o;
  }
  /** nearest index with the same degree as `deg` (0..4 relative to gong) to s */
  nearest(deg: number, s: number) {
    const base = s - (((s - deg) % 5) + 5) % 5;
    return s - base <= 2 ? base : base + 5;
  }
}

/** melody note in 16th-note units */
export interface MNote {
  b: number;
  d: number;
  s: number;
  v: number;
}
export interface Period {
  notes: MNote[];
  /** bass root (scale index) per bar */
  roots: number[];
  bars: number;
}

const RHY: Record<'sparse' | 'mid' | 'busy' | 'cad' | 'fin', number[][]> = {
  sparse: [[8, 8], [12, 4], [4, 4, 8], [8, 4, 4], [6, 2, 8], [4, 12]],
  mid: [[4, 4, 4, 4], [6, 2, 4, 4], [4, 4, 8], [8, 4, 4], [4, 2, 2, 8], [6, 2, 8], [3, 1, 4, 8], [4, 4, 6, 2]],
  busy: [[2, 2, 4, 4, 4], [4, 2, 2, 4, 4], [2, 2, 2, 2, 4, 4], [6, 2, 2, 2, 4], [4, 4, 2, 2, 4], [3, 1, 3, 1, 4, 4], [2, 2, 4, 2, 2, 4]],
  cad: [[4, 4, 8], [8, 8], [2, 2, 4, 8], [6, 2, 8], [4, 12]],
  fin: [[4, 12], [16], [8, 8], [2, 2, 12]],
};

function stepDist(r: Rng, prevStep: number) {
  if (Math.abs(prevStep) >= 2) return prevStep > 0 ? r.pick([-1, -1, -2, 0]) : r.pick([1, 1, 2, 0]);
  const x = r.next();
  if (x < 0.3) return 1;
  if (x < 0.6) return -1;
  if (x < 0.7) return 2;
  if (x < 0.8) return -2;
  if (x < 0.86) return 0;
  if (x < 0.93) return 3;
  return -3;
}

function reflect(s: number, lo: number, hi: number) {
  while (s < lo || s > hi) {
    if (s < lo) s = lo + (lo - s);
    if (s > hi) s = hi - (s - hi);
  }
  return s;
}

/** contour of a bar: notes with steps; first pitch given; pulled toward `aim` */
function barMel(r: Rng, rhy: number[], start: number, lo: number, hi: number, aim?: number): MNote[] {
  const out: MNote[] = [];
  let s = start, prev = 0, b = 0, before = -99;
  rhy.forEach((d, i) => {
    if (i > 0) {
      let st = stepDist(r, prev);
      if (aim !== undefined && aim !== s && r.chance(0.5)) st = Math.sign(aim - s) * (r.chance(0.75) ? 1 : 2);
      // avoid trills (a-b-a) most of the time
      if (s + st === before && r.chance(0.7)) st = st > 0 ? st + 1 : st < 0 ? st - 1 : 1;
      before = s;
      s = reflect(s + st, lo, hi);
      prev = st;
    }
    out.push({ b, d, s, v: 0.75 + ((b % 8 === 0 ? 0.15 : b % 4 === 0 ? 0.07 : 0) + r.range(-0.05, 0.05)) });
    b += d;
  });
  return out;
}

/** approach the target stepwise from the side of `from`, ending on a long note */
function cadence(r: Rng, rhy: number[], from: number, target: number): MNote[] {
  const k = rhy.length;
  let dir = Math.sign(from - target) || (r.chance(0.5) ? 1 : -1);
  // a leap into the run is fine, but no more than an octave of run
  const out: MNote[] = [];
  let b = 0;
  for (let j = 0; j < k; j++) {
    const dist = k - 1 - j;
    let s = target + dir * dist;
    // for longer runs, turn around once (neighbour-note figure)
    if (k >= 4 && j === 0) s = target + dir * (dist - 2);
    out.push({ b, d: rhy[j], s, v: j === k - 1 ? 0.85 : 0.78 });
    b += rhy[j];
    void dir;
  }
  dir = 0;
  return out;
}

export interface PeriodOpts {
  lo: number;
  hi: number;
  /** first note (scale index) */
  start: number;
  density: 'sparse' | 'mid' | 'busy';
  /** final cadence note of the period (default: tonic nearest the start) */
  end?: number;
}

/** 8-bar period: a a' b half-cadence | a a' c full-cadence */
export function period(r: Rng, sc: Scale, o: PeriodOpts): Period {
  const pal = RHY[o.density];
  const r0 = r.pick(pal);
  const r1 = r.chance(0.6) ? r0 : r.pick(pal);
  const busier = o.density === 'sparse' ? RHY.mid : o.density === 'mid' ? RHY.busy : RHY.busy;
  const top = o.hi;
  const m0 = barMel(r, r0, o.start, o.lo, o.hi, o.start + r.pick([2, 3, -2, 3]));
  const seq = r.pick([1, 1, -1, 2, 0]);
  let m1: MNote[];
  if (r1 === r0 && seq !== 0) m1 = m0.map((n) => ({ ...n, s: reflect(n.s + seq, o.lo, o.hi) }));
  else m1 = barMel(r, r1, reflect(m0[m0.length - 1].s + r.pick([1, -1, 2]), o.lo, o.hi), o.lo, o.hi, o.start + r.pick([1, 4, -1]));
  const m2 = barMel(r, r.pick(busier), m1[m1.length - 1].s, o.lo, o.hi, top);
  const tonicNear = (s: number) => sc.nearest(sc.mode, s);
  const halfT = sc.nearest((sc.mode + r.pick([3, 3, 1, 4])) % 5, m2[m2.length - 1].s);
  const m3 = cadence(r, r.pick(RHY.cad), m2[m2.length - 1].s, reflect(halfT, o.lo, o.hi));
  const m6 = barMel(r, r.pick(busier), reflect(m1[m1.length - 1].s + 1, o.lo, o.hi), o.lo, o.hi, Math.round((o.lo + o.hi) / 2));
  const endT = o.end ?? tonicNear(o.start);
  const m7 = cadence(r, r.pick(RHY.fin), m6[m6.length - 1].s, endT);
  // consequent repeats the first two bars, with a small change at the end of bar 2
  const m5 = m1.map((n, i) => (i === m1.length - 1 && r.chance(0.5) ? { ...n, s: reflect(n.s + r.pick([1, -1]), o.lo, o.hi) } : { ...n }));
  const bars = [m0, m1, m2, m3, m0.map((n) => ({ ...n })), m5, m6, m7];
  const notes: MNote[] = [];
  bars.forEach((bn, i) => bn.forEach((n) => notes.push({ ...n, b: n.b + i * 16 })));
  // roots per bar
  const roots: number[] = [];
  let prevRoot = -99;
  for (let i = 0; i < 8; i++) {
    const want = i === 0 || i === 4 || i === 7 ? sc.mode : i === 3 ? (sc.mode + 3) % 5 : -1;
    const root = chooseRoot(r, sc, bars[i], want, prevRoot);
    roots.push(root);
    prevRoot = root;
  }
  return { notes, roots, bars: 8 };
}

const CONS: Record<number, number> = { 0: 3, 7: 2.4, 4: 2, 3: 2, 9: 1.2, 5: 0.9, 8: 0.8, 2: 0.2, 10: 0.2 };
/** pick a bass degree (0..4) for a bar of melody */
function chooseRoot(r: Rng, sc: Scale, bar: MNote[], want: number, prev: number) {
  let best = sc.mode, bs = -1e9;
  for (let deg = 0; deg < 5; deg++) {
    const rm = sc.midi(deg);
    let sc0 = 0;
    for (const n of bar) {
      const w = n.d * (n.b % 8 === 0 ? 2 : n.b % 4 === 0 ? 1.3 : 0.7);
      const iv = (((sc.midi(n.s) - rm) % 12) + 12) % 12;
      sc0 += w * (CONS[iv] ?? -1);
    }
    if (deg === want) sc0 += 18;
    if (deg === prev) sc0 -= 4;
    if (deg === sc.mode) sc0 += 3;
    sc0 += r.range(0, 3);
    if (sc0 > bs) (bs = sc0), (best = deg);
  }
  return best;
}

// ------------------------------------------------------------------ arrangement
export type Lead =
  | { ins: LineIns; oct?: number; gain?: number; pan?: number; rev?: number; orn?: number }
  | { ins: PluckIns; oct?: number; gain?: number; pan?: number; rev?: number; orn?: number; trem?: boolean }
  | { ins: 'bell'; oct?: number; gain?: number; pan?: number; rev?: number; orn?: number };

export type OstPat = 'gallop' | 'drive' | 'run16' | 'arp8' | 'calm' | 'sparse' | 'pulse8' | 'roll';
export type DrumPat = 'war1' | 'war2' | 'war3' | 'march' | 'calm' | 'heart' | 'festive' | 'epic' | 'epic2' | 'roll' | 'court' | 'none';

export interface Sec {
  bars: number;
  mel?: 'A' | 'B' | 'C';
  /** which half of the period to start at (for 4-bar sections) */
  half?: 0 | 1;
  lead?: Lead[];
  counter?: { ins: LineIns | PluckIns; oct?: number; gain?: number; pan?: number };
  ost?: { ins: PluckIns; pat: OstPat; oct?: number; gain?: number; pan?: number };
  ost2?: { ins: PluckIns; pat: OstPat; oct?: number; gain?: number; pan?: number };
  bass?: { kind: 'pluck' | 'drone' | 'pulse' | 'qin'; gain?: number };
  pad?: number;
  drums?: DrumPat;
  dgain?: number;
  fill?: 4 | 8 | 0;
  accent?: ('luo' | 'tamtam' | 'bo' | 'xiaoluo' | 'glis' | 'bell')[];
  /** bars of roots when there is no melody */
  vamp?: number[];
}

export interface SongDef {
  seed: number;
  bpm: number;
  key: number;
  mode: ModeName;
  /** themes: start index offsets (relative to tonic), register, density */
  themes: Partial<Record<'A' | 'B' | 'C', { lo: number; hi: number; start: number; density: PeriodOpts['density'] }>>;
  secs: Sec[];
  reverb?: { t60?: number; damp?: number; wet?: number };
  /** loudness target (dBFS RMS) */
  loud?: number;
}

const DRUMS: Record<Exclude<DrumPat, 'none'>, Partial<Record<Perc, string>>> = {
  war1: { dagu: '9..5..7.9..5.5..', xiaogu: '....7.......7...', rim: '3.2.3.2.3.2.3.2.' },
  war2: { dagu: '9.....7.9.....7.', tanggu: '..5.5..5..5.5..5', xiaogu: '....8.......8...' },
  war3: { dagu: '9...9...9...9...', tanggu: '..4...4...4..55.', bochoke: '....6.......6...', rim: '2.2.2.2.2.2.2.2.' },
  march: { dagu: '9.......7.......', xiaogu: '....6.......6.5.', rim: '3.2.3.2.3.2.3.2.' },
  calm: { muyu: '5.......3.......' },
  court: { muyu: '5.......4.......', xiaogu: '............3...' },
  heart: { dagu: '8..5............', dagu2: '........6..4....' },
  festive: { dagu: '9...6...9.6.6...', bochoke: '....7.......7...', bangzi: '6.4.6.4.6.4.6.4.', xiaogu: '..3...3...3...3.' },
  epic: { dagu: '9.......9..6....', dagu2: '....6.......6.6.' },
  epic2: { dagu: '9..6..9.9..6..6.', dagu2: '....7.......7.7.', tanggu: '..4...4...4...4.', rim: '2.2.2.2.2.2.2.2.' },
  roll: { tanggu: '3434454556567678', dagu: '9...............' },
};
const FILL: Partial<Record<Perc, string>> = { tanggu: '........45678899', dagu: '..............9.' };

const R = -99;
const OST: Record<OstPat, number[]> = {
  gallop: [0, R, 0, 3, 0, R, 0, 5, 0, R, 0, 3, 2, R, 3, R],
  drive: [0, R, 5, R, 3, R, 5, R, 0, R, 5, R, 3, R, 2, R],
  run16: [0, 2, 3, 5, 6, 5, 3, 2, 0, 2, 3, 5, 7, 5, 3, 2],
  arp8: [0, R, 3, R, 5, R, 7, R, 8, R, 7, R, 5, R, 3, R],
  calm: [0, R, R, R, 3, R, 5, R, R, R, 7, R, 5, R, R, R],
  sparse: [0, R, R, R, R, R, R, R, 5, R, R, R, 3, R, R, R],
  pulse8: [0, R, 0, R, 0, R, 0, R, 0, R, 0, R, 0, R, 0, R],
  roll: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
};

export function renderSong(def: SongDef, rate = 32000): { rate: number; left: Float32Array; right: Float32Array } {
  const r = rng(def.seed);
  const sc = new Scale(def.key, MODE[def.mode]);
  const spb = 60 / def.bpm;
  const s16 = spb / 4;
  const totalBars = def.secs.reduce((a, s) => a + s.bars, 0);
  const L = totalBars * 16 * s16;
  const TAIL = 7;
  const mix = new Mix(rate, Math.round((L + TAIL) * rate));
  mix.loop = Math.round(L * rate);
  const hum = () => r.gauss() * 0.004;

  // themes
  const themes: Partial<Record<'A' | 'B' | 'C', Period>> = {};
  for (const k of ['A', 'B', 'C'] as const) {
    const t = def.themes[k];
    if (!t) continue;
    const tonic = sc.tonic(0);
    themes[k] = period(rng(def.seed * 31 + k.charCodeAt(0)), sc, { lo: tonic + t.lo, hi: tonic + t.hi, start: tonic + t.start, density: t.density });
  }

  // caches
  const pc = new Map<string, Float32Array>();
  const pluckAt = (ins: PluckIns, m: number, t: number, v: number, pan: number, rev: number, cut?: number) => {
    const key = `${ins}|${m}|${(Math.round(t * 7) & 1)}`;
    let b = pc.get(key);
    if (!b) pc.set(key, (b = renderPluck(rate, ins, m, rng(def.seed + m * 13 + key.length))));
    if (cut !== undefined && cut * rate < b.length) {
      const c = b.slice(0, Math.round(cut * rate) + Math.round(rate * 0.06));
      const n0 = Math.round(cut * rate), fo = c.length - n0;
      for (let i = 0; i < fo; i++) c[n0 + i] *= 1 - i / fo;
      mix.add(c, t, v, pan, rev);
    } else mix.add(b, t, v, pan, rev);
  };
  const perc = new Map<string, Float32Array>();
  const percAt = (k: Perc, t: number, v: number, pan = 0, rev = 0.15) => {
    const key = `${k}|${r.int(0, 2)}`;
    let b = perc.get(key);
    if (!b) perc.set(key, (b = renderPerc(rate, k, def.seed + key.length * 101 + key.charCodeAt(key.length - 1))));
    mix.add(b, t, v, pan, rev);
  };
  const bells = new Map<number, Float32Array>();
  const bellAt = (m: number, t: number, v: number, pan: number, rev: number) => {
    let b = bells.get(m);
    if (!b) bells.set(m, (b = renderBell(rate, m, def.seed + m)));
    mix.add(b, t, v, pan, rev);
  };
  const PERC_PAN: Partial<Record<Perc, number>> = { dagu: -0.1, dagu2: 0.25, tanggu: 0.35, xiaogu: -0.3, rim: 0.4, muyu: 0.3, bangzi: -0.4, bochoke: 0.2, bo: 0.15 };

  let bar0 = 0;
  for (const sec of def.secs) {
    const T = (bar: number, x16: number) => (bar * 16 + x16) * s16;
    const th = sec.mel ? themes[sec.mel] : undefined;
    const startBar = sec.half ? 4 : 0;
    // roots per bar of this section
    const roots: number[] = [];
    for (let i = 0; i < sec.bars; i++) {
      if (th) roots.push(th.roots[(startBar + i) % th.bars]);
      else if (sec.vamp) roots.push((sc.mode + sec.vamp[i % sec.vamp.length] + 50) % 5);
      else roots.push(sc.mode);
    }
    const isLastSec = sec === def.secs[def.secs.length - 1];

    // melody notes (absolute 16ths) for this section
    const mel: MNote[] = [];
    if (th) {
      const reps = Math.ceil((startBar * 16 + sec.bars * 16) / (th.bars * 16)) + 1;
      for (let k = 0; k < reps; k++)
        for (const n of th.notes) {
          const b = n.b + k * th.bars * 16 - startBar * 16;
          if (b >= 0 && b < sec.bars * 16) mel.push({ ...n, b, d: Math.min(n.d, sec.bars * 16 - b) });
        }
    }

    // ---- leads
    for (const [li, ld] of (sec.lead ?? []).entries()) {
      const oct = (ld.oct ?? 0) * 12;
      const gain = ld.gain ?? 0.5, pan = ld.pan ?? 0, rev = ld.rev ?? 0.3, orn = ld.orn ?? 0.3;
      const lr = rng(def.seed + bar0 * 7 + li);
      if (ld.ins === 'dizi' || ld.ins === 'xiao' || ld.ins === 'erhu' || ld.ins === 'suona' || ld.ins === 'cello') {
        const notes: LineNote[] = mel.map((n, i) => {
          const m = sc.midi(n.s) + oct;
          const nx = mel[i + 1];
          const legato = ld.ins === 'erhu' || ld.ins === 'cello' ? 1.0 : 0.92;
          const ln: LineNote = { t: (bar0 * 16 + n.b) * s16 + hum(), d: n.d * s16 * (nx && nx.b === n.b + n.d ? legato : 0.85), m, v: n.v };
          if (n.d >= 4 && lr.chance(orn)) {
            if (ld.ins === 'erhu') ln.slide = true;
            else ln.g = sc.midi(n.s + 1) + oct;
          }
          if (ld.ins === 'erhu' && lr.chance(0.25)) ln.slide = true;
          return ln;
        });
        if (notes.length) {
          const { t0, data } = renderLine(rate, ld.ins, notes, def.seed + bar0 + li * 977);
          mix.add(data, t0, gain, pan, rev);
        }
      } else if (ld.ins === 'bell') {
        for (const n of mel) if (n.b % 8 === 0 || n.d >= 8) bellAt(sc.midi(n.s) + oct, (bar0 * 16 + n.b) * s16 + hum(), gain * n.v, pan, rev);
      } else {
        const ins = ld.ins;
        const trem = 'trem' in ld && ld.trem;
        for (const n of mel) {
          const m = sc.midi(n.s) + oct;
          const t = (bar0 * 16 + n.b) * s16 + hum();
          if (trem && n.d >= 6) {
            // 轮指 tremolo
            const step = Math.min(s16 / 2, 0.065);
            const cnt = Math.floor((n.d * s16 - 0.05) / step);
            for (let j = 0; j < cnt; j++) pluckAt(ins, m, t + j * step, gain * n.v * (j === 0 ? 1 : 0.5 + 0.1 * Math.sin(j)), pan, rev, step * 1.6);
          } else if (n.d >= 8 && lr.chance(orn) && ins !== 'pipa') {
            // 按滑: bend up from the lower neighbour
            const lower = sc.midi(n.s - 1) + oct;
            const ratio = mtof(m) / mtof(lower);
            mix.add(renderPluck(rate, ins, lower, lr, { bend: { to: ratio, at: 0.04, len: 0.12 }, vib: { depth: 0.004, rate: 5, at: 0.5 } }), t, gain * n.v, pan, rev);
          } else pluckAt(ins, m, t, gain * n.v, pan, rev, n.d * s16 + 0.4);
          // zheng doubles strong notes an octave below
          if (ins === 'zheng' && n.d >= 8) pluckAt(ins, m - 12, t + 0.01, gain * n.v * 0.4, pan, rev);
        }
      }
    }

    // ---- counter line: chord tones, smooth voice leading
    if (sec.counter && th) {
      const oct = (sec.counter.oct ?? -1) * 12;
      const notes: LineNote[] = [];
      let prev = sc.midi(sc.tonic(0)) + oct;
      for (let b = 0; b < sec.bars; b++) {
        for (const half of [0, 8]) {
          const root = roots[b];
          const cands: number[] = [];
          for (const st of [0, 2, 3]) for (const o of [-12, 0, 12]) cands.push(sc.midi(root + st) + oct + o);
          const melHere = mel.find((n) => n.b <= b * 16 + half && n.b + n.d > b * 16 + half);
          let best = prev, bd = 1e9;
          for (const c of cands) {
            let dd = Math.abs(c - prev) + (c === prev ? 1.5 : 0);
            if (melHere && (((sc.midi(melHere.s) - c) % 12) + 12) % 12 === 0) dd += 4;
            if (c < 43 || c > 84) dd += 20;
            if (dd < bd) (bd = dd), (best = c);
          }
          prev = best;
          notes.push({ t: T(bar0 + b, half) + hum(), d: 8 * s16 * 0.98, m: best, v: 0.55, slide: r.chance(0.3) });
        }
      }
      const ci = sec.counter.ins;
      if (ci === 'dizi' || ci === 'xiao' || ci === 'erhu' || ci === 'suona' || ci === 'cello') {
        const { t0, data } = renderLine(rate, ci, notes, def.seed + bar0 * 3 + 5);
        mix.add(data, t0, sec.counter.gain ?? 0.3, sec.counter.pan ?? 0.3, 0.35);
      } else for (const n of notes) pluckAt(ci, n.m, n.t, (sec.counter.gain ?? 0.3) * 0.8, sec.counter.pan ?? 0.3, 0.3);
    }

    // ---- ostinati
    for (const os of [sec.ost, sec.ost2]) {
      if (!os) continue;
      const pat = OST[os.pat];
      const oct = os.oct ?? 0;
      for (let b = 0; b < sec.bars; b++) {
        const base = roots[b] + oct * 5;
        for (let x = 0; x < 16; x++) {
          const st = pat[x];
          if (st === R) continue;
          const m = sc.midi(base + st);
          const acc = x % 4 === 0 ? 1 : 0.72;
          // let notes ring until the next note of the pattern
          let nx = x + 1;
          while (nx < 16 && pat[nx] === R) nx++;
          pluckAt(os.ins, m, T(bar0 + b, x) + hum(), (os.gain ?? 0.3) * acc * r.range(0.9, 1.05), os.pan ?? -0.35, 0.25, os.pat === 'roll' ? s16 * 1.2 : (nx - x) * s16 + 0.25);
        }
      }
    }

    // ---- bass
    if (sec.bass) {
      const g = sec.bass.gain ?? 0.45;
      for (let b = 0; b < sec.bars; b++) {
        const root = sc.midi(roots[b]);
        let m = root;
        while (m > 50) m -= 12;
        while (m < 38) m += 12;
        const k = sec.bass.kind;
        if (k === 'pluck') {
          pluckAt('ruan', m, T(bar0 + b, 0) + hum(), g, 0, 0.12);
          pluckAt('ruan', m + (r.chance(0.5) ? 7 : 12) - (sc.midi(roots[b] + 3) - root === 7 ? 0 : 0), T(bar0 + b, 8) + hum(), g * 0.7, 0, 0.12);
        } else if (k === 'pulse') {
          for (let x = 0; x < 16; x += 2) pluckAt('ruan', m, T(bar0 + b, x) + hum(), g * (x % 8 === 0 ? 1 : 0.6), 0, 0.1, s16 * 1.6);
        } else if (k === 'qin') {
          pluckAt('qin', m, T(bar0 + b, 0) + hum(), g, -0.1, 0.3);
          if (b % 2 === 1) pluckAt('qin', m + 12, T(bar0 + b, 8) + hum(), g * 0.5, -0.1, 0.3);
        }
      }
      if (sec.bass.kind === 'drone') {
        const notes: LineNote[] = [];
        for (let b = 0; b < sec.bars; b++) {
          let m = sc.midi(roots[b]);
          while (m > 45) m -= 12;
          while (m < 33) m += 12;
          notes.push({ t: T(bar0 + b, 0), d: 16 * s16 * 0.99, m, v: 0.7, slide: true });
        }
        const { t0, data } = renderLine(rate, 'cello', notes, def.seed + bar0 + 77);
        mix.add(data, t0, g, 0, 0.25);
      }
    }

    // ---- pad
    if (sec.pad) {
      let b = 0;
      while (b < sec.bars) {
        let e = b + 1;
        while (e < sec.bars && roots[e] === roots[b]) e++;
        const root = roots[b];
        let m = sc.midi(root);
        while (m > 52) m -= 12;
        while (m < 43) m += 12;
        const fifth = sc.midi(root + 3) - sc.midi(root) === 7 ? m + 7 : m + 5;
        let color = sc.midi(root + 2);
        while (color < m + 12) color += 12;
        while (color > m + 19) color -= 12;
        const chord = [m, fifth, m + 12, color];
        const [pl, pr] = renderPad(rate, chord, (e - b) * 16 * s16, def.seed + bar0 + b, { att: Math.min(1.2, s16 * 8), rel: 0.9 });
        mix.add2(pl, pr, T(bar0 + b, 0), sec.pad, 0.45);
        b = e;
      }
    }

    // ---- drums
    if (sec.drums && sec.drums !== 'none') {
      const pat = DRUMS[sec.drums];
      const dg = sec.dgain ?? 0.6;
      for (let b = 0; b < sec.bars; b++) {
        const fillHere = sec.fill && ((b + 1) % sec.fill === 0 || b === sec.bars - 1) && (b === sec.bars - 1 || r.chance(0.7));
        for (const [k, s] of Object.entries(fillHere ? { ...pat, ...FILL, ...(pat.dagu ? { dagu: pat.dagu.slice(0, 8) + FILL.dagu!.slice(8) } : {}) } : pat) as [Perc, string][]) {
          for (let x = 0; x < 16; x++) {
            const c = s[x];
            if (c === '.' || c === undefined) continue;
            const v = (+c / 9) * dg * r.range(0.88, 1.05);
            percAt(k, T(bar0 + b, x) + hum() * 0.5, v, PERC_PAN[k] ?? 0, k === 'dagu' || k === 'dagu2' ? 0.22 : 0.12);
          }
        }
      }
    } else if (sec.fill && isLastSec) {
      // pickup into the loop start
      for (let x = 8; x < 16; x++) percAt('tanggu', T(bar0 + sec.bars - 1, x), 0.25 + x * 0.025, 0.3, 0.15);
    }

    // ---- accents
    for (const a of sec.accent ?? []) {
      const t = T(bar0, 0);
      if (a === 'luo') percAt('luo', t, 0.55, 0.1, 0.35);
      else if (a === 'tamtam') percAt('tamtam', t, 0.8, 0, 0.5);
      else if (a === 'bo') percAt('bo', t, 0.45, 0.2, 0.3);
      else if (a === 'xiaoluo') percAt('xiaoluo', t, 0.35, -0.2, 0.3);
      else if (a === 'bell') bellAt(sc.midi(sc.tonic(1)), t, 0.4, -0.2, 0.45);
      else if (a === 'glis') {
        // 刮奏: zheng glissando sweeping up to the downbeat
        const n = 14;
        for (let j = 0; j < n; j++) pluckAt('zheng', sc.midi(sc.tonic(-1) + j), t - (n - j) * 0.028, 0.18 + j * 0.012, -0.4 + j * 0.05, 0.35);
      }
    }
    bar0 += sec.bars;
  }

  mix.reverb({ t60: 2.4, damp: 4500, wet: 1, ...def.reverb });

  // fold the tail over the loop start, crossfading the seam
  const n = Math.round(L * rate);
  const left = mix.L.slice(0, n), right = mix.R.slice(0, n);
  for (let i = 0; i < mix.len - n && i < n; i++) {
    left[i] += mix.L[n + i];
    right[i] += mix.R[n + i];
  }
  // remove DC
  for (const b of [left, right]) {
    let m = 0;
    for (let i = 0; i < b.length; i++) m += b[i];
    m /= b.length;
    for (let i = 0; i < b.length; i++) b[i] -= m;
  }
  // loudness → limiter
  const lv = Math.sqrt((rms(left) ** 2 + rms(right) ** 2) / 2);
  const g = db(def.loud ?? -17) / Math.max(1e-6, lv);
  for (let i = 0; i < n; i++) (left[i] *= g), (right[i] *= g);
  limit(rate, left, right, db(-1), true);
  return { rate, left, right };
}
