// 内政 strategy map scene: China map + HUD + monthly commands + turn loop.
import { useState } from 'preact/hooks';
import { db } from '../../data/db';
import { playMusic, sfx } from '../../engine/audio';
import { modalKey } from '../../engine/keys';
import { core, Scene } from '../../engine/core';
import { rng } from '../../engine/rng';
import type { WarResult, WarSetup } from '../../game/contracts';
import type { EventLine } from '../../game/events';
import {
  aiPrisonerChoice, applyWar, cname, gname, hasIntel, incomeOf, intOf, isLord, lordCity, nname, reserveCap, SIZE_NAMES,
  totalMoney, totalSoldiers, apOf, friendship, isAllied, neighbors, availableTitles,
} from '../../game/rules';
import { loadGame } from '../../game/save';
import { G, addLog, city, citiesOf, gen, generalsIn, generalsOf, nation, prisonersIn, actionPointsFor, assignOfficials } from '../../game/state';
import { checkEnd, endMonth, initCampaign, type TurnHooks } from '../../game/turn';
import { Bar, Btn, confirmBox, isModalOpen, modal, Panel, Portrait, toast } from '../../ui/kit';
import { cityReport, GROUPS, prisonerDialog, runCommand, warHooks, type Command, type Ctx, type Group } from './commands';
import { MapView, type MarkKind } from './map';
import { Court, GeneralTable, say, sayShape, showGeneral } from './ui';
import './strategy.css';

interface Pick {
  prompt: string;
  resolve: (id: number) => void;
  targets: Set<number>;
}

export class StrategyScene extends Scene {
  private map = new MapView();
  private selCity = 0;
  private group: Group | null = null;
  private pick: Pick | null = null;
  private busy = '';
  private live: string[] = [];
  private hovered = 0;
  private panelOpen = core.width > 720;
  private logOpen = false;
  private keyHandler = (e: KeyboardEvent) => this.onKey(e);
  private ctx!: Ctx;

  async enter() {
    initCampaign();
    await syncNationColors();
    await this.map.load();
    this.root.addChild(this.map.world);
    this.map.onSelect = (id) => this.select(id, true);
    this.map.onHover = (id) => {
      this.hovered = id;
      this.draw();
    };
    this.ctx = this.makeCtx();
    this.selCity = lordCity(G.player) || citiesOf(G.player)[0]?.id || 1;
    this.map.select(this.selCity);
    window.addEventListener('keydown', this.keyHandler);
    this.playBgm();
    this.draw(); // measures the HUD first so the capital is centred in the uncovered area
    this.map.centerOn(this.selCity, false, this.map.z * 1.1);
    (window as unknown as { __G: unknown }).__G = G;
    if (import.meta.env.DEV || new URLSearchParams(location.search).has('dev')) {
      const w = window as unknown as Record<string, unknown>;
      w.__S = this;
      w.__db = db;
      void import('../../game/rules').then((m) => (w.__rules = m));
      void import('../../game/state').then((m) => (w.__state = m));
      w.__grace = (n: number) => void import('../../game/ai').then((m) => m.setAIGrace(n));
      // headless simulation of n months (player passes; AI decides everything)
      w.__sim = async (months = 12) => {
        const f = await this.loadField();
        const out: string[] = [];
        for (let i = 0; i < months && !G.over; i++) {
          const r = await endMonth({
            decide: async (c, p) => aiPrisonerChoice(c, p),
            playerDefend: async (st) => f.autoWar(st),
            autoWar: (st) => f.autoWar(st),
            askAlliance: async () => false,
            report: () => {},
            showEvent: async () => {},
          });
          out.push(...r.lines.map((l) => `${G.year}.${G.month} ${l}`));
        }
        await this.map.refresh();
        this.draw();
        return out;
      };
    }
    if (G.over) setTimeout(() => void this.finish(), 300);
    else if (G.log.length === 0) setTimeout(() => void this.intro(), 400);
  }

  exit() {
    window.removeEventListener('keydown', this.keyHandler);
    this.map.destroy();
    super.exit();
  }

  tick() {
    this.map.tick();
  }
  frame(dt: number) {
    this.map.frame(dt);
  }
  resize(w: number, h: number) {
    this.updateSafe();
    this.map.layout(w, h);
  }

