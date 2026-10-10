// Dev entry: http://localhost:5173/?dev=battle
//   &l=关羽 &r=张角          generals (left = player)
//   &ls=120 &rs=150          soldier counts
//   &lt=3 &rt=0              soldier types (0..8)
//   &lf=0 &rf=1              formations (0..7)
//   &lm=60 &rm=60            morale
//   &t=1 &time=0..2 &w=0..4  terrain / time of day (default 1 黄昏) / weather (default 1 阴)
//   &bg=6                    force background set
//   &sk=10,47,85             give the left general these 武将技 (default: a showcase set)
//   &rsk=...                 skills for the right general
//   &auto=1                  both sides computer controlled
//   &lh=38009                left general horse item/object id (default 赤兔 for 关羽)
import { db } from '../../data/db';
import { core } from '../../engine/core';
import type { BattleSetup, Terrain, TimeOfDay, Weather } from '../../game/contracts';
import { G, newGame } from '../../game/state';
import { autoBattle, runBattle } from './index';

export default async function dev() {
  newGame(1, '刘备');
  const q = new URLSearchParams(location.search);
  const num = (k: string, d: number) => (q.has(k) ? Number(q.get(k)) : d);
  const gid = (name: string) => db.generalByName.get(name)?.id ?? 1;
  const left = gid(q.get('l') ?? '关羽');
  const right = gid(q.get('r') ?? '张角');
  const prep = (id: number, skills: number[], horse: number) => {
    const g = G.generals[id - 1];
    g.level = Math.max(g.level, 18);
    g.hp = g.maxHp;
    g.mp = g.maxMp = Math.max(g.maxMp, 160);
    g.bfMagic = skills;
    if (horse) {
      const it = db.items.find((x) => x.type === 4 && (x.id === horse || x.attribute === horse));
      if (it) g.horse = it.id;
    }
    const wp = db.items.find((x) => x.type === 2 && x.name === db.generals[id - 1].weapon);
    if (wp) g.weapon = wp.id;
  };
  const list = (k: string, d: number[]) => (q.has(k) ? q.get(k)!.split(',').map(Number).filter(Boolean) : d);
  prep(left, list('sk', [1, 46, 85, 67, 78, 105, 119, 11, 58, 64, 72, 123]), num('lh', 38009));
  prep(right, list('rsk', [10, 23, 37, 4, 50]), num('rh', 0));
  const setup: BattleSetup = {
    left: { general: left, soldiers: num('ls', 120), soldierType: num('lt', 3), formation: num('lf', 0), human: !q.has('auto'), morale: num('lm', 70) },
    right: { general: right, soldiers: num('rs', 180), soldierType: num('rt', 5), formation: num('rf', 1), human: false, morale: num('rm', 60) },
    terrain: num('t', 1) as Terrain,
    time: num('time', 1) as TimeOfDay,
    weather: num('w', 1) as Weather,
    background: q.has('bg') ? num('bg', 1) : undefined,
  };
  const preview = autoBattle(setup);
  (window as unknown as { __auto: unknown }).__auto = preview;
  console.log('autoBattle preview', preview);
  for (;;) {
    if (q.has('speed')) setTimeout(() => (core.speed = num('speed', 1)), 2500);
    const res = await runBattle(setup);
    console.log('battle result', res);
  }
}
