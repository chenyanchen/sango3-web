// 武将技: a data-driven effect system. The original behaviour lives in
// compiled scripts (BFMagic.so) we can't run, so every one of the 125 skills
// is mapped to an archetype (arrow rain, strikes, rolling objects, charging
// runners, dragons, novas, summons, heals...) with a magnitude, using the
// original magic sprites (Things.obd 40000+) and sounds (Sound/mNNNsndXX).
import { db, type BFMagicDef } from '../../data/db';
import { sfx } from '../../engine/audio';
import { rng } from '../../engine/rng';
import { G } from '../../game/state';
import { obj, type FxItem, type FxOpts } from './fx';
import { skillAllowed, skillBoost, skillGeneralDamage, skillSoldierDamage, TICKS_PER_SEC, type SkillCtx } from './rules';
import { FIELD_BOT, FIELD_MID, FIELD_TOP, W, type General, type Unit, type World } from './world';

export interface SkillInfo {
  id: number;
  name: string;
  mp: number;
  spec: string;
  ok: boolean;
  reason: string;
}

// ------------------------------------------------------------------ archetypes
type Spec =
  | { k: 'rain'; kind: 'arrow' | 'firearrow' | 'sword' | 'rock' | 'firerock' | 'cannon' | 'bigcannon'; n: number; r?: number }
  | { k: 'strike'; kind: 'thunder' | 'ice' | 'spike' | 'stone' | 'water' | 'mine' | 'fire' | 'taiji' | 'pillar' | 'bagua'; n: number; r?: number }
  | { k: 'roll'; kind: 'wheel' | 'snow' | 'boulder'; n: number }
  | { k: 'run'; kind: 'spikes' | 'firewall' | 'bull' | 'leopard' | 'tiger' | 'elephant' | 'ram' | 'car' | 'spear' | 'cavalry' | 'beast' | 'tower' | 'crescent' | 'clone' | 'holy' | 'bolt' | 'arrowline'; n: number; both?: boolean }
  | { k: 'dragon'; kind: 'fire' | 'gold' | 'sky'; n: number }
  | { k: 'nova'; kind: 'fire' | 'lantern' | 'heart' | 'swordwheel' | 'sworddance'; n: number }
  | { k: 'ring'; n: number }
  | { k: 'single'; kind: 'knives' | 'moonbow' | 'sunbow' | 'halberd' | 'thunder5' | 'thunderball' | 'stone' }
  | { k: 'heal'; big: boolean }
  | { k: 'reinforce'; n: number; rear: boolean }
  | { k: 'summon'; lv: number; n: number }
  | { k: 'lock' }
  | { k: 'vortex'; kind: 'wind' | 'hole'; n: number }
  | { k: 'quake'; kind: 'rocks' | 'mega' | 'ghost' | 'nuke'; n: number }
  | { k: 'glider'; n: number };

const SPECS: Record<number, Spec> = {
  1: { k: 'rain', kind: 'arrow', n: 46 },
  2: { k: 'run', kind: 'spikes', n: 3 },
  3: { k: 'strike', kind: 'water', n: 9 },
  4: { k: 'heal', big: false },
  5: { k: 'strike', kind: 'fire', n: 10 },
  6: { k: 'roll', kind: 'wheel', n: 3 },
  7: { k: 'roll', kind: 'snow', n: 3 },
  8: { k: 'single', kind: 'knives' },
  9: { k: 'strike', kind: 'mine', n: 9 },
  10: { k: 'strike', kind: 'thunder', n: 9 },
  11: { k: 'dragon', kind: 'fire', n: 1 },
  12: { k: 'reinforce', n: 10, rear: true },
  13: { k: 'single', kind: 'moonbow' },
  14: { k: 'run', kind: 'bolt', n: 3 },
  15: { k: 'summon', lv: 1, n: 4 },
  16: { k: 'rain', kind: 'firearrow', n: 50 },
  17: { k: 'run', kind: 'spikes', n: 6, both: true },
  18: { k: 'strike', kind: 'water', n: 15 },
  19: { k: 'strike', kind: 'fire', n: 16 },
  20: { k: 'roll', kind: 'wheel', n: 5 },
  21: { k: 'roll', kind: 'snow', n: 5 },
  22: { k: 'strike', kind: 'mine', n: 15 },
  23: { k: 'strike', kind: 'thunder', n: 15 },
  24: { k: 'dragon', kind: 'fire', n: 2 },
  25: { k: 'reinforce', n: 16, rear: true },
  26: { k: 'run', kind: 'bolt', n: 5 },
  27: { k: 'summon', lv: 2, n: 5 },
  28: { k: 'run', kind: 'car', n: 1 },
  29: { k: 'rain', kind: 'firearrow', n: 80 },
  30: { k: 'run', kind: 'spikes', n: 10, both: true },
  31: { k: 'strike', kind: 'water', n: 22 },
  32: { k: 'strike', kind: 'fire', n: 24 },
  33: { k: 'roll', kind: 'wheel', n: 7 },
  34: { k: 'roll', kind: 'snow', n: 7 },
  35: { k: 'run', kind: 'firewall', n: 2 },
  36: { k: 'strike', kind: 'mine', n: 22 },
  37: { k: 'strike', kind: 'thunder', n: 24 },
  38: { k: 'dragon', kind: 'fire', n: 3 },
  39: { k: 'reinforce', n: 22, rear: true },
  40: { k: 'run', kind: 'bolt', n: 7 },
  41: { k: 'summon', lv: 2, n: 8 },
  42: { k: 'run', kind: 'car', n: 4 },
  43: { k: 'dragon', kind: 'fire', n: 4 },
  44: { k: 'run', kind: 'spear', n: 9 },
  45: { k: 'run', kind: 'firewall', n: 3 },
  46: { k: 'dragon', kind: 'gold', n: 1 },
  47: { k: 'single', kind: 'thunder5' },
  48: { k: 'dragon', kind: 'fire', n: 5 },
  49: { k: 'quake', kind: 'rocks', n: 22 },
  50: { k: 'single', kind: 'thunderball' },
  51: { k: 'quake', kind: 'mega', n: 30 },
  52: { k: 'quake', kind: 'rocks', n: 34 },
  53: { k: 'single', kind: 'stone' },
  54: { k: 'strike', kind: 'ice', n: 9 },
  55: { k: 'vortex', kind: 'wind', n: 1 },
  56: { k: 'nova', kind: 'fire', n: 8 },
  57: { k: 'single', kind: 'halberd' },
  58: { k: 'roll', kind: 'boulder', n: 3 },
  59: { k: 'strike', kind: 'taiji', n: 5, r: 80 },
  60: { k: 'rain', kind: 'rock', n: 12, r: 55 },
  61: { k: 'rain', kind: 'sword', n: 12 },
  62: { k: 'strike', kind: 'spike', n: 11 },
  63: { k: 'run', kind: 'arrowline', n: 1 },
  64: { k: 'reinforce', n: 10, rear: false },
  65: { k: 'run', kind: 'leopard', n: 6 },
  66: { k: 'rain', kind: 'cannon', n: 8, r: 60 },
  67: { k: 'run', kind: 'bull', n: 7 },
  68: { k: 'glider', n: 3 },
  69: { k: 'nova', kind: 'lantern', n: 8 },
  70: { k: 'single', kind: 'sunbow' },
  71: { k: 'run', kind: 'crescent', n: 1 },
  72: { k: 'ring', n: 8 },
  73: { k: 'strike', kind: 'ice', n: 16 },
  74: { k: 'vortex', kind: 'wind', n: 2 },
  75: { k: 'nova', kind: 'fire', n: 16 },
  76: { k: 'reinforce', n: 16, rear: false },
  77: { k: 'run', kind: 'ram', n: 3 },
  78: { k: 'lock' },
  79: { k: 'run', kind: 'beast', n: 3 },
  80: { k: 'strike', kind: 'taiji', n: 9, r: 80 },
  81: { k: 'vortex', kind: 'hole', n: 1 },
  82: { k: 'strike', kind: 'spike', n: 20 },
  83: { k: 'rain', kind: 'cannon', n: 13, r: 60 },
  84: { k: 'roll', kind: 'boulder', n: 5 },
  85: { k: 'heal', big: true },
  86: { k: 'run', kind: 'tower', n: 2 },
  87: { k: 'nova', kind: 'lantern', n: 12 },
  88: { k: 'rain', kind: 'sword', n: 20 },
  89: { k: 'glider', n: 5 },
  90: { k: 'run', kind: 'bull', n: 12 },
  91: { k: 'run', kind: 'tiger', n: 8 },
  92: { k: 'rain', kind: 'firerock', n: 14, r: 60 },
  93: { k: 'nova', kind: 'heart', n: 10 },
  94: { k: 'run', kind: 'crescent', n: 3 },
  95: { k: 'ring', n: 12 },
  96: { k: 'strike', kind: 'ice', n: 24 },
  97: { k: 'roll', kind: 'boulder', n: 7 },
  98: { k: 'strike', kind: 'spike', n: 30 },
  99: { k: 'run', kind: 'ram', n: 6 },
  100: { k: 'run', kind: 'beast', n: 6 },
  101: { k: 'run', kind: 'clone', n: 5 },
  102: { k: 'strike', kind: 'bagua', n: 8, r: 90 },
  103: { k: 'rain', kind: 'sword', n: 28 },
  104: { k: 'run', kind: 'tower', n: 4 },
  105: { k: 'rain', kind: 'bigcannon', n: 18, r: 70 },
  106: { k: 'run', kind: 'holy', n: 3 },
  107: { k: 'vortex', kind: 'wind', n: 3 },
  108: { k: 'run', kind: 'bull', n: 18 },
  109: { k: 'nova', kind: 'sworddance', n: 14 },
  110: { k: 'vortex', kind: 'hole', n: 2 },
  111: { k: 'run', kind: 'elephant', n: 10 },
  112: { k: 'strike', kind: 'pillar', n: 14, r: 55 },
  113: { k: 'reinforce', n: 22, rear: false },
  114: { k: 'nova', kind: 'lantern', n: 16 },
  115: { k: 'glider', n: 7 },
  116: { k: 'rain', kind: 'firerock', n: 24, r: 60 },
  117: { k: 'run', kind: 'crescent', n: 5 },
  118: { k: 'nova', kind: 'heart', n: 20 },
  119: { k: 'run', kind: 'cavalry', n: 10 },
  120: { k: 'quake', kind: 'ghost', n: 26 },
  121: { k: 'nova', kind: 'swordwheel', n: 8 },
  122: { k: 'run', kind: 'holy', n: 5 },
  123: { k: 'dragon', kind: 'sky', n: 1 },
  124: { k: 'quake', kind: 'nuke', n: 14 },
  125: { k: 'quake', kind: 'ghost', n: 40 },
};