  /** Screen rects of the HUD panels that cover the map. */
  private hudRects() {
    return ['.sg-top', '.sg-menu', '.sg-cpanel', '.sg-cpanel-tab', '.sg-log', '.sg-zoom']
      .map((q) => this.ui.querySelector(q)?.getBoundingClientRect())
      .filter((r): r is DOMRect => !!r && r.width > 0);
  }

  /** Tells the map which screen margins are covered by the HUD. */
  private updateSafe() {
    const q = (sel: string) => this.ui.querySelector(sel)?.getBoundingClientRect();
    const menu = q('.sg-menu');
    const panel = q('.sg-cpanel');
    const s = { l: menu ? Math.round(menu.right) : 0, t: 0, r: panel ? Math.round(core.width - panel.left) : 0, b: 0 };
    // a wide panel on a narrow screen: don't let the insets swallow the map
    if (s.l + s.r > core.width * 0.7) s.r = Math.max(0, Math.round(core.width * 0.7 - s.l));
    const o = this.map.safe;
    if (o.l !== s.l || o.r !== s.r || o.t !== s.t || o.b !== s.b) this.map.safe = s;
  }
  resume() {
    this.playBgm();
    void this.map.refresh();
    this.draw();
  }

  private playBgm() {
    const b = nation(G.player)?.bgm ?? 7;
    playMusic(`ad00${Math.max(1, Math.min(3, b - 6))}`);
  }

  private async intro() {
    const n = nation(G.player);
    if (!n) return;
    addLog(`${n.name}军，${G.year}年${G.month}月起兵。`);
    await say(n.lord, `天下大乱，群雄并起。\n我${n.name}必当招贤纳士、富国强兵，平定四方！\n\n（选择城池后，从左侧选单下达指令；行动点数用完后选择「休息」进入下个月。）`, `${G.year}年${G.month}月`, 1);
    this.draw();
  }

  // ---------------------------------------------------------------- context for commands
  private makeCtx(): Ctx {
    return {
      map: this.map,
      sel: () => this.selCity,
      select: (id) => this.select(id),
      refresh: () => {
        void this.map.refresh();
        this.draw();
      },
      pickCity: (targets, kind, prompt) => this.pickCity(targets, kind, prompt),
      war: (setup) => this.playerWar(setup),
      endMonth: () => this.doEndMonth(),
      loadSlot: async (slot) => {
        if (loadGame(slot)) {
          const { go } = await import('../registry');
          void go.strategy();
        } else toast('读取失败');
      },
      toTitle: () => void import('../registry').then((m) => m.go.title()),
    };
  }

  select(id: number, fromMap = false) {
    if (this.pick) return;
    this.selCity = id;
    this.map.select(id);
    if (fromMap) sfx('touch', { volume: 0.4 });
    if (fromMap && !this.panelOpen && core.width <= 720) this.panelOpen = true;
    this.draw();
    // keep the selected city out from under the HUD (city panel, menu…)
    this.map.ensureVisible(id, this.hudRects());
  }

  pickCity(targets: number[], kind: MarkKind, prompt: string): Promise<number> {
    if (!targets.length) return Promise.resolve(-1);
    return new Promise((resolve) => {
      const set = new Set(targets);
      const done = (id: number) => {
        this.pick = null;
        this.map.pickHandler = null;
        this.map.setMarks(new Map());
        this.draw();
        resolve(id);
      };
      this.pick = { prompt, resolve: done, targets: set };
      this.map.setMarks(new Map(targets.map((t) => [t, kind])));
      this.map.pickHandler = (id) => {
        if (set.has(id)) {
          sfx('accept', { volume: 0.6 });
          done(id);
        } else sfx('sorry', { volume: 0.5 });
      };
      this.group = null;
      this.draw();
    });
  }

