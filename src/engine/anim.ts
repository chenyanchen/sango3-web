// Data-driven sprite animation, playing object definitions from Things.obd
// (public/assets/data/objects.json). Animations advance in fixed simulation
// ticks (TICK_HZ); delays in the data are expressed in those ticks.
import { Sprite } from 'pixi.js';
import { db, type AnimDef, type ObjectDef } from '../data/db';
import { shapes, type ShapeDir } from './assets';

/** Original game logic rate. All `#n` delays in Things.obd are in these ticks. */
export const TICK_HZ = 30;

export interface LoadedObject {
  id: string;
  def: ObjectDef;
  dir: ShapeDir;
}

const objCache = new Map<string, Promise<LoadedObject>>();

/** Loads an object (by Things.obd sequence id) and its atlas. */
export function loadObject(id: number | string): Promise<LoadedObject> {
  const key = String(id);
  let p = objCache.get(key);
  if (!p) {
    p = (async () => {
      const def = db.objects[key];
      if (!def) throw new Error(`object ${key} not defined`);
      return { id: key, def, dir: await shapes(def.dir) };
    })();
    objCache.set(key, p);
  }
  return p;
}

export class AnimSprite extends Sprite {
  obj: LoadedObject;
  anim: AnimDef | null = null;
  animName = '';
  index = 0;
  private wait = 0;
  done = false;
  /** speed multiplier (1 = original speed) */
  speed = 1;
  private acc = 0;
  /** called when a frame tagged with an event (e.g. "attack") is shown */
  onEvent: ((ev: string, s: AnimSprite) => void) | null = null;
  /** called when a one-shot animation ends */
  onEnd: ((name: string, s: AnimSprite) => void) | null = null;
  private facing = 1;

  constructor(obj: LoadedObject, anim?: string) {
    super();
    this.obj = obj;
    if (anim) this.play(anim);
  }

  has(name: string) {
    return !!this.obj.def.sprites[name.toLowerCase()];
  }

  /** Starts an animation. Unknown names are ignored (returns false). */
  play(name: string, restart = false): boolean {
    name = name.toLowerCase();
    if (!restart && name === this.animName && !this.done) return true;
    const a = this.obj.def.sprites[name];
    if (!a || !a.frames.length) return false;
    this.anim = a;
    this.animName = name;
    this.index = 0;
    this.wait = a.frames[0].d;
    this.done = false;
    this.acc = 0;
    this.applyFrame();
    return true;
  }

  /** Total duration of an animation in ticks. */
  duration(name: string) {
    const a = this.obj.def.sprites[name.toLowerCase()];
    return a ? a.frames.reduce((s, f) => s + Math.min(f.d, 1000), 0) : 0;
  }

  /** Sets horizontal facing: 1 = original orientation, -1 = mirrored. */
  setFacing(dir: 1 | -1) {
    this.facing = dir;
    this.scale.x = Math.abs(this.scale.x) * dir;
  }
  get facingDir() {
    return this.facing;
  }

  /** Advance by one simulation tick. */
  tick() {
    if (!this.anim || this.done) return;
    this.acc += this.speed;
    while (this.acc >= 1) {
      this.acc -= 1;
      if (--this.wait > 0) continue;
      const fs = this.anim.frames;
      if (this.index + 1 >= fs.length) {
        if (this.anim.loop) {
          this.index = 0;
        } else {
          this.done = true;
          this.wait = 0;
          this.onEnd?.(this.animName, this);
          return;
        }
      } else this.index++;
      this.wait = fs[this.index].d;
      this.applyFrame();
    }
  }

  private applyFrame() {
    const fr = this.anim!.frames[this.index];
    const f = this.obj.dir.frame(fr.f);
    if (f) {
      this.texture = f.tex;
      this.anchor.set(f.ax / f.w, f.ay / f.h);
    }
    if (fr.ev) this.onEvent?.(fr.ev, this);
  }
}
