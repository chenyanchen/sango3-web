// Portrait model: a parametric bust (head, features, hair, headwear, dress)
// resolved from a Look + seeded rng (+ signature traits for famous names).
// Everything is laid out in a 200×240 canvas, facing the viewer's right in a
// 3/4 view; the painter mirrors the whole drawing for left-facing portraits.
import { C, mix, rng, type Rng } from '../ink.ts';
import type { Look } from '../types.ts';

export const CW = 200, CH = 240;

export type EyeKind = 'almond' | 'phoenix' | 'round' | 'narrow' | 'droop';
export type BrowKind = 'sword' | 'silkworm' | 'willow' | 'bushy' | 'knit' | 'fierce' | 'flat' | 'sparse';
export type MouthKind = 'calm' | 'smile' | 'frown' | 'shout' | 'smirk' | 'pout';
export type BeardKind = 'none' | 'stubble' | 'moustache' | 'goatee' | 'short' | 'long' | 'five' | 'full' | 'curly';
export type HairKind = 'topknot' | 'loose' | 'wild' | 'bald' | 'braids' | 'bun' | 'twin' | 'side' | 'high' | 'tail';
export type HatKind =
  | 'none' | 'helmet' | 'lionhelm' | 'winghelm' | 'peakhelm' | 'hequan' | 'mian' | 'goldcrown' | 'guan' | 'wuguan' | 'scarf' | 'yellowscarf'
  | 'headband' | 'feathers' | 'eunuch' | 'taoist' | 'hood' | 'phoenix' | 'smallcap' | 'futou' | 'jieze';
export type DressKind = 'robe' | 'crane' | 'armour' | 'fur' | 'gown' | 'imperial' | 'plainrobe' | 'warrobe';

export interface Model {
  r: Rng;
  look: Look;
  name: string;
  female: boolean;
  flip: boolean;
  th: number; // head turn (radians)
  tilt: number; // head tilt (deg)
  hx: number;
  hy: number;
  a: number; // half head width at the cheekbones
  hairY: number;
  browY: number;
  eyeY: number;
  noseY: number;
  mouthY: number;
  chinY: number;
  jaw: number; // jaw width factor
  chin: number; // chin width factor
  cheek: number;
  // features
  eye: { kind: EyeKind; ue: number; ew: number; eh: number; slant: number; iris: string; gaze: number; lids: number };
  brow: { kind: BrowKind; w: number; lift: number; gap: number; col: string };
  nose: { len: number; wide: number; depth: number; hook: number };
  mouth: { kind: MouthKind; w: number; lip: number };
  ear: { size: number; lobe: number };
  wrinkles: number; // 0..1
  blush: number;
  // colors
  skin: string;
  skinLine: string;
  lip: string;
  hairCol: string;
  beardCol: string;
  // hair/beard/hat/dress
  beard: { kind: BeardKind; len: number; tash: 'droop' | 'up' | 'thin' | 'none' };
  hair: HairKind;
  hat: { kind: HatKind; col: string; col2: string; plume: string };
  dress: { kind: DressKind; col: string; col2: string; trim: string; inner: string; metal: string };
  bgHue: string;
  extras: Set<string>; // eyepatch, fan, scar, bigears, earrings, flower, bells, tattoo, cape, pearls ...
}

const SKIN = {
  pale: '#efd5b8',
  normal: '#e6bf98',
  ruddy: '#dea47f',
  dark: '#bd8a62',
};

const ROBE = {
  indigo: '#3e5f86', azurite: '#5b86ad', malachite: '#4f8a6a', jade: '#7fae95', cinnabar: '#a8402f', ochre: '#b98552',
  gamboge: '#cfa548', purple: '#6c4a78', ink: '#2e2a26', grey: '#7a7468', white: '#ece6d8', rouge: '#b5506a', pink: '#dc9aa3',
  lilac: '#a493bd', sky: '#9cbad4', teal: '#3f7a78', brown: '#7a5a3c', green: '#3f6e3f', crimson: '#8c2b2b',
} as const;
type RobeKey = keyof typeof ROBE;

