// BattleScene: 百人战 rendering, camera, input and HUD glue.
import { Container, Sprite, Texture, TilingSprite } from 'pixi.js';
import { shapes, type Frame } from '../../engine/assets';
import { playMusic, preloadSfx, sfx } from '../../engine/audio';
import { core, Scene } from '../../engine/core';
import { rng } from '../../engine/rng';
import type { BattleResult, BattleSetup } from '../../game/contracts';
import { AI } from './ai';
import { autoBattle } from './auto';
import { ensureObjects } from './fx';
import { Hud, type HudApi } from './hud';
import { bgForTerrain, skillCtx, TICKS_PER_SEC, type SkillCtx } from './rules';
import { castSkill, skillObjects, skillState } from './skills';
import { FIELD_MID, HORIZON, VIEW_H, W, World, type General } from './world';
import './battle.css';

const VIEW_TOP = -45;

interface BgLayer {
  spr: Sprite;
  w: number;
  ay: number;
  h: number;
}

export class BattleScene extends Scene {
  world!: World;
  private bg = new Container();
  private worldC = new Container();
  private ground!: TilingSprite;
  private groundShade!: Sprite;
  private layersC = {
    under: new Container(),
    shadows: new Container(),
    units: new Container(),
    over: new Container(),
    screen: new Container(),
  };
  private weatherC = new Container();
  private bgLayers: BgLayer[] = [];
  private s = 1; // world → screen scale
  private oy = 0;
  private camX = 0;
  private camTarget = 0;
  private manualT = 0;
  private drag: { x: number; cam: number; id: number; moved: boolean } | null = null;
  private lastTick = performance.now();
  private tickInterval = 1000 / 30;
  private ai: AI[] = [];
  private uiT = 0;
  private hud!: HudApi;
  private introT = 0;
  private ctx!: SkillCtx;
  private drops: { s: Sprite; x: number; y: number; vx: number; vy: number }[] = [];
  private done = false;
  private resolveFn: (r: BattleResult) => void;
  private keyH = (e: KeyboardEvent) => this.onKey(e);
  private pd = (e: PointerEvent) => this.onDown(e);
  private pm = (e: PointerEvent) => this.onMove(e);
  private pu = (e: PointerEvent) => this.onUp(e);
  private wheel = (e: WheelEvent) => {
    this.camX += (e.deltaX || e.deltaY) / this.s;
    this.manualT = 2.5;
  };
  selected = -1; // big group index; -1 = all; -2 = general
  paused2 = false;
  private savedSpeed = 1;

  constructor(readonly setup: BattleSetup, resolve: (r: BattleResult) => void) {
    super();
    this.resolveFn = resolve;
  }

  async enter() {
    try {
      await this.load();
    } catch (e) {
      // never leave the caller hanging: resolve with the numeric simulation
      console.error('[battle] failed to start, auto-resolving', e);
      const f = this.resolveFn;
      this.resolveFn = null as unknown as typeof f;
      if (f) setTimeout(() => f(autoBattle(this.setup)), 0);
    }
  }

