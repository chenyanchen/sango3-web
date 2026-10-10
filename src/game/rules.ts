// Strategy-layer (内政) rules: every monthly command as a pure-ish function
// over the game state G. Used by both the player UI and the AI.
//
// Conventions: `doX()` functions validate, mutate G and return an Outcome
// with a Chinese message for the UI / turn report. They never spend AP —
// callers do that via spendAP() so a command can be checked before running.
import { db, type BFMagicDef, type ItemDef, type SFMagicDef } from '../data/db';
import { rng } from '../engine/rng';
import type { WarResult, WarSetup } from './contracts';
import {
  G, addLog, assignOfficials, city, citiesOf, gen, generalsIn, generalsOf, maxSoldiers, monthIndex, nation,
  prisonersIn, recalcVitals, gainExp,
  type CityState, type GeneralState, type NationState,
} from './state';

export interface Outcome {
  ok: boolean;
  msg: string;
  /** general who "speaks" the message (portrait) */
  speaker?: number;
}
const ok = (msg: string, speaker?: number): Outcome => ({ ok: true, msg, speaker });
/** Grants experience; returns a level-up note ('' if none) to append to a message. */
function expNote(g: GeneralState, amount: number): string {
  const ups = gainExp(g, amount);
  if (!ups) return '';
  const better = g.status === 'serving' && availableTitles(g).some((t) => t.soldiers > (db.titles[g.title]?.soldiers ?? 0));
  return `\n\n${gname(g.id)}升级了！（等级 ${g.level}）` + (better ? '\n可在「任免 → 将军」晋升官职，提高带兵数。' : '');
}
const fail = (msg: string, speaker?: number): Outcome => ({ ok: false, msg, speaker });

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const now = () => monthIndex(G.year, G.month);
export const gname = (id: number) => db.generals[id - 1]?.name ?? '?';
export const cname = (id: number) => db.cities[id - 1]?.name ?? '?';
export const nname = (id: number) => nation(id)?.name ?? '无';

// ------------------------------------------------------------------ constants
export const DEV_MAX = 999;
export const MONEY_MAX = 99999;
/** gold per conscripted soldier */
export const SOLDIER_COST = 1;
/** months an investigation (调查) stays valid */
export const INTEL_MONTHS = 6;

export const ITEM_TYPE = { token: 1, weapon: 2, book: 3, horse: 4, formationBook: 5, treasure: 6, ginseng: 7, lingzhi: 8 } as const;
export const ITEM_TYPE_NAME = ['', '兵符', '武器', '书籍', '马匹', '阵法书', '宝物', '人参', '灵芝'];
export const FORMATION_NAMES = ['方形之阵', '圆形之阵', '锥形之阵', '雁形之阵', '鱼丽之阵', '玄襄之阵', '钩形之阵', '箭矢之阵'];
export const SOLDIER_NAMES = ['朴刀兵', '弓箭兵', '短枪兵', '轻骑兵', '武斗兵', '蛮族兵', '藤甲兵', '女兵', '弩兵'];
export const SIZE_NAMES = ['', '大城', '中城', '小城', '关卡'];

export function soldierName(t: number) {
  return db.soldiers[t]?.name || SOLDIER_NAMES[t] || '—';
}
export function formationName(f: number) {
  return db.formations.find((x) => x.id === f)?.name || FORMATION_NAMES[f] || '—';
}
export function titleName(g: GeneralState) {
  return db.titles[g.title]?.name ?? '无';
}
export function isLord(g: GeneralState) {
  return g.status === 'serving' && nation(g.nation)?.lord === g.id;
}

// ------------------------------------------------------------------ stats
/** 武力 including weapon bonus */
export function strOf(g: GeneralState) {
  const w = g.weapon >= 0 ? db.items[g.weapon] : undefined;
  return g.str + (w?.inc ?? 0);
}
/** 智力 including book bonus */
export function intOf(g: GeneralState) {
  const b = g.book >= 0 ? db.items[g.book] : undefined;
  return g.int + (b && b.attribute === 2 ? b.inc : 0);
}
/** Rough military strength of a general (for AI and odds display). */
export function powerOf(g: GeneralState) {
  return g.soldiers * (1 + g.level / 25) + strOf(g) * 2 + g.level * 12 + (g.hp / Math.max(1, g.maxHp)) * 40;
}
export function cityPower(cityId: number, nationId?: number) {
  const c = city(cityId);
  return generalsIn(cityId, nationId ?? c.owner).reduce((s, g) => s + powerOf(g), 0) + c.reserve * 0.3;
}
export function totalMoney(nationId: number) {
  return citiesOf(nationId).reduce((s, c) => s + c.money, 0);
}
export function totalSoldiers(nationId: number) {
  return generalsOf(nationId).reduce((s, g) => s + g.soldiers, 0) + citiesOf(nationId).reduce((s, c) => s + c.reserve, 0);
}
export function reserveCap(c: CityState) {
  return Math.max(200, Math.floor(c.people / 100));
}
/** Monthly gold income of a city. */
export function incomeOf(c: CityState) {
  return Math.round((c.people / 1000) * (0.4 + c.dev / 333));
}

