// Original music for 三国墨英传: pentatonic compositions arranged for
// synthesized guzheng, pipa, guqin, ruan, dizi, xiao, erhu, suona, war drums,
// gongs and bells. Every track is generated from a seed and loops seamlessly.
//
//   mainmenu        title: epic theme
//   ad001..003      strategy map (by nation BGM): stately, calm
//   sf001..003      野战 tactical map: tense march
//   bf001..012      百人战 battles: driving drums + plucked ostinato
//   arena           比武大会 duel tournament: festive, martial
//   event           story events: dramatic
//   report001..003  monthly report / field result: bright, neutral, sombre
//   judge           result fanfare
//   ending001/003   triumph / credits
//   gameover        defeat
import { hash, rng } from './_dsp.ts';
import { renderSong, type Lead, type Sec, type SongDef } from './_compose.ts';
import type { LineIns, PluckIns } from './_instr.ts';

type Ins = LineIns | PluckIns | 'bell';
const lead = (ins: Ins, o: Partial<Omit<Lead, 'ins'>> & { trem?: boolean } = {}): Lead => ({ ins, ...o }) as Lead;

function battle(i: number): SongDef {
  const r = rng(7000 + i * 131);
  const mode = r.pick(['yu', 'shang', 'jue', 'yu', 'zhi', 'shang'] as const);
  const bpm = r.int(126, 150);
  const leads: Lead[] = [
    lead('dizi', { oct: 1, gain: 0.42, pan: 0.15 }),
    lead('erhu', { oct: 0, gain: 0.5, pan: -0.15 }),
    lead('suona', { oct: 0, gain: 0.3, pan: 0.1 }),
    lead('pipa', { oct: 0, gain: 0.55, pan: 0.2, trem: true }),
  ];
  const a = leads[i % 4], b = leads[(i + 1 + r.int(0, 2)) % 4];
  const ostIns = r.pick(['zheng', 'pipa'] as const);
  const ostPat = r.pick(['gallop', 'drive', 'run16', 'gallop'] as const);
  const dA = r.pick(['war1', 'war2', 'war3'] as const);
  const dB = r.pick(['war1', 'war2', 'war3'].filter((x) => x !== dA) as ('war1' | 'war2' | 'war3')[]);
  const ost = { ins: ostIns, pat: ostPat, oct: -1, gain: 0.26, pan: -0.35 };
  const secs: Sec[] = [
    { bars: 4, ost, bass: { kind: 'pulse', gain: 0.4 }, drums: dA, dgain: 0.5, fill: 4, accent: [r.chance(0.5) ? 'glis' : 'bo'], vamp: [0, 0, 4, 3] },
    { bars: 8, mel: 'A', lead: [a], ost, bass: { kind: 'pulse', gain: 0.4 }, drums: dA, dgain: 0.6, fill: 4, accent: ['bo'] },
    { bars: 8, mel: 'A', lead: [{ ...b, oct: (b.oct ?? 0) + (b.ins === 'dizi' ? 0 : 0) }, { ...a, gain: (a.gain ?? 0.5) * 0.5, oct: (a.oct ?? 0) - 1 }], ost, bass: { kind: 'pluck', gain: 0.45 }, pad: 0.22, drums: dA, dgain: 0.65, fill: 8 },
    { bars: 8, mel: 'B', lead: [a], counter: { ins: 'erhu', oct: -1, gain: 0.22, pan: 0.35 }, ost: { ...ost, pat: 'run16', gain: 0.2 }, bass: { kind: 'pulse', gain: 0.42 }, pad: 0.25, drums: dB, dgain: 0.72, fill: 4, accent: ['luo'] },
    { bars: 4, bass: { kind: 'drone', gain: 0.35 }, ost: { ...ost, pat: 'sparse', gain: 0.3 }, drums: 'roll', dgain: 0.55, accent: ['tamtam'], vamp: [0, 0, 3, 4] },
    { bars: 8, mel: 'A', lead: [a, { ...b, gain: (b.gain ?? 0.5) * 0.6 }], ost, bass: { kind: 'pulse', gain: 0.42 }, pad: 0.2, drums: dA, dgain: 0.7, fill: 4, accent: ['bo'] },
    { bars: 4, mel: 'B', half: 1, lead: [b], ost, bass: { kind: 'pluck', gain: 0.45 }, drums: dB, dgain: 0.65, fill: 4 },
  ];
  return {
    seed: 9000 + i * 17,
    bpm,
    key: r.int(55, 61),
    mode,
    themes: { A: { lo: -2, hi: 7, start: 0, density: 'mid' }, B: { lo: 1, hi: 9, start: 3, density: 'busy' } },
    secs,
    reverb: { t60: 1.8, wet: 0.8 },
    loud: -16,
  };
}