  private async load() {
    this.renderUI(<div class="bt-loading">布阵中…</div>);
    this.ctx = skillCtx(this.setup);
    const objs = World.neededObjects(this.setup);
    const skillIds = [...skillObjects(this.setup.left.general), ...skillObjects(this.setup.right.general)];
    await Promise.all([ensureObjects(objs), ensureObjects(skillIds), this.loadBg(), shapes('bf/menu')]);
    preloadSfx(['hit01', 'hit02', 'hit03', 'hit04', 'hit05', 'arrow', 'sword', 'def01', 'def02', 'soldierdie-00', 'soldierdie-01', 'soldierdie-02', 'die-00', 'charge-00', 'yell']);

    this.root.addChild(this.bg, this.worldC, this.weatherC, this.layersC.screen);
    this.worldC.addChild(this.ground, this.groundShade, this.layersC.under, this.layersC.shadows, this.layersC.units, this.layersC.over);
    this.layersC.units.sortableChildren = true;

    this.world = new World(this.setup, this.layersC);
    this.world.build();
    this.worldC.addChildAt(this.world.fx.dimG, this.worldC.getChildIndex(this.groundShade) + 1);
    const time = this.setup.time;
    const weatherTint = this.setup.weather === 1 ? 0xd4d8e0 : this.setup.weather === 2 ? 0xc8ccd8 : 0xffffff;
    const tint = time === 0 ? 0xffffff : time === 1 ? 0xffd9b8 : 0x9fb0e8;
    this.world.setTint(mulTint(tint, weatherTint));
    for (const l of this.bgLayers) l.spr.tint = weatherTint;
    this.ground.tint = weatherTint;
    for (const side of [0, 1] as const) if (!this.world.sides[side].human) this.ai.push(new AI(this.world, side, this.ctx));
    this.makeWeather();

    const pg = this.world.sides[0].gen;
    this.camX = this.camTarget = pg.x - 300;
    this.hud = {
      scene: this,
      cmd: (c) => this.command(c),
      cast: (id) => this.playerCast(id),
      select: (g) => {
        this.selected = g;
        this.highlight();
        this.drawUI();
      },
      speed: (v) => {
        core.speed = v;
        this.drawUI();
      },
      pause: () => this.togglePause(),
      jump: (fx) => {
        this.camX = fx * W - this.viewW() / 2;
        this.manualT = 3;
      },
      finish: () => this.finish(),
      skills: () => skillState(this.world, 0, this.ctx),
    };
    window.addEventListener('keydown', this.keyH);
    window.addEventListener('keyup', this.keyUpH);
    const cv = core.app.canvas;
    cv.addEventListener('pointerdown', this.pd);
    window.addEventListener('pointermove', this.pm);
    window.addEventListener('pointerup', this.pu);
    cv.addEventListener('wheel', this.wheel, { passive: true });
    playMusic(`bf${String(rng.int(1, 12)).padStart(3, '0')}`);
    this.world.onBanner = (t, k) => this.hud.banner?.(t, k);
    this.introT = 0;
    this.drawUI();
    this.hud.banner?.(`${this.world.sides[0].info.name}  对  ${this.world.sides[1].info.name}`, 'vs');
    (window as unknown as { __bt?: unknown }).__bt = this;
  }

  exit() {
    window.removeEventListener('keydown', this.keyH);
    window.removeEventListener('keyup', this.keyUpH);
    const cv = core.app.canvas;
    cv.removeEventListener('pointerdown', this.pd);
    window.removeEventListener('pointermove', this.pm);
    window.removeEventListener('pointerup', this.pu);
    cv.removeEventListener('wheel', this.wheel);
    core.speed = 1;
    this.world?.fx.clear();
    const own = [this.groundShade?.texture, this.selTex, this.markTex];
    super.exit();
    // canvas-generated textures are owned by this scene (atlas textures are shared/cached)
    for (const t of own) if (t && t !== Texture.WHITE && !t.destroyed) t.destroy(true);
    this.selTex = this.markTex = null;
  }

  // ---------------------------------------------------------------- background
  private async loadBg() {
    const dir = await shapes('bf/bg');
    let id = this.setup.background ?? bgForTerrain(this.setup.terrain);
    if (id === 1 && (this.setup.terrain as number) === 0) id = rng.pick([1, 2, 8, 12])!;
    const key = String(id).padStart(2, '0') + (this.setup.time + 1);
    const get = async (n: string) => (await dir.load(n)) ?? undefined;
    const [sky, far, near] = await Promise.all([get(key + '-3'), get(key + '-2'), get(key + '-1')]);
    let ground = await get('ground' + key);
    if (!ground) ground = await get('ground12' + (this.setup.time + 1));
    if (!ground) ground = await get('ground011');
    for (const f of [sky, far, near] as (Frame | undefined)[]) {
      if (!f) continue;
      const s = new Sprite(f.tex);
      this.bg.addChild(s);
      this.bgLayers.push({ spr: s, w: f.w, ay: f === sky ? f.h : f.ay, h: f.h });
    }
    this.ground = new TilingSprite({ texture: ground?.tex ?? Texture.WHITE, width: W + 1600, height: VIEW_H + 400 - HORIZON });
    this.ground.position.set(-800, HORIZON);
    // depth shading: darker/hazier toward the horizon
    const c = document.createElement('canvas');
    c.width = 2;
    c.height = 256;
    const g = c.getContext('2d')!;
    const gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, 'rgba(0,0,0,0.55)');
    gr.addColorStop(0.18, 'rgba(0,0,0,0.18)');
    gr.addColorStop(0.5, 'rgba(0,0,0,0)');
    gr.addColorStop(1, 'rgba(0,0,0,0.25)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 2, 256);
    this.groundShade = new Sprite(Texture.from(c));
    this.groundShade.position.set(-800, HORIZON);
    this.groundShade.width = W + 1600;
    this.groundShade.height = VIEW_H + 60 - HORIZON;
  }

