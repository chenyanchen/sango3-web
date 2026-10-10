// 野战 rules model: units, movement, clashes, 军师计, victory. Pure logic (no
// rendering); the scene drives it and animates the results, and AI uses it to
// evaluate moves. All persistent effects are applied to G (generals' soldiers,
// hp, mp, exp, merit, positions after the war).
import { db } from '../../data/db';
import { rng } from '../../engine/rng';
import {
  Terrain, type BattleResult, type BattleSetup, type DuelResult, type DuelSetup, type TimeOfDay,
  type WarResult, type WarSetup, type Weather,
} from '../../game/contracts';
import { city, G, gainExp, gen, maxSoldiers, nation, type GeneralState } from '../../game/state';
import type { FieldMap } from './map';

export type Side = 0 | 1; // 0 attacker, 1 defender
export type UnitState = 'field' | 'retreated' | 'captured' | 'killed';

export interface Unit {
  gid: number;
  side: Side;
  /** allied reinforcement (third-party nation) */
  ally: boolean;
  /** controlled by the human player */
  human: boolean;
  pos: number;
  morale: number;
  acted: boolean;
  moved: boolean;
  /** position at start of this unit's turn (for undoing a move) */
  from: number;
  state: UnitState;
  /** active 军师计 effects: magic id → rounds remaining */
  fx: Record<number, number>;
  wins: number;
  kills: number;
}

export const MAX_ROUNDS = 90;
export const GATE_HP = 100;

/** 军师计 ids (SFMagic.ini) */
export const M = {
  clearSky: 1, storm: 2, moraleDown: 3, moraleUp: 4, march: 5, chaos: 6, escape: 7, slowCharge: 8,
  atkDown: 9, fastCharge: 10, heal: 11, mpHeal: 12, atkUp: 13, reAct: 14, sow: 15, ambush: 16,
  persuade: 17, stun: 18, forceDuel: 19, exp: 20, supply: 21, drain: 22, seal: 23,
} as const;

/** Morale modifiers applied in 百人战 for active effects (the battle layer has no buff API). */
const FX_MORALE: Record<number, number> = {
  [M.slowCharge]: -10, [M.atkDown]: -15, [M.fastCharge]: 10, [M.atkUp]: 15, [M.chaos]: -15, [M.seal]: -10,
};

export interface WarHooks {
  battle(setup: BattleSetup, a: Unit, b: Unit): Promise<BattleResult>;
  duel(setup: DuelSetup, a: Unit, b: Unit): Promise<DuelResult>;
  /** the human player is challenged to a duel: accept? */
  askDuel(challenger: Unit, target: Unit): Promise<boolean>;
  log(text: string, kind?: 'info' | 'good' | 'bad'): void;
}

export interface ClashOutcome {
  kind: 'battle' | 'duel' | 'refused' | 'gate';
  winner: Unit | null;
  loser: Unit | null;
  text: string[];
}

export const g = (u: Unit) => gen(u.gid);
export const name = (u: Unit) => db.generals[u.gid - 1]?.name ?? '?';

export class War {
  units: Unit[] = [];
  gates = new Map<number, number>(); // tile → hp (0 = broken)
  /** base tile per side: [attacker camp, defender castle/camp] */
  base: [number, number] = [-1, -1];
  /** defender base is a 主城 (true) or a camp */
  castle = false;
  round = 0;
  side: Side = 0;
  weather: Weather = 0;
  /** unit holding the enemy base since the end of its side's last phase */
  holding: [Unit | null, Unit | null] = [null, null];
  winner: Side | null = null;
  winReason = '';
  readonly playerSide: Side | null;
  /** all generals who took part */
  readonly all: number[];
  private killedIds = new Set<number>();

  constructor(
    readonly setup: WarSetup,
    readonly map: FieldMap,
  ) {
    const owner = city(setup.city)?.owner ?? 0;
    this.playerSide = setup.attacker === G.player ? 0 : owner === G.player && owner ? 1 : null;
    this.all = [...setup.attackers, ...(setup.attackerAllies ?? []), ...setup.defenders, ...(setup.defenderAllies ?? [])];
    this.weather = initialWeather(setup.city);
    this.setupBases();
    this.deploy();
  }