/** Things.obd objects a skill needs (preloaded when the battle starts). */
function specObjects(sp: Spec): number[] {
  switch (sp.k) {
    case 'rain':
      return {
        arrow: [40010, 40016, 40011, 40012, 40013, 40014, 40015],
        firearrow: [40010, 40016, 40011, 40012, 40013, 40014, 40015, 42001, 42002],
        sword: [40620, 40621, 40622, 40623, 42024],
        rock: [40610, 40613, 40611, 40612, 42013, 42026, 42033],
        firerock: [40610, 40613, 40611, 40612, 42014, 42001, 42002, 42033],
        cannon: [40670, 40671, 40674, 40675, 42012, 42033],
        bigcannon: [40670, 40671, 40674, 40675, 42034, 42012, 42033],
      }[sp.kind];
    case 'strike':
      return {
        thunder: [40100, 40101, 40102, 40103, 40104, 40106],
        ice: [40550, 40551, 40552],
        spike: [40630, 42033],
        stone: [40540, 40541, 40542, 40543],
        water: [40030, 40031, 40032],
        mine: [40090, 40092, 40093, 40094, 40095, 42009, 42002],
        fire: [40050, 40051, 40052, 42002],
        taiji: [40600, 40601, 40602],
        pillar: [41170, 41171, 42010],
        bagua: [41071, 41072, 41073, 41074, 41075, 41076, 41077, 41078, 42049, 42011],
      }[sp.kind];
    case 'roll':
      return { wheel: [40060, 40061, 40062, 40063, 40064], snow: [40070, 40071, 40072, 40073], boulder: [40590, 40591, 40592, 40593, 40594] }[sp.kind];
    case 'run':
      return {
        spikes: [40020], firewall: [40350, 42002], bull: [40680, 40681, 42002], leopard: [40660], tiger: [40661], elephant: [40662, 40661],
        ram: [40800, 42033], car: [40280, 40281], spear: [40440, 40441], cavalry: [41200, 41201, 42033], beast: [40820, 40821, 42002, 42009],
        tower: [40900, 40901, 40011, 40012, 40013], crescent: [40720], clone: [41060, 41061], holy: [41120, 41121, 42012], bolt: [40140, 40141],
        arrowline: [40010, 40016],
      }[sp.kind];
    case 'dragon':
      return sp.kind === 'fire' ? [40110, 40111, 40112, 40113, 42002] : sp.kind === 'gold' ? [40460, 40461, 40462, 40463, 40464, 40465, 40467, 42014] : [41270, 40100, 40103, 42012, 42015];
    case 'nova':
      return { fire: [40570, 40571, 42002], lantern: [40700, 42002], heart: [40890, 40891, 42024], swordwheel: [41090, 41091, 42012], sworddance: [41050, 41051, 42024] }[sp.kind];
    case 'ring':
      return [40540, 40541, 40542, 40543];
    case 'single':
      return {
        knives: [31004, 42012], moonbow: [40130, 40131, 42013], sunbow: [40710, 40711, 42012], halberd: [40580, 42015],
        thunder5: [40100, 40101, 40102, 40103, 40104, 40106], thunderball: [40500, 40501, 40502, 40503, 40504, 40106], stone: [40540, 40541, 40542, 40543, 40544],
      }[sp.kind];
    case 'heal':
      return sp.big ? [40042, 40043] : [40040, 40041];
    case 'reinforce':
      return [42033];
    case 'summon':
      return sp.lv === 1 ? [40150, 40151, 42033] : [40152, 40153, 42033];
    case 'lock':
      return [40810, 40811, 40812, 40813, 40814, 40815, 40816, 40817, 42036, 42037, 42038, 42039, 42040, 42041, 42042, 42043, 42078];
    case 'vortex':
      return sp.kind === 'wind' ? [40560, 40561, 40562, 42033] : [40840, 40841, 40842, 40843, 42081, 42095];
    case 'quake':
      return {
        rocks: [40490, 40491, 40492, 40493, 42033, 42014],
        mega: [40490, 40491, 40492, 42034, 42012, 40100, 40103],
        ghost: [40840, 40841, 40842, 42011, 42015, 42019, 40100, 40103],
        nuke: [42034, 42012, 42014, 42033],
      }[sp.kind];
    case 'glider':
      return [40690, 40691, 40090, 42009, 42002];
  }
}

export function skillObjects(generalId: number): number[] {
  const gs = G.generals[generalId - 1];
  if (!gs) return [];
  const out = new Set<number>();
  for (const id of gs.bfMagic) {
    const sp = SPECS[id];
    if (sp) for (const o of specObjects(sp) ?? []) if (db.objects[String(o)]) out.add(o);
  }
  return [...out];
}

export function skillState(w: World, side: 0 | 1, ctx: SkillCtx): SkillInfo[] {
  const g = w.sides[side].gen;
  const gs = G.generals[g.info.gs.id - 1];
  return gs.bfMagic
    .map((id) => db.bfMagic[id - 1])
    .filter(Boolean)
    .map((m) => {
      const allowed = skillAllowed(m, ctx);
      const ok = allowed && g.mp >= m.mp && g.gauge >= 100 && g.alive && g.casting === 0 && !w.sides[side].retreat;
      return { id: m.id, name: m.name, mp: m.mp, spec: m.spec, ok, reason: !allowed ? '无法使用' : g.mp < m.mp ? '技力不足' : '' };
    });
}

// ------------------------------------------------------------------ cast
interface Cast {
  w: World;
  side: 0 | 1;
  g: General;
  E: General;
  m: BFMagicDef;
  dir: 1 | -1;
  dmg: number;
  genDmg: number;
  hitGen: Set<Unit>;
  boost: number;
  /** blue (side 0) / red variants */
  pick: (blue: number, red: number) => number;
  /** flip sprites that face left by default so they face the enemy */
  flip: boolean;
}

export function castSkill(w: World, side: 0 | 1, id: number, ctx: SkillCtx): boolean {
  const S = w.sides[side];
  const g = S.gen;
  const m = db.bfMagic[id - 1];
  if (!m || !g.alive || g.casting > 0 || S.retreat) return false;
  if (g.gauge < 100 || g.mp < m.mp || !skillAllowed(m, ctx)) return false;
  const sp = SPECS[id] ?? { k: 'strike', kind: 'thunder', n: 8 };
  g.gauge = 0;
  g.mp -= m.mp;
  const boost = skillBoost(m, ctx);
  const direct = sp.k === 'single';
  const c: Cast = {
    w, side, g, E: w.sides[side ^ 1].gen, m, dir: S.dir,
    dmg: skillSoldierDamage(m, g.info.gs, boost),
    genDmg: skillGeneralDamage(m, g.info.gs, boost, direct),
    hitGen: new Set(), boost,
    pick: (b, r) => (side === 0 ? b : r),
    flip: S.dir === 1,
  };
  w.onBanner?.(m.name, side === 0 ? 'skill' : 'skill enemy');
  w.fx.dim(0.4, 70);
  w.beginCast(g, () => {
    const eff = run(c, sp);
    if (eff) w.effects.push(eff);
  });
  return true;
}

// ------------------------------------------------------------------ timeline
class TL {
  t = 0;
  private ev: { at: number; fn: () => void }[] = [];
  private every: ((t: number) => void)[] = [];
  constructor(public dur: number) {}
  at(t: number, fn: () => void) {
    this.ev.push({ at: Math.round(t), fn });
    return this;
  }
  each(fn: (t: number) => void) {
    this.every.push(fn);
    return this;
  }
  tick(): boolean {
    for (const e of this.ev) if (e.at === this.t) e.fn();
    for (const f of this.every) f(this.t);
    this.t++;
    return this.t <= this.dur;
  }
}

// ------------------------------------------------------------------ helpers
const SOUNDS = new Set(
  'm000snd01 m002snd00 m003snd00 m004snd00 m005snd01 m005snd02 m006snd01 m006snd02 m007snd01 m007snd02 m008snd00 m009snd01 m010snd01 m010snd02 m011snd01 m011snd02 m011snd03 m013snd01 m015snd01 m015snd02 m035snd01 m035snd02 m046snd01 m047snd01 m049snd01 m050snd01 m054snd01 m055snd01 m056snd01 m057snd01 m058snd01 m060snd01 m062snd01 m062snd02 m063snd01 m064snd00 m065snd01 m067snd01 m067snd02 m068snd01 m068snd02 m070snd01 m072snd01 m080snd01 m081snd01 m082snd01 m084snd01 m089snd01 m089snd02 m105snd01 m105snd02 m105snd03 m107snd01 m107snd02 m109snd01 m117snd01 m117snd02 m117snd03'.split(' '),
);
function snd(c: Cast, dir: number, k: number, x?: number, vol = 1) {
  const n = `m${String(dir).padStart(3, '0')}snd${String(k).padStart(2, '0')}`;
  const name = SOUNDS.has(n) ? n : SOUNDS.has(`m${String(dir).padStart(3, '0')}snd01`) ? `m${String(dir).padStart(3, '0')}snd01` : null;
  if (!name) return;
  if (x === undefined) sfx(name, { volume: vol });
  else c.w.snd(name, x, vol);
}

