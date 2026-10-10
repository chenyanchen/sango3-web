// 单挑 rules: a deterministic, tick-based duel simulation shared by the
// interactive DuelScene and the instant autoDuel(), so both resolve with the
// same balance.
//
// Moves (rock-paper-scissors with timing):
//   攻击 light  — fast; interrupts a heavy wind-up; chip damage vs guard;
//                 a guard raised just before impact is a 完美格挡 (parry).
//   重击 heavy  — slow, ~2.3× damage, big stagger; parried by guard → counter.
//   防御 guard  — hold; blocks light (chip), parries heavy (auto counter).
//   必杀 super  — needs a full 怒气 gauge; armored multi/single hit, guard only halves it.
import { db, type GeneralDef } from '../../data/db';
import { G } from '../../game/state';
import { Rng } from '../../engine/rng';
import type { DuelResult, DuelSetup } from '../../game/contracts';

export const TIME_LIMIT = 60 * 30; // ticks (60 s)
export const SUPER_CUTIN = 42; // ticks the sim freezes for the 必杀 cut-in
const BASE_DMG = 6.2;
const PERFECT_WINDOW = 7; // guard raised ≤ this many ticks before a light hit = parry
const WINDUP = { light: 10, heavy: 21, counter: 6 } as const;
const RECOVER = { light: 9, lightBlocked: 8, heavy: 16, heavyMiss: 14, super: 18 } as const;
const STAGGER = { light: 9, heavy: 18, counter: 13, interrupt: 14, parryLight: 17, parryHeavy: 26, superLast: 14 } as const;
const MULT = { light: 1, heavy: 2.3, counter: 1.7 } as const;

export const SUPER_NAMES: Record<number, string> = {
  1: '连刺', 2: '大喝', 3: '拖刀', 4: '气旋', 5: '挑斩', 6: '一击', 7: '生擒', 8: '乱舞',
};
const SUPER_ANIM: Record<number, string[]> = {
  1: ['attack10'], 2: ['attack12'], 3: ['attack08'], 4: ['attack10'],
  5: ['attack11'], 6: ['attack12'], 7: ['attack09'], 8: ['attack10'],
};
const HEAVY_ANIMS = ['attack03', 'attack05', 'attack06', 'attack07', 'attack09', 'attack11'];
const LIGHT_ANIMS = ['attack01', 'attack02', 'attack04'];

// ------------------------------------------------------------------ stats
export interface FighterStats {
  id: number;
  name: string;
  level: number;
  str: number; // 武力 incl. weapon
  int: number;
  power: number; // combat rating
  agility: number; // horse bonus
  hp: number;
  maxHp: number;
  female: boolean;
  personality: number;
  supers: number[];
  weaponName: string;
  objectId: number;
}

function defLevel(d: GeneralDef) {
  return Math.max(1, Math.min(30, Math.round(d.rank * 2 + (d.str + d.int) / 40)));
}

/** Effective duel stats of a general, read (never written) from G. */
export function fighterStats(id: number, fullHp = false): FighterStats {
  const d = db.generals[id - 1];
  const g = G?.generals?.[id - 1];
  const level = g?.level ?? defLevel(d);
  const weapon = g && g.weapon >= 0 ? db.items[g.weapon] : undefined;
  const horse = g && g.horse >= 0 ? db.items[g.horse] : undefined;
  const str = (g?.str ?? d.str) + (weapon?.inc ?? 0);
  const maxHp = g?.maxHp || Math.round(d.hp + level * 4 + d.str / 5);
  const hp = fullHp ? maxHp : Math.max(1, Math.min(maxHp, g ? g.hp : maxHp));
  const supers = d.superAttack
    .split(',')
    .map((s) => parseInt(s, 10))
    .filter((n) => SUPER_NAMES[n]);
  const objectId = 30000 + (d.bfShape || 37);
  return {
    id, name: d.name, level, str, int: g?.int ?? d.int,
    power: str + level * 0.5,
    agility: Math.max(0, horse?.inc ?? 0),
    hp, maxHp, female: d.sex !== 1, personality: d.personality,
    supers, weaponName: weapon?.name ?? d.weapon, objectId: db.objects[objectId] ? objectId : 30037,
  };
}

