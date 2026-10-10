// 野战 AI: plans one unit's action (move + command). Attackers advance on the
// enemy base, bash gates and gang up on weakened units; defenders keep a guard
// on the castle, hold the gates and strike at attackers that come close.
import { db } from '../../data/db';
import { rng } from '../../engine/rng';
import { Terrain } from '../../game/contracts';
import { maxSoldiers } from '../../game/state';
import { cost, g, M, type Side, type Unit, type War } from './war';

export type Plan =
  | { kind: 'wait'; move: number }
  | { kind: 'attack'; move: number; target: Unit }
  | { kind: 'duel'; move: number; target: Unit }
  | { kind: 'gate'; move: number; gate: number }
  | { kind: 'magic'; move: number; id: number; target: Unit | null }
  | { kind: 'retreat'; move: number };

/** rough combat strength */
export function power(u: Unit): number {
  const gs = g(u);
  const sol = gs.soldiers * (1 + (gs.str + gs.level * 1.5) / 160);
  const gen = gs.hp * (gs.str / 30 + 1);
  return (sol + gen) * (0.7 + u.morale / 330);
}

class Heap {
  private a: [number, number][] = [];
  push(p: number, v: number) {
    const a = this.a;
    a.push([p, v]);
    let i = a.length - 1;
    while (i > 0) {
      const j = (i - 1) >> 1;
      if (a[j][0] <= a[i][0]) break;
      [a[i], a[j]] = [a[j], a[i]];
      i = j;
    }
  }
  pop(): [number, number] | undefined {
    const a = this.a;
    if (!a.length) return undefined;
    const top = a[0];
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]];
        i = m;
      }
    }
    return top;
  }
}

/** distance field (move cost) from `goals` for a side; intact gates are costly for attackers */
export function field(war: War, side: Side, goals: number[], formation = 0): Float32Array {
  const m = war.map;
  const d = new Float32Array(m.tiles.length).fill(Infinity);
  const h = new Heap();
  for (const s of goals) {
    if (s < 0) continue;
    d[s] = 0;
    h.push(0, s);
  }
  for (;;) {
    const top = h.pop();
    if (!top) break;
    const [dc, cur] = top;
    if (dc > d[cur]) continue;
    for (const j of m.edges(cur)) {
      const t = m.terrain(j);
      let c = cost(formation, t);
      if (c >= 999) continue;
      if (t === Terrain.Gate && side === 0 && (war.gates.get(j) ?? 0) > 0) c = 45;
      const nd = dc + c;
      if (nd < d[j]) {
        d[j] = nd;
        h.push(nd, j);
      }
    }
  }
  return d;
}

export class AI {
  private fields = new Map<string, Float32Array>();
  private guard: Unit | null = null;
  constructor(private war: War) {}

  /** call at the start of each phase */
  beginPhase(side: Side) {
    this.fields.clear();
    const w = this.war;
    this.guard = null;
    if (side === 1) {
      // castle guard: unit closest to the base (prefers the one already on it)
      const base = w.base[1];
      const own = w.sideUnits(1).filter((u) => !u.human);
      own.sort((a, b) => w.map.dist(a.pos, base) - w.map.dist(b.pos, base));
      this.guard = own[0] ?? null;
    }
  }

  private fieldTo(key: string, side: Side, goals: number[]) {
    let f = this.fields.get(key);
    if (!f) {
      f = field(this.war, side, goals);
      this.fields.set(key, f);
    }
    return f;
  }