// ------------------------------------------------------------------ geography
export function neighbors(cityId: number): number[] {
  return db.cities[cityId - 1]?.neighbors ?? [];
}
export function isAllied(a: number, b: number) {
  return !!nation(a)?.allies.includes(b);
}
export function isEnemyCity(nationId: number, cityId: number) {
  const o = city(cityId).owner;
  return o !== 0 && o !== nationId && !isAllied(nationId, o);
}
/** Cities a general group can move to from `from` (adjacent, own or empty). */
export function moveTargets(nationId: number, from: number): number[] {
  return neighbors(from).filter((n) => {
    const o = city(n).owner;
    return o === nationId || o === 0;
  });
}
export function attackTargets(nationId: number, from: number): number[] {
  return neighbors(from).filter((n) => isEnemyCity(nationId, n));
}
/** City borders an enemy (non-allied) nation. */
export function isFront(nationId: number, cityId: number) {
  return neighbors(cityId).some((n) => isEnemyCity(nationId, n));
}
/** BFS distance (through own cities) from cityId to the nearest front city. */
export function distToFront(nationId: number, cityId: number): number {
  const seen = new Set([cityId]);
  let q = [cityId];
  for (let d = 0; d < 30 && q.length; d++) {
    const nq: number[] = [];
    for (const c of q) {
      if (isFront(nationId, c)) return d;
      for (const n of neighbors(c)) if (!seen.has(n) && city(n).owner === nationId) {
        seen.add(n);
        nq.push(n);
      }
    }
    q = nq;
  }
  return 99;
}

// ------------------------------------------------------------------ AP / acting
export function apOf(nationId: number) {
  return nation(nationId)?.ap ?? 0;
}
export function spendAP(nationId: number, n = 1): boolean {
  const na = nation(nationId);
  if (!na || na.ap < n) return false;
  na.ap -= n;
  return true;
}
export function idle(gs: GeneralState[]) {
  return gs.filter((g) => !g.acted);
}

// ------------------------------------------------------------------ intel
export function hasIntel(nationId: number, cityId: number) {
  if (city(cityId).owner === nationId) return true;
  const t = G.intel?.[`${nationId}:${cityId}`];
  return t !== undefined && now() - t < INTEL_MONTHS;
}

// ================================================================== 内政
export function doMove(nationId: number, from: number, to: number, ids: number[], money = 0): Outcome {
  if (!ids.length) return fail('未选择武将。');
  if (!moveTargets(nationId, from).includes(to)) return fail(`${cname(to)}无法前往。`);
  const src = city(from);
  const dst = city(to);
  const took = dst.owner === 0;
  for (const id of ids) {
    const g = gen(id);
    g.city = to;
    g.acted = true;
  }
  money = clamp(Math.floor(money), 0, src.money);
  src.money -= money;
  dst.money = Math.min(MONEY_MAX, dst.money + money);
  if (took) {
    dst.owner = nationId;
    dst.governor = 0;
    dst.advisor = 0;
  }
  assignOfficials(src);
  assignOfficials(dst);
  const names = ids.map(gname).join('、');
  return ok(took ? `${names}部队移动至${cname(to)}。\n我军占领${cname(to)}。` : `部队已顺利从${cname(from)}城移动至${cname(to)}城。`, ids[0]);
}

export interface SearchResult extends Outcome {
  /** free general met (caller asks whether to recruit) */
  found?: number;
  item?: number;
  money?: number;
}

export function doSearch(nationId: number, g: GeneralState): SearchResult {
  const up = expNote(g, 12);
  const c = city(g.city);
  const int = intOf(g);
  const luck = rng.next();
  // free generals in the city
  const free = G.generals.filter((x) => x.city === c.id && x.status === 'free');
  for (const f of rng.shuffle([...free])) {
    if (rng.chance(0.4 + int / 250 + luck * 0.15)) return { ok: true, msg: `我找到了自称${gname(f.id)}的人‧‧‧`, speaker: g.id, found: f.id };
  }
  // items
  if (c.items.length && rng.chance(0.3 + int / 300)) {
    const iid = rng.pickWeighted(c.items, (i) => db.items[i].findRate + 10)!;
    c.items.splice(c.items.indexOf(iid), 1);
    const na = nation(nationId)!;
    (na.items ??= []).push(iid);
    return { ok: true, msg: `我找到了${db.items[iid].name}。` + up, speaker: g.id, item: iid };
  }
  // gold
  if (rng.chance(0.3 + int / 400)) {
    const m = Math.round((40 + int * 1.5 + g.level * 3) * rng.range(0.6, 1.4));
    c.money = Math.min(MONEY_MAX, c.money + m);
    return { ok: true, msg: `我找到了金钱${m}。` + up, speaker: g.id, money: m };
  }
  return { ok: false, msg: `我在${cname(c.id)}城没有任何发现‧‧‧` + up, speaker: g.id };
}

/** Free general found by 搜索 decides whether to join. */
export function recruitFree(nationId: number, finder: GeneralState, fid: number): Outcome {
  const f = gen(fid);
  const d = db.generals[fid - 1];
  const lord = gen(nation(nationId)!.lord);
  // historical loyalty (RLord) matters a bit
  const affinity = d.lord && d.lord === gname(lord.id) ? 0.25 : 0;
  const p = clamp(0.72 + affinity + (intOf(finder) - 50) / 400 + (lord.level - f.level) / 200, 0.25, 0.97);
  if (rng.chance(p)) {
    joinNation(f, nationId, finder.city, 55 + Math.round(d.justice / 4) + rng.int(0, 10));
    return ok('荣幸之至，我愿效犬马之劳。', fid);
  }
  return fail('人各有志，您请回吧。', fid);
}

