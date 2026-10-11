// Original sound effects for 三国墨英传, all synthesized: UI cues, weapons,
// impacts, voices (war cries, grunts, death cries), horses and beasts,
// fire/water/thunder/wind, explosions and the 武将技 (mNNNsndXX) spells.
import { Biquad, db, envAD, fadeEdges, hash, mixInto, monoVerb, mtof, noise, partials, peak, rng, TAU, trimTail, type Rng } from './_dsp.ts';
import { renderBell, renderLine, renderPerc, renderPluck } from './_instr.ts';
import { at, boom, chimes, clang, crackle, creak, crowd, decay, fire, hooves, hump, mk, SR, sparkle, sweepNoise, thud, thunder, voice, water, whoosh, wind, type Vowel } from './_sfxkit.ts';

type Recipe = (r: Rng) => Float32Array;
/** recipe + peak level (dBFS) + reverb amount */
type Def = [Recipe, number?, number?];

const PENTA = [0, 2, 4, 7, 9];
const pent = (root: number, k: number) => root + PENTA[((k % 5) + 5) % 5] + 12 * Math.floor(k / 5);

// ------------------------------------------------------------------ helpers
const perc = (k: Parameters<typeof renderPerc>[1], seed: number) => renderPerc(SR, k, seed);
const pl = (ins: Parameters<typeof renderPluck>[1], m: number, r: Rng, len?: number) => renderPluck(SR, ins, m, r, { len });

function seq(len: number, parts: [number, Float32Array, number][]) {
  const b = mk(len);
  for (const [t, s, g] of parts) at(b, s, t, g);
  return b;
}

/** short male/female exclamation */
function shout(r: Rng, o: { sec: number; f0: number; fall?: number; vowel: Vowel | [number, Exclude<Vowel, 'ei'>][]; female?: boolean; h?: boolean; effort?: number; att?: number }) {
  const f0 = o.female ? o.f0 * 1.9 : o.f0;
  const fall = o.fall ?? 0.75;
  const att = o.att ?? 0.02;
  return voice(r, {
    sec: o.sec,
    f0: (t) => f0 * (t < 0.06 ? 0.92 + (t / 0.06) * 0.08 : 1 - (1 - fall) * Math.pow((t - 0.06) / o.sec, 1.3)),
    vowel: o.vowel,
    amp: (t) => (t < att ? t / att : 1) * Math.pow(Math.max(0, 1 - t / o.sec), 0.8),
    breath: (t) => (o.h && t < 0.06 ? 1 : 0.18 + (t / o.sec) * 0.4),
    female: o.female,
    effort: o.effort ?? 0.8,
  });
}

/** death cry: long falling vowel, breaking into breath */
function deathCry(r: Rng, female: boolean, sec: number, f0: number, v: Vowel | [number, Exclude<Vowel, 'ei'>][] = 'a') {
  const base = female ? f0 * 1.9 : f0;
  return voice(r, {
    sec,
    f0: (t) => base * (t < 0.1 ? 1 + t * 1.5 : 1.15 * Math.pow(0.55, (t - 0.1) / sec)) * (1 + 0.03 * Math.sin(t * 38)),
    vowel: v,
    amp: (t) => (t < 0.03 ? t / 0.03 : 1) * Math.pow(Math.max(0, 1 - t / sec), 1.2),
    breath: (t) => 0.2 + 0.7 * (t / sec),
    female,
    effort: 0.9,
  });
}

/** sword: whoosh into a ringing blade */
function blade(r: Rng, f: number, ring = 0.6, sw = 0.08) {
  const b = mk(sw + ring);
  at(b, whoosh(r, sw + 0.04, 900, 3500, 1.4, 0.8), 0, 0.5);
  at(b, clang(r, f, ring, 1), sw, 0.9);
  at(b, thud(r, 200, 0.12, 1), sw, 0.3);
  return b;
}

function twang(r: Rng, f = 140) {
  const b = mk(0.3);
  const s = renderPluck(SR, 'ruan', 12 * Math.log2(f / 440) + 69, r, { len: 0.25 });
  at(b, s, 0, 0.6);
  at(b, whoosh(r, 0.22, 2500, 800, 1.5, 0.25), 0.01, 0.5);
  return b;
}

function stoneHit(r: Rng, sec = 0.6) {
  const b = mk(sec);
  at(b, thud(r, 70, sec, 1), 0, 1);
  at(b, crackle(r, sec * 0.6, 120, SR, 2500), 0.01, 0.6);
  return b;
}

function horn(r: Rng, sec: number, midi: number) {
  // 号角: buzzy low brass, rising into pitch
  const b = mk(sec);
  const f = mtof(midi);
  let ph = 0;
  for (let i = 0; i < b.length; i++) {
    const t = i / SR;
    const ff = f * (t < 0.15 ? 0.94 + 0.06 * (t / 0.15) : 1) * (1 + 0.004 * Math.sin(t * 30));
    ph += ff / SR;
    if (ph >= 1) ph -= 1;
    b[i] = (2 * ph - 1) * hump(sec, 0.25, 0.7)(t);
  }
  new Biquad(SR).peak(700, 1.5, 9).run(b);
  new Biquad(SR).lp(1800).run(b);
  for (let i = 0; i < b.length; i++) b[i] = Math.tanh(b[i] * 1.6);
  void r;
  return b;
}

function roar(r: Rng, sec: number, f0: number, tract = 0.75, vowel: Vowel | [number, Exclude<Vowel, 'ei'>][] = [[0, 'o'], [0.3, 'a'], [1, 'o']]) {
  const v = voice(r, {
    sec,
    f0: (t) => f0 * (0.8 + 0.4 * hump(sec, 0.3, 1)(t)) * (1 + 0.15 * Math.sin(t * 70) * Math.sin(t * 9)),
    vowel,
    amp: hump(sec, 0.25, 0.7),
    breath: () => 0.55,
    effort: 1,
    tract,
  });
  const g = sweepNoise(r, sec, () => 300, hump(sec, 0.3, 0.8), 0.8);
  mixInto(v, g, 0, 0.8);
  return v;
}

