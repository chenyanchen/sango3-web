// 野战 scene: renders the city's tactical map, runs the turn loop (早晨/黄昏/夜晚)
// and the player's commands; clashes are delegated to 百人战/单挑.
import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { db } from '../../data/db';
import { playMusic, sfx } from '../../engine/audio';
import { core, Scene } from '../../engine/core';
import { modalKey } from '../../engine/keys';
import { rng } from '../../engine/rng';
import type { BattleResult, BattleSetup, DuelResult, DuelSetup, WarResult, WarSetup } from '../../game/contracts';
import { G, maxSoldiers } from '../../game/state';
import { Btn, modal, Panel, Portrait, ShapeImg } from '../../ui/kit';
import { autoBattle, runBattle } from '../battle';
import { autoDuel, runDuel } from '../duel';
import { AI, type Plan } from './ai';
import { autoWar } from './auto';
import './field.css';
import { loadMap, TERRAIN_NAME, type FieldMap } from './map';
import { CampView, dirFromDelta, FloatText, loadAtlases, MapView, unitColor, UnitView, type Atlases } from './view';
import { clamp, cost, g, M, MAX_ROUNDS, name, War, type Side, type Unit, type WarHooks } from './war';

type Mode = 'idle' | 'selected' | 'menu' | 'target';
type TargetKind = 'attack' | 'duel' | 'magic';

const TIME_NAME = ['早晨', '黄昏', '夜晚'];
const WEATHER_NAME = ['晴', '阴', '雨', '雪', '风'];
const TIME_TINT = [0xffffff, 0xffc9a0, 0x7884c0];

interface LogLine {
  id: number;
  text: string;
  kind: 'info' | 'good' | 'bad';
}

export class FieldScene extends Scene {
  war!: War;
  private map!: FieldMap;
  private at!: Atlases;
  private mv!: MapView;
  private ai!: AI;
  private world = new Container();
  private fxLayer = new Container();
  private labels = new Container();
  private tint = new Graphics();
  private weatherLayer = new Container();
  private drops: Sprite[] = [];
  private views = new Map<Unit, UnitView>();
  private camps: CampView[] = [];
  private floats: FloatText[] = [];
  private music = 'sf001';

  // camera
  private cam = { x: 0, y: 0, z: 1 };
  private camTarget: { x: number; y: number } | null = null;
  private vw = 0;
  private vh = 0;

  // interaction
  private mode: Mode = 'idle';
  private sel: Unit | null = null;
  private focus: Unit | null = null;
  private tileInfo = -1;
  private reach: Map<number, { c: number; prev: number }> | null = null;
  private targetKind: TargetKind = 'attack';
  private magicId = 0;
  private busy = false;
  private phaseHuman = false;
  private endPhase: (() => void) | null = null;
  private banner: { text: string; img?: string } | null = null;
  private vs: { a: Unit; b: Unit; duel: boolean } | null = null;
  private log: LogLine[] = [];
  private logSeq = 0;
  delegate = false;
  fast = false;
  private resolveDone!: (r: WarResult) => void;
  readonly done = new Promise<WarResult>((r) => (this.resolveDone = r));
  private hooks: WarHooks;
  private exited = false;
  private ver = 0;

  constructor(readonly setup: WarSetup) {
    super();
    if (import.meta.env.DEV) {
      const q = new URLSearchParams(location.search);
      if (q.get('delegate')) this.delegate = true;
      if (q.get('fast')) this.fast = true;
    }
    this.hooks = {
      battle: (s, a, b) => this.doBattle(s, a, b),
      duel: (s, a, b) => this.doDuel(s, a, b),
      askDuel: (a, b) => this.askDuel(a, b),
      log: (t, k) => this.addLog(t, k ?? 'info'),
    };
  }

  async enter() {
    try {
      await this.load();
    } catch (e) {
      // never leave the strategy layer hanging: resolve the war numerically
      console.error('[field] failed to start, auto-resolving', e);
      this.exited = true;
      setTimeout(() => this.resolveDone(autoWar(this.setup)), 0);
    }
  }

  private async load() {
    const [map, at] = await Promise.all([loadMap(this.setup.city), loadAtlases()]);
    this.map = map;
    this.at = at;
    this.war = new War(this.setup, map);
    this.ai = new AI(this.war);
    this.mv = new MapView(map, at);
    this.world.addChild(this.mv.ground, this.mv.masks, this.mv.objects, this.labels, this.fxLayer);
    this.root.addChild(this.world, this.tint, this.weatherLayer);
    this.tint.blendMode = 'multiply';
    // camps
    const ps = this.war.playerSide ?? 0;
    const camp = new CampView(at, ps === 0);
    camp.position.set(map.sx(this.war.base[0]), map.sy(this.war.base[0]));
    camp.zIndex = map.sy(this.war.base[0]) * 10 + 3;
    this.camps.push(camp);
    this.mv.objects.addChild(camp);
    if (!this.war.castle) {
      const c2 = new CampView(at, ps === 1);
      c2.position.set(map.sx(this.war.base[1]), map.sy(this.war.base[1]));
      c2.zIndex = map.sy(this.war.base[1]) * 10 + 3;
      this.camps.push(c2);
      this.mv.objects.addChild(c2);
    }
    for (const u of this.war.units) {
      if (u.state !== 'field') continue;
      const v = new UnitView(u, unitColor(this.war, u), at);
      v.place(map.sx(u.pos), map.sy(u.pos));
      v.setWater(map.terrain(u.pos) === 5);
      this.views.set(u, v);
      this.mv.objects.addChild(v);
      this.labels.addChild(v.hud);
    }
    this.makeDrops();
    // camera: start on the player's army (or the attackers)
    const mine = this.war.sideUnits(ps);
    const c = mine[0]?.pos ?? this.war.base[0];
    this.cam.z = this.defaultZoom();
    this.cam.x = map.sx(c);
    this.cam.y = map.sy(c);
    this.music = `sf00${rng.int(1, 3)}`;
    playMusic(this.music);
    window.addEventListener('keydown', this.onKey);
    this.draw();
    setTimeout(() => void this.play(), 50);
  }

  private onKey = (e: KeyboardEvent) => {
    // only while the field map is on top (not under a pushed battle/duel)
    if (core.scene !== this || e.repeat) return;
    if (modalKey(e)) return;
    if (e.key === 'Escape' && this.sel && !this.busy) this.cancel();
  };

  resume() {
    playMusic(this.music);
    this.syncViews();
    this.draw();
  }

