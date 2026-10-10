// Save slots in localStorage (JSON). Slot 0 is the autosave.
import { G, setState, type GameState } from './state';

export const SLOTS = 10;
const key = (i: number) => `sg3.save.${i}`;

export interface SaveInfo {
  slot: number;
  time: number;
  year: number;
  month: number;
  lord: string;
  cities: number;
  scenario: number;
}

export function listSaves(): (SaveInfo | null)[] {
  const out: (SaveInfo | null)[] = [];
  for (let i = 0; i < SLOTS; i++) {
    try {
      const v = localStorage.getItem(key(i) + '.info');
      out.push(v ? (JSON.parse(v) as SaveInfo) : null);
    } catch {
      out.push(null);
    }
  }
  return out;
}

export function saveGame(slot: number): boolean {
  try {
    const n = G.nations.find((x) => x.id === G.player);
    const info: SaveInfo = {
      slot, time: Date.now(), year: G.year, month: G.month, lord: n?.name ?? '',
      cities: G.cities.filter((c) => c.owner === G.player).length, scenario: G.scenario,
    };
    localStorage.setItem(key(slot), JSON.stringify(G));
    localStorage.setItem(key(slot) + '.info', JSON.stringify(info));
    return true;
  } catch (e) {
    console.error('save failed', e);
    return false;
  }
}

export function loadGame(slot: number): boolean {
  try {
    const v = localStorage.getItem(key(slot));
    if (!v) return false;
    const s = JSON.parse(v) as GameState;
    if (s.version !== 1) return false;
    setState(s);
    return true;
  } catch (e) {
    console.error('load failed', e);
    return false;
  }
}

export function hasAnySave() {
  return listSaves().some(Boolean);
}
