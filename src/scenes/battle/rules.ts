// 百人战 rules shared by the real-time battle and the instant auto-resolution.
// Everything here is pure (no rendering) so that autoBattle() stays
// consistent with what the player experiences.
import { db, type BFMagicDef } from '../../data/db';
import type { BattleSide, BattleSetup, Terrain, TimeOfDay, Weather } from '../../game/contracts';
import type { GeneralState } from '../../game/state';
import { G } from '../../game/state';

/** Logic ticks per displayed battle second (the timer counts down from 99). */
export const TICKS_PER_SEC = 36;
export const TIME_LIMIT = 99;

/** soldier type index used for "vs general" hit rates */
export const VS_GENERAL = 9;

export const RANGED_TYPES = new Set([1, 8]); // 弓箭兵 / 弩兵 (and their advanced forms)
export const MOUNTED_TYPES = new Set([3]); // 轻骑兵/铁骑兵 always mounted
/** advanced forms that are mounted (弓骑兵, 驯兽兵 tiger, 象兵, 籐骑兵) */
export const MOUNTED_ADV = new Set([1, 3, 4, 5, 6]);

/** Soldier level from the general's level and the troops' morale/training. */
export function soldierLevel(g: GeneralState, morale: number) {
  return Math.max(1, Math.min(30, Math.round(1 + g.level * 0.35 + morale / 20)));
}
export const ADVANCED_LEVEL = 10;

export function soldierStats(type: number, level: number) {
  const s = db.soldiers[type] ?? db.soldiers[0];
  return {
    hp: s.startHp + s.addHp * level,
    power: s.startPower + s.addPower * level,
  };
}

/** chance (0..1) that soldier type `a` hits target type `b` (b = 9 → general) */
export function hitChance(a: number, b: number) {
  const s = db.soldiers[a] ?? db.soldiers[0];
  return (s.hitRate[b] ?? 50) / 100;
}

export function weaponBonus(g: GeneralState) {
  const it = g.weapon >= 0 ? db.items[g.weapon] : undefined;
  return it && it.type === 2 ? it.inc : 0;
}

export function horseObject(g: GeneralState): number {
  const it = g.horse >= 0 ? db.items[g.horse] : undefined;
  return it && it.type === 4 && it.attribute >= 38001 && it.attribute <= 38014 ? it.attribute : 0;
}
export function horseSpeed(g: GeneralState) {
  const it = g.horse >= 0 ? db.items[g.horse] : undefined;
  return it && it.type === 4 ? it.inc : 0;
}

/** General attack value (武力 + weapon). */
export function generalAttack(g: GeneralState) {
  return g.str + weaponBonus(g) * 2;
}

/** Damage a general deals to a soldier per hit. */
export function genVsSoldierDamage(atk: number) {
  return atk * 0.55;
}
/** Damage a general deals to the enemy general per hit. */
export function genVsGenDamage(atk: number, defStr: number) {
  return Math.max(2, atk * 0.24 - defStr * 0.05);
}
/** Damage a soldier deals to another soldier per hit. */
export function solVsSolDamage(power: number, morale: number) {
  return power * (0.28 + morale / 1000);
}
/** Damage a soldier deals to a general per hit. */
export function solVsGenDamage(power: number, defStr: number) {
  return Math.max(0.6, power * 0.16 * (1 - defStr / 330));
}

// ------------------------------------------------------------------ terrain
/** contracts.Terrain → BFMagic terrain code (1平地 2草原 3森林 4山地 5沙漠 6水上 7雪地 8城寨 9城墙 10街道 11宫殿 12帐篷) */
export function bfTerrain(t: Terrain): number {
  switch (t as number) {
    case 2 /* Grass */: return 2;
    case 3 /* Forest */: return 3;
    case 9 /* Mountain */: return 4;
    case 4 /* Desert */: return 5;
    case 5 /* Water */: return 6;
    case 6 /* Snow */: case 8 /* SnowMountain */: return 7;
    case 11 /* Gate */: return 8;
    case 10 /* Wall */: return 9;
    case 7 /* Road */: case 12 /* House */: return 10;
    case 13 /* Castle */: return 11;
    default: return 1;
  }
}
/** BF background set (BF/BG NN) for a terrain. */
export function bgForTerrain(t: Terrain): number {
  switch (t as number) {
    case 2 /* Grass */: return 2;
    case 3 /* Forest */: return 3;
    case 9 /* Mountain */: return 4;
    case 4 /* Desert */: return 5;
    case 5 /* Water */: return 6;
    case 6 /* Snow */: case 8 /* SnowMountain */: return 7;
    case 10 /* Wall */: case 11 /* Gate */: return 9;
    case 7 /* Road */: case 12 /* House */: case 13 /* Castle */: return 11;
    default: return 1;
  }
}
/** contracts.Weather → BFMagic weather code (1晴 2雨 3雪), 0 = none of these */
export function bfWeather(w: Weather): number {
  return w === 0 ? 1 : w === 2 ? 2 : w === 3 ? 3 : 0;
}
export function bfTime(t: TimeOfDay): number {
  return t + 1;
}

export interface SkillCtx {
  terrain: number;
  time: number;
  weather: number;
}
export function skillCtx(setup: BattleSetup): SkillCtx {
  return { terrain: bfTerrain(setup.terrain), time: bfTime(setup.time), weather: bfWeather(setup.weather) };
}

/** Whether a skill can be used in the given conditions ("无法使用"). */
export function skillAllowed(m: BFMagicDef, c: SkillCtx) {
  if (m.badTerrain.includes(c.terrain)) return false;
  if (m.badTime.includes(c.time)) return false;
  if (c.weather && m.badWeather.includes(c.weather)) return false;
  return true;
}
/** Effect multiplier ("效果增强"). */
export function skillBoost(m: BFMagicDef, c: SkillCtx) {
  let k = 1;
  if (m.goodTerrain.includes(c.terrain)) k *= 1.5;
  if (m.goodTime.includes(c.time)) k *= 1.25;
  if (c.weather && m.goodWeather.includes(c.weather)) k *= 1.25;
  return k;
}

/** Skill damage to one soldier caught in the effect. */
export function skillSoldierDamage(m: BFMagicDef, g: GeneralState, boost: number) {
  return (m.power * 2.4 + g.int * 0.18 + g.level * 0.6) * boost;
}
/** Skill damage to the enemy general (once per cast for area skills). */
export function skillGeneralDamage(m: BFMagicDef, g: GeneralState, boost: number, direct: boolean) {
  const base = direct ? m.power * 2.2 + g.int * 0.25 + g.str * 0.15 : m.power * 1.1 + g.int * 0.12;
  return base * boost;
}

// ------------------------------------------------------------------ side setup
export interface SideInfo {
  side: 0 | 1;
  def: BattleSide;
  gs: GeneralState;
  name: string;
  soldierType: number;
  level: number;
  advanced: boolean;
  soldierHp: number;
  soldierPower: number;
  atk: number;
}

export function sideInfo(side: 0 | 1, def: BattleSide): SideInfo {
  const gs = G.generals[def.general - 1];
  const level = soldierLevel(gs, def.morale);
  const st = soldierStats(def.soldierType, level);
  return {
    side, def, gs, name: db.generals[def.general - 1]?.name ?? '?',
    soldierType: def.soldierType, level, advanced: level >= ADVANCED_LEVEL,
    soldierHp: st.hp, soldierPower: st.power, atk: generalAttack(gs),
  };
}

export function soldierName(type: number, advanced: boolean) {
  const s = db.soldiers[type];
  return s ? (advanced ? s.nameAdv : s.name) : '';
}
