// Application shell: Pixi renderer, DOM UI layer, scene stack and the
// fixed-timestep loop.
//
// Rendering happens at the display's refresh rate; game logic runs in fixed
// ticks of 1/TICK_HZ s (like the original), scaled by `core.speed`.
import { Application, Container } from 'pixi.js';
import { render, type ComponentChild } from 'preact';
import { TICK_HZ } from './anim';

export abstract class Scene {
  /** World layer rendered by Pixi. */
  readonly root = new Container();
  /** DOM layer for UI (Preact renders here). */
  readonly ui: HTMLDivElement = document.createElement('div');
  /** Whether logic ticks should run (e.g. false while a modal dialog is open). */
  paused = false;

  constructor() {
    this.ui.className = 'scene-ui';
  }

  /** Called once when the scene becomes active. May load assets. */
  abstract enter(): Promise<void> | void;
  /** Called when the scene is removed. Default: destroys Pixi + DOM content. */
  exit(): void {
    render(null, this.ui);
    this.root.destroy({ children: true });
  }
  /** One fixed logic tick (1/TICK_HZ s of game time). */
  tick(): void {}
  /** Per rendered frame; `dt` in seconds (real time), for camera/visual smoothing. */
  frame(_dt: number): void {}
  /** Viewport size changed (CSS pixels). */
  resize(_w: number, _h: number): void {}
  /** Re-render DOM UI using Preact. */
  renderUI(node: ComponentChild) {
    render(node, this.ui);
  }
}

class Core {
  app!: Application;
  uiRoot!: HTMLDivElement;
  stack: Scene[] = [];
  /** game speed multiplier (battle speed-up etc.) */
  speed = 1;
  width = 0;
  height = 0;
  private acc = 0;
  private fader!: HTMLDivElement;
  private busy = false;

  async init() {
    this.app = new Application();
    await this.app.init({
      resizeTo: window,
      background: '#000000',
      antialias: false,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      preference: 'webgl',
      powerPreference: 'high-performance',
    });
    document.getElementById('stage')!.appendChild(this.app.canvas);
    this.uiRoot = document.getElementById('ui') as HTMLDivElement;
    this.fader = document.getElementById('fader') as HTMLDivElement;
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    window.addEventListener('resize', () => this.onResize());
    this.app.ticker.add((t) => this.loop(t.deltaMS / 1000));
  }

  get scene(): Scene | undefined {
    return this.stack[this.stack.length - 1];
  }

  private onResize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    for (const s of this.stack) s.resize(this.width, this.height);
  }

  private loop(dt: number) {
    dt = Math.min(dt, 0.25);
    const s = this.scene;
    if (!s) return;
    if (!s.paused && !this.busy) {
      this.acc += dt * TICK_HZ * this.speed;
      let n = 0;
      while (this.acc >= 1 && n < 12) {
        this.acc -= 1;
        s.tick();
        n++;
      }
      if (n >= 12) this.acc = 0;
    }
    s.frame(dt);
  }

  private attach(s: Scene) {
    this.app.stage.addChild(s.root);
    this.uiRoot.appendChild(s.ui);
    s.resize(this.width, this.height);
  }

  private detach(s: Scene) {
    this.app.stage.removeChild(s.root);
    s.ui.remove();
  }

  /** Replaces the whole stack with `next` (with a fade transition). */
  async go(next: Scene) {
    await this.fadeOut();
    while (this.stack.length) {
      const s = this.stack.pop()!;
      this.detach(s);
      s.exit();
    }
    await this.start(next);
  }

  /** Pushes a scene on top (e.g. a battle over the field map). Underlying scene is hidden. */
  async push(next: Scene) {
    await this.fadeOut();
    const top = this.scene;
    if (top) {
      top.root.visible = false;
      top.ui.style.display = 'none';
    }
    await this.start(next);
  }

  /** Pops the top scene and resumes the one below. */
  async pop() {
    await this.fadeOut();
    const s = this.stack.pop();
    if (s) {
      this.detach(s);
      s.exit();
    }
    const top = this.scene;
    if (top) {
      top.root.visible = true;
      top.ui.style.display = '';
      top.resize(this.width, this.height);
    }
    this.acc = 0;
    await this.fadeIn();
  }

  private async start(next: Scene) {
    this.busy = true;
    this.stack.push(next);
    this.attach(next);
    try {
      await next.enter();
    } catch (e) {
      console.error(e);
      showError(e);
    }
    next.resize(this.width, this.height);
    this.busy = false;
    this.acc = 0;
    await this.fadeIn();
  }

  fadeOut(ms = 250) {
    return this.fadeTo(1, ms);
  }
  fadeIn(ms = 300) {
    return this.fadeTo(0, ms);
  }
  private fadeTo(o: number, ms: number) {
    return new Promise<void>((res) => {
      this.fader.style.transition = `opacity ${ms}ms ease`;
      this.fader.style.pointerEvents = o ? 'all' : 'none';
      requestAnimationFrame(() => {
        this.fader.style.opacity = String(o);
        setTimeout(res, ms);
      });
    });
  }
}

export const core = new Core();

export function showError(e: unknown) {
  const el = document.createElement('div');
  el.className = 'fatal';
  el.textContent = String(e instanceof Error ? e.message : e);
  document.body.appendChild(el);
}

/** Fits a design-size box into the viewport, returning scale and offset. */
export function fit(designW: number, designH: number, w = core.width, h = core.height, cover = false) {
  const s = cover ? Math.max(w / designW, h / designH) : Math.min(w / designW, h / designH);
  return { scale: s, x: (w - designW * s) / 2, y: (h - designH * s) / 2 };
}