export function joinNation(g: GeneralState, nationId: number, cityId: number, loyalty: number) {
  g.status = 'serving';
  g.nation = nationId;
  g.city = cityId;
  g.loyalty = clamp(loyalty, 1, 100);
  g.acted = false;
  g.origNation = undefined;
  g.title = -1;
  g.soldiers = 0;
  autoTitle(g);
  assignOfficials(city(cityId));
}

export function doDevelop(g: GeneralState): Outcome {
  const c = city(g.city);
  if (c.dev >= DEV_MAX) return fail(`${cname(c.id)}城开发度已达上限。`, g.id);
  const up = Math.max(2, Math.round((intOf(g) / 4) * rng.range(0.8, 1.25)) + 2);
  const before = c.dev;
  c.dev = Math.min(DEV_MAX, c.dev + up);
  const upn = expNote(g, 10 + Math.round(intOf(g) / 10));
  return ok(`${cname(c.id)}城开发度上升 ${c.dev - before} 点，目前开发度为 ${c.dev} 点。` + upn, g.id);
}

// ---------------------------------------------------------------- 人才
/** 招降 a prisoner held by `nationId`. */
export function doPersuadePrisoner(nationId: number, agent: GeneralState | null, pid: number): Outcome {
  const p = gen(pid);
  if (p.status !== 'prisoner' || p.nation !== nationId) return fail('该武将不是我军俘虏。');
  const d = db.generals[pid - 1];
  const origAlive = p.origNation ? nation(p.origNation)?.alive : false;
  let chance = (100 - p.loyalty) / 100 - d.justice / 400 + (agent ? intOf(agent) / 500 : 0.1);
  if (!origAlive) chance += 0.35;
  chance = clamp(chance, 0.03, 0.95);
  if (rng.chance(chance)) {
    joinNation(p, nationId, p.city, 45 + rng.int(0, 20));
    return ok('荣幸之至，我愿效犬马之劳！', pid);
  }
  p.loyalty = Math.max(0, p.loyalty - rng.int(2, 6));
  return fail(rng.pick(['我绝不可能投降！还是一刀杀了我干脆一点！', '要杀要剐，任凭处置，我绝不会投降的。', '真的如此看重我吗？也许我该考虑看看‧‧‧'])!, pid);
}

export type LureMethod = 'treasure' | 'money' | 'talk';

/** 招揽: lure an enemy general (needs intel on his city). */
export function lureChance(agent: GeneralState, target: GeneralState, method: LureMethod, value = 0): number {
  const d = db.generals[target.id - 1];
  let p = (100 - target.loyalty) / 120 - d.justice / 500 - 0.05;
  if (method === 'talk') p += (intOf(agent) - intOf(target)) / 500;
  else if (method === 'money') p += Math.min(0.35, value / 4000);
  else p += Math.min(0.4, value / 220);
  return clamp(p, 0.01, 0.9);
}

export function doLure(nationId: number, agent: GeneralState, tid: number, method: LureMethod, item = -1, money = 0): Outcome {
  const t = gen(tid);
  if (t.status !== 'serving' || t.nation === nationId) return fail('目标已不在敌营。');
  if (isLord(t)) return fail('无法招揽敌国君主。');
  if (!hasIntel(nationId, t.city)) return fail(`必须先调查${cname(t.city)}。`);
  let value = 0;
  if (method === 'treasure') {
    const na = nation(nationId)!;
    const i = na.items?.indexOf(item) ?? -1;
    if (i < 0) return fail('没有这件宝物。');
    na.items!.splice(i, 1);
    value = db.items[item].attraction + (db.items[item].type === ITEM_TYPE.treasure ? db.items[item].inc * 3 : 0);
  } else if (method === 'money') {
    const c = city(agent.city);
    money = clamp(Math.floor(money), 0, c.money);
    c.money -= money;
    value = money;
  }
  gainExp(agent, 10);
  const p = lureChance(agent, t, method, value);
  if (rng.chance(p)) {
    const old = t.nation;
    const oldCity = city(t.city);
    // soldiers stay behind in the old city's reserve
    oldCity.reserve += t.soldiers;
    joinNation(t, nationId, agent.city, 50 + rng.int(0, 20));
    assignOfficials(oldCity);
    addLog(`${nname(old)}部下${gname(tid)}接受招揽，投靠${nname(nationId)}了。`);
    return ok(`承蒙${nname(nationId)}如此礼遇，我愿效犬马之劳。`, tid);
  }
  t.loyalty = clamp(t.loyalty - rng.int(0, 3), 0, 100);
  return fail(
    rng.pick(['我岂是那背信忘义、弃主求荣之辈，你赶快离开吧！', '嗯‧‧‧这样子吗？我还是无法答应，也许以后再说吧！', '我已经了解你们的意思，不过你还是先请回吧，我会认真考虑你们的建议。'])!,
    tid,
  );
}

// ---------------------------------------------------------------- 物品
export function canEquip(g: GeneralState, it: ItemDef): string | null {
  if ((it.type === ITEM_TYPE.weapon || it.type === ITEM_TYPE.book || it.type === ITEM_TYPE.horse) && g.level < it.level)
    return `需要等级${it.level}`;
  if (it.type === ITEM_TYPE.token && g.soldierTypes.includes(it.attribute)) return '已会率领';
  if (it.type === ITEM_TYPE.formationBook && g.formations.includes(it.attribute)) return '已学会';
  if (it.type === ITEM_TYPE.treasure && g.loyalty >= 100) return '忠诚已满';
  return null;
}

