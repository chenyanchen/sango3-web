// Game rules data of the generated set: items, soldiers, 武将技/军师技,
// formations, official titles and experience tables. All names and numbers are
// our own design (historical titles/texts are facts). Consumed by src/data/db.ts.
//
// Other modules: people data writes Game Age0N/EMPEROR (the runner concatenates
// Game sections), the field agent writes SFMap.
import type { IniSection } from '../types.ts';
import { thingSections } from './_rules_items.ts';
import { bfSections, sfSections } from './_rules_skills.ts';

export { ITEM_ICONS, HORSE_LOOKS, WEAPON_NAMES, HORSE_NAMES, BOOK_NAMES, ITEMS } from './_rules_items.ts';

// ------------------------------------------------------------------ soldiers
// Battle stats: hp = StartHP + AddHP·lv, power = StartPower + AddPower·lv (lv 1..30,
// advanced form from lv 10). HitRate0k = % chance to hit soldier type k, 09 = vs general.
// Type semantics are fixed by the runtime: 1/8 ranged, 3 mounted, advanced 1/3/4/5/6 mounted,
// 7 female; sprites are objects 34010 + 10·type (+100 advanced).
// [name, advanced name, startHp, addHp, startPower, addPower, hit vs 0..8, vs general]
type Sol = [string, string, number, number, number, number, number[]];
// prettier-ignore
export const SOLDIERS: Sol[] = [
  //                                        刀  弓  枪  骑  斗  蛮  藤  女  弩  将
  ['刀盾兵', '陷阵兵', 14, 3, 6, 1, [50, 65, 55, 35, 50, 50, 55, 55, 65, 45]], // sturdy line infantry, beats ranged, loses to cavalry
  ['弓手',   '骑射手', 12, 2, 7, 1, [60, 50, 60, 60, 60, 65, 15, 60, 55, 35]], // ranged; useless vs rattan armour
  ['长枪兵', '长戟兵', 12, 3, 6, 1, [50, 60, 50, 80, 50, 50, 50, 55, 60, 45]], // anti-cavalry
  ['轻骑',   '铁骑', 12, 3, 7, 1, [60, 70, 35, 50, 55, 45, 50, 60, 70, 50]], // fast (+20 field move), crushes infantry/ranged, fears spears
  ['技击兵', '驭虎兵', 14, 2, 9, 1, [65, 60, 65, 50, 50, 55, 60, 55, 60, 55]], // hard hitters, fragile
  ['山蛮兵', '战象兵', 15, 3, 6, 1, [55, 55, 55, 50, 45, 50, 50, 55, 55, 45]], // high HP brutes
  ['藤甲兵', '藤甲骑', 15, 3, 5, 1, [50, 45, 50, 40, 40, 50, 50, 45, 45, 40]], // arrow-proof, weak offence
  ['女兵',   '巾帼骑', 11, 3, 7, 1, [60, 65, 55, 50, 50, 65, 50, 50, 65, 70]], // general hunters
  ['强弩兵', '连弩兵', 11, 2, 9, 1, [55, 50, 55, 70, 60, 60, 10, 55, 50, 40]], // ranged anti-cavalry, useless vs rattan
];

function soldierSections(): IniSection[] {
  return SOLDIERS.map(([name, adv, sh, ah, sp, ap, hit], no) => {
    const s: IniSection = {
      _: 'ITEM', No: String(no), Name: name, NameAdv: adv, ResID: String(34010 + 10 * no),
      StartHP: String(sh), AddHP: String(ah), StartPower: String(sp), AddPower: String(ap),
    };
    hit.forEach((h, k) => (s[`HitRate0${k}`] = String(h)));
    return s;
  });
}

