// 单挑 scene: two generals face each other; real-time duel driven by DuelSim
// (rules.ts) with player input, AI, and lots of juice (hit-stop, shake, zoom,
// sparks, blood, damage numbers, slow-mo on the final blow).
import { Container, Graphics, Sprite } from 'pixi.js';
import { AnimSprite, loadObject, type LoadedObject } from '../../engine/anim';
import { shapes, type Frame } from '../../engine/assets';
import { playMusic, preloadSfx, sfx, unlockAudio } from '../../engine/audio';
import { core, Scene } from '../../engine/core';
import { modalKey } from '../../engine/keys';
import { Rng } from '../../engine/rng';
import type { DuelResult, DuelSetup } from '../../game/contracts';
import { confirmBox, Portrait } from '../../ui/kit';
import { Aura, Battleground, bgSets, DamageNum, frameSeq, FrameFx, radialVignette, Ring, Spark, type Fx } from './fx';
import {
  dialogueFor, DuelSim, fighterStats, finishNow, fmtLine, pickAnim, simulate, SUPER_CUTIN, SUPER_NAMES,
  type FighterStats, type Move, type SideIx, type SimEvent,
} from './rules';
import './duel.css';

export interface DuelOptions {
  /** start both fighters at full HP (tournament) */
  fullHp?: boolean;
  /** caption shown at the top, e.g. "比武大会 · 决赛" */
  title?: string;
  music?: string;
  /** bf/bg set ("01".."13") and variant (1 day, 2 dusk, 3 night) */
  background?: string;
  variant?: number;
  /** allow the human to retreat (default true) */
  allowFlee?: boolean;
  /** AI-vs-AI duels continue automatically after the result (default true) */
  autoContinue?: boolean;
}

const GAP = 148; // distance between the two fighters' anchors (world px)
const LUNGE: Record<Move, number> = { light: 16, heavy: 30, counter: 22, super: 34 };
const BODY_Y = -62; // hit point height above the feet (world px)
const FOOT = 46; // sprite anchors sit this far above the feet

type Phase = 'load' | 'intro' | 'fight' | 'end' | 'done';

interface Pop {
  id: number;
  text: string;
  x: number;
  y: number;
  cls: string;
}

class FighterView {
  c = new Container();
  spr: AnimSprite;
  shadow = new Graphics();
  aura = new Aura();
  off = -190; // offset toward the opponent (negative = behind)
  offT = 0;
  flash = 0;
  /** play 'wait' when the current one-shot attack ends */
  idleAfter = false;
  constructor(
    obj: LoadedObject,
    public readonly dir: 1 | -1,
  ) {
    this.spr = new AnimSprite(obj, 'wait');
    this.spr.setFacing(dir === 1 ? -1 : 1);
    this.spr.y = -FOOT;
    this.shadow.ellipse(0, 0, 46, 11).fill({ color: 0x000000, alpha: 0.38 });
    this.c.addChild(this.shadow, this.aura.obj, this.spr);
    this.spr.onEnd = (name) => {
      if (name === 'hurt' || this.idleAfter || name.startsWith('attack')) {
        this.idleAfter = false;
        this.spr.play('wait');
      }
    };
  }
  get x() {
    return this.dir === 1 ? -GAP / 2 + this.off : GAP / 2 - this.off;
  }
  play(name: string, speed = 1, fallback = 'wait') {
    this.spr.speed = speed;
    if (!this.spr.play(name, true)) this.spr.play(fallback, true);
  }
  /** Push back (positive = away from the opponent). */
  knock(px: number) {
    this.off -= px;
  }
}

export class DuelScene extends Scene {
  private sim!: DuelSim;
  private st!: [FighterStats, FighterStats];
  private views: FighterView[] = [];
  private bg!: Battleground;
  private bgFill = new Graphics();
  private world = new Container();
  private fxLayer = new Container();
  private darken = new Graphics();
  private flashG = new Graphics();
  private vignette!: Sprite;
  private fx: Fx[] = [];
  private bloodFrames: Frame[] = [];
  private boomFrames: Frame[] = [];
  private bigBoomFrames: Frame[] = [];
  private rng = new Rng();

  private phase: Phase = 'load';
  private human: SideIx | -1 = -1;
  private timeScale = 1;
  private acc = 0;
  private hitstop = 0;
  private slowT = 0;
  private flashA = 0;
  private darkA = 0;
  private darkT = 0;
  private cam = { x: 0, y: 0, z: 1 };
  private camFocus: { side: SideIx; z: number; t: number } | null = null;
  private shake = 0;
  private kick = 0;
  private base = 1;
  private w = 0;
  private h = 0;
  private t = 0;

