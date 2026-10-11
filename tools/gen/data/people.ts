// People & story data of 三国墨英传: generals (General01/02), the seven eras
// (Nation, City01..07, Game Age0n + EMPEROR), 自创武将 templates (NewGeneral),
// historical events (Event/EventCond/EventMsg/EventItem), duel taunts
// (Dialogue) and misc strings (Text). Also exports PORTRAITS for the portrait
// painter. All names are historical; numbers and writing are our own.
import type { IniSection, Look, PortraitSlot } from '../types.ts';
import { CITIES, CITY } from './geo.ts';
import { weaponTypeOf } from './unitsets.ts';
import { BOOK_NAMES, HORSE_NAMES, WEAPON_NAMES } from './_rules_items.ts';
import { ROSTER } from './_people/roster.ts';
import { SCENARIOS } from './_people/scenarios.ts';
import { lookOf, templates } from './_people/looks.ts';
import { eventFiles } from './_people/events.ts';
import { dialogueSections } from './_people/dialogue.ts';

// ------------------------------------------------------------------ roster
export interface Person {
  no: number;
  name: string;
  str: number;
  int: number;
  justice: number;
  rank: number;
  role: string;
  soldiers: number[];
  born: number;
  died: number;
  home: string;
  set: number;
  sex: 1 | 2;
  look: Look;
  supers: string;
  parent: string;
  liege: string;
  weapon: string;
  horse: string;
  book: string;
  hpBonus: number;
}

const hash = (s: string) => {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.codePointAt(0)!, 16777619);
  return h >>> 0;
};

function genericSet(role: string, sex: number, soldiers: number[], name: string): number {
  if (role === 'b') return 80;
  if (sex === 2) return 43;
  if (role === 's' || role === 'c' || role === 'e') return 42;
  const h = hash(name);
  const first = soldiers[0];
  const pools: Record<number, number[]> = {
    0: [38, 39, 39, 41], 1: [38, 37, 40], 2: [37, 37, 40], 3: [37, 40, 39], 4: [41, 40, 41], 5: [41, 40], 6: [41], 7: [38], 8: [38, 40],
  };
  const pool = role === 'l' ? [38, 38, 39] : pools[first] ?? [37];
  return pool[h % pool.length];
}

function parseRoster(): Person[] {
  const lines = ROSTER.split('\n').map((l) => l.trim()).filter(Boolean);
  return lines.map((line, i) => {
    const t = line.split(/\s+/);
    const [name, s, n, j, r, role, sol, b, d, home] = t;
    const rest = t.slice(10);
    let set = 0;
    let code: string | undefined;
    const kv: Record<string, string> = {};
    rest.forEach((x, k) => {
      if (x.includes('=')) {
        const [a, v] = x.split('=');
        kv[a] = v;
      } else if (k === 0) set = x === '.' ? 0 : parseInt(x, 10);
      else code = x;
    });
    const soldiers = sol.length === 1 ? Array(8).fill(+sol) : [...Array(4).fill(+sol[0]), ...Array(4).fill(+sol[1])];
    const sex = (kv.sx === '2' ? 2 : 1) as 1 | 2;
    const p: Person = {
      no: i + 1, name, str: +s, int: +n, justice: +j, rank: +r, role, soldiers, born: +b, died: +d, home,
      set: set || genericSet(role, sex, soldiers, name), sex,
      look: lookOf({ role, sex, str: +s, int: +n, justice: +j, born: +b, died: +d, code }),
      supers: kv.sa ?? '', parent: kv.p ?? '', liege: kv.l ?? '',
      weapon: kv.w && WEAPON_NAMES.includes(kv.w) ? kv.w : '',
      horse: kv.h && HORSE_NAMES.includes(kv.h) ? kv.h : '',
      book: kv.b && BOOK_NAMES.includes(kv.b) ? kv.b : '',
      hpBonus: +(kv.hp ?? 0),
    };
    return p;
  });
}

export const PEOPLE: Person[] = parseRoster();
const BY_NAME = new Map(PEOPLE.map((p) => [p.name, p]));

const alive = (p: Person, year: number) => p.born + 14 <= year && year <= p.died;

// ------------------------------------------------------------------ scenarios
interface Placement { city: string; free: boolean }
interface Built {
  place: Map<string, Placement>[]; // per scenario (index 0..6)
  problems: string[];
}

