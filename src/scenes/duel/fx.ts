// Visual effects for the duel scene: background composition, frame-sequence
// effects (blood, explosions), sparks, floating damage numbers.
import { Container, Graphics, Rectangle, Sprite, Text, Texture, TilingSprite } from 'pixi.js';
import { shapes, type Frame, type ShapeDir } from '../../engine/assets';

// ------------------------------------------------------------------ effects
export interface Fx {
  obj: Container;
  /** returns false when finished (then destroyed by the owner) */
  update(dt: number): boolean;
}

/** Plays a list of atlas frames once at `fps`. */
export class FrameFx implements Fx {
  obj: Sprite;
  private t = 0;
  constructor(
    private frames: Frame[],
    private fps = 30,
    blend: 'add' | 'normal' = 'add',
  ) {
    this.obj = new Sprite(frames[0]?.tex ?? Texture.EMPTY);
    this.obj.blendMode = blend;
    this.apply(0);
  }
  private apply(i: number) {
    const f = this.frames[i];
    if (!f) return;
    this.obj.texture = f.tex;
    this.obj.anchor.set(f.ax / f.w, f.ay / f.h);
  }
  update(dt: number) {
    this.t += dt;
    const i = Math.floor(this.t * this.fps);
    if (i >= this.frames.length) return false;
    this.apply(i);
    return true;
  }
}

/** Radial streaks (weapon clash). */
export class Spark implements Fx {
  obj = new Graphics();
  private t = 0;
  constructor(
    color = 0xfff2b0,
    n = 10,
    private life = 0.28,
    size = 40,
  ) {
    const g = this.obj;
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2;
      const r0 = size * (0.15 + Math.random() * 0.2);
      const r1 = size * (0.6 + Math.random() * 0.6);
      g.moveTo(Math.cos(a) * r0, Math.sin(a) * r0).lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
    }
    g.stroke({ color, width: 2.2, alpha: 1 });
    g.circle(0, 0, size * 0.22).fill({ color: 0xffffff, alpha: 0.9 });
    g.blendMode = 'add';
  }
  update(dt: number) {
    this.t += dt;
    const k = this.t / this.life;
    if (k >= 1) return false;
    this.obj.scale.set(0.6 + k * 0.9);
    this.obj.alpha = 1 - k * k;
    return true;
  }
}

/** Expanding ring (parry, super impact). */
export class Ring implements Fx {
  obj = new Graphics();
  private t = 0;
  constructor(
    color = 0xffffff,
    private life = 0.4,
    private r = 60,
    width = 4,
  ) {
    this.obj.circle(0, 0, r).stroke({ color, width, alpha: 1 });
    this.obj.blendMode = 'add';
    this.obj.scale.set(0.2);
  }
  update(dt: number) {
    this.t += dt;
    const k = this.t / this.life;
    if (k >= 1) return false;
    const e = 1 - (1 - k) * (1 - k);
    this.obj.scale.set(0.2 + e);
    this.obj.alpha = 1 - k;
    return true;
  }
}

const NUM_STYLE = {
  fontFamily: 'Impact, "Arial Black", "PingFang SC", sans-serif',
  fontSize: 30,
  fontWeight: '900' as const,
  fill: '#fff4c8',
  stroke: { color: '#1a0800', width: 6, join: 'round' as const },
  dropShadow: { color: '#000000', alpha: 0.6, blur: 3, distance: 2, angle: Math.PI / 2 },
};

