// Keyframed poses for every battle animation. Frames are addressed by their
// animation + index; the strike frame of each attack is the spec's "attack"
// event frame, so the blow lands exactly when the game resolves the hit.
import { BASE, seq, type Pose, type SeqKey } from './_units_rig.ts';

/** foot ground level relative to the neutral pelvis (ankle) */
export const G = 41;

const ft = (y: number, a = 12, b = -11): Partial<Pose> => ({ f1: [a, G - 2 - y], f2: [b, G - 2 - y] });

/** lying poses were authored for a 3px lower ground */
const groundFix = (p: Pose): Pose => ({ ...p, y: p.y - 3 * Math.abs(Math.sin((p.rot * Math.PI) / 180)) });

// ------------------------------------------------------------------ generals
export const READY: Pose = { ...BASE, y: 2, lean: 7, h1: [15, -16], w: 142, g2: -24, f1: [12, G - 4], f2: [-11, G - 4], wind: 0.35 };

/** galloping bob shared by riders and their mounts (phase 0..1) */
export const gallopBob = (ph: number) => -2.6 * Math.sin(ph * Math.PI * 2) - 1.2 * Math.sin(ph * Math.PI * 4 + 0.6);

export interface GenFrame {
  anim: string;
  i: number;
  n: number;
  /** event (strike) index in this animation, -1 if none */
  ev: number;
}

/** Frame number (last 3 digits of comNNxxxx) → animation slot. */
export function generalSlot(num: number, barb: boolean): GenFrame {
  const R: [string, number, number, number][] = [
    ['attack01', 1, 12, 7], ['attack02', 13, 24, 20], ['attack03', 25, 36, 33], ['attack04', 37, 48, 46],
    ['attack05', 49, 60, 57], ['attack06', 61, 72, 71], ['attack07', 73, 84, 82], ['attack08', 85, 96, 93],
    ['attack09', 97, 104, 104], ['defend', 105, 108, -1], ['die2', 109, 118, -1], ['die', 119, 128, -1],
    ['hurt', 129, 132, -1], ['point', 133, 136, -1], ['charge', 137, 140, 140],
    ['walk', barb ? 141 : 142, 152, -1], ['shoot', 153, 164, 163], ['extra', 165, 178, -1], ['wait', 179, 182, -1],
    ['attack11', 183, 194, 191],
  ];
  for (const [a, lo, hi, ev] of R) if (num >= lo && num <= hi) return { anim: a, i: num - lo, n: hi - lo + 1, ev: ev < 0 ? -1 : ev - lo };
  if (num === 141) return { anim: 'walk', i: 0, n: 11, ev: -1 };
  return { anim: 'wait', i: 0, n: 4, ev: -1 };
}