const tmp: Unit[] = [];
/** n target points sampled from living enemy units (soldiers first). */
function targets(c: Cast, n: number, jitter = 24): { x: number; y: number }[] {
  const es = c.w.enemiesOf(c.side, tmp);
  const out: { x: number; y: number }[] = [];
  if (!es.length) {
    for (let i = 0; i < n; i++) out.push({ x: c.E.x + rng.range(-150, 150), y: rng.range(FIELD_TOP + 20, FIELD_BOT - 20) });
    return out;
  }
  rng.shuffle(es);
  for (let i = 0; i < n; i++) {
    const u = es[i % es.length];
    out.push({ x: u.x + rng.range(-jitter, jitter), y: clampY(u.y + rng.range(-jitter * 0.5, jitter * 0.5)) });
  }
  return out;
}
function clampY(y: number) {
  return Math.max(FIELD_TOP, Math.min(FIELD_BOT, y));
}
/** bounding box of the enemy army */
function enemyBox(c: Cast) {
  const es = c.w.enemiesOf(c.side, tmp);
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const u of es) {
    x0 = Math.min(x0, u.x);
    x1 = Math.max(x1, u.x);
    y0 = Math.min(y0, u.y);
    y1 = Math.max(y1, u.y);
  }
  if (!es.length) {
    x0 = x1 = c.E.x;
    y0 = FIELD_TOP;
    y1 = FIELD_BOT;
  }
  return { x0, x1, y0, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
}
function hit(c: Cast, x: number, y: number, rx: number, ry: number, k = 1, o: { burn?: number; knock?: number; both?: boolean } = {}) {
  return c.w.hitArea(c.side, x, y, rx, ry, c.dmg * k, { ...o, genDmg: c.genDmg, hitGen: c.hitGen });
}
function fx(c: Cast, id: number, anim: string, x: number, y: number, o: FxOpts = {}): FxItem | null {
  return c.w.fx.anim(id, anim, x, y, o);
}
function focus(c: Cast, x: number, t = 60) {
  c.w.focusX = x;
  c.w.focusT = t;
}
function explode(c: Cast, id: number, x: number, y: number, scale = 1, z = 0) {
  fx(c, id, 'wait', x, y + 2, { z, scale, bias: 40 });
}
function debris(c: Cast, ids: number[], x: number, y: number, n: number, power = 6) {
  for (let i = 0; i < n; i++) {
    const id = ids[i % ids.length];
    fx(c, id, 'wait', x, y, { z: 10, vx: rng.range(-3, 3), vy: rng.range(-1, 1), vz: rng.range(power * 0.5, power), g: 0.45, life: rng.int(30, 55), fade: 15, vrot: rng.range(-0.3, 0.3) });
  }
}
function decal(c: Cast, id: number, anim: string, x: number, y: number, life: number) {
  fx(c, id, anim, x, y, { layer: 'under', life, fade: 30 });
}

// ------------------------------------------------------------------ run
function run(c: Cast, sp: Spec): TL | null {
  switch (sp.k) {
    case 'rain': return rain(c, sp);
    case 'strike': return strike(c, sp);
    case 'roll': return roll(c, sp);
    case 'run': return runners(c, sp);
    case 'dragon': return dragon(c, sp);
    case 'nova': return nova(c, sp);
    case 'ring': return ring(c, sp);
    case 'single': return single(c, sp);
    case 'heal': return heal(c, sp);
    case 'reinforce': return reinforce(c, sp);
    case 'summon': return summon(c, sp);
    case 'lock': return lock(c);
    case 'vortex': return vortex(c, sp);
    case 'quake': return quake(c, sp);
    case 'glider': return glider(c, sp);
  }
}

// rain: launchers (archers / catapults / cannons) behind our lines, projectiles fall on the enemy
function rain(c: Cast, sp: Extract<Spec, { k: 'rain' }>): TL {
  const { w, g, dir } = c;
  const tl = new TL(150);
  const pts = targets(c, sp.n, 30);
  const arrows = sp.kind === 'arrow' || sp.kind === 'firearrow';
  const isRock = sp.kind === 'rock' || sp.kind === 'firerock';
  const isCannon = sp.kind === 'cannon' || sp.kind === 'bigcannon';
  const r = sp.r ?? (arrows ? 26 : 34);
  // launchers
  const lx = g.x - dir * 70;
  const nl = arrows ? 8 : isRock || isCannon ? 3 : 0;
  const lid = arrows ? c.pick(40010, 40016) : isRock ? c.pick(40613, 40610) : c.pick(40671, 40670);
  const lanim = arrows ? 'attack' : isRock ? 'cut' : 'shoot';
  for (let i = 0; i < nl; i++) {
    const y = clampY(FIELD_MID + (i - (nl - 1) / 2) * (arrows ? 34 : 90));
    const x = lx - dir * (i % 2) * 40 - dir * (arrows ? 0 : 60);
    const f = fx(c, lid, isCannon ? 'rise' : 'wait', x, y, { flip: c.flip, life: 120, fade: 20 });
    if (f) {
      f.spr!.tint = w.tint;
      tl.at(isCannon ? 18 : 6, () => f.spr?.play(lanim, true));
    }
  }
  if (sp.kind === 'sword') {
    // swords rise spinning above the caster, then fall
    for (let i = 0; i < Math.min(10, sp.n); i++) fx(c, 40620, 'wait', g.x + rng.range(-40, 40), g.y, { z: 120, vz: rng.range(5, 8), life: 30, fade: 10, scale: 0.8 });
    snd(c, 62, 1);
  } else if (arrows) {
    tl.at(14, () => {
      snd(c, 0, 1);
      w.snd('arrows', g.x, 0.9);
      for (let i = 0; i < 24; i++) fx(c, 40011, 'wait', lx + rng.range(-40, 40), FIELD_MID + rng.range(-110, 110), { z: 90, vz: 14, vx: dir * 4, life: 24, flip: c.flip });
    });
  } else if (isRock) {
    tl.at(16, () => w.snd('catapult', lx, 1));
  } else tl.at(20, () => (snd(c, 67, 1), w.snd('gunfire', lx, 1)));
  focus(c, enemyBox(c).cx * 0.5 + c.g.x * 0.5, 110);
  // falling projectiles
  pts.forEach((p, i) => {
    const t0 = (arrows ? 32 : 30) + Math.floor((i / pts.length) * (arrows ? 50 : 70)) + rng.int(0, 6);
    tl.at(t0, () => {
      const H = arrows ? 420 : 520;
      const T = arrows ? 22 : 28;
      const vx = dir * (arrows ? 3 : 5);
      let id = 40012;
      let anim = 'wait';
      const o: FxOpts = { z: H, vz: -H / T, vx, life: T + 1, flip: c.flip };
      if (sp.kind === 'sword') {
        id = 40621;
        anim = 'in';
        o.vx = 0;
        o.flip = false;
        o.life = 40;
        o.vz = -H / 12;
        o.land = true;
      } else if (isRock) {
        id = 40612;
        o.scale = 1.1;
        o.flip = c.flip;
      } else if (isCannon) {
        id = 40675;
        o.flip = c.flip;
      }
      const f = fx(c, id, anim, p.x - vx * T, p.y, o);
      const land = () => {
        if (arrows) {
          decal(c, rng.pick([40013, 40014, 40015])!, 'wait', p.x, p.y, 120);
          if (sp.kind === 'firearrow') {
            fx(c, 42001, 'wait', p.x, p.y, { life: 70, fade: 20, scale: 0.8 });
            hit(c, p.x, p.y, r, r * 0.55, 1, { burn: 90 });
          } else hit(c, p.x, p.y, r, r * 0.55);
          if (i % 6 === 0) w.snd('arrow', p.x, 0.4);
        } else if (sp.kind === 'sword') {
          fx(c, 42024, 'wait', p.x, p.y, { z: 20, life: 20, fade: 15, scale: 2, blend: 'add' });
          hit(c, p.x, p.y, r * 1.4, r * 0.8, 1.15);
          if (i % 3 === 0) snd(c, 62, 2, p.x, 0.6);
        } else {
          explode(c, isRock ? (sp.kind === 'firerock' ? 42014 : 42013) : sp.kind === 'bigcannon' && i % 4 === 0 ? 42034 : 42012, p.x, p.y, sp.kind === 'bigcannon' ? 1.2 : 1);
          if (sp.kind === 'bigcannon' && i % 4 === 0) w.fx.flash(0xffe0a0, 0.35);
          fx(c, 42033, 'wait', p.x, p.y, { life: 40, fade: 30, scale: 1.6, vy: -0.3, alpha: 0.7 });
          hit(c, p.x, p.y, r, r * 0.6, 1.2, { burn: sp.kind === 'firerock' ? 100 : 0, knock: 4 });
          w.fx.shake(sp.kind === 'bigcannon' ? 8 : 5);
          w.snd(i % 2 ? 'explosion' : 'sboom', p.x, 0.7);
        }
      };
      if (f) f.onDone = land;
      else tl.at(t0 + T, land);
    });
  });
  return tl;
}