  get time(): TimeOfDay {
    return (this.round % 3) as TimeOfDay;
  }
  get day() {
    return Math.floor(this.round / 3) + 1;
  }
  get cityName() {
    return db.cities[this.setup.city - 1]?.name ?? '';
  }
  sideName(s: Side) {
    const nid = s === 0 ? this.setup.attacker : city(this.setup.city)?.owner ?? 0;
    return nation(nid)?.name ?? (s === 0 ? '攻' : '守');
  }

  // ------------------------------------------------------------ setup
  private setupBases() {
    const m = this.map;
    const castle = m.find((t) => t.terrain === Terrain.Castle);
    const markers = m.find((t) => t.marker);
    // attacker camp: marker in the direction of the source city
    const cs = db.cities[this.setup.city - 1];
    const fs = db.cities[this.setup.from - 1];
    let dx = fs && cs ? fs.x - cs.x : -1;
    let dy = fs && cs ? fs.y - cs.y : 0;
    const dl = Math.hypot(dx, dy) || 1;
    dx /= dl;
    dy /= dl;
    const cx = m.pxW / 2, cy = m.pxH / 2;
    const score = (i: number) => {
      const vx = m.sx(i) - cx, vy = m.sy(i) - cy;
      return (vx * dx + vy * dy) / (Math.hypot(vx, vy) || 1);
    };
    const cand = markers.length ? markers : m.find((t, i) => isEdge(m, i) && t.terrain !== Terrain.Water && cost(0, t.terrain) < 999);
    cand.sort((a, b) => score(b) - score(a));
    this.base[0] = cand[0] ?? 0;
    if (castle.length) {
      this.base[1] = castle[0];
      this.castle = true;
    } else {
      const others = (markers.length > 1 ? markers : m.find((t) => t.terrain === Terrain.House || t.terrain === Terrain.Road))
        .filter((i) => i !== this.base[0]);
      others.sort((a, b) => m.dist(b, this.base[0]) - m.dist(a, this.base[0]));
      this.base[1] = others[0] ?? m.find((t) => t.terrain > 0 && cost(0, t.terrain) < 999)[0];
    }
    for (const i of m.find((t) => t.terrain === Terrain.Gate)) this.gates.set(i, GATE_HP);
  }

  private deploy() {
    const s = this.setup;
    const add = (ids: number[], side: Side, ally: boolean) => {
      const human = !ally && this.playerSide === side;
      for (const id of ids) {
        const gs = gen(id);
        if (!gs) continue;
        const morale = side === 0 ? (city(s.from)?.training ?? 50) : (city(s.city)?.training ?? 50);
        this.units.push({
          gid: id, side, ally, human, pos: -1, morale: clamp(Math.round(morale * 0.7 + 30), 20, 100),
          acted: false, moved: false, from: -1, state: 'field', fx: {}, wins: 0, kills: 0,
        });
      }
    };
    add(s.attackers, 0, false);
    add(s.attackerAllies ?? [], 0, true);
    add(s.defenders, 1, false);
    add(s.defenderAllies ?? [], 1, true);
    // attackers around their camp
    const taken = new Set<number>();
    const place = (u: Unit, spots: number[]) => {
      const t = spots.find((i) => !taken.has(i) && this.canStand(u, i));
      if (t !== undefined) {
        u.pos = t;
        taken.add(t);
      }
    };
    const ring = (center: number, u: Unit) => this.byDistance(center, u);
    for (const u of this.units.filter((x) => x.side === 0)) place(u, ring(this.base[0], u).filter((i) => i !== this.base[0]));
    // defenders: base (governor first), then gates, then near the base
    const defs = this.units.filter((x) => x.side === 1);
    const gov = city(s.city)?.governor ?? 0;
    defs.sort((a, b) => (b.gid === gov ? 1 : 0) - (a.gid === gov ? 1 : 0) || g(b).level - g(a).level);
    const gates = [...this.gates.keys()].sort((a, b) => this.map.dist(a, this.base[0]) - this.map.dist(b, this.base[0]));
    defs.forEach((u, k) => {
      if (k === 0) return place(u, ring(this.base[1], u));
      const gi = k - 1;
      if (gi < gates.length && gi < 3) return place(u, ring(gates[gi], u));
      place(u, ring(this.base[1], u));
    });
    for (const u of this.units) if (u.pos < 0) u.state = 'retreated';
  }

