// Computer-controlled nations (他国行动). Each AI nation spends its monthly
// action points on the same rules the player uses (src/game/rules.ts).
import { db } from '../data/db';
import { rng } from '../engine/rng';
import type { WarResult, WarSetup } from './contracts';
import {
  aiPrisonerChoice, applyWar, attackTargets, autoAssignSoldiers, autoTitle, canEquip, cityPower, cname, distToFront,
  doConscript, doDevelop, doGiveItem, doMove, doPersuadePrisoner, doSearch, doSowDiscord, doTrain, friendship, gname,
  idle, isAllied, isFront, ITEM_TYPE, makeAlliance, breakAlliance, allianceChance, moveTargets, neighbors, nname, powerOf,
  recruitFree, reserveCap, spendAP, strOf, intOf, type WarHooks, DEV_MAX, now,
} from './rules';
import { G, assignOfficials, city, citiesOf, generalsIn, generalsOf, maxSoldiers, nation, prisonersIn, type GeneralState } from './state';

export interface AIHooks extends WarHooks {
  /** an AI nation attacks a player city: run the interactive war (player defends) */
  playerDefend(setup: WarSetup): Promise<WarResult>;
  /** AI vs AI war */
  autoWar(setup: WarSetup): WarResult;
  /** AI asks the player for an alliance */
  askAlliance(from: number): Promise<boolean>;
  /** line for the turn report */
  report(text: string): void;
}

/** Equip the best gear from the nation's inventory. */
function equipAll(nid: number) {
  const na = nation(nid)!;
  const inv = na.items ?? [];
  if (!inv.length) return;
  const gs = generalsOf(nid).sort((a, b) => b.level - a.level);
  for (const iid of [...inv].sort((a, b) => db.items[b].inc - db.items[a].inc)) {
    const it = db.items[iid];
    for (const g of gs) {
      if (canEquip(g, it)) continue;
      const cur = it.type === ITEM_TYPE.weapon ? g.weapon : it.type === ITEM_TYPE.horse ? g.horse : it.type === ITEM_TYPE.book ? g.book : -2;
      if (cur === -2) {
        // consumables: treasures to the least loyal, tokens/books to anyone who lacks them
        if (it.type === ITEM_TYPE.treasure && g.loyalty > 75) continue;
        doGiveItem(nid, g, iid);
        break;
      }
      if (cur < 0 || db.items[cur].inc < it.inc) {
        doGiveItem(nid, g, iid);
        break;
      }
    }
  }
}

function warSetup(nid: number, from: number, to: number, attackers: GeneralState[]): WarSetup {
  const tc = city(to);
  return {
    city: to,
    attacker: nid,
    attackers: attackers.map((g) => g.id),
    from,
    defenders: generalsIn(to, tc.owner).filter((g) => g.hp > 0).map((g) => g.id),
  };
}

/** Picks an attack for the nation, or null. */
function planAttack(nid: number): { from: number; to: number; gs: GeneralState[] } | null {
  let best: { from: number; to: number; gs: GeneralState[]; score: number } | null = null;
  for (const c of citiesOf(nid)) {
    const targets = attackTargets(nid, c.id);
    if (!targets.length) continue;
    const avail = idle(generalsIn(c.id, nid))
      .filter((g) => g.soldiers >= Math.min(30, maxSoldiers(g) * 0.5) && g.hp > g.maxHp * 0.5)
      .sort((a, b) => powerOf(b) - powerOf(a));
    if (!avail.length) continue;
    for (const t of targets) {
      const tc = city(t);
      // newcomers get a grace period before AI aggression against them
      if (tc.owner === G.player && monthsPlayed() < aiGrace) continue;
      const others = targets.filter((x) => x !== t);
      // leave a garrison when other enemies border this city
      const keep = others.length ? Math.max(1, Math.floor(avail.length / 3)) : avail.length > 2 ? 1 : 0;
      const gs = avail.slice(0, Math.max(0, Math.min(10, avail.length - keep)));
      if (!gs.length) continue;
      const atk = gs.reduce((s, g) => s + powerOf(g), 0);
      const def = cityPower(t) + 20;
      const ratio = atk / def;
      // aggression builds up while a nation sits idle, so evenly matched blocs
      // don't freeze into a years-long stalemate
      const calm = Math.min(12, nation(nid)?.calm ?? 0);
      const needed = tc.owner === G.player ? Math.max(1.15, 1.45 - calm * 0.025) : Math.max(0.95, 1.3 - calm * 0.03);
      if (ratio < needed) continue;
      const score = ratio + (db.cities[t - 1].size === 1 ? 0.3 : 0) + (tc.dev / 999) * 0.2 + rng.next() * 0.3;
      if (!best || score > best.score) best = { from: c.id, to: t, gs, score };
    }
  }
  return best;
}