  plan(u: Unit): Plan {
    const w = this.war;
    const gs = g(u);
    const reach = w.reach(u);
    const tiles = [...reach.keys()];
    const enemies = w.enemiesOf(u);
    const myP = power(u);
    const isGuard = this.guard === u;

    // hopeless attacker → fall back
    if (u.side === 0 && gs.soldiers < maxSoldiers(gs) * 0.08 && gs.hp < gs.maxHp * 0.25 && !w.isLord(u)) {
      return { kind: 'retreat', move: u.pos };
    }

    // 军师计
    const mg = this.planMagic(u);
    if (mg) return mg;

    // best attack / duel
    let best: Plan | null = null;
    let bestScore = 0;
    const objective = u.side === 0 ? this.fieldTo('atk', 0, [w.base[1]]) : null;
    for (const t of isGuard ? [u.pos] : tiles) {
      for (const e of w.targets(u, t)) {
        const ep = power(e);
        const mates = w.map.around(e.pos).filter((j) => {
          const o = w.unitAt(j);
          return o && o.side === u.side && o !== u;
        }).length;
        const eg = g(e);
        let ratio = myP / Math.max(1, ep) + mates * 0.18;
        if (eg.soldiers < maxSoldiers(eg) * 0.3) ratio += 0.25;
        if (eg.hp < eg.maxHp * 0.35) ratio += 0.2;
        if (e.pos === w.base[u.side]) ratio += 0.8; // repel units sitting on our base
        if (w.isLord(e)) ratio += 0.1;
        const terr = w.map.terrain(t);
        if (terr === Terrain.Forest || terr === Terrain.Mountain) ratio += 0.05;
        const need = u.side === 0 ? 0.85 : 0.95;
        if (ratio >= need) {
          let sc = ratio * 10 - (reach.get(t)!.c / 100);
          if (objective) sc -= objective[t] / 400;
          if (sc > bestScore) {
            bestScore = sc;
            best = { kind: 'attack', move: t, target: e };
          }
        }
        // duel when clearly the stronger fighter
        const strDiff = gs.str - eg.str;
        if (strDiff >= 10 && gs.hp > gs.maxHp * 0.6 && eg.soldiers > gs.soldiers * 0.6) {
          const sc = 10 + strDiff / 4 + (w.isLord(e) ? 3 : 0);
          if (sc > bestScore && rng.chance(0.7)) {
            bestScore = sc;
            best = { kind: 'duel', move: t, target: e };
          }
        }
      }
    }
    if (best) return best;

    if (isGuard) {
      // stay on (or go to) the base
      if (u.pos === w.base[1]) return { kind: 'wait', move: u.pos };
      if (reach.has(w.base[1])) return { kind: 'wait', move: w.base[1] };
      const f = this.fieldTo('base1', 1, [w.base[1]]);
      return { kind: 'wait', move: argmin(tiles, (t) => f[t]) };
    }

    if (u.side === 0) {
      // bash a gate if we stand next to one on the way
      for (const t of tiles.sort((a, b) => objective![a] - objective![b])) {
        const gates = w.gateTargets(u, t).filter((gt) => objective![gt] < objective![t]);
        if (gates.length) return { kind: 'gate', move: t, gate: gates[0] };
      }
      // advance; weak units keep some distance from strong enemies
      const danger = (t: number) =>
        w.map.around(t).reduce((s, j) => {
          const o = w.unitAt(j);
          return s + (o && o.side !== u.side ? power(o) / Math.max(1, myP) : 0);
        }, 0);
      const dest = argmin(tiles, (t) => objective![t] + danger(t) * 30 + (w.unitAt(t) ? 9999 : 0));
      return { kind: 'wait', move: dest };
    }

    // defender: hold gates while they stand, otherwise hunt the nearest attacker
    const attackers = enemies.map((e) => e.pos);
    const nearF = this.fieldTo('foes', 1, attackers);
    const threatGates = [...w.gates.keys()]
      .filter((gt) => (w.gates.get(gt) ?? 0) > 0 || w.unitAt(gt)?.side === 1)
      .sort((a, b) => nearF[a] - nearF[b]);
    const freeGate = threatGates.find((gt) => !w.unitAt(gt) || w.unitAt(gt) === u);
    if (u.pos !== -1 && threatGates.includes(u.pos) && rng.chance(0.85)) return { kind: 'wait', move: u.pos };
    if (freeGate !== undefined && nearF[freeGate] < 500) {
      if (reach.has(freeGate)) return { kind: 'wait', move: freeGate };
      const f = this.fieldTo('g' + freeGate, 1, [freeGate]);
      return { kind: 'wait', move: argmin(tiles, (t) => f[t]) };
    }
    // keep within reach of the base when weak
    if (myP < enemies.reduce((s, e) => Math.max(s, power(e)), 0) * 0.6) {
      const f = this.fieldTo('base1', 1, [w.base[1]]);
      return { kind: 'wait', move: argmin(tiles, (t) => Math.abs(f[t] - 30)) };
    }
    return { kind: 'wait', move: argmin(tiles, (t) => nearF[t]) };
  }

  private planMagic(u: Unit): Plan | null {
    const w = this.war;
    if (!w.canCast(u) || !rng.chance(0.6)) return null;
    const gs = g(u);
    const options: { id: number; target: Unit | null; score: number }[] = [];
    for (const id of w.magicsOf(u)) {
      const m = db.sfMagic[id - 1];
      if (!m || m.mp > gs.mp) continue;
      const { global, units } = w.magicTargets(u, id);
      if (global) continue; // weather: rarely useful for the AI
      for (const t of units) {
        const tg = g(t);
        let s = 0;
        switch (id) {
          case M.heal: s = tg.hp < tg.maxHp * 0.45 ? 6 : 0; break;
          case M.mpHeal: s = 0; break;
          case M.supply: s = tg.soldiers < maxSoldiers(tg) * 0.4 ? 7 : 0; break;
          case M.moraleUp: s = t.morale < 50 ? 3 : 0; break;
          case M.moraleDown: s = t.morale > 50 ? power(t) / 400 : 0; break;
          case M.stun: s = power(t) / 250; break;
          case M.ambush: s = t.fx[id] ? 0 : w.targets(t).length * 1.5; break;
          case M.atkDown: case M.slowCharge: case M.seal: s = t.fx[id] ? 0 : power(t) / 500; break;
          case M.atkUp: case M.fastCharge: s = t.fx[id] || !w.targets(t).length ? 0 : 2.5; break;
          case M.drain: s = tg.soldiers > 100 ? 4 : 0; break;
          case M.persuade: case M.sow: s = tg.loyalty < 70 ? 4 : 0; break;
          case M.forceDuel: { const p = w.duelPartner(t, u); s = p && g(p).str > tg.str + 10 ? 6 : 0; break; }
          case M.reAct: s = 3; break;
          case M.exp: s = 0.5; break;
          default: s = 1;
        }
        s *= w.successRate(u, id, t);
        if (s > 1.2) options.push({ id, target: t, score: s });
      }
    }
    options.sort((a, b) => b.score - a.score);
    const o = options[0];
    return o ? { kind: 'magic', move: u.pos, id: o.id, target: o.target } : null;
  }
}

function argmin<T>(xs: T[], f: (x: T) => number): T {
  let b = xs[0];
  let bv = Infinity;
  for (const x of xs) {
    const v = f(x);
    if (v < bv) {
      bv = v;
      b = x;
    }
  }
  return b;
}
