// Static game database, parsed from the converted original INI files
// (public/assets/data/*.json). Everything here is read-only at runtime;
// mutable state lives in game/state.ts.
import { assetUrl } from '../engine/assets';

type IniSec = { _: string } & Record<string, string | string[] | undefined>;
type Ini = IniSec[];

const num = (v: unknown, d = 0) => {
  const n = parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) ? n : d;
};
const str = (v: unknown) => (Array.isArray(v) ? String(v[0] ?? '') : String(v ?? '')).trim();
const list = (v: unknown) =>
  str(v)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

export interface GeneralDef {
  id: number; // 1-based, General01.ini "No"
  name: string;
  str: number; // 武力
  int: number; // 智力
  hp: number; // 体力 (base)
  mp: number; // 技力 (base)
  justice: number; // 义理
  morale: number; // 士气
  personality: number;
  parent: string; // 血缘
  lord: string;
  portrait: number; // Portrait/Portrait%03d
  portraitName: string; // frame name in shape dir "portrait", e.g. portrait001
  book: string;
  horse: string;
  weapon: string;
  weaponType: number;
  bfai: number;
  bfShape: number; // battle sprite object id = 30000 + bfShape
  superAttack: string; // 必杀技
  soldierTypes: number[]; // soldier type unlocked per level band
  rank: number; // initial title level hint
  sex: number; // 1 male, 2 female
  /** Per-scenario placement: index 1..7 → { city name, free (在野) } */
  appear: Record<number, { city: string; free: boolean } | undefined>;
}

export interface CityDef {
  id: number; // 1..70
  name: string;
  size: number; // 1 大城 2 中城 3 小城 4 关卡 (icon class)
  snow: number;
  neighbors: number[]; // city ids
  x: number; // centre on the 1024x768 China map (AD/Base/Map)
  y: number;
  isPass: boolean; // 关卡
}

export interface NationDef {
  key: number; // e.g. 101 (scenario*100 + index)
  lord: string; // lord general name ('' = 空白势力)
  flag: number;
  bgm: number;
  friendship: Record<string, number>; // by lord name
}

export interface CityInit {
  name: string;
  lord: string; // owning lord name or ''
  people: number;
  money: number;
  development: number;
  reserve: number;
}

export interface ScenarioDef {
  id: number; // 1..7
  year: number;
  month: number;
  emperor: number;
  emperorCity: string;
  nations: NationDef[];
  cities: CityInit[];
}

export interface ItemDef {
  id: number; // index in Thing.ini (0-based)
  name: string;
  type: number; // 1 兵符 2 武器 3 书 4 马 5 阵法书 6 宝物 7 人参 8 灵芝
  count: number;
  desc: string;
  icon: string; // shape name under ad/things
  level: number;
  inc: number;
  inc2: number;
  inc3: number;
  findRate: number;
  attraction: number;
  attribute: number; // soldier type / formation / horse object id ...
}

export interface SoldierDef {
  id: number; // 0..8
  name: string;
  nameAdv: string;
  objectId: number; // Things object (34010 + 10*id)
  startHp: number;
  addHp: number;
  startPower: number;
  addPower: number;
  hitRate: number[]; // vs soldier type 0..8, [9] = vs general
}

export interface BFMagicDef {
  id: number; // 1..125
  name: string;
  mp: number;
  power: number;
  level: number;
  contribution: number; // 功勋 cost to learn
  intUp: number;
  intDown: number;
  strUp: number;
  strDown: number;
  noArena: boolean;
  attribute: number;
  spec: string;
  goodTerrain: number[];
  badTerrain: number[];
  goodTime: number[];
  badTime: number[];
  goodWeather: number[];
  badWeather: number[];
}

export interface SFMagicDef {
  id: number;
  name: string;
  mp: number;
  level: number;
  contribution: number;
  intUp: number;
  intDown: number;
  strUp: number;
  strDown: number;
  range: number;
  enemyType: number;
}

export interface FormationDef {
  id: number; // 0..7
  name: string;
  generalPos: [number, number];
  groupPos: [number, number][]; // 8 groups
  bigGroups: number[][];
  terrainCost: number[]; // per SF terrain attr (1-based attr → index attr-1)
}

export interface TitleDef {
  id: number;
  name: string;
  level: number;
  soldiers: number;
}

export interface EventDef {
  id: number;
  name: string;
  year: number;
  month: number;
  condition: number;
  msg: number;
}

export interface AnimFrame {
  f: string;
  d: number;
  ev?: string;
}
export interface AnimDef {
  frames: AnimFrame[];
  loop: boolean;
}
export interface ObjectDef {
  name: string;
  dir: string; // shape dir, e.g. "bf/general/001"
  flags: string[];
  sprites: Record<string, AnimDef>; // lower-case anim name
}

