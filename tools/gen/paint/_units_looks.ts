// Appearance of each battle sprite set: general sets (from data/unitsets.ts)
// and the soldier types (team-coloured: side 0 indigo, side 1 cinnabar).
import { C, mix } from '../ink.ts';
import { UNIT_SETS, type UnitSet } from '../data/unitsets.ts';
import type { Helm, Look, Weapon } from './_units_figure.ts';

type Hue = UnitSet['hue'];
const HUES: Record<Hue, { armor: string; armor2: string; cloth: string }> = {
  red: { armor: '#cf6a50', armor2: '#9e3a2c', cloth: '#d99a84' },
  green: { armor: '#5f9a78', armor2: '#3d6e57', cloth: '#9cc0a4' },
  blue: { armor: '#5a84ad', armor2: '#34577e', cloth: '#9db6cc' },
  black: { armor: '#4d4943', armor2: '#2f2c28', cloth: '#7a7268' },
  white: { armor: '#eee8da', armor2: '#bdb7a8', cloth: '#ddd5c4' },
  gold: { armor: '#d9ad4a', armor2: '#a77a2a', cloth: '#e3c98a' },
  purple: { armor: '#8a6292', armor2: '#5c3f68', cloth: '#b79bbd' },
  brown: { armor: '#a8784a', armor2: '#74502e', cloth: '#c9a47a' },
};
const SKIN = '#e9c79f';
const BOOT = '#3a332c';

function base(hue: Hue): Look {
  const h = HUES[hue];
  return {
    armor: h.armor, armor2: h.armor2, cloth: h.cloth, trim: C.gold, skin: SKIN, boots: BOOT,
    helm: 'helmet', helmColor: mix(h.armor2, '#2a2520', 0.15), plume: 'tassel', plumeColor: C.cinnabar,
    beard: 'none', cape: null, sash: null, female: false, bare: false, plates: true,
    weapon: 'spear', shield: null, quiver: false, bulk: 1, hair: '#26211c',
  };
}

type Extra = Partial<Look>;
// prettier-ignore
const HERO: Record<number, Extra> = {
  1: { helm: 'guan', helmColor: '#3d6e57', beard: 'long', skin: '#c9785a', cape: '#4f8a6a', plates: true, bulk: 1.08 },
  2: { beard: 'tiger', skin: '#d0a27a', bulk: 1.14, plume: 'tassel', plumeColor: '#2a2520' },
  3: { plume: 'tassel', plumeColor: C.cinnabar, cape: '#f1ece0', helmColor: '#d8d4ca' },
  4: { helm: 'crown', helmColor: C.gold, plume: 'pheasant', plumeColor: C.cinnabar, cape: '#b13a2a', trim: C.gold },
  5: { helm: 'lion', helmColor: '#d8d4ca', cape: '#f1ece0', plume: 'tassel' },
  6: { beard: 'long', beardColor: '#e8e2d6', helmColor: '#a77a2a', plume: 'tassel' },
  7: { bare: true, helm: 'band', helmColor: '#9e3a2c', beard: 'short', bulk: 1.2, skin: '#c89668', plates: false },
  8: { helm: 'crown', helmColor: C.gold, plume: 'none', beard: 'short', cape: '#5c3f68', plates: false },
  9: { helm: 'crown', helmColor: C.gold, plume: 'none', beard: 'short', cape: '#3d6e57', plates: false },
  10: { helm: 'crown', helmColor: C.gold, plume: 'none', cape: '#9e3a2c', plates: true },
  11: { helm: 'guan', helmColor: '#3a3a3a', beard: 'long', plates: false, cape: '#f4efe4', trim: '#3a3a3a' },
  12: { patch: true, beard: 'short', plume: 'feather', plumeColor: '#2a2520' },
  13: { beard: 'tiger', bulk: 1.1, plume: 'tassel', plumeColor: C.cinnabar },
  14: { plume: 'tassel', plumeColor: C.cinnabar, cape: '#b13a2a' },
  15: { helm: 'band', helmColor: '#b13a2a', sash: '#d4a12a', plates: false, plume: 'feather', plumeColor: '#d4a12a' },
  16: { plume: 'tassel' },
  17: { bare: true, helm: 'wild', helmColor: '#9e3a2c', plume: 'feather', plumeColor: '#b13a2a', skin: '#b98a5c', bulk: 1.15, plates: false, beard: 'short' },
  18: { helm: 'cap', helmColor: '#3a3a3a', plates: false, cape: '#f1ece0' },
  19: { plume: 'tassel' },
  20: { plume: 'tassel', beard: 'short' },
  21: { beard: 'short', bulk: 1.08 },
  22: { plume: 'tassel' },
  23: { plume: 'feather', plumeColor: C.cinnabar },
  24: { beard: 'tiger' },
  25: { plume: 'tassel', beard: 'goatee' },
  26: { helm: 'cap', helmColor: '#34577e', plates: false, beard: 'goatee' },
  27: { beard: 'short', bulk: 1.1 },
  28: { helm: 'bun', female: true, sash: '#d4a12a', plates: false, cape: null },
  29: { plume: 'tassel', beard: 'short' },
  30: { helm: 'guan', helmColor: '#2f2c28', plates: false, beard: 'goatee' },
  31: { helm: 'guan', helmColor: '#34577e', plates: false, beard: 'goatee' },
  32: { helm: 'cap', helmColor: '#5c3f68', plates: false, beard: 'short' },
  33: { helm: 'band', helmColor: '#3d6e57', plates: false },
  34: { plume: 'tassel', beard: 'short' },
  35: { beard: 'long', plume: 'tassel' },
  36: { helm: 'veil', helmColor: '#f1ece0', female: true, cape: '#f1ece0', sash: C.cinnabar, plates: false },
  37: { plume: 'tassel' },
  38: { helm: 'band', helmColor: '#74502e', plates: false, beard: 'short' },
  39: { beard: 'long' },
  40: { plume: 'tassel', beard: 'short' },
  41: { beard: 'tiger', bulk: 1.08 },
  42: { helm: 'guan', helmColor: '#3a3a3a', plates: false, beard: 'goatee' },
  43: { helm: 'bun', female: true, sash: '#b13a2a', plates: false },
  80: { bare: true, helm: 'wild', helmColor: '#b13a2a', plume: 'feather', plumeColor: '#b13a2a', skin: '#b98a5c', bulk: 1.15, plates: false },
  81: { bare: true, helm: 'band', helmColor: '#2f2c28', skin: '#c08e62', bulk: 1.1, plates: false, beard: 'short' },
  82: { helm: 'turban', helmColor: '#7a5a3a', beard: 'tiger', plates: false, cape: '#a8784a' },
  83: { helm: 'wild', female: true, helmColor: C.gold, plume: 'feather', plumeColor: '#b13a2a', skin: '#c99a6c', plates: false, sash: '#d4a12a' },
};