  private onKey(e: KeyboardEvent) {
    if (core.scene !== this) return;
    if (isModalOpen()) {
      modalKey(e);
      return;
    }
    const k = e.key;
    if (k === 'Escape') {
      if (this.pick) this.pick.resolve(-1);
      else if (this.group) this.group = null;
      this.draw();
      return;
    }
    if (this.busy || this.pick) return;
    // submenu keyboard navigation: ↑/↓ move between commands, Enter runs it
    if (this.group && (k === 'ArrowDown' || k === 'ArrowUp')) {
      e.preventDefault();
      const btns = [...this.ui.querySelectorAll<HTMLButtonElement>('.sg-sbtn:not(:disabled)')];
      if (btns.length) {
        const i = btns.indexOf(document.activeElement as HTMLButtonElement);
        const n = i < 0 ? (k === 'ArrowDown' ? 0 : btns.length - 1) : (i + (k === 'ArrowDown' ? 1 : btns.length - 1)) % btns.length;
        btns[n].focus();
      }
      return;
    }
    const pan = 60;
    if (k === 'ArrowLeft' || k === 'a') this.map.pan(pan, 0);
    else if (k === 'ArrowRight' || k === 'd') this.map.pan(-pan, 0);
    else if (k === 'ArrowUp' || k === 'w') this.map.pan(0, pan);
    else if (k === 'ArrowDown' || k === 's') this.map.pan(0, -pan);
    else if (k === '+' || k === '=') this.map.zoomAt(core.width / 2, core.height / 2, 1.2);
    else if (k === '-') this.map.zoomAt(core.width / 2, core.height / 2, 1 / 1.2);
    else if (k === 'Tab') {
      e.preventDefault();
      const own = citiesOf(G.player).map((c) => c.id);
      if (own.length) {
        const i = own.indexOf(this.selCity);
        const n = own[(i + (e.shiftKey ? own.length - 1 : 1)) % own.length];
        this.select(n);
        this.map.centerOn(n);
      }
    } else {
      const g = GROUPS.find((x) => x.hot === k);
      if (g) {
        this.openGroup(g);
        // keyboard users: focus the first command so ↑/↓ + Enter work right away
        if (this.group === g) this.ui.querySelector<HTMLButtonElement>('.sg-sbtn:not(:disabled)')?.focus();
      }
    }
  }

  private openGroup(g: Group) {
    if (this.busy || G.over) return;
    sfx('touch', { volume: 0.5 });
    if (g.direct) {
      this.group = null;
      this.draw();
      void g.direct(this.ctx).then(() => this.draw());
      return;
    }
    this.group = this.group === g ? null : g;
    this.draw();
  }

  private runCmd(c: Command) {
    this.group = null;
    this.draw();
    void runCommand(this.ctx, c).then(() => this.draw());
  }

  // ---------------------------------------------------------------- war (player attacks)
  private async loadField() {
    return import('../field');
  }

  /** Interactive war (falls back to auto resolution on failure; ?autowar in dev URLs skips the field). */
  private async fight(setup: WarSetup): Promise<WarResult> {
    const f = await this.loadField();
    if (new URLSearchParams(location.search).has('autowar')) return f.autoWar(setup);
    try {
      return await f.runWar(setup);
    } catch (e) {
      console.error('runWar failed', e);
      return f.autoWar(setup);
    }
  }

  private async playerWar(setup: WarSetup) {
    let res: WarResult;
    if (!setup.defenders.length) {
      res = { attackerWon: true, captured: [], retreated: [], killed: [] };
      await say(setup.attackers[0], `${nname(city(setup.city).owner)}军放弃防守${cname(setup.city)}。`, '战争');
    } else {
      this.busy = '战争中…';
      this.draw();
      res = await this.fight(setup);
      this.busy = '';
      this.playBgm();
    }
    const sum = await applyWar(setup, res, warHooks(this.ctx));
    await this.map.refresh();
    if (res.attackerWon) this.select(setup.city);
    this.draw();
    sfx(res.attackerWon ? 'win' : 'lose');
    await say(
      setup.attackers.find((id) => gen(id).status === 'serving' && gen(id).nation === G.player) ?? (nation(G.player)?.alive ? nation(G.player)!.lord : undefined),
      (res.attackerWon ? `我军攻陷${cname(setup.city)}！` : `我军作战失败了‧‧‧`) + '\n\n' + sum.lines.join('\n'),
      '战争结果',
    );
    if (checkEnd()) await this.finish();
  }