/** Gives an item from the nation inventory to a general (物品). */
export function doGiveItem(nationId: number, g: GeneralState, itemId: number): Outcome {
  const na = nation(nationId)!;
  const inv = (na.items ??= []);
  const idx = inv.indexOf(itemId);
  if (idx < 0) return fail('库存中没有这件物品。');
  const it = db.items[itemId];
  const why = canEquip(g, it);
  if (why) return fail(`${gname(g.id)}无法使用${it.name}（${why}）。`);
  inv.splice(idx, 1);
  const n = gname(g.id);
  switch (it.type) {
    case ITEM_TYPE.weapon: {
      if (g.weapon >= 0) inv.push(g.weapon);
      const before = strOf(g);
      g.weapon = itemId;
      g.loyalty = clamp(g.loyalty + 2, 0, 100);
      return ok(`${n}装备了${it.name}，武力${before}→${strOf(g)}。`, g.id);
    }
    case ITEM_TYPE.book: {
      if (g.book >= 0) inv.push(g.book);
      const bi = intOf(g);
      g.book = itemId;
      recalcVitals(g);
      g.loyalty = clamp(g.loyalty + 2, 0, 100);
      const eff = it.attribute === 2 ? `智力${bi}→${intOf(g)}` : it.attribute === 3 ? `体力上限+${it.inc}` : `技力上限+${it.inc}`;
      return ok(`${n}获得${it.name}，${eff}。`, g.id);
    }
    case ITEM_TYPE.horse:
      if (g.horse >= 0) inv.push(g.horse);
      g.horse = itemId;
      g.loyalty = clamp(g.loyalty + 2, 0, 100);
      return ok(`${n}骑上了${it.name}，速度上升${it.inc}点。`, g.id);
    case ITEM_TYPE.token:
      g.soldierTypes.push(it.attribute);
      return ok(`${n}学会率领${soldierName(it.attribute)}。`, g.id);
    case ITEM_TYPE.formationBook:
      g.formations.push(it.attribute);
      g.formations.sort((a, b) => a - b);
      return ok(`${n}学会了${formationName(it.attribute)}。`, g.id);
    case ITEM_TYPE.treasure: {
      const b = g.loyalty;
      g.loyalty = clamp(g.loyalty + it.inc, 0, 100);
      return ok(`${n}获赏${it.name}，忠诚度由${b}上升至${g.loyalty}。`, g.id);
    }
    case ITEM_TYPE.ginseng:
      g.hpBonus = (g.hpBonus ?? 0) + it.inc;
      recalcVitals(g);
      g.hp = g.maxHp;
      return ok(`${n}服用${it.name}，体力完全恢复，体力上限+${it.inc}。`, g.id);
    case ITEM_TYPE.lingzhi:
      g.mpBonus = (g.mpBonus ?? 0) + it.inc;
      recalcVitals(g);
      g.mp = g.maxMp;
      return ok(`${n}服用${it.name}，技力完全恢复，技力上限+${it.inc}。`, g.id);
  }
  inv.push(itemId);
  return fail('这件物品无法使用。');
}

/** Removes an equipped item back into the inventory. */
export function doUnequip(nationId: number, g: GeneralState, slot: 'weapon' | 'horse' | 'book'): Outcome {
  const id = g[slot];
  if (id < 0) return fail('没有装备。');
  (nation(nationId)!.items ??= []).push(id);
  g[slot] = -1;
  if (slot === 'book') recalcVitals(g);
  return ok(`卸下${db.items[id].name}。`, g.id);
}

// ================================================================== 军政
export function conscriptAmount(g: GeneralState) {
  return Math.round(40 + intOf(g) * 0.6 + g.level * 4 + strOf(g) * 0.3);
}

export function doConscript(g: GeneralState): Outcome {
  const c = city(g.city);
  const cap = reserveCap(c);
  if (c.reserve >= cap) return fail(`${cname(c.id)}预备兵已达上限。`, g.id);
  if (c.money < SOLDIER_COST * 10) return fail(`${cname(c.id)}金钱不足，未征得任何士兵。`, g.id);
  if (c.people < 1000) return fail(`${cname(c.id)}人口稀少，无法征兵。`, g.id);
  let n = Math.round(conscriptAmount(g) * rng.range(0.85, 1.15));
  n = Math.min(n, cap - c.reserve, Math.floor(c.money / SOLDIER_COST), Math.floor(c.people / 20));
  c.reserve += n;
  c.money -= n * SOLDIER_COST;
  c.people -= n;
  c.training = Math.max(0, Math.round((c.training * (c.reserve - n) + 30 * n) / Math.max(1, c.reserve)));
  const upn = expNote(g, 10);
  return ok(`我在${cname(c.id)}征得士兵${n}名。（花费金钱${n * SOLDIER_COST}）` + upn, g.id);
}

export function doTrain(g: GeneralState): Outcome {
  const c = city(g.city);
  if (c.training >= 100) return fail(`${cname(c.id)}城部队士气已达上限。`, g.id);
  const up = Math.max(2, Math.round((4 + (strOf(g) + intOf(g)) / 18) * rng.range(0.8, 1.2)));
  const b = c.training;
  c.training = Math.min(100, c.training + up);
  const upn = expNote(g, 10);
  return ok(`${cname(c.id)}城部队士气上升${c.training - b}点。` + upn, g.id);
}