  /** passable tiles sorted by distance to `center` */
  private byDistance(center: number, u: Unit): number[] {
    const out: number[] = [];
    this.map.tiles.forEach((t, i) => {
      if (t.terrain && this.canStand(u, i, true)) out.push(i);
    });
    return out.sort((a, b) => this.map.dist(a, center) - this.map.dist(b, center) || a - b);
  }

  // ------------------------------------------------------------ queries
  active(): Unit[] {
    return this.units.filter((u) => u.state === 'field');
  }
  sideUnits(s: Side) {
    return this.units.filter((u) => u.side === s && u.state === 'field');
  }
  unitAt(i: number): Unit | undefined {
    return this.units.find((u) => u.state === 'field' && u.pos === i);
  }
  enemiesOf(u: Unit) {
    return this.units.filter((x) => x.state === 'field' && x.side !== u.side);
  }
  /** the side's advisor (军师): highest 智力 general on the field */
  advisor(s: Side): Unit | undefined {
    return this.sideUnits(s).filter((u) => !u.ally).sort((a, b) => g(b).int - g(a).int)[0];
  }

  /** terrain move cost for a unit (999 = impassable) */
  tileCost(u: Unit, i: number): number {
    const t = this.map.terrain(i);
    if (!t) return 999;
    if (t === Terrain.Gate && u.side === 0 && (this.gates.get(i) ?? 0) > 0) return 999;
    return cost(g(u).formation, t);
  }
  canStand(u: Unit, i: number, ignoreUnits = false) {
    if (this.tileCost(u, i) >= 999) return false;
    if (!ignoreUnits && this.unitAt(i)) return false;
    return true;
  }
  movePoints(u: Unit): number {
    const gs = g(u);
    let mp = 70;
    if (gs.soldierType === 3) mp += 20; // 轻骑兵
    const horse = gs.horse >= 0 ? db.items[gs.horse] : undefined;
    if (horse) mp += 6 + horse.inc * 2;
    if (u.fx[M.march]) mp += 30;
    if (u.fx[M.chaos]) mp = Math.floor(mp / 2);
    if (this.weather === 2 || this.weather === 3) mp -= 8;
    return mp;
  }
  zoc(u: Unit, i: number) {
    return this.map.around(i).some((j) => {
      const o = this.unitAt(j);
      return o && o.side !== u.side;
    });
  }

  /** Dijkstra over reachable tiles. Returns tile → {cost, prev}. Origin included. */
  reach(u: Unit, budget = this.movePoints(u)): Map<number, { c: number; prev: number }> {
    const m = this.map;
    const out = new Map<number, { c: number; prev: number }>();
    out.set(u.pos, { c: 0, prev: -1 });
    const open: number[] = [u.pos];
    const startZoc = this.zoc(u, u.pos);
    while (open.length) {
      // small maps: linear extraction is fine
      let bi = 0;
      for (let k = 1; k < open.length; k++) if (out.get(open[k])!.c < out.get(open[bi])!.c) bi = k;
      const cur = open.splice(bi, 1)[0];
      const cc = out.get(cur)!.c;
      if (cur !== u.pos && this.zoc(u, cur)) continue; // ZOC: must stop here
      if (cur === u.pos && startZoc && cc > 0) continue;
      const steps: [number, number][] = m.edges(cur).map((j) => [j, 1]);
      for (const j of m.corners(cur)) {
        // corner step only when one of the two shared edge tiles is open terrain
        const shared = m.edges(cur).filter((e) => m.edges(j).includes(e));
        if (shared.some((e) => this.tileCost(u, e) < 999)) steps.push([j, 1.4]);
      }
      for (const [j, k] of steps) {
        const tc = this.tileCost(u, j);
        if (tc >= 999) continue;
        const o = this.unitAt(j);
        if (o && o.side !== u.side) continue;
        let nc = cc + Math.round(tc * k);
        // a unit can always advance one tile from where it starts (e.g. into the 主城)
        if (nc > budget) {
          if (cur !== u.pos || k !== 1) continue;
          nc = budget;
        }
        const prev = out.get(j);
        if (!prev || prev.c > nc) {
          out.set(j, { c: nc, prev: cur });
          if (!open.includes(j)) open.push(j);
        }
      }
    }
    // cannot stop on friendly-occupied tiles
    for (const k of [...out.keys()]) if (k !== u.pos && this.unitAt(k)) out.delete(k);
    return out;
  }