/** months after a campaign starts before AI may attack the player */
let aiGrace = 3;
export function setAIGrace(n: number) {
  aiGrace = n;
}
function monthsPlayed() {
  return now() - (G.startedAt ?? now());
}
/** Records the campaign start (once). */
export function resetAIClock() {
  G.startedAt ??= now();
}

export async function runNation(nid: number, hooks: AIHooks) {
  const na = nation(nid);
  if (!na || !na.alive) return;
  const R = (t: string) => hooks.report(t);

  // free housekeeping
  for (const g of generalsOf(nid)) autoTitle(g);
  equipAll(nid);
  for (const c of citiesOf(nid)) {
    assignOfficials(c);
    autoAssignSoldiers(c.id);
  }

  // prisoners
  for (const c of citiesOf(nid)) {
    for (const p of prisonersIn(c.id)) {
      if (p.nation !== nid || na.ap <= 1 || !rng.chance(0.5)) continue;
      const agent = idle(generalsIn(c.id, nid)).sort((a, b) => intOf(b) - intOf(a))[0];
      spendAP(nid);
      const r = doPersuadePrisoner(nid, agent ?? null, p.id);
      if (r.ok) R(`${gname(p.id)}投降${na.name}军。`);
    }
  }

  // war
  const maxAttacks = citiesOf(nid).length >= 8 ? 2 : 1;
  let attacked = false;
  for (let k = 0; k < maxAttacks && na.ap > 0; k++) {
    if (!rng.chance(0.55)) break;
    const plan = planAttack(nid);
    if (!plan) break;
    attacked = true;
    spendAP(nid);
    for (const g of plan.gs) g.acted = true;
    const setup = warSetup(nid, plan.from, plan.to, plan.gs);
    const defender = city(plan.to).owner;
    R(`${na.name}军，${gname(plan.gs[0].id)}部队进攻${cname(plan.to)}。`);
    let res: WarResult;
    if (!setup.defenders.length) res = { attackerWon: true, captured: [], retreated: [], killed: [] };
    else if (defender === G.player) res = await hooks.playerDefend(setup);
    else res = hooks.autoWar(setup);
    const sum = await applyWar(setup, res, hooks);
    for (const l of sum.lines) R(l);
    if (!nation(nid)?.alive) return;
  }
  na.calm = attacked ? 0 : (na.calm ?? 0) + 1;

  // domestic actions
  let guard = 60;
  while (na.ap > 0 && guard-- > 0) {
    if (!domesticStep(nid, R)) break;
  }

  // diplomacy
  if (rng.chance(0.08)) {
    const neigh = new Set<number>();
    for (const c of citiesOf(nid)) for (const n of neighbors(c.id)) {
      const o = city(n).owner;
      if (o && o !== nid && !isAllied(nid, o)) neigh.add(o);
    }
    const cand = [...neigh].filter((o) => friendship(nid, o) >= 45);
    const to = rng.pick(cand);
    if (to) {
      if (to === G.player) {
        if (await hooks.askAlliance(nid)) {
          makeAlliance(nid, to);
          R(`我国与${na.name}缔结盟约。`);
        } else breakAllianceSoft(nid, to);
      } else if (rng.chance(allianceChance(nid, to))) {
        makeAlliance(nid, to);
        R(`${na.name}与${nname(to)}缔结盟约。`);
      }
    }
  }
  for (const a of [...na.allies]) {
    if (friendship(nid, a) < 25 && rng.chance(0.3)) {
      breakAlliance(nid, a);
      R(a === G.player ? `${na.name}与我国解除盟约。` : `${na.name}与${nname(a)}解除盟约。`);
    }
  }

  // sow discord against the player now and then
  if (na.ap > 0 && rng.chance(0.12)) {
    const victims = generalsOf(G.player).filter((g) => g.loyalty < 75 && nation(G.player)?.lord !== g.id);
    const v = rng.pick(victims);
    const agent = idle(generalsOf(nid)).sort((a, b) => intOf(b) - intOf(a))[0];
    if (v && agent && neighbors(v.city).some((c) => city(c).owner === nid)) {
      spendAP(nid);
      const r = doSowDiscord(nid, agent, v.id);
      if (r.ok) R(`${gname(v.id)}遭受${na.name}军${gname(agent.id)}的离间。`);
    }
  }
}