function buildScenarios(): Built {
  const problems: string[] = [];
  const place: Map<string, Placement>[] = [];
  SCENARIOS.forEach((sc, si) => {
    const m = new Map<string, Placement>();
    const hidden = new Set(sc.hidden ?? []);
    for (const n of sc.nations) {
      if (!BY_NAME.has(n.lord)) problems.push(`S${si + 1}: unknown lord ${n.lord}`);
      const cities = Object.entries(n.cities);
      let lordPlaced = false;
      for (const [city, names] of cities) {
        if (!CITY.has(city)) problems.push(`S${si + 1}: unknown city ${city}`);
        for (const g of names.split(/\s+/).filter(Boolean)) {
          const p = BY_NAME.get(g);
          if (!p) { problems.push(`S${si + 1}: unknown general ${g}`); continue; }
          if (m.has(g)) problems.push(`S${si + 1}: ${g} placed twice`);
          if (!alive(p, sc.year)) problems.push(`S${si + 1}: ${g} not alive/of age in ${sc.year}`);
          if (hidden.has(g)) problems.push(`S${si + 1}: ${g} is hidden but placed`);
          m.set(g, { city, free: false });
          if (g === n.lord) lordPlaced = true;
        }
      }
      if (!lordPlaced && cities.length) m.set(n.lord, { city: cities[0][0], free: false });
    }
    for (const [g, c] of Object.entries(sc.free ?? {})) {
      if (!BY_NAME.has(g)) problems.push(`S${si + 1}: unknown free ${g}`);
      if (!CITY.has(c)) problems.push(`S${si + 1}: unknown free city ${c}`);
    }
    for (const p of PEOPLE) {
      if (m.has(p.name) || hidden.has(p.name) || !alive(p, sc.year)) continue;
      m.set(p.name, { city: sc.free?.[p.name] ?? p.home, free: true });
    }
    place.push(m);
  });
  for (const p of PEOPLE) if (!CITY.has(p.home)) problems.push(`home city of ${p.name}: ${p.home}`);
  for (const p of PEOPLE) if (!place.some((m) => m.has(p.name))) problems.push(`${p.name} never appears`);
  return { place, problems };
}

export const BUILT = buildScenarios();

// ------------------------------------------------------------------ sections
const S = (v: number | string) => String(v);

function generalSections(): IniSection[] {
  return PEOPLE.map((p) => {
    const h = hash(p.name);
    return {
      _: 'GENERAL', No: S(p.no), Name: p.name, Strength: S(p.str), Intelligence: S(p.int),
      HP: S(Math.min(250, 70 + Math.round(p.str / 6) + p.rank + p.hpBonus)),
      MP: S(Math.min(51, 35 + Math.round(p.int / 7))),
      Justice: S(p.justice), Morale: S(Math.min(85, 65 + Math.round((p.str * 0.6 + p.int * 0.4) / 5))),
      Personality: S(1 + (h % 149)), RParent: p.parent, RLord: p.liege, Portrait: S(p.no),
      Book: p.book, Horse: p.horse, Weapon: p.weapon,
      WeaponType: S(weaponTypeOf(p.set)), BFAI: '11', BFShape: S(p.set), SuperAttack: p.supers,
      SoldierType: p.soldiers.join(','), Rank: S(p.rank), Sex: S(p.sex),
    };
  });
}

function appearSections(): IniSection[] {
  return PEOPLE.map((p) => {
    const s: IniSection = { _: 'ITEM', Name: p.name };
    for (let i = 0; i < 7; i++) {
      const a = BUILT.place[i]?.get(p.name);
      s[`City${i + 1}`] = a ? (a.free ? `${a.city},野` : a.city) : '';
    }
    return s;
  });
}

function nationSections(): IniSection[] {
  const out: IniSection[] = [];
  SCENARIOS.forEach((sc, si) => {
    const lords = sc.nations.map((n) => n.lord);
    const fr = (a: string, b: string) => sc.friends?.[`${a}|${b}`] ?? sc.friends?.[`${b}|${a}`] ?? 50;
    sc.nations.forEach((n, i) => {
      out.push({
        _: `NATION${(si + 1) * 100 + i + 1}`, Lord: n.lord, Flag: S(n.flag), BGM: S(n.bgm),
        Friendship: lords.filter((l) => l !== n.lord).flatMap((l) => [l, S(fr(n.lord, l))]).join(','),
      });
    });
  });
  return out;
}

const REMOTE = new Set(['凉州', '交州']);
function citySections(si: number): IniSection[] {
  const sc = SCENARIOS[si];
  const owner = new Map<string, string>();
  for (const n of sc.nations) for (const c of Object.keys(n.cities)) owner.set(c, n.lord);
  const s = si + 1;
  return CITIES.map((c) => {
    const lord = owner.get(c.name) ?? '';
    const base = { 1: 250000, 2: 160000, 3: 85000, 4: 18000 }[c.size];
    const vary = 0.85 + (hash(c.name) % 31) / 100;
    const region = REMOTE.has(c.region) || ['越嶲', '牂牁', '建宁', '建安'].includes(c.name) ? 0.7 : 1;
    // the north was ravaged early on; the south grew through the era
    const era = c.region === '扬州' || c.region === '益州' || c.region === '荆州' ? 0.85 + 0.06 * s : 1.05 - 0.02 * s;
    const people = Math.round((base * vary * region * era) / 500) * 500;
    const big = c.size === 1 ? 300 : c.size === 2 ? 180 : c.size === 3 ? 80 : 20;
    return {
      _: 'ITEM', Name: c.name, Lord: lord, People: S(people),
      Money: S(lord ? 300 + 100 * s + big : 100 + big / 2),
      Development: S(lord ? 100 + 25 * (s - 1) + Math.round(big / 3) : 60 + 10 * s),
      ReserveForce: S(lord ? (c.size === 4 ? 500 : 1000 + (4 - c.size) * 500) : 0),
    };
  });
}