  // UI state
  private pops: Pop[] = [];
  private popSeq = 0;
  private callout: { text: string; sub?: string; cls: string; id: number } | null = null;
  private bubble: { side: SideIx; text: string; id: number } | null = null;
  private banner: { title: string; sub: string; cls: string } | null = null;
  private tips = false;
  private canContinue = false;
  private uiDirty = true;
  private uiTimer = 0;
  private skipper: (() => void) | null = null;
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private keysDown = new Set<string>();
  private alive = true;
  private finished = false;

  constructor(
    private setup: DuelSetup,
    private opts: DuelOptions,
    private done: (r: DuelResult) => void,
  ) {
    super();
    this.human = setup.leftHuman ? 0 : setup.rightHuman ? 1 : -1;
  }

  // ---------------------------------------------------------------- lifecycle
  async enter() {
    try {
      await this.load();
    } catch (e) {
      // never leave the caller hanging: resolve instantly with the same rules
      console.error('[duel] failed to load, auto-resolving', e);
      if (this.sim) finishNow(this.sim);
      this.later(() => this.finish(), 50);
    }
  }

  private async load() {
    this.ui.classList.add('duel-root');
    this.renderUI(<div class="duel-loading">单挑</div>);
    const a = fighterStats(this.setup.left, this.opts.fullHp);
    const b = fighterStats(this.setup.right, this.opts.fullHp);
    this.st = [a, b];
    this.sim = new DuelSim(a, b, [this.human !== 0, this.human !== 1]);

    const bgDir = await shapes('bf/bg');
    const sets = bgSets(bgDir);
    const set = this.opts.background && sets.includes(this.opts.background) ? this.opts.background : (this.rng.pick(sets) ?? '01');
    const variant = this.opts.variant ?? (this.rng.chance(0.7) ? 1 : 2);
    if (import.meta.env.DEV) console.info('[duel] bg', set, variant);
    const [oa, ob, bg, blood, boom, big] = await Promise.all([
      loadObject(a.objectId),
      loadObject(b.objectId),
      Battleground.load(set, variant),
      frameSeq('magic/blood', 'nbomr', 1, 16),
      frameSeq('magic/bom31', 'bbomr', 1, 14),
      frameSeq('magic/bom21', 'sbomw', 1, 16),
    ]);
    this.bloodFrames = blood;
    this.boomFrames = boom;
    this.bigBoomFrames = big;
    this.bg = bg;
    this.vignette = new Sprite(radialVignette());
    this.root.addChild(this.bgFill, this.bg, this.darken, this.world, this.vignette, this.flashG);
    this.views = [new FighterView(oa, 1), new FighterView(ob, -1)];
    for (const v of this.views) this.world.addChild(v.c);
    this.world.addChild(this.fxLayer);

    preloadSfx(['hit01', 'hit02', 'hit03', 'hit04', 'hit05', 'sword', 'def01', 'def02', 'strike02', 'yell', 'miss01', 'die-00', 'die-10', 'hurt-00', 'hurt-01', 'hurt-10', 'vs', 'win', 'lose', 'lboom', 'sboom', 'charge-00', 'level']);
    playMusic(this.opts.music ?? 'bf009');

    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    this.phase = 'intro';
    this.cam.y = this.defaultCamY();
    if (import.meta.env.DEV) (window as unknown as { __duel: DuelScene }).__duel = this;
    this.later(() => void this.intro(), 0);
  }

  exit() {
    this.alive = false;
    for (const t of this.timers) clearTimeout(t);
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    super.exit();
  }

  resize(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.base = h > w ? Math.min(h / 420, w / 330) : Math.min(h / 285, w / 460);
    this.bg?.layout(w, h);
    this.bgFill.clear().rect(0, 0, w, h).fill(0x101010);
    this.darken.clear().rect(0, 0, w, h).fill(0x000000);
    this.darken.alpha = this.darkA;
    this.flashG.clear().rect(0, 0, w, h).fill(0xffffff);
    this.flashG.alpha = this.flashA;
    if (this.vignette) {
      this.vignette.width = w;
      this.vignette.height = h;
      this.vignette.alpha = 0.55;
    }
    this.uiDirty = true;
  }

  private defaultCamY() {
    // feet at ~79% of the screen height (higher in portrait, above the controls)
    const h = this.h || core.height;
    const portrait = h > (this.w || core.width);
    return -((portrait ? 0.15 : 0.29) * h) / (this.base || 1);
  }

  // ---------------------------------------------------------------- timing helpers
  private later(fn: () => void, ms: number) {
    const id = setTimeout(() => {
      this.timers.delete(id);
      if (this.alive) fn();
    }, ms);
    this.timers.add(id);
  }
  private wait(ms: number, skippable = true) {
    return new Promise<void>((res) => {
      let fired = false;
      const fin = () => {
        if (fired) return;
        fired = true;
        if (this.skipper === fin) this.skipper = null;
        res();
      };
      this.later(fin, ms);
      if (skippable) this.skipper = fin;
    });
  }

