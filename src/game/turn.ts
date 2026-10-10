// Month processing (休息 → 他国行动 → 下个月).
import { db } from '../data/db';
import { rng } from '../engine/rng';
import { runNation, resetAIClock, type AIHooks } from './ai';
import { dueEvents, type EventLine } from './events';
import { addFriendship, aliveNations, clamp, cname, gname, grantStartingSkills, incomeOf, isLord, MONEY_MAX, neighbors, nname } from './rules';
import { saveGame } from './save';
import { G, actionPointsFor, assignOfficials, city, citiesOf, generalsOf, monthIndex, nation, recalcVitals } from './state';

export interface TurnHooks extends AIHooks {
  /** show a historical event (dialogue lines) */
  showEvent(name: string, lines: EventLine[], effect: string[]): Promise<void>;
  /** a hidden general came of age / appeared somewhere */
  onAppear?(gid: number, cityId: number): void;
  /** year-end tournament (optional) */
  tournament?(): Promise<void>;
}

export interface TurnReport {
  lines: string[];
  income: number;
}

/** One-time campaign setup (starting skills, inventories). Safe to call on every load. */
export function initCampaign() {
  resetAIClock();
  if (G.inited) return;
  for (const g of G.generals) {
    if (g.status === 'dead') continue;
    grantStartingSkills(g);
    g.merit = Math.max(g.merit, g.level * 25);
  }
  for (const n of G.nations) n.items ??= [];
  G.inited = true;
}

/** Ends the player's month: AI nations act, then the next month begins. */
export async function endMonth(hooks: TurnHooks): Promise<TurnReport> {
  const lines: string[] = [];
  const report = (t: string) => lines.push(t);
  const h: TurnHooks = { ...hooks, report: (t) => { report(t); hooks.report(t); } };

  // ---------------------------------------------------------------- AI
  const order = rng.shuffle(aliveNations().filter((n) => n.id !== G.player).map((n) => n.id));
  for (const nid of order) {
    if (G.over) break;
    if (!nation(G.player)?.alive) break;
    await runNation(nid, h);
  }
  if (!nation(G.player)?.alive || !citiesOf(G.player).length) {
    G.over = 'defeat';
    return { lines, income: 0 };
  }

  // ---------------------------------------------------------------- calendar
  G.month++;
  if (G.month > 12) {
    G.month = 1;
    G.year++;
  }
  const mi = monthIndex(G.year, G.month);
  let playerIncome = 0;

  for (const c of G.cities) {
    if (!c.owner) {
      // unowned cities slowly recover
      c.people = Math.round(c.people * 1.001);
      continue;
    }
    const inc = incomeOf(c);
    c.money = Math.min(MONEY_MAX, c.money + inc);
    if (c.owner === G.player) playerIncome += inc;
    if (c.people > 0) {
      const growth = c.people * (0.0015 + (c.dev / 999) * 0.004);
      c.people = Math.min(600000, Math.round(c.people + growth));
    }
    if (c.training > 60) c.training -= 1;
  }

  for (const g of G.generals) {
    g.acted = false;
    if (g.status === 'hidden' && g.appearAt !== undefined && g.appearAt <= mi && g.city) {
      g.status = 'free';
      g.appearAt = undefined;
      hooks.onAppear?.(g.id, g.city);
      continue;
    }
    if (g.status === 'serving' || g.status === 'free' || g.status === 'prisoner') {
      recalcVitals(g);
      const k = g.status === 'prisoner' ? 0.1 : 0.25;
      g.hp = Math.min(g.maxHp, g.hp + Math.ceil(g.maxHp * k));
      g.mp = Math.min(g.maxMp, g.mp + Math.ceil(g.maxMp * k));
    }
    if (g.status === 'prisoner') g.loyalty = Math.max(0, g.loyalty - rng.int(2, 6));
    if (g.status === 'serving' && !isLord(g)) {
      const just = db.generals[g.id - 1]?.justice ?? 50;
      if (just >= 75 && g.loyalty < 90 && rng.chance(0.3)) g.loyalty++;
      else if (just < 40 && rng.chance(0.25)) g.loyalty--;
      g.loyalty = clamp(g.loyalty, 0, 100);
      // very disloyal officers may desert
      if (g.loyalty < 25 && rng.chance((25 - g.loyalty) / 120)) desert(g.id, report);
    }
  }

  // friendship drifts toward neutral; allies grow closer
  for (const n of aliveNations()) {
    for (const a of n.allies) if (rng.chance(0.2)) addFriendship(n.id, a, 1);
  }

  for (const n of G.nations) {
    if (!n.alive) continue;
    n.ap = actionPointsFor(n.id);
    for (const c of citiesOf(n.id)) assignOfficials(c);
  }

  // ---------------------------------------------------------------- events
  for (const e of dueEvents()) {
    await hooks.showEvent(e.name, e.lines, e.effect);
    for (const t of e.effect) report(t);
  }

  if (G.month === 1 && hooks.tournament) {
    try {
      await hooks.tournament();
    } catch (err) {
      console.warn('tournament failed', err);
    }
  }

  checkEnd();
  if (!G.over) saveGame(0);
  return { lines, income: playerIncome };
}

function desert(gid: number, report: (t: string) => void) {
  const g = G.generals[gid - 1];
  const old = g.nation;
  const c = city(g.city);
  // join a neighbouring enemy lord if any, else go into the wild
  const enemies = neighbors(g.city).map((n) => city(n).owner).filter((o) => o && o !== old);
  const to = enemies.length ? enemies[rng.int(0, enemies.length - 1)] : 0;
  c.reserve += g.soldiers;
  g.soldiers = 0;
  g.title = -1;
  if (to) {
    const dest = neighbors(g.city).find((n) => city(n).owner === to)!;
    g.nation = to;
    g.city = dest;
    g.loyalty = 50;
    assignOfficials(city(dest));
    report(`${gname(gid)}竟然叛变，投靠${nname(to)}了。`);
  } else {
    g.status = 'free';
    g.nation = 0;
    report(`${gname(gid)}离开了${nname(old)}，在${cname(c.id)}下野。`);
  }
  assignOfficials(c);
}

/** Sets G.over when the campaign is decided. */
export function checkEnd() {
  if (!nation(G.player)?.alive || !citiesOf(G.player).length) G.over = 'defeat';
  else if (!aliveNations().some((n) => n.id !== G.player)) G.over = 'victory';
  return G.over;
}

export function playerGenerals() {
  return generalsOf(G.player);
}