/** 调兵: set a general's soldier count, drawing from / returning to the city reserve. */
export function setSoldiers(g: GeneralState, n: number): number {
  const c = city(g.city);
  n = clamp(Math.floor(n), 0, maxSoldiers(g));
  const delta = n - g.soldiers;
  if (delta > c.reserve) n = g.soldiers + c.reserve;
  c.reserve -= n - g.soldiers;
  g.soldiers = n;
  return n;
}
/** Fills generals (strongest first) from the reserve. */
export function autoAssignSoldiers(cityId: number) {
  const c = city(cityId);
  const gs = generalsIn(cityId, c.owner).sort((a, b) => b.level + strOf(b) / 5 - (a.level + strOf(a) / 5));
  for (const g of gs) {
    if (c.reserve <= 0) break;
    setSoldiers(g, maxSoldiers(g));
  }
}

// ---------------------------------------------------------------- 整备
export function bfMagicReq(g: GeneralState, m: BFMagicDef | SFMagicDef): string | null {
  if (g.level < m.level) return `等级${m.level}`;
  const i = intOf(g);
  const s = strOf(g);
  if (i < m.intDown || i > m.intUp) return m.intUp < 200 && i > m.intUp ? `智力≤${m.intUp}` : `智力≥${m.intDown}`;
  if (s < m.strDown || s > m.strUp) return m.strUp < 200 && s > m.strUp ? `武力≤${m.strUp}` : `武力≥${m.strDown}`;
  return null;
}
export function learnableBF(g: GeneralState) {
  return db.bfMagic.filter((m) => m.name && !g.bfMagic.includes(m.id) && !bfMagicReq(g, m));
}
export function learnableSF(g: GeneralState) {
  return db.sfMagic.filter((m) => m.name && !g.sfMagic.includes(m.id) && !bfMagicReq(g, m));
}
export function doLearn(g: GeneralState, kind: 'bf' | 'sf', id: number): Outcome {
  const m = kind === 'bf' ? db.bfMagic[id - 1] : db.sfMagic[id - 1];
  if (!m) return fail('无此技能。');
  const why = bfMagicReq(g, m);
  if (why) return fail('现在不能学习。');
  if (g.merit < m.contribution) return fail('功勋不足');
  g.merit -= m.contribution;
  (kind === 'bf' ? g.bfMagic : g.sfMagic).push(id);
  return ok(`${kind === 'bf' ? '获得武将技' : '获得军师技'} ${m.name}`, g.id);
}

// ================================================================== 任免
export function usedTitles(nationId: number, except?: number) {
  return new Set(generalsOf(nationId).filter((g) => g.id !== except && g.title >= 0).map((g) => g.title));
}
export function availableTitles(g: GeneralState) {
  const used = usedTitles(g.nation, g.id);
  return db.titles.filter((t) => t.level <= g.level && !used.has(t.id));
}
export function doGrantTitle(g: GeneralState, titleId: number): Outcome {
  const t = db.titles[titleId];
  if (!t) return fail('无此官职。');
  if (t.level > g.level) return fail(`${gname(g.id)}等级不足。`);
  if (usedTitles(g.nation, g.id).has(titleId)) return fail('此官职已有人担任。');
  const old = db.titles[g.title];
  g.title = titleId;
  if (!old || t.soldiers > old.soldiers) g.loyalty = clamp(g.loyalty + 4 + Math.round((t.soldiers - (old?.soldiers ?? 30)) / 20), 0, 100);
  if (g.soldiers > maxSoldiers(g)) {
    city(g.city).reserve += g.soldiers - maxSoldiers(g);
    g.soldiers = maxSoldiers(g);
  }
  return ok(`任命${gname(g.id)}为${t.name}，最大带兵数：${t.soldiers}。`, g.id);
}
/** Gives the best free title the general qualifies for if it beats the current one. */
export function autoTitle(g: GeneralState) {
  const cur = db.titles[g.title]?.soldiers ?? 0;
  const best = availableTitles(g).sort((a, b) => b.soldiers - a.soldiers || b.level - a.level)[0];
  if (best && best.soldiers > cur) {
    g.title = best.id;
    return true;
  }
  return false;
}
export function doAppoint(c: CityState, role: 'governor' | 'advisor', gid: number): Outcome {
  const g = gen(gid);
  if (g.city !== c.id || g.nation !== c.owner || g.status !== 'serving') return fail('该武将不在城中。');
  const n = nation(c.owner)!;
  if (role === 'governor') {
    if (generalsIn(c.id, c.owner).some((x) => x.id === n.lord) && gid !== n.lord)
      return fail(`君主${gname(n.lord)}在${cname(c.id)}城，为预设太守。`);
    c.governor = gid;
    return ok(`任命${gname(gid)}为${cname(c.id)}城太守。`, gid);
  }
  c.advisor = gid;
  return ok(`任命${gname(gid)}为${cname(c.id)}城军师。`, gid);
}