function ascend(r: Rng, root: number, n: number, step: number, sec: number, a = 1) {
  const notes: [number, number, number][] = [];
  for (let k = 0; k < n; k++) notes.push([k * step, pent(root, k), a * (0.6 + 0.4 * (k / n))]);
  return chimes(r, notes, sec);
}

function marching(r: Rng, sec: number, light = false) {
  const b = mk(sec);
  // many feet, roughly in step
  for (let k = 0; k < (light ? 10 : 18); k++) {
    let t = r.range(0, 0.25);
    const per = r.range(0.42, 0.5);
    while (t < sec - 0.1) {
      at(b, thud(r, r.range(90, 140), 0.12, 0.6), t, r.range(0.15, 0.3));
      t += per;
    }
  }
  // armour jingle
  const j = crackle(r, sec, light ? 80 : 160, SR, 4500);
  mixInto(b, j, 0, 0.25);
  const env = hump(sec, 0.3, 0.6);
  for (let i = 0; i < b.length; i++) b[i] *= env(i / SR) * 0.7 + 0.3;
  return b;
}

function magicSwell(r: Rng, sec: number, root: number) {
  const b = mk(sec);
  at(b, sweepNoise(r, sec, (t) => 800 + 3000 * (t / sec), hump(sec, 0.6, 1), 3), 0, 0.5);
  at(b, sparkle(r, sec, Math.round(sec * 30), 2500, 7000), 0, 0.7);
  at(b, ascend(r, root, 6, sec / 9, sec), 0, 0.6);
  return b;
}

function chains(r: Rng, sec: number) {
  const b = mk(sec);
  for (let k = 0; k < sec * 25; k++) at(b, clang(r, r.range(1800, 3200), 0.12, 1.2), r.range(0, sec * 0.85), r.range(0.1, 0.3));
  return b;
}

function rumble(r: Rng, sec: number, cut = 160) {
  const b = mk(sec);
  noise(r, b);
  new Biquad(SR).lp(cut, 0.9).run(b);
  new Biquad(SR).lp(cut * 1.3, 0.7).run(b);
  const env = hump(sec, 0.3, 0.8);
  for (let i = 0; i < b.length; i++) b[i] *= env(i / SR) * 4;
  return b;
}

function zap(r: Rng, sec: number, f0: number, f1: number) {
  const b = mk(sec);
  let ph = 0;
  for (let i = 0; i < b.length; i++) {
    const t = i / SR;
    const f = f0 * Math.pow(f1 / f0, t / sec);
    ph += f / SR;
    const s = Math.sin(TAU * ph) + 0.4 * Math.sin(TAU * ph * 2.01) + 0.2 * Math.sin(TAU * ph * 3.03);
    b[i] = s * decay(sec * 0.8, 0.003)(t) * (1 + 0.3 * (r.next() - 0.5));
  }
  return b;
}

// ------------------------------------------------------------------ voice tables
const KIAI: Record<string, { v: Vowel | [number, Exclude<Vowel, 'ei'>][]; sec: number; h?: boolean; f0: number }> = {
  a: { v: 'a', sec: 0.45, f0: 190 },
  ha: { v: 'a', sec: 0.5, h: true, f0: 200 },
  ho: { v: 'o', sec: 0.4, h: true, f0: 185 },
  hu: { v: 'u', sec: 0.4, h: true, f0: 175 },
  n: { v: 'n', sec: 0.45, f0: 150 },
  n3: { v: [[0, 'n'], [0.2, 'a']], sec: 0.55, f0: 160 },
  ya: { v: [[0, 'i'], [0.08, 'a']], sec: 0.55, f0: 210 },
  ya2: { v: [[0, 'i'], [0.06, 'a']], sec: 0.35, f0: 230 },
  wa: { v: [[0, 'u'], [0.07, 'a']], sec: 0.55, f0: 200 },
};

// ------------------------------------------------------------------ recipes
const S: Record<string, Def> = {};

