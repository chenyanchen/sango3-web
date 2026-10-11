// 武将技 (BFMagic, 125) and 军师技 (SFMagic, 23) of the generated set. Names,
// costs and requirements are our own design. The visual behaviour of each BF id
// is hard-coded in src/scenes/battle/skills.ts (SPECS); every name here was
// chosen to fit that archetype. SF ids have fixed effects in
// src/scenes/field/war.ts (const M).
//
// BF damage: per soldier = Power·1.8 + 智力·0.14 + level·0.4 (× terrain/time/
// weather boost); Power < 0 marks a heal (|Power|·2.8..3.4 + 智力·0.3 HP).
// Codes: terrain 1平地 2草原 3森林 4山地 5沙漠 6水上 7雪地 8城寨 9城墙 10街道
// 11宫殿 12帐篷; time 1早晨 2黄昏 3夜晚; weather 1晴 2雨 3雪.
import type { IniSection } from '../types.ts';

/** BF skill Attribute (element/category, informational). */
export const BF_ATTR = { arrow: 1, engine: 2, water: 3, fire: 4, thunder: 5, earth: 6, ice: 7, beast: 8, art: 9, troops: 10, wind: 11 } as const;
type Attr = keyof typeof BF_ATTR;
/** Requirement style: i = 智力-based, s = 武力-based, b = both moderate, w = brute (武力-based, 智力 capped) */
type Req = 'i' | 's' | 'b' | 'w';

interface Cond { gt?: number[]; bt?: number[]; gtm?: number[]; btm?: number[]; gw?: number[]; bw?: number[] }
// [name, tier 1..10, attr, req, spec, condition, power override]
type S = [string, number, Attr, Req, string, Cond?, number?];

const FIRE: Cond = { gt: [2, 3], bt: [6], gw: [1], bw: [2] };
const WATER: Cond = { gt: [6], gw: [2], bt: [5] };
const THUNDER: Cond = { gw: [2], gtm: [3] };
const ICE: Cond = { gt: [7], gw: [3], bt: [5] };
const ROLL: Cond = { gt: [4], bt: [6] };
const SNOWROLL: Cond = { gt: [7], gw: [3], bt: [5, 6] };
const BEAST: Cond = { gt: [3, 2], bt: [6, 9] };
const HORSE: Cond = { gt: [1, 2], bt: [6, 9, 4] };
const SIEGE: Cond = { gt: [8, 9], bt: [6] };
const SKY: Cond = { bw: [2, 3] };
const NIGHT: Cond = { gtm: [3] };

const A = (spec: string) => spec;
const ALL = A('攻击敌方全军');
const ONE = A('攻击敌方主将');
const WIDE = A('攻击敌军大片区域');
const LANE = A('冲过敌阵，沿途伤敌');
const NEAR = A('伤及主将周围敌军');

