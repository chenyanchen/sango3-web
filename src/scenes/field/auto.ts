// autoWar: instant, map-less resolution of a war between two AI sides. Uses the
// same unit model and end-of-war rules as the interactive war, with clashes
// resolved by autoBattle/autoDuel. Each round every unit may engage once;
// attackers storm the city when they clearly dominate.
import { rng } from '../../engine/rng';
import { Terrain, type BattleSetup, type WarResult, type WarSetup } from '../../game/contracts';
import { city, G, gainExp, gen, maxSoldiers } from '../../game/state';
import { autoBattle } from '../battle';
import { autoDuel } from '../duel';
import { power } from './ai';
import { clamp, finalizeWar, g, initialWeather, MAX_ROUNDS, type Side, type Unit } from './war';

export function autoWar(setup: WarSetup): WarResult {
  const units: Unit[] = [];
  const add = (ids: number[] | undefined, side: Side, ally: boolean) => {
    for (const id of ids ?? []) {
      if (!gen(id)) continue;
      const tr = side === 0 ? city(setup.from)?.training : city(setup.city)?.training;
      units.push({
        gid: id, side, ally, human: false, pos: -1, morale: clamp(Math.round((tr ?? 50) * 0.7 + 30), 20, 100),
        acted: false, moved: false, from: -1, state: 'field', fx: {}, wins: 0, kills: 0,
      });
    }
  };
  add(setup.attackers, 0, false);
  add(setup.attackerAllies, 0, true);
  add(setup.defenders, 1, false);
  add(setup.defenderAllies, 1, true);
  const live = (s: Side) => units.filter((u) => u.side === s && u.state === 'field');
  const killed: number[] = [];
  const weather = initialWeather(setup.city);
  const isLord = (u: Unit) => G.nations.some((n) => n.lord === u.gid);

  const defeat = (u: Unit, by: Unit, pCap: number) => {
    if (rng.chance(pCap)) {
      if (!isLord(u) && rng.chance(0.03)) {
        u.state = 'killed';
        killed.push(u.gid);
      } else {
        u.state = 'captured';
        g(by).merit += 30;
        gainExp(g(by), 40);
      }
    } else u.state = 'retreated';
  };

  let winner: Side | null = live(1).length ? null : 0;
  if (!live(0).length) winner = 1;
  for (let round = 0; round < MAX_ROUNDS && winner === null; round++) {
    // approach: the first two days are mostly marching
    const engageP = round < 3 ? 0.25 : 0.8;
    for (const u of rng.shuffle(units.filter((x) => x.state === 'field'))) {
      if (u.state !== 'field' || !rng.chance(engageP)) continue;
      const foes = live(u.side === 0 ? 1 : 0);
      if (!foes.length) break;
      const myP = power(u);
      // pick the weakest reachable foe (with some noise)
      const t = foes.map((f) => ({ f, s: power(f) * rng.range(0.7, 1.3) })).sort((a, b) => a.s - b.s)[0].f;
      const ratio = myP / Math.max(1, power(t));
      const gs = g(u), gt = g(t);
      if (u.side === 0 && gs.soldiers < maxSoldiers(gs) * 0.08 && gs.hp < gs.maxHp * 0.25 && !isLord(u)) {
        u.state = 'retreated';
        continue;
      }
      if (ratio < (u.side === 0 ? 0.8 : 1.0) && rng.chance(0.7)) continue;
      // duel?
      if (gs.str - gt.str >= 10 && gs.hp > gs.maxHp * 0.6 && rng.chance(0.3)) {
        const p = clamp(0.5 + (gt.str - gs.str) / 45, 0.05, 0.97);
        if (!rng.chance(p)) {
          t.morale = clamp(t.morale - 12, 0, 100);
          continue;
        }
        const r = autoDuel({ left: u.gid, right: t.gid, leftHuman: false, rightHuman: false });
        gs.hp = clamp(Math.round(r.leftHp), 0, gs.maxHp);
        gt.hp = clamp(Math.round(r.rightHp), 0, gt.maxHp);
        if (r.winner === 'draw') continue;
        const [w, l] = r.winner === 'left' ? [u, t] : [t, u];
        gainExp(g(w), 60);
        g(w).merit += 25;
        if (g(l).hp <= 0) defeat(l, w, 0.55);
        else l.state = 'retreated';
        continue;
      }
      const side = (x: Unit) => ({
        general: x.gid, soldiers: g(x).soldiers, soldierType: g(x).soldierType, formation: g(x).formation, human: false, morale: x.morale,
      });
      const setupB: BattleSetup = {
        left: side(u), right: side(t), terrain: u.side === 0 ? Terrain.Road : Terrain.Plain,
        time: (round % 3) as 0 | 1 | 2, weather,
      };
      const r = autoBattle(setupB);
      const win = r.winner === 'draw' ? null : r.winner === 'left' ? u : t;
      for (const [x, rr] of [[u, r.left], [t, r.right]] as const) {
        const xg = g(x);
        xg.soldiers = Math.max(0, Math.round(rr.soldiersLeft));
        xg.hp = clamp(Math.round(rr.hp), 0, xg.maxHp);
        xg.mp = clamp(Math.round(rr.mp), 0, xg.maxMp);
        gainExp(xg, rr.kills * 2 + 30 + (win === x ? 50 : 0));
        if (win === x) {
          xg.merit += 10 + Math.round(rr.kills / 10);
          x.morale = clamp(x.morale + 5, 0, 100);
        } else x.morale = clamp(x.morale - 5, 0, 100);
      }
      for (const [x, rr, o] of [[u, r.left, t], [t, r.right, u]] as const) {
        if (rr.defeated || rr.hp <= 0) defeat(x, o, 0.35);
        else if (rr.fled) x.state = 'retreated';
        else if (win && win !== x && g(x).soldiers <= 0 && rng.chance(0.4)) x.state = 'retreated';
      }
    }
    if (!live(1).length) winner = 0;
    else if (!live(0).length) winner = 1;
    else {
      // storming the city: overwhelming attackers take the castle
      const pa = live(0).reduce((s, u) => s + power(u), 0);
      const pd = live(1).reduce((s, u) => s + power(u), 0);
      if (round >= 6 && pa > pd * 2.5 && rng.chance(0.25)) winner = 0;
    }
  }
  if (winner === null) winner = 1;
  return finalizeWar(setup, units, winner, killed);
}