  // ---------------------------------------------------------------- flow
  private async intro() {
    const [a, b] = this.st;
    sfx('vs');
    this.say(null);
    this.showCallout('单　挑', `${a.name}  VS  ${b.name}`, 'title', 1900);
    this.tips = this.human >= 0;
    await this.wait(1500);
    if (!this.alive) return;
    const da = dialogueFor(a.id);
    const dbb = dialogueFor(b.id);
    const weakA = b.power > a.power + 14;
    const weakB = a.power > b.power + 14;
    if (da) {
      this.say(0, fmtLine((weakA && da.askWeak) || da.ask, a.name, b.name));
      await this.wait(1700);
    }
    if (dbb && this.alive) {
      this.say(1, fmtLine((weakB && dbb.answerWeak) || dbb.answer || dbb.ask, b.name, a.name));
      await this.wait(1700);
    }
    if (!this.alive) return;
    this.say(null);
    this.showCallout('开　战', undefined, 'go', 800);
    sfx('yell', { volume: 0.8 });
    this.shake = 6;
    this.tips = false;
    this.phase = 'fight';
    for (const v of this.views) v.off = v.offT = 0;
    this.uiDirty = true;
  }

  private onEnd(e: Extract<SimEvent, { k: 'end' }>) {
    this.phase = 'end';
    const [a, b] = this.st;
    const ix: SideIx | -1 = e.winner === 'left' ? 0 : e.winner === 'right' ? 1 : -1;
    const winner = ix >= 0 ? this.st[ix as SideIx] : null;
    const loser = ix >= 0 ? this.st[(1 - ix) as SideIx] : null;
    const delay = e.reason === 'ko' ? 1900 : 900;
    if (e.reason === 'time') {
      this.showCallout('时间到', undefined, 'go', 1200);
      sfx('sstop');
    }
    if (e.reason === 'flee' && loser) {
      const lv = this.views[1 - ix];
      lv.play('walk');
      lv.spr.setFacing(lv.dir === 1 ? 1 : -1);
      lv.offT = -400;
      this.pop(1 - ix as SideIx, '撤退', 'info');
    }
    this.later(() => {
      if (!this.alive) return;
      if (ix >= 0) {
        this.views[ix].play('point', 1, 'wait');
      } else for (const v of this.views) v.play('wait');
      const human = this.human;
      let title: string;
      let cls: string;
      if (ix < 0) {
        title = '平　手';
        cls = 'draw';
      } else if (human >= 0) {
        title = ix === human ? '胜　利' : '败　北';
        cls = ix === human ? 'win' : 'lose';
      } else {
        title = `${winner!.name} 胜`;
        cls = 'win';
      }
      const how = e.reason === 'ko' ? '击败' : e.reason === 'flee' ? '逼退' : '判定胜过';
      const sub = ix < 0 ? `${a.name} 与 ${b.name} 不分胜负` : `${winner!.name} ${how} ${loser!.name}`;
      this.banner = { title, sub, cls };
      sfx(cls === 'lose' ? 'lose' : 'win');
      const dl = ix >= 0 ? dialogueFor(winner!.id) : dialogueFor(a.id);
      const line = dl ? (ix < 0 ? dl.draw : e.reason === 'flee' ? dl.winEscape || dl.winFall : dl.winFall) : '';
      if (line) {
        this.say(ix < 0 ? 0 : (ix as SideIx), fmtLine(line, ix >= 0 ? winner!.name : a.name, ix >= 0 ? loser!.name : b.name));
      }
      this.later(() => {
        this.canContinue = true;
        this.uiDirty = true;
        if (this.human < 0 && this.opts.autoContinue !== false) this.later(() => this.finish(), 1600);
      }, 500);
      this.uiDirty = true;
    }, delay);
  }

  private finish() {
    if (this.finished) return;
    this.finished = true;
    this.phase = 'done';
    let r: DuelResult;
    try {
      r = this.sim?.over ? this.sim.result() : simulate(this.setup, this.opts.fullHp);
    } catch {
      r = { winner: 'draw', leftHp: 1, rightHp: 1 };
    }
    this.done(r);
  }

  /** Skip an AI-vs-AI duel (or the remaining intro) to the result. */
  private skip() {
    if (this.phase === 'intro') {
      this.phase = 'fight';
      this.say(null);
      this.callout = null;
      this.tips = false;
      for (const v of this.views) v.off = v.offT = 0;
    }
    if (this.phase !== 'fight' || this.human >= 0) return;
    this.events(true);
    finishNow(this.sim);
    const r = this.sim.result();
    const lose = r.winner === 'left' ? 1 : r.winner === 'right' ? 0 : -1;
    if (lose >= 0 && this.sim.over?.reason === 'ko') {
      this.views[lose].play('die', 1, 'hurt');
      this.views[lose].knock(40);
    }
    this.sim.events.length = 0;
    this.onEnd({ k: 'end', winner: r.winner, reason: this.sim.over?.reason ?? 'time' });
  }