const EMPERORS: { name: string; look: Look }[] = [
  { name: '灵帝', look: { sex: 1, age: 'adult', build: 'stout', role: 'emperor', beard: 'short', face: 'gentle', skin: 'pale', hat: 'crown' } },
  { name: '少帝', look: { sex: 1, age: 'young', build: 'slim', role: 'emperor', beard: 'none', face: 'gentle', skin: 'pale', hat: 'crown' } },
  { name: '献帝', look: { sex: 1, age: 'young', build: 'slim', role: 'emperor', beard: 'stubble', face: 'noble', skin: 'pale', hat: 'crown' } },
  { name: '魏明帝', look: { sex: 1, age: 'adult', build: 'normal', role: 'emperor', beard: 'short', face: 'stern', skin: 'normal', hat: 'crown' } },
];

function gameSections(): IniSection[] {
  const emp: IniSection = { _: 'EMPEROR', Count: S(EMPERORS.length) };
  EMPERORS.forEach((e, i) => {
    emp[`Name0${i + 1}`] = e.name;
    emp[`Shape0${i + 1}`] = `Portrait\\Emperor0${i + 1}`;
  });
  return [emp, ...SCENARIOS.map((sc, i) => ({
    _: `Age0${i + 1}`, Year: S(sc.year), Month: S(sc.month), Emperor: S(sc.emperor), EmperorCity: sc.emperorCity,
  }))];
}

function newGeneralSections(): IniSection[] {
  return templates().map((t) => ({
    _: 'ITEM', Shape: t.frame.replace(/^(.)face/, (_m, c: string) => `${c}Face`), Justice: S(t.justice), Morale: S(t.morale),
    Personality: S(1 + (hash(t.frame) % 149)), WeaponType: S(weaponTypeOf(t.set)), BFShape: S(t.set), Rank: S(t.rank),
    SuperAttack: '', Token: t.tokens.join(','), Book: '', Horse: '', Weapon: '',
  }));
}

function textSections(): IniSection[] {
  const strings = [
    '1,城', '2,城名：', '3,君主：', '4,太守：', '5,军师：', '6,在朝武将：', '7,在野武将：',
    ...SCENARIOS.map((sc, i) => `${400 + i},${sc.name}`),
    '410,女', '411,男', '420,君主', '421,等级', '500,三国墨英传', '501,© 三国墨英传 · 程序生成',
  ];
  return [{ _: 'STRING', String: strings }];
}

function eventItemSections(): IniSection[] {
  // Rewards for event battles (unused by the runtime; kept for completeness).
  const pick = (names: readonly string[], n: number) => names.slice(Math.max(0, names.length - n));
  return [
    { _: 'Event', Count: S(pick(WEAPON_NAMES, 6).length), Item: [...pick(WEAPON_NAMES, 6)] },
    { _: 'Event', Count: S(pick(HORSE_NAMES, 3).length + pick(BOOK_NAMES, 2).length), Item: [...pick(HORSE_NAMES, 3), ...pick(BOOK_NAMES, 2)] },
  ];
}

let cache: Record<string, IniSection[]> | null = null;
export function files(): Record<string, IniSection[]> {
  if (cache) return cache;
  if (BUILT.problems.length) console.warn(`[people] ${BUILT.problems.length} problems:\n  ${BUILT.problems.join('\n  ')}`);
  const out: Record<string, IniSection[]> = {
    General01: generalSections(),
    General02: appearSections(),
    Nation: nationSections(),
    Game: gameSections(),
    NewGeneral: newGeneralSections(),
    Dialogue: dialogueSections(),
    Text: textSections(),
    EventItem: eventItemSections(),
    ...eventFiles(),
  };
  for (let i = 0; i < 7; i++) out[`City0${i + 1}`] = citySections(i);
  cache = out;
  return out;
}

// ------------------------------------------------------------------ portraits
export const PORTRAITS: PortraitSlot[] = [
  ...PEOPLE.map((p) => ({ frame: `portrait${String(p.no).padStart(3, '0')}`, name: p.name, look: p.look })),
  ...EMPERORS.map((e, i) => ({ frame: `emperor0${i + 1}`, name: e.name, look: e.look })),
  ...templates().map((t) => ({ frame: t.frame, name: t.name, look: t.look })),
];

