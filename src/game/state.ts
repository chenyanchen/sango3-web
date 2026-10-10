// Mutable, serializable game state (one campaign). Everything here must stay
// JSON-serializable (saves are plain JSON).
import { db } from '../data/db';
import { Rng } from '../engine/rng';

export type GeneralStatus = 'hidden' | 'free' | 'serving' | 'prisoner' | 'dead';

export interface GeneralState {
  id: number; // = GeneralDef.id
  status: GeneralStatus;
  nation: number; // owning nation id (0 = none). For prisoners: the captor.
  city: number; // city id where the general is (0 = none)
  level: number;
  exp: number;
  str: number; // 武力 (current, includes level growth; equipment bonuses are applied on top via rules)
  int: number; // 智力
  maxHp: number;
  hp: number;
  maxMp: number;
  mp: number;
  loyalty: number; // 忠诚 0..100 (lords: 100)
  merit: number; // 功勋 (spent to learn 武将技/军师技)
  title: number; // GenTitle id, -1 = none
  soldiers: number; // soldiers currently led
  soldierType: number; // 0..8 (Soldier.ini)
  soldierTypes: number[]; // unlocked by 兵符
  formation: number; // 0..7 (Rank.ini)
  formations: number[]; // unlocked by 阵法书
  bfMagic: number[]; // learned 武将技 (BFMagic ids)
  sfMagic: number[]; // learned 军师技 (SFMagic ids)
  weapon: number; // equipped item id or -1
  horse: number;
  book: number;
  items: number[]; // carried consumables/treasures (item ids)
  acted: boolean; // has used an action this month
  /** month index (year*12+month) when this general may appear (hidden → free) */
  appearAt?: number;
  /** prisoners: the nation the general served before capture */
  origNation?: number;
  /** permanent max HP / MP bonuses (人参 / 灵芝) */
  hpBonus?: number;
  mpBonus?: number;
  /** battle record */
  wins?: number;
  losses?: number;
}

export interface CityState {
  id: number;
  owner: number; // nation id, 0 = unowned
  people: number;
  money: number;
  dev: number; // 开发度 0..999
  reserve: number; // 预备兵 (soldiers available to assign)
  training: number; // 士气/训练 0..100
  governor: number; // general id or 0 (太守)
  advisor: number; // general id or 0 (军师)
  items: number[]; // undiscovered items that 搜索 can find
}

export interface NationState {
  id: number;
  lord: number; // general id of the ruler
  name: string; // display name (lord's name)
  color: string; // css color
  flag: number;
  bgm: number;
  alive: boolean;
  friendship: Record<number, number>; // nation id → 0..100
  allies: number[]; // nation ids
  ap: number; // remaining action points this month (行动点数)
  /** AI: months since this nation last attacked (aggression builds up) */
  calm?: number;
  /** item inventory (item ids) found by 搜索, given out with 物品 */
  items?: number[];
}

export interface GameState {
  version: 1;
  scenario: number;
  year: number;
  month: number;
  player: number; // player nation id
  nations: NationState[];
  cities: CityState[]; // index = city id - 1
  generals: GeneralState[]; // index = general id - 1
  emperor: number; // index into db.emperors (0-based)
  emperorCity: number;
  firedEvents: number[];
  log: { y: number; m: number; text: string }[];
  seed: number;
  options: { historicalEvents: boolean };
  /** "nationId:cityId" → month index when the city was investigated (调查) */
  intel?: Record<string, number>;
  /** strategy layer one-time campaign setup done */
  inited?: boolean;
  /** month index when the campaign started (AI grace period) */
  startedAt?: number;
  /** campaign finished */
  over?: 'victory' | 'defeat';
}

export let G: GameState;
export function setState(s: GameState) {
  G = s;
}

export const NATION_COLORS = [
  '#8a8a8a', '#d13b2f', '#2f6fd1', '#2fa84f', '#e0b91f', '#8e3fc2', '#e07a1f', '#1fb5c9', '#c91f7a',
  '#6b4a2b', '#7fbf3f', '#3f3fbf', '#bf3f3f', '#3fbf9f', '#bfa33f', '#5a5a5a', '#d18fbf', '#9fd13b',
];

export const monthIndex = (y: number, m: number) => y * 12 + (m - 1);

// ------------------------------------------------------------------ helpers
export const gen = (id: number) => G.generals[id - 1];
export const city = (id: number) => G.cities[id - 1];
export const nation = (id: number) => G.nations.find((n) => n.id === id);
export const isPlayer = (nationId: number) => nationId === G.player;

