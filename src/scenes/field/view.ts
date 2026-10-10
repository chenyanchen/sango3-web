// Pixi rendering of the 野战 map and units.
import { Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import { db, type AnimDef } from '../../data/db';
import { shapes, type ShapeDir } from '../../engine/assets';
import { Terrain } from '../../game/contracts';
import { maxSoldiers } from '../../game/state';
import { HALF_H, type FieldMap } from './map';
import { g, type Unit, type War } from './war';

export interface Atlases {
  map: ShapeDir;
  group: ShapeDir;
  ship: ShapeDir;
  camp: ShapeDir;
  magic: ShapeDir;
}

export async function loadAtlases(): Promise<Atlases> {
  const [map, group, ship, camp, magic] = await Promise.all(
    ['sf/map', 'sf/groupicon', 'sf/ship', 'sf/camp', 'sf/magic'].map((d) => shapes(d)),
  );
  return { map, group, ship, camp, magic };
}

export type Mask = 'movable' | 'fightable' | 'castable' | 'active';

/** Static map: ground layer + tall tiles (sorted together with units). */
export class MapView {
  readonly ground = new Container();
  readonly masks = new Container();
  readonly objects = new Container();
  private gateSprites = new Map<number, Sprite>();
  private maskPool: Sprite[] = [];

  constructor(
    readonly map: FieldMap,
    private at: Atlases,
  ) {
    this.objects.sortableChildren = true;
    const m = map;
    for (let i = 0; i < m.tiles.length; i++) {
      const t = m.tiles[i];
      if (!t.terrain) continue;
      const f = at.map.frame(t.gfx) ?? at.map.frame('plane001');
      if (!f) continue;
      const s = new Sprite(f.tex);
      s.position.set(m.sx(i) - f.ax, m.sy(i) - f.ay);
      const tall = f.h > 37 || t.terrain === Terrain.Wall || t.terrain === Terrain.Gate || t.terrain === Terrain.Castle;
      if (tall) {
        // keep a flat base under tall tiles so gaps never show
        const base = at.map.frame(baseFor(t.terrain));
        if (base) {
          const b = new Sprite(base.tex);
          b.position.set(m.sx(i) - base.ax, m.sy(i) - base.ay);
          this.ground.addChild(b);
        }
        s.zIndex = m.sy(i) * 10 + 4;
        this.objects.addChild(s);
        if (t.terrain === Terrain.Gate) this.gateSprites.set(i, s);
      } else this.ground.addChild(s);
    }
  }

  setGateBroken(i: number, broken: boolean) {
    const s = this.gateSprites.get(i);
    if (s) s.tint = broken ? 0x8a7f74 : 0xffffff;
  }

  showMasks(tiles: Iterable<number>, kind: Mask, alpha = 0.55) {
    const f = this.at.map.frame(kind + 'mask');
    if (!f) return;
    for (const i of tiles) {
      let s = this.maskPool.pop();
      if (!s) s = new Sprite();
      s.texture = f.tex;
      s.alpha = alpha;
      s.position.set(this.map.sx(i) - f.ax, this.map.sy(i) - f.ay);
      this.masks.addChild(s);
    }
  }
  clearMasks() {
    for (const c of [...this.masks.children]) {
      this.masks.removeChild(c);
      this.maskPool.push(c as Sprite);
    }
  }
}

function baseFor(t: number) {
  if (t === Terrain.Snow || t === Terrain.SnowMountain) return 'ssss0';
  if (t === Terrain.Desert) return 'drt-01';
  if (t === Terrain.Grass || t === Terrain.Forest) return 'gggg0';
  return 'plane001';
}

// ---------------------------------------------------------------- units
const COLOR_OBJ = { blue: 15000, red: 15001, green: 15002, yellow: 15003 } as const;
const SHIP_OBJ = { blue: 15010, red: 15011, green: 15012, yellow: 15013 } as const;
export type UnitColor = keyof typeof COLOR_OBJ;
export const COLOR_HEX: Record<UnitColor, number> = { blue: 0x2f62d6, red: 0xc8302a, green: 0x2f9e44, yellow: 0xd9a21a };

/** maps a screen direction to the GroupIcon direction digit (8=S,1=SW,2=W,3=NW,4=N,5=NE,6=E,7=SE) */
export function dirFromDelta(dx: number, dy: number): number {
  const a = Math.atan2(dy * 2.4, dx);
  const k = (Math.round(a / (Math.PI / 4)) + 8) % 8; // 0=E,1=SE,2=S,...
  return [6, 7, 8, 1, 2, 3, 4, 5][k];
}

/** Plays a GroupIcon/Ship animation whose frame names end in '*' (= direction digit). */
class DirSprite extends Sprite {
  private anim: AnimDef | null = null;
  private idx = 0;
  private wait = 0;
  animName = '';
  constructor(
    private dir: ShapeDir,
    private sprites: Record<string, AnimDef>,
    public facing: number,
    phase: number,
  ) {
    super();
    this.play('wait');
    this.idx = phase % Math.max(1, this.anim?.frames.length ?? 1);
    this.apply();
  }
  play(name: string, restart = false) {
    if (name === this.animName && !restart) return;
    const a = this.sprites[name];
    if (!a) return;
    this.anim = a;
    this.animName = name;
    this.idx = 0;
    this.wait = a.frames[0]?.d ?? 10;
    this.apply();
  }
  setFacing(d: number) {
    if (d !== this.facing) {
      this.facing = d;
      this.apply();
    }
  }
  tick() {
    const a = this.anim;
    if (!a) return;
    if (--this.wait > 0) return;
    if (this.idx + 1 >= a.frames.length) {
      if (a.loop) this.idx = 0;
      else return;
    } else this.idx++;
    this.wait = Math.min(a.frames[this.idx].d, 60);
    this.apply();
  }
  private apply() {
    const fr = this.anim?.frames[this.idx];
    if (!fr) return;
    const f = this.dir.frame(fr.f.replace(/\d\*$/, String(this.facing)));
    if (f) {
      this.texture = f.tex;
      this.anchor.set(f.ax / f.w, f.ay / f.h);
    }
  }
}

const FIG_OFFS: [number, number][] = [
  [0, 6],
  [-17, 0],
  [17, 0],
  [0, -6],
];

const FX_ICON: Record<number, string> = { 5: 'sfmagic005', 6: 'sfmagic006', 7: 'sfmagic007', 8: 'sfmagic008', 9: 'sfmagic009', 10: 'sfmagic010', 13: 'sfmagic013', 16: 'sfmagic016', 18: 'sfmagic018', 19: 'sfmagic019', 20: 'sfmagic020', 23: 'sfmagic023' };

export class UnitView extends Container {
  private figs: DirSprite[] = [];
  private ships: DirSprite[] = [];
  private bars = new Graphics();
  private flag = new Container();
  private nameText: Text;
  private fxIcons = new Container();
  private selRing = new Graphics();
  /** flag, bars and status icons: drawn in a layer above all map objects */
  readonly hud = new Container();
  facing = 8;
  onWater = false;
  private shown = '';
  /** world position (tile centre), animated */
  wx = 0;
  wy = 0;

  constructor(
    readonly unit: Unit,
    readonly color: UnitColor,
    private at: Atlases,
  ) {
    super();
    const def = db.objects[String(COLOR_OBJ[color])];
    const ship = db.objects[String(SHIP_OBJ[color])];
    this.facing = unit.side === 0 ? 5 : 1;
    for (let k = 0; k < 4; k++) {
      const s = new DirSprite(at.group, def.sprites, this.facing, k * 2 + unit.gid);
      s.position.set(FIG_OFFS[k][0], FIG_OFFS[k][1]);
      this.figs.push(s);
    }
    const sh = at.group.frame('shadow');
    for (let k = 0; k < 4; k++) {
      if (!sh) break;
      const shadow = new Sprite(sh.tex);
      shadow.anchor.set(0.5);
      shadow.alpha = 0.45;
      shadow.position.set(FIG_OFFS[k][0], FIG_OFFS[k][1]);
      shadow.label = 'shadow';
      this.addChild(shadow);
    }
    this.selRing.visible = false;
    this.addChildAt(this.selRing, 0);
    // draw back-to-front
    for (const k of [3, 1, 2, 0]) this.addChild(this.figs[k]);
    for (let k = 0; k < 2; k++) {
      const s = new DirSprite(at.ship, ship.sprites, this.facing, k);
      s.position.set(k ? 12 : -12, k ? 2 : -2);
      s.visible = false;
      s.scale.set(1.5);
      this.ships.push(s);
      this.addChild(s);
    }
    // banner
    const col = COLOR_HEX[color];
    const pole = new Graphics().rect(-1, -50, 2, 40).fill(0x3a2a18);
    const cloth = new Graphics().rect(1, -50, 17, 19).fill(col).rect(1, -50, 17, 19).stroke({ color: 0xf3e6c4, width: 1, alpha: 0.8 });
    const nm = db.generals[unit.gid - 1]?.name ?? '';
    const ch = new Text({ text: nm.slice(0, 1), style: { fontFamily: 'STKaiti, KaiTi, serif', fontSize: 14, fill: 0xffffff, fontWeight: 'bold' }, resolution: 3 });
    ch.anchor.set(0.5);
    ch.position.set(9.5, -40.5);
    this.flag.addChild(pole, cloth, ch);
    this.flag.position.set(-22, 4);
    this.hud.addChild(this.flag);
    this.nameText = new Text({
      text: nm,
      style: { fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif', fontSize: 11, fill: 0xffffff, stroke: { color: 0x000000, width: 3 } },
      resolution: 3,
    });
    this.nameText.anchor.set(0.5, 0);
    this.nameText.position.set(0, 18);
    this.nameText.visible = false;
    this.hud.addChild(this.nameText, this.bars, this.fxIcons);
    this.bars.position.set(-16, 11);
    this.fxIcons.position.set(10, -48);
    this.refresh();
  }

  place(x: number, y: number) {
    this.wx = x;
    this.wy = y;
    this.position.set(x, y);
    this.hud.position.set(x, y);
    this.zIndex = Math.round(y * 10 + 5);
  }

  setWater(on: boolean) {
    this.onWater = on;
    this.figs.forEach((f) => (f.visible = !on));
    this.ships.forEach((s) => (s.visible = on));
    for (const c of this.children) if (c.label === 'shadow') c.visible = !on;
    this.refresh();
  }

  setFacing(d: number) {
    this.facing = d;
    for (const f of [...this.figs, ...this.ships]) f.setFacing(d);
  }

  play(name: 'wait' | 'run' | 'active' | 'fight' | 'cast' | 'win' | 'lose') {
    for (const f of [...this.figs, ...this.ships]) f.play(name, name !== 'wait' && name !== 'run' && name !== 'active');
  }

  showName(on: boolean) {
    this.nameText.visible = on;
  }

  setVisible(on: boolean, alpha = 1) {
    this.visible = on;
    this.hud.visible = on;
    this.alpha = alpha;
    this.hud.alpha = alpha;
  }

  setSelected(on: boolean) {
    this.selRing.visible = on;
    this.nameText.visible = on;
    if (on) {
      this.selRing.clear().ellipse(0, 2, 34, 13).stroke({ color: 0xf6d98a, width: 2, alpha: 0.95 }).ellipse(0, 2, 34, 13).fill({ color: 0xf6d98a, alpha: 0.15 });
    }
  }

  tick() {
    for (const f of this.figs) if (f.visible) f.tick();
    for (const s of this.ships) if (s.visible) s.tick();
  }

  /** updates bars/figures/status icons from game state */
  refresh() {
    const gs = g(this.unit);
    const n = Math.max(1, Math.min(4, Math.ceil(gs.soldiers / Math.max(1, maxSoldiers(gs)) * 4)));
    if (!this.onWater) this.figs.forEach((f, k) => (f.visible = k < n || (k === 0)));
    if (!this.onWater) this.children.filter((c) => c.label === 'shadow').forEach((c, k) => (c.visible = k < n));
    const hpk = gs.maxHp ? gs.hp / gs.maxHp : 0;
    const solk = gs.soldiers / Math.max(1, maxSoldiers(gs));
    const key = `${hpk.toFixed(2)}|${solk.toFixed(2)}|${Object.keys(this.unit.fx).join(',')}|${this.unit.acted}`;
    if (key === this.shown) return;
    this.shown = key;
    this.bars.clear();
    this.bars.rect(-1, -1, 34, 8).fill({ color: 0x000000, alpha: 0.65 });
    this.bars.rect(0, 0, 32 * Math.min(1, hpk), 3).fill(0xe0544a);
    this.bars.rect(0, 4, 32 * Math.min(1, solk), 2).fill(0xe8c45a);
    this.fxIcons.removeChildren();
    let x = 0;
    for (const id of Object.keys(this.unit.fx)) {
      const f = this.at.magic.frame(FX_ICON[+id] ?? '');
      if (!f) continue;
      const s = new Sprite(f.tex);
      s.scale.set(0.6);
      s.position.set(x, 0);
      x += f.w * 0.6 + 1;
      this.fxIcons.addChild(s);
    }
    this.alpha = 1;
    for (const f of [...this.figs, ...this.ships]) f.tint = this.unit.acted ? 0x9a9a9a : 0xffffff;
  }
}

/** an animated camp (营寨) */
export class CampView extends Container {
  private t = 0;
  private frames: Texture[] = [];
  private s = new Sprite();
  constructor(at: Atlases, blue: boolean) {
    super();
    for (let k = 1; k <= 4; k++) {
      const f = at.camp.frame(`icon${blue ? 'b' : 'r'}000${k}`);
      if (f) {
        this.frames.push(f.tex);
        this.s.anchor.set(f.ax / f.w, f.ay / f.h);
      }
    }
    this.s.texture = this.frames[0] ?? Texture.EMPTY;
    this.addChild(this.s);
  }
  tick() {
    this.t++;
    if (this.frames.length) this.s.texture = this.frames[Math.floor(this.t / 12) % this.frames.length];
  }
}

/** floating text (damage / messages) */
export class FloatText extends Text {
  life = 50;
  constructor(text: string, color: number) {
    super({ text, style: { fontFamily: 'STKaiti, KaiTi, serif', fontSize: 18, fill: color, fontWeight: 'bold', stroke: { color: 0x000000, width: 4 } }, resolution: 2 });
    this.anchor.set(0.5, 1);
  }
  tick() {
    this.life--;
    this.y -= 0.7;
    this.alpha = Math.min(1, this.life / 15);
    return this.life > 0;
  }
}

export function unitColor(war: War, u: Unit): UnitColor {
  const ps = war.playerSide ?? 0;
  if (u.side === ps) return u.ally ? 'green' : 'blue';
  return u.ally ? 'yellow' : 'red';
}

export const TILE_TOP = HALF_H;