  pathTo(reach: Map<number, { c: number; prev: number }>, dest: number): number[] {
    const p: number[] = [];
    let c = dest;
    while (c >= 0 && reach.has(c)) {
      p.unshift(c);
      c = reach.get(c)!.prev;
    }
    return p;
  }

  /** adjacent enemy units */
  targets(u: Unit, at = u.pos): Unit[] {
    return this.map.around(at).map((j) => this.unitAt(j)).filter((o): o is Unit => !!o && o.side !== u.side);
  }
  /** adjacent intact gates (attackers only) */
  gateTargets(u: Unit, at = u.pos): number[] {
    if (u.side !== 0) return [];
    return this.map.edges(at).filter((j) => (this.gates.get(j) ?? 0) > 0 && !this.unitAt(j));
  }

  // ------------------------------------------------------------ actions
  move(u: Unit, dest: number) {
    if (!u.moved) u.from = u.pos;
    u.pos = dest;
    u.moved = true;
  }
  undoMove(u: Unit) {
    if (u.moved && !u.acted && u.from >= 0) {
      u.pos = u.from;
      u.moved = false;
    }
  }
  finish(u: Unit) {
    u.acted = true;
    u.moved = true;
  }

  /** 撤退: leave the battlefield */
  retreat(u: Unit, hooks?: WarHooks) {
    u.state = 'retreated';
    u.acted = true;
    hooks?.log(`${name(u)}撤军了。`);
  }

  attackGate(u: Unit, gate: number, hooks?: WarHooks): ClashOutcome {
    const gs = g(u);
    const dmg = Math.round(18 + gs.soldiers / 40 + gs.str / 6 + rng.int(0, 10));
    const hp = Math.max(0, (this.gates.get(gate) ?? 0) - dmg);
    this.gates.set(gate, hp);
    this.finish(u);
    const text = hp > 0 ? `${name(u)}猛攻城门，城门耐久剩余 ${hp}。` : `${name(u)}攻破了城门！`;
    hooks?.log(text, hp > 0 ? 'info' : 'good');
    gainExp(gs, 10);
    return { kind: 'gate', winner: hp <= 0 ? u : null, loser: null, text: [text] };
  }

  battleSetup(a: Unit, b: Unit): { setup: BattleSetup; aLeft: boolean } {
    // the human's unit (or the attacker when no human) is shown on the left
    const aLeft = a.human || (!b.human && a.side === 0);
    const side = (u: Unit) => {
      const gs = g(u);
      let morale = u.morale;
      for (const id of Object.keys(u.fx)) morale += FX_MORALE[+id] ?? 0;
      return {
        general: u.gid, soldiers: gs.soldiers, soldierType: gs.soldierType, formation: gs.formation,
        human: u.human, morale: clamp(Math.round(morale), 0, 100),
      };
    };
    const terr = this.map.terrain(b.pos) || Terrain.Plain;
    return {
      setup: {
        left: side(aLeft ? a : b), right: side(aLeft ? b : a),
        terrain: terr as Terrain, time: this.time, weather: this.weather,
      },
      aLeft,
    };
  }

  /** 攻击: a 百人战 between attacker `a` and adjacent enemy `b`. */
  async attack(a: Unit, b: Unit, hooks: WarHooks): Promise<ClashOutcome> {
    const { setup, aLeft } = this.battleSetup(a, b);
    this.finish(a);
    hooks.log(`${name(a)}攻击${name(b)}！`);
    const res = await hooks.battle(setup, aLeft ? a : b, aLeft ? b : a);
    const ra = aLeft ? res.left : res.right;
    const rb = aLeft ? res.right : res.left;
    const win = res.winner === 'draw' ? null : (res.winner === 'left') === aLeft ? a : b;
    const text: string[] = [];
    this.applyBattle(a, ra, win === a, text);
    this.applyBattle(b, rb, win === b, text);
    for (const [u, r] of [[a, ra], [b, rb]] as const) {
      if (r.defeated || r.hp <= 0) this.defeat(u, win === u ? null : (u === a ? b : a), text, 0);
      else if (r.fled) {
        if ((this.surrounded(u) || u.fx[M.ambush]) && rng.chance(0.5)) this.capture(u, u === a ? b : a, text);
        else {
          u.state = 'retreated';
          text.push(`${name(u)}逃离了战场。`);
        }
      } else if (win && u !== win && g(u).soldiers <= 0 && rng.chance(0.4)) {
        // routed troops: the general falls back
        u.state = 'retreated';
        text.push(`${name(u)}兵力尽失，撤出了战场。`);
      }
    }
    if (win) text.unshift(`${name(win)}击败了${name(win === a ? b : a)}。`);
    else text.unshift(`${name(a)}与${name(b)}不分胜负。`);
    for (const t of text) hooks.log(t, win && (win.human ? 'good' : this.playerSide !== null ? 'bad' : 'info') || 'info');
    return { kind: 'battle', winner: win, loser: win ? (win === a ? b : a) : null, text };
  }