  private makeWeather() {
    const w = this.setup.weather;
    if (w !== 2 && w !== 3 && w !== 4) return;
    void shapes('').then((root) => {
      const f = root.frame(w === 2 ? 'raindrop' : 'snowball');
      if (!f) return;
      const n = w === 2 ? 140 : w === 3 ? 110 : 70;
      for (let i = 0; i < n; i++) {
        const s = new Sprite(f.tex);
        s.anchor.set(f.ax / f.w, f.ay / f.h);
        s.alpha = w === 2 ? rng.range(0.35, 0.7) : w === 3 ? rng.range(0.6, 1) : rng.range(0.3, 0.55);
        const sc = rng.range(0.6, 1.2);
        s.scale.set(w === 4 ? sc * 2.2 : sc, w === 4 ? sc * 0.5 : sc);
        if (w === 4) s.tint = 0xc8b088; // wind-blown dust
        s.blendMode = 'add';
        this.weatherC.addChild(s);
        this.drops.push({
          s, x: rng.range(0, core.width), y: rng.range(0, core.height),
          vx: w === 2 ? -3 * sc : w === 3 ? rng.range(-0.6, 0.6) : -rng.range(9, 16) * sc,
          vy: w === 2 ? 15 * sc : w === 3 ? rng.range(0.8, 1.8) * sc : rng.range(-0.3, 0.6),
        });
      }
    });
  }

  // ---------------------------------------------------------------- layout
  private viewW() {
    return core.width / this.s;
  }

  resize(w: number, h: number) {
    this.s = Math.min(h / (VIEW_H - VIEW_TOP), w / 760);
    this.oy = h - VIEW_H * this.s;
    if (this.oy > 0) this.oy = (h - (VIEW_H - VIEW_TOP) * this.s) / 2 - VIEW_TOP * this.s;
    this.worldC.scale.set(this.s);
    this.drawUI();
  }

  // ---------------------------------------------------------------- loop
  tick() {
    if (!this.world) return;
    this.lastTick = performance.now();
    this.tickInterval = 1000 / (30 * Math.max(0.1, core.speed));
    const w = this.world;
    if (w.phase === 'intro') {
      this.introT++;
      if (this.introT === 50) {
        w.phase = 'fight';
        sfx('vs');
        this.hud.banner?.('开 战', 'go');
        for (const side of [0, 1] as const) {
          w.orderAll(side, 'advance');
        }
      }
    }
    if (w.slowmo > 0 && w.slowmo % 2 === 0) {
      // slow motion: skip every other tick
      w.slowmo--;
      return;
    }
    w.step();
    if (w.phase === 'fight') for (const a of this.ai) a.tick();
    if (w.phase === 'over' && !this.done) {
      this.done = true;
      this.onOver();
    }
    if (++this.uiT >= 3) {
      this.uiT = 0;
      this.drawUI();
    }
  }