// UI ---------------------------------------------------------------
S.touch = [(r) => seq(0.22, [[0, pl('zheng', 81, r, 0.2), 0.35], [0, perc('rim', 5), 0.25]]), -9, 0.1];
S.menushot = [(r) => seq(0.18, [[0, perc('bangzi', 2), 0.6], [0, whoosh(r, 0.12, 1500, 4000, 2, 0.3), 0.3]]), -8];
S.accept = [(r) => seq(0.6, [[0, pl('zheng', 76, r, 0.5), 0.5], [0.07, pl('zheng', 81, r, 0.5), 0.6], [0.07, renderBell(SR, 93, 3, 'qing').subarray(0, Math.round(SR * 0.5)), 0.12]]), -6, 0.15];
S.accept01 = [(r) => seq(0.7, [[0, renderBell(SR, 84, 7, 'qing').subarray(0, Math.round(SR * 0.7)), 0.6], [0, pl('pipa', 72, r, 0.4), 0.3]]), -6, 0.2];
S._ding = [() => renderBell(SR, 88, 9, 'qing').slice(0, Math.round(SR * 0.6)), -7, 0.2];
S.sorry = [(r) => seq(0.7, [[0, pl('pipa', 64, r, 0.25), 0.6], [0.14, pl('pipa', 59, r, 0.5), 0.6], [0.14, perc('muyu', 4), 0.2]]), -7, 0.15];
S.lucky = [(r) => seq(1.8, [[0, ascend(r, 72, 8, 0.07, 1.8), 1], [0.05, sparkle(r, 1.5, 40), 0.6], [0, perc('xiaoluo', 3), 0.25]]), -4, 0.35];
S.level = [(r) => {
  const b = mk(1.9);
  for (let k = 0; k < 7; k++) at(b, pl('zheng', pent(67, k), r, 1.4), k * 0.06, 0.5);
  at(b, chimes(r, [[0, 79, 1], [0, 86, 0.7], [0, 91, 0.5]], 1.4), 0.45, 0.7);
  at(b, sparkle(r, 1.2, 30, 3000, 8000), 0.4, 0.6);
  return b;
}, -3, 0.35];
S.win = [(r) => {
  const b = mk(2.2);
  at(b, perc('dagu', 1), 0, 0.8);
  at(b, perc('dagu', 2), 0.16, 0.6);
  at(b, perc('dagu', 3), 0.32, 0.9);
  at(b, perc('bo', 4), 0.32, 0.5);
  at(b, perc('xiaoluo', 5), 0.32, 0.5);
  for (let k = 0; k < 6; k++) at(b, pl('zheng', pent(60, k + 3), r, 1.5), 0.32 + k * 0.05, 0.4);
  at(b, chimes(r, [[0, 84, 1], [0, 91, 0.6]], 1.6), 0.6, 0.5);
  return b;
}, -2, 0.3];
S.lose = [(r) => {
  const b = mk(2.4);
  at(b, perc('luo', 2).subarray(0, Math.round(SR * 2.3)), 0, 0.6);
  const { t0, data } = renderLine(SR, 'erhu', [{ t: 0.15, d: 0.45, m: 64, v: 0.8 }, { t: 0.6, d: 0.45, m: 62, v: 0.75, slide: true }, { t: 1.05, d: 0.9, m: 57, v: 0.7, slide: true }], hash('lose'));
  at(b, data, t0, 0.8);
  return b;
}, -3, 0.35];
S.vs = [(r) => {
  const b = mk(2.8);
  at(b, perc('dagu', 1), 0, 0.7);
  at(b, perc('dagu', 2), 0.22, 0.7);
  at(b, perc('dagu', 3), 0.38, 0.8);
  at(b, perc('dagu', 4), 0.5, 0.9);
  at(b, perc('tamtam', 5), 0.6, 1);
  at(b, perc('bo', 6), 0.6, 0.4);
  void r;
  return b;
}, -1, 0.35];
S.bounce = [(r) => {
  const b = mk(0.75);
  let t = 0, g = 1, dt = 0.12;
  for (let k = 0; k < 8; k++) {
    const c = mk(0.05);
    partials(c, SR, [{ f: r.range(2600, 3400), a: 0.4, t60: 0.03 }, { f: r.range(4800, 6000), a: 0.2, t60: 0.02 }, { f: r.range(900, 1200), a: 0.3, t60: 0.04 }]);
    at(b, c, t, g);
    t += dt;
    dt *= 0.78;
    g *= 0.82;
  }
  return b;
}, -6];
S.sbounce = [(r) => seq(0.35, [[0, perc('muyu', 2), 0.7], [0.12, perc('muyu', 3), 0.35], [0.0, thud(r, 180, 0.15, 0.3), 0.3]]), -6];
S.test = [(r) => chimes(r, [[0, 69, 1], [0, 76, 0.6]], 1.2), -6];
S.effect00 = [(r) => magicSwell(r, 1.0, 72), -4, 0.4];
S.tuta = [() => seq(0.5, [[0, perc('muyu', 1), 0.7], [0.18, perc('muyu', 7), 0.5]]), -6];
S.tutb = [() => renderBell(SR, 81, 4, 'qing').slice(0, Math.round(SR * 0.6)), -7, 0.2];
S.sstart = [(r) => seq(0.5, [[0, whoosh(r, 0.3, 600, 3000, 1.5, 0.8), 0.6], [0.28, perc('bangzi', 1), 0.8]]), -4];
S.sstop = [() => seq(0.9, [[0, perc('xiaoluo', 1), 0.7], [0.18, perc('xiaoluo', 2), 0.8]]), -3, 0.25];