// ------------------------------------------------------------------ formations
// Battle: x = 340 + 12·gx from the own edge (larger = closer to the enemy),
// y = 189 + 12.8·gy (gy 0..31, larger = lower on screen = right wing when facing right).
// BigGroup order: 前军 中军 后军 右翼 左翼. TerrainCost is indexed by 野战 terrain:
// 0 -, 1平地 2草原 3森林 4沙漠 5水区 6雪地 7街道 8雪山 9山地 10城墙 11城门 12房舍 13主城 14 -
// (base move 70; 999 = impassable).
interface Rank { name: string; gen: [number, number]; groups: [number, number][]; big: number[][]; cost: number[] }
// prettier-ignore
export const RANKS: Rank[] = [
  { // 0 方阵: 3×3 square, general in the rear centre
    name: '方阵', gen: [19, 15],
    groups: [[40, 5], [40, 15], [40, 25], [30, 5], [30, 15], [30, 25], [20, 5], [20, 25]],
    big: [[0, 1, 2], [3, 4, 5], [6, 7], [], []],
    cost: [10, 10, 11, 18, 22, 26, 20, 9, 999, 26, 999, 18, 16, 40, 999],
  },
  { // 1 圆阵: ring around the general — defensive, compact (better in rough terrain)
    name: '圆阵', gen: [26, 15],
    groups: [[38, 15], [35, 23], [26, 26], [17, 23], [14, 15], [17, 7], [26, 4], [35, 7]],
    big: [[0, 1, 7], [], [3, 4, 5], [2], [6]],
    cost: [12, 12, 13, 16, 22, 28, 20, 11, 999, 22, 999, 18, 16, 40, 999],
  },
  { // 2 锋矢阵: chevron arrowhead — punches through, fast on open ground
    name: '锋矢阵', gen: [22, 15],
    groups: [[50, 15], [43, 11], [43, 19], [36, 7], [36, 23], [29, 3], [29, 27], [32, 15]],
    big: [[0, 1, 2], [7], [], [4, 6], [3, 5]],
    cost: [8, 8, 9, 22, 20, 30, 22, 8, 999, 32, 999, 16, 20, 36, 999],
  },
  { // 3 雁行阵: oblique echelon — wide front, quick flanking on open ground
    name: '雁行阵', gen: [22, 8],
    groups: [[45, 2], [40, 6], [35, 10], [30, 14], [25, 18], [20, 22], [15, 26], [10, 29]],
    big: [[0, 1], [2, 3], [6, 7], [4, 5], []],
    cost: [9, 9, 9, 24, 18, 30, 20, 10, 999, 34, 999, 22, 22, 44, 999],
  },
  { // 4 鱼鳞阵: staggered scales 3-2-3 — good in forests, streets and gates
    name: '鱼鳞阵', gen: [16, 15],
    groups: [[40, 6], [40, 15], [40, 24], [33, 10], [33, 20], [26, 6], [26, 15], [26, 24]],
    big: [[0, 1, 2], [3, 4], [5, 6, 7], [], []],
    cost: [11, 11, 12, 14, 24, 28, 22, 10, 999, 22, 999, 16, 12, 34, 999],
  },
  { // 5 鹤翼阵: wings thrown forward to envelop, centre held back
    name: '鹤翼阵', gen: [22, 15],
    groups: [[44, 2], [38, 7], [44, 28], [38, 23], [30, 12], [30, 18], [18, 11], [18, 19]],
    big: [[], [4, 5], [6, 7], [2, 3], [0, 1]],
    cost: [10, 10, 10, 22, 16, 26, 18, 11, 999, 30, 999, 24, 22, 44, 999],
  },
  { // 6 长蛇阵: long column — marches through mountains, snow and water
    name: '长蛇阵', gen: [26, 21],
    groups: [[47, 14], [41, 16], [35, 14], [29, 16], [23, 14], [17, 16], [11, 14], [5, 16]],
    big: [[0, 1, 2], [3, 4], [5, 6, 7], [], []],
    cost: [11, 11, 11, 13, 18, 18, 16, 8, 999, 18, 999, 20, 16, 40, 999],
  },
  { // 7 偃月阵: crescent with the general at the head — siege and assault
    name: '偃月阵', gen: [36, 15],
    groups: [[42, 15], [38, 8], [38, 22], [32, 3], [32, 27], [28, 15], [22, 10], [22, 20]],
    big: [[0, 5], [], [6, 7], [2, 4], [1, 3]],
    cost: [11, 11, 12, 20, 22, 28, 22, 10, 999, 28, 999, 12, 14, 28, 999],
  },
];