/** Floating damage number. */
export class DamageNum implements Fx {
  obj: Text;
  private t = 0;
  private vy: number;
  private vx: number;
  constructor(text: string, kind: 'normal' | 'crit' | 'block' | 'super' | 'heal' = 'normal') {
    const fill = kind === 'crit' ? '#ff5a2a' : kind === 'block' ? '#c8c8c8' : kind === 'super' ? '#ffd23a' : '#fff4c8';
    const size = kind === 'crit' ? 44 : kind === 'super' ? 48 : kind === 'block' ? 22 : 32;
    this.obj = new Text({ text, style: { ...NUM_STYLE, fill, fontSize: size }, resolution: 3 });
    this.obj.anchor.set(0.5, 1);
    this.vy = -(kind === 'block' ? 40 : 70);
    this.vx = (Math.random() - 0.5) * 40;
    this.obj.scale.set(0.2);
  }
  update(dt: number) {
    this.t += dt;
    const k = this.t;
    if (k > 1.0) return false;
    // pop in, hang, then float and fade
    const s = k < 0.12 ? 0.2 + (k / 0.12) * 0.75 : k < 0.2 ? 0.95 - ((k - 0.12) / 0.08) * 0.25 : 0.7;
    this.obj.scale.set(s);
    this.obj.y += this.vy * dt * (k < 0.2 ? 0.3 : 1);
    this.obj.x += this.vx * dt;
    this.vy *= 0.97;
    this.obj.alpha = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
    return true;
  }
}

/** Pulsing aura behind a fighter (fury full / super). */
export class Aura {
  obj: Sprite;
  private t = 0;
  /** target intensity 0..1 */
  level = 0;
  strength = 0;
  private static tex = new Map<string, Texture>();
  constructor(color = 'rgba(255,130,30,') {
    let tex = Aura.tex.get(color);
    if (!tex) tex = Aura.make(color);
    this.obj = new Sprite(tex);
    this.obj.anchor.set(0.5);
    this.obj.blendMode = 'add';
    this.obj.alpha = 0;
    this.obj.y = -70;
  }
  private static make(color: string) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    const gr = g.createRadialGradient(64, 64, 4, 64, 64, 64);
    gr.addColorStop(0, color + '0.9)');
    gr.addColorStop(0.45, color + '0.45)');
    gr.addColorStop(1, color + '0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
    const t = Texture.from(c);
    Aura.tex.set(color, t);
    return t;
  }
  update(dt: number) {
    this.t += dt;
    this.strength += (this.level - this.strength) * Math.min(1, dt * 6);
    this.obj.alpha = this.strength * (0.7 + 0.3 * Math.sin(this.t * 9));
    this.obj.scale.set(1.5 + 0.08 * Math.sin(this.t * 6), 2.3 + 0.1 * Math.sin(this.t * 7));
    this.obj.visible = this.strength > 0.01;
  }
}

// ------------------------------------------------------------------ frames
export async function frameSeq(dir: string, prefix: string, from: number, to: number): Promise<Frame[]> {
  const d = await shapes(dir);
  const out: Frame[] = [];
  for (let i = from; i <= to; i++) {
    const f = d.frame(prefix + String(i).padStart(3, '0'));
    if (f) out.push(f);
  }
  return out;
}

// ------------------------------------------------------------------ background
const gradCache = new Map<string, Texture>();
/** Gradient texture (vertical) generated on a canvas (cached). */
export function vGradient(stops: [number, string][], h = 256): Texture {
  const key = JSON.stringify(stops) + h;
  const hit = gradCache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = h;
  const g = c.getContext('2d')!;
  const gr = g.createLinearGradient(0, 0, 0, h);
  for (const [o, col] of stops) gr.addColorStop(o, col);
  g.fillStyle = gr;
  g.fillRect(0, 0, 4, h);
  const t = Texture.from(c);
  gradCache.set(key, t);
  return t;
}