  // ---------------------------------------------------------------- AI attacks the player
  private async playerDefend(setup: WarSetup): Promise<WarResult> {
    const c = setup.city;
    const att = setup.attacker;
    this.map.centerOn(c);
    this.select(c);
    await this.map.ride(setup.from, c, true);
    sfx('charge-00', { volume: 0.7 });
    const defs = setup.defenders;
    if (!defs.length) {
      await say(setup.attackers[0], `${nname(att)}军，${gname(setup.attackers[0])}部队进攻${cname(c)}！\n${cname(c)}无人防守，城池失陷了‧‧‧`, '敌军来袭');
      return { attackerWon: true, captured: [], retreated: [], killed: [] };
    }
    const canFlee = neighbors(c).some((n) => city(n).owner === G.player);
    const atkSol = setup.attackers.reduce((s, id) => s + gen(id).soldiers, 0);
    const defSol = defs.reduce((s, id) => s + gen(id).soldiers, 0);
    const k = await modal<number>((close) => (
      <Court bg={1}>
        <Panel title="敌军来袭" class="modal sg-say">
          <div class="body row" style={{ gap: '1em', alignItems: 'flex-start' }}>
            <Portrait general={setup.attackers[0]} />
            <div class="col">
              <div class="sg-saytext">
                {`${nname(att)}军，${gname(setup.attackers[0])}部队进攻${cname(c)}！\n`}
                {`敌将 ${setup.attackers.length} 名 · 兵力 ${atkSol}\n我军守将 ${defs.length} 名 · 兵力 ${defSol}`}
              </div>
              <div class="dim" style={{ fontStyle: 'italic' }}>{`「大胆${nname(att)}，竟敢犯我${cname(c)}。」—— ${gname(defs[0])}`}</div>
            </div>
          </div>
          <div class="actions">
            {canFlee ? <Btn onClick={() => close(1)}>放弃城池</Btn> : null}
            <Btn class="primary" onClick={() => close(0)}>迎　战</Btn>
          </div>
        </Panel>
      </Court>
    ));
    if (k === 1 && canFlee) {
      const dest = neighbors(c).filter((n) => city(n).owner === G.player);
      for (const id of defs) gen(id).city = dest[0];
      for (const g of generalsIn(c, G.player)) g.city = dest[0];
      assignOfficials(city(dest[0]));
      await say(defs[0], `我军放弃防守${cname(c)}，撤退至${cname(dest[0])}。`, '撤退');
      return { attackerWon: true, captured: [], retreated: [], killed: [] };
    }
    this.busy = '战争中…';
    this.draw();
    const res = await this.fight(setup);
    this.busy = '他国行动中…';
    this.playBgm();
    this.draw();
    sfx(res.attackerWon ? 'lose' : 'win');
    await say(defs.find((id) => gen(id).status === 'serving') ?? nation(G.player)!.lord, res.attackerWon ? `${cname(c)}失陷了‧‧‧` : `我军击退${nname(att)}军！`, '战争结果');
    return res;
  }

  // ---------------------------------------------------------------- month end
  private async doEndMonth() {
    if (this.busy) return;
    this.busy = '他国行动中…';
    this.live = [];
    this.group = null;
    this.draw();
    const turnHooks: TurnHooks = {
      ...warHooks(this.ctx),
      decide: async (captor, pid) => {
        if (captor === G.player) return prisonerDialog(pid);
        return aiPrisonerChoice(captor, pid);
      },
      playerDefend: (s) => this.playerDefend(s),
      autoWar: (s) => this.autoWarSync(s),
      askAlliance: (from) => this.askAlliance(from),
      report: (t) => {
        this.live.push(t);
        if (this.live.length > 6) this.live.shift();
        this.draw();
      },
      showEvent: (name, lines, effect) => this.showEvent(name, lines, effect),
      onAppear: (gid, cid) => {
        if (city(cid).owner === G.player) addLog(`听说${gname(gid)}在${cname(cid)}出现。`);
      },
      tournament: () => this.tournament(),
    };
    this.fieldMod = await this.loadField();
    let rep;
    try {
      rep = await endMonth(turnHooks);
    } catch (e) {
      console.error(e);
      toast('回合处理发生错误：' + String(e instanceof Error ? e.message : e));
      rep = { lines: [], income: 0 };
    }
    this.busy = '';
    await this.map.refresh();
    if (!city(this.selCity) || (city(this.selCity).owner !== G.player && citiesOf(G.player).length)) this.select(lordCity(G.player) || citiesOf(G.player)[0].id);
    this.draw();
    if (G.over) {
      await this.finish();
      return;
    }
    await this.showReport(rep.lines, rep.income);
  }