  exit() {
    this.exited = true;
    window.removeEventListener('keydown', this.onKey);
    const tex = new Set<Texture>();
    for (const s of this.drops) {
      const ext = s as Sprite & { snowTex?: Texture; rainTex?: Texture };
      if (ext.snowTex) tex.add(ext.snowTex);
      if (ext.rainTex) tex.add(ext.rainTex);
    }
    super.exit();
    for (const t of tex) t.destroy(true);
    this.drops = [];
  }

  private defaultZoom() {
    const s = Math.min(this.vw || core.width, this.vh || core.height);
    return clamp(s / 480, 0.9, 1.8);
  }

  resize(w: number, h: number) {
    this.vw = w;
    this.vh = h;
    this.tint.clear().rect(0, 0, w, h).fill(0xffffff);
    this.applyTint();
    this.layoutDrops();
    this.applyCam();
  }

  // ------------------------------------------------------------ camera & input
  private clampCam() {
    if (!this.map) return;
    const z = this.cam.z;
    const hw = this.vw / 2 / z, hh = (this.vh / 2) / z;
    const W = this.map.pxW, H = this.map.pxH;
    const pad = 60;
    this.cam.x = W + 2 * pad < hw * 2 ? W / 2 : clamp(this.cam.x, hw - pad, W - hw + pad);
    this.cam.y = H + 2 * pad < hh * 2 ? H / 2 : clamp(this.cam.y, hh - pad - 40, H - hh + pad + 40);
  }
  private applyCam() {
    this.clampCam();
    this.world.scale.set(this.cam.z);
    this.world.position.set(Math.round(this.vw / 2 - this.cam.x * this.cam.z), Math.round(this.vh / 2 - this.cam.y * this.cam.z));
  }
  private toWorld(sx: number, sy: number) {
    return { x: (sx - this.world.position.x) / this.cam.z, y: (sy - this.world.position.y) / this.cam.z };
  }
  centerOn(tile: number, instant = false) {
    const x = this.map.sx(tile), y = this.map.sy(tile);
    if (instant) {
      this.cam.x = x;
      this.cam.y = y;
      this.camTarget = null;
      this.applyCam();
    } else this.camTarget = { x, y };
  }
  /** pan only when the tile is near the screen edge */
  private follow(tile: number) {
    const p = this.world.toGlobal({ x: this.map.sx(tile), y: this.map.sy(tile) });
    const mx = this.vw * 0.22, my = this.vh * 0.22;
    if (p.x < mx || p.x > this.vw - mx || p.y < my || p.y > this.vh - my) this.centerOn(tile);
  }

  private pointers = new Map<number, { x: number; y: number }>();
  private drag: { x: number; y: number; moved: boolean; cx: number; cy: number; dist?: number; z?: number } | null = null;