export interface DB {
  generals: GeneralDef[]; // index = id-1
  generalByName: Map<string, GeneralDef>;
  cities: CityDef[]; // index = id-1
  cityByName: Map<string, CityDef>;
  scenarios: ScenarioDef[]; // index = id-1
  items: ItemDef[];
  soldiers: SoldierDef[];
  bfMagic: BFMagicDef[]; // index = id-1
  sfMagic: SFMagicDef[]; // index = id-1
  formations: FormationDef[];
  titles: TitleDef[];
  events: EventDef[];
  generalExp: number[]; // exp needed for level i (index = level)
  soldierExp: number[];
  emperors: { name: string; shape: string }[];
  objects: Record<string, ObjectDef>;
  /** raw access to any converted ini (e.g. 'EventMsg', 'Dialogue', 'Text') */
  raw: Record<string, Ini>;
}

export let db: DB;

const RAW = [
  'General01', 'General02', 'City', 'Nation', 'Thing', 'Soldier', 'BFMagic', 'SFMagic', 'Rank', 'GenTitle',
  'Event', 'EventCond', 'EventMsg', 'EventItem', 'Game', 'MenuMap', 'Dialogue', 'Text', 'NewGeneral', 'SFMap',
  'City01', 'City02', 'City03', 'City04', 'City05', 'City06', 'City07',
];

async function fetchJson<T>(rel: string): Promise<T> {
  const r = await fetch(assetUrl(rel));
  if (!r.ok) throw new Error(`missing asset ${rel} — did you run \`pnpm extract\`?`);
  return r.json() as Promise<T>;
}