// weapons & impacts ---------------------------------------------------
const HIT_F = [130, 155, 115, 90, 100];
for (let i = 1; i <= 5; i++) {
  S[`hit0${i}`] = [(r) => {
    const heavy = i >= 4;
    const b = mk(heavy ? 0.5 : 0.35);
    at(b, thud(r, HIT_F[i - 1], heavy ? 0.45 : 0.3, 0.8), 0, 1);
    at(b, crackle(r, 0.08, 300, SR, 3000), 0, 0.5);
    if (i === 5) at(b, clang(r, 520, 0.4, 0.8), 0.005, 0.35);
    if (i === 2 || i === 3) at(b, clang(r, i === 2 ? 900 : 700, 0.2, 0.6), 0.003, 0.2);
    return b;
  }, -1, 0.08];
}
S.hit00004 = [(r) => seq(0.25, [[0, thud(r, 170, 0.2, 0.9), 1]]), -3];
S.hitcar = [(r) => seq(0.35, [[0, thud(r, 120, 0.3, 1), 0.8], [0, crackle(r, 0.25, 200, SR, 1800), 0.8]]), -2];
S.sword = [(r) => blade(r, 1250, 0.6), -2, 0.12];
S.def01 = [(r) => seq(0.5, [[0, clang(r, 1450, 0.45, 1.2), 1], [0, thud(r, 240, 0.1, 1), 0.3]]), -1, 0.12];
S.def02 = [(r) => seq(0.4, [[0, clang(r, 820, 0.3, 0.7), 0.7], [0, thud(r, 160, 0.25, 0.8), 0.8]]), -1, 0.1];
S.strike02 = [(r) => {
  const b = mk(0.7);
  at(b, whoosh(r, 0.12, 500, 2400, 1.3, 0.85), 0, 0.6);
  at(b, clang(r, 640, 0.55, 1), 0.1, 0.8);
  at(b, thud(r, 80, 0.4, 1), 0.1, 0.9);
  return b;
}, -1, 0.15];
S.miss01 = [(r) => whoosh(r, 0.35, 700, 2600, 1.6, 0.5), -5];
S.miss02 = [(r) => whoosh(r, 0.5, 400, 1600, 1.3, 0.45), -4];
S.nohit = [(r) => seq(0.35, [[0, whoosh(r, 0.3, 800, 2000, 1.5, 0.4), 0.8], [0.25, perc('rim', 2), 0.2]]), -6];
S.fight01 = [(r) => {
  const b = mk(1.5);
  for (let k = 0; k < 9; k++) at(b, clang(r, r.range(600, 1600), 0.3, 1), r.range(0, 1.2), r.range(0.2, 0.45));
  for (let k = 0; k < 6; k++) at(b, thud(r, r.range(90, 160), 0.25, 0.7), r.range(0, 1.2), r.range(0.2, 0.4));
  return b;
}, -2, 0.15];
S.arrow = [(r) => twang(r, 150), -4];
S.arrows = [(r) => {
  const b = mk(0.7);
  for (let k = 0; k < 10; k++) at(b, twang(r, r.range(120, 180)), r.range(0, 0.25), 0.3);
  at(b, whoosh(r, 0.6, 3000, 900, 0.8, 0.3), 0.05, 0.5);
  return b;
}, -2];
S.shield = [(r) => {
  const b = mk(1.1);
  at(b, thud(r, 110, 0.4, 0.6), 0, 0.8);
  at(b, clang(r, 380, 0.8, 0.5), 0, 0.4);
  at(b, sweepNoise(r, 1.0, (t) => 1500 + 1500 * t, hump(1.0, 0.2, 1), 6), 0, 0.3);
  return b;
}, -3, 0.25];
S.crash = [(r) => {
  const b = mk(1.9);
  at(b, crowd(r, 1.6, 8, { f0: [130, 190], vowel: 'a' }), 0, 0.6);
  for (let k = 0; k < 14; k++) at(b, clang(r, r.range(500, 1500), 0.35, 1), r.range(0.05, 1.4), r.range(0.15, 0.4));
  for (let k = 0; k < 10; k++) at(b, thud(r, r.range(70, 140), 0.3, 0.8), r.range(0, 1.4), r.range(0.2, 0.5));
  return b;
}, -1, 0.2];
const breaker = (len: number, f: number): Recipe => (r) => {
  const b = mk(len);
  at(b, thud(r, f, 0.5, 1), 0, 1);
  for (let k = 0; k < 18; k++) at(b, thud(r, r.range(300, 900), 0.06, 1), r.range(0.02, len * 0.6), r.range(0.1, 0.35));
  at(b, crackle(r, len * 0.7, 120, SR, 2200), 0.02, 0.6);
  return b;
};
S.break = [breaker(1.3, 75), -1, 0.15];
S.break2 = [breaker(1.2, 95), -1, 0.15];
S.catapult = [(r) => seq(1.2, [[0, creak(r, 0.35, 520), 0.6], [0.32, thud(r, 90, 0.3, 0.6), 0.8], [0.34, whoosh(r, 0.7, 300, 1100, 1.1, 0.35), 0.8]]), -2, 0.15];
S.gunfire = [(r) => boom(r, 0.5, 0.6), -1, 0.1];
S.cargo = [(r) => {
  const b = mk(1.6);
  at(b, rumble(r, 1.2, 200), 0, 0.7);
  for (let k = 0; k < 16; k++) at(b, thud(r, r.range(160, 260), 0.07, 1), k * 0.07, 0.2);
  at(b, breaker(0.6, 90)(r), 1.0, 0.9);
  return b;
}, -1, 0.15];
S.missile = [(r) => {
  const b = mk(1.6);
  at(b, sweepNoise(r, 1.5, (t) => 3000 - 1800 * t, hump(1.5, 0.2, 0.7), 1.2), 0, 0.8);
  at(b, fire(r, 1.4, 0.8), 0.05, 0.6);
  return b;
}, -3];
S.fly = [(r) => {
  const b = mk(1.6);
  // wing flaps riding a wind bed
  at(b, wind(r, 1.6, 700), 0, 0.5);
  for (let t = 0.1; t < 1.4; t += 0.32) at(b, whoosh(r, 0.22, 300, 900, 1.2, 0.4), t, 0.7);
  return b;
}, -4];
S.fwrkrise = [(r) => {
  const b = mk(0.8);
  at(b, zap(r, 0.75, 900, 2600), 0, 0.3);
  at(b, sweepNoise(r, 0.75, (t) => 2000 + 3000 * t, hump(0.75, 0.8, 1), 2), 0, 0.6);
  return b;
}, -5];
S.firework = [(r) => seq(1.8, [[0, boom(r, 0.7, 0.5), 0.8], [0.05, crackle(r, 1.5, 120, SR, 3500), 0.8], [0.1, sparkle(r, 1.4, 40, 2500, 7000), 0.5]]), -2, 0.3];
S.firework1 = [(r) => seq(1.3, [[0, boom(r, 0.6, 0.45), 0.8], [0.05, crackle(r, 1.1, 90, SR, 3500), 0.7]]), -2, 0.3];

// booms
S.explosion = [(r) => boom(r, 0.8, 0.8), -1, 0.15];
S.sboom = [(r) => boom(r, 0.65, 0.6), -2, 0.15];
S.lboom = [(r) => seq(1.4, [[0, boom(r, 1.3, 1.3), 1], [0, thud(r, 45, 0.8, 0.5), 0.6]]), -1, 0.2];
S.bangbang = [(r) => seq(1.1, [[0, boom(r, 0.5, 0.5), 1], [0.35, boom(r, 0.7, 0.7), 1]]), -1, 0.15];
S.c_bang = [(r) => boom(r, 0.15, 0.25), -3];
S.s_bang = [(r) => boom(r, 0.14, 0.3), -3];
S.d_bang = [(r) => boom(r, 0.9, 0.75), -1, 0.15];
S.p_bang = [(r) => boom(r, 0.9, 0.65), -1, 0.15];
S.enemyfire = [(r) => seq(0.25, [[0, sweepNoise(r, 0.22, (t) => 900 + 3000 * t, decay(0.15), 0.9), 1]]), -4];
S.bfire = [(r) => seq(0.25, [[0, sweepNoise(r, 0.22, (t) => 600 + 2000 * t, decay(0.18), 0.9), 1], [0, crackle(r, 0.2, 80), 0.4]]), -4];
S.burn = [(r) => fire(r, 1.4, 1), -3];
S.laser = [(r) => zap(r, 0.2, 2200, 600), -6];
S.laser2 = [(r) => zap(r, 0.25, 1500, 300), -6];
S.pulse = [(r) => seq(0.35, [[0, zap(r, 0.3, 300, 180), 0.8], [0, sweepNoise(r, 0.3, () => 2000, decay(0.2), 2), 0.3]]), -5, 0.2];
S.hum = [(r) => {
  const b = mk(0.45);
  partials(b, SR, [{ f: 110, a: 0.6, t60: 1 }, { f: 220.5, a: 0.3, t60: 1 }, { f: 331, a: 0.15, t60: 1 }], 0, 0.05);
  const e = hump(0.45, 0.3, 0.7);
  for (let i = 0; i < b.length; i++) b[i] *= e(i / SR);
  void r;
  return b;
}, -8];
S.drip = [(r) => {
  const b = mk(0.15);
  let ph = 0;
  for (let i = 0; i < b.length; i++) {
    const t = i / SR;
    ph += (TAU * (900 + 2400 * Math.min(1, t / 0.04))) / SR;
    b[i] = Math.sin(ph) * decay(0.06)(t);
  }
  void r;
  return b;
}, -8, 0.2];
S.motor = [(r) => rumble(r, 0.45, 120), -6];
S.sengine = [(r) => rumble(r, 0.25, 140), -6];
S.rev = [(r) => sweepNoise(r, 0.3, (t) => 150 + 600 * t, hump(0.3, 0.6), 3), -6];
S.skid = [(r) => sweepNoise(r, 0.42, (t) => 2500 - 1500 * t, hump(0.42, 0.15), 5), -6];