// strike: effects appearing on top of enemy positions
function strike(c: Cast, sp: Extract<Spec, { k: 'strike' }>): TL {
  const { w } = c;
  const pts = targets(c, sp.n, 26);
  const r = sp.r ?? 42;
  const tl = new TL(160);
  const box = enemyBox(c);
  focus(c, box.cx, 120);
  const step = Math.max(2, Math.floor(90 / sp.n));
  const dirN = { thunder: 10, ice: 55, spike: 63, stone: 54, water: 3, mine: 9, fire: 5, taiji: 60, pillar: 117, bagua: 107 }[sp.kind];
  snd(c, dirN, 1);
  if (sp.kind === 'thunder' || sp.kind === 'bagua') w.fx.dim(0.6, 140);
  pts.forEach((p, i) => {
    const t0 = 6 + i * step + rng.int(0, step);
    tl.at(t0, () => {
      switch (sp.kind) {
        case 'thunder': {
          const b = fx(c, rng.pick([40100, 40101, 40102])!, 'wait', p.x, p.y, { life: 10, scale: 1.1, bias: 100 });
          void b;
          fx(c, 40103, 'wait', p.x, p.y - 10, { life: 24, scale: 0.9, bias: 101 });
          fx(c, 40106, 'wait', p.x, p.y - 30, { life: 16, bias: 102 });
          w.fx.flash(0xc8d8ff, 0.45, 0.12);
          w.fx.shake(5);
          hit(c, p.x, p.y, r, r * 0.6, 1.1);
          if (i % 2 === 0) w.snd(i % 4 ? 'm010snd01' : 'm010snd02', p.x, 0.8);
          break;
        }
        case 'ice':
          for (let k = 0; k < 3; k++) fx(c, 40550, 'wait', p.x + rng.range(-18, 18), p.y + rng.range(-8, 8), { life: 70, fade: 25, scale: rng.range(0.8, 1.2) });
          fx(c, 40551, 'wait', p.x, p.y, { life: 50, fade: 30, scale: 1.4 });
          tl.at(t0 + 8, () => {
            hit(c, p.x, p.y, r, r * 0.6, 1);
            debris(c, [40552], p.x, p.y, 5, 6);
          });
          if (i % 3 === 0) snd(c, 55, 1, p.x, 0.7);
          break;
        case 'spike':
          for (let k = 0; k < 5; k++) {
            const sx = p.x + rng.range(-28, 28);
            const sy = p.y + rng.range(-12, 12);
            const f = fx(c, 40630, 'wait', sx, sy, { life: 60, fade: 0, scale: rng.range(0.7, 1.1) });
            tl.at(t0 + 40, () => f?.spr?.play('over', true));
          }
          hit(c, p.x, p.y, r, r * 0.6, 1);
          if (i % 3 === 0) snd(c, 63, 1, p.x, 0.7);
          break;
        case 'stone':
          fx(c, 40540, 'wait', p.x, p.y, { life: 50, fade: 15 });
          hit(c, p.x, p.y, r, r * 0.6);
          debris(c, [40542, 40543], p.x, p.y, 4, 7);
          break;
        case 'water':
          fx(c, 40030, 'wait', p.x, p.y, { life: 60, fade: 20, scale: 1.1, alpha: 0.9 });
          for (let k = 0; k < 4; k++) fx(c, 40031, 'wait', p.x + rng.range(-20, 20), p.y, { z: rng.range(10, 60), vz: rng.range(1, 3), life: 30, fade: 15 });
          tl.at(t0 + 10, () => hit(c, p.x, p.y, r, r * 0.6, 1, { knock: 3 }));
          if (i % 3 === 0) snd(c, 3, 0, p.x, 0.7);
          break;
        case 'mine': {
          fx(c, 40090, 'wait', p.x, p.y, { life: 26 });
          tl.at(t0 + 26, () => {
            explode(c, 42009, p.x, p.y, 1);
            debris(c, [40092, 40093, 40094, 40095], p.x, p.y, 5, 8);
            hit(c, p.x, p.y, r * 1.1, r * 0.65, 1.1, { burn: c.m.id === 9 ? 0 : 90, knock: 5 });
            w.fx.shake(6);
            w.snd(i % 2 ? 'explosion' : 'm009snd01', p.x, 0.8);
          });
          break;
        }
        case 'fire': {
          const f = fx(c, 40051, 'wait', p.x, p.y, { life: 110, fade: 25, scale: 1.1 });
          tl.at(t0 + 12, () => f?.spr?.play('loop', true));
          fx(c, 40050, 'wait', p.x, p.y, { z: 80, vz: 0.8, life: 80, fade: 40, alpha: 0.7, blend: 'multiply' });
          tl.at(t0 + 12, () => hit(c, p.x, p.y, r, r * 0.6, 0.8, { burn: 120 }));
          tl.at(t0 + 50, () => hit(c, p.x, p.y, r, r * 0.6, 0.4, { burn: 60 }));
          if (i % 3 === 0) w.snd('burn', p.x, 0.7);
          break;
        }
        case 'taiji':
          fx(c, 40600, 'wait', p.x, p.y, { life: 70, fade: 20, scale: 1 });
          for (let k = 0; k < 6; k++) fx(c, 40601, 'wait', p.x + rng.range(-50, 50), p.y, { z: 0, vz: rng.range(2, 5), life: 40, fade: 20 });
          tl.at(t0 + 30, () => {
            fx(c, 40602, 'wait', p.x, p.y, { z: 30, life: 20, fade: 15, scale: 2.4 });
            hit(c, p.x, p.y, r, r * 0.6, 1.1);
            w.fx.flash(0x80b0ff, 0.25);
          });
          snd(c, 60, 1, p.x, 0.8);
          break;
        case 'pillar':
          fx(c, 41171, 'wait', p.x, p.y, { life: 40, fade: 10 });
          tl.at(t0 + 10, () => {
            for (let k = 0; k < 6; k++) fx(c, 41170, 'wait', p.x, p.y, { z: k * 40, vz: 6, life: 30, fade: 20, scale: 1.2 });
            explode(c, 42010, p.x, p.y, 0.9);
            hit(c, p.x, p.y, r, r * 0.6, 1.2, { burn: 80 });
            w.fx.shake(4);
            if (i % 3 === 0) snd(c, 117, rng.int(1, 3), p.x, 0.8);
          });
          break;
        case 'bagua': {
          // eight trigrams circle the target, then detonate
          for (let k = 0; k < 8; k++) {
            const a = (k / 8) * Math.PI * 2;
            fx(c, 41071 + k, 'wait', p.x + Math.cos(a) * 70, p.y + Math.sin(a) * 30, { z: 30, life: 50, fade: 15, scale: 0.7 });
          }
          fx(c, 42049, 'wait', p.x, p.y, { life: 50, fade: 20, scale: 1.5, layer: 'under' });
          tl.at(t0 + 40, () => {
            explode(c, 42011, p.x, p.y, 1.3);
            hit(c, p.x, p.y, r, r * 0.6, 1.2);
            w.fx.flash(0xffe080, 0.3);
            snd(c, 107, 2, p.x);
          });
          break;
        }
      }
    });
  });
  return tl;
}

// roll: objects rolling from the far side (top) toward the camera across the enemy army
function roll(c: Cast, sp: Extract<Spec, { k: 'roll' }>): TL {
  const { w } = c;
  const box = enemyBox(c);
  const tl = new TL(150);
  focus(c, box.cx, 120);
  const id = { wheel: 40060, snow: 40070, boulder: 40590 }[sp.kind];
  const anim = sp.kind === 'wheel' ? 'wait' : 'run';
  const deb = { wheel: [40061, 40062, 40063, 40064], snow: [40071, 40072, 40073], boulder: [40591, 40592, 40593, 40594] }[sp.kind];
  const sc = sp.kind === 'snow' ? 0.7 : 1;
  snd(c, sp.kind === 'wheel' ? 6 : sp.kind === 'snow' ? 7 : 58, 1);
  const span = Math.max(220, box.x1 - box.x0 + 120);
  for (let i = 0; i < sp.n; i++) {
    const x = box.x0 - 60 + (span * (i + 0.5)) / sp.n + rng.range(-20, 20);
    const t0 = i * 10 + rng.int(0, 8);
    tl.at(t0, () => {
      const y0 = FIELD_TOP - 60;
      const f = fx(c, id, anim, x, y0, { vy: 5.2, life: 110, fade: 12, scale: sc, flip: rng.next() < 0.5 });
      if (!f) return;
      const seen = new Set<Unit>();
      let tt = 0;
      const step = () => {
        tt++;
        if (!f.live) return false;
        if (tt % 3 === 0) {
          const n = w.query(f.x, f.y, 55 * sc + 10, 26);
          for (let k = 0; k < n; k++) {
            const u = w.qb[k];
            if (u.side === c.side || seen.has(u) || !u.alive) continue;
            seen.add(u);
            if (u.isGeneral) {
              if (!c.hitGen.has(u)) {
                c.hitGen.add(u);
                w.damage(u, c.genDmg, null, false);
              }
            } else w.damage(u, c.dmg * rng.range(0.9, 1.2), c.g, false);
            u.kx = (u.x >= f.x ? 1 : -1) * 6;
          }
          if (tt % 12 === 0) w.fx.shake(3);
        }
        if (f.y > FIELD_BOT + 40) {
          debris(c, deb, f.x, f.y, 6, 8);
          f.life = f.age + 10;
          return false;
        }
        return true;
      };
      w.effects.push({ tick: step });
    });
  }
  return tl;
}

