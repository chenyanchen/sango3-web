// Portrait looks: a 6-letter code per general (age build beard face skin hat,
// '.' = derived from role and abilities), and the 自创武将 face templates.
import type { Look } from '../../types.ts';

const AGE: Record<string, Look['age']> = { y: 'young', a: 'adult', o: 'old' };
const BUILD: Record<string, Look['build']> = { s: 'slim', n: 'normal', t: 'stout' };
const BEARD: Record<string, Look['beard']> = { n: 'none', z: 'stubble', s: 'short', l: 'long', f: 'full' };
const FACE: Record<string, Look['face']> = { g: 'gentle', s: 'stern', f: 'fierce', c: 'cunning', n: 'noble' };
const SKIN: Record<string, NonNullable<Look['skin']>> = { p: 'pale', n: 'normal', r: 'ruddy', d: 'dark' };
const HAT: Record<string, NonNullable<Look['hat']>> = { h: 'helmet', c: 'crown', g: 'guan', s: 'scarf', b: 'headband', n: 'none' };
const ROLE: Record<string, Look['role']> = { l: 'lord', w: 'warrior', s: 'strategist', c: 'scholar', b: 'barbarian', f: 'beauty', e: 'eunuch' };

export interface LookInput {
  role: string; // roster role letter
  sex: 1 | 2;
  str: number;
  int: number;
  justice: number;
  born: number;
  died: number;
  code?: string;
}

/** Derives a Look; explicit code letters win over the defaults. */
export function lookOf(p: LookInput): Look {
  const role = ROLE[p.role] ?? 'warrior';
  const female = p.sex === 2;
  const span = p.died - p.born;
  const d: Look = {
    sex: p.sex,
    age: female ? 'young' : span > 60 && p.born < 160 ? 'old' : 'adult',
    build: female ? 'slim' : p.str >= 88 ? 'stout' : p.int >= 85 && p.str < 50 ? 'slim' : 'normal',
    role: female && role === 'warrior' ? 'warrior' : role,
    beard: female || role === 'eunuch' ? 'none' : role === 'warrior' ? (p.str >= 85 ? 'full' : 'short') : role === 'barbarian' ? 'full' : 'long',
    face: female ? 'gentle' : p.str >= 88 ? 'fierce' : p.justice < 30 ? 'cunning' : role === 'lord' ? 'noble' : p.int >= 80 ? 'gentle' : 'stern',
    skin: role === 'barbarian' ? 'dark' : female || (role === 'scholar' && p.str < 30) ? 'pale' : 'normal',
    hat: role === 'warrior' ? (female ? 'none' : 'helmet') : role === 'lord' ? 'crown' : role === 'strategist' ? 'scarf' : role === 'barbarian' ? 'headband' : female ? 'none' : 'guan',
  };
  const c = p.code ?? '';
  const pick = <T,>(i: number, m: Record<string, T>, cur: T): T => (c[i] && c[i] !== '.' && m[c[i]] !== undefined ? m[c[i]] : cur);
  return {
    ...d,
    age: pick(0, AGE, d.age),
    build: pick(1, BUILD, d.build),
    beard: female ? 'none' : pick(2, BEARD, d.beard),
    face: pick(3, FACE, d.face),
    skin: pick(4, SKIN, d.skin),
    hat: pick(5, HAT, d.hat),
  };
}

// ------------------------------------------------------------------ 自创武将 templates
// One per face frame (mface001..050, wface001..040), each with its own look and
// battle archetype. [look code, role, set, weaponType-from-set, tokens, justice, morale, rank]
export interface Template {
  frame: string;
  name: string;
  look: Look;
  set: number;
  tokens: number[];
  justice: number;
  morale: number;
  rank: number;
}

