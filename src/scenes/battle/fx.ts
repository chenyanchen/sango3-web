// Pooled visual effects for the battle: one-shot object animations (from
// Things.obd), simple physics particles, damage numbers, screen shake and
// flashes. Purely visual — never affects the simulation.
import { BitmapText, Container, Graphics, Sprite, Texture } from 'pixi.js';
import { db } from '../../data/db';
import { AnimSprite, loadObject, type LoadedObject } from '../../engine/anim';
import { rng } from '../../engine/rng';

const objs = new Map<number, LoadedObject>();
const loading = new Map<number, Promise<LoadedObject | null>>();

/** Preloads Things.obd objects so they can be spawned synchronously. */
export function ensureObjects(ids: number[]): Promise<unknown> {
  return Promise.all(
    ids.map((id) => {
      let p = loading.get(id);
      if (!p) {
        p = loadObject(id).then(
          (o) => (objs.set(id, o), o),
          () => {
            loading.delete(id); // retry next battle (transient network error)
            return null;
          },
        );
        loading.set(id, p);
      }
      return p;
    }),
  );
}
export function obj(id: number): LoadedObject | undefined {
  return objs.get(id);
}

export interface FxOpts {
  /** height above ground (pixels, drawn upward) */
  z?: number;
  vx?: number;
  vy?: number;
  vz?: number;
  /** gravity on z (px/tick²); positive pulls down */
  g?: number;
  /** total life in ticks (default: animation length, or forever for loops → 60) */
  life?: number;
  /** fade out during the last N ticks */
  fade?: number;
  scale?: number;
  /** horizontal mirror */
  flip?: boolean;
  alpha?: number;
  rot?: number;
  vrot?: number;
  /** blend override; default from object flags */
  blend?: 'add' | 'normal' | 'multiply';
  /** layer: 'sort' (y-sorted with units, default), 'under' (ground decals), 'over' (above everything) */
  layer?: 'sort' | 'under' | 'over';
  /** z-sort bias */
  bias?: number;
  tint?: number;
  /** animation speed multiplier */
  speed?: number;
  /** stop when hitting the ground (z<=0) */
  land?: boolean;
  /** grow per tick */
  grow?: number;
}

export class FxItem {
  spr: AnimSprite | null = null;
  plain: Sprite | null = null;
  x = 0; y = 0; z = 0;
  px = 0; py = 0; pz = 0;
  vx = 0; vy = 0; vz = 0; g = 0;
  life = 0; age = 0; fade = 0;
  alpha = 1; rot = 0; vrot = 0; scale = 1; grow = 0;
  land = false;
  bias = 0;
  live = false;
  layer: 'sort' | 'under' | 'over' = 'sort';
  onLand: ((f: FxItem) => void) | null = null;
  onDone: ((f: FxItem) => void) | null = null;
  /** user payload */
  data: unknown = null;
  get view(): Sprite {
    return (this.spr ?? this.plain)!;
  }
}

const EMPTY = Texture.EMPTY;

export class Fx {
  items: FxItem[] = [];
  private free: FxItem[] = [];
  private spritePool: AnimSprite[] = [];
  private plainPool: Sprite[] = [];
  shakeAmt = 0;
  shakeX = 0;
  shakeY = 0;
  private flashG: Graphics;
  /** darkening layer; the scene places it between the backdrop and the units */
  dimG: Graphics;
  private dimA = 0;
  private dimT = 0;
  private flashA = 0;
  private flashDecay = 0.08;
  private nums: { t: BitmapText; x: number; y: number; age: number; live: boolean }[] = [];
  tickCount = 0;

  constructor(
    readonly sortLayer: Container,
    readonly underLayer: Container,
    readonly overLayer: Container,
    readonly screenLayer: Container,
  ) {
    this.flashG = new Graphics().rect(0, 0, 4096, 4096).fill(0xffffff);
    this.flashG.alpha = 0;
    this.flashG.blendMode = 'add';
    this.dimG = new Graphics().rect(-3000, -3000, 9000, 9000).fill(0x000000);
    this.dimG.alpha = 0;
    screenLayer.addChild(this.dimG, this.flashG);
  }

  private alloc(): FxItem {
    const f = this.free.pop() ?? new FxItem();
    f.live = true;
    f.age = 0;
    f.onLand = null;
    f.onDone = null;
    f.data = null;
    this.items.push(f);
    return f;
  }