/** Rough strength estimate used for seeding and predictions. */
export function duelRating(id: number) {
  const s = fighterStats(id, true);
  return s.power * (1 + s.maxHp / 400) + s.agility;
}

// ------------------------------------------------------------------ super plan
export interface SuperPlan {
  name: string;
  anim: string;
  speed: number;
  /** ticks from the start of the attack to each hit */
  hits: number[];
  /** damage multiplier per hit */
  mult: number;
}

function animEvents(objectId: number, anim: string): number[] | null {
  const a = db.objects[String(objectId)]?.sprites[anim];
  if (!a) return null;
  const out: number[] = [];
  let t = 0;
  for (const f of a.frames) {
    if (f.ev === 'attack') out.push(t);
    t += Math.min(f.d, 1000);
  }
  return out.length ? out : null;
}

export function superPlan(st: FighterStats, rng: Rng): SuperPlan {
  const id = st.supers.length ? rng.pick(st.supers)! : 0;
  const cands = id ? SUPER_ANIM[id] : ['attack08', 'attack12', 'attack03'];
  let anim = 'attack02';
  let ev: number[] | null = null;
  for (const c of cands) {
    ev = animEvents(st.objectId, c);
    if (ev) {
      anim = c;
      break;
    }
  }
  if (!ev) ev = animEvents(st.objectId, 'attack02') ?? animEvents(st.objectId, 'attack01') ?? [18];
  const speed = ev.length > 1 ? 1.3 : Math.max(1, ev[0] / 16);
  const hits = ev.slice(0, 5).map((t) => Math.max(1, Math.round(t / speed)));
  const total = id ? 4.6 : 4;
  return { name: id ? SUPER_NAMES[id] : '奋力一击', anim, speed, hits, mult: total / hits.length };
}

export function pickAnim(objectId: number, kind: 'light' | 'heavy', rng: Rng): { anim: string; pre: number } {
  const list = kind === 'light' ? LIGHT_ANIMS : HEAVY_ANIMS;
  const avail = list.map((a) => ({ a, ev: animEvents(objectId, a) })).filter((x) => x.ev);
  const p = rng.pick(avail.length ? avail : [{ a: 'attack01', ev: animEvents(objectId, 'attack01') ?? [18] }])!;
  return { anim: p.a, pre: p.ev![0] };
}

// ------------------------------------------------------------------ simulation
export type Move = 'light' | 'heavy' | 'counter' | 'super';
export type Act = 'light' | 'heavy' | 'super' | 'guard' | 'unguard';
export type FState = 'idle' | 'windup' | 'recover' | 'guard' | 'stagger' | 'down';
export type SideIx = 0 | 1;

export interface Fighter {
  st: FighterStats;
  hp: number;
  fury: number; // 0..100
  state: FState;
  t: number; // ticks left in the state
  move: Move | null;
  hitIx: number; // super: index of the next hit
  superP: SuperPlan | null;
  guardT: number; // ticks since guard raised
  guardHeld: boolean;
  queued: Act | null;
  queuedUntil: number;
  windupStart: number;
  // AI
  aiPlan: Act | null;
  aiPlanAt: number;
  aiNext: number;
  aiGuardUntil: number;
  aiSeen: number; // opponent windupStart already reacted to
  aggression: number;
  skill: number;
}

export type SimEvent =
  | { k: 'start'; side: SideIx; move: Move; windup: number }
  | { k: 'super'; side: SideIx; plan: SuperPlan }
  | { k: 'hit'; side: SideIx; move: Move; dmg: number; crit: boolean; ko: boolean; last: boolean; interrupt: boolean }
  | { k: 'block'; side: SideIx; dmg: number; move: Move; broken: boolean }
  | { k: 'parry'; side: SideIx; heavy: boolean }
  | { k: 'miss'; side: SideIx }
  | { k: 'guard'; side: SideIx }
  | { k: 'unguard'; side: SideIx }
  | { k: 'idle'; side: SideIx }
  | { k: 'furyFull'; side: SideIx }
  | { k: 'end'; winner: 'left' | 'right' | 'draw'; reason: 'ko' | 'time' | 'flee' };