export function generalsIn(cityId: number, nationId?: number): GeneralState[] {
  return G.generals.filter(
    (g) => g.city === cityId && g.status === 'serving' && (nationId === undefined || g.nation === nationId),
  );
}
export function prisonersIn(cityId: number): GeneralState[] {
  return G.generals.filter((g) => g.city === cityId && g.status === 'prisoner');
}
export function freeGeneralsIn(cityId: number): GeneralState[] {
  return G.generals.filter((g) => g.city === cityId && g.status === 'free');
}
export function citiesOf(nationId: number): CityState[] {
  return G.cities.filter((c) => c.owner === nationId);
}
export function generalsOf(nationId: number): GeneralState[] {
  return G.generals.filter((g) => g.nation === nationId && g.status === 'serving');
}

/** Max soldiers a general can lead (title based). */
export function maxSoldiers(g: GeneralState): number {
  const t = db.titles[g.title];
  return t ? t.soldiers : 30;
}

/** Experience needed to reach `level`+1. */
export function expToNext(level: number) {
  const t = db.generalExp;
  return t[level + 1] ?? t[t.length - 1] * 1.1 ** (level + 1 - t.length);
}

// ------------------------------------------------------------------ new game
export function newGame(scenarioId: number, playerLordName: string): GameState {
  const sc = db.scenarios[scenarioId - 1];
  const rng = new Rng((Date.now() ^ (scenarioId * 7919)) >>> 0);
  const now = monthIndex(sc.year, sc.month);

  const nations: NationState[] = [];
  const nationByLord = new Map<string, NationState>();
  for (const nd of sc.nations) {
    if (!nd.lord) continue;
    const lordDef = db.generalByName.get(nd.lord);
    if (!lordDef) continue;
    const n: NationState = {
      id: nd.key, lord: lordDef.id, name: nd.lord, color: NATION_COLORS[nd.flag % NATION_COLORS.length] ?? '#999',
      flag: nd.flag, bgm: nd.bgm, alive: true, friendship: {}, allies: [], ap: 0,
    };
    nations.push(n);
    nationByLord.set(nd.lord, n);
  }
  for (const nd of sc.nations) {
    const n = nationByLord.get(nd.lord);
    if (!n) continue;
    for (const [lord, v] of Object.entries(nd.friendship)) {
      const o = nationByLord.get(lord);
      if (o) n.friendship[o.id] = v;
    }
  }

  const cities: CityState[] = db.cities.map((c) => {
    const ci = sc.cities.find((x) => x.name === c.name);
    const owner = ci?.lord ? (nationByLord.get(ci.lord)?.id ?? 0) : 0;
    const big = c.size === 1 ? 1.4 : c.size === 2 ? 1.15 : c.size === 3 ? 1 : 0.6;
    return {
      id: c.id, owner, people: ci?.people ?? 20000, money: ci?.money ?? 200, dev: ci?.development ?? 100,
      reserve: ci?.reserve ?? 0, training: 50, governor: 0, advisor: 0,
      items: seedCityItems(rng, big),
    };
  });

  const generals: GeneralState[] = db.generals.map((d) => {
    const a = d.appear[scenarioId];
    const lvl = Math.max(1, Math.min(30, Math.round(d.rank * 2 + (scenarioId - 1) * 1.5 + (d.str + d.int) / 40 + rng.int(-1, 2))));
    const g: GeneralState = {
      id: d.id, status: 'hidden', nation: 0, city: 0, level: lvl, exp: db.generalExp[lvl] ?? 0,
      str: d.str, int: d.int, maxHp: 0, hp: 0, maxMp: 0, mp: 0, loyalty: 80, merit: 0, title: -1,
      soldiers: 0, soldierType: d.soldierTypes[0] ?? 0, soldierTypes: [...new Set(d.soldierTypes)].slice(0, 3),
      formation: 0, formations: [0, 1], bfMagic: [], sfMagic: [], weapon: -1, horse: -1, book: -1, items: [], acted: false,
    };
    recalcVitals(g, true);
    if (a) {
      const c = db.cityByName.get(a.city);
      g.city = c?.id ?? 0;
      const cs = c ? cities[c.id - 1] : undefined;
      if (a.free || !cs || !cs.owner) g.status = 'free';
      else {
        g.status = 'serving';
        g.nation = cs.owner;
        g.loyalty = Math.min(100, 60 + Math.round(d.justice / 3) + rng.int(0, 10));
      }
    } else {
      // appears later (if ever) as a free general somewhere it shows up in a later scenario
      for (let s = scenarioId + 1; s <= 7; s++) {
        const la = d.appear[s];
        if (la) {
          const ls = db.scenarios[s - 1];
          g.appearAt = monthIndex(ls.year, ls.month) - rng.int(0, 24);
          g.city = db.cityByName.get(la.city)?.id ?? 0;
          if (g.appearAt <= now) g.appearAt = now + rng.int(3, 24);
          break;
        }
      }
    }
    return g;
  });

  // lords
  for (const n of nations) {
    const g = generals[n.lord - 1];
    g.status = 'serving';
    g.nation = n.id;
    g.loyalty = 100;
    if (!g.city || cities[g.city - 1].owner !== n.id) {
      const own = cities.find((c) => c.owner === n.id);
      if (own) g.city = own.id;
    }
  }
  // nations without cities are dropped
  for (const n of nations) n.alive = cities.some((c) => c.owner === n.id);

  const state: GameState = {
    version: 1, scenario: scenarioId, year: sc.year, month: sc.month,
    player: nationByLord.get(playerLordName)?.id ?? nations[0].id,
    nations: nations.filter((n) => n.alive), cities, generals,
    emperor: Math.max(0, sc.emperor - 1), emperorCity: db.cityByName.get(sc.emperorCity)?.id ?? 0,
    firedEvents: [], log: [], seed: rng.int(1, 2 ** 30), options: { historicalEvents: true },
  };
  G = state;

  // titles, soldiers, governors
  for (const n of G.nations) {
    const gs = generalsOf(n.id).sort((a, b) => b.level - a.level);
    const used = new Set<number>();
    for (const g of gs) {
      const t = bestTitleFor(g.level, used);
      if (t >= 0) {
        g.title = t;
        used.add(t);
      }
      g.soldiers = maxSoldiers(g);
    }
    for (const c of citiesOf(n.id)) assignOfficials(c);
  }
  for (const n of G.nations) n.ap = actionPointsFor(n.id);
  return state;
}