  // ---------------------------------------------------------------- input
  private onKey = (e: KeyboardEvent) => {
    if (e.repeat || core.scene !== this) return;
    if (modalKey(e) || this.paused) return; // e.g. the 撤退 confirm dialog
    unlockAudio();
    const k = e.key.toLowerCase();
    this.keysDown.add(k);
    if (this.phase === 'intro') {
      if (k === ' ' || k === 'enter' || k === 'escape') {
        if (this.human < 0) this.skip();
        else this.skipper?.();
      }
      return;
    }
    if (this.phase === 'end' || this.phase === 'done') {
      if (this.canContinue && (k === ' ' || k === 'enter' || k === 'escape' || k === 'j')) this.finish();
      return;
    }
    if (this.human < 0) {
      if (k === ' ' || k === 'enter' || k === 'escape') this.skip();
      return;
    }
    const h = this.human as SideIx;
    if (k === 'j' || k === 'a' || k === 'z') this.input(h, 'light');
    else if (k === 'k' || k === 's' || k === 'x') this.input(h, 'heavy');
    else if (k === 'l' || k === 'd' || k === ' ' || k === 'c' || k === 'shift') {
      this.input(h, 'guard');
      e.preventDefault();
    } else if (k === 'u' || k === 'w' || k === 'i' || k === 'v') this.input(h, 'super');
    else if (k === 'escape') void this.askFlee();
  };
  private onKeyUp = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    this.keysDown.delete(k);
    if (this.human < 0 || this.phase !== 'fight') return;
    const guardKeys = ['l', 'd', ' ', 'c', 'shift'];
    if (guardKeys.includes(k) && !guardKeys.some((g) => this.keysDown.has(g)) && !this.guardPointer) this.input(this.human as SideIx, 'unguard');
  };
  private onBlur = () => {
    this.keysDown.clear();
    this.guardPointer = false;
    if (this.human >= 0 && this.sim) this.sim.act(this.human as SideIx, 'unguard');
  };
  private guardPointer = false;

  private input(h: SideIx, a: 'light' | 'heavy' | 'guard' | 'unguard' | 'super') {
    if (this.phase !== 'fight') return;
    if (a === 'super' && this.sim.f[h].fury < 100) {
      this.pop(h, '怒气不足', 'info');
      return;
    }
    this.sim.act(h, a);
  }

  private async askFlee() {
    if (this.phase !== 'fight' || this.human < 0 || this.opts.allowFlee === false) return;
    this.paused = true;
    const ok = await confirmBox('临阵脱逃将被视为落败，确定要撤退吗？', '撤退', '撤退', '继续战斗');
    this.paused = false;
    if (ok && this.phase === 'fight') {
      this.sim.flee(this.human as SideIx);
      this.events(false);
    }
  }

  // ---------------------------------------------------------------- simulation
  tick() {
    this.acc += this.timeScale;
    while (this.acc >= 1) {
      this.acc -= 1;
      this.step();
    }
  }

  private step() {
    if (this.phase === 'load') return;
    if (this.hitstop > 0) {
      this.hitstop--;
      return;
    }
    if (this.phase === 'fight' && !this.sim.over) {
      this.sim.step();
      this.events(false);
      if (++this.uiTimer >= 10) {
        this.uiTimer = 0;
        this.uiDirty = true;
      }
    }
    for (const v of this.views) v.spr.tick();
  }

  private events(silent: boolean) {
    const evs = this.sim.events.splice(0);
    if (silent) return;
    for (const e of evs) this.handle(e);
  }

  private handle(e: SimEvent) {
    this.uiDirty = true;
    switch (e.k) {
      case 'start': {
        const v = this.views[e.side];
        const f = this.sim.f[e.side];
        if (e.move === 'super') {
          const plan = f.superP!;
          v.play(plan.anim, plan.speed, 'attack02');
          this.darkT = 0.25;
          sfx('sword', { rate: 0.8 });
          break;
        }
        const kind = e.move === 'heavy' ? 'heavy' : 'light';
        const p = e.move === 'counter' ? { anim: v.spr.has('attack04') ? 'attack04' : 'attack01', pre: v.spr.has('attack04') ? 9 : 18 } : pickAnim(this.st[e.side].objectId, kind, this.rng);
        v.play(p.anim, Math.max(0.6, p.pre / e.windup), 'attack01');
        if (e.move === 'heavy') {
          v.flash = 1; // orange tell
          this.addFx(new Spark(0xffc070, 7, 0.3, 26), v.x + v.dir * 16, BODY_Y - 52);
          sfx('sword', { volume: 0.7, rate: 0.85 });
          if (this.rng.chance(0.35)) sfx(this.st[e.side].female ? 'wha01' : 'wa01', { volume: 0.6 });
        } else if (e.move === 'counter') {
          this.pop(e.side, '反击', 'counter');
          sfx('sword', { volume: 0.6, rate: 1.2 });
        } else sfx('miss01', { volume: 0.35, rate: 1.3 });
        break;
      }
      case 'super': {
        const v = this.views[e.side];
        v.play('charge', 1, 'defend2');
        this.darkT = 0.72;
        this.camFocus = { side: e.side, z: 1.45, t: SUPER_CUTIN / 30 + 0.5 };
        const nm = this.st[e.side].name;
        this.showCallout(e.plan.name, nm, `super s${e.side}`, 1300);
        sfx('yell');
        sfx('charge-00', { volume: 0.8 });
        this.flashA = 0.5;
        this.shake = 4;
        const ring = new Ring(0xffb040, 0.6, 80, 4);
        this.addFx(ring, v.x, BODY_Y);
        break;
      }
      case 'hit':
        this.onHit(e);
        break;
      case 'block': {
        const v = this.views[e.side];
        const a = this.views[1 - e.side];
        v.knock(e.move === 'super' ? 14 : 6);
        const x = (v.x + a.x) / 2 + v.dir * 8;
        this.addFx(new Spark(0xfff0a0, 9, 0.22, 34), x, BODY_Y - 10);
        this.addFx(new DamageNum(String(e.dmg), 'block'), v.x, BODY_Y - 30);
        sfx(this.rng.chance(0.5) ? 'def01' : 'def02', { volume: 0.9 });
        this.shake = Math.max(this.shake, 2);
        if (e.broken) {
          this.pop(e.side, '破防', 'crit');
          v.play('hurt');
        }
        break;
      }
      case 'parry': {
        const v = this.views[e.side];
        const a = this.views[1 - e.side];
        a.play('hurt');
        a.knock(e.heavy ? 26 : 16);
        const x = (v.x + a.x) / 2;
        this.addFx(new Spark(0xffffff, 14, 0.3, 44), x, BODY_Y - 10);
        this.addFx(new Ring(0xbfe6ff, 0.3, 42, 3), x, BODY_Y - 10);
        sfx('def02', { volume: 1 });
        sfx('def01', { volume: 0.6, rate: 1.4 });
        this.pop(e.side, e.heavy ? '招架' : '完美格挡', 'parry');
        this.hitstop = Math.max(this.hitstop, 5);
        this.flashA = Math.max(this.flashA, 0.25);
        this.kick += 0.06;
        this.shake = Math.max(this.shake, 5);
        break;
      }
      case 'miss': {
        const d = this.views[1 - e.side];
        d.knock(16);
        this.pop((1 - e.side) as SideIx, '闪避', 'info');
        sfx('miss02', { volume: 0.6 });
        break;
      }
      case 'guard':
        this.views[e.side].play('defend2', 1.6, 'defend');
        break;
      case 'unguard':
        break;
      case 'idle': {
        const v = this.views[e.side];
        const n = v.spr.animName;
        if ((n.startsWith('attack') || n === 'hurt') && !v.spr.done) v.idleAfter = true;
        else v.play('wait');
        break;
      }
      case 'furyFull':
        this.pop(e.side, '怒气已满', 'fury');
        if (e.side === this.human) sfx('level', { volume: 0.7 });
        break;
      case 'end':
        this.onEnd(e);
        break;
    }
  }

  private onHit(e: Extract<SimEvent, { k: 'hit' }>) {
    const a = this.views[e.side];
    const d = this.views[1 - e.side];
    const tf = this.sim.f[1 - e.side];
    const heavy = e.move === 'heavy';
    const sup = e.move === 'super';
    const hx = d.x - d.dir * 6;
    const armored = tf.state === 'windup' && tf.move === 'super';
    if (!e.ko && !armored) d.play('hurt');
    d.flash = -1; // red flash
    d.knock(e.ko ? 50 : sup ? (e.last ? 40 : 8) : heavy ? 26 : e.move === 'counter' ? 18 : 9);
    // effects
    const blood = new FrameFx(this.bloodFrames, 40, 'add');
    blood.obj.scale.set(heavy || sup || e.crit ? 0.9 : 0.6);
    blood.obj.scale.x *= -d.dir;
    this.addFx(blood, hx, BODY_Y + this.rng.range(-14, 10));
    this.addFx(new Spark(e.crit ? 0xff8a50 : 0xfff2b0, heavy ? 14 : 8, 0.25, heavy ? 54 : 36), hx, BODY_Y - 8);
    if (heavy || sup || e.crit) {
      const boom = new FrameFx(sup && e.last ? this.bigBoomFrames : this.boomFrames, 34, 'add');
      boom.obj.scale.set(sup && e.last ? 1.2 : 0.7);
      this.addFx(boom, hx, BODY_Y);
    }
    this.addFx(new DamageNum(String(e.dmg), e.crit ? 'crit' : sup ? 'super' : 'normal'), d.x - d.dir * 10, BODY_Y - 30);
    // camera / time
    const strength = sup ? (e.last ? 14 : 7) : heavy ? 9 : e.move === 'counter' ? 7 : 3.5;
    this.shake = Math.max(this.shake, strength + (e.crit ? 4 : 0));
    this.kick += sup ? 0.05 : heavy ? 0.08 : e.crit ? 0.07 : 0.025;
    this.hitstop = Math.max(this.hitstop, sup ? (e.last ? 8 : 3) : heavy ? 5 : e.crit ? 5 : 2);
    if (heavy || (sup && e.last)) this.flashA = Math.max(this.flashA, 0.18);
    // sound
    if (sup) sfx(e.last ? 'lboom' : 'hit04', { volume: 0.9 });
    else if (heavy) {
      sfx('strike02');
      sfx('hit04', { volume: 0.7 });
    } else sfx(e.crit ? 'hit05' : this.rng.pick(['hit01', 'hit02', 'hit03'])!, { volume: 0.85 });
    const fem = this.st[1 - e.side].female;
    if (!e.ko && (heavy || e.crit || this.rng.chance(0.2))) sfx(fem ? this.rng.pick(['hurt-10', 'hurt-11', 'hurt-12'])! : this.rng.pick(['hurt-00', 'hurt-01', 'hurt-02'])!, { volume: 0.7 });
    if (e.crit) this.pop(e.side, '会心一击', 'crit');
    if (e.interrupt && !e.ko) this.pop((1 - e.side) as SideIx, '打断', 'info');
    if (e.ko) this.koFx(e.side);
  }

  private koFx(winner: SideIx) {
    const d = this.views[1 - winner];
    d.play(this.rng.chance(0.5) ? 'die' : 'die2', 1, 'die2');
    this.hitstop = 12;
    this.flashA = 0.85;
    this.slowT = 1.6;
    this.timeScale = 0.25;
    this.camFocus = { side: (1 - winner) as SideIx, z: 1.5, t: 2.4 };
    this.shake = 16;
    this.addFx(new Ring(0xffffff, 0.6, 90, 4), d.x, BODY_Y);
    sfx('lboom', { volume: 0.8 });
    sfx(this.st[1 - winner].female ? 'die-10' : this.rng.pick(['die-00', 'die-01', 'die-02'])!);
  }

  private addFx(f: Fx, x: number, y: number) {
    f.obj.position.set(x, y);
    this.fx.push(f);
    this.fxLayer.addChild(f.obj);
  }

  // ---------------------------------------------------------------- frame
  frame(dt: number) {
    if (this.phase === 'load' || !this.views.length) return;
    this.t += dt;
    if (this.slowT > 0) {
      this.slowT -= dt;
      if (this.slowT <= 0) this.timeScale = 1;
    }
    const gdt = dt * (this.paused ? 0 : this.timeScale) * (this.hitstop > 0 ? 0.1 : 1);

    // fighters
    for (let i = 0; i < 2; i++) {
      const v = this.views[i];
      const f = this.sim.f[i];
      if (this.phase === 'fight' || this.phase === 'end') {
        if (f.state === 'windup' && f.move && !(f.move === 'super' && this.sim.freeze > 0)) v.offT = LUNGE[f.move];
        else if (this.phase === 'fight') v.offT = 0;
        if (this.phase === 'end' && f.state === 'down') v.offT = Math.min(v.offT, v.off);
      }
      if (v.offT < -200) {
        // walking off (retreat): constant pace
        v.off = Math.max(v.offT, v.off - gdt * 110);
      } else {
        const rate = f.state === 'windup' ? 14 : this.phase === 'intro' ? 2.2 : 7;
        v.off += (v.offT - v.off) * (1 - Math.exp(-gdt * rate));
      }
      if (this.phase === 'intro') {
        const moving = Math.abs(v.offT - v.off) > 6;
        if (moving && v.spr.animName !== 'walk') v.play('walk');
        if (!moving && v.spr.animName === 'walk') v.play('wait');
      }
      v.c.position.set(v.x, 0);
      v.shadow.scale.set(1, 1);
      // tint: + = heavy tell (orange), - = damage (red)
      if (v.flash > 0) {
        v.flash = Math.max(0, v.flash - dt * 3);
        const k = v.flash;
        v.spr.tint = mix(0xffffff, 0xffa040, k * 0.8);
      } else if (v.flash < 0) {
        v.flash = Math.min(0, v.flash + dt * 6);
        v.spr.tint = mix(0xffffff, 0xff3030, -v.flash);
      } else v.spr.tint = 0xffffff;
      v.aura.level = f.state === 'down' ? 0 : f.move === 'super' ? 1 : f.fury >= 100 ? 0.4 : 0;
      v.aura.update(dt);
    }

    // effects
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i];
      if (!f.update(f instanceof DamageNum ? dt : gdt || dt * 0.1)) {
        f.obj.destroy();
        this.fx.splice(i, 1);
      }
    }

    // overlays
    const darkTarget = this.sim.freeze > 0 ? 0.72 : this.darkT;
    this.darkT = Math.max(0, this.darkT - dt * 1.5);
    this.darkA += (darkTarget - this.darkA) * Math.min(1, dt * 10);
    this.darken.alpha = this.darkA;
    this.flashA = Math.max(0, this.flashA - dt * 3.2);
    this.flashG.alpha = this.flashA;

    // camera
    const mid = (this.views[0].x + this.views[1].x) / 2;
    let tx = mid;
    let ty = this.defaultCamY();
    let tz = 1;
    if (this.camFocus) {
      this.camFocus.t -= dt;
      const v = this.views[this.camFocus.side];
      tx = mid * 0.4 + v.x * 0.6;
      tz = this.camFocus.z;
      ty = this.defaultCamY() / tz - 8;
      if (this.camFocus.t <= 0) this.camFocus = null;
    }
    if (this.phase === 'intro') tz = 0.92;
    const k = 1 - Math.exp(-dt * (this.camFocus ? 7 : 4));
    this.cam.x += (tx - this.cam.x) * k;
    this.cam.y += (ty - this.cam.y) * k;
    this.cam.z += (tz - this.cam.z) * k;
    this.shake *= Math.exp(-dt * 9);
    this.kick *= Math.exp(-dt * 7);
    if (this.shake < 0.2) this.shake = 0;
    const s = this.base * (this.cam.z + this.kick);
    const sx = (Math.random() - 0.5) * 2 * this.shake;
    const sy = (Math.random() - 0.5) * 2 * this.shake;
    this.world.scale.set(s);
    this.world.position.set(this.w / 2 - this.cam.x * s + sx, this.h / 2 - this.cam.y * s + sy);
    this.bg.setView(this.cam.x * s - sx, this.cam.z + this.kick);

    if (this.uiDirty) {
      this.uiDirty = false;
      this.draw();
    }
  }

  // ---------------------------------------------------------------- UI
  private pop(side: SideIx, text: string, cls: string) {
    const v = this.views[side];
    const s = this.world.scale.x;
    const x = this.world.position.x + v.x * s;
    const y = this.world.position.y + (BODY_Y - 92) * s;
    const id = ++this.popSeq;
    this.pops.push({ id, text, x, y, cls });
    if (this.pops.length > 6) this.pops.shift();
    this.later(() => {
      this.pops = this.pops.filter((p) => p.id !== id);
      this.uiDirty = true;
    }, 1100);
    this.uiDirty = true;
  }

  private showCallout(text: string, sub: string | undefined, cls: string, ms: number) {
    const id = ++this.popSeq;
    this.callout = { text, sub, cls, id };
    this.uiDirty = true;
    this.later(() => {
      if (this.callout?.id === id) {
        this.callout = null;
        this.uiDirty = true;
      }
    }, ms);
  }

  private say(side: SideIx | null, text = '') {
    this.bubble = side === null ? null : { side, text, id: ++this.popSeq };
    this.uiDirty = true;
  }

  private draw() {
    const sim = this.sim;
    const [a, b] = this.st;
    const h = this.human;
    const fighting = this.phase === 'fight';
    const secs = Math.ceil(sim.timeLeft / 30);
    const me = h >= 0 ? sim.f[h as SideIx] : null;
    const superReady = !!me && me.fury >= 100;
    const tapAnywhere = () => {
      unlockAudio();
      if (this.phase === 'intro') {
        if (this.human < 0) this.skipper?.();
        else this.skipper?.();
      } else if ((this.phase === 'end' || this.phase === 'done') && this.canContinue) this.finish();
    };
    const hold = (on: boolean) => (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      unlockAudio();
      if (h < 0) return;
      this.guardPointer = on;
      this.input(h as SideIx, on ? 'guard' : 'unguard');
    };
    const press = (a: 'light' | 'heavy' | 'super') => (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      unlockAudio();
      if (h >= 0) this.input(h as SideIx, a);
    };
    this.renderUI(
      <div class={`duel-ui ${this.phase}`} onPointerDown={tapAnywhere}>
        <div class="duel-top">
          <SideHud s={a} f={sim.f[0]} side={0} human={h === 0} />
          <div class="duel-mid">
            {this.opts.title && <div class="duel-caption">{this.opts.title}</div>}
            <div class={`duel-timer ${secs <= 10 && fighting ? 'urgent' : ''}`}>{secs}</div>
          </div>
          <SideHud s={b} f={sim.f[1]} side={1} human={h === 1} />
        </div>

        {this.bubble && (
          <div key={this.bubble.id} class={`duel-bubble s${this.bubble.side}`}>
            <b>{this.st[this.bubble.side].name}</b>
            {this.bubble.text}
          </div>
        )}

        {this.callout && (
          <div key={this.callout.id} class={`duel-callout ${this.callout.cls}`}>
            <div class="t">{this.callout.text}</div>
            {this.callout.sub && <div class="s">{this.callout.sub}</div>}
          </div>
        )}

        {this.pops.map((p) => (
          <div key={p.id} class={`duel-pop ${p.cls}`} style={{ left: `${p.x}px`, top: `${p.y}px` }}>
            {p.text}
          </div>
        ))}

        {this.tips && (
          <div class="duel-tips">
            <span><b>攻击</b>快攻，可打断重击</span>
            <span><b>重击</b>伤害高，会被防御招架</span>
            <span><b>防御</b>按住格挡，时机准确可完美格挡</span>
            <span><b>必杀</b>怒气满时施放</span>
          </div>
        )}

        {h >= 0 && (fighting || this.phase === 'intro') && (
          <>
            <div class="duel-ctrl left">
              <button class="dbtn guard" onPointerDown={hold(true)} onPointerUp={hold(false)} onPointerCancel={hold(false)} onPointerLeave={(e) => this.guardPointer && hold(false)(e)}>
                <span>防御</span>
                <kbd>L / 空格</kbd>
              </button>
            </div>
            <div class="duel-ctrl right">
              <button class={`dbtn super ${superReady ? 'ready' : ''}`} onPointerDown={press('super')}>
                <span>必杀</span>
                <kbd>U</kbd>
              </button>
              <button class="dbtn heavy" onPointerDown={press('heavy')}>
                <span>重击</span>
                <kbd>K</kbd>
              </button>
              <button class="dbtn light" onPointerDown={press('light')}>
                <span>攻击</span>
                <kbd>J</kbd>
              </button>
            </div>
            {this.opts.allowFlee !== false && (
              <button class="dbtn-small flee" onPointerDown={(e) => { e.stopPropagation(); void this.askFlee(); }}>
                撤退 <kbd>Esc</kbd>
              </button>
            )}
          </>
        )}

        {h < 0 && (fighting || this.phase === 'intro') && (
          <button class="dbtn-small skip" onPointerDown={(e) => { e.stopPropagation(); this.skip(); }}>
            跳过 <kbd>空格</kbd>
          </button>
        )}

        {this.banner && (
          <div class={`duel-banner ${this.banner.cls}`}>
            <div class="t">{this.banner.title}</div>
            <div class="s">{this.banner.sub}</div>
            {this.canContinue && (this.human >= 0 || this.opts.autoContinue === false) && <div class="c">点击继续</div>}
          </div>
        )}
      </div>,
    );
  }
}

