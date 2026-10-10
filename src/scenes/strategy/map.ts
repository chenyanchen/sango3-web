// Pixi China map for the strategy scene: camera (drag/pinch/wheel), city
// markers, nation flags, selection and target-pick highlighting.
import 'pixi.js/graphics';
import 'pixi.js/text';
import { Container, Graphics, Sprite, Text, type Texture } from 'pixi.js';
import { db } from '../../data/db';
import { shapes, type ShapeDir } from '../../engine/assets';
import { AnimSprite, loadObject } from '../../engine/anim';
import { core } from '../../engine/core';
import { G, nation } from '../../game/state';

export const MAP_W = 1024;
export const MAP_H = 768;

export type MarkKind = 'move' | 'ft' | 'relief' | 'active';

interface CityGfx {
  id: number;
  base: Container;
  halo: Graphics;
  flag: AnimSprite | null;
  flagFallback: Container | null;
  flagKey: string;
  mark: Sprite;
}

/** Surname shown on the fallback banner (compound surnames keep 2 chars). */
const COMPOUND = ['公孙', '司马', '诸葛', '夏侯', '太史', '皇甫', '欧阳', '令狐', '尉迟', '淳于', '东方', '司徒', '上官', '宇文', '轲比'];
export function surname(name: string) {
  return COMPOUND.find((c) => name.startsWith(c)) ?? name.slice(0, 1);
}

export class MapView {
  readonly world = new Container();
  private cityLayer = new Container();
  private flagLayer = new Container();
  private fxLayer = new Container();
  private sel = new Graphics();
  private hover = new Graphics();
  private cities: CityGfx[] = [];
  private cityDir!: ShapeDir;
  private t = 0;
  z = 1;
  private minZ = 1;
  private maxZ = 3;
  private marks = new Map<number, MarkKind>();
  selected = 0;
  hovered = 0;
  onSelect: (id: number) => void = () => {};
  onHover: (id: number) => void = () => {};
  /** set while picking a target: clicks on non-targets are ignored */
  pickHandler: ((id: number) => void) | null = null;
  private riders: { s: AnimSprite; x0: number; y0: number; x1: number; y1: number; t: number; dur: number; done: () => void }[] = [];
  private camAnim: { x: number; y: number; z: number } | null = null;
  private dispose: (() => void)[] = [];

  async load() {
    const base = await shapes('ad/base');
    const map = await base.load('map');
    const names = await base.load('citiesname');
    this.cityDir = await shapes('ad/btn/city');
    await shapes('ad/btn/flag').catch(() => null);
    const mapSpr = new Sprite(map!.tex);
    this.world.addChild(mapSpr, this.cityLayer, this.sel, this.hover);
    if (names) {
      const ns = new Sprite(names.tex);
      ns.eventMode = 'none';
      this.world.addChild(ns);
    }
    this.world.addChild(this.flagLayer, this.fxLayer);

    for (const c of db.cities) {
      const base = new Container();
      base.position.set(c.x, c.y);
      const halo = new Graphics();
      base.addChild(halo);
      const mark = new Sprite();
      mark.visible = false;
      base.addChild(mark);
      this.cityLayer.addChild(base);
      this.cities.push({ id: c.id, base, halo, flag: null, flagFallback: null, flagKey: '', mark });
    }
    this.sel.eventMode = 'none';
    this.hover.eventMode = 'none';
    await this.refresh();
    this.bindInput();
    this.layout(core.width, core.height, true);
  }

  destroy() {
    for (const d of this.dispose) d();
    this.dispose = [];
  }