// runners: units/objects charging horizontally through the enemy army in lanes
function runners(c: Cast, sp: Extract<Spec, { k: 'run' }>): TL {
  const { w, dir } = c;
  const box = enemyBox(c);
  const tl = new TL(200);
  type R = { id: number; anim: string; spd: number; r: number; k: number; scale: number; burn?: number; knock: number; endAnim?: string; z?: number; blend?: 'add'; dirN: number; flipBase: boolean; fire?: boolean; shots?: boolean };
  const T: Record<string, R> = {
    spikes: { id: 40020, anim: 'wait', spd: 6, r: 50, k: 0.9, scale: 1, knock: 6, endAnim: 'die', dirN: 2, flipBase: true },
    firewall: { id: 40350, anim: 'loop', spd: 3, r: 70, k: 0.8, scale: 0.9, burn: 140, knock: 2, blend: 'add', dirN: 35, flipBase: true },
    bull: { id: 40680, anim: 'run', spd: 7, r: 46, k: 1, scale: 1, burn: 100, knock: 8, dirN: 68, flipBase: true, fire: true },
    leopard: { id: 40660, anim: 'run', spd: 9, r: 40, k: 1, scale: 1, knock: 5, dirN: 65, flipBase: true },
    tiger: { id: 40661, anim: 'run', spd: 8.5, r: 46, k: 1.1, scale: 1, knock: 6, dirN: 65, flipBase: true },
    elephant: { id: 40662, anim: 'run', spd: 6, r: 62, k: 1.3, scale: 1, knock: 10, dirN: 65, flipBase: true },
    ram: { id: 40800, anim: 'wait', spd: 6.5, r: 60, k: 1.2, scale: 1, knock: 10, dirN: 80, flipBase: true },
    car: { id: c.pick(40280, 40281), anim: 'run', spd: 5, r: 70, k: 1.1, scale: 0.9, knock: 10, endAnim: 'open', dirN: 80, flipBase: true },
    spear: { id: c.pick(40440, 40441), anim: 'run', spd: 8, r: 50, k: 1, scale: 0.9, knock: 6, dirN: 0, flipBase: true },
    cavalry: { id: c.pick(41200, 41201), anim: 'run', spd: 9, r: 56, k: 1.2, scale: 0.9, knock: 8, dirN: 0, flipBase: true },
    beast: { id: c.pick(40821, 40820), anim: 'run', spd: 4.5, r: 66, k: 1.3, scale: 0.85, burn: 120, knock: 8, endAnim: 'die', dirN: 82, flipBase: true },
    tower: { id: c.pick(40900, 40901), anim: 'run', spd: 3.5, r: 70, k: 1.2, scale: 0.8, knock: 8, endAnim: 'die', dirN: 80, flipBase: true, shots: true },
    crescent: { id: 40720, anim: 'wait', spd: 11, r: 56, k: 1.3, scale: 1.4, knock: 6, blend: 'add', dirN: 72, flipBase: false, z: 40 },
    clone: { id: 41060, anim: 'wait', spd: 9, r: 54, k: 1.4, scale: 0.9, knock: 7, blend: 'add', dirN: 0, flipBase: true },
    holy: { id: 41120, anim: 'wait', spd: 12, r: 60, k: 1.5, scale: 1.6, knock: 8, blend: 'add', dirN: 0, flipBase: false, z: 30 },
    bolt: { id: c.pick(40141, 40140), anim: 'shoot', spd: 0, r: 0, k: 1, scale: 0.8, knock: 0, dirN: 0, flipBase: true },
    arrowline: { id: c.pick(40010, 40016), anim: 'attack', spd: 0, r: 0, k: 1, scale: 1, knock: 0, dirN: 0, flipBase: true },
  };
  const R0 = T[sp.kind];
  // the crescent/holy slashes face right in the art; everything else faces left
  const flip = R0.flipBase ? c.flip : !c.flip;
  const lanes: number[] = [];
  const y0 = Math.max(FIELD_TOP + 10, box.y0 - 10);
  const y1 = Math.min(FIELD_BOT - 10, box.y1 + 10);
  for (let i = 0; i < sp.n; i++) lanes.push(sp.n === 1 ? (c.E.alive ? c.E.y : FIELD_MID) : y0 + ((y1 - y0) * (i + 0.5)) / sp.n);
  rng.shuffle(lanes);
  if (R0.dirN) snd(c, R0.dirN, 1);
  focus(c, box.x0 * 0.6 + box.cx * 0.4, 140);
  // stationary launchers firing lines of bolts/arrows
  if (sp.kind === 'bolt' || sp.kind === 'arrowline') {
    const frontX = c.g.x + dir * 60;
    lanes.forEach((ly, i) => {
      const f = fx(c, R0.id, 'wait', frontX - dir * (i % 2) * 30, ly, { flip, life: 110, fade: 20, scale: R0.scale });
      if (f) f.spr!.tint = w.tint;
      tl.at(10 + i * 3, () => f?.spr?.play(R0.anim, true));
      const shots = sp.kind === 'arrowline' ? 14 : 6;
      for (let k = 0; k < shots; k++) {
        tl.at(16 + i * 3 + k * 5, () => {
          const startX = frontX + dir * 40;
          const lo = obj(sp.kind === 'bolt' ? 31005 : 31003);
          const fr = lo?.dir.frame(sp.kind === 'bolt' ? 't1' : dir === 1 ? 'b10001' : 'b10017');
          if (!fr) return;
          const p = w.fx.tex(fr.tex, fr.ax / fr.w, fr.ay / fr.h, startX, ly + rng.range(-6, 6), { z: 50, vx: dir * 16, life: 120, flip: sp.kind === 'bolt' && dir === 1 });
          const seen = new Set<Unit>();
          w.effects.push({
            tick: () => {
              if (!p.live) return false;
              const n = w.query(p.x, p.y, 20, 14);
              for (let q = 0; q < n; q++) {
                const u = w.qb[q];
                if (u.side === c.side || !u.alive || seen.has(u)) continue;
                seen.add(u);
                if (u.isGeneral) {
                  if (!c.hitGen.has(u)) (c.hitGen.add(u), w.damage(u, c.genDmg, null, false));
                } else w.damage(u, c.dmg * 0.8, c.g, false);
                if (seen.size > 3) {
                  w.fx.kill(p);
                  return false;
                }
              }
              return p.x > -100 && p.x < W + 100;
            },
          });
          if (k % 3 === 0) w.snd('arrow', startX, 0.5);
        });
      }
    });
    return tl;
  }
  lanes.forEach((ly, i) => {
    const t0 = i * (sp.n > 6 ? 5 : 10) + rng.int(0, 6);
    tl.at(t0, () => {
      const fromCaster = sp.kind === 'crescent' || sp.kind === 'holy' || sp.kind === 'clone';
      const startX = fromCaster ? c.g.x + dir * 30 : (dir === 1 ? box.x0 : box.x1) - dir * rng.range(330, 420);
      const f = fx(c, R0.id, R0.anim, startX, ly, { vx: dir * R0.spd, life: 400, flip, scale: R0.scale, z: R0.z ?? 0, blend: R0.blend, fade: 10 });
      if (!f) return;
      if (!R0.blend) f.spr!.tint = w.tint;
      let fire: FxItem | null = null;
      if (R0.fire) fire = fx(c, 40681, 'wait', startX, ly, { vx: dir * R0.spd, life: 400, z: 30, bias: 2 });
      const seen = new Set<Unit>();
      const endX = dir === 1 ? box.x1 + 160 : box.x0 - 160;
      let tt = 0;
      let ended = false;
      w.effects.push({
        tick: () => {
          if (!f.live) return false;
          tt++;
          if (tt % 2 === 0) {
            const n = w.query(f.x + dir * 10, f.y, R0.r, 24);
            for (let k = 0; k < n; k++) {
              const u = w.qb[k];
              if (!u.alive || seen.has(u)) continue;
              if (u.side === c.side) continue;
              seen.add(u);
              if (u.isGeneral) {
                if (!c.hitGen.has(u)) {
                  c.hitGen.add(u);
                  w.damage(u, c.genDmg, null, false);
                }
              } else {
                if (R0.burn) {
                  u.burn = R0.burn;
                  w.applyTint(u);
                }
                w.damage(u, c.dmg * R0.k * rng.range(0.85, 1.2), c.g, false);
              }
              u.kx = dir * R0.knock;
              u.y += rng.range(-4, 4);
            }
            if (R0.shots && tt % 20 === 0) {
              // siege tower archers: volley ahead
              const tx = f.x + dir * rng.range(80, 220);
              const ty = clampY(f.y + rng.range(-60, 60));
              fx(c, 40012, 'wait', tx - dir * 60, ty, { z: 300, vz: -15, vx: dir * 3, life: 20, flip: c.flip });
              tl.at(tl.t + 20, () => {
                decal(c, 40013, 'wait', tx, ty, 80);
                hit(c, tx, ty, 40, 22, 0.8);
              });
            }
            if (sp.kind === 'firewall' && tt % 8 === 0) fx(c, 42002, 'wait', f.x + rng.range(-40, 40), f.y + rng.range(-20, 20), { life: 30, fade: 10 });
            if (tt % 10 === 0 && (sp.kind === 'elephant' || sp.kind === 'ram' || sp.kind === 'car' || sp.kind === 'beast' || sp.kind === 'tower')) {
              w.fx.shake(2.5);
              if (sp.kind === 'elephant' && tt % 30 === 0) w.snd('elephant', f.x, 0.7);
            }
            if (tt % 16 === 0 && (sp.kind === 'bull' || sp.kind === 'cavalry' || sp.kind === 'spear')) w.snd(sp.kind === 'bull' ? 'm068snd02' : 'horse01', f.x, 0.5);
            if ((sp.kind === 'leopard' || sp.kind === 'tiger') && tt % 40 === 0) w.snd('tiger', f.x, 0.6);
          }
          if (!ended && ((dir === 1 && f.x > endX) || (dir === -1 && f.x < endX))) {
            ended = true;
            if (R0.endAnim) {
              f.vx = 0;
              if (fire) fire.vx = 0;
              f.spr?.play(R0.endAnim, true);
              f.life = f.age + 50;
              f.fade = 20;
              if (sp.kind === 'car') {
                // 轒辒车 opens and soldiers pour out
                w.reinforce(c.side, c.m.id === 28 ? 6 : 4, f.x, f.y);
                w.snd('cargo', f.x, 0.9);
              } else if (sp.kind === 'beast' || sp.kind === 'tower') {
                explode(c, 42009, f.x, f.y, 1.2);
                hit(c, f.x, f.y, 90, 40, 1, { knock: 6 });
                w.snd('explosion', f.x, 0.9);
                w.fx.shake(6);
              }
            } else {
              f.life = f.age + 18;
              f.fade = 18;
            }
            if (fire) {
              fire.life = fire.age + 18;
              fire.fade = 18;
            }
          }
          return f.live;
        },
      });
    });
  });
  return tl;
}