const R0 = READY;
const GEN: Record<string, SeqKey[]> = {
  attack01: [
    [0, {}],
    [2, { y: 0, lean: -6, head: -5, h1: [4, -50], w: 215, g2: -22, ...ft(0, 18, -12) }],
    [4, { lean: -12, head: -8, h1: [-2, -56], w: 238 }],
    [6, { ease: 'lin', y: 6, lean: 20, head: 8, h1: [30, -20], w: 72, g2: -26, ...ft(6, 26, -16) }],
    [8, { lean: 22, h1: [26, -10], w: 52 }],
    [11, { ...R0 }],
  ],
  attack02: [
    [0, {}],
    [3, { y: 5, lean: 12, head: 4, h1: [-12, -6], w: -35, g2: -20, ...ft(5, 16, -14) }],
    [5, { lean: 8, h1: [-8, -10], w: -15 }],
    [7, { ease: 'lin', y: 0, lean: -8, head: -6, h1: [24, -44], w: 150, ...ft(0, 22, -12) }],
    [9, { lean: -10, h1: [14, -54], w: 185 }],
    [11, { ...R0 }],
  ],
  attack03: [
    [0, {}],
    [2, { y: 10, lean: 16, h1: [8, -10], w: 110, ...ft(10, 13, -12) }],
    [4, { y: -22, lean: -8, head: -6, h1: [2, -52], w: 230, f1: [12, 28], f2: [-10, 34] }],
    [6, { y: -28, lean: -14, h1: [-4, -56], w: 255, f1: [14, 26], f2: [-8, 32] }],
    [8, { ease: 'lin', y: 8, lean: 26, head: 10, h1: [32, -14], w: 62, ...ft(8, 28, -20) }],
    [10, { lean: 24, h1: [30, -8], w: 45 }],
    [11, { ...R0 }],
  ],
  attack04: [
    [0, {}],
    [1, { h1: [0, -26], w: 96, g2: -26, lean: 2, ...ft(2, 18, -11) }],
    [2, { ease: 'lin', h1: [36, -28], w: 94, lean: 16, x: 4 }],
    [3, { h1: [2, -30], w: 100, lean: 4, x: 0 }],
    [4, { ease: 'lin', h1: [38, -34], w: 100, lean: 18, x: 5 }],
    [5, { h1: [2, -24], w: 88, lean: 4, x: 0 }],
    [6, { ease: 'lin', h1: [38, -22], w: 86, lean: 16, x: 5 }],
    [7, { h1: [0, -28], w: 94, lean: 2, x: 0 }],
    [8, { h1: [-6, -28], w: 94, lean: -2 }],
    [9, { ease: 'lin', h1: [44, -28], w: 92, lean: 24, x: 10, ...ft(2, 32, -14) }],
    [11, { ...R0 }],
  ],
  attack05: [
    [0, {}],
    [3, { x: -6, lean: -6, h1: [-10, -28], w: 96, g2: -24, ...ft(0, 16, -12) }],
    [5, { x: -8, y: 4, lean: -8, h1: [-14, -26], ...ft(4, 16, -12) }],
    [8, { ease: 'lin', x: 12, y: 8, lean: 24, h1: [46, -26], w: 92, f1: [40, G - 10], f2: [-24, G - 8] }],
    [10, { lean: 20, h1: [38, -24] }],
    [11, { ...R0 }],
  ],
  attack06: [
    [0, {}],
    [2, { y: 6, lean: 6, h1: [12, -34], w: 150, g2: 0, h2: [-8, -18], ...ft(6, 12, -12) }],
    [4, { y: -20, lean: -2, h1: [6, -52], w: 60, f1: [10, 26], f2: [-8, 30] }],
    [6, { y: -28, h1: [2, -56], w: -30 }],
    [8, { y: -24, lean: -12, h1: [-4, -56], w: -140, g2: -22 }],
    [10, { ease: 'lin', y: 10, lean: 26, head: 10, h1: [32, -12], w: -300, ...ft(10, 26, -20) }],
    [11, { y: 9, lean: 22, h1: [28, -10], w: -312 }],
  ],
  attack07: [
    [0, {}],
    [1, { h1: [20, -32], w: 90, g2: 0, h2: [-8, -14], lean: 6 }],
    [3, { h1: [24, -34], w: -90, lean: 8 }],
    [5, { h1: [22, -32], w: -270, lean: 8 }],
    [7, { h1: [20, -34], w: -450, lean: 6 }],
    [8, { h1: [-6, -30], w: -630, g2: -24, lean: -4, x: -2 }],
    [9, { ease: 'lin', x: 8, y: 6, lean: 22, h1: [44, -30], w: -628, ...ft(6, 34, -18) }],
    [10, { lean: 20, h1: [40, -28] }],
    [11, { ...R0, w: -578 }],
  ],
  attack08: [
    [0, {}],
    [2, { y: 10, lean: -4, head: -4, h1: [-14, -30], w: 225, g2: -24, ...ft(10, 16, -16) }],
    [4, { y: 12, lean: -10, h1: [-18, -36], w: 240, ...ft(12, 16, -16) }],
    [6, { lean: -12, h1: [-16, -44], w: 250 }],
    [7, { lean: -13, h1: [-14, -46], w: 256 }],
    [8, { ease: 'lin', x: 14, lean: 30, head: 10, h1: [40, -10], w: 78, f1: [42, G - 14], f2: [-24, G - 12] }],
    [10, { lean: 24, h1: [36, -8], w: 70 }],
    [11, { ...R0 }],
  ],
  attack09: [
    [0, {}],
    [1, { y: 6, lean: 10, h1: [12, -20], w: 150, ...ft(6, 10, -10) }],
    [2, { y: -26, rot: 70, f1: [8, 22], f2: [-6, 24], h1: [8, -30], w: 170 }],
    [3, { y: -34, rot: 160 }],
    [4, { y: -34, rot: 250 }],
    [5, { y: -22, rot: 330 }],
    [6, { y: 0, rot: 360, lean: 10, h1: [20, -40], w: 150, ...ft(0, 16, -14) }],
    [7, { ease: 'lin', y: 6, lean: 22, h1: [32, -14], w: 64, ...ft(6, 26, -18) }],
  ],
  attack11: [
    [0, {}],
    [2, { y: 8, lean: 12, h1: [10, -30], w: 170, ...ft(8, 12, -12) }],
    [4, { y: -34, lean: -6, h1: [4, -54], w: 200, f1: [10, 30], f2: [-14, 28] }],
    [6, { y: -40, lean: -10, h1: [-2, -58], w: 215 }],
    [7, { y: -30, lean: 10, h1: [20, -30], w: 60 }],
    [8, { ease: 'lin', y: 6, x: 8, lean: 30, h1: [30, -6], w: 28, ...ft(6, 28, -20) }],
    [10, { lean: 26, h1: [28, -2], w: 24 }],
    [11, { ...R0 }],
  ],
  charge: [
    [0, {}],
    [1, { lean: 2, h1: [14, -40], w: 170 }],
    [2, { lean: 12, head: -6, h1: [22, -50], w: 150, wind: 0.7 }],
    [3, { lean: 14, head: -8, h1: [26, -52], w: 140, wind: 0.9 }],
  ],
  point: [
    [0, {}],
    [2, { lean: 6, h1: [30, -36], w: 112, g2: 0, h2: [-6, -8], head: -4 }],
    [3, { lean: 8, h1: [34, -38], w: 108, head: -5 }],
  ],
  defend: [
    [0, { y: 6, lean: -2, head: 4, h1: [18, -44], w: 96, g2: -34, ...ft(6, 16, -14) }],
    [1, { y: 6.6, h1: [18, -43] }],
    [2, { y: 6, h1: [18, -44] }],
    [3, { y: 6.6, h1: [18, -43] }],
  ],
  hurt: [
    [0, { x: -6, lean: -22, head: -20, h1: [2, -8], w: 118, g2: -20, ...ft(2, 18, -8), wind: 0.6 }],
    [3, { ...R0, lean: 0, head: -4 }],
  ],
  die: [
    [0, { x: -2, lean: -14, head: -14, h1: [4, -4], w: 128 }],
    [1, { y: 8, lean: 6, head: 10, h1: [12, 4], w: 100, ...ft(8, 16, -14) }],
    [2, { y: 20, lean: 16, head: 16, mode: 2, h1: [16, 10], h2: [6, 12], f1: [18, 22], f2: [-22, 20] }],
    [3, { y: 24, lean: 30, head: 20, h1: [20, 14], h2: [10, 16], f1: [18, 18], f2: [-24, 16] }],
    [4, { y: 28, rot: 40, lean: 20, h1: [20, 0], h2: [16, 4] }],
    [5, { ease: 'in', y: 36, rot: 74, lean: 10, h1: [8, -14], h2: [6, -10], f1: [-2, 44], f2: [-6, 42] }],
    [6, { y: 40, rot: 90, lean: 4, head: 8, h1: [3, -10], h2: [1, -6], f1: [0, 45], f2: [-4, 44] }],
    [9, { y: 40, rot: 90, head: 12 }],
  ],
  die2: [
    [0, { x: -4, lean: -24, head: -22, h1: [-2, -24], w: 200, wind: 0.8 }],
    [1, { x: -14, y: -10, rot: -30, lean: -10, mode: 2, h1: [-6, -34], h2: [-14, -30], f1: [18, 34], f2: [6, 38] }],
    [2, { x: -24, y: -18, rot: -55 }],
    [3, { x: -32, y: -16, rot: -75, h1: [-10, -38], h2: [-20, -34] }],
    [4, { ease: 'in', x: -38, y: -2, rot: -85 }],
    [5, { ease: 'in', x: -40, y: 34, rot: -90, head: 6 }],
    [6, { x: -42, y: 30, rot: -84, head: -6 }],
    [7, { x: -44, y: 38, rot: -90, head: 0, f1: [6, 42], f2: [2, 44] }],
    [9, { x: -44, y: 39, rot: -90, head: 4, h1: [-1, -8], h2: [-3, -12], f1: [-4, 46], f2: [3, 46] }],
  ],
  shoot: [
    [0, {}],
    [2, { mode: 1, draw: 0, lean: 4, h2: [28, -36], h1: [16, -32], g2: 0 }],
    [4, { draw: 0.4, h1: [4, -34], h2: [32, -37] }],
    [6, { draw: 0.8, h1: [-4, -36], h2: [34, -38], head: 2 }],
    [7, { draw: 1, h1: [-8, -37] }],
    [9, { draw: 1, h1: [-10, -37] }],
    [10, { ease: 'lin', draw: 0, h1: [-18, -30], h2: [36, -37] }],
    [11, { draw: 0, h1: [-12, -24], h2: [30, -34] }],
  ],
};