function seedCityItems(rng: Rng, big: number): number[] {
  const out: number[] = [];
  const n = Math.round(rng.int(1, 4) * big);
  for (let i = 0; i < n; i++) {
    const cand = db.items.filter((it) => it.findRate > 0 && it.type !== 1 && it.level <= 25);
    const it = rng.pickWeighted(cand, (x) => x.findRate);
    if (it) out.push(it.id);
  }
  return out;
}

/** Highest title (GenTitle id) the level qualifies for, avoiding `used`. */
export function bestTitleFor(level: number, used: Set<number>): number {
  let best = -1;
  for (const t of db.titles) if (t.level <= level && !used.has(t.id) && (best < 0 || t.level >= db.titles[best].level)) best = t.id;
  return best;
}

/** Recomputes max HP/MP from level (and refills if `full`). */
export function recalcVitals(g: GeneralState, full = false) {
  const d = db.generals[g.id - 1];
  const book = g.book >= 0 ? db.items[g.book] : undefined;
  g.maxHp = Math.round(d.hp + g.level * 4 + d.str / 5 + (g.hpBonus ?? 0) + (book?.attribute === 3 ? book.inc : 0));
  g.maxMp = Math.round(d.mp + g.level * 2 + d.int / 5 + (g.mpBonus ?? 0) + (book?.attribute === 4 ? book.inc : 0));
  if (full) {
    g.hp = g.maxHp;
    g.mp = g.maxMp;
  } else {
    g.hp = Math.min(g.hp, g.maxHp);
    g.mp = Math.min(g.mp, g.maxMp);
  }
}

/**
 * Adds experience, applying level-ups (stat growth + vitals). Returns the
 * number of levels gained. Callers decide the amount; typical values:
 * battle ≈ kills*2 + 30 (win bonus 50), domestic command ≈ 10..20.
 */
export function gainExp(g: GeneralState, amount: number): number {
  g.exp += Math.max(0, Math.round(amount));
  let ups = 0;
  while (g.level < 99 && g.exp >= expToNext(g.level)) {
    g.level++;
    ups++;
    const d = db.generals[g.id - 1];
    // stats grow slowly toward (and slightly past) their natural cap
    if (g.str < 100 && Math.random() < 0.35 + d.str / 400) g.str++;
    if (g.int < 100 && Math.random() < 0.35 + d.int / 400) g.int++;
  }
  if (ups) recalcVitals(g);
  return ups;
}

/** Picks 太守 (highest level, lord preferred) and 军师 (highest 智力) when unset or invalid. */
export function assignOfficials(c: CityState) {
  const gs = generalsIn(c.id, c.owner);
  if (!gs.length) {
    c.governor = 0;
    c.advisor = 0;
    return;
  }
  const n = nation(c.owner);
  if (!gs.some((g) => g.id === c.governor)) {
    const lord = gs.find((g) => g.id === n?.lord);
    c.governor = (lord ?? [...gs].sort((a, b) => b.level - a.level)[0]).id;
  }
  if (n && gs.some((g) => g.id === n.lord)) c.governor = n.lord;
  if (!gs.some((g) => g.id === c.advisor)) c.advisor = [...gs].sort((a, b) => b.int - a.int)[0].id;
}

/** 行动点数: grows with the number of cities held. */
export function actionPointsFor(nationId: number) {
  const n = citiesOf(nationId).length;
  return Math.min(40, 3 + n * 2);
}

export function addLog(text: string) {
  G.log.push({ y: G.year, m: G.month, text });
  if (G.log.length > 300) G.log.splice(0, G.log.length - 300);
}