  private applyBattle(u: Unit, r: BattleResult['left'], won: boolean, _text: string[]) {
    const gs = g(u);
    gs.soldiers = Math.max(0, Math.min(Math.round(r.soldiersLeft), maxSoldiers(gs) * 2));
    gs.hp = clamp(Math.round(r.hp), 0, gs.maxHp);
    gs.mp = clamp(Math.round(r.mp), 0, gs.maxMp);
    u.kills += r.kills;
    gainExp(gs, r.kills * 2 + 30 + (won ? 50 : 0));
    if (won) {
      u.wins++;
      gs.merit += 10 + Math.round(r.kills / 10);
      u.morale = clamp(u.morale + 5, 0, 100);
    } else u.morale = clamp(u.morale - 5, 0, 100);
  }

  /** enemies around and no free tile to fall back to */
  surrounded(u: Unit) {
    const around = this.map.around(u.pos);
    const foes = around.filter((j) => {
      const o = this.unitAt(j);
      return o && o.side !== u.side;
    }).length;
    const free = around.filter((j) => !this.unitAt(j) && this.tileCost(u, j) < 999 && !this.zoc(u, j)).length;
    return foes >= 3 || free === 0;
  }

  /** a general fell (HP 0): captured with some probability, else escapes */
  private defeat(u: Unit, by: Unit | null, text: string[], bonus: number) {
    const around = this.map.around(u.pos).filter((j) => {
      const o = this.unitAt(j);
      return o && o.side !== u.side;
    }).length;
    let p = 0.3 + bonus + (u.fx[M.ambush] ? 0.35 : 0) + Math.max(0, around - 1) * 0.12 + (this.surrounded(u) ? 0.3 : 0);
    p = Math.min(0.92, p);
    if (by && rng.chance(p)) {
      if (!this.isLord(u) && rng.chance(0.03)) {
        u.state = 'killed';
        this.killedIds.add(u.gid);
        text.push(`${name(u)}战死沙场‧‧‧`);
      } else this.capture(u, by, text);
    } else {
      u.state = 'retreated';
      text.push(`${name(u)}负伤逃走了。`);
    }
  }
  private capture(u: Unit, by: Unit, text: string[]) {
    u.state = 'captured';
    text.push(`${name(u)}被${name(by)}俘虏了‧‧‧`);
    g(by).merit += 30;
    gainExp(g(by), 40);
  }
  isLord(u: Unit) {
    return G.nations.some((n) => n.lord === u.gid);
  }

  /** chance that `b` accepts a duel from `a` */
  duelAcceptChance(a: Unit, b: Unit) {
    const ga = g(a), gb = g(b);
    const p = 0.5 + (gb.str - ga.str) / 45 + (gb.hp / Math.max(1, gb.maxHp) - 0.6) * 0.5;
    return clamp(p, 0.05, 0.97);
  }