function strategy(i: number): SongDef {
  const r = rng(300 + i * 71);
  const mode = (['gong', 'zhi', 'shang'] as const)[i % 3];
  const l1 = (['dizi', 'xiao', 'dizi'] as const)[i % 3];
  return {
    seed: 4100 + i * 19,
    bpm: r.int(74, 86),
    key: r.int(57, 62),
    mode,
    themes: { A: { lo: -2, hi: 6, start: 0, density: 'sparse' }, B: { lo: 0, hi: 8, start: 2, density: 'mid' } },
    secs: [
      { bars: 4, ost: { ins: 'zheng', pat: 'calm', oct: -1, gain: 0.3 }, pad: 0.16, bass: { kind: 'qin', gain: 0.35 }, accent: ['glis'], vamp: [0, 0, 3, 0] },
      { bars: 8, mel: 'A', lead: [lead(l1, { oct: l1 === 'dizi' ? 1 : 0, gain: 0.42, pan: 0.15 })], ost: { ins: 'zheng', pat: 'calm', oct: -1, gain: 0.26 }, bass: { kind: 'qin', gain: 0.35 }, pad: 0.14, drums: 'calm', dgain: 0.25 },
      { bars: 8, mel: 'B', lead: [lead('erhu', { gain: 0.42, pan: -0.15 })], ost: { ins: 'zheng', pat: 'arp8', oct: -1, gain: 0.2 }, bass: { kind: 'qin', gain: 0.32 }, pad: 0.18, drums: 'calm', dgain: 0.25, accent: ['bell'] },
      { bars: 8, mel: 'A', lead: [lead('zheng', { gain: 0.5, pan: -0.1, orn: 0.5 }), lead('bell', { oct: 1, gain: 0.18, pan: 0.3 })], counter: { ins: 'xiao', oct: 0, gain: 0.25, pan: 0.35 }, ost: { ins: 'ruan', pat: 'sparse', oct: -1, gain: 0.25 }, pad: 0.14, drums: 'calm', dgain: 0.22 },
      { bars: 4, mel: 'A', half: 1, lead: [lead(l1, { oct: l1 === 'dizi' ? 1 : 0, gain: 0.38, pan: 0.15 })], ost: { ins: 'zheng', pat: 'calm', oct: -1, gain: 0.26 }, bass: { kind: 'qin', gain: 0.35 }, pad: 0.16 },
    ],
    reverb: { t60: 2.8, wet: 1 },
    loud: -19,
  };
}