// ================================================================== 外交
export function friendship(a: number, b: number) {
  return nation(a)?.friendship[b] ?? 50;
}
export function addFriendship(a: number, b: number, d: number) {
  const na = nation(a);
  const nb = nation(b);
  if (na) na.friendship[b] = clamp((na.friendship[b] ?? 50) + d, 0, 100);
  if (nb) nb.friendship[a] = clamp((nb.friendship[a] ?? 50) + d, 0, 100);
}
export function nationStrength(id: number) {
  return generalsOf(id).reduce((s, g) => s + powerOf(g), 0) + citiesOf(id).length * 150;
}
export function allianceChance(from: number, to: number) {
  const f = friendship(from, to);
  const ratio = nationStrength(from) / Math.max(1, nationStrength(to));
  // shared border with a stronger third party makes alliances attractive
  let p = (f - 30) / 100 + clamp((ratio - 0.6) * 0.25, -0.2, 0.25);
  if (nation(to)!.allies.length >= 2) p -= 0.2;
  return clamp(p, 0.02, 0.92);
}
export function makeAlliance(a: number, b: number) {
  const na = nation(a)!;
  const nb = nation(b)!;
  if (!na.allies.includes(b)) na.allies.push(b);
  if (!nb.allies.includes(a)) nb.allies.push(a);
  addFriendship(a, b, 15);
}
export function breakAlliance(a: number, b: number) {
  const na = nation(a);
  const nb = nation(b);
  if (na) na.allies = na.allies.filter((x) => x !== b);
  if (nb) nb.allies = nb.allies.filter((x) => x !== a);
  addFriendship(a, b, -30);
}
export function doProposeAlliance(from: number, to: number): Outcome {
  const lord = nation(to)?.lord;
  if (isAllied(from, to)) return fail('已是同盟国。');
  if (rng.chance(allianceChance(from, to))) {
    makeAlliance(from, to);
    addLog(`${nname(from)}与${nname(to)}缔结盟约。`);
    return ok(
      rng.pick(['嗯！本人也正有此意，就让我们进行结盟，未来还请多加帮忙。', '合则两利、分则两害，让我们齐心协力，共图大业吧！', '结盟一事，正求之不得，让我们一起为平定天下，匡复汉室而努力吧！'])! +
        `\n\n我国与${nname(to)}缔结盟约。`,
      lord,
    );
  }
  addFriendship(from, to, -rng.int(2, 6));
  return fail(rng.pick(['目前局势混乱，此事还须从长计议才是。', '虽然你们的想法很好，但我觉得时机还未到吧！', '你还是先请回吧，我们目前暂时没有同盟的想法。'])!, lord);
}

// ================================================================== 计略
export function doInvestigate(nationId: number, agent: GeneralState, target: number): Outcome {
  (G.intel ??= {})[`${nationId}:${target}`] = now();
  const upn = expNote(agent, 10);
  return ok(`${cname(target)}城的调查任务顺利完成了。` + upn, agent.id);
}

export function sowChance(agent: GeneralState, t: GeneralState) {
  const d = db.generals[t.id - 1];
  return clamp(0.35 + (intOf(agent) - intOf(t)) / 150 + (60 - t.loyalty) / 150 - d.justice / 400, 0.05, 0.9);
}
export function doSowDiscord(nationId: number, agent: GeneralState, tid: number): Outcome {
  const t = gen(tid);
  if (isLord(t)) return fail('无法离间敌国君主。');
  gainExp(agent, 10);
  if (rng.chance(sowChance(agent, t))) {
    const d = rng.int(5, 8 + Math.round(intOf(agent) / 12));
    t.loyalty = Math.max(0, t.loyalty - d);
    addLog(`${gname(tid)}遭受${nname(nationId)}军${gname(agent.id)}的离间。`);
    return ok(`${rng.pick(['果真是如此吗？真不知道该相信谁了‧‧‧', '原来如此，我会仔细考虑您的话的。', '这‧‧‧这应该不是事实吧！'])}\n\n${gname(tid)}似乎动摇了，忠诚度下降${d}点。`, tid);
  }
  return fail(`${rng.pick(['别白费心机了，再不离开小心我杀了你！', '没这种事吧，我才不会听信这种谣言‧‧‧'])}\n\n离间失败了，${gname(tid)}完全不为所动。`, tid);
}

// ================================================================== war aftermath
export type PrisonerChoice = 'recruit' | 'release' | 'behead' | 'imprison';

export interface WarHooks {
  /** decide what to do with a prisoner (captor = nation that holds him) */
  decide(captor: number, prisoner: number): Promise<PrisonerChoice>;
  /** a nation's lord died / was beheaded: choose successor among candidates (player) */
  chooseLord?(nationId: number, candidates: number[]): Promise<number>;
  /** log line */
  log?(text: string): void;
}

/** AI prisoner policy. */
export function aiPrisonerChoice(_captor: number, pid: number): PrisonerChoice {
  const p = gen(pid);
  const lordOf = p.origNation ? nation(p.origNation) : undefined;
  if (lordOf?.lord === pid) return rng.chance(lordOf.id === G.player ? 0.25 : 0.45) ? 'behead' : 'release';
  if (rng.chance(clamp((100 - p.loyalty) / 100 + 0.1, 0, 0.8))) return 'recruit';
  const d = db.generals[pid - 1];
  if (d.str + d.int < 90 && rng.chance(0.15)) return 'behead';
  return rng.chance(0.75) ? 'imprison' : 'release';
}

/** Moves a general out of a lost city to a neighbouring own city (true) or fails. */
function relocate(g: GeneralState, from: number): boolean {
  const own = neighbors(from).filter((n) => city(n).owner === g.nation);
  const dest = own.length ? own.sort((a, b) => generalsIn(a).length - generalsIn(b).length)[0] : citiesOf(g.nation)[0]?.id;
  if (!dest) return false;
  g.city = dest;
  return true;
}