export async function loadDB(): Promise<DB> {
  const raw: Record<string, Ini> = {};
  const [objects] = await Promise.all([
    fetchJson<Record<string, ObjectDef>>('data/objects.json'),
    ...RAW.map(async (n) => (raw[n] = await fetchJson<Ini>(`data/${n}.json`))),
  ]);

  // cities -----------------------------------------------------------
  const pos = new Map<string, number[]>();
  for (const w of raw.MenuMap) if (w.Class === 'WND_CLASS_CITYBUTTON') pos.set(str(w.Comment), list(w.Range).map(Number));
  const cityRows = raw.City.filter((s) => s._ === 'ITEM');
  const cities: CityDef[] = cityRows.map((s) => {
    const name = str(s.Name);
    const r = pos.get(name) ?? [0, 0, 0, 0];
    const size = num(s.Size);
    return { id: num(s.No), name, size, snow: num(s.Snow), neighbors: [], x: r[0] + r[2] / 2, y: r[1] + r[3] / 2, isPass: size === 4 };
  });
  cities.sort((a, b) => a.id - b.id);
  const cityByName = new Map(cities.map((c) => [c.name, c]));
  cityRows.forEach((s) => {
    const c = cityByName.get(str(s.Name))!;
    c.neighbors = list(s.Neighbors).map((n) => cityByName.get(n)?.id ?? 0).filter(Boolean);
  });
  // make adjacency symmetric
  for (const c of cities) for (const n of c.neighbors) {
    const o = cities[n - 1];
    if (!o.neighbors.includes(c.id)) o.neighbors.push(c.id);
  }

  // generals ---------------------------------------------------------
  const appear = new Map<string, GeneralDef['appear']>();
  for (const s of raw.General02) {
    const a: GeneralDef['appear'] = {};
    for (let i = 1; i <= 7; i++) {
      const v = list(s[`City${i}`]);
      if (v.length) a[i] = { city: v[0], free: v[1] === '野' };
    }
    appear.set(str(s.Name), a);
  }
  const generals: GeneralDef[] = raw.General01.filter((s) => s._ === 'GENERAL').map((s) => {
    const name = str(s.Name);
    const portrait = num(s.Portrait);
    const sex = num(s.Sex, 1);
    return {
      id: num(s.No), name,
      str: num(s.Strength), int: num(s.Intelligence), hp: num(s.HP), mp: num(s.MP),
      justice: num(s.Justice), morale: num(s.Morale), personality: num(s.Personality),
      parent: str(s.RParent), lord: str(s.RLord),
      portrait, portraitName: `portrait${String(portrait).padStart(3, '0')}`,
      book: str(s.Book), horse: str(s.Horse), weapon: str(s.Weapon),
      weaponType: num(s.WeaponType), bfai: num(s.BFAI), bfShape: num(s.BFShape),
      superAttack: str(s.SuperAttack), soldierTypes: list(s.SoldierType).map(Number),
      rank: num(s.Rank), sex, appear: appear.get(name) ?? {},
    };
  });
  generals.sort((a, b) => a.id - b.id);

  // scenarios --------------------------------------------------------
  const game = raw.Game;
  const sec = (n: string) => game.find((s) => s._ === n);
  const scenarios: ScenarioDef[] = [];
  for (let i = 1; i <= 7; i++) {
    const age = sec(`Age0${i}`);
    if (!age) continue;
    const nations: NationDef[] = raw.Nation.filter((s) => /^NATION\d+$/.test(s._) && Math.floor(num(s._.slice(6)) / 100) === i).map((s) => {
      const fr: Record<string, number> = {};
      const l = list(s.Friendship);
      for (let k = 0; k + 1 < l.length; k += 2) fr[l[k]] = num(l[k + 1]);
      return { key: num(s._.slice(6)), lord: str(s.Lord), flag: num(s.Flag), bgm: num(s.BGM), friendship: fr };
    });
    const cityInit: CityInit[] = (raw[`City0${i}`] ?? []).filter((s) => s._ === 'ITEM').map((s) => ({
      name: str(s.Name), lord: str(s.Lord), people: num(s.People), money: num(s.Money),
      development: num(s.Development), reserve: num(s.ReserveForce),
    }));
    scenarios.push({
      id: i, year: num(age.Year), month: num(age.Month), emperor: num(age.Emperor), emperorCity: str(age.EmperorCity),
      nations, cities: cityInit,
    });
  }
  const expTable = (name: string) => {
    const s: IniSec = sec(name) ?? { _: name };
    const out: number[] = [0];
    for (let lv = 1; lv <= 99; lv++) {
      const v = s[String(lv).padStart(2, '0')] ?? s[String(lv)];
      if (v === undefined) break;
      out[lv] = num(v);
    }
    return out;
  };
  const emp: IniSec = sec('EMPEROR') ?? { _: '' };
  const emperors = Array.from({ length: num(emp.Count) }, (_, k) => ({
    name: str(emp[`Name0${k + 1}`]), shape: str(emp[`Shape0${k + 1}`]).replaceAll('\\', '/').toLowerCase(),
  }));

  // items etc. -------------------------------------------------------
  const items: ItemDef[] = raw.Thing.filter((s) => s._ === 'ITEM').map((s, i) => ({
    id: i, name: str(s.Name), type: num(s.Type), count: num(s.Count), desc: str(s.Statement), icon: str(s.Icon).toLowerCase(),
    level: num(s.Level), inc: num(s.Increment), inc2: num(s.Increment2), inc3: num(s.Increment3),
    findRate: num(s.FindRate), attraction: num(s.Attraction), attribute: num(s.Attribute),
  }));
  const soldiers: SoldierDef[] = raw.Soldier.filter((s) => s._ === 'ITEM').map((s) => ({
    id: num(s.No), name: str(s.Name).replace(/\s|　/g, ''), nameAdv: str(s.NameAdv).replace(/\s|　/g, ''), objectId: num(s.ResID),
    startHp: num(s.StartHP), addHp: num(s.AddHP), startPower: num(s.StartPower), addPower: num(s.AddPower),
    hitRate: Array.from({ length: 10 }, (_, k) => num(s[`HitRate0${k}`], 50)),
  }));
  const nums = (v: unknown) => list(v).map(Number).filter((n) => Number.isFinite(n));
  const bfMagic: BFMagicDef[] = raw.BFMagic.filter((s) => s._ === 'BF_MAGIC').map((s) => ({
    id: num(s.No), name: str(s.Name), mp: num(s.MP), power: num(s.Power), level: num(s.Level), contribution: num(s.Contribution),
    intUp: num(s.IntUp), intDown: num(s.IntDown), strUp: num(s.StrUp), strDown: num(s.StrDown), noArena: num(s.NoArena) === 1,
    attribute: num(s.Attribute), spec: str(s.Spec),
    goodTerrain: nums(s.GoodTerrain), badTerrain: nums(s.BadTerrain), goodTime: nums(s.GoodTimeZone), badTime: nums(s.BadTimeZone),
    goodWeather: nums(s.GoodWeather), badWeather: nums(s.BadWeather),
  }));
  const sfMagic: SFMagicDef[] = raw.SFMagic.filter((s) => s._ === 'SF_MAGIC').map((s) => ({
    id: num(s.No), name: str(s.Name), mp: num(s.MP), level: num(s.Level), contribution: num(s.Contribution),
    intUp: num(s.IntUp), intDown: num(s.IntDown), strUp: num(s.StrUp), strDown: num(s.StrDown), range: num(s.Range), enemyType: num(s.EnemyType),
  }));
  const pair = (v: unknown) => nums(v).slice(0, 2) as [number, number];
  const formations: FormationDef[] = raw.Rank.filter((s) => /^RANK\d+$/.test(s._)).map((s) => ({
    id: num(s._.slice(4)), name: str(s.Name), generalPos: pair(s.GeneralPos),
    groupPos: Array.from({ length: 8 }, (_, k) => pair(s[`GroupPos0${k}`])),
    bigGroups: Array.from({ length: 5 }, (_, k) => nums(s[`BigGroup0${k}`])),
    terrainCost: nums(s.TerrainCost),
  }));
  const titles: TitleDef[] = raw.GenTitle.filter((s) => s._ === 'ITEM').map((s) => ({
    id: num(s.No), name: str(s.Name), level: num(s.Level), soldiers: num(s.Soldiers),
  }));
  const events: EventDef[] = raw.Event.filter((s) => s._ === 'Event').map((s) => ({
    id: num(s.ID), name: str(s.Name), year: num(s.Year), month: num(s.Month), condition: num(s.Condition), msg: num(s.Msg),
  }));

  db = {
    generals, generalByName: new Map(generals.map((g) => [g.name, g])),
    cities, cityByName, scenarios, items, soldiers, bfMagic, sfMagic, formations, titles, events,
    generalExp: expTable('GENERALEXP'), soldierExp: expTable('SOLDIEREXP'), emperors, objects, raw,
  };
  return db;
}