  /** Re-syncs owners/flags with G. */
  async refresh() {
    for (const cg of this.cities) {
      const cs = G.cities[cg.id - 1];
      const n = cs.owner ? nation(cs.owner) : undefined;
      const def = db.cities[cg.id - 1];
      const r = def.isPass ? 7 : def.size === 1 ? 13 : def.size === 2 ? 11 : 9;
      cg.halo.clear();
      if (n) {
        const col = parseInt(n.color.slice(1), 16);
        cg.halo.ellipse(0, 3, r + 4, (r + 4) * 0.6).fill({ color: col, alpha: 0.45 }).stroke({ color: col, width: 2, alpha: 0.95 });
      }
      const key = n ? `${n.id}:${n.flag}:${n.name}` : '';
      if (key === cg.flagKey) continue;
      cg.flagKey = key;
      cg.flag?.destroy();
      cg.flag = null;
      cg.flagFallback?.destroy({ children: true });
      cg.flagFallback = null;
      if (!n) continue;
      const fx = def.x + (def.isPass ? 5 : 9);
      const fy = def.y + (def.isPass ? -2 : 0);
      const obj = await loadObject(5000 + n.flag).catch(() => null);
      if (obj && obj.dir.frame(`flag${String(n.flag).padStart(2, '0')}0001`)) {
        const s = new AnimSprite(obj, 'wait');
        s.scale.set(def.isPass ? 0.8 : 0.95);
        s.position.set(fx, fy);
        // desync the waving a little
        for (let i = 0; i < cg.id % 5; i++) for (let k = 0; k < 6; k++) s.tick();
        this.flagLayer.addChild(s);
        cg.flag = s;
      } else {
        const f = vectorFlag(n.color, surname(n.name));
        f.position.set(fx, fy);
        f.scale.set(def.isPass ? 0.8 : 0.95);
        this.flagLayer.addChild(f);
        cg.flagFallback = f;
      }
    }
    this.drawSel();
  }

  setMarks(m: Map<number, MarkKind>) {
    this.marks = m;
    for (const cg of this.cities) {
      const k = m.get(cg.id);
      cg.mark.visible = !!k;
    }
  }

  select(id: number) {
    this.selected = id;
    this.drawSel();
  }

  private drawSel() {
    this.sel.clear();
    const c = db.cities[this.selected - 1];
    if (!c) return;
    const r = c.isPass ? 11 : 17;
    this.sel.position.set(c.x, c.y + 2);
    this.sel.ellipse(0, 0, r + 3, (r + 3) * 0.62).stroke({ color: 0xfff1a8, width: 2.5, alpha: 1 });
    this.sel.ellipse(0, 0, r + 7, (r + 7) * 0.62).stroke({ color: 0xffd34a, width: 1.5, alpha: 0.6 });
  }

  private drawHover() {
    this.hover.clear();
    const c = db.cities[this.hovered - 1];
    if (!c || this.hovered === this.selected) return;
    const r = c.isPass ? 11 : 17;
    this.hover.position.set(c.x, c.y + 2);
    this.hover.ellipse(0, 0, r + 3, (r + 3) * 0.62).stroke({ color: 0xffffff, width: 1.5, alpha: 0.7 });
  }

  tick() {
    for (const cg of this.cities) cg.flag?.tick();
    for (const r of this.riders) r.s.tick();
  }

  frame(dt: number) {
    this.t += dt;
    const fi = (Math.floor(this.t * 7) % 3) + 1;
    for (const cg of this.cities) {
      const k = this.marks.get(cg.id) ?? (cg.id === this.selected ? 'active' : undefined);
      if (!k) {
        cg.mark.visible = false;
        continue;
      }
      const def = db.cities[cg.id - 1];
      const f = this.cityDir.frame(`city0${def.size || 3}_${k === 'ft' ? 'ft' : k === 'move' ? 'movable' : k}0${fi}`);
      if (f) {
        cg.mark.texture = f.tex as Texture;
        cg.mark.anchor.set(0.5, 0.5);
        cg.mark.visible = true;
        cg.mark.position.set(0, 0);
      }
    }
    const pulse = 0.75 + Math.sin(this.t * 5) * 0.25;
    this.sel.alpha = pulse;
    // riders
    for (const r of [...this.riders]) {
      r.t += dt;
      const k = Math.min(1, r.t / r.dur);
      r.s.position.set(r.x0 + (r.x1 - r.x0) * k, r.y0 + (r.y1 - r.y0) * k);
      if (k >= 1) {
        this.riders.splice(this.riders.indexOf(r), 1);
        r.s.destroy();
        r.done();
      }
    }
    if (this.camAnim) {
      const a = this.camAnim;
      const k = Math.min(1, dt * 8);
      this.z += (a.z - this.z) * k;
      this.world.scale.set(this.z);
      this.world.x += (a.x - this.world.x) * k;
      this.world.y += (a.y - this.world.y) * k;
      if (Math.abs(a.x - this.world.x) < 0.5 && Math.abs(a.y - this.world.y) < 0.5 && Math.abs(a.z - this.z) < 0.001) this.camAnim = null;
    }
  }