export class DuelSim {
  t = 0;
  freeze = 0;
  private pendingSuper: SideIx | -1 = -1;
  over: { winner: 'left' | 'right' | 'draw'; reason: 'ko' | 'time' | 'flee' } | null = null;
  f: [Fighter, Fighter];
  events: SimEvent[] = [];
  rng: Rng;

  constructor(
    a: FighterStats,
    b: FighterStats,
    public ai: [boolean, boolean],
    seed?: number,
  ) {
    this.rng = new Rng(seed);
    this.f = [this.mk(a), this.mk(b)];
  }

  private mk(st: FighterStats): Fighter {
    const p = st.personality || st.id;
    return {
      st, hp: st.hp, fury: 0, state: 'idle', t: 0, move: null, hitIx: 0, superP: null,
      guardT: 0, guardHeld: false, queued: null, queuedUntil: 0, windupStart: -99,
      aiPlan: null, aiPlanAt: 0, aiNext: 20 + this.rng.int(0, 20), aiGuardUntil: 0, aiSeen: -99,
      aggression: clamp(0.3 + st.str / 260 + ((p * 37) % 30) / 100, 0.3, 0.85),
      skill: clamp(0.15 + st.int / 260 + st.level / 90 + st.str / 400, 0.25, 0.8),
    };
  }

  get timeLeft() {
    return Math.max(0, TIME_LIMIT - this.t);
  }

  private emit(e: SimEvent) {
    this.events.push(e);
  }

  /** Player / AI command. Returns false when it could not be executed or queued. */
  act(i: SideIx, a: Act): boolean {
    const me = this.f[i];
    if (this.over || me.state === 'down') return false;
    if (a === 'unguard') {
      me.guardHeld = false;
      if (me.queued === 'guard') me.queued = null;
      return true;
    }
    if (a === 'guard') me.guardHeld = true;
    if (a === 'super' && me.fury < 100) return false;
    if (this.canAct(me, a)) {
      this.start(i, a);
      return true;
    }
    me.queued = a;
    me.queuedUntil = this.t + 10;
    return true;
  }

  private canAct(me: Fighter, a: Act) {
    if (this.freeze > 0) return false;
    if (me.state === 'idle') return true;
    // attacks can be launched out of guard (to punish after a parry)
    if (me.state === 'guard' && a !== 'guard' && me.guardT >= 3) return true;
    return false;
  }

  private start(i: SideIx, a: Act) {
    const me = this.f[i];
    me.queued = null;
    if (a === 'guard') {
      me.state = 'guard';
      me.guardT = 0;
      me.t = 0;
      this.emit({ k: 'guard', side: i });
      return;
    }
    if (a === 'unguard') return;
    const agi = 1 - Math.min(0.16, me.st.agility * 0.02);
    me.windupStart = this.t;
    if (a === 'super') {
      me.fury = 0;
      me.superP = superPlan(me.st, this.rng);
      me.move = 'super';
      me.hitIx = 0;
      me.state = 'windup';
      me.t = me.superP.hits[0];
      this.freeze = SUPER_CUTIN;
      this.pendingSuper = i;
      this.emit({ k: 'super', side: i, plan: me.superP });
      return;
    }
    me.move = a;
    me.state = 'windup';
    me.t = Math.max(4, Math.round(WINDUP[a] * agi));
    this.emit({ k: 'start', side: i, move: a, windup: me.t });
  }

  private counter(i: SideIx) {
    const me = this.f[i];
    me.move = 'counter';
    me.state = 'windup';
    me.t = WINDUP.counter;
    me.windupStart = this.t;
    this.emit({ k: 'start', side: i, move: 'counter', windup: me.t });
  }

  flee(i: SideIx) {
    if (this.over) return;
    this.finish(i === 0 ? 'right' : 'left', 'flee');
  }

  private finish(winner: 'left' | 'right' | 'draw', reason: 'ko' | 'time' | 'flee') {
    this.over = { winner, reason };
    this.emit({ k: 'end', winner, reason });
  }