  frame(dt: number) {
    if (!this.world) return;
    const al = this.paused || this.paused2 ? 1 : Math.min(1, (performance.now() - this.lastTick) / this.tickInterval);
    this.world.render(al);
    this.world.fx.frame(al, dt);
    // camera
    const w = this.world;
    const vw = this.viewW();
    if (this.keysDown.size) {
      const d = (this.keysDown.has('ArrowRight') ? 1 : 0) - (this.keysDown.has('ArrowLeft') ? 1 : 0);
      this.camX += (d * 900 * dt) / Math.max(0.5, this.s);
      this.manualT = 2.5;
    }
    if (this.manualT > 0) this.manualT -= dt;
    else if (!this.drag) {
      const pg = w.sides[0].gen;
      const eg = w.sides[1].gen;
      let fx = pg.alive || pg.fled ? pg.x : eg.x;
      if (!pg.alive && !eg.alive) fx = (pg.x + eg.x) / 2;
      const px = pg.px + (pg.x - pg.px) * al;
      let anchor = 0.5;
      if (pg.alive) {
        // keep the general in view but lean toward where the fighting is
        const front = this.frontX();
        fx = px;
        anchor = 0.38;
        if (front !== null) {
          const want = (px + front) / 2;
          fx = Math.max(px - vw * 0.12, Math.min(px + vw * 0.3, want));
          anchor = 0.5;
        }
      }
      this.camTarget = fx - vw * anchor;
      if (w.focusT > 0) this.camTarget = w.focusX - vw * 0.5;
      this.camX += (this.camTarget - this.camX) * (1 - Math.exp(-dt * 3.2));
    }
    this.camX = Math.max(-150, Math.min(W + 150 - vw, this.camX));
    w.camX = this.camX;
    w.viewW = vw;
    const sx = w.fx.shakeX;
    const sy = w.fx.shakeY;
    this.worldC.position.set(Math.round(-this.camX * this.s + sx), Math.round(this.oy + sy));
    // parallax background
    const horizonY = this.oy + HORIZON * this.s + sy * 0.5;
    const span = Math.max(1, W + 300 - vw);
    const t = Math.max(0, Math.min(1, (this.camX + 150) / span));
    this.bgLayers.forEach((l, i) => {
      const isSky = i === 0;
      let k = Math.max(1, (vw * (isSky ? 1.02 : 1.12)) / l.w);
      if (isSky) k = Math.max(k, horizonY / this.s / l.h);
      const sc = this.s * k;
      const ww = l.w * sc;
      l.spr.scale.set(sc);
      l.spr.position.set(Math.round(-t * (ww - core.width) + sx * 0.3), Math.round(horizonY - l.ay * sc));
    });
    // weather
    if (this.drops.length) {
      const W2 = core.width;
      const H2 = core.height;
      for (const d of this.drops) {
        d.x += d.vx * dt * 60;
        d.y += d.vy * dt * 60;
        if (d.y > H2 + 20) {
          d.y = -20;
          d.x = rng.range(-40, W2 + 40);
        } else if (d.y < -30) d.y = H2 + 10;
        if (d.x < -40) d.x += W2 + 80;
        else if (d.x > W2 + 40) d.x -= W2 + 80;
        d.s.position.set(d.x, d.y);
      }
    }
  }

  private frontCache: number | null = null;
  private frontT = 0;
  /** x of the player's fighting front (mean of soldiers near enemies), cached */
  private frontX(): number | null {
    if (--this.frontT > 0) return this.frontCache;
    this.frontT = 15;
    const w = this.world;
    const S = w.sides[0];
    const E = w.sides[1];
    let best: number | null = null;
    let bd = 1e9;
    // nearest enemy-contact point in front of the general
    for (const u of E.units) {
      if (!u.alive) continue;
      const d = Math.abs(u.x - S.gen.x);
      if (d < bd) {
        bd = d;
        best = u.x;
      }
    }
    if (E.gen.alive && Math.abs(E.gen.x - S.gen.x) < bd) best = E.gen.x;
    this.frontCache = best;
    return best;
  }