/** Pose of a general frame. */
export function generalPose(slot: GenFrame): Pose {
  const { anim, i, n } = slot;
  if (anim === 'wait' || anim === 'extra') {
    const ph = (i / 4) * Math.PI * 2 + (anim === 'extra' ? 1.3 : 0);
    return { ...READY, y: 2 + Math.sin(ph) * 0.9, lean: 7 + Math.sin(ph) * 1.2, h1: [15, -16 + Math.sin(ph) * 0.8], w: 142 + Math.sin(ph) * 1.5, wind: 0.3 + 0.1 * Math.sin(ph) };
  }
  if (anim === 'walk') {
    const ph = i / n;
    const a = Math.sin(ph * Math.PI * 2);
    const lift = (k: number) => Math.max(0, Math.sin(ph * Math.PI * 2 + k)) * 6;
    return {
      ...READY,
      y: 2 + gallopBob(ph),
      lean: 12,
      h1: [17, -22 + a],
      w: 128 + a * 4,
      f1: [12 + a * 7, G - 4 - lift(0)],
      f2: [-10 - a * 7, G - 4 - lift(Math.PI)],
      wind: 0.8,
    };
  }
  if (anim === 'hurt') return seq(READY, GEN.hurt, (i / (n - 1)) * 3);
  const keys = GEN[anim];
  if (!keys) return READY;
  return groundFix(seq(READY, keys, i));
}