function breakAllianceSoft(a: number, b: number) {
  const na = nation(a);
  if (na) na.friendship[b] = Math.max(0, (na.friendship[b] ?? 50) - 5);
}

/** One AP worth of domestic work. Returns false when nothing useful remains. */
function domesticStep(nid: number, R: (t: string) => void): boolean {
  const cities = citiesOf(nid);
  const candidates: { score: number; run: () => void }[] = [];
  for (const c of cities) {
    const gs = idle(generalsIn(c.id, nid));
    if (!gs.length) continue;
    const byInt = [...gs].sort((a, b) => intOf(b) - intOf(a));
    const byStr = [...gs].sort((a, b) => strOf(b) - strOf(a));
    const front = isFront(nid, c.id);
    // expand into empty neighbours
    const empty = moveTargets(nid, c.id).filter((t) => city(t).owner === 0);
    const all = generalsIn(c.id, nid);
    if (empty.length && all.length >= 2) {
      const t = rng.pick(empty)!;
      const g = [...gs].sort((a, b) => powerOf(a) - powerOf(b))[0];
      if (g.id !== nation(nid)!.lord)
        candidates.push({ score: 9 + rng.next(), run: () => { doMove(nid, c.id, t, [g.id]); R(`${nname(nid)}军，${gname(g.id)}部队移动至${cname(t)}。`); R(`${nname(nid)}军占领${cname(t)}。`); } });
    }
    // conscription when generals lack soldiers
    const deficit = all.reduce((s, g) => s + maxSoldiers(g) - g.soldiers, 0) - c.reserve;
    if (deficit > 20 && c.money >= 60 && c.reserve < reserveCap(c) && c.people > 5000)
      candidates.push({ score: (front ? 7 : 5) + rng.next(), run: () => { doConscript(byStr[byStr.length - 1]); autoAssignSoldiers(c.id); } });
    if (c.dev < DEV_MAX && c.people > 0) candidates.push({ score: 4 + (1 - c.dev / DEV_MAX) * 3 + rng.next(), run: () => void doDevelop(byInt[0]) });
    if (c.training < 85 && all.some((g) => g.soldiers > 0)) candidates.push({ score: (front ? 5 : 2.5) + rng.next(), run: () => void doTrain(byStr[0]) });
    if (rng.chance(0.25)) {
      candidates.push({
        score: 3 + rng.next() * 2,
        run: () => {
          const r = doSearch(nid, byInt[0]);
          if (r.found) {
            const rr = recruitFree(nid, byInt[0], r.found);
            if (rr.ok) R(`${gname(r.found)}加入${nname(nid)}军。`);
          }
          if (r.item !== undefined) equipAll(nid);
        },
      });
    }
    // reinforce the front from rear cities
    if (!front && all.length >= 2) {
      const d = distToFront(nid, c.id);
      const step = moveTargets(nid, c.id).filter((t) => city(t).owner === nid && distToFront(nid, t) < d);
      const t = step[0];
      const g = byStr.find((x) => x.id !== nation(nid)!.lord && x.soldiers > 0);
      if (t && g && d < 99) candidates.push({ score: 4.5 + rng.next(), run: () => { doMove(nid, c.id, t, [g.id], Math.floor(c.money * 0.3)); } });
    }
  }
  if (!candidates.length) return false;
  candidates.sort((a, b) => b.score - a.score);
  if (!spendAP(nid)) return false;
  candidates[0].run();
  return true;
}

export { aiPrisonerChoice };