// prettier-ignore
const BF: Record<number, S> = {
  1: ['骤雨箭', 1, 'arrow', 's', ALL],
  2: ['铁蒺藜', 1, 'engine', 's', LANE, { bt: [6] }],
  3: ['涌泉', 1, 'water', 'i', ALL, WATER],
  4: ['回春术', 2, 'art', 'i', '恢复主将体力', {}, -18],
  5: ['地火', 1, 'fire', 'i', ALL, FIRE],
  6: ['滚轮车', 1, 'engine', 's', LANE, ROLL],
  7: ['滚雪', 1, 'ice', 'b', LANE, SNOWROLL],
  8: ['飞刀', 2, 'arrow', 'w', ONE],
  9: ['伏火雷', 2, 'fire', 'i', ALL, { bt: [6], bw: [2] }],
  10: ['惊雷', 2, 'thunder', 'i', ALL, THUNDER],
  11: ['火蛟', 3, 'fire', 'i', WIDE, FIRE],
  12: ['抄后', 2, 'troops', 'b', '伏兵自敌后杀出', {}, 0],
  13: ['望月射', 3, 'arrow', 's', ONE, { gtm: [3], btm: [1] }],
  14: ['连床弩', 2, 'engine', 's', LANE],
  15: ['撒豆成兵', 3, 'art', 'i', '召唤神兵助战', {}, 4],
  16: ['火矢', 3, 'fire', 's', ALL, FIRE],
  17: ['拒马横扫', 3, 'engine', 's', LANE, { bt: [6] }],
  18: ['怒涛', 3, 'water', 'i', ALL, WATER],
  19: ['烈焰', 3, 'fire', 'i', ALL, FIRE],
  20: ['连环轮', 3, 'engine', 's', LANE, ROLL],
  21: ['雪涛滚', 3, 'ice', 'b', LANE, SNOWROLL],
  22: ['连珠雷', 4, 'fire', 'i', ALL, { bt: [6], bw: [2] }],
  23: ['雷霆', 4, 'thunder', 'i', ALL, THUNDER],
  24: ['双蛟焚野', 5, 'fire', 'i', WIDE, FIRE],
  25: ['奇兵袭后', 4, 'troops', 'b', '大批伏兵自敌后杀出', {}, 0],
  26: ['万钧弩', 4, 'engine', 's', LANE],
  27: ['金甲力士', 5, 'art', 'i', '召唤金甲力士助战', {}, 6],
  28: ['藏兵车', 4, 'troops', 'b', '战车冲入敌阵，伏兵涌出', SIEGE],
  29: ['焚天火雨', 5, 'fire', 's', ALL, FIRE],
  30: ['铁壁拒马', 5, 'engine', 's', LANE, { bt: [6] }],
  31: ['翻江倒海', 5, 'water', 'i', ALL, WATER],
  32: ['燎原', 5, 'fire', 'i', ALL, FIRE],
  33: ['千轮碾', 5, 'engine', 's', LANE, ROLL],
  34: ['雪岭崩', 5, 'ice', 'b', LANE, SNOWROLL],
  35: ['火墙', 4, 'fire', 'i', LANE, FIRE],
  36: ['天雷地火', 6, 'fire', 'i', ALL, { bt: [6], bw: [2] }],
  37: ['九天雷', 6, 'thunder', 'i', ALL, THUNDER],
  38: ['三蛟焚城', 6, 'fire', 'i', WIDE, FIRE],
  39: ['暗度陈仓', 6, 'troops', 'b', '大军自敌后杀出', {}, 0],
  40: ['神臂连弩', 6, 'engine', 's', LANE],
  41: ['天兵降临', 7, 'art', 'i', '召唤天兵助战', {}, 8],
  42: ['藏兵车阵', 6, 'troops', 'b', '战车阵冲入敌阵，伏兵涌出', SIEGE],
  43: ['四蛟焚原', 7, 'fire', 'i', WIDE, FIRE],
  44: ['长枪突阵', 5, 'troops', 's', LANE, HORSE],
  45: ['火海', 6, 'fire', 'i', LANE, FIRE],
  46: ['金龙降世', 9, 'art', 'i', WIDE, SKY],
  47: ['五雷诀', 6, 'thunder', 'i', ONE, THUNDER],
  48: ['五蛟烈焰', 8, 'fire', 'i', WIDE, FIRE],
  49: ['地裂', 6, 'earth', 'i', ALL, { bt: [6] }],
  50: ['掌心雷', 4, 'thunder', 'i', ONE, THUNDER],
  51: ['山崩地陷', 9, 'earth', 'i', ALL, { gt: [4], bt: [6] }],
  52: ['裂地崩山', 8, 'earth', 'i', ALL, { gt: [4], bt: [6] }],
  53: ['坠石', 2, 'earth', 'w', ONE, { gt: [4] }],
  54: ['冰锥', 2, 'ice', 'i', ALL, ICE],
  55: ['狂飙', 3, 'wind', 'i', WIDE, { gt: [5] }],
  56: ['火轮护体', 3, 'fire', 'b', NEAR, FIRE],
  57: ['飞戟', 3, 'arrow', 'w', ONE],
  58: ['滚木', 2, 'earth', 's', LANE, ROLL],
  59: ['阴阳印', 4, 'art', 'i', ALL, { gtm: [2] }],
  60: ['投石', 2, 'engine', 's', ALL, SIEGE],
  61: ['飞剑', 3, 'art', 'b', ALL],
  62: ['地刺', 3, 'earth', 'b', ALL, { bt: [6] }],
  63: ['一字长射', 1, 'arrow', 's', LANE],
  64: ['两翼伏兵', 3, 'troops', 'b', '伏兵自两翼杀出', { gt: [3, 4] }, 0],
  65: ['纵豹', 3, 'beast', 'w', LANE, BEAST],
  66: ['霹雳车', 4, 'engine', 's', ALL, SIEGE],
  67: ['火牛冲', 4, 'beast', 's', LANE, { gt: [1, 2], bt: [6], bw: [2] }],
  68: ['木鸢', 4, 'engine', 'i', ALL, SKY],
  69: ['天灯', 4, 'fire', 'i', NEAR, { gtm: [3], bw: [2] }],
  70: ['射日', 7, 'arrow', 's', ONE, { gtm: [1], btm: [3] }],
  71: ['偃刀斩', 3, 'art', 'w', LANE],
  72: ['石笋', 4, 'earth', 'b', '攻击敌将周围', { gt: [4] }],
  73: ['寒冰', 5, 'ice', 'i', ALL, ICE],
  74: ['双龙卷', 5, 'wind', 'i', WIDE, { gt: [5] }],
  75: ['火焰环', 6, 'fire', 'b', NEAR, FIRE],
  76: ['伏兵四起', 5, 'troops', 'b', '大批伏兵自两翼杀出', { gt: [3, 4] }, 0],
  77: ['撞车', 4, 'engine', 's', LANE, SIEGE],
  78: ['画地为牢', 6, 'art', 'i', '困住敌军，使其无法行动', {}, 0],
  79: ['百兽奔', 4, 'beast', 'w', LANE, BEAST],
  80: ['太极', 6, 'art', 'i', ALL, { gtm: [2] }],
  81: ['幽冥门', 6, 'art', 'i', '黑渊吞噬两军士兵', NIGHT],
  82: ['万刃地', 6, 'earth', 'b', ALL, { bt: [6] }],
  83: ['连环霹雳', 6, 'engine', 's', ALL, SIEGE],
  84: ['滚石阵', 4, 'earth', 's', LANE, ROLL],
  85: ['大还丹', 6, 'art', 'i', '大幅恢复主将体力', {}, -38],
  86: ['井阑', 5, 'engine', 's', LANE, SIEGE],
  87: ['万家灯火', 6, 'fire', 'i', NEAR, { gtm: [3], bw: [2] }],
  88: ['剑雨', 6, 'art', 'b', ALL],
  89: ['群鸢', 6, 'engine', 'i', ALL, SKY],
  90: ['千牛奔', 6, 'beast', 's', LANE, { gt: [1, 2], bt: [6], bw: [2] }],
  91: ['猛虎下山', 6, 'beast', 'w', LANE, { gt: [3, 4], bt: [6] }],
  92: ['火石', 6, 'fire', 's', ALL, { gt: [8, 9], bw: [2] }],
  93: ['琴心', 5, 'art', 'i', NEAR, NIGHT],
  94: ['三月斩', 6, 'art', 'w', LANE],
  95: ['石林', 7, 'earth', 'b', '攻击敌将周围', { gt: [4] }],
  96: ['冰封千里', 8, 'ice', 'i', ALL, ICE],
  97: ['万石崩', 7, 'earth', 's', LANE, ROLL],
  98: ['刀山', 8, 'earth', 'b', ALL, { bt: [6] }],
  99: ['冲城车阵', 7, 'engine', 's', LANE, SIEGE],
  100: ['万兽奔腾', 7, 'beast', 'w', LANE, BEAST],
  101: ['分身', 7, 'art', 'b', LANE],
  102: ['八卦', 8, 'art', 'i', ALL, { gtm: [3] }],
  103: ['万剑归宗', 9, 'art', 'b', ALL],
  104: ['井阑阵', 8, 'engine', 's', LANE, SIEGE],
  105: ['天崩霹雳', 9, 'engine', 's', ALL, SIEGE],
  106: ['圣光斩', 7, 'art', 'b', LANE, { gtm: [1] }],
  107: ['风卷残云', 8, 'wind', 'i', WIDE, { gt: [5] }],
  108: ['万牛焚阵', 9, 'beast', 's', LANE, { gt: [1, 2], bt: [6], bw: [2] }],
  109: ['剑舞', 7, 'art', 'b', NEAR],
  110: ['两仪冥门', 9, 'art', 'i', '黑渊吞噬两军士兵', NIGHT],
  111: ['象阵', 8, 'beast', 'w', LANE, { gt: [1, 2, 3], bt: [6, 7, 9] }],
  112: ['擎天柱', 8, 'earth', 'i', ALL],
  113: ['四面楚歌', 8, 'troops', 'b', '大军自四方杀出', { gt: [3, 4] }, 0],
  114: ['星火燎天', 8, 'fire', 'i', NEAR, { gtm: [3], bw: [2] }],
  115: ['鸢火焚营', 8, 'engine', 'i', ALL, { ...SKY, gt: [12, 8] }],
  116: ['陨火', 9, 'fire', 's', ALL, { gt: [8, 9], bw: [2] }],
  117: ['月华连斩', 9, 'art', 'w', LANE, NIGHT],
  118: ['天籁', 8, 'art', 'i', NEAR, NIGHT],
  119: ['铁骑踏阵', 8, 'troops', 's', LANE, HORSE],
  120: ['百鬼夜行', 9, 'art', 'i', ALL, { gtm: [3], btm: [1] }],
  121: ['剑轮', 9, 'art', 'b', NEAR],
  122: ['天光破', 10, 'art', 'b', LANE, { gtm: [1] }],
  123: ['苍龙出海', 10, 'thunder', 'i', WIDE, THUNDER],
  124: ['天火焚城', 10, 'fire', 'i', ALL, { gt: [8, 9, 11] }],
  125: ['冥府', 10, 'art', 'i', ALL, { gtm: [3], btm: [1] }],
};