  private fieldMod: typeof import('../field') | null = null;
  private autoWarSync(s: WarSetup): WarResult {
    try {
      return this.fieldMod!.autoWar(s);
    } catch (e) {
      console.error('autoWar failed', e);
      return { attackerWon: rng.chance(0.5), captured: [], retreated: [], killed: [] };
    }
  }

  private async showReport(lines: string[], income: number) {
    playMusic(`report00${rng.int(1, 3)}`);
    const n = nation(G.player)!;
    const promotable = generalsOf(G.player).filter((g) => availableTitles(g).some((t) => t.soldiers > (db.titles[g.title]?.soldiers ?? 0))).length;
    await modal<void>((close) => (
      <Court bg={2}>
        <Panel title={`${G.year}年${G.month}月 · 他国行动`} class="modal sg-report">
          <div class="body">
            <div class="sg-report-head">
              <span>本月收入 <b class="gold">+{income}</b></span>
              <span>金钱 <b>{totalMoney(G.player)}</b></span>
              <span>行动点数 <b>{n.ap}</b></span>
              <span>城池 <b>{citiesOf(G.player).length}</b></span>
            </div>
            <div class="list sg-scroll sg-report-list">
              {lines.length ? lines.map((l) => <div class={l.includes(n.name) || l.includes('我') ? 'gold' : ''}>{l}</div>) : <div class="dim">各国按兵不动。</div>}
              {promotable ? <div class="sg-hint">有 {promotable} 名武将可晋升官职（任免 → 将军 → 自动任命），提高带兵数。</div> : null}
            </div>
          </div>
          <div class="actions">
            <Btn class="primary" onClick={() => close()}>确定</Btn>
          </div>
        </Panel>
      </Court>
    ));
    this.live = [];
    this.playBgm();
    this.draw();
  }

  private async showEvent(name: string, lines: EventLine[], effect: string[]) {
    playMusic('event');
    await modal<void>((close) => (
      <Court bg={3}>
        <Panel title="历史事件" class="modal sg-say sg-event">
          <div class="body sg-eventname kai">{name}</div>
          <div class="actions"><Btn class="primary" onClick={() => close()}>观看</Btn></div>
        </Panel>
      </Court>
    ));
    for (const l of lines) {
      const go = await sayShape(l.shape, l.general, l.name, l.text, 3);
      if (!go) break;
    }
    if (effect.length) await say(undefined, effect.join('\n'), name, 3);
    await this.map.refresh();
    this.draw();
    this.playBgm();
  }

  private async askAlliance(from: number): Promise<boolean> {
    const n = nation(from)!;
    const envoy = generalsOf(from).filter((g) => !isLord(g)).sort((a, b) => intOf(b) - intOf(a))[0] ?? gen(n.lord);
    return modal<boolean>((close) => (
      <Court bg={1}>
        <Panel title="外交" class="modal sg-say">
          <div class="body row" style={{ gap: '1em', alignItems: 'flex-start' }}>
            <Portrait general={envoy.id} />
            <div class="sg-saytext">
              {`${n.name}派遣${gname(envoy.id)}前来，有事求见。\n\n「如今天下纷乱，请同意和我国结盟，携手齐心为苍生黎民而努力。」\n\n是否同意与${n.name}结盟？`}
            </div>
          </div>
          <div class="actions">
            <Btn onClick={() => close(false)}>拒绝</Btn>
            <Btn class="primary" onClick={() => close(true)}>同意结盟</Btn>
          </div>
        </Panel>
      </Court>
    ));
  }

