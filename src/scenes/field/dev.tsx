// Dev entry: http://localhost:5173/?dev=field[&city=13][&from=12][&side=def][&auto=1]
// Starts a new game (scenario 1, 刘备) and launches a war on `city` with real
// generals from G: the player's generals attack (or defend with side=def).
import { db } from '../../data/db';
import { unlockAudio } from '../../engine/audio';
import { core } from '../../engine/core';
import type { WarSetup } from '../../game/contracts';
import { city, G, generalsIn, generalsOf, newGame } from '../../game/state';
import { alertBox } from '../../ui/kit';
import { autoWar, runWar } from './index';

export default async function dev() {
  const q = new URLSearchParams(location.search);
  newGame(+(q.get('scenario') ?? 1), q.get('lord') ?? '刘备');
  const target = +(q.get('city') ?? 13);
  const defend = q.get('side') === 'def';
  const tc = city(target);
  const me = G.player;
  // the player's army: up to 6 of the strongest generals
  // dev: make sure the player has a real army (recruit the best free generals)
  if (generalsOf(me).length < 5) {
    const extra = G.generals.filter((x) => x.status === 'free' || x.status === 'hidden').sort((a, b) => b.str - a.str).slice(0, 5);
    for (const x of extra) {
      x.status = 'serving';
      x.nation = me;
      x.title = 5;
      x.soldiers = 400;
    }
  }
  const mine = generalsOf(me).sort((a, b) => b.str + b.int - (a.str + a.int)).slice(0, +(q.get('n') ?? 6));
  // the other side: generals of the city's owner (or of some other nation)
  let enemyNation = tc.owner && tc.owner !== me ? tc.owner : G.nations.find((n) => n.id !== me)!.id;
  let foes = generalsIn(target).filter((x) => x.nation === enemyNation);
  if (!foes.length) foes = generalsOf(enemyNation).slice(0, 5);
  if (!foes.length) {
    enemyNation = G.nations.find((n) => n.id !== me && generalsOf(n.id).length)!.id;
    foes = generalsOf(enemyNation).slice(0, 5);
  }
  foes = foes.slice(0, +(q.get('m') ?? 5));
  const from = +(q.get('from') ?? db.cities[target - 1].neighbors[0]);
  for (const x of [...mine, ...foes]) {
    x.soldiers = Math.max(x.soldiers, 300);
  }
  let setup: WarSetup;
  if (!defend) {
    tc.owner = enemyNation;
    for (const f of foes) f.city = target;
    for (const m of mine) m.city = from;
    setup = { city: target, attacker: me, attackers: mine.map((x) => x.id), from, defenders: foes.map((x) => x.id) };
  } else {
    tc.owner = me;
    for (const m of mine) m.city = target;
    for (const f of foes) f.city = from;
    setup = { city: target, attacker: enemyNation, attackers: foes.map((x) => x.id), from, defenders: mine.map((x) => x.id) };
  }
  if (q.get('test') === 'all') return testAll(setup);
  document.addEventListener('pointerdown', () => unlockAudio(), { once: true });
  if (q.get('auto')) {
    await core.fadeIn();
    const t0 = performance.now();
    const r = autoWar(setup);
    (r as unknown as { ms: number }).ms = Math.round(performance.now() - t0);
    await alertBox(JSON.stringify(r, null, 1), 'autoWar');
    return;
  }
  const r = await runWar(setup);
  (window as unknown as { warResult: unknown }).warResult = r;
  await alertBox(
    `${r.attackerWon ? '攻方胜利' : '守方胜利'}\n俘虏：${r.captured.map((i) => db.generals[i - 1].name).join('、') || '无'}\n撤退：${r.retreated.map((i) => db.generals[i - 1].name).join('、') || '无'}`,
    'runWar 结果',
  );
  void core;
}

/** headless: plays a full AI-vs-AI war on every city map (dev regression test) */
async function testAll(base: WarSetup) {
  const { loadMap } = await import('./map');
  const { War } = await import('./war');
  const { AI } = await import('./ai');
  const { autoBattle } = await import('../battle');
  const { autoDuel } = await import('../duel');
  await core.fadeIn();
  const out: string[] = [];
  const hooks = {
    battle: async (s: Parameters<typeof autoBattle>[0]) => autoBattle(s),
    duel: async (s: Parameters<typeof autoDuel>[0]) => autoDuel(s),
    askDuel: async () => Math.random() < 0.5,
    log: () => {},
  };
  for (let c = 1; c <= 70; c++) {
    try {
      const t0 = performance.now();
      const map = await loadMap(c);
      for (const id of [...base.attackers, ...base.defenders]) {
        const x = G.generals[id - 1];
        x.hp = x.maxHp;
        x.soldiers = 300;
      }
      const w = new War({ ...base, city: c, from: db.cities[c - 1].neighbors[0] ?? 1 }, map);
      const ai = new AI(w);
      let steps = 0;
      while (w.winner === null && steps < 5000) {
        for (const side of [0, 1] as const) {
          if (w.winner !== null) break;
          w.beginPhase(side);
          ai.beginPhase(side);
          for (let k = 0; k < 40; k++) {
            const u = w.sideUnits(side).find((x) => !x.acted);
            if (!u) break;
            const p = ai.plan(u);
            if (p.move !== u.pos) w.move(u, p.move);
            if (p.kind === 'attack') await w.attack(u, p.target, hooks);
            else if (p.kind === 'duel') await w.duel(u, p.target, hooks);
            else if (p.kind === 'gate') w.attackGate(u, p.gate);
            else if (p.kind === 'magic') await w.cast(u, p.id, p.target, hooks);
            else if (p.kind === 'retreat') w.retreat(u);
            else w.finish(u);
            w.checkVictory();
            steps++;
          }
          if (w.winner === null) w.endPhase(side);
        }
      }
      const placed = w.units.filter((u) => u.pos >= 0).length;
      out.push(`${c} ${db.cities[c - 1].name} ${map.w}x${map.h} castle=${w.castle} placed=${placed}/${w.units.length} gates=${w.gates.size} → ${w.winner === 0 ? '攻' : '守'} d${w.day} ${w.winReason} ${Math.round(performance.now() - t0)}ms`);
    } catch (e) {
      out.push(`${c} ERROR ${(e as Error).message}`);
      console.error(e);
    }
  }
  (window as unknown as { testOut: string }).testOut = out.join('\n');
  console.log(out.join('\n'));
}