const GENERIC_ALT: Record<number, { base: number; hue: Hue }> = {
  137: { base: 37, hue: 'green' }, 138: { base: 38, hue: 'blue' }, 139: { base: 39, hue: 'red' }, 140: { base: 40, hue: 'black' },
  141: { base: 41, hue: 'brown' }, 142: { base: 42, hue: 'purple' }, 143: { base: 43, hue: 'gold' },
};

export interface GeneralLook {
  look: Look;
  barb: boolean;
}

export function generalLook(set: number): GeneralLook {
  const alt = GENERIC_ALT[set];
  const us = UNIT_SETS.find((u) => u.set === (alt?.base ?? set)) ?? UNIT_SETS.find((u) => u.set === 37)!;
  const hue = alt?.hue ?? us.hue;
  const ex = HERO[alt?.base ?? set] ?? {};
  const L = base(hue);
  const rest = ex;
  Object.assign(L, rest);
  if (us.sex === 2) L.female = true;
  L.weapon = us.weapon as Weapon;
  if (L.helm === ('helmet' as Helm) && !rest.helmColor) L.helmColor = mix(HUES[hue].armor2, '#2a2520', 0.2);
  if (L.bare) L.cloth = HUES[hue].armor2;
  return { look: L, barb: set >= 80 && set <= 83 };
}

// ------------------------------------------------------------------ soldiers
export type MountKind = 'horse' | 'barded' | 'tiger' | 'elephant';
export interface SoldierKind {
  type: number;
  adv: boolean;
  side: 0 | 1;
  look: Look;
  cls: 'blade' | 'pole' | 'bow' | 'xbow' | 'fist';
  mount: MountKind | null;
  /** scale of the figure */
  s: number;
}

export const TEAM = [
  { main: '#3d5f86', light: '#8eaac6', dark: '#263f5c' },
  { main: '#b5452f', light: '#dc9a84', dark: '#7c2a1e' },
] as const;