  private async tournament() {
    const mods = import.meta.glob('../duel/index.ts');
    const loader = mods['../duel/index.ts'];
    if (!loader) return;
    const mine = generalsOf(G.player);
    if (mine.length < 5) return;
    const yes = await confirmBox('一年一度的武将擂台赛要开始了，请各路英雄豪杰前来参加吧！\n\n要参加武将擂台赛吗？', '比武大会', '参加', '不参加');
    if (!yes) return;
    const m = (await loader()) as { runArena?: (e?: number[]) => Promise<{ winner: number; ranking: number[] }> };
    if (!m.runArena) return;
    const r = await m.runArena();
    this.playBgm();
    const w = gen(r.winner);
    for (const id of r.ranking) gen(id).merit += 100;
    w.merit += 400;
    const wn = w.status === 'serving' ? w.nation : 0;
    if (wn) {
      const lc = city(lordCity(wn) || citiesOf(wn)[0]?.id || 0);
      if (lc) lc.money += 1000;
    }
    addLog(`比武大会由${gname(w.id)}获得优胜。`);
    await say(w.id, `宣布这次比赛结果，由${nname(wn)}军${gname(w.id)}获得优胜，希望明年大家再接再厉。\n\n${wn === G.player ? '我们得到赏金1000。\n' : ''}参赛武将每人获得功勋值100点。`, '比武大会', 1);
  }

  private async finish() {
    const win = G.over === 'victory';
    if (!win) {
      const n = nation(G.player);
      if (n) await say(n.lord, `唉！我一统中原的大业，难道就此结束了吗？\n\n西元${G.year}年${G.month}月，${n.name}灭亡。`, '战败', 1);
    } else {
      const n = nation(G.player)!;
      await say(n.lord, `经过多年的征战，${n.name}终于平定了全中国。`, '统一', 1);
    }
    const m = await import('../ending');
    await m.showEnding(win);
  }

  // ---------------------------------------------------------------- HUD
  draw() {
    this.renderUI(<Hud s={this} />);
    this.updateSafe();
  }

  // accessors for the HUD
  get h() {
    return {
      sel: this.selCity, group: this.group, pick: this.pick, busy: this.busy, live: this.live, hovered: this.hovered,
      panelOpen: this.panelOpen, logOpen: this.logOpen, map: this.map,
    };
  }
  togglePanel() {
    this.panelOpen = !this.panelOpen;
    this.draw();
  }
  toggleLog() {
    this.logOpen = !this.logOpen;
    this.draw();
  }
  clickGroup(g: Group) {
    this.openGroup(g);
  }
  clickCmd(c: Command) {
    this.runCmd(c);
  }
  cancelPick() {
    this.pick?.resolve(-1);
  }
  get context() {
    return this.ctx;
  }
}

// ==================================================================== nation colours from flags
async function syncNationColors() {
  const { shapes } = await import('../../engine/assets');
  const dir = await shapes('ad/btn/flag').catch(() => null);
  if (!dir) return;
  for (const n of G.nations) {
    const f = dir.frame(`flag${String(n.flag).padStart(2, '0')}0001`);
    if (!f) continue;
    const src = f.tex.source.resource as CanvasImageSource;
    const fr = f.tex.frame;
    try {
      const c = document.createElement('canvas');
      c.width = fr.width;
      c.height = fr.height;
      const x = c.getContext('2d', { willReadFrequently: true })!;
      x.drawImage(src, fr.x, fr.y, fr.width, fr.height, 0, 0, fr.width, fr.height);
      // the inner field of the banner (left part of the cloth, around the emblem)
      const W = fr.width;
      const d = x.getImageData(0, 0, W, fr.height).data;
      const hist = new Map<number, { n: number; r: number; g: number; b: number }>();
      for (let py = 2; py <= 12; py++)
        for (let px = 3; px <= 13; px++) {
          const i = (py * W + px) * 4;
          if (d[i + 3] < 200) continue;
          const r = d[i], g = d[i + 1], b = d[i + 2];
          const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
          if (mx < 50) continue;
          const sat = (mx - mn) / mx;
          if (sat < 0.35 || (mx > 235 && sat < 0.5)) continue; // pole / emblem highlights
          let hue = 0;
          if (mx === r) hue = ((g - b) / (mx - mn)) % 6;
          else if (mx === g) hue = (b - r) / (mx - mn) + 2;
          else hue = (r - g) / (mx - mn) + 4;
          const key = Math.floor(((hue * 60 + 360) % 360) / 20);
          const e = hist.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
          e.n++; e.r += r; e.g += g; e.b += b;
          hist.set(key, e);
        }
      const best = [...hist.values()].sort((a, b) => b.n - a.n)[0];
      if (best && best.n > 6) {
        // brighten so halos read well on the map
        const k = 255 / Math.max(1, Math.max(best.r, best.g, best.b) / best.n);
        const hex = (v: number) => Math.min(255, Math.round((v / best.n) * Math.min(k, 1.6))).toString(16).padStart(2, '0');
        n.color = `#${hex(best.r)}${hex(best.g)}${hex(best.b)}`;
      }
    } catch {
      /* keep default */
    }
  }
}