  private place(f: FxItem, v: Sprite, o: FxOpts) {
    f.x = f.px = 0;
    f.layer = o.layer ?? 'sort';
    (f.layer === 'sort' ? this.sortLayer : f.layer === 'under' ? this.underLayer : this.overLayer).addChild(v);
    f.z = f.pz = o.z ?? 0;
    f.vx = o.vx ?? 0;
    f.vy = o.vy ?? 0;
    f.vz = o.vz ?? 0;
    f.g = o.g ?? 0;
    f.fade = o.fade ?? 0;
    f.alpha = o.alpha ?? 1;
    f.rot = o.rot ?? 0;
    f.vrot = o.vrot ?? 0;
    f.scale = o.scale ?? 1;
    f.grow = o.grow ?? 0;
    f.land = o.land ?? false;
    f.bias = o.bias ?? 0;
    v.alpha = f.alpha;
    v.rotation = f.rot;
    v.tint = o.tint ?? 0xffffff;
    v.visible = true;
  }

  /** Spawns an object animation at world position (x, y). Returns null if the object isn't loaded. */
  anim(id: number, name: string, x: number, y: number, o: FxOpts = {}): FxItem | null {
    const lo = objs.get(id);
    if (!lo) {
      void ensureObjects([id]);
      return null;
    }
    const f = this.alloc();
    const s = this.spritePool.pop() ?? new AnimSprite(lo);
    s.obj = lo;
    s.onEvent = null;
    s.onEnd = null;
    s.speed = o.speed ?? 1;
    s.scale.set(1);
    if (!s.play(name, true) && !s.play('wait', true)) s.texture = EMPTY;
    s.setFacing(o.flip ? -1 : 1);
    const flags = lo.def.flags;
    s.blendMode = o.blend ?? (flags.includes('SP_ATTRIB_WHITELIGHT') ? 'add' : flags.includes('SP_ATTRIB_DARKLIGHT') ? 'multiply' : 'normal');
    f.spr = s;
    f.plain = null;
    this.place(f, s, o);
    f.x = f.px = x;
    f.y = f.py = y;
    const a = s.anim;
    f.life = o.life ?? (a && !a.loop ? Math.max(1, s.duration(s.animName)) : 60);
    this.apply(f, 1);
    return f;
  }

  /** Spawns a plain texture sprite. */
  tex(t: Texture, ax: number, ay: number, x: number, y: number, o: FxOpts = {}): FxItem {
    const f = this.alloc();
    const s = this.plainPool.pop() ?? new Sprite();
    s.texture = t;
    s.anchor.set(ax, ay);
    s.blendMode = o.blend ?? 'normal';
    s.scale.set(o.flip ? -1 : 1, 1);
    f.spr = null;
    f.plain = s;
    this.place(f, s, o);
    f.x = f.px = x;
    f.y = f.py = y;
    f.life = o.life ?? 60;
    this.apply(f, 1);
    return f;
  }

  kill(f: FxItem) {
    if (!f.live) return;
    f.live = false;
    f.onDone?.(f);
    const v = f.view;
    v.removeFromParent();
    v.visible = false;
    if (f.spr) this.spritePool.push(f.spr);
    else if (f.plain) this.plainPool.push(f.plain);
    f.spr = null;
    f.plain = null;
  }

  tick() {
    this.tickCount++;
    const it = this.items;
    let j = 0;
    for (let i = 0; i < it.length; i++) {
      const f = it[i];
      if (!f.live) {
        this.free.push(f);
        continue;
      }
      f.px = f.x;
      f.py = f.y;
      f.pz = f.z;
      f.x += f.vx;
      f.y += f.vy;
      if (f.g || f.vz) {
        f.vz -= f.g;
        f.z += f.vz;
        if (f.z <= 0 && f.vz < 0 && (f.g > 0 || f.land)) {
          f.z = 0;
          if (f.onLand) {
            const cb = f.onLand;
            f.onLand = null;
            cb(f);
          }
          if (f.land) {
            f.vx = f.vy = f.vz = 0;
            f.g = 0;
            f.vrot = 0;
          } else {
            f.vz = -f.vz * 0.35;
            f.vx *= 0.6;
            f.vy *= 0.6;
            if (Math.abs(f.vz) < 1) {
              f.vz = 0;
              f.g = 0;
            }
          }
        }
      }
      f.rot += f.vrot;
      f.scale += f.grow;
      f.spr?.tick();
      f.age++;
      if (f.age >= f.life) {
        this.kill(f);
        this.free.push(f);
        continue;
      }
      it[j++] = f;
    }
    it.length = j;
    if (this.dimT > 0) this.dimT--;
    if (this.shakeAmt > 0.2) this.shakeAmt *= 0.86;
    else this.shakeAmt = 0;
    for (const n of this.nums) {
      if (!n.live) continue;
      n.age++;
      if (n.age > 40) {
        n.live = false;
        n.t.visible = false;
      }
    }
  }