// dragons
function dragon(c: Cast, sp: Extract<Spec, { k: 'dragon' }>): TL {
  const { w, dir } = c;
  const box = enemyBox(c);
  const tl = new TL(220);
  focus(c, box.cx, 180);
  if (sp.kind === 'gold') {
    // 黄龙天翔: a golden dragon descends on the enemy centre, fire rains around
    snd(c, 46, 1);
    w.fx.dim(0.6, 180);
    const cx = box.cx;
    const cy = clampY(box.cy + 30);
    fx(c, 40460, 'wait', cx, cy, { life: 110, fade: 20, scale: 1.1, bias: 300, layer: 'over' });
    for (let i = 0; i < 26; i++) {
      tl.at(20 + i * 3, () => {
        const p = targets(c, 1, 40)[0];
        fx(c, 40464, 'wait', p.x, p.y, { z: 380, vz: -22, life: 18, scale: 1.2 });
        tl.at(tl.t + 17, () => {
          explode(c, 42014, p.x, p.y, 0.9);
          hit(c, p.x, p.y, 55, 32, 1.1, { burn: 60 });
          w.fx.shake(5);
        });
      });
    }
    tl.at(90, () => {
      w.fx.flash(0xffe090, 0.6, 0.05);
      hit(c, cx, cy, 220, 110, 0.8, { knock: 8 });
      w.snd('lboom', cx, 1);
    });
    return tl;
  }
  if (sp.kind === 'sky') {
    // 飞龙在天: a dragon sweeps across the sky, lightning strikes everywhere
    snd(c, 46, 1);
    w.fx.dim(0.65, 200);
    const x0 = box.x0 - dir * 500;
    fx(c, 41270, 'wait', dir === 1 ? box.x0 - 300 : box.x1 + 300, FIELD_TOP + 40, { z: 120, vx: dir * 6, life: 230, fade: 20, scale: 1.4, flip: c.flip, layer: 'over' });
    void x0;
    for (let i = 0; i < 34; i++) {
      tl.at(30 + i * 4, () => {
        const p = targets(c, 1, 30)[0];
        fx(c, rng.pick([40100, 40101, 40102])!, 'wait', p.x, p.y, { life: 10, bias: 100 });
        fx(c, 40103, 'wait', p.x, p.y - 10, { life: 24, bias: 101 });
        explode(c, 42015, p.x, p.y, 0.8);
        hit(c, p.x, p.y, 56, 32, 1.1, { knock: 4 });
        w.fx.flash(0xc0d0ff, 0.3, 0.1);
        w.fx.shake(6);
        if (i % 2 === 0) w.snd(i % 4 ? 'm010snd01' : 'm010snd02', p.x, 0.8);
      });
    }
    return tl;
  }
  // fire dragons: a snake of fire balls with a head, swooping over the enemy and dropping flames
  snd(c, 11, 1);
  const head = obj(40110);
  for (let d = 0; d < sp.n; d++) {
    const laneY = sp.n === 1 ? clampY(box.cy) : clampY(box.y0 + ((box.y1 - box.y0) * (d + 0.5)) / sp.n);
    const start = (dir === 1 ? box.x0 : box.x1) - dir * 520;
    const len = 14;
    const trail: { x: number; y: number; z: number }[] = [];
    const segs: FxItem[] = [];
    const hd = head?.dir.frame('dfhn01');
    let hf: FxItem | null = null;
    tl.at(d * 16, () => {
      if (hd) hf = w.fx.tex(hd.tex, hd.ax / hd.w, hd.ay / hd.h, start, laneY, { z: 160, life: 200, blend: 'add', flip: c.flip, layer: 'sort', bias: 200, fade: 20 });
      for (let i = 0; i < len; i++) {
        const s = fx(c, 40111, 'wait', start, laneY, { z: 160, life: 200, scale: 1 - i * 0.035, fade: 20, bias: 199 - i });
        if (s) segs.push(s);
      }
      w.snd('m011snd02', start, 0.8);
    });
    let tt = 0;
    w.effects.push({
      tick: () => {
        tt++;
        if (tt < d * 16 + 1) return true;
        const k = tt - d * 16;
        const x = start + dir * k * 7;
        const z = 120 + Math.sin(k * 0.08) * 70;
        const y = laneY + Math.sin(k * 0.05 + d) * 40;
        trail.unshift({ x, y, z });
        if (trail.length > len * 4) trail.pop();
        if (hf && hf.live) {
          hf.x = x;
          hf.y = y;
          hf.z = z;
          const fr = head?.dir.frame('dfhn0' + (1 + (Math.floor(k / 3) % 8)));
          if (fr) (hf.view as { texture: unknown }).texture = fr.tex;
        }
        segs.forEach((s, i) => {
          const p = trail[Math.min(trail.length - 1, (i + 1) * 4)];
          if (p && s.live) {
            s.x = p.x;
            s.y = p.y;
            s.z = p.z;
          }
        });
        if (k % 7 === 0 && k > 30) {
          const fx0 = x;
          const fy = clampY(y + rng.range(-30, 30));
          fx(c, 40113, 'wait', fx0, fy, { life: 33, fade: 10, scale: 1.2 });
          hit(c, fx0, fy, 56, 30, 0.9, { burn: 100 });
          if (k % 21 === 0) w.snd('burn', fx0, 0.6);
        }
        return k < 200 && ((dir === 1 && x < box.x1 + 500) || (dir === -1 && x > box.x0 - 500));
      },
    });
  }
  return tl;
}

// nova: effects radiating around our general
function nova(c: Cast, sp: Extract<Spec, { k: 'nova' }>): TL {
  const { w, g } = c;
  const tl = new TL(150);
  focus(c, g.x, 120);
  const id = { fire: 40570, lantern: 40700, heart: 40890, swordwheel: 41090, sworddance: 41050 }[sp.kind];
  const dirN = { fire: 57, lantern: 70, heart: 89, swordwheel: 109, sworddance: 105 }[sp.kind];
  snd(c, dirN, 1);
  const heart = obj(40890);
  const dance = obj(41050);
  const items: { f: FxItem; a: number }[] = [];
  for (let i = 0; i < sp.n; i++) {
    const a = (i / sp.n) * Math.PI * 2;
    let f: FxItem | null = null;
    if (sp.kind === 'heart' || sp.kind === 'sworddance') {
      const lo = sp.kind === 'heart' ? heart : dance;
      const fr = lo?.dir.frame(sp.kind === 'heart' ? 'sing0001' : 'sword101');
      if (fr) f = w.fx.tex(fr.tex, fr.ax / fr.w, fr.ay / fr.h, g.x, g.y, { z: 50, life: 120, blend: 'add', fade: 20 });
    } else {
      f = fx(c, id, sp.kind === 'lantern' ? 'loop' : sp.kind === 'swordwheel' ? 'a1' : 'wait', g.x, g.y, { z: 40, life: 120, fade: 20, scale: sp.kind === 'fire' ? 1.3 : 1 });
    }
    if (f) items.push({ f, a });
  }
  const hits = new Set<Unit>();
  let tt = 0;
  w.effects.push({
    tick: () => {
      tt++;
      const R = Math.min(300, 30 + tt * 3.2);
      const spin = tt * (sp.kind === 'fire' ? 0.02 : 0.06);
      for (const it of items) {
        if (!it.f.live) continue;
        const a = it.a + spin;
        it.f.x = g.x + Math.cos(a) * R;
        it.f.y = g.y + Math.sin(a) * R * 0.42;
        if (sp.kind === 'heart' || sp.kind === 'sworddance') {
          const lo = sp.kind === 'heart' ? heart : dance;
          const n = sp.kind === 'heart' ? 1 + (Math.floor(tt / 2) % 16) : 1 + (Math.floor(tt / 2) % 16);
          const fr = lo?.dir.frame(sp.kind === 'heart' ? `sing${String(n).padStart(4, '0')}` : `sword1${String(n).padStart(2, '0')}`);
          if (fr) (it.f.view as { texture: unknown }).texture = fr.tex;
        }
      }
      if (tt % 6 === 0) {
        const n = w.query(g.x, g.y, R + 20, R * 0.42 + 20);
        const inner = R - 40;
        for (let k = 0; k < n; k++) {
          const u = w.qb[k];
          if (u.side === c.side || !u.alive || hits.has(u)) continue;
          const nx = (u.x - g.x) / R;
          const ny = (u.y - g.y) / (R * 0.42);
          const d = Math.hypot(nx, ny);
          if (d > 1 || d * R < inner * 0.6) continue;
          hits.add(u);
          if (u.isGeneral) {
            if (!c.hitGen.has(u)) (c.hitGen.add(u), w.damage(u, c.genDmg, null, false));
          } else {
            w.damage(u, c.dmg * 1.2 * rng.range(0.85, 1.2), g, false);
            u.kx = (u.x > g.x ? 1 : -1) * 6;
            if (sp.kind === 'fire' || sp.kind === 'lantern') {
              u.burn = 90;
              w.applyTint(u);
            }
          }
        }
        if (tt % 18 === 0) w.fx.shake(3);
      }
      return tt < 110;
    },
  });
  return tl;
}

// ring: rock spikes erupting in rings around the enemy general
function ring(c: Cast, sp: Extract<Spec, { k: 'ring' }>): TL {
  const { w, E } = c;
  const tl = new TL(120);
  focus(c, E.x, 100);
  snd(c, 54, 1);
  for (let i = 0; i < sp.n; i++) {
    const a = (i / sp.n) * Math.PI * 2;
    for (let ringN = 0; ringN < 2; ringN++) {
      tl.at(ringN * 22 + i * 2, () => {
        const R = 60 + ringN * 70;
        const x = E.x + Math.cos(a) * R;
        const y = clampY(E.y + Math.sin(a) * R * 0.45);
        fx(c, 40541, 'wait', x, y, { layer: 'under', life: 60, fade: 20 });
        fx(c, 40540, 'wait', x, y, { life: 50, fade: 15 });
        debris(c, [40542, 40543], x, y, 2, 7);
        hit(c, x, y, 40, 22, 1);
      });
    }
  }
  tl.at(10, () => {
    if (E.alive && !c.hitGen.has(E)) {
      c.hitGen.add(E);
      w.damage(E, c.genDmg * 1.2, null, false);
    }
    w.fx.shake(6);
  });
  return tl;
}