/** Smooth 1-D interpolation through (x, y) control points (cosine eased). */
export function curve(pts: [number, number][]) {
  return (x: number) => {
    if (x <= pts[0][0]) return pts[0][1];
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
      if (x <= x1) {
        const t = (x - x0) / (x1 - x0);
        const e = (1 - Math.cos(t * Math.PI)) / 2;
        return y0 + (y1 - y0) * e;
      }
    }
    return pts[pts.length - 1][1];
  };
}

/** Geometry helpers bound to a model: frontal (u, y) → canvas x with head turn. */
export function geo(m: Model) {
  const { a, hairY, browY, eyeY, mouthY, chinY, jaw, chin, cheek } = m;
  const W = curve([
    [hairY - 40, a * 0.7],
    [hairY - 10, a * 0.94],
    [browY, a * 1.0],
    [eyeY + 9, a * cheek],
    [mouthY - 2, a * 0.9 * jaw],
    [mouthY + 7, a * 0.76 * jaw],
    [chinY - 5, a * 0.42 * chin],
    [chinY, a * 0.26 * chin],
  ]);
  const X = (u: number, y: number) => m.hx + W(y) * Math.sin(Math.asin(Math.max(-1, Math.min(1, u))) + m.th);
  /** foreshortening of a small frontal width at u */
  const fs = (u: number) => Math.max(0.15, Math.cos(Math.asin(Math.max(-1, Math.min(1, u))) + m.th) / Math.sqrt(Math.max(0.05, 1 - u * u)));
  return { W, X, fs };
}

// ------------------------------------------------------------------ build
const FAMOUS: Record<string, (m: Model) => void> = {};