  // ---------------------------------------------------------------- commands
  command(c: string) {
    const w = this.world;
    if (w.phase !== 'fight') return;
    const S = w.sides[0];
    if (!S.human || S.retreat || !S.gen.alive) return;
    sfx('touch', { volume: 0.5 });
    switch (c) {
      case 'charge':
      case 'retreat':
        w.orderAll(0, c);
        this.hud.banner?.(c === 'charge' ? '全军突击' : '全军撤退', c);
        break;
      case 'holdAll':
        w.orderAll(0, 'hold');
        break;
      case 'gadvance':
        w.orderGeneral(0, 'advance');
        break;
      case 'gback':
        w.orderGeneral(0, 'back');
        break;
      case 'ghold':
        w.orderGeneral(0, 'hold');
        break;
      default:
        if (this.selected === -2) {
          if (c === 'advance' || c === 'back' || c === 'hold') w.orderGeneral(0, c);
        } else w.orderGroup(0, this.selected, c);
    }
    this.manualT = 0;
    this.drawUI();
  }

  playerCast(id: number) {
    const w = this.world;
    if (w.phase !== 'fight' || !w.sides[0].human) return;
    if (castSkill(w, 0, id, this.ctx)) {
      this.manualT = 0;
      this.drawUI();
    }
  }

  togglePause() {
    this.paused2 = !this.paused2;
    this.paused = this.paused2;
    this.drawUI();
  }

  private selTex: Texture | null = null;
  private markTex: Texture | null = null;
  private highlight() {
    const w = this.world;
    if (!this.selTex) {
      const c = document.createElement('canvas');
      c.width = 64;
      c.height = 20;
      const g = c.getContext('2d')!;
      const gr = g.createRadialGradient(32, 10, 2, 32, 10, 32);
      gr.addColorStop(0, 'rgba(255,255,255,0.0)');
      gr.addColorStop(0.55, 'rgba(255,255,255,0.35)');
      gr.addColorStop(0.8, 'rgba(255,255,255,0.9)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.setTransform(1, 0, 0, 20 / 64, 0, 0);
      g.fillStyle = gr;
      g.fillRect(0, 0, 64, 64);
      this.selTex = Texture.from(c);
    }
    if (!this.markTex) {
      const c = document.createElement('canvas');
      c.width = 16;
      c.height = 12;
      const g = c.getContext('2d')!;
      g.fillStyle = '#7fd4ff';
      g.strokeStyle = '#002040';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(2, 2);
      g.lineTo(14, 2);
      g.lineTo(8, 10);
      g.closePath();
      g.stroke();
      g.fill();
      this.markTex = Texture.from(c);
    }
    for (const u of w.sides[0].units) {
      const on = !!(this.selected >= 0 && u.group && u.group.big === this.selected && u.kind === 0);
      if (on && u.alive && !u.mark) {
        u.mark = new Sprite(this.markTex);
        u.mark.anchor.set(0.5, 1);
        this.world.layers.over.addChild(u.mark);
      } else if (!on && u.mark) {
        u.mark.destroy();
        u.mark = null;
      }
      if (!u.shadowTex) u.shadowTex = u.shadow.texture;
      u.shadow.texture = on ? this.selTex : u.shadowTex;
      if (on) u.shadow.anchor.set(0.5, 0.5);
      else u.shadow.anchor.set(u.shadowAnchor[0], u.shadowAnchor[1]);
      u.shadow.tint = on ? 0x40c8ff : 0xffffff;
      u.shadow.alpha = on ? 1 : 0.45;
      u.shadow.blendMode = on ? 'add' : 'normal';
    }
  }

  // ---------------------------------------------------------------- input
  private keysDown = new Set<string>();
  private keyUpH = (e: KeyboardEvent) => this.keysDown.delete(e.key);
  private onKey(e: KeyboardEvent) {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      this.keysDown.add(e.key);
      e.preventDefault();
      return;
    }
    if (e.repeat || core.scene !== this) return;
    const k = e.key.toLowerCase();
    if (this.world?.phase === 'over') {
      // result screen: Enter / Space / Esc confirms
      if ((k === 'enter' || k === ' ' || k === 'escape') && this.hud.resultShown?.()) {
        e.preventDefault();
        this.finish();
      }
      return;
    }
    if (k === 'escape' && this.hud.closeOverlay?.()) return;
    if (!this.world?.sides[0].human && k !== 'p' && k !== 'escape' && k !== '+' && k !== '=' && k !== '-') return;
    const map: Record<string, string> = {
      q: 'advance', e: 'back', s: 'hold', c: 'center', x: 'spread', r: 'up', f: 'down',
      ' ': 'charge', z: 'holdAll',
    };
    if (k === 'p' || k === 'escape') return this.togglePause();
    if (k === '+' || k === '=') return this.hud.speed(Math.min(3, core.speed + 1));
    if (k === '-') return this.hud.speed(Math.max(1, core.speed - 1));
    if (k === 'm' || k === 'v') return this.hud.toggleSkills?.();
    if (k === 't') return this.hud.askRetreat?.();
    if (k === 'g') return this.hud.select(-2);
    if (k === 'tab') {
      e.preventDefault();
      return this.hud.cycleGroup?.();
    }
    if (/^[0-9]$/.test(k)) {
      if (this.hud.skillsOpen?.()) return this.hud.pickSkill?.(+k);
      const groups = this.hud.groupList?.() ?? [];
      const i = +k;
      if (i === 0) return this.hud.select(-1);
      if (groups[i - 1] !== undefined) return this.hud.select(groups[i - 1]);
      return;
    }
    if (map[k]) {
      e.preventDefault();
      this.command(map[k]);
    }
  }