// single-target skills on the enemy general
function single(c: Cast, sp: Extract<Spec, { k: 'single' }>): TL {
  const { w, g, E, dir } = c;
  const tl = new TL(140);
  focus(c, (g.x + E.x) / 2, 100);
  const tx = () => E.x;
  const ty = () => E.y;
  const strikeGen = (k = 1) => {
    if (!E.alive) return;
    w.damage(E, c.genDmg * k, null, false);
    hit(c, E.x, E.y, 60, 30, 0.6);
  };
  switch (sp.kind) {
    case 'knives': {
      snd(c, 8, 0);
      const lo = obj(31004);
      for (let i = 0; i < 6; i++) {
        tl.at(4 + i * 3, () => {
          const fr = lo?.dir.frame('g20001');
          if (!fr) return;
          const sy = g.y + (i - 2.5) * 10;
          const T = Math.max(14, Math.abs(tx() - g.x) / 16);
          const f = w.fx.tex(fr.tex, 0.5, 0.5, g.x, sy, { z: 70, vx: (tx() - g.x) / T, vy: (ty() - sy) / T, life: T, vrot: dir * 0.6, blend: 'add', scale: 1.4 });
          f.onDone = () => {
            explode(c, 42012, f.x, f.y, 0.5, 40);
            if (i === 0) {
              strikeGen(1);
              E.gauge = Math.max(0, E.gauge - 33);
            }
          };
        });
      }
      break;
    }
    case 'moonbow':
    case 'sunbow': {
      g.casting = Math.max(g.casting, 34);
      g.invuln = Math.max(g.invuln, 40);
      g.spr.play('shoot', true);
      g.horse?.play('shoot', true);
      tl.at(10, () => {
        const id = sp.kind === 'moonbow' ? 40130 : 40710;
        const T = Math.max(10, Math.abs(tx() - g.x) / 22);
        const f = fx(c, id, 'wait', g.x + dir * 40, g.y, { z: 75, vx: (tx() - g.x) / T, vy: (ty() - g.y) / T, life: T, flip: c.flip, scale: 1.3 });
        snd(c, sp.kind === 'moonbow' ? 13 : 70, 1);
        const land = () => {
          if (sp.kind === 'moonbow') fx(c, 40131, 'wait', E.x, E.y, { z: 50, life: 30, fade: 20, scale: 2 });
          else for (let k = 0; k < 3; k++) fx(c, 40711, 'wait', E.x, E.y, { z: 40, life: 30 + k * 6, fade: 20, scale: 1 + k * 0.7, grow: 0.05 });
          explode(c, sp.kind === 'moonbow' ? 42013 : 42012, E.x, E.y, 1.2, 30);
          strikeGen(1);
          w.fx.flash(0xfff0c0, 0.4);
          w.fx.shake(8);
        };
        if (f) f.onDone = land;
        else tl.at(10 + T, land);
      });
      break;
    }
    case 'halberd': {
      snd(c, 58, 1);
      const T = Math.max(14, Math.abs(tx() - g.x) / 14);
      const f = fx(c, 40580, 'wait', g.x, g.y, { z: 90, vx: (tx() - g.x) / T, vy: (ty() - g.y) / T, life: T, flip: c.flip, scale: 1.4 });
      const land = () => {
        explode(c, 42015, E.x, E.y, 1.2, 30);
        strikeGen(1);
        w.fx.shake(8);
      };
      if (f) f.onDone = land;
      else tl.at(T, land);
      break;
    }
    case 'thunder5':
      w.fx.dim(0.7, 120);
      for (let i = 0; i < 5; i++) {
        tl.at(8 + i * 12, () => {
          const x = E.x + rng.range(-12, 12);
          fx(c, rng.pick([40100, 40101, 40102])!, 'wait', x, E.y + 2, { life: 12, scale: 1.3, bias: 200 });
          fx(c, 40103, 'wait', x, E.y - 30, { life: 24, scale: 1.2, bias: 201 });
          fx(c, 40104, 'wait', x, E.y, { life: 10, scale: 2, bias: 202 });
          w.fx.flash(0xd0e0ff, 0.55, 0.1);
          w.fx.shake(9);
          w.snd(i % 2 ? 'm010snd01' : 'm047snd01', E.x, 1);
          if (E.alive) w.damage(E, c.genDmg / 5, null, false);
          hit(c, E.x, E.y, 70, 32, 0.4);
        });
      }
      break;
    case 'thunderball':
      w.fx.dim(0.7, 140);
      snd(c, 50, 1);
      tl.at(4, () => fx(c, 40500, 'wait', E.x, E.y, { z: 60, life: 90, fade: 20, scale: 1.2, bias: 200 }));
      for (let i = 0; i < 8; i++)
        tl.at(14 + i * 8, () => {
          fx(c, rng.pick([40501, 40503, 40504])!, 'wait', E.x + rng.range(-50, 50), E.y + rng.range(-10, 10), { life: 10, bias: 201 });
          fx(c, 40106, 'wait', E.x, E.y - 60, { life: 10, scale: 1.5, bias: 202 });
          w.fx.flash(0xb0a0ff, 0.35, 0.12);
          w.fx.shake(7);
          if (E.alive) w.damage(E, c.genDmg / 8, null, false);
          hit(c, E.x, E.y, 90, 40, 0.3);
        });
      break;
    case 'stone':
      snd(c, 54, 1);
      tl.at(6, () => {
        fx(c, 40541, 'wait', E.x, E.y, { layer: 'under', life: 80, fade: 20 });
        fx(c, 40540, 'wait', E.x, E.y, { life: 60, fade: 15, scale: 1.4 });
        debris(c, [40542, 40543, 40544, 40545], E.x, E.y, 8, 9);
        strikeGen(1);
        w.fx.shake(8);
      });
      break;
  }
  return tl;
}

function heal(c: Cast, sp: Extract<Spec, { k: 'heal' }>): TL {
  const { w, g } = c;
  const tl = new TL(90);
  focus(c, g.x, 70);
  snd(c, 4, 0);
  const col = sp.big ? 40042 : 40040;
  const dot = sp.big ? 40043 : 40041;
  fx(c, col, 'wait', g.x, g.y + 2, { life: 80, fade: 30, alpha: 0.95, bias: 50 });
  for (let i = 0; i < 24; i++)
    tl.at(i * 2, () => fx(c, dot, 'wait', g.x + rng.range(-40, 40), g.y + rng.range(-10, 10), { z: rng.range(0, 40), vz: rng.range(2, 4), life: 40, fade: 20, bias: 51 }));
  tl.at(30, () => {
    const amt = Math.abs(c.m.power) * (sp.big ? 3.4 : 2.8) + g.info.gs.int * 0.3;
    w.heal(g, amt * c.boost);
    w.fx.flash(sp.big ? 0xfff0a0 : 0xe0a0ff, 0.25);
  });
  return tl;
}

function reinforce(c: Cast, sp: Extract<Spec, { k: 'reinforce' }>): TL {
  const { w, dir } = c;
  const box = enemyBox(c);
  const tl = new TL(60);
  snd(c, 64, 0);
  focus(c, box.cx, 90);
  const groups = sp.rear ? 2 : 2;
  for (let k = 0; k < groups; k++) {
    tl.at(10 + k * 12, () => {
      let x: number;
      let y: number;
      if (sp.rear) {
        // 后伏: appears behind the enemy lines
        x = (dir === 1 ? box.x1 + 90 : box.x0 - 90) + rng.range(-20, 20);
        y = k === 0 ? FIELD_TOP + 70 : FIELD_BOT - 70;
      } else {
        // 伏兵: ambush from the flanks
        x = box.cx + rng.range(-80, 80);
        y = k === 0 ? FIELD_TOP + 10 : FIELD_BOT - 10;
      }
      w.reinforce(c.side, Math.ceil(sp.n / groups), x, y);
      for (let i = 0; i < 5; i++) fx(c, 42033, 'wait', x + rng.range(-60, 60), y + rng.range(-30, 30), { life: 50, fade: 35, scale: 2, alpha: 0.8 });
      w.snd('yell', x, 0.8);
    });
  }
  return tl;
}

function summon(c: Cast, sp: Extract<Spec, { k: 'summon' }>): TL {
  const { w, g, dir } = c;
  const tl = new TL(60);
  snd(c, 15, 1);
  const id = sp.lv === 1 ? c.pick(40150, 40151) : c.pick(40152, 40153);
  for (let i = 0; i < sp.n; i++) {
    tl.at(4 + i * 4, () => {
      const x = g.x + dir * rng.range(60, 160);
      const y = clampY(g.y + (i - (sp.n - 1) / 2) * 36);
      fx(c, 42033, 'wait', x, y, { life: 40, fade: 30, scale: 2, alpha: 0.8 });
      const u = w.summon(c.side, id, x, y, {
        hp: (sp.lv === 1 ? 70 : 110) + g.info.gs.int * 0.4,
        power: 14 + c.m.power + g.info.gs.int * 0.12,
        life: TICKS_PER_SEC * 35,
        range: 64,
        spd: 2,
        type: 4,
      });
      if (u) u.spr.tint = 0xffffff;
    });
  }
  return tl;
}

function lock(c: Cast): TL {
  const { w } = c;
  const box = enemyBox(c);
  const tl = new TL(150);
  focus(c, box.cx, 120);
  snd(c, 81, 1);
  w.fx.dim(0.55, 140);
  const base = c.side === 0 ? 42036 : 40810;
  const items: { f: FxItem; a: number }[] = [];
  const cx = box.cx;
  const cy = clampY(box.cy);
  const rx = Math.max(160, (box.x1 - box.x0) / 2 + 60);
  const ry = Math.max(70, (box.y1 - box.y0) / 2 + 30);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const f = fx(c, base + i, 'wait', cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, { z: 40, life: 140, fade: 25, scale: 0.9 });
    if (f) items.push({ f, a });
  }
  let tt = 0;
  w.effects.push({
    tick: () => {
      tt++;
      for (const it of items) {
        const a = it.a + tt * 0.015;
        it.f.x = cx + Math.cos(a) * rx;
        it.f.y = cy + Math.sin(a) * ry;
      }
      return tt < 140;
    },
  });
  tl.at(30, () => {
    const secs = 4 + Math.min(4, c.g.info.gs.int / 30);
    w.lockSide((c.side ^ 1) as 0 | 1, Math.round(secs * TICKS_PER_SEC));
    w.fx.flash(0xa0b0ff, 0.4);
    snd(c, 81, 1, cx);
  });
  return tl;
}