export function buildModel(frame: string, name: string, look: Look): Model {
  const r = rng('portrait:' + frame + ':' + name);
  const female = look.sex === 2;
  const old = look.age === 'old', young = look.age === 'young';
  const shape = female ? r.pick(['oval', 'heart', 'round', 'oval', 'long'] as const)
    : look.build === 'stout' ? r.pick(['square', 'round', 'square', 'oval'] as const)
    : look.build === 'slim' ? r.pick(['long', 'heart', 'oval', 'long'] as const)
    : r.pick(['oval', 'long', 'square', 'round', 'heart', 'oval'] as const);
  const SH = {
    oval: { a: 0, len: 0, chin: 0, jaw: 1, chw: 1, cheek: 1 },
    long: { a: -1.5, len: 2, chin: 3, jaw: 0.94, chw: 0.95, cheek: 0.99 },
    square: { a: 0.5, len: 0, chin: 0, jaw: 1.1, chw: 1.35, cheek: 1 },
    round: { a: 1.2, len: -1.5, chin: -2, jaw: 1.06, chw: 1.2, cheek: 1.04 },
    heart: { a: 0, len: 0, chin: 1, jaw: 0.88, chw: 0.72, cheek: 1.04 },
  }[shape];
  const a = (female ? 32 : look.build === 'stout' ? 38.5 : look.build === 'slim' ? 33.5 : 35.5) + r.range(-1, 1) + SH.a;
  const eyeY = 104 + r.range(-3, 3) + (female ? 2 : 0);
  const browY = eyeY - (female ? 11 : 10.5) - r.range(-1, 1.5);
  const noseLen = (female ? 20 : 22.5) + r.range(-1.5, 2.5) + (young ? -1 : 0) + SH.len;
  const noseY = eyeY + noseLen;
  const mouthY = noseY + (female ? 11 : 12) + r.range(-1, 1.5);
  const chinY = mouthY + (female ? 14 : 16) + r.range(-1, 3) + (look.build === 'stout' ? 2 : 0) + SH.chin;
  const hairY = browY - (female ? 22 : 25) - r.range(-2, 4) - (old ? 4 : 0);

  const skinBase = SKIN[look.skin ?? 'normal'];
  let skin = mix(skinBase, r.pick(['#e8b48a', '#efc9a5', '#d9ae88', '#c99870', '#f0d2b0', '#d8a07c']), r.range(0, 0.45));
  if (female) skin = mix(skin, '#f6e1cc', 0.45);
  if (old) skin = mix(skin, '#c99b74', 0.2);
  const face = look.face;

  const hairBlack = mix('#15110d', '#2b2219', r.next());
  const hairCol = old ? r.pick(['#8a857c', '#b8b2a6', '#d6d0c4', '#6f695f']) : look.role === 'barbarian' ? mix(hairBlack, '#4a3020', 0.4) : hairBlack;

  // eyes
  const eyeKind: EyeKind =
    female ? r.pick(['almond', 'phoenix', 'phoenix', 'almond', 'droop'] as const)
    : face === 'fierce' ? r.pick(['round', 'round', 'almond'] as const)
    : face === 'cunning' ? r.pick(['narrow', 'phoenix', 'narrow'] as const)
    : face === 'noble' ? r.pick(['phoenix', 'almond'] as const)
    : face === 'gentle' ? r.pick(['almond', 'droop', 'almond'] as const)
    : r.pick(['almond', 'narrow', 'phoenix'] as const);
  const eh = { almond: 3.6, phoenix: 2.9, round: 4.8, narrow: 2.3, droop: 3.3 }[eyeKind] * (female ? 0.92 : 1) * r.range(0.9, 1.1);

  const browKind: BrowKind =
    female ? 'willow'
    : face === 'fierce' ? r.pick(['fierce', 'bushy', 'fierce'] as const)
    : face === 'stern' ? r.pick(['sword', 'flat', 'knit'] as const)
    : face === 'cunning' ? r.pick(['knit', 'sparse', 'sword'] as const)
    : face === 'noble' ? r.pick(['sword', 'silkworm', 'flat'] as const)
    : r.pick(['flat', 'sparse', 'silkworm'] as const);
  const mouthKind: MouthKind =
    female ? r.pick(['calm', 'smile', 'pout', 'calm'] as const)
    : face === 'fierce' ? r.pick(['shout', 'frown', 'frown'] as const)
    : face === 'cunning' ? r.pick(['smirk', 'smirk', 'calm'] as const)
    : face === 'gentle' ? r.pick(['smile', 'calm'] as const)
    : face === 'stern' ? r.pick(['frown', 'calm'] as const)
    : 'calm';

  // beard
  const bmap: Record<Look['beard'], BeardKind[]> = {
    none: ['none'],
    stubble: ['stubble', 'moustache'],
    short: ['short', 'goatee', 'moustache', 'short', 'goatee'],
    long: ['long', 'five', 'long'],
    full: ['full', 'curly', 'full'],
  };
  let beardKind = r.pick(bmap[look.beard]);
  if (female || look.role === 'eunuch') beardKind = 'none';
  const beardCol = old ? hairCol : look.role === 'barbarian' && r.chance(0.3) ? '#4a3424' : hairBlack;

  // hair
  let hair: HairKind = 'topknot';
  if (female) hair = look.role === 'warrior' ? r.pick(['tail', 'high', 'bun'] as const) : r.pick(['bun', 'twin', 'side', 'high', 'bun'] as const);
  else if (look.role === 'barbarian') hair = r.pick(['wild', 'braids', 'wild', 'loose'] as const);
  else if (young && r.chance(0.2)) hair = 'loose';
  if (!female && old && r.chance(0.25)) hair = 'bald';

  // hat
  let hk: HatKind;
  const hatHint = look.hat;
  if (look.role === 'emperor') hk = 'mian';
  else if (look.role === 'eunuch') hk = 'eunuch';
  else if (hatHint === 'helmet') hk = r.pick(['helmet', 'helmet', 'helmet', 'winghelm', 'winghelm', 'lionhelm', 'peakhelm', 'peakhelm', 'hequan'] as const);
  else if (hatHint === 'crown') hk = female ? 'phoenix' : r.pick(['goldcrown', 'guan'] as const);
  else if (hatHint === 'guan') hk = r.pick(['guan', 'guan', 'wuguan', 'smallcap', 'futou', 'jieze'] as const);
  else if (hatHint === 'scarf') hk = female ? 'none' : r.pick(['scarf', 'scarf', 'taoist'] as const);
  else if (hatHint === 'headband') hk = look.role === 'barbarian' ? r.pick(['feathers', 'headband'] as const) : 'headband';
  else if (hatHint === 'none') hk = 'none';
  else {
    hk = female ? (look.role === 'warrior' ? r.pick(['none', 'headband', 'none'] as const) : r.pick(['none', 'none', 'phoenix'] as const))
      : look.role === 'warrior' ? r.pick(['helmet', 'helmet', 'winghelm', 'headband', 'none', 'wuguan'] as const)
      : look.role === 'strategist' ? r.pick(['scarf', 'guan', 'scarf', 'taoist'] as const)
      : look.role === 'lord' ? r.pick(['goldcrown', 'guan', 'guan'] as const)
      : look.role === 'scholar' ? r.pick(['guan', 'scarf', 'none', 'smallcap', 'futou', 'jieze'] as const)
      : look.role === 'barbarian' ? r.pick(['feathers', 'headband', 'none', 'hood'] as const)
      : 'none';
  }
  if (hk === 'none' && hair === 'bald' && r.chance(0.5)) hair = 'topknot';

  // dress
  let dk: DressKind;
  switch (look.role) {
    case 'warrior': dk = female ? r.pick(['armour', 'warrobe'] as const) : r.pick(['armour', 'armour', 'warrobe', 'armour'] as const); break;
    case 'strategist': dk = r.pick(['crane', 'robe', 'crane'] as const); break;
    case 'lord': dk = r.pick(['robe', 'robe', 'armour'] as const); break;
    case 'scholar': dk = r.pick(['plainrobe', 'robe', 'crane'] as const); break;
    case 'barbarian': dk = 'fur'; break;
    case 'beauty': dk = 'gown'; break;
    case 'eunuch': dk = 'plainrobe'; break;
    case 'emperor': dk = 'imperial'; break;
  }
  if (['helmet', 'lionhelm', 'winghelm', 'peakhelm'].includes(hk) && dk !== 'fur') dk = 'armour';

  const robePal: Record<Look['role'], RobeKey[]> = {
    warrior: ['indigo', 'cinnabar', 'malachite', 'ochre', 'teal', 'crimson', 'brown', 'azurite', 'green'],
    strategist: ['white', 'sky', 'jade', 'grey', 'azurite'],
    lord: ['gamboge', 'crimson', 'purple', 'indigo', 'cinnabar', 'teal'],
    scholar: ['jade', 'grey', 'sky', 'ochre', 'white', 'teal'],
    barbarian: ['brown', 'ochre', 'cinnabar', 'green'],
    beauty: ['pink', 'rouge', 'jade', 'sky', 'lilac', 'white', 'gamboge'],
    eunuch: ['ink', 'brown', 'crimson', 'teal'],
    emperor: ['ink'],
  };
  const ck = r.pick(robePal[look.role]);
  const col = ROBE[ck];
  const col2 = ROBE[r.pick(['ink', 'indigo', 'crimson', 'white', 'gamboge', 'brown', 'teal'] as const)];
  const metal = r.pick(['#5d5a55', '#6b6760', '#7c7468', '#a8894e', '#8a8f94', '#4a4846']);

  const hatCol =
    hk === 'scarf' ? r.pick(['#3a4f6a', '#2f3c4c', '#4d5e5a', '#e8e2d2', '#3d3a36'])
    : hk === 'headband' ? r.pick([C.cinnabar, '#7a2a2a', '#2f4f74', '#c9a24a', '#e8e2d2', '#3a6a4a'])
    : hk === 'goldcrown' ? C.gold
    : hk === 'phoenix' ? C.gold
    : ['helmet', 'winghelm', 'lionhelm', 'peakhelm'].includes(hk) ? r.pick(['#5d5a55', '#4a4846', '#8a8f94', '#a8894e', '#b89a58', '#c9ccc8', '#3f4a52', '#7a3a2a', '#6a2a24', '#2f3a48', '#5a6a5a'])
    : '#25211d';

  const m: Model = {
    r, look, name, female,
    flip: r.chance(0.5),
    th: r.range(0.18, 0.55),
    tilt: r.range(-4, 4),
    hx: 96 + r.range(-2, 2),
    hy: 105,
    a, hairY, browY, eyeY, noseY, mouthY, chinY,
    jaw: ((look.build === 'stout' ? 1.06 : female ? 0.9 : 0.98) + r.range(-0.04, 0.04) + (face === 'fierce' ? 0.04 : 0)) * SH.jaw,
    chin: (female ? 0.85 : 1) * r.range(0.9, 1.1) * (look.build === 'stout' ? 1.15 : 1) * SH.chw,
    cheek: r.range(0.98, 1.02) * SH.cheek,
    eye: { kind: eyeKind, ue: (female ? 0.42 : 0.41) + r.range(-0.03, 0.03), ew: (female ? 0.215 : 0.2) + r.range(-0.015, 0.02), eh: eh * 1.12, slant: { almond: 1, phoenix: 3, round: 0, narrow: 1.5, droop: -1.5 }[eyeKind] + r.range(-0.8, 0.8), iris: '#2a1d14', gaze: r.range(-0.02, 0.06), lids: female ? 1 : r.range(0.4, 1) },
    brow: {
      kind: browKind, w: (female ? 1.6 : { bushy: 5.5, silkworm: 5, fierce: 4.6, sword: 4, knit: 3.6, flat: 3.4, sparse: 2.4, willow: 1.6 }[browKind]) * r.range(0.9, 1.15),
      lift: r.range(-1.5, 1.5), gap: r.range(0.07, 0.15), col: old ? mix(hairCol, '#3b342b', 0.3) : hairBlack,
    },
    nose: { len: noseLen, wide: (female ? 0.85 : 1) * r.range(0.9, 1.15) * (look.build === 'stout' ? 1.1 : 1), depth: female ? 7 : r.range(8, 11), hook: r.range(-0.5, 1) },
    mouth: { kind: mouthKind, w: (female ? 0.24 : 0.28) + r.range(-0.02, 0.03), lip: female ? 1 : r.range(0.4, 0.8) },
    ear: { size: r.range(0.9, 1.1), lobe: r.range(0.8, 1.2) },
    wrinkles: old ? r.range(0.6, 1) : look.age === 'adult' && !female ? r.range(0, 0.35) : 0,
    blush: female ? r.range(0.25, 0.4) : look.skin === 'ruddy' ? 0.25 : r.range(0.05, 0.14),
    skin,
    skinLine: mix(skin, '#2a170d', 0.72),
    lip: female ? mix('#c4505a', '#b3383f', r.next()) : mix(skin, '#9c4a3e', 0.45),
    hairCol,
    beardCol,
    beard: { kind: beardKind, len: r.range(0.85, 1.2), tash: beardKind === 'none' || beardKind === 'stubble' ? 'none' : r.pick(['droop', 'droop', 'up', 'thin'] as const) },
    hair,
    hat: { kind: hk, col: hatCol, col2: r.pick([C.cinnabar, C.gold, '#2f4f74', '#e8e2d2']), plume: r.pick([C.cinnabar, C.cinnabar, '#e8e2d2', '#2b2b2b', C.gamboge, '#2f4f74', '#4f8a6a']) },
    dress: { kind: dk, col, col2: col2 === col ? ROBE.ink : col2, trim: r.pick([C.gold, C.cinnabar, '#2b2722', '#e9e2d0', C.indigo]), inner: r.pick(['#efe9dc', '#e7dfcc', '#d9d2c2']), metal },
    bgHue: r.pick(['#c7a77a', '#9fb4b8', '#b8a2a0', '#a9b59a', '#c4b28e', '#a7aab8']),
    extras: new Set(),
  };
  if (look.role === 'strategist' && r.chance(0.35)) m.extras.add('fan');
  if (look.role === 'barbarian') {
    if (r.chance(0.6)) m.extras.add('earrings');
    if (r.chance(0.5)) m.extras.add('beads');
    if (r.chance(0.3)) m.extras.add('tattoo');
  }
  if (female && look.role !== 'warrior' && r.chance(0.6)) m.extras.add('flower');
  if (female && r.chance(0.5)) m.extras.add('earrings');
  if (dk === 'armour' && r.chance(0.55)) m.extras.add('cape');
  if (!female && look.role === 'warrior' && r.chance(0.08)) m.extras.add('scar');
  if (look.role === 'emperor' && look.age === 'young') m.beard.kind = 'none';
  if (look.role === 'warrior' && !female) m.brow.w *= r.range(1.05, 1.3);
  if (face === 'fierce') m.extras.add('furrow');
  FAMOUS[name]?.(m);
  return m;
}