  /** Animated rider travelling between two cities. */
  async ride(from: number, to: number, fight = false) {
    const a = db.cities[from - 1];
    const b = db.cities[to - 1];
    const obj = await loadObject(5100).catch(() => null);
    if (!obj || !a || !b) return;
    const s = new AnimSprite(obj, 'run');
    s.scale.set(0.9);
    s.setFacing(b.x < a.x ? -1 : 1);
    this.fxLayer.addChild(s);
    await new Promise<void>((done) => this.riders.push({ s, x0: a.x, y0: a.y - 4, x1: b.x, y1: b.y - 4, t: 0, dur: 0.9, done }));
    if (fight) {
      const f = new AnimSprite(obj, 'fight');
      f.position.set(b.x, b.y - 4);
      f.setFacing(b.x < a.x ? -1 : 1);
      this.fxLayer.addChild(f);
      await new Promise<void>((done) => this.riders.push({ s: f, x0: b.x, y0: b.y - 4, x1: b.x, y1: b.y - 4, t: 0, dur: 0.8, done }));
    }
  }

  // ---------------------------------------------------------------- camera
  layout(w: number, h: number, reset = false) {
    this.minZ = Math.max(w / MAP_W, h / MAP_H);
    this.maxZ = Math.max(this.minZ * 3, 2.4);
    if (reset || this.z < this.minZ) {
      this.z = Math.max(this.minZ, Math.min(this.maxZ, reset ? this.minZ * 1.25 : this.z));
    }
    this.world.scale.set(this.z);
    this.clampCam();
  }

  private clampCam() {
    const w = core.width;
    const h = core.height;
    const mw = MAP_W * this.z;
    const mh = MAP_H * this.z;
    this.world.x = mw <= w ? (w - mw) / 2 : Math.min(0, Math.max(w - mw, this.world.x));
    this.world.y = mh <= h ? (h - mh) / 2 : Math.min(0, Math.max(h - mh, this.world.y));
  }

  centerOn(cityId: number, animate = true, zoom?: number) {
    const c = db.cities[cityId - 1];
    if (!c) return;
    const z = Math.max(this.minZ, Math.min(this.maxZ, zoom ?? this.z));
    let x = core.width / 2 - c.x * z;
    let y = core.height / 2 - c.y * z;
    const mw = MAP_W * z;
    const mh = MAP_H * z;
    x = mw <= core.width ? (core.width - mw) / 2 : Math.min(0, Math.max(core.width - mw, x));
    y = mh <= core.height ? (core.height - mh) / 2 : Math.min(0, Math.max(core.height - mh, y));
    if (animate) this.camAnim = { x, y, z };
    else {
      this.z = z;
      this.world.scale.set(z);
      this.world.position.set(x, y);
    }
  }

  zoomAt(sx: number, sy: number, f: number) {
    this.camAnim = null;
    const nz = Math.max(this.minZ, Math.min(this.maxZ, this.z * f));
    const mx = (sx - this.world.x) / this.z;
    const my = (sy - this.world.y) / this.z;
    this.z = nz;
    this.world.scale.set(nz);
    this.world.x = sx - mx * nz;
    this.world.y = sy - my * nz;
    this.clampCam();
  }

  pan(dx: number, dy: number) {
    this.camAnim = null;
    this.world.x += dx;
    this.world.y += dy;
    this.clampCam();
  }