  /** 单挑 request from `a` to adjacent `b` (forced = 强迫单挑) */
  async duel(a: Unit, b: Unit, hooks: WarHooks, forced = false): Promise<ClashOutcome> {
    this.finish(a);
    let accept = forced;
    if (!forced) {
      if (b.human) accept = await hooks.askDuel(a, b);
      else accept = rng.chance(this.duelAcceptChance(a, b));
    }
    if (!accept) {
      const d = rng.int(8, 15);
      b.morale = clamp(b.morale - d, 0, 100);
      for (const o of this.sideUnits(b.side)) if (o !== b) o.morale = clamp(o.morale - 3, 0, 100);
      a.morale = clamp(a.morale + 4, 0, 100);
      const t = `${name(b)}拒绝单挑，士气下降${d}点。`;
      hooks.log(t, b.human ? 'bad' : 'good');
      return { kind: 'refused', winner: null, loser: null, text: [t] };
    }
    const aLeft = a.human || (!b.human && a.side === 0);
    const L = aLeft ? a : b, R = aLeft ? b : a;
    const res = await hooks.duel({ left: L.gid, right: R.gid, leftHuman: L.human, rightHuman: R.human }, L, R);
    g(L).hp = clamp(Math.round(res.leftHp), 0, g(L).maxHp);
    g(R).hp = clamp(Math.round(res.rightHp), 0, g(R).maxHp);
    const text: string[] = [];
    if (res.winner === 'draw') {
      text.push(`${name(a)}与${name(b)}大战数十回合，不分胜负。`);
      gainExp(g(a), 20);
      gainExp(g(b), 20);
      hooks.log(text[0]);
      return { kind: 'duel', winner: null, loser: null, text };
    }
    const win = res.winner === 'left' ? L : R;
    const lose = win === L ? R : L;
    text.push(`${name(win)}单挑击败了${name(lose)}！`);
    win.wins++;
    gainExp(g(win), 60);
    gainExp(g(lose), 15);
    g(win).merit += 25;
    win.morale = clamp(win.morale + 10, 0, 100);
    for (const o of this.sideUnits(lose.side)) o.morale = clamp(o.morale - 4, 0, 100);
    if (g(lose).hp <= 0) this.defeat(lose, win, text, 0.25);
    else {
      lose.state = 'retreated';
      text.push(`${name(lose)}落荒而逃。`);
    }
    for (const t of text) hooks.log(t, win.human ? 'good' : lose.human ? 'bad' : 'info');
    return { kind: 'duel', winner: win, loser: lose, text };
  }

  // ------------------------------------------------------------ 军师计
  /** magic the general can use: learned ones, or (if none learned) those his stats qualify for */
  magicsOf(u: Unit): number[] {
    const gs = g(u);
    if (gs.sfMagic.length) return gs.sfMagic;
    return db.sfMagic
      .filter((m) => m.level <= gs.level && gs.int >= m.intDown && gs.int <= m.intUp && gs.str >= m.strDown && gs.str <= m.strUp)
      .map((m) => m.id);
  }
  canCast(u: Unit) {
    return this.advisor(u.side) === u && this.magicsOf(u).length > 0;
  }
  /** valid targets of a magic cast by u (empty array + global=true for weather magic) */
  magicTargets(u: Unit, id: number): { global: boolean; units: Unit[] } {
    const m = db.sfMagic[id - 1];
    if (!m || m.enemyType === 0) return { global: true, units: [] };
    const range = Math.max(1, m.range);
    const units = this.active().filter((o) => {
      if (this.map.dist(o.pos, u.pos) > range) return false;
      if (m.enemyType === 1 ? o.side !== u.side : o.side === u.side) return false;
      if (id === M.forceDuel) return this.duelPartner(o, u) !== undefined;
      if (id === M.reAct) return o.acted && o !== u;
      return true;
    });
    return { global: false, units };
  }
  /** for 强迫单挑: the strongest friendly general adjacent to the target (or the caster) */
  duelPartner(target: Unit, caster: Unit): Unit | undefined {
    return this.targets(target).filter((o) => o.side === caster.side).sort((a, b) => g(b).str - g(a).str)[0];
  }
  successRate(u: Unit, id: number, target?: Unit): number {
    const gi = g(u).int;
    const m = db.sfMagic[id - 1];
    if (!m) return 0;
    if (m.enemyType === 2 && target) return clamp(0.55 + (gi - g(target).int) / 80, 0.15, 0.95);
    return clamp(0.5 + gi / 220, 0.4, 0.97);
  }