  /** Advances one tick. */
  step() {
    if (this.over) return;
    if (this.freeze > 0) {
      if (--this.freeze === 0 && this.pendingSuper >= 0) {
        const i = this.pendingSuper as SideIx;
        this.pendingSuper = -1;
        const me = this.f[i];
        me.windupStart = this.t;
        this.emit({ k: 'start', side: i, move: 'super', windup: me.t });
      }
      return;
    }
    this.t++;
    for (const i of [0, 1] as SideIx[]) if (this.ai[i]) this.think(i);

    // advance timers; collect attacks landing this tick
    const landing: SideIx[] = [];
    for (const i of [0, 1] as SideIx[]) {
      const me = this.f[i];
      switch (me.state) {
        case 'windup':
          if (--me.t <= 0) landing.push(i);
          break;
        case 'recover':
        case 'stagger':
          if (--me.t <= 0) this.toIdle(i);
          break;
        case 'guard':
          me.guardT++;
          if (!me.guardHeld && me.guardT >= 8) this.toIdle(i);
          break;
      }
    }
    for (const i of landing) this.resolve(i, landing);
    if (this.over) return;

    // buffered input
    for (const i of [0, 1] as SideIx[]) {
      const me = this.f[i];
      if (me.queued && this.t > me.queuedUntil) me.queued = null;
      if (me.queued && this.canAct(me, me.queued)) {
        const q = me.queued;
        if (q === 'super' && me.fury < 100) me.queued = null;
        else this.start(i, q);
      }
      if (me.state === 'idle' && me.guardHeld && !this.ai[i]) this.start(i, 'guard');
    }

    if (this.t >= TIME_LIMIT) {
      const [a, b] = this.f;
      const pa = a.hp / a.st.maxHp;
      const pb = b.hp / b.st.maxHp;
      this.finish(Math.abs(pa - pb) < 0.04 ? 'draw' : pa > pb ? 'left' : 'right', 'time');
    }
  }

  private toIdle(i: SideIx) {
    const me = this.f[i];
    me.state = 'idle';
    me.move = null;
    me.t = 0;
    this.emit({ k: 'idle', side: i });
  }

  private gainFury(i: SideIx, v: number) {
    const me = this.f[i];
    if (me.fury >= 100) return;
    me.fury = Math.min(100, me.fury + v);
    if (me.fury >= 100) this.emit({ k: 'furyFull', side: i });
  }