// creatures ---------------------------------------------------------
S.horse01 = [(r) => hooves(r, 0.55, 0.3, 1), -4];
S.horse02 = [(r) => {
  const b = mk(1.45);
  at(b, hooves(r, 1.45, 0.32, 4), 0, 1);
  // a distant whinny
  const n = voice(r, { sec: 0.7, f0: (t) => 620 * (1.1 - 0.4 * t) * (1 + 0.08 * Math.sin(t * 90)), vowel: [[0, 'i'], [0.3, 'e'], [0.6, 'a']], amp: hump(0.7, 0.15, 0.8), breath: () => 0.4, effort: 0.9, tract: 0.8 });
  at(b, n, 0.2, 0.25);
  return b;
}, -3, 0.15];
S.elephant = [(r) => {
  // trumpet: buzzy rising call
  const b = voice(r, { sec: 1.4, f0: (t) => 420 + 260 * hump(1.4, 0.35, 1)(t), vowel: [[0, 'u'], [0.3, 'a'], [1.0, 'o']], amp: hump(1.4, 0.25, 0.6), breath: () => 0.3, effort: 1, tract: 0.6 });
  new Biquad(SR).peak(1200, 2, 6).run(b);
  return b;
}, -2, 0.2];
S.elepstep = [(r) => {
  const b = mk(2.6);
  for (let k = 0; k < 4; k++) at(b, thud(r, 42, 0.6, 0.4), 0.1 + k * 0.6, 1);
  return b;
}, -2, 0.15];
S.tiger = [(r) => roar(r, 1.8, 95), -1, 0.2];
S.m082snd01 = [(r) => roar(r, 1.2, 75, 0.7), -1, 0.2];

// voices ----------------------------------------------------------------
S.yell = [(r) => shout(r, { sec: 0.55, f0: 210, vowel: [[0, 'e'], [0.12, 'a']], h: true, effort: 0.95, fall: 0.85 }), -2];
const charge = (female: boolean): Recipe => (r) => {
  const b = mk(3.2);
  at(b, crowd(r, 3.0, 14, { f0: [120, 190], vowel: [[0, 'a'], [2, 'o']], female: female ? 0.25 : 0.05 }), 0.15, 1);
  at(b, shout(r, { sec: 1.2, f0: female ? 200 : 170, vowel: [[0, 'e'], [0.1, 'a']], female, effort: 0.95, fall: 0.9 }), 0, 0.6);
  for (let k = 0; k < 6; k++) at(b, perc('dagu', k), 0.1 + k * 0.33, 0.35);
  at(b, marching(r, 3.0), 0.2, 0.4);
  return b;
};
S['charge-00'] = [charge(false), -1, 0.2];
S['charge-10'] = [charge(true), -1, 0.2];
const DIE_V: (Vowel | [number, Exclude<Vowel, 'ei'>][])[] = ['a', [[0, 'a'], [0.4, 'o']], [[0, 'u'], [0.08, 'a']], 'o'];
for (let i = 0; i < 4; i++) S[`die-0${i}`] = [(r) => deathCry(r, false, [1.0, 1.1, 1.1, 0.45][i], [165, 150, 180, 170][i], DIE_V[i]), -2, 0.15];
for (let i = 0; i < 3; i++) S[`die-1${i}`] = [(r) => deathCry(r, true, [1.2, 1.0, 1.1][i], [170, 185, 160][i], DIE_V[i]), -2, 0.15];
for (let i = 0; i < 3; i++) {
  S[`hurt-0${i}`] = [(r) => shout(r, { sec: [0.16, 0.2, 0.22][i], f0: [150, 165, 140][i], vowel: (['u', 'a', 'e'] as const)[i], effort: 0.9, fall: 0.8 }), -3];
  S[`hurt-1${i}`] = [(r) => shout(r, { sec: [0.2, 0.18, 0.16][i], f0: [170, 180, 160][i], vowel: (['a', 'e', 'i'] as const)[i], female: true, effort: 0.85, fall: 0.8 }), -3];
}
for (let i = 0; i < 5; i++) {
  S[`soldierdie-0${i}`] = [(r) => deathCry(r, false, [0.5, 0.4, 0.32, 0.6, 0.55][i], [180, 160, 200, 150, 170][i], DIE_V[i % 4]), -3, 0.12];
  S[`soldierdie-1${i}`] = [(r) => deathCry(r, true, [0.6, 0.55, 0.8, 0.7, 0.75][i], [175, 165, 185, 160, 190][i], DIE_V[(i + 1) % 4]), -3, 0.12];
}
S['soldiermove-00'] = [(r) => marching(r, 1.7), -4];
S['soldiermove-10'] = [(r) => marching(r, 1.9, true), -4];
const KIAI_NAMES: Record<string, [keyof typeof KIAI, boolean]> = {
  ma01: ['a', false], mha01: ['ha', false], mho01: ['ho', false], mhu01: ['hu', false], mn01: ['n', false], mn03: ['n3', false], mya02: ['ya', false],
  wa01: ['wa', false], wha01: ['ha', true], who01: ['ho', true], whu01: ['hu', true], wn01: ['n', true], wya01: ['ya2', true], wya02: ['ya', true],
};
for (const [name, [k, fem]] of Object.entries(KIAI_NAMES)) {
  const d = KIAI[k];
  S[name] = [(r) => shout(r, { sec: d.sec, f0: d.f0, vowel: d.v, h: d.h, female: fem, effort: 0.9 }), -2];
}