// ==================================================================== HUD components
function Hud(props: { s: StrategyScene }) {
  const s = props.s;
  const h = s.h;
  const n = nation(G.player);
  if (!n) return null;
  const ap = apOf(G.player);
  const maxAp = actionPointsFor(G.player);
  const hov = h.hovered && h.hovered !== h.sel && !h.pick ? h.hovered : 0;
  const hp = hov ? h.map.screenPos(hov) : null;
  return (
    <div class="pass sg-hud">
      <div class="sg-top">
        <Portrait general={n.lord} size="sm" title={n.name} />
        <div class="sg-topinfo">
          <div class="sg-date kai">{G.year}年{G.month}月</div>
          <div class="sg-lord"><i class="chip" style={{ background: n.color }} /> {n.name}</div>
        </div>
        <div class="sg-res">
          <span title="金钱合计"><i>金</i>{totalMoney(G.player)}</span>
          <span title={`行动点数（每月 ${maxAp} 点）`} class={ap === 0 ? 'red' : ''}><i>行</i>{ap}</span>
          <span title="城池"><i>城</i>{citiesOf(G.player).length}</span>
          <span title="武将"><i>将</i>{generalsOf(G.player).length}</span>
          <span title="总兵力"><i>兵</i>{totalSoldiers(G.player)}</span>
        </div>
      </div>

      <div class="sg-menu">
        {GROUPS.map((g) => (
          <button class={`sg-mbtn ${h.group === g ? 'on' : ''} ${g.key === 'rest' ? 'rest' : ''}`} disabled={!!h.busy || !!h.pick} onClick={() => s.clickGroup(g)}>
            <span class="kai">{g.label}</span>
            <u>{g.hot}</u>
          </button>
        ))}
      </div>
      {h.group && !h.pick && (
        <div class="sg-sub" style={{ '--i': GROUPS.indexOf(h.group) } as unknown as Record<string, number>}>
          {h.group.cmds.map((c) => {
            const needCity = c.city && city(h.sel)?.owner !== G.player;
            return (
              <button class="sg-sbtn" disabled={needCity} title={needCity ? '请先选择我方城市' : ''} onClick={() => s.clickCmd(c)}>
                <span>{c.label}</span>
                {c.ap ? <i class={ap < c.ap ? 'red' : ''}>{c.ap}</i> : <i class="mute">免</i>}
              </button>
            );
          })}
        </div>
      )}

      <CityPanel s={s} />

      <div class={`sg-log ${h.logOpen ? 'open' : ''}`} onClick={() => s.toggleLog()}>
        {(h.busy ? h.live : G.log.slice(h.logOpen ? -60 : -3).map((l) => `${l.y}年${l.m}月 ${l.text}`)).map((t) => <div>{t}</div>)}
        {!G.log.length && !h.busy ? <div class="mute">（消息记录）</div> : null}
      </div>

      <div class="sg-zoom">
        <button title="放大 (+)" onClick={() => h.map.zoomAt(core.width / 2, core.height / 2, 1.25)}>＋</button>
        <button title="缩小 (-)" onClick={() => h.map.zoomAt(core.width / 2, core.height / 2, 0.8)}>－</button>
        <button title="回到君主所在 (Tab 切换城池)" onClick={() => { const c = lordCity(G.player); if (c) { s.select(c); h.map.centerOn(c); } }}>◎</button>
      </div>

      {hp && hov ? (
        <div class="sg-tip" style={{ left: `${hp.x}px`, top: `${hp.y}px` }}>
          <b>{cname(hov)}</b> <span class="dim">{nname(city(hov).owner)}</span>
        </div>
      ) : null}

      {h.pick && (
        <div class="sg-pickbar">
          <span class="kai">{h.pick.prompt}</span>
          <span class="sg-pickcities">
            {[...h.pick.targets].map((t) => (
              <button onClick={() => h.pick?.resolve(t)}>{cname(t)}</button>
            ))}
          </span>
          <Btn onClick={() => s.cancelPick()}>取消</Btn>
        </div>
      )}
      {h.busy && <div class="sg-busy kai">{h.busy}</div>}
    </div>
  );
}