const MALE_ARCH: [string, string, number, number[]][] = [
  // [look, role, set, soldier tokens]
  ['ynzgnh', 'w', 37, [2, 3]], ['anssnh', 'w', 39, [0, 3]], ['atffnh', 'w', 41, [0, 4]], ['anlgng', 'c', 42, [1, 8]],
  ['yszgps', 's', 42, [1, 8]], ['anfsrb', 'w', 40, [2, 4]], ['onlsnh', 'w', 39, [1, 3]], ['ynznph', 'w', 37, [3, 2]],
  ['atffdn', 'w', 41, [4, 0]], ['anscpg', 's', 38, [8, 1]], ['onlgns', 'c', 42, [1, 1]], ['ansfnb', 'w', 38, [0, 3]],
  ['ynngnh', 'w', 38, [0, 2]], ['anssdh', 'w', 40, [2, 8]], ['atfsrh', 'w', 39, [3, 4]], ['aslcpg', 's', 42, [8, 8]],
  ['ynzfnb', 'w', 40, [4, 3]], ['onfsnh', 'w', 37, [2, 2]], ['ansgns', 's', 38, [1, 0]], ['anffdb', 'b', 80, [5, 6]],
  ['ynssnh', 'w', 37, [3, 3]], ['atlsnh', 'w', 39, [0, 2]], ['anlnpg', 'c', 42, [1, 8]], ['ynzcnh', 'w', 38, [1, 3]],
  ['otffnh', 'w', 41, [4, 4]], ['anzfdh', 'w', 40, [2, 3]], ['yszgpg', 's', 42, [8, 1]], ['ansnnh', 'w', 37, [3, 8]],
  ['atfcnb', 'b', 81, [5, 5]], ['onlcng', 's', 42, [1, 1]], ['ynzsnh', 'w', 39, [0, 0]], ['anfsnn', 'w', 41, [4, 2]],
  ['ansgnh', 'w', 38, [2, 1]], ['ynnnps', 's', 42, [8, 3]], ['atffrh', 'w', 40, [3, 4]], ['anlsnh', 'w', 37, [2, 3]],
  ['ynzgpb', 'w', 38, [0, 7]], ['onlgng', 'c', 42, [1, 2]], ['anffnh', 'b', 82, [3, 5]], ['ansc.h', 'w', 37, [8, 2]],
  ['ytzfnh', 'w', 41, [4, 0]], ['anscng', 's', 38, [1, 3]], ['ynsnnh', 'w', 39, [3, 2]], ['atlfnh', 'w', 40, [2, 4]],
  ['aszgpg', 'c', 42, [8, 0]], ['anfsdb', 'w', 41, [0, 5]], ['ynzgnn', 'w', 37, [3, 1]], ['onlcnh', 'w', 39, [2, 3]],
  ['anssph', 'w', 38, [0, 8]], ['ynnfnh', 'w', 40, [3, 3]],
];
const FEMALE_ARCH: [string, string, number, number[]][] = [
  ['ysnnpn', 'f', 43, [7, 1]], ['ynnnph', 'w', 43, [7, 3]], ['ysngpn', 'f', 43, [7, 8]], ['ynnfph', 'w', 43, [7, 2]],
  ['ysnnpn', 'f', 43, [7, 1]], ['annfdb', 'b', 83, [7, 5]], ['ynngpn', 'f', 43, [7, 7]], ['ynnsnh', 'w', 43, [7, 0]],
];

export function templates(): Template[] {
  const out: Template[] = [];
  for (let i = 0; i < 50; i++) {
    const [code, role, set, tokens] = MALE_ARCH[i % MALE_ARCH.length];
    const str = role === 'w' || role === 'b' ? 80 : 40;
    out.push({
      frame: `mface${String(i + 1).padStart(3, '0')}`, name: `自创武将·男${i + 1}`,
      look: lookOf({ role, sex: 1, str, int: 100 - str, justice: 40 + ((i * 37) % 55), born: 170, died: 230, code }),
      set, tokens, justice: 40 + ((i * 37) % 55), morale: 65 + ((i * 13) % 21), rank: 1 + ((i * 7) % 5),
    });
  }
  for (let i = 0; i < 40; i++) {
    const [code, role, set, tokens] = FEMALE_ARCH[i % FEMALE_ARCH.length];
    const str = role === 'w' || role === 'b' ? 72 : 30;
    out.push({
      frame: `wface${String(i + 1).padStart(3, '0')}`, name: `自创武将·女${i + 1}`,
      look: lookOf({ role, sex: 2, str, int: 100 - str, justice: 50 + ((i * 29) % 45), born: 180, died: 240, code }),
      set, tokens, justice: 50 + ((i * 29) % 45), morale: 65 + ((i * 11) % 21), rank: 1 + ((i * 5) % 5),
    });
  }
  return out;
}
