// 自创武将: player-made generals (kept across campaigns, like the original
// NewGeneral.sav). They are injected into the static DB as extra GeneralDefs
// (ids after the original 421) and appear as free generals in new games.
import { db, type GeneralDef } from '../data/db';
import { storageKey } from '../engine/assets';

export interface CustomGeneral {
  name: string;
  sex: 1 | 2;
  template: number; // index into NewGeneral.ini
  str: number;
  int: number;
  hp: number;
  mp: number;
  city: string; // starting city ('' = random)
}

const KEY = storageKey('custom');
export const MAX_CUSTOM = 20;

export function listCustom(): CustomGeneral[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as CustomGeneral[];
  } catch {
    return [];
  }
}

export function saveCustom(list: CustomGeneral[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX_CUSTOM)));
  } catch {
    /* ignore */
  }
}

export interface Template {
  shape: string; // e.g. mface001
  sex: 1 | 2;
  justice: number;
  morale: number;
  personality: number;
  weaponType: number;
  bfShape: number;
  rank: number;
  tokens: number[];
}

export function templates(): Template[] {
  return (db.raw.NewGeneral ?? [])
    .filter((s) => s._ === 'ITEM')
    .map((s) => {
      const shape = String(s.Shape ?? '').toLowerCase();
      return {
        shape, sex: shape.startsWith('w') ? 2 : 1,
        justice: +String(s.Justice ?? 60), morale: +String(s.Morale ?? 70), personality: +String(s.Personality ?? 50),
        weaponType: +String(s.WeaponType ?? 1), bfShape: +String(s.BFShape ?? 37), rank: +String(s.Rank ?? 1),
        tokens: String(s.Token ?? '0').split(',').map(Number).filter((n) => Number.isFinite(n)),
      } as Template;
    });
}

let baseCount = -1;

/** Builds GeneralDefs for the custom generals and appends them to db (replacing earlier injections). */
export function injectCustom(list: CustomGeneral[], scenario?: number): GeneralDef[] {
  if (baseCount < 0) baseCount = db.generals.length;
  for (const g of db.generals.splice(baseCount)) db.generalByName.delete(g.name);
  const tpl = templates();
  const cities = db.cities.filter((c) => !c.isPass);
  const defs = list.map((c, i) => {
    const t = tpl[c.template] ?? tpl[0];
    const st = t.tokens.length ? t.tokens : [0];
    const city = c.city || cities[Math.floor(Math.random() * cities.length)].name;
    const d: GeneralDef = {
      id: baseCount + i + 1, name: c.name, str: c.str, int: c.int, hp: c.hp, mp: c.mp,
      justice: t.justice, morale: t.morale, personality: t.personality, parent: '', lord: '',
      portrait: 0, portraitName: t.shape, book: '', horse: '', weapon: '', weaponType: t.weaponType,
      bfai: 11, bfShape: t.bfShape, superAttack: '',
      soldierTypes: Array.from({ length: 8 }, (_, k) => st[Math.min(st.length - 1, Math.floor(k / 4))]),
      rank: t.rank, sex: c.sex,
      appear: scenario ? { [scenario]: { city, free: true } } : {},
    };
    return d;
  });
  for (const d of defs) {
    db.generals.push(d);
    db.generalByName.set(d.name, d);
  }
  return defs;
}

/** Re-injects saved custom GeneralDefs (from a save game). */
export function restoreCustomDefs(defs: GeneralDef[]) {
  if (baseCount < 0) baseCount = db.generals.length;
  for (const g of db.generals.splice(baseCount)) db.generalByName.delete(g.name);
  for (const d of defs) {
    db.generals.push(d);
    db.generalByName.set(d.name, d);
  }
}

export function customDefsInDb(): GeneralDef[] {
  return baseCount < 0 ? [] : db.generals.slice(baseCount);
}
