// Dev entry: http://localhost:5173/?dev=duel — sets up a test situation for this scene.
//   ?dev=duel                 关羽 (player) vs 张角
//   ?dev=duel&l=吕布&r=关羽    custom pair (left = player)
//   ?dev=duel&ai=1            AI vs AI (watch / skip)
//   ?dev=duel&arena=1         比武大会
//   ?dev=duel&sim=1           balance report in the console (window.__duelStats)
import { db } from '../../data/db';
import { core, Scene } from '../../engine/core';
import { newGame } from '../../game/state';
import { Btn } from '../../ui/kit';
import { runArena, runDuel } from './index';
import { DuelSim, duelRating, fighterStats } from './rules';

class DevHome extends Scene {
  constructor(private text: string, private again: () => void) {
    super();
  }
  enter() {
    this.renderUI(
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1em', background: '#140a05' }}>
        <div class="kai" style={{ fontSize: '1.6em', whiteSpace: 'pre-wrap', textAlign: 'center' }}>{this.text}</div>
        <Btn class="big primary" onClick={this.again}>再来一次</Btn>
      </div>,
    );
  }
}

export default async function dev() {
  newGame(1, '刘备');
  const q = new URLSearchParams(location.search);
  const id = (name: string | null, d: string) => (db.generalByName.get(name ?? d) ?? db.generalByName.get(d)!).id;

  if (q.get('sim')) {
    const pairs: [string, string][] = [['关羽', '张角'], ['吕布', '关羽'], ['张飞', '赵云'], ['刘备', '张角'], ['诸葛亮', '吕布'], ['关羽', '张飞']];
    const out: Record<string, unknown> = {};
    for (const [l, r] of pairs) {
      const s = { left: id(l, l), right: id(r, r), leftHuman: false, rightHuman: false };
      let wl = 0, wr = 0, dr = 0, hp = 0;
      const t0 = performance.now();
      let ticks = 0, supers = 0, timeouts = 0;
      for (let i = 0; i < 200; i++) {
        const sim = new DuelSim(fighterStats(s.left), fighterStats(s.right), [true, true]);
        while (!sim.over) {
          sim.step();
          for (const e of sim.events) if (e.k === 'super') supers++;
          sim.events.length = 0;
        }
        ticks += sim.t;
        if (sim.over.reason === 'time') timeouts++;
        const res = sim.result();
        if (res.winner === 'left') wl++;
        else if (res.winner === 'right') wr++;
        else dr++;
        hp += res.winner === 'left' ? res.leftHp : res.rightHp;
      }
      const a = fighterStats(s.left), b = fighterStats(s.right);
      out[`${l}-${r}`] = { wl, wr, dr, secs: Math.round(ticks / 200 / 30), supers: +(supers / 200).toFixed(1), timeouts, avgWinnerHp: Math.round(hp / 200), a: [a.power, a.maxHp, Math.round(duelRating(a.id))], b: [b.power, b.maxHp, Math.round(duelRating(b.id))], ms: Math.round(performance.now() - t0) };
    }
    // a scripted "average human" on the left vs the AI
    const bot = (l: string, r: string) => {
      let w = 0;
      for (let i = 0; i < 200; i++) {
        const sim = new DuelSim(fighterStats(id(l, l)), fighterStats(id(r, r)), [false, true]);
        let seen = -1, planAt = -1, plan: 'guard' | 'light' | 'heavy' | null = null, nextAt = 0;
        while (!sim.over) {
          const me = sim.f[0], op = sim.f[1];
          if (op.state === 'windup' && op.windupStart !== seen) {
            seen = op.windupStart;
            if (op.move === 'heavy' && Math.random() < 0.6) { plan = 'guard'; planAt = sim.t + 9 + Math.floor(Math.random() * 5); }
            else if (op.move === 'super' && Math.random() < 0.5) { plan = 'guard'; planAt = sim.t + 10; }
          }
          if (plan && sim.t >= planAt) { sim.act(0, plan); plan = null; }
          if (me.state === 'guard' && op.state !== 'windup' && Math.random() < 0.2) sim.act(0, 'unguard');
          if (me.state === 'idle' && sim.t >= nextAt) {
            nextAt = sim.t + 6 + Math.floor(Math.random() * 14);
            if (me.fury >= 100) sim.act(0, 'super');
            else if (op.state === 'stagger' && op.t > 18) sim.act(0, 'heavy');
            else sim.act(0, Math.random() < 0.75 ? 'light' : 'heavy');
          }
          sim.step();
          sim.events.length = 0;
        }
        if (sim.over.winner === 'left') w++;
      }
      return w / 2;
    };
    out.bot = { '关羽-张角': bot('关羽', '张角'), '刘备-张角': bot('刘备', '张角'), '关羽-吕布': bot('关羽', '吕布'), '张飞-关羽': bot('张飞', '关羽'), '诸葛亮-吕布': bot('诸葛亮', '吕布') };
    (window as unknown as { __duelStats: unknown }).__duelStats = out;
    console.log(JSON.stringify(out, null, 1));
  }

  const loop = async () => {
    if (q.get('arena')) {
      const r = await runArena();
      await core.go(new DevHome(`优胜：${db.generals[r.winner - 1].name}\n排名：${r.ranking.map((g) => db.generals[g - 1].name).join('、')}`, () => void loop()));
      return;
    }
    const ai = !!q.get('ai');
    const setup = { left: id(q.get('l'), '关羽'), right: id(q.get('r'), '张角'), leftHuman: !ai, rightHuman: false };
    const r = await runDuel(setup, { background: q.get('bg') ?? undefined, variant: q.get('var') ? +q.get('var')! : undefined });
    const name = (g: number) => db.generals[g - 1].name;
    const txt = r.winner === 'draw' ? '平手' : `${name(r.winner === 'left' ? setup.left : setup.right)} 胜`;
    await core.go(new DevHome(`${txt}\n${name(setup.left)} HP ${r.leftHp} · ${name(setup.right)} HP ${r.rightHp}`, () => void loop()));
  };
  void loop();
  // let main.ts remove the boot overlay once the first scene is up
  await new Promise((r) => setTimeout(r, 600));
}