function field(i: number): SongDef {
  const r = rng(500 + i * 53);
  const ld = (['erhu', 'xiao', 'dizi'] as const)[i % 3];
  return {
    seed: 5200 + i * 23,
    bpm: r.int(98, 110),
    key: r.int(55, 60),
    mode: (['yu', 'jue', 'shang'] as const)[i % 3],
    themes: { A: { lo: -2, hi: 6, start: 0, density: 'mid' }, B: { lo: 0, hi: 8, start: 3, density: 'mid' } },
    secs: [
      { bars: 4, ost: { ins: 'pipa', pat: 'drive', oct: -1, gain: 0.22 }, bass: { kind: 'drone', gain: 0.3 }, drums: 'heart', dgain: 0.55, vamp: [0, 0, 4, 0] },
      { bars: 8, mel: 'A', lead: [lead(ld, { oct: ld === 'dizi' ? 1 : 0, gain: 0.42 })], ost: { ins: 'pipa', pat: 'drive', oct: -1, gain: 0.22 }, bass: { kind: 'pluck', gain: 0.4 }, drums: 'march', dgain: 0.45, fill: 8 },
      { bars: 8, mel: 'B', lead: [lead('pipa', { gain: 0.45, trem: true, pan: 0.2 })], counter: { ins: 'cello', oct: -1, gain: 0.3, pan: -0.2 }, ost: { ins: 'zheng', pat: 'gallop', oct: -1, gain: 0.2 }, pad: 0.2, drums: 'march', dgain: 0.5, accent: ['xiaoluo'], fill: 4 },
      { bars: 4, bass: { kind: 'drone', gain: 0.35 }, drums: 'heart', dgain: 0.6, ost: { ins: 'pipa', pat: 'sparse', oct: -1, gain: 0.25 }, accent: ['luo'], vamp: [0, 3, 4, 0] },
      { bars: 8, mel: 'A', lead: [lead(ld, { oct: ld === 'dizi' ? 1 : 0, gain: 0.4 }), lead('zheng', { gain: 0.25, oct: -1, pan: -0.3 })], ost: { ins: 'pipa', pat: 'drive', oct: -1, gain: 0.22 }, bass: { kind: 'pluck', gain: 0.4 }, pad: 0.15, drums: 'march', dgain: 0.5, fill: 4 },
    ],
    reverb: { t60: 2.2 },
    loud: -18,
  };
}