let vignetteTex: Texture | null = null;
export function radialVignette(): Texture {
  if (vignetteTex) return vignetteTex;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(128, 128, 60, 128, 128, 180);
  gr.addColorStop(0, 'rgba(0,0,0,0)');
  gr.addColorStop(1, 'rgba(0,0,0,0.75)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 256, 256);
  return (vignetteTex = Texture.from(c));
}

/** All battle background sets present in bf/bg ("01".."13"). */
export function bgSets(dir: ShapeDir): string[] {
  const out = new Set<string>();
  for (const n of dir.names()) {
    const m = /^(\d\d)\d-[12]$/.exec(n);
    if (m && dir.has(`ground${n.slice(0, 3)}`)) out.add(m[1]);
  }
  return [...out].sort();
}

/**
 * Battle background (sky, far, near strips and a tiled ground) laid out in
 * screen space. Parallax is applied by the scene through `setView`.
 */
export class Battleground extends Container {
  private sky?: Sprite;
  private far?: Sprite;
  private near?: Sprite;
  private ground?: TilingSprite;
  private haze: Sprite;
  private w = 0;
  private h = 0;
  horizon = 0;
  private k = 1;

  static async load(set: string, variant: number): Promise<Battleground> {
    const dir = await shapes('bf/bg');
    const id = `${set}${variant}`;
    const get = async (n: string) => (dir.has(n) ? await dir.load(n) : undefined);
    const [sky, far, near, ground] = await Promise.all([get(`${id}-3`), get(`${id}-2`), get(`${id}-1`), get(`ground${id}`)]);
    return new Battleground(sky, far, near, ground, variant);
  }

  constructor(sky?: Frame, far?: Frame, near?: Frame, ground?: Frame, variant = 1) {
    super();
    const mk = (f?: Frame) => {
      if (!f) return undefined;
      // cut the strip at its anchor line: some strips have dark rows below it
      const fr = f.tex.frame;
      const tex = f.ay > 0 && f.ay < f.h ? new Texture({ source: f.tex.source, frame: new Rectangle(fr.x, fr.y, fr.width, f.ay) }) : f.tex;
      const s = new Sprite(tex);
      s.anchor.set(0, 1);
      this.addChild(s);
      return s;
    };
    if (sky) {
      this.sky = new Sprite(sky.tex);
      this.addChild(this.sky);
    }
    if (ground) {
      this.ground = new TilingSprite({ texture: ground.tex, width: 16, height: 16 });
      this.addChild(this.ground);
    }
    this.far = mk(far);
    this.near = mk(near);
    const tint = variant === 3 ? 'rgba(10,14,40,' : variant === 2 ? 'rgba(60,24,6,' : 'rgba(20,16,10,';
    this.haze = new Sprite(vGradient([[0, tint + '0.55)'], [0.25, tint + '0.1)'], [0.7, tint + '0.25)'], [1, tint + '0.7)']]));
    this.addChild(this.haze);
  }

  layout(w: number, h: number) {
    this.w = w;
    this.h = h;
    const span = w * 1.5;
    this.horizon = Math.round(h * 0.5);
    const hz = this.horizon;
    this.k = span / 1000;
    const x0 = (w - span) / 2;
    if (this.sky) {
      this.sky.position.set(x0, -h * 0.3);
      this.sky.width = span;
      this.sky.height = hz + h * 0.3 + 8;
    }
    if (this.far) {
      this.far.scale.set(this.k);
      this.far.position.set(x0, hz);
    }
    if (this.near) {
      const kk = (w * 1.6) / 1200;
      this.near.scale.set(kk);
      this.near.position.set((w - 1200 * kk) / 2, hz + 2);
    }
    if (this.ground) {
      this.ground.position.set(x0, hz - 2);
      this.ground.width = span;
      this.ground.height = h * 0.9;
      this.ground.tileScale.set(this.k * 0.9, this.k * 0.6);
    }
    this.haze.position.set(x0, -h * 0.3);
    this.haze.width = span;
    this.haze.height = h * 1.7;
  }

  /** Parallax: camera offset in screen pixels and zoom factor (≥1). */
  setView(dx: number, zoom: number) {
    const z = 1 + (zoom - 1) * 0.35;
    this.pivot.set(this.w / 2, this.horizon);
    this.position.set(this.w / 2 - dx * 0.25, this.horizon + (z - 1) * this.h * 0.18);
    this.scale.set(z);
    if (this.ground) this.ground.tilePosition.x = -dx * 0.35 / Math.max(0.01, this.k);
  }
}