function vortex(c: Cast, sp: Extract<Spec, { k: 'vortex' }>): TL {
  const { w, dir } = c;
  const box = enemyBox(c);
  const tl = new TL(200);
  focus(c, box.cx, 160);
  if (sp.kind === 'wind') {
    snd(c, 56, 1);
    for (let i = 0; i < sp.n; i++) {
      const y = sp.n === 1 ? clampY(box.cy) : clampY(box.y0 + ((box.y1 - box.y0) * (i + 0.5)) / sp.n);
      tl.at(i * 15, () => {
        const sx = (dir === 1 ? box.x0 : box.x1) - dir * 200;
        const parts: FxItem[] = [];
        for (let k = 0; k < 3; k++) {
          const f = fx(c, 40560 + k, 'wait', sx, y, { z: k * 45, life: 180, fade: 20, scale: 1 - k * 0.1, bias: 50 + k, vx: dir * 3.2 });
          if (f) parts.push(f);
        }
        let tt = 0;
        const seen = new Map<Unit, number>();
        w.effects.push({
          tick: () => {
            tt++;
            const f0 = parts[0];
            if (!f0 || !f0.live) return false;
            const wob = Math.sin(tt * 0.07) * 1.6;
            for (const p of parts) p.vy = wob;
            if (tt % 4 === 0) {
              const n = w.query(f0.x, f0.y, 80, 34);
              for (let k = 0; k < n; k++) {
                const u = w.qb[k];
                if (!u.alive || u.isGeneral) continue;
                const last = seen.get(u) ?? -99;
                if (tt - last < 24) continue;
                seen.set(u, tt);
                w.damage(u, c.dmg * (u.side === c.side ? 0.35 : 0.8), u.side === c.side ? null : c.g, false);
                u.kx = dir * 7;
                u.y += rng.range(-8, 8);
              }
              if (tt % 20 === 0) w.snd('m056snd01', f0.x, 0.5);
            }
            return tt < 175;
          },
        });
      });
    }
  } else {
    // 生死门 / 地狱之门: black holes pulling soldiers of both sides in
    snd(c, 84, 1);
    w.fx.dim(0.7, 190);
    for (let i = 0; i < sp.n; i++) {
      const p = i === 0 ? w.densest(c.side) : targets(c, 1, 60)[0];
      tl.at(i * 30, () => {
        const hx = p.x;
        const hy = clampY(p.y);
        fx(c, 42081, 'wait', hx, hy, { life: 160, fade: 30, scale: 2.2, layer: 'under' });
        fx(c, 40840, 'wait', hx, hy, { z: 40, life: 160, fade: 30, scale: 1.2, grow: 0.004 });
        fx(c, 40841, 'wait', hx, hy, { z: 40, life: 160, fade: 30, scale: 1.4 });
        let tt = 0;
        w.effects.push({
          tick: () => {
            tt++;
            if (tt % 10 === 0) fx(c, 40842, 'wait', hx + rng.range(-60, 60), hy + rng.range(-20, 20), { z: 40, life: 8 });
            const n = w.query(hx, hy, 230, 110);
            for (let k = 0; k < n; k++) {
              const u = w.qb[k];
              if (!u.alive || u.isGeneral) continue;
              u.x += (hx - u.x) * 0.02;
              u.y += (hy - u.y) * 0.02;
              if (tt % 15 === 0 && Math.abs(u.x - hx) < 90 && Math.abs(u.y - hy) < 45) w.damage(u, c.dmg * (u.side === c.side ? 0.3 : 0.6), u.side === c.side ? null : c.g, false);
            }
            if (tt === 140) {
              explode(c, 42011, hx, hy, 1.6);
              hit(c, hx, hy, 120, 60, 1.2, { knock: 9 });
              w.fx.flash(0xc0a0ff, 0.5);
              w.fx.shake(10);
              w.snd('lboom', hx, 1);
            }
            return tt < 150;
          },
        });
      });
    }
  }
  return tl;
}

function quake(c: Cast, sp: Extract<Spec, { k: 'quake' }>): TL {
  const { w } = c;
  const box = enemyBox(c);
  const tl = new TL(200);
  focus(c, box.cx, 170);
  w.fx.dim(sp.kind === 'rocks' ? 0.45 : 0.75, 180);
  snd(c, sp.kind === 'rocks' ? 49 : 50, 1);
  const pts = targets(c, sp.n, 40);
  tl.each((t) => {
    if (t < 150 && t % 3 === 0) w.fx.shake(sp.kind === 'rocks' ? 5 : 7);
  });
  pts.forEach((p, i) => {
    const t0 = 10 + Math.floor((i / pts.length) * 120) + rng.int(0, 6);
    tl.at(t0, () => {
      switch (sp.kind) {
        case 'rocks':
          fx(c, 40490, 'wait', p.x, p.y, { life: 80, fade: 20, scale: rng.range(0.9, 1.3) });
          debris(c, [40491, 40492, 40493], p.x, p.y, 4, 9);
          fx(c, 42033, 'wait', p.x, p.y, { life: 50, fade: 30, scale: 2, alpha: 0.7 });
          hit(c, p.x, p.y, 50, 28, 1.1, { knock: 5 });
          if (i % 3 === 0) w.snd('crash', p.x, 0.7);
          break;
        case 'mega':
          if (i % 3 === 0) {
            fx(c, rng.pick([40100, 40101, 40102])!, 'wait', p.x, p.y, { life: 10, bias: 100 });
            fx(c, 40103, 'wait', p.x, p.y - 10, { life: 24, bias: 101 });
            w.fx.flash(0xd0e0ff, 0.35, 0.12);
          } else {
            fx(c, 40490, 'wait', p.x, p.y, { life: 70, fade: 20 });
            debris(c, [40491, 40492], p.x, p.y, 3, 9);
          }
          if (i % 5 === 0) explode(c, 42034, p.x, p.y, 1);
          else explode(c, 42012, p.x, p.y, 0.9);
          hit(c, p.x, p.y, 60, 32, 1.15, { knock: 6 });
          if (i % 2 === 0) w.snd(i % 4 ? 'explosion' : 'lboom', p.x, 0.8);
          break;
        case 'ghost':
          if (i % 4 === 0) {
            fx(c, 40840, 'wait', p.x, p.y, { z: 40, life: 40, fade: 20, scale: 0.8 });
            fx(c, 40841, 'wait', p.x, p.y, { z: 40, life: 40, fade: 20 });
          }
          fx(c, rng.pick([40100, 40101, 40102])!, 'wait', p.x, p.y, { life: 10, bias: 100, tint: 0xd090ff });
          explode(c, rng.pick([42011, 42015, 42019])!, p.x, p.y, 1);
          hit(c, p.x, p.y, 58, 32, 1.2, { knock: 6 });
          if (i % 3 === 0) w.fx.flash(0xb080ff, 0.3, 0.1);
          if (i % 2 === 0) w.snd(i % 4 ? 'm084snd01' : 'm010snd02', p.x, 0.8);
          break;
        case 'nuke':
          explode(c, i % 3 === 0 ? 42034 : 42012, p.x, p.y, i % 3 === 0 ? 0.95 : 1.1);
          fx(c, 42033, 'wait', p.x, p.y, { life: 60, fade: 40, scale: 2.4, alpha: 0.6, vy: -0.4 });
          hit(c, p.x, p.y, 80, 40, 1.3, { knock: 9 });
          if (i % 3 === 0) w.fx.flash(0xffe0b0, 0.4, 0.08);
          w.snd(i % 2 ? 'lboom' : 'explosion', p.x, 1);
          break;
      }
    });
  });
  return tl;
}

// 神鸢: gliders fly over the enemy dropping fire bombs
function glider(c: Cast, sp: Extract<Spec, { k: 'glider' }>): TL {
  const { w, dir } = c;
  const box = enemyBox(c);
  const tl = new TL(220);
  focus(c, box.cx, 160);
  snd(c, 68, 1);
  for (let i = 0; i < sp.n; i++) {
    tl.at(i * 12, () => {
      const y = clampY(box.y0 + ((box.y1 - box.y0) * (i + 0.5)) / sp.n);
      const sx = (dir === 1 ? box.x0 : box.x1) - dir * 380;
      const f = fx(c, c.pick(40691, 40690), 'fly', sx, y, { z: 175, vx: dir * 6, life: 200, fade: 20, flip: c.flip, bias: 300 });
      if (!f) return;
      let tt = 0;
      w.effects.push({
        tick: () => {
          tt++;
          if (!f.live) return false;
          const inside = f.x > box.x0 - 30 && f.x < box.x1 + 30;
          if (inside && tt % 9 === 0) {
            const bx = f.x;
            const by = clampY(f.y + rng.range(-30, 30));
            const b = fx(c, 40090, 'wait', bx, by, { z: 165, vz: -2, g: 0.6, vx: dir * 2, life: 60, vrot: 0.2 });
            if (b)
              b.onLand = () => {
                explode(c, 42009, b.x, b.y, 0.9);
                hit(c, b.x, b.y, 50, 28, 1.1, { burn: 80, knock: 5 });
                w.fx.shake(4);
                w.snd('explosion', b.x, 0.6);
                b.life = b.age + 1;
              };
          }
          return tt < 200;
        },
      });
    });
  }
  return tl;
}

export const SKILL_SPECS = SPECS;
void FIELD_BOT;