  private onDown = (e: PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 1) this.drag = { x: e.clientX, y: e.clientY, moved: false, cx: this.cam.x, cy: this.cam.y };
    else if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.drag = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, moved: true, cx: this.cam.x, cy: this.cam.y, dist: Math.hypot(a.x - b.x, a.y - b.y), z: this.cam.z };
    }
  };
  private onMove = (e: PointerEvent) => {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const d = this.drag;
    if (!d) return;
    if (this.pointers.size >= 2 && d.dist) {
      const [a, b] = [...this.pointers.values()];
      const nd = Math.hypot(a.x - b.x, a.y - b.y);
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      this.cam.z = clamp((d.z! * nd) / d.dist, 0.45, 2.6);
      this.cam.x = d.cx - (mx - d.x) / this.cam.z;
      this.cam.y = d.cy - (my - d.y) / this.cam.z;
      this.camTarget = null;
      this.applyCam();
      return;
    }
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) > 8) d.moved = true;
    if (d.moved) {
      this.cam.x = d.cx - dx / this.cam.z;
      this.cam.y = d.cy - dy / this.cam.z;
      this.camTarget = null;
      this.applyCam();
    }
  };
  private onUp = (e: PointerEvent) => {
    const d = this.drag;
    this.pointers.delete(e.pointerId);
    if (this.pointers.size === 1 && d?.dist) {
      const [p] = [...this.pointers.values()];
      this.drag = { x: p.x, y: p.y, moved: true, cx: this.cam.x, cy: this.cam.y };
      return;
    }
    if (this.pointers.size) return;
    this.drag = null;
    if (d && !d.moved) {
      const w = this.toWorld(e.clientX, e.clientY);
      // prefer the unit drawn at the point (units stand ~20px above the tile centre)
      let t = this.map.pick(w.x, w.y + 10);
      if (t < 0) t = this.map.pick(w.x, w.y);
      if (t >= 0) void this.onTap(t);
    }
  };
  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const before = this.toWorld(e.clientX, e.clientY);
    this.cam.z = clamp(this.cam.z * Math.exp(-e.deltaY * 0.0015), 0.45, 2.6);
    this.world.scale.set(this.cam.z);
    // keep the point under the cursor fixed
    this.cam.x = before.x - (e.clientX - this.vw / 2) / this.cam.z;
    this.cam.y = before.y - (e.clientY - this.vh / 2) / this.cam.z;
    this.camTarget = null;
    this.applyCam();
  };

  // ------------------------------------------------------------ per-frame
  private tickN = 0;
  tick() {
    this.tickN++;
    for (const v of this.views.values()) v.tick();
    for (const c of this.camps) c.tick();
    this.floats = this.floats.filter((f) => {
      if (f.tick()) return true;
      f.destroy();
      return false;
    });
  }

  frame(dt: number) {
    if (!this.map) return;
    if (this.camTarget) {
      const k = 1 - Math.exp(-dt * 7);
      this.cam.x += (this.camTarget.x - this.cam.x) * k;
      this.cam.y += (this.camTarget.y - this.cam.y) * k;
      if (Math.hypot(this.camTarget.x - this.cam.x, this.camTarget.y - this.cam.y) < 1) this.camTarget = null;
      this.applyCam();
    }
    this.updateDrops(dt);
    // pulse masks
    this.mv.masks.alpha = 0.75 + Math.sin(performance.now() / 260) * 0.2;
  }

  private applyTint() {
    if (!this.war) return;
    let c = TIME_TINT[this.war.time];
    if (this.war.weather === 2 || this.war.weather === 3) c = mulColor(c, 0xc8ccd8);
    this.tint.tint = c;
    this.tint.visible = c !== 0xffffff;
  }

  private makeDrops() {
    const g1 = new Graphics().moveTo(0, 0).lineTo(-3, 14).stroke({ color: 0xbfd4ff, width: 1.2, alpha: 0.7 });
    const g2 = new Graphics().circle(3, 3, 2.4).fill({ color: 0xffffff, alpha: 0.9 });
    const rain = core.app.renderer.generateTexture(g1);
    const snow = core.app.renderer.generateTexture(g2);
    g1.destroy();
    g2.destroy();
    for (let k = 0; k < 140; k++) {
      const s = new Sprite(rain);
      (s as Sprite & { snowTex: Texture; rainTex: Texture }).snowTex = snow;
      (s as Sprite & { snowTex: Texture; rainTex: Texture }).rainTex = rain;
      this.drops.push(s);
      this.weatherLayer.addChild(s);
    }
    this.layoutDrops();
  }
  private layoutDrops() {
    for (const s of this.drops) s.position.set(Math.random() * (this.vw || 800), Math.random() * (this.vh || 600));
  }
  private updateDrops(dt: number) {
    const w = this.war?.weather ?? 0;
    const on = w === 2 || w === 3;
    this.weatherLayer.visible = on;
    if (!on) return;
    const snow = w === 3;
    const t = performance.now() / 1000;
    this.drops.forEach((s, k) => {
      const ext = s as Sprite & { snowTex: Texture; rainTex: Texture };
      s.texture = snow ? ext.snowTex : ext.rainTex;
      if (snow) {
        s.y += dt * (40 + (k % 5) * 12);
        s.x += Math.sin(t * 1.3 + k) * dt * 20;
      } else {
        s.y += dt * (520 + (k % 7) * 40);
        s.x -= dt * 110;
      }
      if (s.y > this.vh + 20) {
        s.y = -20;
        s.x = Math.random() * (this.vw + 100);
      }
      if (s.x < -20) s.x = this.vw + 10;
    });
  }

  // ------------------------------------------------------------ game loop
  private async play() {
    const w = this.war;
    try {
      await this.showBanner(`${w.cityName}之战`, undefined, 1400);
      while (w.winner === null && !this.exited) {
        for (const side of [0, 1] as Side[]) {
          if (w.winner !== null) break;
          w.beginPhase(side);
          this.ai.beginPhase(side);
          this.applyTint();
          this.syncViews();
          const human = w.playerSide === side;
          this.draw();
          await this.showBanner(
            `第${w.day}日 ${TIME_NAME[w.time]}`,
            human ? 'sf/menu/myaction' : w.playerSide === null ? undefined : 'sf/menu/enemyaction',
            this.fast ? (human && !this.delegate ? 700 : 350) : 1000,
          );
          if (human && !this.delegate) await this.playerPhase();
          await this.aiPhase(side);
          if (w.winner === null) w.endPhase(side);
          this.mode = 'idle';
          this.sel = null;
          this.clearMasks();
          this.syncViews();
          this.draw();
        }
      }
      if (this.exited) return;
      await this.finish();
    } catch (e) {
      console.error(e);
      if (w.winner === null) w.end(1, '');
      await this.finish();
    }
  }

  private async finish() {
    const w = this.war;
    const won = w.playerSide === null ? w.winner === 0 : w.winner === w.playerSide;
    const units = [...w.units];
    const result = w.finalize();
    for (const v of this.views.values()) v.play(v.unit.state === 'field' && v.unit.side === w.winner ? 'win' : 'lose');
    sfx(won ? 'win' : 'lose');
    playMusic(won ? 'report001' : 'report003');
    await sleep(600);
    const names = (ids: number[]) => ids.map((id) => db.generals[id - 1]?.name).filter(Boolean).join('、') || '无';
    const title = w.playerSide === null ? `${w.sideName(w.winner as Side)}军获胜` : won ? '我军胜利' : '我军败北';
    await modal<void>((close) => (
      <Panel title={title} class="modal fw-summary">
        <div class="body col" style={{ gap: '0.6em', minWidth: '18em' }}>
          <div class="kai fw-reason">{w.winReason || (won ? '敌军败退。' : '我军败退。')}</div>
          <div class="dim">俘虏：{names(result.captured)}</div>
          <div class="dim">撤退：{names(result.retreated)}</div>
          {result.killed.length > 0 && <div class="red">阵亡：{names(result.killed)}</div>}
          <div class="fw-armies">
            {([0, 1] as Side[]).map((s) => (
              <div class="col fw-army" key={s}>
                <div class="gold">{s === 0 ? '攻方' : '守方'} · {w.sideName(s)}</div>
                {units.filter((u) => u.side === s).map((u) => (
                  <div class="row fw-sum-row" key={u.gid}>
                    <Portrait general={u.gid} size="sm" />
                    <span class="grow">{name(u)}</span>
                    <span class="mute">{STATE_NAME[u.state]}</span>
                    <span class="dim">兵 {g(u).soldiers}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
        <div class="actions">
          <Btn class="primary" onClick={() => close()}>
            确定
          </Btn>
        </div>
      </Panel>
    ));
    this.resolveDone(result);
  }

  private playerPhase(): Promise<void> {
    this.phaseHuman = true;
    this.mode = 'idle';
    this.draw();
    const first = this.war.sideUnits(this.war.side).find((u) => u.human && !u.acted);
    if (first) this.centerOn(first.pos);
    return new Promise((res) => {
      this.endPhase = () => {
        this.endPhase = null;
        this.phaseHuman = false;
        this.mode = 'idle';
        this.sel = null;
        this.clearMasks();
        this.draw();
        res();
      };
    });
  }

  private checkAutoEnd() {
    const w = this.war;
    if (w.winner !== null) return this.endPhase?.();
    if (!w.sideUnits(w.side).some((u) => u.human && !u.acted)) setTimeout(() => this.endPhase?.(), 350);
  }

  /** AI plays every not-yet-acted unit of the side (all of them when delegated / enemy) */
  private async aiPhase(side: Side) {
    const w = this.war;
    for (let guard = 0; guard < 40 && w.winner === null && !this.exited; guard++) {
      const todo = w.sideUnits(side).filter((u) => !u.acted);
      if (!todo.length) break;
      // units closest to the enemy act first
      const foes = w.sideUnits(side === 0 ? 1 : 0);
      todo.sort((a, b) => nearest(w, a, foes) - nearest(w, b, foes));
      const u = todo[0];
      const plan = this.ai.plan(u);
      await this.execPlan(u, plan);
      w.checkVictory();
      this.syncViews();
      this.draw();
    }
  }

  private async execPlan(u: Unit, p: Plan) {
    const w = this.war;
    const watch = !this.fast;
    if (watch) {
      this.follow(u.pos);
      this.views.get(u)?.setSelected(true);
      await sleep(180);
    }
    if (p.move !== u.pos) {
      const reach = w.reach(u);
      const path = reach.has(p.move) ? w.pathTo(reach, p.move) : [u.pos];
      w.move(u, p.move);
      await this.animateMove(u, path, !watch);
    }
    this.views.get(u)?.setSelected(false);
    switch (p.kind) {
      case 'attack':
        await this.commandAttack(u, p.target);
        break;
      case 'duel':
        await this.commandDuel(u, p.target);
        break;
      case 'gate':
        await this.commandGate(u, p.gate);
        break;
      case 'magic':
        await this.commandMagic(u, p.id, p.target);
        break;
      case 'retreat':
        w.retreat(u, this.hooks);
        await this.removeUnit(u);
        break;
      default:
        w.finish(u);
    }
    if (watch) await sleep(120);
  }

  // ------------------------------------------------------------ animation helpers
  private async animateMove(u: Unit, path: number[], instant = false) {
    const v = this.views.get(u);
    if (!v) return;
    const m = this.map;
    if (instant || path.length < 2) {
      const last = path[path.length - 1] ?? u.pos;
      if (path.length >= 2) v.setFacing(dirFromDelta(m.sx(last) - m.sx(path[path.length - 2]), m.sy(last) - m.sy(path[path.length - 2])));
      v.place(m.sx(u.pos), m.sy(u.pos));
      v.setWater(m.terrain(u.pos) === 5);
      return;
    }
    v.play('run');
    sfx(g(u).soldierType === 3 ? 'horse01' : 'soldiermove-00', { volume: 0.5 });
    const stepMs = 150 / core.speed;
    for (let k = 1; k < path.length; k++) {
      const a = path[k - 1], b = path[k];
      const ax = m.sx(a), ay = m.sy(a), bx = m.sx(b), by = m.sy(b);
      v.setFacing(dirFromDelta(bx - ax, by - ay));
      v.setWater(m.terrain(b) === 5);
      await tween(stepMs, (t) => {
        v.place(ax + (bx - ax) * t, ay + (by - ay) * t);
        if (!this.drag) this.camTarget = null;
      });
      this.follow(b);
    }
    v.play('wait');
  }

  private float(tile: number, text: string, color = 0xffffff) {
    const f = new FloatText(text, color);
    f.position.set(this.map.sx(tile), this.map.sy(tile) - 34);
    this.fxLayer.addChild(f);
    this.floats.push(f);
  }

  private async removeUnit(u: Unit) {
    const v = this.views.get(u);
    if (!v) return;
    v.play('lose');
    await tween(500, (t) => v.setVisible(true, 1 - t));
    v.setVisible(false);
  }

  /** reconcile views with the model (removed units, positions, bars) */
  private syncViews() {
    if (this.exited) return;
    for (const [u, v] of this.views) {
      if (u.state !== 'field') {
        if (v.visible && v.alpha === 1) void this.removeUnit(u);
        continue;
      }
      v.setVisible(true);
      if (Math.abs(v.wx - this.map.sx(u.pos)) > 0.5 || Math.abs(v.wy - this.map.sy(u.pos)) > 0.5) {
        v.place(this.map.sx(u.pos), this.map.sy(u.pos));
        v.setWater(this.map.terrain(u.pos) === 5);
      }
      if (v.unit.acted || !v.unit.moved) v.play('wait');
      v.refresh();
    }
    for (const [gt, hp] of this.war.gates) this.mv.setGateBroken(gt, hp <= 0);
  }

  private showBanner(text: string, img: string | undefined, ms: number) {
    this.banner = { text, img };
    this.draw();
    return sleep(ms).then(() => {
      this.banner = null;
      this.draw();
    });
  }

  private addLog(text: string, kind: LogLine['kind']) {
    this.log.push({ id: ++this.logSeq, text, kind });
    if (this.log.length > 40) this.log.shift();
    this.draw();
  }

  // ------------------------------------------------------------ clash hooks
  private humanInvolved(a: Unit, b: Unit) {
    return !this.delegate && (a.human || b.human);
  }

  private async showVs(a: Unit, b: Unit, duel: boolean) {
    this.vs = { a, b, duel };
    sfx('vs');
    this.draw();
    await sleep(this.fast ? 700 : 1300);
    this.vs = null;
    this.draw();
  }

  private async doBattle(setup: BattleSetup, L: Unit, R: Unit): Promise<BattleResult> {
    const human = this.humanInvolved(L, R);
    if (!human) {
      setup.left.human = false;
      setup.right.human = false;
    }
    if (human || !this.fast) {
      await this.showVs(L, R, false);
      return runBattle(setup);
    }
    return autoBattle(setup);
  }

  private async doDuel(setup: DuelSetup, L: Unit, R: Unit): Promise<DuelResult> {
    const human = this.humanInvolved(L, R);
    if (!human) {
      setup.leftHuman = false;
      setup.rightHuman = false;
    }
    if (human || !this.fast) {
      await this.showVs(L, R, true);
      return runDuel(setup);
    }
    return autoDuel(setup);
  }

  private askDuel(a: Unit, b: Unit): Promise<boolean> {
    if (this.delegate) return Promise.resolve(rng.chance(this.war.duelAcceptChance(a, b)));
    const line = dialogue(a, b, 'Ask') || `你${name(b)}敢和我${name(a)}单枪匹马决一死战吗？`;
    this.centerOn(b.pos);
    return modal<boolean>((close) => (
      <Panel title="单挑" class="modal">
        <div class="body row" style={{ alignItems: 'flex-start', gap: '1em' }}>
          <Portrait general={a.gid} />
          <div style={{ lineHeight: 1.8, minWidth: '14em', maxWidth: '22em' }}>
            <div class="gold">{name(a)}（武力 {g(a).str}）</div>
            <div>「{line}」</div>
            <div class="dim" style={{ marginTop: '0.5em' }}>
              是否决定与{name(a)}单挑？（{name(b)} 武力 {g(b).str} · 体力 {g(b).hp}/{g(b).maxHp}）
            </div>
            <div class="mute">拒绝将使士气下降。</div>
          </div>
        </div>
        <div class="actions">
          <Btn onClick={() => close(false)}>拒绝</Btn>
          <Btn class="primary" onClick={() => close(true)}>
            应战
          </Btn>
        </div>
      </Panel>
    ));
  }

  // ------------------------------------------------------------ commands
  private async commandAttack(u: Unit, t: Unit) {
    this.faceEach(u, t);
    this.views.get(u)?.play('fight');
    this.views.get(t)?.play('fight');
    const before = [g(u).soldiers, g(t).soldiers];
    await sleep(this.fast ? 150 : 450);
    const r = await this.war.attack(u, t, this.hooks);
    this.float(u.pos, `-${Math.max(0, before[0] - g(u).soldiers)}`, 0xff8a7a);
    this.float(t.pos, `-${Math.max(0, before[1] - g(t).soldiers)}`, 0xff8a7a);
    if (r.winner) this.views.get(r.winner)?.play('win');
    this.syncViews();
    await sleep(this.fast ? 200 : 700);
  }

  private async commandDuel(u: Unit, t: Unit) {
    this.faceEach(u, t);
    this.addLog(`${name(u)}向${name(t)}要求单挑！`, 'info');
    if (!t.human || this.delegate) this.float(u.pos, '单挑！', 0xf6d98a);
    const r = await this.war.duel(u, t, this.hooks);
    if (r.kind === 'refused') this.float(t.pos, '拒绝', 0x9ad0ff);
    this.syncViews();
    await sleep(this.fast ? 200 : 600);
  }

  private async commandGate(u: Unit, gate: number) {
    const v = this.views.get(u);
    v?.setFacing(dirFromDelta(this.map.sx(gate) - this.map.sx(u.pos), this.map.sy(gate) - this.map.sy(u.pos)));
    v?.play('fight');
    sfx('crash');
    await sleep(this.fast ? 150 : 600);
    const r = this.war.attackGate(u, gate, this.hooks);
    this.float(gate, r.winner ? '城门攻破！' : `城门 ${this.war.gates.get(gate)}`, r.winner ? 0xf6d98a : 0xffffff);
    if (r.winner) sfx('break');
    this.syncViews();
    await sleep(this.fast ? 100 : 400);
  }

  private async commandMagic(u: Unit, id: number, t: Unit | null) {
    const v = this.views.get(u);
    v?.play('cast');
    sfx('effect00');
    const m = db.sfMagic[id - 1];
    this.float(u.pos, m?.name ?? '', 0x9ad0ff);
    await sleep(this.fast ? 200 : 600);
    const r = await this.war.cast(u, id, t, this.hooks);
    if (t) this.float(t.pos, r.ok ? '成功' : '失败', r.ok ? 0xf6d98a : 0xaaaaaa);
    this.applyTint();
    this.syncViews();
    await sleep(this.fast ? 100 : 500);
  }

  private faceEach(a: Unit, b: Unit) {
    const m = this.map;
    const dx = m.sx(b.pos) - m.sx(a.pos), dy = m.sy(b.pos) - m.sy(a.pos);
    this.views.get(a)?.setFacing(dirFromDelta(dx, dy));
    this.views.get(b)?.setFacing(dirFromDelta(-dx, -dy));
  }

  // ------------------------------------------------------------ player input
  private clearMasks() {
    this.mv?.clearMasks();
  }

  private canCommand(u: Unit | undefined | null): u is Unit {
    return !!u && this.phaseHuman && !this.delegate && u.human && u.side === this.war.side && !u.acted && u.state === 'field';
  }

  private select(u: Unit) {
    if (this.sel) this.views.get(this.sel)?.setSelected(false);
    this.sel = u;
    this.focus = u;
    this.tileInfo = -1;
    this.views.get(u)?.setSelected(true);
    this.views.get(u)?.play('active');
    sfx('touch', { volume: 0.6 });
    if (u.moved) {
      this.openMenu();
      return;
    }
    this.mode = 'selected';
    this.reach = this.war.reach(u);
    this.showReach();
    this.draw();
  }

  private showReach() {
    this.clearMasks();
    const u = this.sel;
    if (!u || !this.reach) return;
    this.mv.showMasks([...this.reach.keys()].filter((t) => t !== u.pos), 'movable', 0.5);
    this.mv.showMasks([u.pos], 'active', 0.6);
    const foes = new Set<number>();
    for (const t of this.reach.keys()) for (const e of this.war.targets(u, t)) foes.add(e.pos);
    this.mv.showMasks(foes, 'fightable', 0.55);
  }

  private deselect() {
    if (this.sel) {
      this.views.get(this.sel)?.setSelected(false);
      if (!this.sel.acted) this.views.get(this.sel)?.play('wait');
    }
    this.sel = null;
    this.mode = 'idle';
    this.reach = null;
    this.clearMasks();
    this.draw();
  }

  private openMenu() {
    this.mode = 'menu';
    this.clearMasks();
    if (this.sel) this.mv.showMasks([this.sel.pos], 'active', 0.6);
    this.draw();
  }

  private async onTap(t: number) {
    if (this.busy || !this.war) return;
    const w = this.war;
    const u = w.unitAt(t);
    if (this.mode === 'idle') {
      if (this.canCommand(u)) return this.select(u);
      this.focus = u ?? null;
      this.tileInfo = u ? -1 : t;
      this.draw();
      return;
    }
    const s = this.sel!;
    if (this.mode === 'selected') {
      if (t === s.pos) return this.openMenu();
      if (u && u.side !== s.side && this.reach) {
        // tap an enemy: move next to it (if needed) and attack
        if (w.targets(s).includes(u)) return this.runCommand(() => this.commandAttack(s, u));
        const spot = [...this.reach.keys()].filter((k) => !w.unitAt(k) && w.map.around(k).includes(u.pos)).sort((a, b) => this.reach!.get(a)!.c - this.reach!.get(b)!.c)[0];
        if (spot !== undefined) {
          await this.moveSel(spot);
          return this.runCommand(() => this.commandAttack(s, u));
        }
        this.focus = u;
        this.draw();
        return;
      }
      if (this.canCommand(u)) return this.select(u);
      if (this.reach?.has(t) && !u) {
        await this.moveSel(t);
        return;
      }
      if (u) {
        this.focus = u;
        this.draw();
        return;
      }
      return this.deselect();
    }
    if (this.mode === 'target') {
      if (this.targetKind === 'attack') {
        if (u && w.targets(s).includes(u)) return this.runCommand(() => this.commandAttack(s, u));
        if (w.gateTargets(s).includes(t)) return this.runCommand(() => this.commandGate(s, t));
      } else if (this.targetKind === 'duel') {
        if (u && w.targets(s).includes(u)) return this.runCommand(() => this.commandDuel(s, u));
      } else if (this.targetKind === 'magic') {
        const { units } = w.magicTargets(s, this.magicId);
        if (u && units.includes(u)) return this.runCommand(() => this.commandMagic(s, this.magicId, u));
      }
      this.openMenu();
      return;
    }
    if (this.mode === 'menu' && u && u !== s) {
      this.focus = u;
      this.draw();
    }
  }

  private async moveSel(t: number) {
    const s = this.sel!;
    const path = this.war.pathTo(this.reach!, t);
    this.busy = true;
    this.clearMasks();
    this.war.move(s, t);
    this.draw();
    await this.animateMove(s, path);
    this.views.get(s)?.play('active');
    this.busy = false;
    this.openMenu();
  }

  private async runCommand(fn: () => Promise<void>) {
    const s = this.sel;
    this.busy = true;
    this.clearMasks();
    this.mode = 'idle';
    if (s) this.views.get(s)?.setSelected(false);
    this.draw();
    try {
      await fn();
    } finally {
      this.busy = false;
      this.sel = null;
      this.war.checkVictory();
      this.syncViews();
      this.draw();
      this.checkAutoEnd();
    }
  }

  private cmdTarget(kind: TargetKind, magic = 0) {
    const s = this.sel!;
    this.targetKind = kind;
    this.magicId = magic;
    this.mode = 'target';
    this.clearMasks();
    if (kind === 'magic') {
      this.mv.showMasks(this.war.magicTargets(s, magic).units.map((x) => x.pos), 'castable', 0.6);
    } else {
      this.mv.showMasks(this.war.targets(s).map((x) => x.pos), 'fightable', 0.6);
      if (kind === 'attack') this.mv.showMasks(this.war.gateTargets(s), 'fightable', 0.6);
    }
    this.mv.showMasks([s.pos], 'active', 0.6);
    this.draw();
  }

  private async cmdMagicMenu() {
    const s = this.sel!;
    const gs = g(s);
    const ids = this.war.magicsOf(s);
    const pick = await modal<number>((close) => (
      <Panel title={`军师技 · ${name(s)}`} class="modal">
        <div class="body list fw-magic-list">
          <table class="grid">
            <thead>
              <tr>
                <th>名称</th>
                <th>技力</th>
                <th>对象</th>
                <th>范围</th>
                <th>成功率</th>
              </tr>
            </thead>
            <tbody>
              {ids.map((id) => {
                const m = db.sfMagic[id - 1];
                const tg = this.war.magicTargets(s, id);
                const ok = m.mp <= gs.mp && (tg.global || tg.units.length > 0);
                const rate = Math.round(this.war.successRate(s, id, tg.units[0]) * 100);
                return (
                  <tr class={ok ? 'click' : 'off'} onClick={() => ok && close(id)} key={id}>
                    <td>{m.name}</td>
                    <td>{m.mp}</td>
                    <td>{m.enemyType === 0 ? '天候' : m.enemyType === 1 ? '我方' : '敌方'}</td>
                    <td>{m.range || '—'}</td>
                    <td>{rate}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div class="dim" style={{ marginTop: '0.5em' }}>
          技力 {gs.mp}/{gs.maxMp} · 智力 {gs.int}
        </div>
        <div class="actions">
          <Btn onClick={() => close(0)}>取消</Btn>
        </div>
      </Panel>
    ));
    if (!pick) return;
    if (this.war.magicTargets(s, pick).global) return this.runCommand(() => this.commandMagic(s, pick, null));
    this.cmdTarget('magic', pick);
  }

  private async cmdFormation() {
    const s = this.sel!;
    const gs = g(s);
    const pick = await modal<number>((close) => (
      <Panel title="阵形" class="modal">
        <div class="body list">
          <table class="grid">
            <thead>
              <tr>
                <th>阵形</th>
                {[1, 2, 3, 4, 5, 7, 9, 11].map((t) => (
                  <th key={t}>{TERRAIN_NAME[t]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {gs.formations.map((f) => (
                <tr class={f === gs.formation ? 'sel click' : 'click'} onClick={() => close(f)} key={f}>
                  <td>{db.formations[f]?.name}</td>
                  {[1, 2, 3, 4, 5, 7, 9, 11].map((t) => (
                    <td key={t}>{cost(f, t)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div class="mute" style={{ marginTop: '0.4em' }}>数值为通过各地形所需的移动力。</div>
        <div class="actions">
          <Btn onClick={() => close(-1)}>取消</Btn>
        </div>
      </Panel>
    ));
    if (pick < 0 || pick === gs.formation) return this.draw();
    gs.formation = pick;
    this.addLog(`${name(s)}变换为${db.formations[pick]?.name}。`, 'info');
    if (!s.moved) {
      this.select(s);
    } else this.draw();
  }

  private async cmdRetreat() {
    const s = this.sel!;
    const ok = await modal<boolean>((close) => (
      <Panel title="撤退" class="modal">
        <div class="body">确定让{name(s)}的部队撤离战场吗？</div>
        <div class="actions">
          <Btn onClick={() => close(false)}>取消</Btn>
          <Btn class="primary" onClick={() => close(true)}>
            撤退
          </Btn>
        </div>
      </Panel>
    ));
    if (!ok) return;
    await this.runCommand(async () => {
      this.war.retreat(s, this.hooks);
      await this.removeUnit(s);
    });
  }

  private cancel() {
    const s = this.sel;
    if (!s) return;
    if (this.mode === 'target') return this.openMenu();
    if (s.moved && !s.acted) {
      this.war.undoMove(s);
      this.syncViews();
      return this.select(s);
    }
    this.deselect();
  }

  private allWait() {
    for (const u of this.war.sideUnits(this.war.side)) if (u.human) this.war.finish(u);
    this.deselect();
    this.syncViews();
    this.endPhase?.();
  }

  private async allRetreat() {
    const ok = await modal<boolean>((close) => (
      <Panel title="全军撤退" class="modal">
        <div class="body">确定全军撤退吗？撤退的部队将返回出征城市。</div>
        <div class="actions">
          <Btn onClick={() => close(false)}>取消</Btn>
          <Btn class="primary" onClick={() => close(true)}>
            全军撤退
          </Btn>
        </div>
      </Panel>
    ));
    if (!ok) return;
    const w = this.war;
    const ps: Side = w.playerSide ?? 0;
    for (const u of w.sideUnits(ps)) if (!u.ally) w.retreat(u, this.hooks);
    this.deselect();
    this.syncViews();
    if (!w.sideUnits(ps).length) w.end(ps === 0 ? 1 : 0, `${w.sideName(ps)}军全军撤退。`);
    w.checkVictory();
    this.endPhase?.();
  }

  private toggleDelegate() {
    this.delegate = !this.delegate;
    this.addLog(this.delegate ? '已委任电脑指挥我军。' : '取消委任。', 'info');
    if (this.delegate && this.phaseHuman) {
      this.deselect();
      this.endPhase?.(); // AI finishes the remaining units
    }
    this.draw();
  }

  // ------------------------------------------------------------ DOM UI
  draw() {
    if (!this.war || this.exited) return;
    for (const v of this.views.values()) v.showName(v.unit === this.focus || v.unit === this.sel);
    this.renderUI(<Hud s={this} v={++this.ver} />);
  }

  /** used by Hud */
  get ui_() {
    return {
      war: this.war, mode: this.mode, sel: this.sel, focus: this.focus, tile: this.tileInfo, busy: this.busy,
      phaseHuman: this.phaseHuman, banner: this.banner, vs: this.vs, log: this.log,
    };
  }
  readonly act = {
    down: this.onDown, move: this.onMove, up: this.onUp, wheel: this.onWheel,
    attack: () => this.cmdTarget('attack'),
    duel: () => this.cmdTarget('duel'),
    magic: () => void this.cmdMagicMenu(),
    formation: () => void this.cmdFormation(),
    wait: () => {
      const s = this.sel;
      if (!s) return;
      void this.runCommand(async () => this.war.finish(s));
    },
    retreat: () => void this.cmdRetreat(),
    cancel: () => this.cancel(),
    endTurn: () => this.allWait(),
    allRetreat: () => void this.allRetreat(),
    delegate: () => this.toggleDelegate(),
    fast: () => {
      this.fast = !this.fast;
      this.draw();
    },
    focusUnit: (u: Unit) => {
      this.centerOn(u.pos);
      if (this.canCommand(u) && !this.busy && (this.mode === 'idle' || this.mode === 'selected')) this.select(u);
      else {
        this.focus = u;
        this.draw();
      }
    },
    zoom: (k: number) => {
      this.cam.z = clamp(this.cam.z * k, 0.45, 2.6);
      this.applyCam();
    },
  };
}

const STATE_NAME: Record<string, string> = { field: '在场', retreated: '撤退', captured: '被俘', killed: '阵亡' };

// ---------------------------------------------------------------- HUD
function Hud({ s }: { s: FieldScene; v: number }) {
  const st = s.ui_;
  const w = st.war;
  const ps = w.playerSide;
  const sel = st.sel;
  const focus = st.focus ?? sel;
  const mine = ps === null ? [] : w.units.filter((u) => u.side === ps && u.state === 'field');
  const timeIcon = `sf/menu/timezone0${w.time + 1}-01`;
  const weatherIcon = w.weather === 3 ? 'sf/menu/snow01' : w.weather === 2 ? 'sf/menu/rain01' : 'sf/menu/sunny01';
  const left = Math.max(0, MAX_ROUNDS - w.round);
  return (
    <>
      <div
        class="fw-input"
        onPointerDown={s.act.down}
        onPointerMove={s.act.move}
        onPointerUp={s.act.up}
        onPointerCancel={s.act.up}
        onWheel={s.act.wheel}
      />
      <div class="fw-top">
        <div class="fw-title kai">{w.cityName}之战</div>
        <div class="fw-clock">
          <ShapeImg path={timeIcon} class="fw-ico" />
          <ShapeImg path={weatherIcon} class="fw-ico" />
          <span>
            第<b>{w.day}</b>日 {TIME_NAME[w.time]} · {WEATHER_NAME[w.weather]}
          </span>
          <span class="mute fw-left">余{Math.ceil(left / 3)}日</span>
        </div>
        <div class={`fw-turn ${w.side === ps ? 'mine' : 'foe'}`}>{w.side === 0 ? '攻方' : '守方'}行动</div>
        <div class="grow" />
        {ps !== null && (
          <>
            <Btn class={`fw-tb ${s.delegate ? 'sel' : ''}`} onClick={s.act.delegate}>
              委任
            </Btn>
            <Btn class={`fw-tb ${s.fast ? 'sel' : ''}`} onClick={s.act.fast} title="跳过敌军行动动画">
              快进
            </Btn>
            <Btn class="fw-tb" disabled={!st.phaseHuman || st.busy} onClick={s.act.allRetreat}>
              撤退
            </Btn>
            <Btn class="fw-tb primary" disabled={!st.phaseHuman || st.busy} onClick={s.act.endTurn}>
              结束
            </Btn>
          </>
        )}
        {ps === null && (
          <Btn class={`fw-tb ${s.fast ? 'sel' : ''}`} onClick={s.act.fast}>
            快进
          </Btn>
        )}
      </div>

      {mine.length > 0 && (
        <div class="fw-roster">
          {mine.map((u) => {
            const gs = g(u);
            return (
              <div class={`fw-chip ${u.acted ? 'done' : ''} ${sel === u ? 'on' : ''}`} key={u.gid} onClick={() => s.act.focusUnit(u)}>
                <Portrait general={u.gid} size="sm" />
                <div class="col fw-chip-info">
                  <span>{name(u)}</span>
                  <div class="fw-mini">
                    <i class="hp" style={{ width: `${(gs.hp / Math.max(1, gs.maxHp)) * 100}%` }} />
                  </div>
                  <div class="fw-mini">
                    <i class="sol" style={{ width: `${Math.min(100, (gs.soldiers / Math.max(1, maxSoldiers(gs))) * 100)}%` }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {focus && focus.state === 'field' && <UnitCard u={focus} war={w} />}
      {!focus && st.tile >= 0 && <TileCard tile={st.tile} war={w} />}

      {sel && st.mode === 'menu' && !st.busy && <CommandMenu s={s} u={sel} />}
      {sel && st.mode === 'target' && !st.busy && (
        <div class="fw-hint">
          <span>
            {s.ui_.mode === 'target' ? '请选择目标' : ''}
          </span>
          <Btn onClick={s.act.cancel}>取消</Btn>
        </div>
      )}
      {sel && st.mode === 'selected' && !st.busy && (
        <div class="fw-hint">
          <span>请选择移动位置（点选部队本身可原地下令）</span>
          <Btn onClick={s.act.cancel}>取消</Btn>
        </div>
      )}

      <div class="fw-log">
        {st.log.slice(-4).map((l) => (
          <div class={`fw-log-line ${l.kind}`} key={l.id}>
            {l.text}
          </div>
        ))}
      </div>

      <div class="fw-zoom">
        <Btn class="ghost" onClick={() => s.act.zoom(1.2)}>
          ＋
        </Btn>
        <Btn class="ghost" onClick={() => s.act.zoom(1 / 1.2)}>
          －
        </Btn>
      </div>

      {st.banner && (
        <div class="fw-banner">
          {st.banner.img && <ShapeImg path={st.banner.img} class="fw-banner-img" />}
          <div class="kai fw-banner-text">{st.banner.text}</div>
        </div>
      )}
      {st.vs && <VsScreen a={st.vs.a} b={st.vs.b} duel={st.vs.duel} />}
    </>
  );
}

function CommandMenu({ s, u }: { s: FieldScene; u: Unit }) {
  const w = s.war;
  const foes = w.targets(u);
  const gates = w.gateTargets(u);
  const canMagic = w.canCast(u);
  return (
    <div class="fw-cmd panel">
      <div class="fw-cmd-title kai">{name(u)}</div>
      <Btn disabled={!foes.length && !gates.length} onClick={s.act.attack}>
        攻击
      </Btn>
      <Btn disabled={!foes.length} onClick={s.act.duel}>
        单挑
      </Btn>
      {canMagic && <Btn onClick={s.act.magic}>军师技</Btn>}
      <Btn onClick={s.act.formation}>阵形</Btn>
      <Btn class="primary" onClick={s.act.wait}>
        待命
      </Btn>
      <Btn disabled={!!u.fx[M.ambush]} onClick={s.act.retreat}>
        撤退
      </Btn>
      <Btn class="ghost" onClick={s.act.cancel}>
        取消
      </Btn>
    </div>
  );
}

function UnitCard({ u, war }: { u: Unit; war: War }) {
  const gs = g(u);
  const sol = db.soldiers[gs.soldierType];
  const fx = Object.keys(u.fx).map((id) => db.sfMagic[+id - 1]?.name).filter(Boolean);
  const terr = war.map.terrain(u.pos);
  const isAdv = war.advisor(u.side) === u;
  return (
    <div class={`fw-card panel ${u.side === (war.playerSide ?? 0) ? 'mine' : 'foe'}`}>
      <div class="row" style={{ alignItems: 'flex-start' }}>
        <Portrait general={u.gid} />
        <div class="col grow" style={{ gap: '0.2em' }}>
          <div class="row">
            <b class="kai fw-card-name">{name(u)}</b>
            {isAdv && <span class="tag gold">军师</span>}
            {war.isLord(u) && <span class="tag red">君主</span>}
          </div>
          <div class="fw-stats">
            <span>等级 {gs.level}</span>
            <span>武力 {gs.str}</span>
            <span>智力 {gs.int}</span>
            <span>士气 {u.morale}</span>
          </div>
          <div class="fw-bars">
            <span>体力</span>
            <div class="bar hp"><i style={{ width: `${(gs.hp / Math.max(1, gs.maxHp)) * 100}%` }} /></div>
            <span class="num">{gs.hp}/{gs.maxHp}</span>
            <span>技力</span>
            <div class="bar mp"><i style={{ width: `${(gs.mp / Math.max(1, gs.maxMp)) * 100}%` }} /></div>
            <span class="num">{gs.mp}/{gs.maxMp}</span>
            <span>兵力</span>
            <div class="bar sol"><i style={{ width: `${Math.min(100, (gs.soldiers / Math.max(1, maxSoldiers(gs))) * 100)}%` }} /></div>
            <span class="num">{gs.soldiers}</span>
          </div>
          <div class="dim fw-small">
            {sol?.name} · {db.formations[gs.formation]?.name} · {TERRAIN_NAME[terr]}
            {fx.length > 0 && <span class="gold"> · {fx.join('、')}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

function TileCard({ tile, war }: { tile: number; war: War }) {
  const t = war.map.terrain(tile);
  const gate = war.gates.get(tile);
  const base = war.base[0] === tile ? '攻方营寨' : war.base[1] === tile ? (war.castle ? '主城' : '守方营寨') : '';
  return (
    <div class="fw-card panel fw-tile">
      <div class="row">
        <ShapeImg path={`sf/menu/smap${String(base && !war.castle ? 14 : t).padStart(2, '0')}`} class="fw-smap" />
        <div class="col">
          <b class="kai">{TERRAIN_NAME[t]}{base && ` · ${base}`}</b>
          <span class="dim fw-small">
            移动力消耗 {cost(0, t) >= 999 ? '不可通行' : cost(0, t)}
            {gate !== undefined && ` · 城门${gate > 0 ? `耐久 ${gate}` : '已破'}`}
          </span>
        </div>
      </div>
    </div>
  );
}

function VsScreen({ a, b, duel }: { a: Unit; b: Unit; duel: boolean }) {
  const card = (u: Unit) => {
    const gs = g(u);
    return (
      <div class="fw-vs-card">
        <Portrait general={u.gid} size="lg" />
        <div class="kai fw-vs-name">{name(u)}</div>
        <div class="fw-vs-stats">
          <span>武力 {gs.str}</span>
          <span>智力 {gs.int}</span>
          <span>体力 {gs.hp}</span>
          <span>兵力 {gs.soldiers}</span>
        </div>
      </div>
    );
  };
  return (
    <div class="fw-vs">
      <ShapeImg path="sf/menu/fightbg" class="fw-vs-bg" />
      <div class="fw-vs-row">
        {card(a)}
        <div class="col" style={{ alignItems: 'center' }}>
          <ShapeImg path="sf/menu/vs" class="fw-vs-icon" />
          <div class="kai gold fw-vs-kind">{duel ? '单挑' : '百人战'}</div>
        </div>
        {card(b)}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- utils
function nearest(w: War, u: Unit, foes: Unit[]) {
  let d = Infinity;
  for (const f of foes) d = Math.min(d, w.map.dist(u.pos, f.pos));
  return d;
}

function dialogue(a: Unit, b: Unit, key: string): string {
  const items = db.raw.Dialogue?.filter((x) => x._.startsWith('ITEM')) ?? [];
  const it = items[(a.gid * 7) % Math.max(1, items.length)];
  const s = it ? String(it[key] ?? '') : '';
  return s.replaceAll('%1', name(a)).replaceAll('%2', name(b));
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

function tween(ms: number, f: (t: number) => void) {
  return new Promise<void>((res) => {
    const t0 = performance.now();
    const step = () => {
      const t = Math.min(1, (performance.now() - t0) / ms);
      f(t);
      if (t < 1) requestAnimationFrame(step);
      else res();
    };
    requestAnimationFrame(step);
  });
}

function mulColor(a: number, b: number) {
  const r = (((a >> 16) & 255) * ((b >> 16) & 255)) / 255;
  const g2 = (((a >> 8) & 255) * ((b >> 8) & 255)) / 255;
  const bl = ((a & 255) * (b & 255)) / 255;
  return (Math.round(r) << 16) | (Math.round(g2) << 8) | Math.round(bl);
}

void G;