  cityAt(sx: number, sy: number): number {
    const mx = (sx - this.world.x) / this.z;
    const my = (sy - this.world.y) / this.z;
    const rad = Math.max(16, 24 / this.z);
    let best = 0;
    let bd = rad * rad;
    for (const c of db.cities) {
      const d = (c.x - mx) ** 2 + ((c.y - my) * 1.2) ** 2;
      if (d < bd) {
        bd = d;
        best = c.id;
      }
    }
    return best;
  }

  /** screen position of a city (for DOM tooltips) */
  screenPos(cityId: number) {
    const c = db.cities[cityId - 1];
    return { x: this.world.x + c.x * this.z, y: this.world.y + c.y * this.z };
  }

  private bindInput() {
    const el = core.app.canvas as HTMLCanvasElement;
    const pts = new Map<number, { x: number; y: number }>();
    let downAt: { x: number; y: number } | null = null;
    let moved = false;
    let pinch0 = 0;
    const down = (e: PointerEvent) => {
      if (!this.world.visible || !this.world.parent?.visible) return;
      el.setPointerCapture?.(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 1) {
        downAt = { x: e.clientX, y: e.clientY };
        moved = false;
      } else if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        pinch0 = Math.hypot(a.x - b.x, a.y - b.y);
        moved = true;
      }
    };
    const move = (e: PointerEvent) => {
      if (!this.world.parent?.visible) return;
      const p = pts.get(e.pointerId);
      if (!p) {
        if (e.pointerType === 'mouse') {
          const h = this.cityAt(e.clientX, e.clientY);
          if (h !== this.hovered) {
            this.hovered = h;
            this.drawHover();
            el.style.cursor = h ? 'pointer' : 'grab';
            this.onHover(h);
          }
        }
        return;
      }
      if (pts.size === 2) {
        const before = [...pts.values()];
        const cx0 = (before[0].x + before[1].x) / 2;
        const cy0 = (before[0].y + before[1].y) / 2;
        pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const cx = (a.x + b.x) / 2;
        const cy = (a.y + b.y) / 2;
        if (pinch0 > 0) this.zoomAt(cx, cy, d / pinch0);
        pinch0 = d;
        this.pan(cx - cx0, cy - cy0);
        return;
      }
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 7) moved = true;
      if (moved) {
        this.pan(dx, dy);
        el.style.cursor = 'grabbing';
      }
    };
    const up = (e: PointerEvent) => {
      const had = pts.delete(e.pointerId);
      if (!had) return;
      if (pts.size === 0) {
        el.style.cursor = this.hovered ? 'pointer' : 'grab';
        if (!moved && downAt) {
          const id = this.cityAt(e.clientX, e.clientY);
          if (this.pickHandler) {
            if (id) this.pickHandler(id);
          } else if (id) this.onSelect(id);
        }
        downAt = null;
      }
      if (pts.size < 2) pinch0 = 0;
    };
    const wheel = (e: WheelEvent) => {
      if (!this.world.parent?.visible) return;
      e.preventDefault();
      this.zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)));
    };
    el.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    el.addEventListener('wheel', wheel, { passive: false });
    el.style.cursor = 'grab';
    this.dispose.push(() => {
      el.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      el.removeEventListener('wheel', wheel);
      el.style.cursor = '';
    });
  }
}

/** Vector banner (fallback when a flag sprite is missing). */
function vectorFlag(color: string, ch: string): Container {
  const c = new Container();
  const col = parseInt(color.slice(1), 16);
  const g = new Graphics();
  g.rect(0, -28, 1.6, 28).fill(0x5a3010);
  g.rect(1.6, -27, 18, 14).fill(col).stroke({ color: 0x000000, width: 1, alpha: 0.6 });
  c.addChild(g);
  const t = new Text({ text: ch, style: { fontSize: ch.length > 1 ? 7 : 10, fill: 0xffffff, fontWeight: 'bold', stroke: { color: 0x000000, width: 2 } }, resolution: 4 });
  t.anchor.set(0.5);
  t.position.set(10.6, -20);
  c.addChild(t);
  return c;
}