const DEFS: Record<string, () => SongDef> = {
  mainmenu: () => ({
    seed: 101,
    bpm: 84,
    key: 57,
    mode: 'yu',
    themes: { A: { lo: -2, hi: 7, start: 0, density: 'mid' }, B: { lo: 1, hi: 9, start: 3, density: 'mid' } },
    secs: [
      { bars: 4, mel: 'A', half: 1, lead: [lead('xiao', { gain: 0.45, pan: 0.1, rev: 0.5 })], bass: { kind: 'drone', gain: 0.32 }, pad: 0.16, accent: ['tamtam'] },
      { bars: 8, mel: 'A', lead: [lead('erhu', { gain: 0.5, pan: -0.1 })], ost: { ins: 'zheng', pat: 'arp8', oct: -1, gain: 0.26 }, bass: { kind: 'pluck', gain: 0.42 }, pad: 0.18, drums: 'epic', dgain: 0.6, fill: 8, accent: ['glis', 'luo'] },
      { bars: 8, mel: 'B', lead: [lead('dizi', { oct: 1, gain: 0.4, pan: 0.15 }), lead('suona', { gain: 0.16, pan: -0.15 })], counter: { ins: 'cello', oct: -1, gain: 0.3, pan: -0.25 }, ost: { ins: 'pipa', pat: 'drive', oct: -1, gain: 0.22 }, bass: { kind: 'pulse', gain: 0.4 }, pad: 0.24, drums: 'epic2', dgain: 0.7, fill: 4, accent: ['bo'] },
      { bars: 8, mel: 'A', lead: [lead('erhu', { gain: 0.48 }), lead('dizi', { oct: 1, gain: 0.3, pan: 0.2 })], ost: { ins: 'zheng', pat: 'run16', oct: -1, gain: 0.2 }, bass: { kind: 'pulse', gain: 0.42 }, pad: 0.24, drums: 'epic2', dgain: 0.72, fill: 4, accent: ['tamtam', 'bo'] },
      { bars: 4, vamp: [0, 0, 3, 4], bass: { kind: 'drone', gain: 0.32 }, ost: { ins: 'zheng', pat: 'calm', oct: -1, gain: 0.26 }, pad: 0.16, drums: 'heart', dgain: 0.5, accent: ['luo'] },
    ],
    reverb: { t60: 2.8 },
    loud: -17,
  }),
  ad001: () => strategy(0),
  ad002: () => strategy(1),
  ad003: () => strategy(2),
  sf001: () => field(0),
  sf002: () => field(1),
  sf003: () => field(2),
  arena: () => ({
    seed: 202,
    bpm: 132,
    key: 60,
    mode: 'gong',
    themes: { A: { lo: -1, hi: 7, start: 0, density: 'busy' }, B: { lo: 1, hi: 8, start: 3, density: 'mid' } },
    secs: [
      { bars: 4, ost: { ins: 'zheng', pat: 'run16', oct: -1, gain: 0.22 }, bass: { kind: 'pulse', gain: 0.4 }, drums: 'festive', dgain: 0.55, accent: ['bo', 'glis'], fill: 4, vamp: [0, 0, 3, 0] },
      { bars: 8, mel: 'A', lead: [lead('suona', { gain: 0.3 })], ost: { ins: 'zheng', pat: 'drive', oct: -1, gain: 0.24 }, bass: { kind: 'pulse', gain: 0.4 }, drums: 'festive', dgain: 0.6, fill: 4 },
      { bars: 8, mel: 'B', lead: [lead('dizi', { oct: 1, gain: 0.42 }), lead('pipa', { gain: 0.3, trem: true, pan: -0.3 })], ost: { ins: 'zheng', pat: 'run16', oct: -1, gain: 0.2 }, bass: { kind: 'pluck', gain: 0.4 }, pad: 0.15, drums: 'war2', dgain: 0.6, fill: 8, accent: ['xiaoluo'] },
      { bars: 8, mel: 'A', lead: [lead('suona', { gain: 0.3 }), lead('dizi', { oct: 1, gain: 0.25, pan: 0.25 })], ost: { ins: 'zheng', pat: 'drive', oct: -1, gain: 0.24 }, bass: { kind: 'pulse', gain: 0.4 }, pad: 0.15, drums: 'festive', dgain: 0.65, fill: 4, accent: ['bo'] },
      { bars: 4, mel: 'B', half: 1, lead: [lead('pipa', { gain: 0.45, trem: true })], ost: { ins: 'zheng', pat: 'gallop', oct: -1, gain: 0.22 }, bass: { kind: 'pulse', gain: 0.4 }, drums: 'war2', dgain: 0.6, fill: 4 },
    ],
    reverb: { t60: 1.8, wet: 0.8 },
    loud: -16,
  }),
  event: () => ({
    seed: 303,
    bpm: 66,
    key: 57,
    mode: 'yu',
    themes: { A: { lo: -3, hi: 5, start: 0, density: 'sparse' }, B: { lo: 0, hi: 7, start: 2, density: 'mid' } },
    secs: [
      { bars: 4, vamp: [0, 0, 4, 0], bass: { kind: 'drone', gain: 0.4 }, pad: 0.22, drums: 'heart', dgain: 0.55, ost: { ins: 'pipa', pat: 'sparse', oct: -1, gain: 0.28 }, accent: ['tamtam'] },
      { bars: 8, mel: 'A', lead: [lead('erhu', { gain: 0.5, orn: 0.5 })], bass: { kind: 'drone', gain: 0.35 }, pad: 0.2, drums: 'heart', dgain: 0.5, ost: { ins: 'pipa', pat: 'sparse', oct: -1, gain: 0.24 } },
      { bars: 8, mel: 'B', lead: [lead('xiao', { gain: 0.45 }), lead('pipa', { gain: 0.25, trem: true, oct: -1, pan: -0.3 })], counter: { ins: 'cello', oct: -1, gain: 0.3 }, pad: 0.24, drums: 'roll', dgain: 0.4, fill: 4, accent: ['luo'] },
      { bars: 4, mel: 'A', half: 1, lead: [lead('erhu', { gain: 0.48 })], bass: { kind: 'drone', gain: 0.38 }, pad: 0.22, drums: 'heart', dgain: 0.55 },
    ],
    reverb: { t60: 3.2 },
    loud: -18,
  }),
  report001: () => ({
    seed: 404,
    bpm: 84,
    key: 60,
    mode: 'gong',
    themes: { A: { lo: -1, hi: 7, start: 0, density: 'mid' } },
    secs: [
      { bars: 4, vamp: [0, 3, 0, 4], ost: { ins: 'zheng', pat: 'arp8', oct: -1, gain: 0.28 }, bass: { kind: 'qin', gain: 0.35 }, pad: 0.15, accent: ['bell', 'glis'] },
      { bars: 8, mel: 'A', lead: [lead('dizi', { oct: 1, gain: 0.4 }), lead('bell', { gain: 0.15, oct: 1, pan: 0.3 })], ost: { ins: 'zheng', pat: 'arp8', oct: -1, gain: 0.24 }, bass: { kind: 'pluck', gain: 0.36 }, pad: 0.15, drums: 'court', dgain: 0.3 },
      { bars: 8, mel: 'A', lead: [lead('zheng', { gain: 0.5, orn: 0.4 })], counter: { ins: 'erhu', oct: -1, gain: 0.26, pan: 0.3 }, ost: { ins: 'ruan', pat: 'calm', oct: -1, gain: 0.26 }, pad: 0.15, drums: 'court', dgain: 0.3, accent: ['xiaoluo'] },
      { bars: 4, mel: 'A', half: 1, lead: [lead('dizi', { oct: 1, gain: 0.38 })], ost: { ins: 'zheng', pat: 'arp8', oct: -1, gain: 0.26 }, bass: { kind: 'qin', gain: 0.35 }, pad: 0.15 },
    ],
    loud: -18.5,
  }),
  report002: () => ({
    seed: 505,
    bpm: 76,
    key: 58,
    mode: 'shang',
    themes: { A: { lo: -2, hi: 6, start: 0, density: 'sparse' } },
    secs: [
      { bars: 4, vamp: [0, 0, 3, 0], ost: { ins: 'qin', pat: 'calm', oct: -1, gain: 0.32 }, pad: 0.12 },
      { bars: 8, mel: 'A', lead: [lead('qin', { gain: 0.55, orn: 0.6 })], ost: { ins: 'zheng', pat: 'sparse', oct: -1, gain: 0.22 }, pad: 0.12, drums: 'calm', dgain: 0.22 },
      { bars: 8, mel: 'A', lead: [lead('xiao', { gain: 0.42 })], ost: { ins: 'qin', pat: 'calm', oct: -1, gain: 0.3 }, bass: { kind: 'qin', gain: 0.25 }, pad: 0.14, drums: 'calm', dgain: 0.2 },
      { bars: 4, mel: 'A', half: 1, lead: [lead('qin', { gain: 0.5, orn: 0.6 })], ost: { ins: 'zheng', pat: 'sparse', oct: -1, gain: 0.22 }, pad: 0.12 },
    ],
    reverb: { t60: 3 },
    loud: -18.5,
  }),
  report003: () => ({
    seed: 606,
    bpm: 72,
    key: 56,
    mode: 'jue',
    themes: { A: { lo: -3, hi: 5, start: 0, density: 'sparse' } },
    secs: [
      { bars: 4, vamp: [0, 0, 4, 0], bass: { kind: 'drone', gain: 0.38 }, pad: 0.2, drums: 'heart', dgain: 0.45, accent: ['luo'] },
      { bars: 8, mel: 'A', lead: [lead('erhu', { gain: 0.48, orn: 0.5 })], bass: { kind: 'drone', gain: 0.34 }, pad: 0.18, ost: { ins: 'pipa', pat: 'sparse', oct: -1, gain: 0.24 }, drums: 'heart', dgain: 0.4 },
      { bars: 8, mel: 'A', lead: [lead('xiao', { gain: 0.42 })], counter: { ins: 'erhu', oct: -1, gain: 0.22 }, ost: { ins: 'qin', pat: 'calm', oct: -1, gain: 0.28 }, pad: 0.18, drums: 'heart', dgain: 0.4 },
      { bars: 4, mel: 'A', half: 1, lead: [lead('erhu', { gain: 0.45 })], bass: { kind: 'drone', gain: 0.36 }, pad: 0.2, drums: 'heart', dgain: 0.4 },
    ],
    reverb: { t60: 3 },
    loud: -19,
  }),
  judge: () => ({
    seed: 707,
    bpm: 112,
    key: 60,
    mode: 'gong',
    themes: { A: { lo: -1, hi: 7, start: 0, density: 'mid' }, B: { lo: 1, hi: 8, start: 3, density: 'mid' } },
    secs: [
      { bars: 4, vamp: [0, 0, 3, 4], ost: { ins: 'zheng', pat: 'run16', oct: -1, gain: 0.22 }, bass: { kind: 'pulse', gain: 0.38 }, drums: 'festive', dgain: 0.55, accent: ['luo', 'bo'], fill: 4 },
      { bars: 8, mel: 'A', lead: [lead('suona', { gain: 0.28 }), lead('bell', { gain: 0.15, oct: 1 })], ost: { ins: 'zheng', pat: 'drive', oct: -1, gain: 0.22 }, bass: { kind: 'pulse', gain: 0.38 }, pad: 0.15, drums: 'festive', dgain: 0.6, fill: 4 },
      { bars: 8, mel: 'B', lead: [lead('dizi', { oct: 1, gain: 0.4 })], ost: { ins: 'pipa', pat: 'gallop', oct: -1, gain: 0.22 }, bass: { kind: 'pluck', gain: 0.4 }, pad: 0.18, drums: 'march', dgain: 0.55, fill: 8, accent: ['xiaoluo'] },
      { bars: 8, mel: 'A', lead: [lead('suona', { gain: 0.26 }), lead('dizi', { oct: 1, gain: 0.25, pan: 0.25 })], ost: { ins: 'zheng', pat: 'run16', oct: -1, gain: 0.2 }, bass: { kind: 'pulse', gain: 0.38 }, pad: 0.18, drums: 'festive', dgain: 0.62, fill: 4, accent: ['bo'] },
    ],
    loud: -16.5,
  }),
  ending001: () => ({
    seed: 808,
    bpm: 92,
    key: 60,
    mode: 'gong',
    themes: { A: { lo: -1, hi: 7, start: 0, density: 'mid' }, B: { lo: 1, hi: 9, start: 3, density: 'mid' } },
    secs: [
      { bars: 4, vamp: [0, 3, 4, 0], ost: { ins: 'zheng', pat: 'arp8', oct: -1, gain: 0.26 }, pad: 0.2, bass: { kind: 'drone', gain: 0.3 }, drums: 'epic', dgain: 0.5, accent: ['tamtam', 'glis'] },
      { bars: 8, mel: 'A', lead: [lead('erhu', { gain: 0.48 }), lead('bell', { oct: 1, gain: 0.16, pan: 0.3 })], ost: { ins: 'zheng', pat: 'arp8', oct: -1, gain: 0.24 }, bass: { kind: 'pluck', gain: 0.4 }, pad: 0.2, drums: 'epic', dgain: 0.55, fill: 8 },
      { bars: 8, mel: 'B', lead: [lead('dizi', { oct: 1, gain: 0.42 })], counter: { ins: 'cello', oct: -1, gain: 0.3 }, ost: { ins: 'pipa', pat: 'drive', oct: -1, gain: 0.2 }, bass: { kind: 'pulse', gain: 0.38 }, pad: 0.24, drums: 'epic2', dgain: 0.62, fill: 4, accent: ['luo'] },
      { bars: 8, mel: 'A', lead: [lead('suona', { gain: 0.24 }), lead('erhu', { gain: 0.36 }), lead('dizi', { oct: 1, gain: 0.25, pan: 0.25 })], ost: { ins: 'zheng', pat: 'run16', oct: -1, gain: 0.2 }, bass: { kind: 'pulse', gain: 0.4 }, pad: 0.26, drums: 'epic2', dgain: 0.68, fill: 4, accent: ['tamtam', 'bo'] },
      { bars: 8, mel: 'A', half: 1, lead: [lead('zheng', { gain: 0.5, orn: 0.4 }), lead('bell', { oct: 1, gain: 0.2 })], ost: { ins: 'ruan', pat: 'calm', oct: -1, gain: 0.25 }, pad: 0.2, bass: { kind: 'drone', gain: 0.3 }, drums: 'epic', dgain: 0.5 },
    ],
    reverb: { t60: 2.8 },
    loud: -17,
  }),
  ending003: () => ({
    seed: 909,
    bpm: 84,
    key: 59,
    mode: 'zhi',
    themes: { A: { lo: -2, hi: 7, start: 0, density: 'sparse' }, B: { lo: 0, hi: 8, start: 2, density: 'mid' } },
    secs: [
      { bars: 4, vamp: [0, 0, 3, 0], ost: { ins: 'zheng', pat: 'calm', oct: -1, gain: 0.28 }, pad: 0.16, bass: { kind: 'qin', gain: 0.32 }, accent: ['bell'] },
      { bars: 8, mel: 'A', lead: [lead('dizi', { oct: 1, gain: 0.4 })], ost: { ins: 'zheng', pat: 'arp8', oct: -1, gain: 0.24 }, bass: { kind: 'qin', gain: 0.32 }, pad: 0.15, drums: 'calm', dgain: 0.25 },
      { bars: 8, mel: 'B', lead: [lead('erhu', { gain: 0.46, orn: 0.4 })], counter: { ins: 'xiao', oct: 0, gain: 0.22, pan: 0.35 }, ost: { ins: 'zheng', pat: 'arp8', oct: -1, gain: 0.22 }, bass: { kind: 'pluck', gain: 0.34 }, pad: 0.2, drums: 'court', dgain: 0.3, accent: ['xiaoluo'] },
      { bars: 8, mel: 'A', lead: [lead('erhu', { gain: 0.38 }), lead('dizi', { oct: 1, gain: 0.3, pan: 0.25 })], ost: { ins: 'zheng', pat: 'run16', oct: -1, gain: 0.18 }, bass: { kind: 'pluck', gain: 0.34 }, pad: 0.2, drums: 'court', dgain: 0.3, accent: ['bell'] },
      { bars: 8, mel: 'B', lead: [lead('zheng', { gain: 0.5, orn: 0.5 })], ost: { ins: 'ruan', pat: 'calm', oct: -1, gain: 0.24 }, pad: 0.16, bass: { kind: 'qin', gain: 0.3 } },
    ],
    reverb: { t60: 3 },
    loud: -18,
  }),
  gameover: () => ({
    seed: 1010,
    bpm: 60,
    key: 57,
    mode: 'yu',
    themes: { A: { lo: -3, hi: 4, start: 0, density: 'sparse' } },
    secs: [
      { bars: 2, vamp: [0, 4], bass: { kind: 'drone', gain: 0.35 }, pad: 0.2, accent: ['tamtam'] },
      { bars: 8, mel: 'A', lead: [lead('xiao', { gain: 0.45, orn: 0.4 })], ost: { ins: 'qin', pat: 'sparse', oct: -1, gain: 0.3 }, bass: { kind: 'drone', gain: 0.3 }, pad: 0.18 },
      { bars: 8, mel: 'A', lead: [lead('qin', { gain: 0.55, orn: 0.6 })], counter: { ins: 'erhu', oct: -1, gain: 0.2 }, pad: 0.18, accent: ['luo'] },
    ],
    reverb: { t60: 3.5 },
    loud: -18.5,
  }),
};
for (let i = 1; i <= 12; i++) DEFS[`bf${String(i).padStart(3, '0')}`] = () => battle(i);

export const music = Object.keys(DEFS);

export function track(name: string) {
  const d = DEFS[name];
  if (!d) return null;
  void hash;
  return renderSong(d());
}