function CityPanel(props: { s: StrategyScene }) {
  const s = props.s;
  const h = s.h;
  const [tab, setTab] = useState(0);
  const cid = h.sel;
  const c = city(cid);
  const def = db.cities[cid - 1];
  if (!c || !def) return null;
  const owner = nation(c.owner);
  const mine = c.owner === G.player;
  const known = hasIntel(G.player, cid);
  const gs = generalsIn(cid, c.owner).sort((a, b) => (isLord(b) ? 1 : 0) - (isLord(a) ? 1 : 0) || b.level - a.level);
  const pris = mine ? prisonersIn(cid).filter((p) => p.nation === G.player) : [];
  if (!h.panelOpen)
    return (
      <button class="sg-cpanel-tab" onClick={() => s.togglePanel()}>
        <span class="kai">{def.name}</span>◀
      </button>
    );
  return (
    <div class="sg-cpanel">
      <div class="sg-chead">
        <span class="kai sg-cname">{def.name}</span>
        <span class="tag dim">{SIZE_NAMES[def.size] ?? ''}</span>
        <span class="grow" />
        {owner ? <span><i class="chip" style={{ background: owner.color }} /> {owner.name}</span> : <span class="dim">空城</span>}
        <button class="sg-x" onClick={() => s.togglePanel()} title="收起">▶</button>
      </div>
      {owner && !mine ? (
        <div class="sg-rel dim">
          友好度 {friendship(G.player, c.owner)} · {isAllied(G.player, c.owner) ? <span class="gold">同盟</span> : '敌对'}
          {known ? <span class="gold"> · 已调查</span> : <span> · 未调查</span>}
        </div>
      ) : null}
      <div class="sg-cstats">
        <span>太守</span><b>{known && c.governor ? gname(c.governor) : '—'}</b>
        <span>军师</span><b>{known && c.advisor ? gname(c.advisor) : '—'}</b>
        <span>人口</span><b>{c.people}</b>
        <span>金钱</span><b>{known ? c.money : '?'}{mine ? <small class="dim"> +{incomeOf(c)}</small> : null}</b>
        <span>预备兵</span><b>{known ? `${c.reserve}/${reserveCap(c)}` : '?'}</b>
        <span>士气</span><b>{known ? c.training : '?'}</b>
      </div>
      <div class="sg-devbar">
        <span>开发度</span>
        <Bar value={c.dev} max={999} kind="sol" style={{ flex: 1 }} />
        <b>{c.dev}</b>
      </div>
      <div class="tabs sg-ctabs">
        <button class={tab === 0 ? 'on' : ''} onClick={() => setTab(0)}>武将 {known ? gs.length : '?'}</button>
        {mine ? <button class={tab === 1 ? 'on' : ''} onClick={() => setTab(1)}>俘虏 {pris.length}</button> : null}
      </div>
      <div class="list sg-cgens">
        {known ? (
          tab === 1 && mine ? (
            <GeneralTable gens={pris} cols={['name', 'level', 'str', 'int', 'loy']} onRow={(g) => void showGeneral(g.id)} />
          ) : (
            <GeneralTable gens={gs} cols={['name', 'level', 'str', 'int', 'sol', 'loy']} rowClass={(g) => (g.acted ? 'sg-acted' : '')} onRow={(g) => void showGeneral(g.id)} />
          )
        ) : (
          <div class="sg-empty">
            武将 {gs.length} 名（详情不明）
            <br />
            <span class="mute">以「计略 → 调查」打探此城</span>
          </div>
        )}
      </div>
      {known && !mine && owner ? (
        <div class="sg-cfoot">
          <Btn class="ghost" onClick={() => void cityReport(cid)}>详细情报</Btn>
        </div>
      ) : null}
      {mine ? (
        <div class="sg-cfoot dim">
          总兵力 {gs.reduce((a, g) => a + g.soldiers, 0) + c.reserve} · 可出动武将 {gs.filter((g) => !g.acted).length}
        </div>
      ) : null}
    </div>
  );
}