// ------------------------------------------------------------------ soldiers
export type SolClass = 'blade' | 'pole' | 'bow' | 'xbow' | 'fist';

export const S_READY: Record<SolClass, Pose> = {
  blade: { ...BASE, y: 2, lean: 8, h1: [16, -14], w: 135, g2: 0, h2: [10, -24], ...ft(2, 11, -11), wind: 0.3 },
  pole: { ...BASE, y: 2, lean: 6, h1: [12, -14], w: 160, g2: -22, ...ft(2, 11, -11), wind: 0.3 },
  bow: { ...BASE, y: 1, lean: 4, h1: [8, -10], w: 175, g2: 0, h2: [-4, -6], ...ft(1, 10, -10), wind: 0.3 },
  xbow: { ...BASE, y: 2, lean: 6, h1: [12, -20], w: 100, g2: 0, h2: [22, -22], ...ft(2, 11, -11), wind: 0.3 },
  fist: { ...BASE, y: 4, lean: 8, h1: [16, -24], w: 140, g2: 0, h2: [8, -30], ...ft(4, 14, -12), wind: 0.3 },
};

const SOL_ATK: Record<SolClass, { attack: SeqKey[]; attack2: SeqKey[] }> = {
  blade: {
    attack: [
      [0, {}],
      [3, { lean: -4, head: -4, h1: [-2, -44], w: 210, h2: [16, -20], ...ft(2, 16, -12) }],
      [6, { lean: -8, h1: [-6, -48], w: 228 }],
      [8, { ease: 'lin', x: 6, y: 6, lean: 22, head: 6, h1: [30, -12], w: 70, h2: [-12, -24], ...ft(6, 28, -16) }],
      [10, { lean: 20, h1: [26, -6], w: 50 }],
      [13, {}],
    ],
    attack2: [
      [0, {}],
      [3, { y: 5, lean: 12, h1: [-14, -6], w: -40, h2: [18, -26], ...ft(5, 16, -14) }],
      [6, { lean: 10, h1: [-10, -10], w: -20 }],
      [8, { ease: 'lin', x: 4, y: 0, lean: -6, h1: [26, -40], w: 150, h2: [-10, -16], ...ft(0, 22, -12) }],
      [10, { lean: -8, h1: [18, -48], w: 185 }],
      [13, {}],
    ],
  },
  pole: {
    attack: [
      [0, {}],
      [4, { x: -4, lean: -6, h1: [-10, -26], w: 94, g2: -22, ...ft(2, 14, -12) }],
      [6, { x: -6, lean: -8, h1: [-14, -26] }],
      [8, { ease: 'lin', x: 10, y: 6, lean: 22, h1: [44, -26], w: 92, f1: [36, G - 8], f2: [-22, G - 6] }],
      [10, { lean: 18, h1: [36, -24] }],
      [13, {}],
    ],
    attack2: [
      [0, {}],
      [3, { lean: -6, head: -4, h1: [4, -48], w: 215, g2: -20, ...ft(2, 16, -12) }],
      [6, { lean: -12, h1: [-2, -54], w: 238 }],
      [8, { ease: 'lin', y: 6, lean: 20, head: 6, h1: [30, -18], w: 72, g2: -24, ...ft(6, 26, -16) }],
      [10, { lean: 22, h1: [26, -10], w: 52 }],
      [13, {}],
    ],
  },
  bow: {
    attack: [
      [0, {}],
      [2, { mode: 1, draw: 0, h2: [26, -34], h1: [16, -30] }],
      [4, { draw: 0.5, h1: [2, -34], h2: [30, -36] }],
      [6, { draw: 1, h1: [-8, -36], h2: [32, -37] }],
      [7, { draw: 1, h1: [-10, -36] }],
      [8, { ease: 'lin', draw: 0, h1: [-18, -30], h2: [34, -36] }],
      [10, { draw: 0, h1: [-12, -24], h2: [28, -32] }],
      [12, { mode: 0, h1: [8, -10], h2: [-4, -6] }],
    ],
    attack2: [
      [0, {}],
      [2, { mode: 1, draw: 0, lean: -4, h2: [22, -44], h1: [14, -36] }],
      [4, { draw: 0.5, lean: -8, h1: [0, -40], h2: [24, -50] }],
      [6, { draw: 1, lean: -10, h1: [-8, -40], h2: [24, -52] }],
      [7, { draw: 1, h1: [-10, -40] }],
      [8, { ease: 'lin', draw: 0, h1: [-18, -34], h2: [26, -52] }],
      [10, { draw: 0, lean: -4, h1: [-12, -26], h2: [24, -42] }],
      [12, { mode: 0, lean: 4, h1: [8, -10], h2: [-4, -6] }],
    ],
  },
  xbow: {
    attack: [
      [0, {}],
      [3, { lean: 4, h1: [6, -30], w: 92, h2: [26, -30], head: 4 }],
      [6, { h1: [6, -31], h2: [26, -31] }],
      [8, { ease: 'lin', x: -3, lean: -4, h1: [2, -33], w: 98, h2: [22, -33] }],
      [10, { x: -1, lean: 2, h1: [4, -30], w: 94 }],
      [13, {}],
    ],
    attack2: [
      [0, {}],
      [3, { lean: 0, h1: [6, -36], w: 112, h2: [24, -42], head: -4 }],
      [6, { h1: [6, -37], h2: [24, -43] }],
      [8, { ease: 'lin', x: -3, lean: -8, h1: [2, -38], w: 118, h2: [20, -46] }],
      [10, { x: -1, lean: -2, h1: [4, -34], w: 110 }],
      [13, {}],
    ],
  },
  fist: {
    attack: [
      [0, {}],
      [3, { lean: -2, h1: [-4, -26], h2: [12, -32], ...ft(4, 14, -12) }],
      [6, { lean: -4, h1: [-8, -24] }],
      [8, { ease: 'lin', x: 6, lean: 20, h1: [36, -30], h2: [-6, -20], ...ft(4, 26, -14) }],
      [10, { lean: 16, h1: [30, -28] }],
      [13, {}],
    ],
    attack2: [
      [0, {}],
      [3, { y: 4, lean: -4, h1: [8, -30], h2: [-4, -26], ...ft(4, 12, -12) }],
      [6, { y: 0, lean: -16, f1: [24, 20], k1: 1 }],
      [8, { ease: 'lin', lean: -24, f1: [42, 6], h1: [4, -32], h2: [-14, -18] }],
      [10, { lean: -18, f1: [30, 18] }],
      [13, { ...ft(4, 14, -12), lean: 8 }],
    ],
  },
};