// 武将技 spells ------------------------------------------------------------
S.m000snd01 = [(r) => {
  // a commander's order and a volley: horn, then bows released
  const b = mk(1.6);
  at(b, horn(r, 0.7, 50), 0, 0.5);
  for (let k = 0; k < 14; k++) at(b, twang(r, r.range(110, 180)), 0.55 + r.range(0, 0.3), 0.25);
  at(b, whoosh(r, 0.9, 3000, 700, 0.8, 0.3), 0.6, 0.6);
  return b;
}, -2, 0.2];
S.m002snd00 = [(r) => {
  const b = mk(2.2);
  at(b, rumble(r, 2.0, 120), 0, 0.8);
  for (let k = 0; k < 5; k++) at(b, stoneHit(r, 0.5), 0.3 + k * 0.32, 0.5);
  return b;
}, -1, 0.2];
S.m003snd00 = [(r) => water(r, 1.4, 30), -3, 0.25];
S.m004snd00 = [(r) => {
  const b = mk(2.6);
  at(b, ascend(r, 72, 10, 0.12, 2.6, 0.8), 0, 0.8);
  at(b, sparkle(r, 2.2, 50, 3000, 8000), 0.1, 0.5);
  at(b, sweepNoise(r, 2.4, (t) => 1500 + 1000 * t, hump(2.4, 0.5, 1), 4), 0, 0.15);
  return b;
}, -4, 0.45];
S.m005snd01 = [(r) => seq(2.6, [[0, fire(r, 2.5, 1.3), 1], [0, whoosh(r, 0.8, 200, 900, 0.9, 0.5), 0.8]]), -2, 0.2];
S.m005snd02 = [(r) => seq(1.5, [[0, boom(r, 0.6, 0.5), 0.6], [0.02, fire(r, 1.4, 1.2), 1]]), -2, 0.2];
S.m006snd01 = [(r) => {
  const b = mk(1.3);
  at(b, rumble(r, 1.2, 220), 0, 0.7);
  for (let k = 0; k < 10; k++) at(b, clang(r, 300 + k * 7, 0.08, 0.6), k * 0.11, 0.15);
  at(b, fire(r, 1.2, 0.8), 0, 0.4);
  return b;
}, -2];
S.m006snd02 = [(r) => seq(0.8, [[0, creak(r, 0.7, 800), 0.6], [0, rumble(r, 0.7, 250), 0.5]]), -3];
S.m007snd01 = [(r) => seq(1.2, [[0, whoosh(r, 1.1, 1500, 5000, 1.2, 0.4), 0.7], [0, sparkle(r, 1.0, 20, 4000, 9000), 0.4], [0, rumble(r, 1.0, 180), 0.4]]), -3, 0.25];
S.m007snd02 = [(r) => seq(1.0, [[0, crackle(r, 0.6, 250, SR, 4000), 0.9], [0, thud(r, 120, 0.4, 0.7), 0.6], [0.02, sparkle(r, 0.8, 15, 4000, 9000), 0.5]]), -2, 0.2];
S.m008snd00 = [(r) => {
  const b = mk(1.4);
  for (let k = 0; k < 7; k++) {
    at(b, whoosh(r, 0.18, 1500, 5000, 2.5, 0.6), k * 0.12, 0.6);
    at(b, clang(r, r.range(2000, 2800), 0.2, 1.2), k * 0.12 + 0.15, 0.25);
  }
  return b;
}, -3, 0.15];
S.m009snd01 = [(r) => seq(1.8, [[0, perc('rim', 3), 0.5], [0.25, boom(r, 1.5, 1.1), 1]]), -1, 0.2];
S.m010snd01 = [(r) => thunder(r, 1.5, 1.2), -1, 0.25];
S.m010snd02 = [(r) => thunder(r, 2.2, 0.6), -1, 0.25];
S.m011snd01 = [(r) => {
  const b = mk(3.2);
  at(b, roar(r, 2.2, 70, 0.6), 0.3, 0.8);
  at(b, fire(r, 3.0, 1.2), 0, 0.7);
  at(b, perc('tamtam', 4), 0, 0.5);
  return b;
}, -1, 0.3];
S.m011snd02 = [(r) => seq(2.6, [[0, whoosh(r, 2.4, 150, 900, 0.8, 0.4), 1], [0.3, roar(r, 1.6, 80, 0.6), 0.6], [0, fire(r, 2.4, 1.0), 0.5]]), -1, 0.25];
S.m011snd03 = [(r) => seq(2.0, [[0, boom(r, 1.0, 1), 0.8], [0, fire(r, 1.9, 1.4), 1]]), -1, 0.25];
S.m013snd01 = [(r) => seq(1.2, [[0, twang(r, 220), 0.8], [0.05, zap(r, 0.6, 1800, 900), 0.3], [0.05, sparkle(r, 1.0, 25, 3000, 7000), 0.5]]), -3, 0.3];
S.m015snd01 = [(r) => seq(1.2, [[0, perc('xiaoluo', 1), 0.6], [0, sweepNoise(r, 1.0, (t) => 400 + 2000 * t, hump(1.0, 0.7), 2), 0.5], [0.3, sparkle(r, 0.8, 20), 0.4]]), -3, 0.3];
S.m015snd02 = [(r) => seq(1.3, [[0, boom(r, 0.5, 0.4), 0.5], [0, sweepNoise(r, 1.2, (t) => 3000 - 2000 * t, hump(1.2, 0.1), 1.5), 0.6], [0, sparkle(r, 1, 25), 0.4]]), -3, 0.3];
S.m035snd01 = [(r) => seq(3.5, [[0, fire(r, 3.4, 1.5), 1], [0, whoosh(r, 1.0, 150, 700, 0.8, 0.3), 0.7]]), -2, 0.2];
S.m035snd02 = [(r) => fire(r, 3.2, 1.2), -2, 0.2];
S.m046snd01 = [(r) => {
  const b = mk(3.6);
  at(b, perc('tamtam', 2), 0, 0.6);
  at(b, roar(r, 2.4, 85, 0.55, [[0, 'o'], [0.6, 'a'], [1.8, 'u']]), 0.4, 0.8);
  at(b, thunder(r, 2.4, 0.6), 1.1, 0.7);
  at(b, sparkle(r, 3, 40, 2500, 7000), 0, 0.3);
  return b;
}, -1, 0.3];
S.m047snd01 = [(r) => seq(2.2, [[0, zap(r, 0.3, 3000, 400), 0.6], [0.03, crackle(r, 0.4, 600, SR, 5000), 0.8], [0.1, thunder(r, 2.0, 0.8), 1]]), -1, 0.25];
S.m049snd01 = [(r) => seq(1.7, [[0, rumble(r, 1.6, 110), 1], [0.2, stoneHit(r, 0.8), 0.6], [0.7, stoneHit(r, 0.8), 0.5]]), -1, 0.2];
S.m050snd01 = [(r) => seq(0.9, [[0, boom(r, 0.85, 1), 1], [0, zap(r, 0.3, 600, 120), 0.4]]), -1, 0.2];
S.m054snd01 = [(r) => seq(0.6, [[0, stoneHit(r, 0.5), 0.9], [0, sparkle(r, 0.4, 10, 3000, 8000), 0.5]]), -2, 0.2];
S.m055snd01 = [(r) => seq(0.6, [[0, chimes(r, [[0, 96, 0.7], [0.03, 101, 0.5], [0.07, 103, 0.4]], 0.6), 0.8], [0, crackle(r, 0.15, 400, SR, 5000), 0.5]]), -3, 0.25];
S.m056snd01 = [(r) => wind(r, 3.0, 450), -2, 0.2];
S.m057snd01 = [(r) => seq(1.7, [[0, whoosh(r, 1.0, 200, 1400, 0.8, 0.25), 0.9], [0, fire(r, 1.6, 1.3), 0.8]]), -1, 0.25];
S.m058snd01 = [(r) => seq(0.6, [[0, whoosh(r, 0.3, 250, 900, 1.1, 0.7), 0.8], [0.25, thud(r, 70, 0.35, 0.9), 0.9]]), -1, 0.15];
S.m060snd01 = [(r) => {
  const b = mk(1.6);
  // a deep resonant "om" under a bright strike
  partials(b, SR, [{ f: 98, a: 0.5, t60: 1.5 }, { f: 147, a: 0.3, t60: 1.2 }, { f: 196, a: 0.2, t60: 1 }], 0, 0.05);
  at(b, renderBell(SR, 81, 11), 0, 0.4);
  at(b, sweepNoise(r, 1.2, () => 900, hump(1.2, 0.2), 3), 0, 0.2);
  return b;
}, -2, 0.4];
S.m062snd01 = [(r) => {
  const b = mk(3.0);
  for (let k = 0; k < 20; k++) at(b, clang(r, r.range(1600, 3200), 0.5, 1.2), 0.1 + k * 0.12 + r.range(0, 0.05), 0.12 + 0.02 * (k % 5));
  at(b, sweepNoise(r, 2.8, (t) => 2000 + 1500 * t, hump(2.8, 0.6), 3), 0, 0.3);
  return b;
}, -2, 0.35];
S.m062snd02 = [(r) => seq(1.0, [[0, whoosh(r, 0.15, 3000, 1200, 2, 0.8), 0.6], [0.12, clang(r, 1700, 0.7, 1.2), 0.8], [0.12, thud(r, 120, 0.3, 0.8), 0.5]]), -1, 0.2];
S.m063snd01 = [(r) => seq(0.35, [[0, stoneHit(r, 0.3), 1], [0, whoosh(r, 0.12, 800, 3000, 1.5, 0.3), 0.4]]), -2];
S.m064snd00 = [(r) => seq(1.4, [[0, horn(r, 1.0, 45), 0.7], [0.05, perc('dagu', 2), 0.6], [0.4, perc('dagu', 3), 0.5], [0.75, perc('dagu', 4), 0.7]]), -2, 0.25];
S.m065snd01 = [(r) => seq(1.7, [[0, hooves(r, 1.6, 0.26, 5), 1], [0.2, roar(r, 0.9, 110, 0.8), 0.4]]), -2, 0.15];
S.m067snd01 = [(r) => seq(0.9, [[0, boom(r, 0.85, 0.9), 1], [0, thud(r, 50, 0.5, 0.3), 0.6]]), -1, 0.15];
S.m067snd02 = [(r) => seq(2.0, [[0, sweepNoise(r, 1.0, (t) => 3500 - 2500 * t, hump(1.0, 0.7), 6), 0.5], [0.95, boom(r, 1.0, 1.0), 1]]), -1, 0.2];
S.m068snd01 = [(r) => {
  const b = mk(3.0);
  at(b, hooves(r, 2.8, 0.3, 6), 0.1, 0.9);
  // bellow
  at(b, voice(r, { sec: 1.2, f0: (t) => 110 - 25 * t, vowel: [[0, 'u'], [0.5, 'o']], amp: hump(1.2, 0.3), breath: () => 0.4, effort: 0.9, tract: 0.65 }), 0, 0.6);
  at(b, fire(r, 2.5, 0.8), 0.4, 0.35);
  return b;
}, -1, 0.2];
S.m068snd02 = [(r) => seq(1.1, [[0, hooves(r, 1.0, 0.33, 2), 1], [0.1, rumble(r, 0.9, 130), 0.4]]), -2];
S.m070snd01 = [(r) => seq(3.0, [[0, magicSwell(r, 2.6, 76), 1], [0, perc('bo', 2), 0.25], [0.2, fire(r, 2.6, 0.6), 0.25]]), -2, 0.4];
S.m072snd01 = [(r) => seq(1.7, [[0, whoosh(r, 0.9, 400, 4000, 1.6, 0.5), 0.8], [0.4, clang(r, 1900, 1.2, 1.4), 0.5], [0.4, sparkle(r, 1.0, 20), 0.3]]), -2, 0.3];
S.m080snd01 = [(r) => {
  const b = mk(3.0);
  at(b, rumble(r, 2.9, 150), 0, 1);
  at(b, creak(r, 1.2, 380), 0.1, 0.4);
  at(b, creak(r, 1.2, 450), 1.3, 0.4);
  for (let k = 0; k < 12; k++) at(b, thud(r, 120, 0.15, 0.6), 0.1 + k * 0.23, 0.25);
  return b;
}, -2, 0.15];
S.m081snd01 = [(r) => seq(2.6, [[0, chains(r, 2.2), 1], [0, perc('xiaoluo', 2), 0.3], [0.1, zap(r, 1.6, 200, 80), 0.25], [1.8, clang(r, 300, 0.7, 0.8), 0.6]]), -2, 0.3];
S.m084snd01 = [(r) => {
  const b = mk(2.2);
  at(b, sweepNoise(r, 2.1, (t) => 300 + 1200 * Math.abs(Math.sin(t * 3)), hump(2.1, 0.3), 6), 0, 0.8);
  at(b, voice(r, { sec: 1.8, f0: (t) => 140 * (1 + 0.3 * Math.sin(t * 5)), vowel: [[0, 'u'], [0.8, 'o'], [1.5, 'u']], amp: hump(1.8, 0.4), breath: () => 0.7, effort: 0.3 }), 0.1, 0.5);
  at(b, rumble(r, 2.0, 90), 0, 0.5);
  return b;
}, -2, 0.4];
const sing = (sec: number, m: number): Recipe => (r) => {
  const b = mk(sec + 0.5);
  at(b, voice(r, { sec, f0: (t) => mtof(m) * (1 + 0.012 * Math.sin(t * 34) * Math.min(1, t * 4)), vowel: 'a', amp: hump(sec, 0.3, 0.7), breath: () => 0.25, effort: 0.35, female: true }), 0, 0.8);
  at(b, chimes(r, [[0, m + 24, 0.6], [sec * 0.4, m + 28, 0.5]], sec + 0.5), 0, 0.4);
  return b;
};
S.m089snd01 = [sing(0.7, 69), -3, 0.45];
S.m089snd02 = [sing(1.0, 74), -3, 0.45];
S.m105snd01 = [(r) => {
  const b = mk(3.2);
  for (let k = 0; k < 9; k++) at(b, whoosh(r, 0.25, 600 + k * 120, 3500, 2, 0.6), k * 0.32, 0.6);
  for (let k = 0; k < 5; k++) at(b, clang(r, 1500 + k * 180, 0.4, 1.2), 0.25 + k * 0.6, 0.35);
  return b;
}, -2, 0.25];
S.m105snd02 = [(r) => blade(r, 1800, 0.45, 0.06), -2, 0.2];
S.m105snd03 = [(r) => clang(r, 2600, 0.12, 1.4), -5];
S.m107snd01 = [(r) => seq(1.5, [[0, perc('luo', 2).subarray(0, Math.round(SR * 1.45)), 0.6], [0, sparkle(r, 1.2, 25), 0.5], [0, zap(r, 1.2, 150, 300), 0.2]]), -2, 0.35];
S.m107snd02 = [(r) => seq(2.2, [[0, boom(r, 0.8, 0.8), 0.7], [0, perc('tamtam', 3), 0.6], [0.05, sparkle(r, 1.5, 30), 0.4]]), -1, 0.3];
S.m109snd01 = [(r) => {
  const b = mk(1.0);
  // spinning blades: amplitude-modulated whistle
  const w = sweepNoise(r, 1.0, () => 2600, hump(1.0, 0.4), 5);
  for (let i = 0; i < w.length; i++) w[i] *= 0.5 + 0.5 * Math.sin((TAU * 18 * i) / SR);
  at(b, w, 0, 1);
  at(b, clang(r, 2100, 0.6, 1), 0, 0.2);
  return b;
}, -3, 0.2];
for (const [k, len] of [[1, 1.6], [2, 2.0], [3, 1.6]] as const) S[`m117snd0${k}`] = [(r) => seq(len, [[0, whoosh(r, 0.3, 200, 900, 1, 0.8), 0.6], [0.28, stoneHit(r, len - 0.3), 1], [0.28, boom(r, len - 0.3, 0.6 + k * 0.1), 0.4]]), -1, 0.2];