// kinds of SPECS that hit only the general, or a few broad hits (stronger per hit)
const SINGLE = new Set([8, 13, 47, 50, 53, 57, 70]);
// archetypes with many hits per cast (weaker per hit)
const SWARM = new Set([1, 16, 29, 63, 14, 26, 40]);

const LEVEL = [0, 1, 4, 8, 12, 16, 21, 26, 32, 38, 45];
const MERIT = [0, 100, 180, 280, 400, 560, 760, 1000, 1300, 1700, 2200];

function reqOf(req: Req, tier: number) {
  const d = Math.min(92, 20 + tier * 7);
  switch (req) {
    case 'i': return { IntUp: '200', IntDown: String(d), StrUp: '200', StrDown: '0' };
    case 's': return { IntUp: '200', IntDown: '0', StrUp: '200', StrDown: String(d) };
    case 'b': return { IntUp: '200', IntDown: String(Math.round(d * 0.75)), StrUp: '200', StrDown: String(Math.round(d * 0.75)) };
    case 'w': return { IntUp: String(Math.min(99, 55 + tier * 3)), IntDown: '0', StrUp: '200', StrDown: String(Math.min(95, d + 5)) };
  }
}

export function bfSections(): IniSection[] {
  const out: IniSection[] = [];
  for (let id = 1; id <= 125; id++) {
    const [name, tier, attr, req, spec, c = {}, pw] = BF[id];
    let power = pw ?? Math.round(4 + tier * 2.3);
    if (pw === undefined && SINGLE.has(id)) power = Math.round(power * 1.8);
    if (pw === undefined && SWARM.has(id)) power = Math.round(power * 0.8);
    const mp = Math.round(8 + tier * 5 + (SINGLE.has(id) ? 4 : 0) + (pw !== undefined && pw <= 0 ? 4 : 0));
    const l = (a?: number[]) => (a?.length ? a.join(',') + ',' : '');
    out.push({
      _: 'BF_MAGIC', No: String(id), Name: name, MP: String(mp), Power: String(power), Level: String(LEVEL[tier]),
      Contribution: String(MERIT[tier]), ...reqOf(req, tier),
      NoArena: attr === 'troops' || id === 15 || id === 27 || id === 41 || id === 78 ? '1' : '0',
      Attribute: String(BF_ATTR[attr]), Spec: spec,
      GoodTerrain: l(c.gt), BadTerrain: l(c.bt), GoodTimeZone: l(c.gtm), BadTimeZone: l(c.btm), GoodWeather: l(c.gw), BadWeather: l(c.bw),
    });
  }
  return out;
}