  private resolve(i: SideIx, landing: SideIx[]) {
    const a = this.f[i];
    const j = (1 - i) as SideIx;
    const d = this.f[j];
    const move = a.move!;
    if (a.state !== 'windup' || d.state === 'down') return;
    const ratio = Math.pow(a.st.power / Math.max(20, d.st.power), 1.5);
    let base = BASE_DMG * clamp(ratio, 0.3, 3.2) * this.rng.range(0.88, 1.12);
    const isSuper = move === 'super';
    const plan = a.superP;
    const lastHit = !isSuper || !plan || a.hitIx >= plan.hits.length - 1;
    base *= isSuper ? plan!.mult : MULT[move];

    const after = () => {
      if (isSuper && !lastHit) {
        a.hitIx++;
        a.t = plan!.hits[a.hitIx] - plan!.hits[a.hitIx - 1];
      } else if (a.state === 'windup') {
        a.state = 'recover';
        a.t = isSuper ? RECOVER.super : move === 'heavy' ? RECOVER.heavy : RECOVER.light;
        a.move = null;
      }
    };

    if (d.state === 'guard') {
      if (move === 'light' || move === 'counter') {
        if (d.guardT <= PERFECT_WINDOW) {
          a.state = 'stagger';
          a.t = STAGGER.parryLight;
          a.move = null;
          this.gainFury(j, 12);
          this.emit({ k: 'parry', side: j, heavy: false });
          return;
        }
        const dmg = Math.max(1, Math.round(base * 0.2));
        this.damage(j, dmg);
        this.gainFury(j, 5);
        this.emit({ k: 'block', side: j, dmg, move, broken: false });
        if (this.checkKo(j)) return;
        a.state = 'recover';
        a.t = RECOVER.lightBlocked;
        a.move = null;
        return;
      }
      if (move === 'heavy') {
        a.state = 'stagger';
        a.t = STAGGER.parryHeavy;
        a.move = null;
        this.gainFury(j, 18);
        this.emit({ k: 'parry', side: j, heavy: true });
        this.counter(j);
        return;
      }
      // super: guard halves the damage, last hit breaks the guard
      const dmg = Math.max(1, Math.round(base * 0.5));
      this.damage(j, dmg);
      this.emit({ k: 'block', side: j, dmg, move, broken: lastHit });
      if (this.checkKo(j)) return;
      if (lastHit) {
        d.state = 'stagger';
        d.t = STAGGER.superLast;
      }
      after();
      return;
    }

    // dodge (light attacks vs a not-busy, quick opponent)
    if ((move === 'light' || move === 'heavy') && (d.state === 'idle' || d.state === 'recover')) {
      const p = 0.04 + Math.max(0, d.st.agility - a.st.agility) * 0.015 + (move === 'heavy' ? 0.03 : 0);
      if (this.rng.chance(p)) {
        this.emit({ k: 'miss', side: i });
        a.state = 'recover';
        a.t = move === 'heavy' ? RECOVER.heavyMiss : RECOVER.light;
        a.move = null;
        return;
      }
    }

    const crit = !isSuper && this.rng.chance(0.06 + Math.max(0, a.st.power - d.st.power) / 350 + (move === 'counter' ? 0.1 : 0));
    const dmg = Math.max(1, Math.round(base * (crit ? 1.5 : 1)));
    const interrupt = d.state === 'windup' && d.move !== 'super' && !landing.includes(j);
    this.damage(j, dmg);
    this.gainFury(i, isSuper ? 0 : (dmg / d.st.maxHp) * 75 + 1.5);
    this.gainFury(j, (dmg / d.st.maxHp) * 105 + 1);
    const ko = d.hp <= 0;
    this.emit({ k: 'hit', side: i, move, dmg, crit, ko, last: lastHit, interrupt });
    if (this.checkKo(j)) return;
    if (!(d.state === 'windup' && d.move === 'super')) {
      d.state = 'stagger';
      d.move = null;
      d.t = interrupt
        ? STAGGER.interrupt
        : move === 'heavy'
          ? STAGGER.heavy
          : move === 'counter'
            ? STAGGER.counter
            : isSuper
              ? lastHit ? STAGGER.superLast : 30
              : STAGGER.light;
      if (crit) d.t += 4;
    }
    after();
  }

  private damage(j: SideIx, dmg: number) {
    const d = this.f[j];
    d.hp = Math.max(0, d.hp - dmg);
  }

  /** Ends the duel when `j` has been knocked out. */
  private checkKo(j: SideIx) {
    const d = this.f[j];
    if (d.hp > 0 || this.over) return false;
    d.state = 'down';
    const a = this.f[1 - j];
    if (a.state !== 'down') {
      a.state = 'recover';
      a.t = 20;
    }
    this.finish(j === 0 ? 'right' : 'left', 'ko');
    return true;
  }