// ------------------------------------------------------------------ module
export const sounds = Object.keys(S);

export function sound(name: string) {
  const d = S[name];
  if (!d) return null;
  const [fn, level = -3, rev = 0] = d;
  let b = fn(rng(hash(name)));
  if (rev > 0) {
    const tail = new Float32Array(b.length + Math.round(SR * 0.6));
    tail.set(b);
    b = monoVerb(SR, tail, rev, 1.3, 4500);
  }
  // DC / rumble below hearing
  new Biquad(SR).hp(30).run(b);
  b = trimTail(b, SR, 0.0015 * Math.max(1e-6, peak(b)));
  // level: peak target, but dense sounds (voices, roars) are capped by short-term loudness
  let st = 0;
  const w = Math.round(SR * 0.05);
  for (let i = 0; i + w <= b.length; i += w >> 1) {
    let s = 0;
    for (let j = i; j < i + w; j++) s += b[j] * b[j];
    st = Math.max(st, Math.sqrt(s / w));
  }
  const p = peak(b);
  const g = Math.min(db(level) / Math.max(1e-9, p), st > 0 ? db(level - 9) / st : Infinity);
  for (let i = 0; i < b.length; i++) b[i] *= g;
  fadeEdges(b, SR, 1, 15);
  void envAD;
  void noise;
  return { rate: SR, data: b };
}