  private apply(f: FxItem, a: number) {
    const v = f.view;
    const x = f.px + (f.x - f.px) * a;
    const y = f.py + (f.y - f.py) * a;
    const z = f.pz + (f.z - f.pz) * a;
    v.position.set(x, y - z);
    const sx = v.scale.x < 0 ? -f.scale : f.scale;
    v.scale.set(sx, f.scale);
    v.rotation = f.rot;
    let al = f.alpha;
    if (f.fade > 0) {
      const left = f.life - f.age;
      if (left < f.fade) al *= Math.max(0, left / f.fade);
    }
    v.alpha = al;
    if (f.layer === 'sort') v.zIndex = y + f.bias;
  }

  frame(a: number, dt: number) {
    for (const f of this.items) if (f.live) this.apply(f, a);
    for (const n of this.nums) {
      if (!n.live) continue;
      const k = (n.age + a) / 40;
      n.t.position.set(n.x, n.y - 30 * Math.sqrt(k) - 10);
      n.t.alpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
      const s = k < 0.12 ? 0.6 + k * 6 : 1.3 - Math.min(0.3, k);
      n.t.scale.set(s);
    }
    if (this.shakeAmt > 0) {
      this.shakeX = (rng.next() - 0.5) * 2 * this.shakeAmt;
      this.shakeY = (rng.next() - 0.5) * 2 * this.shakeAmt * 0.6;
    } else this.shakeX = this.shakeY = 0;
    if (this.flashA > 0) {
      this.flashA = Math.max(0, this.flashA - this.flashDecay * dt * 30);
    }
    this.flashG.alpha = this.flashA;
    const dimTarget = this.dimT > 0 ? this.dimA : 0;
    this.dimG.alpha += (dimTarget - this.dimG.alpha) * Math.min(1, dt * 6);
  }

  /** darken the screen (skill casting) for `ticks` */
  dim(alpha: number, ticks: number) {
    this.dimA = alpha;
    this.dimT = Math.max(this.dimT, ticks);
  }

  shake(amount: number) {
    this.shakeAmt = Math.max(this.shakeAmt, amount);
  }

  flash(color: number, alpha = 0.6, decay = 0.08) {
    this.flashG.tint = color;
    this.flashA = Math.max(this.flashA, alpha);
    this.flashDecay = decay;
  }

  /** Floating number (damage/heal) at world position. */
  number(x: number, y: number, text: string, color: number, big = false) {
    let n = this.nums.find((m) => !m.live);
    if (!n) {
      if (this.nums.length >= 40) n = this.nums.reduce((a, b) => (a.age > b.age ? a : b));
      else {
        const t = new BitmapText({
          text: '0',
          style: { fontFamily: 'Arial Black, Arial, sans-serif', fontSize: 26, fill: 0xffffff, fontWeight: 'bold', stroke: { color: 0x000000, width: 4 } },
        });
        t.anchor.set(0.5, 1);
        this.overLayer.addChild(t);
        n = { t, x: 0, y: 0, age: 0, live: false };
        this.nums.push(n);
      }
    }
    n.live = true;
    n.age = 0;
    n.x = x + (rng.next() - 0.5) * 16;
    n.y = y;
    n.t.text = text;
    n.t.tint = color;
    n.t.visible = true;
    n.t.style.fontSize = big ? 34 : 24;
  }

  clear() {
    for (const f of this.items) this.kill(f);
    this.items.length = 0;
  }
}

/** Arrow textures by direction (BF/FlyWeapon/B1, 32 directions CCW from →). */
export function arrowFrame(lo: LoadedObject | undefined, vx: number, vy: number) {
  if (!lo) return undefined;
  const a = Math.atan2(-vy, vx);
  let i = Math.round((a / (Math.PI * 2)) * 32);
  i = ((i % 32) + 32) % 32;
  return lo.dir.frame('b1' + String(i + 1).padStart(4, '0'));
}

export function hasObject(id: number) {
  return !!db.objects[String(id)];
}