export function capture(g: GeneralState, captor: number, cityId: number) {
  g.origNation = g.nation;
  g.status = 'prisoner';
  g.nation = captor;
  g.city = cityId;
  city(cityId).reserve += Math.round(g.soldiers * 0.3);
  g.soldiers = 0;
}

/** Applies a prisoner decision. Returns a message. */
export async function handlePrisoner(captor: number, pid: number, choice: PrisonerChoice, hooks: WarHooks): Promise<string> {
  const p = gen(pid);
  const orig = p.origNation ?? 0;
  const wasLord = nation(orig)?.lord === pid;
  const n = gname(pid);
  switch (choice) {
    case 'recruit': {
      const r = doPersuadePrisoner(captor, null, pid);
      return r.ok ? `${n}加入${nname(captor)}军。` : `${n}拒绝投降，被关押。`;
    }
    case 'imprison':
      return `${n}被${nname(captor)}关押。`;
    case 'behead':
      p.status = 'dead';
      p.city = 0;
      p.nation = 0;
      if (wasLord) await lordLost(orig, hooks);
      return `${n}被${nname(captor)}斩首。`;
    case 'release': {
      p.status = 'serving';
      p.nation = orig;
      const na = nation(orig);
      const dest = na?.alive ? (neighbors(p.city).find((c) => city(c).owner === orig) ?? citiesOf(orig)[0]?.id) : undefined;
      if (dest) {
        p.city = dest;
        p.origNation = undefined;
        assignOfficials(city(dest));
        return `${n}被${nname(captor)}释放，回到${cname(dest)}。`;
      }
      p.status = 'free';
      p.nation = 0;
      p.origNation = undefined;
      return `${n}被释放，下野了。`;
    }
  }
}

/** Lord of `nationId` is gone (dead or nation lost him): successor or destruction. */
export async function lordLost(nationId: number, hooks: WarHooks) {
  const na = nation(nationId);
  if (!na || !na.alive) return;
  // heirs: blood relatives (血缘) first, then the same family name, then seniority
  const oldName = gname(na.lord);
  const kin = (g: GeneralState) => {
    const d = db.generals[g.id - 1];
    if (d.parent && (d.parent === oldName || db.generals[na.lord - 1]?.parent === d.name)) return 2;
    return d.name[0] === oldName[0] ? 1 : 0;
  };
  const cands = generalsOf(nationId).filter((g) => g.id !== na.lord).sort((a, b) => kin(b) - kin(a) || b.level - a.level);
  if (!cands.length || !citiesOf(nationId).length) {
    destroyNation(nationId, hooks);
    return;
  }
  let pick = cands[0].id;
  if (hooks.chooseLord && nationId === G.player) pick = await hooks.chooseLord(nationId, cands.map((g) => g.id));
  const old = na.lord;
  na.lord = pick;
  na.name = gname(pick);
  gen(pick).loyalty = 100;
  for (const c of citiesOf(nationId)) assignOfficials(c);
  // vassals' loyalty shaken
  for (const g of generalsOf(nationId)) if (g.id !== pick) g.loyalty = clamp(g.loyalty - rng.int(0, 10), 0, 100);
  const t = `${gname(old)}身亡，由${gname(pick)}继承君主。`;
  addLog(t);
  hooks.log?.(t);
}

export function destroyNation(nationId: number, hooks?: WarHooks) {
  const na = nation(nationId);
  if (!na || !na.alive) return;
  na.alive = false;
  for (const g of G.generals) {
    if (g.status === 'serving' && g.nation === nationId) {
      g.status = 'free';
      g.nation = 0;
      g.soldiers = 0;
      g.title = -1;
    } else if (g.status === 'prisoner' && g.nation === nationId) {
      g.status = 'free';
      g.nation = 0;
      g.origNation = undefined;
    } else if (g.status === 'prisoner' && g.origNation === nationId) g.origNation = 0;
  }
  for (const c of citiesOf(nationId)) {
    c.owner = 0;
    c.governor = 0;
    c.advisor = 0;
  }
  for (const o of G.nations) o.allies = o.allies.filter((x) => x !== nationId);
  const t = `${na.name}军从此消失在历史的舞台上了。`;
  addLog(t);
  hooks?.log?.(t);
}

export interface WarSummary {
  attackerWon: boolean;
  lines: string[];
}

/**
 * Applies a WarResult to the strategy state: ownership, development loss,
 * prisoners, lords, merits. `hooks.decide` is used for each captured general.
 */