  async cast(u: Unit, id: number, target: Unit | null, hooks: WarHooks): Promise<{ ok: boolean; text: string }> {
    const m = db.sfMagic[id - 1];
    const gs = g(u);
    gs.mp = Math.max(0, gs.mp - m.mp);
    this.finish(u);
    const ok = rng.chance(this.successRate(u, id, target ?? undefined));
    gainExp(gs, ok ? 25 : 8);
    if (!ok) {
      const t = `${name(u)}施展「${m.name}」失败了。`;
      hooks.log(t, 'bad');
      return { ok, text: t };
    }
    gs.merit += 5;
    const tn = target ? name(target) : '';
    const tg = target ? g(target) : undefined;
    let t = '';
    switch (id) {
      case M.clearSky:
        this.weather = 0;
        t = '天气转晴了。';
        break;
      case M.storm:
        this.weather = db.cities[this.setup.city - 1]?.snow && [11, 12, 1, 2].includes(G.month) ? 3 : 2;
        t = this.weather === 3 ? '天降大雪！' : '大雨倾盆而下！';
        break;
      case M.moraleDown:
        target!.morale = clamp(target!.morale - 20, 0, 100);
        t = `${tn}士气下降20点。`;
        break;
      case M.moraleUp:
        target!.morale = clamp(target!.morale + 20, 0, 100);
        t = `${tn}士气上升20点。`;
        break;
      case M.escape: {
        const spots = this.byDistance(this.base[target!.side], target!).filter((i) => !this.unitAt(i));
        if (spots[0] !== undefined) target!.pos = spots[0];
        t = `${tn}安然退回本阵。`;
        break;
      }
      case M.heal:
        tg!.hp = Math.min(tg!.maxHp, tg!.hp + Math.round(tg!.maxHp * 0.4));
        t = `${tn}体力恢复了。`;
        break;
      case M.mpHeal:
        tg!.mp = Math.min(tg!.maxMp, tg!.mp + Math.round(tg!.maxMp * 0.4));
        t = `${tn}技力恢复了。`;
        break;
      case M.reAct:
        target!.acted = false;
        target!.moved = false;
        t = `${tn}可以再次行动。`;
        break;
      case M.sow:
        if (!this.isLord(target!) && tg!.loyalty < 85 && rng.chance(0.4 + (85 - tg!.loyalty) / 60)) {
          target!.state = 'retreated';
          t = `${tn}中了离间之计，率军离开了战场！`;
        } else t = `${tn}不为所动。`;
        break;
      case M.ambush:
        target!.fx[M.ambush] = 3;
        t = `${tn}陷入十面埋伏，无路可逃！`;
        break;
      case M.persuade:
        if (!this.isLord(target!) && rng.chance(clamp((90 - tg!.loyalty) / 60 + (gs.int - tg!.int) / 200, 0.03, 0.6))) {
          target!.state = 'captured';
          t = `${tn}被说服，弃械投降了！`;
        } else t = `${tn}拒绝投降。`;
        break;
      case M.stun:
        target!.fx[M.stun] = 2;
        target!.acted = true;
        t = `${tn}陷入混乱，无法行动！`;
        break;
      case M.forceDuel: {
        const p = this.duelPartner(target!, u);
        if (p) {
          hooks.log(`${name(u)}施展「强迫单挑」！`, 'info');
          const was = p.acted;
          const r = await this.duel(p, target!, hooks, true);
          p.acted = was;
          return { ok: true, text: r.text.join('') };
        }
        t = '没有可以单挑的武将。';
        break;
      }
      case M.exp:
        gainExp(tg!, 40 + tg!.level * 8);
        t = `${tn}获得了经验。`;
        break;
      case M.supply: {
        const add = Math.round(maxSoldiers(tg!) * 0.3);
        tg!.soldiers = Math.min(maxSoldiers(tg!), tg!.soldiers + add);
        t = `${tn}兵力得到补给。`;
        break;
      }
      case M.drain: {
        const n = Math.floor(tg!.soldiers * 0.2);
        tg!.soldiers -= n;
        gs.soldiers = Math.min(maxSoldiers(gs) + 50, gs.soldiers + n);
        t = `${name(u)}从${tn}吸收了${n}名士兵！`;
        break;
      }
      default:
        // timed effects: march/chaos/charge/atk/seal
        if (target) target.fx[id] = id === M.march ? 1 : 3;
        t = `${tn}受到「${m.name}」影响。`;
    }
    t = `${name(u)}施展「${m.name}」成功！${t}`;
    hooks.log(t, 'good');
    return { ok, text: t };
  }