export interface SolFrame {
  anim: 'wait' | 'walk' | 'attack' | 'attack2' | 'defend' | 'hurt' | 'die2' | 'die3' | 'die' | 'die4';
  i: number;
  n: number;
}

/** Soldier pose. `mounted` keeps the rider's legs in the saddle. */
export function soldierPose(cls: SolClass, f: SolFrame, mounted: boolean): Pose {
  const R = S_READY[cls];
  const ride = (p: Pose): Pose => (mounted ? { ...p, x: Math.max(-6, Math.min(6, p.x)), y: Math.min(p.y, 2), f1: [14, 26], f2: [12, 28] } : p);
  switch (f.anim) {
    case 'wait': {
      const ph = (f.i / 4) * Math.PI * 2;
      return ride({ ...R, y: R.y + Math.sin(ph) * 0.7, lean: R.lean + Math.sin(ph) * 1.2, h1: [R.h1[0], R.h1[1] + Math.sin(ph) * 0.6] });
    }
    case 'walk': {
      const ph = f.i / 12;
      const a = Math.sin(ph * Math.PI * 2);
      const lift = (k: number) => Math.max(0, Math.sin(ph * Math.PI * 2 + k)) * 7;
      if (mounted) return { ...R, y: 1, lean: R.lean + 6, h1: [R.h1[0] + 2, R.h1[1] - 4], f1: [14, 26], f2: [12, 28], wind: 0.8 };
      return {
        ...R,
        y: R.y + Math.abs(Math.cos(ph * Math.PI * 2)) * -2.4,
        lean: R.lean + 6,
        f1: [10 + a * 13, G - 2 - R.y - lift(0)],
        f2: [-8 - a * 13, G - 2 - R.y - lift(Math.PI)],
        h1: cls === 'pole' || cls === 'xbow' ? R.h1 : [R.h1[0] - a * 4, R.h1[1]],
        h2: cls === 'bow' || cls === 'fist' || cls === 'blade' ? [R.h2[0] + a * 6, R.h2[1]] : R.h2,
        wind: 0.75,
      };
    }
    case 'attack':
    case 'attack2':
      return ride(seq(R, SOL_ATK[cls][f.anim], f.i));
    case 'defend': {
      const k = f.i / 3; // frame 4 = full guard
      const g: Pose =
        cls === 'pole'
          ? { ...R, y: 6, lean: -2, h1: [16, -40], w: 98, g2: -30, ...ft(6, 16, -14) }
          : cls === 'bow' || cls === 'xbow'
            ? { ...R, y: 8, lean: -6, head: 8, h1: [14, -38], h2: [6, -40], ...ft(8, 15, -14) }
            : { ...R, y: 6, lean: -4, head: 6, h1: [12, -36], w: 110, h2: [22, -26], ...ft(6, 16, -14) };
      return ride(seq(R, [[0, {}], [1, g]], k));
    }
    case 'hurt': {
      const k = f.i / 3;
      const g: Pose = { ...R, x: -5, lean: -20, head: -20, h1: [R.h1[0] - 10, R.h1[1] + 6], h2: [R.h2[0] - 12, R.h2[1] + 4], w: R.w - 10, ...ft(2, 16, -8), wind: 0.6 };
      return ride(seq(R, [[0, {}], [1, g]], k));
    }
    default:
      return soldierDie(R, f, mounted);
  }
}