function rankSections(): IniSection[] {
  return RANKS.map((r, i) => {
    const s: IniSection = { _: `RANK${String(i).padStart(2, '0')}`, Name: r.name, GeneralPos: r.gen.join(', ') };
    r.groups.forEach((p, k) => (s[`GroupPos0${k}`] = p.join(', ')));
    r.big.forEach((b, k) => (s[`BigGroup0${k}`] = b.join(',')));
    s.TerrainCost = r.cost.join(', ');
    return s;
  });
}

// ------------------------------------------------------------------ titles
// Each title is held by one general per nation. Tiers: [level, soldiers, names...]
// (historical Han / Three Kingdoms offices, our own level and troop curve).
// prettier-ignore
export const TITLE_TIERS: [number, number, string[]][] = [
  [1, 40, ['屯长', '军侯', '都伯', '部曲督', '帐下督', '门下督']],
  [3, 60, ['军司马', '别部司马', '骑都尉', '奉车都尉', '驸马都尉', '典军都尉']],
  [6, 85, ['越骑校尉', '屯骑校尉', '步兵校尉', '射声校尉', '长水校尉']],
  [9, 110, ['牙门将军', '裨将军', '偏将军', '虎贲中郎将', '武卫中郎将', '中郎将']],
  [12, 135, ['折冲将军', '扬武将军', '破虏将军', '讨寇将军', '荡寇将军', '横野将军']],
  [15, 160, ['建威将军', '振威将军', '奋威将军', '扬威将军', '广威将军']],
  [18, 185, ['平东将军', '平西将军', '平南将军', '平北将军']],
  [22, 210, ['安东将军', '安西将军', '安南将军', '安北将军']],
  [26, 235, ['镇东将军', '镇西将军', '镇南将军', '镇北将军']],
  [30, 260, ['征东将军', '征西将军', '征南将军', '征北将军']],
  [34, 285, ['前将军', '后将军', '左将军', '右将军']],
  [38, 310, ['卫将军', '车骑将军', '骠骑将军']],
  [43, 340, ['大将军', '大司马']],
  [50, 360, ['太尉']],
];

function titleSections(): IniSection[] {
  const out: IniSection[] = [];
  for (const [level, soldiers, names] of TITLE_TIERS)
    for (const name of names) out.push({ _: 'ITEM', No: String(out.length), Name: name, Level: String(level), Soldiers: String(soldiers) });
  return out;
}

// ------------------------------------------------------------------ experience
/**
 * Cumulative experience needed to reach level L (index = level). Callers grant
 * battle ≈ (kills·2 + 30, +50 on a win) × EXP_RATE (1.7), domestic ≈ 10..25 × 1.7.
 * Curve: ~2 battles per level around Lv10, ~6 around Lv25, ~15 around Lv40.
 */
export function generalExp(L: number): number {
  if (L <= 1) return 0;
  const v = 25.5 * (L - 1) ** 2.3 + 120 * (L - 1);
  return Math.round(v / 10) * 10;
}
/** Soldier experience (unused by the runtime; kept for completeness): levels 1..30. */
export function soldierExp(L: number): number {
  if (L <= 1) return 0;
  return Math.round((60 * (L - 1) ** 2 + 140 * (L - 1)) / 10) * 10;
}

function expSection(name: string, max: number, f: (l: number) => number): IniSection {
  const s: IniSection = { _: name };
  for (let l = 1; l <= max; l++) s[String(l).padStart(2, '0')] = String(f(l));
  return s;
}

export function files(): Record<string, IniSection[]> {
  return {
    Thing: thingSections(),
    Soldier: soldierSections(),
    BFMagic: bfSections(),
    SFMagic: sfSections(),
    Rank: rankSections(),
    GenTitle: titleSections(),
    Game: [expSection('GENERALEXP', 99, generalExp), expSection('SOLDIEREXP', 30, soldierExp), { _: 'CHECK', Language: '2' }],
  };
}