  private onDown(e: PointerEvent) {
    this.drag = { x: e.clientX, cam: this.camX, id: e.pointerId, moved: false };
  }
  private onMove(e: PointerEvent) {
    if (!this.drag || e.pointerId !== this.drag.id) return;
    const dx = e.clientX - this.drag.x;
    if (Math.abs(dx) > 6) this.drag.moved = true;
    if (this.drag.moved) {
      this.camX = this.drag.cam - dx / this.s;
      this.manualT = 2.5;
    }
  }
  private onUp(e: PointerEvent) {
    if (this.drag && e.pointerId === this.drag.id) {
      if (this.drag.moved) this.manualT = 2.5;
      this.drag = null;
    }
  }

  // ---------------------------------------------------------------- end
  private onOver() {
    const w = this.world;
    const won = w.winner === 'left';
    window.setTimeout(() => {
      if (!this.resolveFn) return;
      sfx(w.winner === 'draw' ? 'sorry' : won ? 'win' : 'lose');
      this.hud.showResult?.();
      // nobody to confirm a watched AI-vs-AI battle (委任 / allies): continue on our own
      if (!this.setup.left.human && !this.setup.right.human) window.setTimeout(() => this.finish(), 2500);
    }, 1800);
  }

  result(): BattleResult {
    const w = this.world;
    const r = (side: 0 | 1) => {
      const S = w.sides[side];
      const alive = S.units.filter((u) => u.kind === 0 && (u.alive || u.escaped)).length;
      return {
        soldiersLeft: Math.min(S.initial, Math.max(0, alive)),
        hp: Math.max(0, Math.round(S.gen.hp)),
        mp: Math.max(0, Math.round(S.gen.mp)),
        fled: S.gen.fled,
        defeated: !S.gen.fled && S.gen.hp <= 0,
        kills: S.kills,
      };
    };
    return { winner: w.winner ?? 'draw', left: r(0), right: r(1) };
  }

  private finish() {
    if (!this.resolveFn) return;
    const res = this.result();
    const f = this.resolveFn;
    this.resolveFn = null as unknown as typeof f;
    f(res);
  }

  drawUI() {
    if (!this.world || !this.hud) return;
    this.renderUI(<Hud api={this.hud} world={this.world} />);
  }

  general(side: 0 | 1): General {
    return this.world.sides[side].gen;
  }
  get fieldMid() {
    return FIELD_MID;
  }
  get ticksPerSec() {
    return TICKS_PER_SEC;
  }
}

function mulTint(a: number, b: number) {
  const r = (((a >> 16) & 255) * ((b >> 16) & 255)) / 255;
  const g = (((a >> 8) & 255) * ((b >> 8) & 255)) / 255;
  const bl = ((a & 255) * (b & 255)) / 255;
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
}