  // ------------------------------------------------------------ turn flow
  beginPhase(s: Side) {
    this.side = s;
    for (const u of this.sideUnits(s)) {
      u.acted = false;
      u.moved = false;
      u.from = u.pos;
      if (u.fx[M.stun]) u.acted = true;
    }
  }
  /** end of a side's phase: tick effects, base holding, victory */
  endPhase(s: Side) {
    for (const u of this.sideUnits(s)) {
      for (const k of Object.keys(u.fx)) if (--u.fx[+k] <= 0) delete u.fx[+k];
      // slow recovery
      const gs = g(u);
      gs.mp = Math.min(gs.maxMp, gs.mp + 2);
    }
    // base capture: the unit that held the enemy base since the end of its own phase
    const o: Side = s === 0 ? 1 : 0;
    const h = this.holding[o];
    if (h && h.state === 'field' && h.pos === this.base[s]) {
      this.end(o, o === 0 && this.castle ? `${this.sideName(0)}军占领主城，攻陷${this.cityName}。` : `${this.sideName(o)}军攻陷敌军本营。`);
      return;
    }
    const occ = this.unitAt(this.base[o]);
    this.holding[s] = occ && occ.side === s ? occ : null;
    this.checkVictory();
    if (s === 1 && this.winner === null) {
      this.round++;
      if (this.round >= MAX_ROUNDS) this.end(1, `${this.sideName(0)}军未能在三十日内攻下${this.cityName}。`);
      else if (this.round % 3 === 0) this.rollWeather();
    }
  }
  checkVictory() {
    if (this.winner !== null) return;
    if (!this.sideUnits(1).length) this.end(0, `${this.sideName(1)}军全军覆没。`);
    else if (!this.sideUnits(0).length) this.end(1, `${this.sideName(0)}军全军覆没。`);
  }
  end(s: Side, reason: string) {
    if (this.winner === null) {
      this.winner = s;
      this.winReason = reason;
    }
  }
  rollWeather() {
    if (rng.chance(0.35)) this.weather = initialWeather(this.setup.city);
  }

  // ------------------------------------------------------------ result
  /** Applies end-of-war effects to G and builds the WarResult. */
  finalize(): WarResult {
    if (this.winner === null) this.end(1, '');
    return finalizeWar(this.setup, this.units, this.winner as Side, [...this.killedIds]);
  }
}

/** Applies end-of-war effects to G (positions, merit) and builds the WarResult. */
export function finalizeWar(setup: WarSetup, units: Unit[], winSide: Side, killed: number[]): WarResult {
  const attackerWon = winSide === 0;
  const captured: number[] = [];
  const retreated: number[] = [];
  for (const u of units) {
    const gs = g(u);
    if (u.state === 'killed') continue;
    if (u.state === 'captured') {
      if (u.side !== winSide) {
        captured.push(u.gid);
        continue;
      }
      // captured by the losers: released at the end of the war
      u.state = 'retreated';
    }
    if (u.side === winSide) {
      if (u.state === 'field') {
        gs.merit += 20;
        gainExp(gs, 30);
      }
      if (u.state === 'retreated' && u.side === 0 && !u.ally) {
        gs.city = setup.from;
        retreated.push(u.gid);
      }
      continue;
    }
    // losing side: everyone leaves the field
    if (u.ally) {
      retreated.push(u.gid); // allies go home (their city is unchanged)
      continue;
    }
    if (u.side === 0) {
      gs.city = setup.from;
      retreated.push(u.gid);
    } else {
      const dest = retreatCity(gs, setup.city);
      if (dest) {
        gs.city = dest;
        retreated.push(u.gid);
      } else captured.push(u.gid);
    }
  }
  return { attackerWon, captured, retreated, killed };
}

/** adjacent city of the general's nation to fall back to (0 = none) */
export function retreatCity(gs: GeneralState, from: number): number {
  const c = db.cities[from - 1];
  const own = (c?.neighbors ?? []).filter((n) => city(n)?.owner === gs.nation && n !== from);
  return own[0] ?? 0;
}

export function cost(formation: number, terrain: number): number {
  const f = db.formations[formation] ?? db.formations[0];
  const v = f?.terrainCost[terrain];
  return v === undefined || !Number.isFinite(v) ? 12 : v;
}

function isEdge(m: FieldMap, i: number) {
  const c = m.col(i), r = m.row(i);
  return c <= 1 || r <= 0 || c >= m.w - 2 || r >= m.h - 2;
}

export function initialWeather(cityId: number): Weather {
  const snowy = (db.cities[cityId - 1]?.snow ?? 0) > 0 && [11, 12, 1, 2].includes(G?.month ?? 6);
  return rng.chance(0.65) ? 0 : snowy ? 3 : 2;
}

export function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}