  // ---------------------------------------------------------------- AI
  private think(i: SideIx) {
    const me = this.f[i];
    const op = this.f[1 - i];
    const r = this.rng;
    if (me.state === 'down') return;

    // react once to each new enemy attack
    if (op.state === 'windup' && op.windupStart !== me.aiSeen) {
      me.aiSeen = op.windupStart;
      const left = op.t;
      if (op.move === 'heavy') {
        if (r.chance(me.skill)) this.plan(me, 'guard', r.int(3, Math.max(4, left - 4)));
        else if (r.chance(0.35) && me.state === 'idle') this.plan(me, 'light', r.int(1, 4));
      } else if (op.move === 'super') {
        if (r.chance(me.skill * 0.9)) this.plan(me, 'guard', r.int(1, Math.max(2, left - 2)));
      } else if (r.chance(me.skill * 0.42)) {
        this.plan(me, 'guard', r.int(Math.max(1, left - 11), Math.max(1, left - 2)));
      }
    }
    if (me.aiPlan && this.t >= me.aiPlanAt) {
      const p = me.aiPlan;
      me.aiPlan = null;
      if (p === 'guard') {
        me.aiGuardUntil = this.t + r.int(10, 20);
        if (me.state === 'idle') this.act(i as SideIx, 'guard');
      } else if (this.canAct(me, p)) this.act(i as SideIx, p);
      return;
    }
    if (me.state === 'guard') {
      // punish a parried / staggered opponent
      if (op.state === 'stagger' && op.t > 8 && me.guardT >= 3 && r.chance(0.5 + me.skill / 2)) {
        me.guardHeld = false;
        this.act(i as SideIx, op.t > 22 ? 'heavy' : 'light');
        return;
      }
      if (this.t >= me.aiGuardUntil && op.state !== 'windup') me.guardHeld = false;
      return;
    }
    if (me.state !== 'idle') return;
    if (this.t < me.aiNext) {
      if (op.state === 'stagger' && op.t > 10 && r.chance(0.25 + me.skill / 3)) {
        this.act(i as SideIx, op.t > 20 && r.chance(0.5) ? 'heavy' : 'light');
      }
      return;
    }
    me.aiNext = this.t + Math.round(r.int(5, 16) * (1.35 - me.aggression));
    if (me.fury >= 100 && (op.state === 'stagger' || op.state === 'recover' || r.chance(0.45))) {
      this.act(i as SideIx, 'super');
      return;
    }
    const choice = r.pickWeighted(
      [
        { a: 'light' as Act, w: me.aggression * 0.62 },
        { a: 'heavy' as Act, w: me.aggression * (op.state === 'guard' ? 0.1 : 0.32) },
        { a: 'guard' as Act, w: (1 - me.aggression) * 0.3 },
        { a: 'unguard' as Act, w: 0.22 },
      ],
      (x) => x.w,
    )!.a;
    if (choice === 'guard') {
      me.aiGuardUntil = this.t + r.int(8, 22);
      this.act(i as SideIx, 'guard');
    } else if (choice !== 'unguard') this.act(i as SideIx, choice);
  }

  private plan(me: Fighter, a: Act, delay: number) {
    me.aiPlan = a;
    me.aiPlanAt = this.t + Math.max(0, delay);
  }

  result(): DuelResult {
    const o = this.over ?? { winner: 'draw' as const };
    return { winner: o.winner, leftHp: Math.round(this.f[0].hp), rightHp: Math.round(this.f[1].hp) };
  }
}

function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}

/** Runs a full AI-vs-AI duel instantly. */
export function simulate(setup: DuelSetup, fullHp = false, seed?: number): DuelResult {
  const sim = new DuelSim(fighterStats(setup.left, fullHp), fighterStats(setup.right, fullHp), [true, true], seed);
  let guard = 0;
  while (!sim.over && guard++ < TIME_LIMIT * 4) {
    sim.step();
    sim.events.length = 0;
  }
  return sim.result();
}

/** Finishes an in-progress sim instantly with AI on both sides (skip). */
export function finishNow(sim: DuelSim) {
  sim.ai = [true, true];
  for (const f of sim.f) f.guardHeld = false;
  let guard = 0;
  while (!sim.over && guard++ < TIME_LIMIT * 4) {
    sim.step();
    sim.events.length = 0;
  }
}

/** Dialogue lines (Dialogue.ini) for a general. */
export function dialogueFor(id: number) {
  const d = db.generals[id - 1];
  const items = (db.raw.Dialogue ?? []).filter((s) => /^ITEM\d+$/.test(s._));
  if (!items.length) return null;
  const it = items[((d.personality || d.id) * 7 + d.id) % items.length];
  const s = (k: string) => String((Array.isArray(it[k]) ? it[k]![0] : it[k]) ?? '');
  return {
    ask: s('Ask'), askWeak: s('AskWeak'), answer: s('Answer'), answerWeak: s('AnswerWeak'),
    winFall: s('WinFall'), winEscape: s('WinEscape'), draw: s('Draw'),
  };
}

export function fmtLine(line: string, self: string, other: string) {
  return line.replaceAll('%1', self).replaceAll('%2', other);
}