export async function applyWar(setup: WarSetup, res: WarResult, hooks: WarHooks): Promise<WarSummary> {
  const lines: string[] = [];
  const log = (t: string) => {
    lines.push(t);
    addLog(t);
  };
  const tc = city(setup.city);
  const defender = tc.owner;
  const att = setup.attacker;
  const winner = res.attackerWon ? att : defender;
  const loserN = res.attackerWon ? defender : att;
  const dead = new Set(res.killed);
  const caught = new Set(res.captured);

  for (const id of res.killed) {
    const g = gen(id);
    const wasLord = isLord(g);
    const from = g.nation;
    g.status = 'dead';
    g.city = 0;
    g.soldiers = 0;
    g.title = -1;
    log(`${gname(id)}阵亡。`);
    if (wasLord) await lordLost(from, hooks);
  }

  // merits / records
  for (const id of [...setup.attackers, ...setup.defenders]) {
    const g = gen(id);
    if (dead.has(id)) continue;
    const won = g.nation === winner && !caught.has(id);
    if (won) {
      g.merit += 120 + g.level * 6;
      g.wins = (g.wins ?? 0) + 1;
    } else {
      g.merit += 40;
      g.losses = (g.losses ?? 0) + 1;
    }
  }

  if (res.attackerWon) {
    const oldOwner = tc.owner;
    tc.owner = att;
    tc.dev = Math.max(0, Math.round(tc.dev * rng.range(0.82, 0.92)));
    tc.people = Math.round(tc.people * 0.95);
    tc.money = Math.round(tc.money * 0.5);
    tc.reserve = Math.round(tc.reserve * 0.3);
    tc.training = Math.max(20, tc.training - 20);
    tc.governor = 0;
    tc.advisor = 0;
    // surviving attackers occupy the city
    for (const id of setup.attackers) {
      const g = gen(id);
      if (g.status === 'serving' && g.nation === att && !res.retreated.includes(id)) g.city = tc.id;
    }
    // remaining defenders flee or are captured
    for (const g of G.generals) {
      if (g.status !== 'serving' || g.city !== tc.id || g.nation !== oldOwner || caught.has(g.id)) continue;
      if (!relocate(g, tc.id)) caught.add(g.id);
    }
    // prisoners held there are freed
    for (const p of prisonersIn(tc.id)) {
      if (p.nation !== oldOwner) continue;
      if (p.origNation === att) {
        p.status = 'serving';
        p.nation = att;
        p.origNation = undefined;
        log(`${gname(p.id)}获救，回到我军。`);
      } else {
        p.status = 'free';
        p.nation = 0;
        p.origNation = undefined;
      }
    }
    log(`${nname(att)}军攻陷${cname(tc.id)}。`);
  } else {
    for (const id of setup.attackers) {
      const g = gen(id);
      if (g.status === 'serving' && g.nation === att) g.city = setup.from;
    }
    tc.dev = Math.max(0, Math.round(tc.dev * 0.96));
    log(`${nname(defender)}军击退${nname(att)}军。`);
  }

  // morale
  const wc = res.attackerWon ? tc : city(setup.city);
  wc.training = clamp(wc.training + 5, 0, 100);
  const lc = city(setup.from);
  if (!res.attackerWon) lc.training = clamp(lc.training - 5, 0, 100);

  // prisoners → winner
  const prisoners = [...caught].filter((id) => gen(id).status !== 'dead');
  for (const id of prisoners) {
    const g = gen(id);
    if (g.status === 'prisoner' && g.nation === winner) continue;
    const owner = g.nation;
    if (owner === winner) continue; // own generals "captured" by loser are released
    capture(g, winner, tc.id);
    log(`${gname(id)}被${nname(winner)}俘虏了。`);
  }
  for (const id of prisoners) {
    const g = gen(id);
    if (g.status !== 'prisoner' || g.nation !== winner) continue;
    const choice = await hooks.decide(winner, id);
    log(await handlePrisoner(winner, id, choice, hooks));
  }

  // lords who lost their last city / nations wiped out
  for (const nid of [defender, att, loserN]) {
    const na = nation(nid);
    if (!na?.alive) continue;
    if (!citiesOf(nid).length) {
      // homeless lord: if still free, nation ends
      destroyNation(nid, hooks);
      lines.push(`${na.name}军灭亡。`);
      continue;
    }
    const lord = gen(na.lord);
    if (lord.status === 'prisoner' || lord.status === 'dead') await lordLost(nid, hooks);
    else if (lord.status === 'serving' && city(lord.city).owner !== nid) relocate(lord, lord.city);
  }
  for (const c of [tc, city(setup.from)]) if (c.owner) assignOfficials(c);
  return { attackerWon: res.attackerWon, lines };
}

/** Defenders available in a city (serving generals of the owner). */
export function defendersOf(cityId: number) {
  const c = city(cityId);
  return generalsIn(cityId, c.owner)
    .filter((g) => g.hp > 0)
    .sort((a, b) => powerOf(b) - powerOf(a));
}

// ================================================================== misc helpers
export function nationOf(g: GeneralState): NationState | undefined {
  return nation(g.nation);
}
export function lordCity(nationId: number) {
  const n = nation(nationId);
  return n ? gen(n.lord).city : 0;
}
export function aliveNations() {
  return G.nations.filter((n) => n.alive);
}

/** Starting skills: generals know a few 武将技 / 军师技 they qualify for (once per campaign). */
export function grantStartingSkills(g: GeneralState) {
  if (g.bfMagic.length || g.sfMagic.length) return;
  const bf = db.bfMagic.filter((m) => m.name && !bfMagicReq(g, m)).sort((a, b) => b.level - a.level || b.contribution - a.contribution);
  const n = clamp(Math.floor(g.level / 6) + 1, 1, 4);
  // pick spread: strongest few + one cheap
  const pick = bf.slice(0, n);
  g.bfMagic = pick.map((m) => m.id);
  if (intOf(g) >= 70) {
    const sf = db.sfMagic.filter((m) => m.name && !bfMagicReq(g, m)).sort((a, b) => b.level - a.level);
    g.sfMagic = sf.slice(0, clamp(Math.floor(g.level / 8) + 1, 1, 3)).map((m) => m.id);
  }
}