function SideHud(props: { s: FighterStats; f: { hp: number; fury: number; state: string }; side: SideIx; human: boolean }) {
  const { s, f, side } = props;
  const hp = Math.max(0, (f.hp / s.maxHp) * 100);
  const fury = Math.min(100, f.fury);
  const supers = s.supers.map((n) => SUPER_NAMES[n]).join('·') || '奋力一击';
  return (
    <div class={`duel-side s${side} ${props.human ? 'me' : ''}`}>
      <Portrait general={s.id} class="duel-portrait" />
      <div class="duel-info">
        <div class="duel-name">
          <b>{s.name}</b>
          <span>Lv{s.level}</span>
          <span>武{s.str}</span>
          {props.human && <i class="me-tag">玩家</i>}
        </div>
        <div class="duel-hp">
          <i class="trail" style={{ width: `${hp}%` }} />
          <i class={`fill ${hp < 25 ? 'low' : ''}`} style={{ width: `${hp}%` }} />
          <em>
            {Math.ceil(f.hp)} / {s.maxHp}
          </em>
        </div>
        <div class={`duel-fury ${fury >= 100 ? 'full' : ''}`}>
          <i style={{ width: `${fury}%` }} />
          <em>{fury >= 100 ? `必杀 · ${supers}` : '怒'}</em>
        </div>
      </div>
    </div>
  );
}

function mix(a: number, b: number, k: number) {
  k = Math.max(0, Math.min(1, k));
  const r = ((a >> 16) & 255) * (1 - k) + ((b >> 16) & 255) * k;
  const g = ((a >> 8) & 255) * (1 - k) + ((b >> 8) & 255) * k;
  const bl = (a & 255) * (1 - k) + (b & 255) * k;
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
}