/** Soldier dir number (e.g. 104, 011) → kind. */
export function soldierKind(dirNum: number): SoldierKind {
  const adv = dirNum >= 100;
  const rest = dirNum % 100;
  const side: 0 | 1 = rest >= 10 ? 1 : 0;
  const type = (rest % 10) - 1;
  const T = TEAM[side];
  const L: Look = {
    armor: T.main, armor2: T.dark, cloth: '#ddd4c0', trim: C.gold, skin: SKIN, boots: BOOT,
    helm: 'cap', helmColor: T.dark, plume: 'none', plumeColor: T.main, beard: 'none', cape: null, sash: null,
    female: false, bare: false, plates: false, weapon: 'dao', shield: null, quiver: false, bulk: 1, hair: '#26211c',
  };
  let cls: SoldierKind['cls'] = 'blade';
  let mount: MountKind | null = null;
  switch (type) {
    case 0: // 朴刀兵
      L.weapon = 'dao';
      L.shield = { color: '#c9b48a', face: T.main, kind: 'round' };
      if (adv) Object.assign(L, { helm: 'helmet', plume: 'tassel', plumeColor: T.main, helmColor: '#5a554d', plates: true, armor: '#8f8a80' });
      break;
    case 1: // 弓箭兵 / 弓骑兵
      L.weapon = 'bow';
      L.quiver = true;
      cls = 'bow';
      L.helm = 'band';
      L.helmColor = T.main;
      if (adv) Object.assign(L, { helm: 'helmet', helmColor: '#5a554d', plume: 'feather', plumeColor: T.main, plates: true });
      if (adv) mount = 'horse';
      break;
    case 2: // 短枪兵 / 长枪兵
      L.weapon = 'spear';
      cls = 'pole';
      if (adv) Object.assign(L, { helm: 'helmet', plume: 'tassel', plumeColor: T.main, helmColor: '#5a554d', plates: true, armor: '#8f8a80' });
      else L.shield = { color: '#c9b48a', face: T.main, kind: 'rect' };
      break;
    case 3: // 轻骑兵 / 铁骑兵
      L.weapon = 'lance';
      cls = 'pole';
      L.helm = 'helmet';
      L.plume = 'tassel';
      L.plumeColor = T.main;
      L.helmColor = '#5a554d';
      L.plates = adv;
      if (adv) L.armor = '#8f8a80';
      mount = adv ? 'barded' : 'horse';
      break;
    case 4: // 武斗兵 / 驯兽兵
      L.weapon = 'staff';
      cls = 'pole';
      L.helm = 'band';
      L.helmColor = T.main;
      L.sash = T.main;
      L.armor = '#d9cdb4';
      L.armor2 = T.main;
      if (adv) {
        mount = 'tiger';
        L.weapon = 'hook';
        L.bare = true;
        L.skin = '#d4a676';
        L.cloth = T.dark;
      }
      break;
    case 5: // 蛮族兵 / 象兵
      L.weapon = adv ? 'hook' : 'club';
      cls = adv ? 'pole' : 'blade';
      L.bare = true;
      L.skin = '#c08e62';
      L.helm = 'wild';
      L.helmColor = T.main;
      L.plume = 'feather';
      L.plumeColor = T.main;
      L.cloth = T.dark;
      L.bulk = 1.08;
      if (adv) mount = 'elephant';
      break;
    case 6: // 藤甲兵 / 藤骑兵
      L.weapon = 'dao';
      L.armor = '#c9a565';
      L.armor2 = '#9a7a40';
      L.cloth = '#c9a565';
      L.helm = 'rattan';
      L.helmColor = '#c9a565';
      L.trim = T.main;
      L.shield = { color: '#c9a565', face: T.main, kind: 'rattan' };
      L.plates = false;
      if (adv) {
        mount = 'horse';
        L.weapon = 'spear';
        cls = 'pole';
      }
      break;
    case 7: // 女兵
      L.female = true;
      L.weapon = adv ? 'sword' : 'twinblades';
      L.helm = adv ? 'veil' : 'bun';
      L.helmColor = T.main;
      L.sash = T.light;
      L.cloth = T.light;
      L.plates = adv;
      L.bulk = 0.92;
      break;
    case 8: // 弩兵 / 连弩兵
      L.weapon = 'xbow';
      cls = 'xbow';
      L.helm = 'helmet';
      L.plume = 'none';
      L.helmColor = '#5a554d';
      L.plates = adv;
      if (adv) L.armor = '#8f8a80';
      break;
  }
  if (L.plates && L.armor === '#8f8a80') L.trim = T.main;
  return { type, adv, side, look: L, cls, mount, s: 0.84 };
}