function soldierDie(R: Pose, f: SolFrame, mounted: boolean): Pose {
  // height of the pelvis above its standing position at the start (riders fall from the saddle)
  const keysByAnim: Record<string, SeqKey[]> = {
    // die2: falls backward
    die2: [
      [0, { x: -2, lean: -16, head: -16, h1: [R.h1[0] - 6, R.h1[1]], ...ft(1, 14, -8) }],
      [2, { x: -6, y: 6, lean: -30, head: -20, mode: 2, h1: [0, -30], h2: [-8, -30], ...ft(6, 16, -4) }],
      [4, { ease: 'in', x: -10, y: 16, rot: -40, lean: -20, h1: [-4, -36], h2: [-12, -34], f1: [18, 34], f2: [8, 38] }],
      [6, { ease: 'in', x: -16, y: 36, rot: -82, lean: -8, head: -10 }],
      [7, { x: -17, y: 33, rot: -86, head: 0 }],
      [9, { x: -18, y: 39, rot: -90, head: 4, h1: [-1, -8], h2: [-3, -12], f1: [-4, 46], f2: [3, 46] }],
    ],
    // die: flung back into the air, tumbles, lands
    die: [
      [0, { x: -4, lean: -24, head: -24, ...ft(0, 14, -8), mode: 2, h1: [-2, -40], h2: [-12, -38] }],
      [1, { x: -14, y: -16, rot: -50, f1: [18, 32], f2: [6, 34] }],
      [2, { x: -24, y: -24, rot: -110 }],
      [3, { x: -32, y: -18, rot: -170 }],
      [4, { ease: 'in', x: -40, y: 30, rot: -250, h1: [8, -36], h2: [-6, -36] }],
      [5, { x: -46, y: 18, rot: -300 }],
      [6, { ease: 'in', x: -50, y: 30, rot: -340 }],
      [7, { x: -52, y: 34, rot: -350 }],
      [9, { x: -54, y: 39, rot: -450, head: 2, h1: [-1, -8], h2: [-3, -12], f1: [-4, 46], f2: [3, 46] }],
    ],
    // die3: knocked down forward, rolls once and lies face down
    die3: [
      [0, { x: 2, lean: 26, head: 18, ...ft(2, 14, -14), mode: 2, h1: [16, 4], h2: [10, 6] }],
      [1, { x: 4, y: 14, rot: 30, lean: 20, f1: [8, 30], f2: [-16, 30] }],
      [2, { x: 10, y: 4, rot: 110, f1: [4, 24], f2: [-6, 26] }],
      [3, { x: 16, y: 6, rot: 200 }],
      [4, { ease: 'in', x: 22, y: 30, rot: 290, f1: [6, 40], f2: [-4, 42] }],
      [5, { x: 24, y: 34, rot: 330 }],
      [6, { x: 26, y: 32, rot: 400 }],
      [7, { x: 26, y: 36, rot: 440 }],
      [9, { x: 26, y: 40, rot: 450, head: 10, h1: [3, -10], h2: [1, -6], f1: [0, 45], f2: [-4, 44] }],
    ],
    // die4: crumples where he stands
    die4: [
      [0, { lean: 18, head: 14, h1: [14, 0], h2: [4, 2], ...ft(4, 12, -12), mode: 2 }],
      [2, { y: 16, lean: 28, head: 20, f1: [16, 26], f2: [-18, 24] }],
      [4, { y: 24, lean: 40, f1: [18, 18], f2: [-24, 16] }],
      [6, { ease: 'in', y: 34, rot: 70, lean: 10, h1: [22, -8], h2: [12, -6], f1: [-2, 44], f2: [-6, 42] }],
      [9, { y: 40, rot: 90, lean: 4, head: 10, h1: [3, -10], h2: [1, -6], f1: [0, 45], f2: [-4, 44] }],
    ],
  };
  const keys = keysByAnim[f.anim] ?? keysByAnim.die2;
  const p = groundFix(seq(R, keys, f.i));
  if (mounted) {
    // start in the saddle: the caller offsets the pelvis; legs begin in riding position
    const k = Math.min(1, f.i / 3);
    if (k < 1) {
      p.f1 = [14 + (p.f1[0] - 14) * k, 26 + (p.f1[1] - 26) * k];
      p.f2 = [12 + (p.f2[0] - 12) * k, 28 + (p.f2[1] - 28) * k];
    }
  }
  return p;
}

/** For mounted soldiers dying: fraction (0..1) of the saddle height still left at frame i. */
export function saddleLeft(f: SolFrame): number {
  const land: Record<string, number> = { die2: 6, die: 4, die3: 4, die4: 6 };
  const L = land[f.anim] ?? 5;
  if (f.i >= L) return 0;
  const t = f.i / L;
  return f.anim === 'die' || f.anim === 'die3' ? Math.max(0, 1 - t * t) : 1 - t;
}