// ------------------------------------------------------------------ 军师技
// id → [name, mp, level, merit, int≥, range, enemyType (0 天候 1 我方 2 敌方)]
type F = [string, number, number, number, number, number, number];
// prettier-ignore
const SF: Record<number, F> = {
  1: ['驱云见日', 12, 1, 80, 55, 0, 0], // clear weather
  2: ['呼风唤雨', 16, 3, 120, 65, 0, 0], // rain / snow
  3: ['乱心', 10, 1, 80, 50, 4, 2], // morale -20
  4: ['激励', 10, 1, 80, 45, 4, 1], // morale +20
  5: ['疾行', 8, 2, 90, 45, 3, 1], // +30 move for a turn
  6: ['扰阵', 12, 5, 150, 60, 4, 2], // halves movement
  7: ['全身而退', 14, 8, 220, 65, 5, 1], // back to own camp
  8: ['疲兵', 10, 4, 130, 55, 4, 2], // slow charge
  9: ['挫锐', 14, 10, 260, 65, 4, 2], // attack down
  10: ['擂鼓', 10, 4, 130, 50, 4, 1], // fast charge
  11: ['疗伤', 14, 6, 180, 60, 3, 1], // heal 40%
  12: ['凝神', 18, 12, 300, 70, 3, 1], // MP 40%
  13: ['砺兵', 14, 10, 260, 60, 4, 1], // attack up
  14: ['神速', 22, 18, 500, 80, 3, 1], // act again
  15: ['离间', 20, 15, 420, 78, 6, 2], // target leaves the field
  16: ['合围', 18, 14, 380, 70, 4, 2], // cannot retreat, capture likely
  17: ['劝降', 24, 20, 600, 82, 3, 2], // target surrenders
  18: ['妖雾', 20, 16, 450, 75, 5, 2], // stunned 2 turns
  19: ['激将', 12, 6, 160, 50, 3, 2], // forced duel
  20: ['授业', 16, 12, 320, 72, 4, 1], // grant exp
  21: ['运粮', 18, 10, 280, 65, 4, 1], // +30% soldiers
  22: ['收编', 22, 22, 650, 80, 3, 2], // steal 20% soldiers
  23: ['封阵', 16, 12, 320, 70, 5, 2], // seal
};

export function sfSections(): IniSection[] {
  return Object.entries(SF).map(([id, [name, mp, level, merit, int, range, et]]) => ({
    _: 'SF_MAGIC', No: id, Name: name, MP: String(mp), Level: String(level), Contribution: String(merit),
    IntUp: '999', IntDown: String(int), StrUp: '999', StrDown: '0', Range: String(range), EnemyType: String(et),
  }));
}