// ------------------------------------------------------------------ famous
// Signature looks of well-known figures (traditional opera/novel iconography).
const F = (names: string[], fn: (m: Model) => void) => names.forEach((n) => (FAMOUS[n] = fn));

F(['关羽'], (m) => {
  m.skin = '#b9533f'; // 面如重枣
  m.skinLine = mix(m.skin, '#2a0d08', 0.7);
  m.lip = '#7a2a22';
  m.eye.kind = 'phoenix'; m.eye.eh = 2.4; m.eye.slant = 4; // 丹凤眼
  m.brow.kind = 'silkworm'; m.brow.w = 6; // 卧蚕眉
  m.beard = { kind: 'five', len: 1.5, tash: 'droop' }; // 美髯
  m.beardCol = '#15110d';
  m.hat = { ...m.hat, kind: 'scarf', col: '#2f6a4a' }; // 绿头巾
  m.dress = { ...m.dress, kind: 'armour', col: '#3f7a52', col2: '#2f5a3e', metal: '#a8894e', trim: C.gold };
  m.a = 37;
  m.extras.add('cape');
});
F(['张飞'], (m) => {
  m.skin = '#9d7655'; m.skinLine = mix(m.skin, '#1a0d05', 0.75);
  m.eye.kind = 'round'; m.eye.eh = 5.6; // 环眼
  m.brow.kind = 'bushy'; m.brow.w = 6.5;
  m.beard = { kind: 'curly', len: 1.15, tash: 'up' }; // 虎须
  m.mouth.kind = 'shout';
  m.a = 39.5; m.jaw = 1.1;
  m.hat = { ...m.hat, kind: 'helmet', col: '#4a4846', plume: C.cinnabar };
  m.dress = { ...m.dress, kind: 'armour', col: '#2e2a26', col2: '#5a2a22', metal: '#4a4846' };
});
F(['刘备'], (m) => {
  m.extras.add('bigears'); // 两耳垂肩
  m.ear.size = 1.35; m.ear.lobe = 1.6;
  m.eye.kind = 'droop'; m.brow.kind = 'flat'; m.mouth.kind = 'calm';
  m.beard = { kind: 'goatee', len: 1.1, tash: 'droop' };
  m.hat = { ...m.hat, kind: 'goldcrown', col: C.gold };
  m.dress = { ...m.dress, kind: 'robe', col: '#c9a548', col2: '#7a3a2a', trim: '#7a3a2a' };
});
F(['诸葛亮'], (m) => {
  m.hat = { ...m.hat, kind: 'scarf', col: '#33475e' }; // 纶巾
  m.dress = { ...m.dress, kind: 'crane', col: '#ece6d8', col2: '#2e2a26' }; // 鹤氅
  m.beard = { kind: 'long', len: 1.0, tash: 'thin' };
  m.eye.kind = 'phoenix'; m.brow.kind = 'sword'; m.mouth.kind = 'calm';
  m.extras.add('fan');
  m.look = { ...m.look, face: 'noble' };
});
F(['曹操'], (m) => {
  m.eye.kind = 'narrow'; m.eye.eh = 2.3; m.brow.kind = 'knit'; m.mouth.kind = 'smirk';
  m.beard = { kind: 'short', len: 1.0, tash: 'thin' };
  m.hat = { ...m.hat, kind: 'guan' };
  m.dress = { ...m.dress, kind: 'robe', col: '#8c2b2b', col2: '#2e2a26', trim: C.gold };
});
F(['吕布'], (m) => {
  m.hat = { ...m.hat, kind: 'goldcrown', col: '#c9a24a', plume: '#c9a24a' }; // 紫金冠 + 雉鸡翎
  m.extras.add('pheasant');
  m.beard.kind = 'none'; m.eye.kind = 'phoenix'; m.brow.kind = 'sword'; m.mouth.kind = 'calm';
  m.dress = { ...m.dress, kind: 'armour', col: '#8c2b2b', col2: '#6c4a78', metal: '#b08d4a', trim: C.gold };
  m.extras.add('cape');
});
F(['赵云'], (m) => {
  m.hat = { ...m.hat, kind: 'helmet', col: '#cfd2cc', plume: '#e8e2d2' };
  m.beard.kind = 'none'; m.eye.kind = 'almond'; m.brow.kind = 'sword'; m.mouth.kind = 'calm';
  m.dress = { ...m.dress, kind: 'armour', col: '#e6e0d0', col2: '#5b86ad', metal: '#b7bab4', trim: '#5b86ad' };
  m.extras.add('cape');
});
F(['马超'], (m) => {
  m.hat = { ...m.hat, kind: 'lionhelm', col: '#d4d4cc', plume: '#e8e2d2' }; // 锦马超, 狮盔兽带
  m.beard.kind = 'none'; m.brow.kind = 'sword';
  m.dress = { ...m.dress, kind: 'armour', col: '#e6e0d0', col2: '#e6e0d0', metal: '#c3c6c0' };
});
F(['黄忠'], (m) => {
  m.hairCol = '#d6d0c4'; m.beardCol = '#e0dbd0';
  m.beard = { kind: 'long', len: 1.35, tash: 'droop' }; m.wrinkles = 1;
  m.hat = { ...m.hat, kind: 'helmet', col: '#a8894e' };
});
F(['夏侯惇'], (m) => m.extras.add('eyepatch')); // 拔矢啖睛
F(['孙权'], (m) => {
  m.eye.iris = '#2f6a4a'; // 碧眼
  m.beardCol = '#5e2f4a'; m.beard = { kind: 'short', len: 1.1, tash: 'droop' }; // 紫髯
  m.hat = { ...m.hat, kind: 'goldcrown' };
});
F(['司马懿'], (m) => { m.eye.kind = 'narrow'; m.brow.kind = 'knit'; m.mouth.kind = 'smirk'; m.beard = { kind: 'long', len: 0.9, tash: 'thin' }; });
F(['周瑜'], (m) => { m.beard.kind = 'none'; m.eye.kind = 'phoenix'; m.brow.kind = 'sword'; m.hat = { ...m.hat, kind: 'scarf', col: '#e8e2d2' }; m.dress = { ...m.dress, kind: 'robe', col: '#8c2b2b' }; });
F(['董卓'], (m) => { m.a = 41; m.jaw = 1.16; m.chin = 1.35; m.beard = { kind: 'full', len: 1.0, tash: 'droop' }; m.eye.kind = 'narrow'; m.mouth.kind = 'smirk'; m.hat = { ...m.hat, kind: 'goldcrown' }; });
F(['典韦', '许褚'], (m) => { m.a = 40; m.jaw = 1.14; m.eye.kind = 'round'; m.brow.kind = 'bushy'; m.mouth.kind = 'shout'; m.hat = { ...m.hat, kind: 'headband', col: '#2b2722' }; });
F(['张角', '张宝', '张梁'], (m) => { m.hat = { ...m.hat, kind: 'yellowscarf', col: '#d4a12a' }; m.dress = { ...m.dress, kind: 'plainrobe', col: '#c9a548' }; });
F(['孟获'], (m) => { m.extras.add('earrings'); m.extras.add('beads'); m.hat = { ...m.hat, kind: 'feathers' }; });
F(['祝融', '祝融夫人'], (m) => { m.hat = { ...m.hat, kind: 'feathers' }; m.extras.add('earrings'); m.dress.kind = 'fur'; });
F(['魏延'], (m) => { m.skin = '#c47f5e'; m.skinLine = mix(m.skin, '#2a0d08', 0.7); m.brow.kind = 'fierce'; });
F(['甘宁'], (m) => { m.extras.add('bells'); m.hat = { ...m.hat, kind: 'feathers' }; });
F(['左慈', '于吉', '管辂'], (m) => { m.hat = { ...m.hat, kind: 'taoist' }; m.dress = { ...m.dress, kind: 'crane', col: '#ece6d8' }; m.beard = { kind: 'long', len: 1.4, tash: 'thin' }; m.hairCol = '#d6d0c4'; m.beardCol = '#e0dbd0'; });
F(['貂蝉', '大乔', '小乔'], (m) => { m.extras.add('flower'); m.extras.add('pearls'); });
F(['孙尚香'], (m) => { m.hair = 'high'; m.hat = { ...m.hat, kind: 'headband', col: C.cinnabar }; m.dress = { ...m.dress, kind: 'armour', col: '#b5506a', metal: '#b08d4a' }; });
F(['蔡琰', '蔡文姬'], (m) => { m.dress = { ...m.dress, kind: 'gown', col: '#e8e2d2', col2: '#5b86ad' }; });
