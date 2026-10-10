// 百人战 simulation: units, formations, orders, targeting and combat.
// Runs in fixed logic ticks (Scene.tick); rendering interpolates between
// the previous and the current tick positions.
import { Container, Graphics, Sprite, Text } from 'pixi.js';
import { db } from '../../data/db';
import { AnimSprite, type LoadedObject } from '../../engine/anim';
import { sfx } from '../../engine/audio';
import { rng } from '../../engine/rng';
import type { BattleSetup } from '../../game/contracts';
import { ensureObjects, Fx, obj, arrowFrame } from './fx';
import {
  genVsGenDamage, genVsSoldierDamage, hitChance, horseObject, horseSpeed, MOUNTED_ADV, MOUNTED_TYPES, RANGED_TYPES,
  sideInfo, solVsGenDamage, solVsSolDamage, TICKS_PER_SEC, TIME_LIMIT, VS_GENERAL, type SideInfo,
} from './rules';

// ------------------------------------------------------------------ geometry
export const W = 2400;
export const VIEW_H = 700;
export const HORIZON = 122;
export const FIELD_TOP = 175;
export const FIELD_BOT = 590;
export const FIELD_MID = (FIELD_TOP + FIELD_BOT) / 2;
const UX = 12;
const UY = 12.8;
const BASE = 340;

export function formationToWorld(side: 0 | 1, gx: number, gy: number) {
  const x = BASE + gx * UX;
  return { x: side === 0 ? x : W - x, y: FIELD_TOP + 14 + gy * UY };
}

// ------------------------------------------------------------------ constants
export const ORD_ADVANCE = 0;
export const ORD_BACK = 1;
export const ORD_HOLD = 2;
export type Order = 0 | 1 | 2;

const ST_IDLE = 0;
const ST_MOVE = 1;
const ST_ATTACK = 2;
const ST_HURT = 3;
const ST_DEAD = 4;
const ST_GONE = 5;
const ST_DEFEND = 6;
const ST_CAST = 7;

const K_SOL = 0;
const K_GEN = 1;
const K_SUM = 2;

/** Big-group display names by BigGroup index (Rank.ini). */
export const BIG_NAMES = ['前军', '中军', '后军', '右翼', '左翼'];

export const SIDE_TINT = [0x4aa3ff, 0xff4a3a];

// ------------------------------------------------------------------ units
export class Unit {
  idx = 0;
  side: 0 | 1 = 0;
  kind = K_SOL;
  type = 0;
  mounted = false;
  ranged = false;
  female = false;
  x = 0; y = 0; px = 0; py = 0;
  kx = 0; // knockback velocity
  spd = 1.5;
  hp = 1; maxHp = 1; power = 1;
  range = 46;
  group: Group | null = null;
  sdx = 0; sdy = 0;
  state = ST_IDLE;
  target: Unit | null = null;
  cd = 0;
  retarget = 0;
  lock = 0;
  facing: 1 | -1 = 1;
  engaged = 0;
  engagedNext = 0;
  fleeing = false;
  /** left the battlefield alive (retreat / fled) */
  escaped = false;
  deadT = 0;
  life = -1; // summons: remaining ticks
  spr!: AnimSprite;
  view!: Container;
  shadow!: Sprite;
  anims = { wait: 'wait', walk: 'walk', attack: 'attack', attack2: 'attack2', hurt: 'hurt', defend: 'defend', die: ['die', 'die2', 'die3', 'die4'] };
  attackHit = false;
  burn = 0;
  horseId = 0; // riderless horse object (cavalry)
  hlTint = 0;
  /** selection marker above the head (player's selected group) */
  mark: Sprite | null = null;
  shadowTex: import('pixi.js').Texture | null = null;
  shadowAnchor: [number, number] = [0.5, 0.5];
  reach = 0.8; // preferred fraction of range when closing in
  /** ticks until a held pose (point) returns to idle */
  poseT = 0;
  get alive() {
    return this.state !== ST_DEAD && this.state !== ST_GONE;
  }
  get isGeneral() {
    return this.kind === K_GEN;
  }
}

export class General extends Unit {
  info!: SideInfo;
  atk = 50;
  mp = 0;
  maxMp = 0;
  gauge = 0;
  order: Order = ORD_HOLD;
  casting = 0;
  castCb: (() => void) | null = null;
  invuln = 0;
  horse: AnimSprite | null = null;
  light: AnimSprite | null = null;
  foot = 44;
  label!: Text;
  bar!: Graphics;
  fled = false;
  comboLeft = 0;
}

export class Group {
  id = 0;
  side: 0 | 1 = 0;
  big = 0;
  order: Order = ORD_HOLD;
  ax = 0; // hold anchor x
  cy = 0; // center y (formation y + commanded shifts)
  baseX = 0;
  spread = 1;
  members: Unit[] = [];
  alive = 0;
}

export interface SideState {
  info: SideInfo;
  gen: General;
  units: Unit[]; // soldiers (incl. reinforcements)
  groups: Group[];
  kills: number;
  charge: boolean; // 全军突击
  retreat: boolean; // 全军撤退
  initial: number;
  alive: number;
  locked: number;
  human: boolean;
  dir: 1 | -1; // +1 = faces right (left side)
}

// ------------------------------------------------------------------ world
export class World {
  units: Unit[] = [];
  sides: [SideState, SideState];
  fx: Fx;
  tick = 0;
  /** remaining battle time in ticks */
  timeLeft = TIME_LIMIT * TICKS_PER_SEC;
  phase: 'intro' | 'fight' | 'over' = 'intro';
  winner: 'left' | 'right' | 'draw' | null = null;
  endReason = '';
  slowmo = 0;
  /** while a 武将技 plays, the rest of the battle runs at 1/3 speed */
  skillSlow = 0;
  private lastMarchSnd = -99;
  /** running skill effects */
  effects: { tick(): boolean }[] = [];
  /** camera focus request (world x) and remaining ticks */
  focusX = 0;
  focusT = 0;
  camX = 0;
  viewW = 1000;
  tint = 0xffffff;
  /** callbacks to the scene */
  onBanner: ((text: string, kind?: string) => void) | null = null;
  onSkillHook: ((g: General, id: number) => void) | null = null;
  // grid
  private cell = 64;
  private gcols = Math.ceil((W + 400) / 64);
  private grows = Math.ceil(800 / 64);
  private head = new Int32Array(this.gcols * this.grows);
  private next = new Int32Array(4096);
  private qbuf: Unit[] = [];
  private arrows: { s: Sprite; x: number; y: number; z: number; px: number; py: number; pz: number; vx: number; vy: number; vz: number; t: Unit | null; tx: number; ty: number; from: Unit; live: boolean; stuck: number; dmgType: number; power: number; general: boolean; side: 0 | 1 }[] = [];
  arrowObj: LoadedObject | undefined;
  boltObj: LoadedObject | undefined;

  constructor(
    readonly setup: BattleSetup,
    readonly layers: { units: Container; shadows: Container; under: Container; over: Container; screen: Container },
  ) {
    this.fx = new Fx(layers.units, layers.under, layers.over, layers.screen);
    this.sides = [this.makeSide(0), this.makeSide(1)];
  }

  private makeSide(side: 0 | 1): SideState {
    const def = side === 0 ? this.setup.left : this.setup.right;
    const info = sideInfo(side, def);
    return {
      info, gen: null as unknown as General, units: [], groups: [], kills: 0, charge: false, retreat: false,
      initial: Math.max(0, def.soldiers), alive: 0, locked: 0, human: def.human, dir: side === 0 ? 1 : -1,
    };
  }

  /** Objects needed for the battle (soldiers, generals, horses...). */
  static neededObjects(setup: BattleSetup): number[] {
    const ids = [31000, 31001, 31002, 31003, 31004, 31005, 42065, 42016, 42017, 42002, 42001, 42012, 42021, 42033];
    for (const side of [0, 1] as const) {
      const def = side === 0 ? setup.left : setup.right;
      const info = sideInfo(side, def);
      ids.push(soldierObject(def.soldierType, info.advanced, side));
      const h = riderlessHorse(def.soldierType, info.advanced, side);
      if (h) ids.push(h);
      const gd = db.generals[def.general - 1];
      ids.push(30000 + (gd?.bfShape || 1));
      const ho = horseObject(info.gs);
      if (ho) ids.push(ho);
      ids.push(side === 0 ? 30999 : 30997);
    }
    return ids.filter((id) => db.objects[String(id)]);
  }

  // ---------------------------------------------------------------- setup
  build() {
    this.arrowObj = obj(31003);
    this.boltObj = obj(31005);
    for (const side of [0, 1] as const) this.buildSide(side);
  }

  private buildSide(side: 0 | 1) {
    const S = this.sides[side];
    const def = side === 0 ? this.setup.left : this.setup.right;
    const fm = db.formations[def.formation] ?? db.formations[0];
    // groups
    const groupBig = new Array(8).fill(0);
    fm.bigGroups.forEach((list, b) => list.forEach((gi) => (groupBig[gi] = b)));
    for (let gi = 0; gi < 8; gi++) {
      const g = new Group();
      g.id = gi;
      g.side = side;
      g.big = groupBig[gi];
      const p = formationToWorld(side, fm.groupPos[gi][0], fm.groupPos[gi][1]);
      g.ax = g.baseX = p.x;
      g.cy = p.y;
      S.groups.push(g);
    }
    // distribute soldiers (front groups first)
    const n = S.initial;
    const per = Math.floor(n / 8);
    let rem = n - per * 8;
    const order = [...S.groups].sort((a, b) => (side === 0 ? b.ax - a.ax : a.ax - b.ax));
    const counts = new Map<Group, number>();
    for (const g of order) {
      counts.set(g, per + (rem > 0 ? 1 : 0));
      if (rem > 0) rem--;
    }
    const sobj = obj(soldierObject(def.soldierType, S.info.advanced, side))!;
    const horseId = riderlessHorse(def.soldierType, S.info.advanced, side);
    for (const g of S.groups) {
      const k = counts.get(g) ?? 0;
      if (!k) continue;
      const rows = Math.max(1, Math.min(7, Math.round(Math.sqrt(k * 1.1))));
      const cols = Math.ceil(k / rows);
      const colW = Math.min(26, 150 / Math.max(1, cols));
      for (let i = 0; i < k; i++) {
        const r = i % rows;
        const c = Math.floor(i / rows);
        const sdx = -(c - (cols - 1) / 2) * colW * S.dir + (r % 2 ? 6 : -6);
        const sdy = (r - (rows - 1) / 2) * 13;
        const u = this.makeSoldier(side, sobj, def.soldierType);
        u.horseId = horseId;
        u.group = g;
        u.sdx = sdx;
        u.sdy = sdy;
        u.x = u.px = g.ax + sdx + rng.range(-2, 2);
        u.y = u.py = g.cy + sdy + rng.range(-1.5, 1.5);
        g.members.push(u);
        S.units.push(u);
      }
    }
    // general
    const gp = formationToWorld(side, fm.generalPos[0], fm.generalPos[1]);
    S.gen = this.makeGeneral(side, gp.x, gp.y);
    S.alive = S.units.length;
  }

  makeSoldier(side: 0 | 1, lo: LoadedObject, type: number): Unit {
    const S = this.sides[side];
    const u = new Unit();
    u.idx = this.units.length;
    u.side = side;
    u.kind = K_SOL;
    u.type = type;
    u.ranged = RANGED_TYPES.has(type);
    u.mounted = MOUNTED_TYPES.has(type) || (S.info.advanced && MOUNTED_ADV.has(type));
    u.female = type === 7;
    u.hp = u.maxHp = S.info.soldierHp;
    u.power = S.info.soldierPower;
    u.spd = u.mounted ? (type === 5 ? 1.5 : type === 4 ? 2.3 : 2.5) : type === 5 ? 1.3 : 1.55;
    u.range = type === 2 ? 56 : u.mounted ? 54 : type === 5 ? 60 : 46;
    if (S.info.advanced && type === 5) u.range = 78;
    u.facing = S.dir;
    u.reach = rng.range(0.55, 0.92);
    const s = new AnimSprite(lo, 'wait');
    s.index = 0;
    s.onEvent = (ev) => ev === 'attack' && this.resolveAttack(u);
    s.onEnd = () => this.animEnded(u);
    u.spr = s;
    u.view = s;
    faceSprite(s, u.facing);
    // random phase so idle loops don't sync
    for (let i = rng.int(0, 40); i > 0; i--) s.tick();
    u.shadow = this.makeShadow(u.mounted ? 'horse' : 'soldier', u.mounted ? 0.62 : 1);
    u.shadowAnchor = (u.shadow as Sprite & { _a?: [number, number] })._a ?? [0.5, 0.5];
    this.layers.units.addChild(s);
    this.units.push(u);
    s.tint = this.tint;
    return u;
  }

  private makeShadow(name: string, scale: number) {
    const sh = obj(31000);
    const f = sh?.dir.frame(name);
    const s = new Sprite(f?.tex);
    if (f) s.anchor.set(f.ax / f.w, f.ay / f.h);
    s.scale.set(scale);
    (s as Sprite & { _a?: [number, number] })._a = f ? [f.ax / f.w, f.ay / f.h] : [0.5, 0.5];
    s.alpha = 0.45;
    this.layers.shadows.addChild(s);
    return s;
  }

  private makeGeneral(side: 0 | 1, x: number, y: number): General {
    const S = this.sides[side];
    const info = S.info;
    const gd = db.generals[info.gs.id - 1];
    const g = new General();
    g.idx = this.units.length;
    g.side = side;
    g.kind = K_GEN;
    g.type = VS_GENERAL;
    g.info = info;
    g.female = gd?.sex === 2;
    g.hp = info.gs.hp;
    g.maxHp = Math.max(1, info.gs.maxHp);
    g.mp = info.gs.mp;
    g.maxMp = Math.max(1, info.gs.maxMp);
    g.atk = info.atk;
    g.x = g.px = x;
    g.y = g.py = y;
    g.facing = S.dir;
    g.order = ORD_HOLD;
    g.range = 70;
    const lo = obj(30000 + (gd?.bfShape || 1)) ?? obj(30001)!;
    const root = new Container();
    const s = new AnimSprite(lo, 'wait');
    s.onEvent = (ev) => ev === 'attack' && this.resolveAttack(g);
    s.onEnd = () => this.animEnded(g);
    const wf = lo.def.sprites.wait?.frames[0];
    const fr = wf ? lo.dir.frame(wf.f) : undefined;
    g.foot = fr ? Math.max(20, Math.min(60, fr.h - fr.ay)) : 44;
    const ho = horseObject(info.gs);
    g.mounted = !!ho && !!obj(ho);
    g.spd = g.mounted ? 2.3 + horseSpeed(info.gs) * 0.08 : 1.75;
    if (g.mounted) {
      g.range = 80;
      s.position.set(4, -80);
      root.addChild(s);
      const h = new AnimSprite(obj(ho)!, 'wait');
      g.horse = h;
      root.addChild(h);
    } else {
      s.position.set(0, -g.foot);
      root.addChild(s);
    }
    const lightId = side === 0 ? 30999 : 30997;
    if (obj(lightId)) {
      const l = new AnimSprite(obj(lightId)!, 'wait');
      l.blendMode = 'add';
      l.visible = false;
      l.position.copyFrom(s.position);
      root.addChild(l);
      g.light = l;
    }
    // name label + hp bar
    const label = new Text({
      text: info.name,
      style: { fontFamily: 'STKaiti, Kaiti SC, KaiTi, serif', fontSize: 17, fill: side === 0 ? 0xbfe0ff : 0xffd0c8, stroke: { color: 0x000000, width: 4 }, fontWeight: 'bold' },
    });
    label.anchor.set(0.5, 1);
    label.resolution = 2;
    g.label = label;
    g.bar = new Graphics();
    root.addChild(label, g.bar);
    label.position.set(0, g.mounted ? -168 : -g.foot - 110);
    g.bar.position.set(-22, label.position.y + 2);
    g.spr = s;
    g.view = root;
    g.shadow = this.makeShadow(g.mounted ? 'horse' : 'soldier', g.mounted ? 0.85 : 1.25);
    this.layers.units.addChild(root);
    this.units.push(g);
    this.faceGeneral(g, g.facing);
    return g;
  }

  // ---------------------------------------------------------------- helpers
  enemy(side: 0 | 1) {
    return this.sides[side ^ 1];
  }

  setTint(t: number) {
    this.tint = t;
    for (const u of this.units) this.applyTint(u);
  }
  applyTint(u: Unit) {
    const t = u.lock > 0 ? 0x8899ff : u.burn > 0 ? 0xffaa88 : this.tint;
    u.spr.tint = t;
    if (u instanceof General && u.horse) u.horse.tint = t;
  }

  private faceGeneral(g: General, f: 1 | -1) {
    g.facing = f;
    g.view.scale.x = -f; // sprites face left originally
    g.label.scale.x = -f; // keep text readable
    g.bar.scale.x = -f;
    g.bar.position.x = f === 1 ? 22 : -22;
  }

  face(u: Unit, f: 1 | -1) {
    if (u.facing === f) return;
    if (u instanceof General) this.faceGeneral(u, f);
    else {
      u.facing = f;
      faceSprite(u.spr, f);
    }
  }

  private play(u: Unit, name: string, restart = false) {
    const ok = u.spr.play(name, restart);
    if (u instanceof General) {
      u.horse?.play(name, restart);
      if (u.light?.visible) u.light.play(name, restart);
    }
    return ok;
  }

  snd(name: string, x: number, vol = 1) {
    const rel = (x - (this.camX + this.viewW / 2)) / (this.viewW * 0.8);
    if (Math.abs(rel) > 1.6) vol *= 0.35;
    sfx(name, { volume: vol, pan: Math.max(-0.8, Math.min(0.8, rel)) });
  }

  // ---------------------------------------------------------------- grid
  private buildGrid() {
    this.head.fill(-1);
    if (this.next.length < this.units.length) this.next = new Int32Array(this.units.length * 2);
    const us = this.units;
    for (let i = 0; i < us.length; i++) {
      const u = us[i];
      if (!u.alive) continue;
      const c = this.cellOf(u.x, u.y);
      this.next[i] = this.head[c];
      this.head[c] = i;
    }
  }
  private cellOf(x: number, y: number) {
    let cx = Math.floor((x + 200) / this.cell);
    let cy = Math.floor(y / this.cell);
    if (cx < 0) cx = 0;
    else if (cx >= this.gcols) cx = this.gcols - 1;
    if (cy < 0) cy = 0;
    else if (cy >= this.grows) cy = this.grows - 1;
    return cy * this.gcols + cx;
  }
  /** Fills qbuf with living units within the box; returns count. */
  query(x: number, y: number, rx: number, ry: number): number {
    const q = this.qbuf;
    let n = 0;
    const c0 = Math.max(0, Math.floor((x - rx + 200) / this.cell));
    const c1 = Math.min(this.gcols - 1, Math.floor((x + rx + 200) / this.cell));
    const r0 = Math.max(0, Math.floor((y - ry) / this.cell));
    const r1 = Math.min(this.grows - 1, Math.floor((y + ry) / this.cell));
    for (let r = r0; r <= r1; r++)
      for (let c = c0; c <= c1; c++) {
        for (let i = this.head[r * this.gcols + c]; i >= 0; i = this.next[i]) {
          const u = this.units[i];
          if (Math.abs(u.x - x) <= rx && Math.abs(u.y - y) <= ry) q[n++] = u;
        }
      }
    return n;
  }
  get qb() {
    return this.qbuf;
  }

  // ---------------------------------------------------------------- orders
  orderGroup(side: 0 | 1, big: number, cmd: string) {
    const S = this.sides[side];
    for (const g of S.groups) if (big < 0 || g.big === big) this.applyGroupCmd(S, g, cmd);
  }

  private applyGroupCmd(S: SideState, g: Group, cmd: string) {
    const mx = this.groupMeanX(g);
    switch (cmd) {
      case 'advance':
        if (g.order !== ORD_ADVANCE && this.phase === 'fight' && this.tick - this.lastMarchSnd > 20) {
          this.lastMarchSnd = this.tick;
          this.snd(this.sides[g.side].units[0]?.mounted ? 'horse02' : 'soldiermove-00', g.ax, 0.6);
        }
        g.order = ORD_ADVANCE;
        break;
      case 'back':
        g.order = ORD_BACK;
        g.ax = S.dir === 1 ? Math.min(mx, 120 + (g.baseX - BASE) * 0.5) : Math.max(mx, W - 120 - (W - g.baseX - BASE) * 0.5);
        break;
      case 'hold':
        g.order = ORD_HOLD;
        g.ax = mx;
        break;
      case 'center':
        g.cy = g.cy + (FIELD_MID - g.cy) * 0.65;
        g.spread = Math.max(0.45, g.spread * 0.7);
        if (g.order === ORD_HOLD) g.ax = mx;
        break;
      case 'spread':
        g.cy = FIELD_MID + (g.cy - FIELD_MID) * 1.6;
        g.spread = Math.min(1.7, g.spread * 1.3);
        if (g.order === ORD_HOLD) g.ax = mx;
        break;
      case 'up':
        g.cy -= 55;
        if (g.order === ORD_HOLD) g.ax = mx;
        break;
      case 'down':
        g.cy += 55;
        if (g.order === ORD_HOLD) g.ax = mx;
        break;
    }
    g.cy = Math.max(FIELD_TOP + 30, Math.min(FIELD_BOT - 30, g.cy));
  }

  private groupMeanX(g: Group) {
    let s = 0;
    let n = 0;
    for (const u of g.members)
      if (u.alive && !u.fleeing) {
        s += u.x - u.sdx;
        n++;
      }
    return n ? s / n : g.ax;
  }

  orderAll(side: 0 | 1, cmd: 'charge' | 'hold' | 'retreat' | 'advance' | 'back') {
    const S = this.sides[side];
    if (cmd === 'charge') {
      S.charge = true;
      for (const g of S.groups) g.order = ORD_ADVANCE;
      if (S.gen.alive && !S.retreat && S.gen.state !== ST_ATTACK && S.gen.casting === 0) {
        this.play(S.gen, 'point', true);
        S.gen.poseT = 34;
      }
      this.snd(S.gen.female ? 'charge-10' : 'charge-00', S.gen.x);
      this.snd('yell', S.gen.x, 0.8);
    } else if (cmd === 'hold') {
      if (S.charge) return; // 全军突击 cannot be cancelled by 全军待命
      for (const g of S.groups) this.applyGroupCmd(S, g, 'hold');
    } else if (cmd === 'retreat') {
      S.retreat = true;
      S.gen.order = ORD_BACK;
    } else {
      for (const g of S.groups) this.applyGroupCmd(S, g, cmd);
    }
  }

  orderGeneral(side: 0 | 1, cmd: 'advance' | 'back' | 'hold') {
    const S = this.sides[side];
    if (S.retreat) return;
    S.gen.order = cmd === 'advance' ? ORD_ADVANCE : cmd === 'back' ? ORD_BACK : ORD_HOLD;
    S.gen.target = null;
  }

  // ---------------------------------------------------------------- tick
  step() {
    this.tick++;
    if (this.slowmo > 0) this.slowmo--;
    this.buildGrid();
    for (const u of this.units) {
      u.engaged = u.engagedNext;
      u.engagedNext = 0;
    }
    const fighting = this.phase === 'fight';
    if (this.skillSlow > 0) this.skillSlow--;
    const slow = this.skillSlow > 0 && this.tick % 3 !== 0;
    for (const S of this.sides) if (S.locked > 0) S.locked--;
    const us = this.units;
    for (let i = 0; i < us.length; i++) {
      const u = us[i];
      u.px = u.x;
      u.py = u.y;
      if (u.state === ST_GONE) continue;
      if (slow && u.state !== ST_DEAD && u.state !== ST_HURT && !(u instanceof General && u.casting > 0)) {
        if (u.kx) {
          u.x += u.kx;
          u.kx *= 0.7;
          if (Math.abs(u.kx) < 0.2) u.kx = 0;
        }
        continue;
      }
      if (u.state === ST_DEAD) {
        u.spr.tick();
        if (u instanceof General) u.horse?.tick();
        u.deadT++;
        // corpses stay; summons and reinforcements fade away
        if (u.kind === K_SUM && u.deadT > 200) {
          const a = 1 - (u.deadT - 200) / 40;
          u.view.alpha = a;
          if (a <= 0) {
            u.state = ST_GONE;
            u.view.visible = false;
          }
        }
        continue;
      }
      if (u.lock > 0) {
        u.lock--;
        if (u.lock === 0) this.applyTint(u);
        continue;
      }
      if (u.burn > 0) {
        u.burn--;
        if (u.burn % 15 === 0) this.damage(u, u.kind === K_GEN ? 2 : 3, null, false);
        if (u.burn === 0) this.applyTint(u);
        if (!u.alive) continue;
      }
      if (u.life > 0 && --u.life === 0) {
        this.kill(u, null);
        continue;
      }
      u.spr.tick();
      if (u instanceof General) {
        u.horse?.tick();
        if (u.light?.visible) u.light.tick();
        this.genTick(u, fighting);
      } else if (fighting) this.unitTick(u);
      else if (this.phase === 'over') this.overTick(u);
      // knockback
      if (u.kx) {
        u.x += u.kx;
        u.kx *= 0.7;
        if (Math.abs(u.kx) < 0.2) u.kx = 0;
      }
    }
    if (!slow) {
      this.separate();
      this.tickArrows();
    } else
      for (const a of this.arrows) {
        a.px = a.x;
        a.py = a.y;
        a.pz = a.z;
      }
    if (this.effects.length) {
      let j = 0;
      for (let i = 0; i < this.effects.length; i++) if (this.effects[i].tick()) this.effects[j++] = this.effects[i];
      this.effects.length = j;
    }
    if (this.focusT > 0) this.focusT--;
    this.fx.tick();
    if (fighting && !slow) {
      this.timeLeft--;
      this.checkEnd();
      if (this.tick % 30 === 0) this.moraleCheck();
    }
  }

  // ---------------------------------------------------------------- soldiers
  private unitTick(u: Unit) {
    const S = this.sides[u.side];
    const E = this.sides[u.side ^ 1];
    if (u.cd > 0) u.cd--;
    if (u.state === ST_ATTACK || u.state === ST_HURT || u.state === ST_DEFEND) return;
    if (S.locked > 0) return;
    // retreat / flee: run to own edge
    if (S.retreat || u.fleeing || (!S.gen.alive && u.kind === K_SOL) || S.gen.fled) {
      const ex = S.dir === 1 ? -80 : W + 80;
      this.moveTo(u, ex, u.y, u.spd * 1.15);
      if ((S.dir === 1 && u.x < -40) || (S.dir === -1 && u.x > W + 40)) {
        u.state = ST_GONE;
        u.escaped = true;
        u.view.visible = false;
        u.shadow.visible = false;
      }
      return;
    }
    const g = u.group;
    const charge = S.charge || u.kind === K_SUM;
    const order = charge ? ORD_ADVANCE : g ? g.order : ORD_ADVANCE;
    // retarget
    if (u.target && (!u.target.alive || u.target.side === u.side)) u.target = null;
    if (--u.retarget <= 0 || !u.target) {
      u.retarget = 8 + (u.idx % 6);
      const aggro = charge ? 900 : order === ORD_ADVANCE ? (u.ranged ? 360 : 230) : order === ORD_HOLD ? (u.ranged ? 340 : 110) : 50;
      u.target = this.findTarget(u, aggro, charge);
      if (!u.target && charge && E.gen.alive) u.target = E.gen;
      // marching soldiers go for the enemy general once he is close
      if (!u.target && order === ORD_ADVANCE && E.gen.alive && !E.gen.fled && Math.abs(E.gen.x - u.x) < 260) u.target = E.gen;
    }
    const t = u.target;
    // goal position
    let gx: number;
    let gy: number;
    if (t) {
      const dx = t.x - u.x;
      const adx = Math.abs(dx);
      const ady = Math.abs(t.y - u.y);
      if (u.ranged) {
        const d = adx + ady * 1.5;
        if (d < 70 && ady < 16) return this.startAttack(u, t, true);
        if (d <= 360 && u.cd <= 0) return this.startAttack(u, t, false);
        if (d <= 340) {
          this.idle(u, t.x > u.x ? 1 : -1);
          return;
        }
      } else if (adx <= u.range && ady <= 14 && (t.kind !== K_GEN || adx > 18)) {
        if (u.cd <= 0) return this.startAttack(u, t, false);
        t.engagedNext++;
        this.idle(u, dx > 0 ? 1 : -1);
        return;
      }
      const from = dx > 0 ? -1 : 1;
      const cap = t.kind === K_GEN ? 10 : 3;
      if (t.engaged >= cap && t.kind !== K_GEN && !charge && adx < 140) {
        u.retarget = 0;
      }
      if (u.ranged) {
        // archers close in only to shooting range, keeping their rank's depth
        gx = t.x + from * 300 * u.reach;
        gy = g ? g.cy + u.sdy * g.spread : u.y;
      } else {
        gx = t.x + from * u.range * u.reach;
        gy = t.y + ((u.idx % 7) - 3) * (t.kind === K_GEN ? 4.5 : 3.2);
      }
      // hold leash
      if (order === ORD_HOLD && g && Math.abs(gx - (g.ax + u.sdx)) > 200) {
        u.target = null;
        gx = g.ax + u.sdx;
        gy = g.cy + u.sdy * g.spread;
      }
      if (t.engagedNext < 99) t.engagedNext += adx < 120 ? 1 : 0;
    } else if (g) {
      if (order === ORD_ADVANCE) {
        // march forward in formation toward the enemy
        gx = E.gen.alive && !E.gen.fled ? E.gen.x + u.sdx * 0.5 : u.x + S.dir * 40;
        gy = g.cy + u.sdy * g.spread;
      } else {
        gx = g.ax + u.sdx;
        gy = g.cy + u.sdy * g.spread;
      }
    } else {
      gx = u.x;
      gy = u.y;
    }
    gy = Math.max(FIELD_TOP, Math.min(FIELD_BOT, gy));
    const ddx = gx - u.x;
    const ddy = gy - u.y;
    if (Math.abs(ddx) < 3 && Math.abs(ddy) < 3) {
      this.idle(u, t ? (t.x > u.x ? 1 : -1) : S.dir);
      return;
    }
    this.moveTo(u, gx, gy, u.spd);
  }

  /** after the battle: the beaten army flees, the victors stand */
  private overTick(u: Unit) {
    if (u.state === ST_ATTACK || u.state === ST_HURT || u.state === ST_DEFEND) return;
    const S = this.sides[u.side];
    const lost = (this.winner === 'left' && u.side === 1) || (this.winner === 'right' && u.side === 0);
    if (lost) {
      const ex = S.dir === 1 ? -80 : W + 80;
      this.moveTo(u, ex, u.y, u.spd * 1.2);
      if ((S.dir === 1 && u.x < -40) || (S.dir === -1 && u.x > W + 40)) {
        u.state = ST_GONE;
        u.escaped = true;
        u.view.visible = false;
        u.shadow.visible = false;
      }
    } else this.idle(u, S.dir);
  }

  private moveTo(u: Unit, gx: number, gy: number, spd: number) {
    const dx = gx - u.x;
    const dy = gy - u.y;
    const d = Math.hypot(dx, dy * 1.4);
    if (d < 1.5) return;
    const k = Math.min(1, spd / d);
    u.x += dx * k;
    u.y += dy * k * 0.75;
    if (Math.abs(dx) > 2) this.face(u, dx > 0 ? 1 : -1);
    if (u.state !== ST_MOVE) {
      u.state = ST_MOVE;
      this.play(u, u.anims.walk);
    }
    const as = u.mounted ? spd / 2.3 : spd / 1.6;
    u.spr.speed = as;
    if (u instanceof General && u.horse) u.horse.speed = as;
  }

  private idle(u: Unit, f: 1 | -1) {
    this.face(u, f);
    if (u.state !== ST_IDLE) {
      u.state = ST_IDLE;
      u.spr.speed = 1;
      if (u instanceof General && u.horse) u.horse.speed = 1;
      this.play(u, u.anims.wait);
    }
  }

  private findTarget(u: Unit, r: number, charge: boolean): Unit | null {
    const n = this.query(u.x, u.y, r, Math.min(r, 260));
    const q = this.qbuf;
    let best: Unit | null = null;
    let bs = 1e9;
    for (let i = 0; i < n; i++) {
      const e = q[i];
      if (e.side === u.side || e.state === ST_GONE || e.state === ST_DEAD) continue;
      if (e instanceof General && (e.fled || e.invuln > 0 && e.casting > 0)) continue;
      let s = Math.abs(e.x - u.x) + 2.2 * Math.abs(e.y - u.y);
      const cap = e.kind === K_GEN ? 10 : 3;
      if (e.engaged >= cap) s += 140;
      // before 全军突击 the soldiers' objective is the enemy general
      if (e.kind === K_GEN && !charge) s -= 70;
      if (s < bs) {
        bs = s;
        best = e;
      }
    }
    return best;
  }

  private startAttack(u: Unit, t: Unit, melee2: boolean) {
    this.face(u, t.x > u.x ? 1 : -1);
    u.target = t;
    u.state = ST_ATTACK;
    u.attackHit = false;
    u.spr.speed = 1;
    const name = u.ranged ? (melee2 ? u.anims.attack2 : u.anims.attack) : rng.next() < 0.35 ? u.anims.attack2 : u.anims.attack;
    if (!this.play(u, name, true)) this.play(u, u.anims.attack, true);
    u.cd = u.ranged ? rng.int(14, 44) : rng.int(10, 34);
    t.engagedNext++;
  }

  private animEnded(u: Unit) {
    if (!u.alive) return;
    if (u.state === ST_ATTACK) {
      if (!u.attackHit) this.resolveAttack(u);
      u.state = ST_IDLE;
      this.play(u, u.anims.wait, true);
      if (u instanceof General && u.comboLeft > 0) u.comboLeft--;
    } else if (u.state === ST_HURT || u.state === ST_DEFEND) {
      u.state = ST_IDLE;
      this.play(u, u.anims.wait, true);
    } else if (u.state === ST_CAST) {
      // charge anim holds on its last frame; handled by casting timer
    } else if (u instanceof General && u.spr.animName === 'point') {
      this.play(u, 'wait', true);
    }
  }

  /** Called at the hit frame of an attack animation. */
  private resolveAttack(u: Unit) {
    if (!u.alive || u.state !== ST_ATTACK) return;
    u.attackHit = true;
    if (u instanceof General) return this.generalStrike(u);
    const t = u.target;
    if (!t) return;
    const name = u.spr.animName;
    if (u.ranged && name === u.anims.attack) {
      this.shoot(u, t);
      return;
    }
    if (!t.alive) return;
    const adx = Math.abs(t.x - u.x);
    if (adx > u.range * 1.5 || Math.abs(t.y - u.y) > 24) return;
    if (t instanceof General && t.invuln > 0) return;
    if (rng.next() < hitChance(u.type, t.type)) {
      const dmg = t.kind === K_GEN ? solVsGenDamage(u.power, (t as General).info.gs.str) : solVsSolDamage(u.power, this.morale(u.side));
      this.damage(t, dmg * rng.range(0.8, 1.2), u, true);
      if (rng.next() < 0.3) this.snd(`hit0${rng.int(1, 5)}`, t.x, 0.45);
    } else {
      if (t.state === ST_IDLE && t.kind !== K_GEN) {
        t.state = ST_DEFEND;
        this.play(t, t.anims.defend, true);
      }
      if (rng.next() < 0.15) this.snd(rng.next() < 0.5 ? 'def01' : 'def02', t.x, 0.35);
    }
  }

  morale(side: number) {
    const def = side === 0 ? this.setup.left : this.setup.right;
    return def.morale;
  }

  // ---------------------------------------------------------------- generals
  private genTick(g: General, fighting: boolean) {
    const S = this.sides[g.side];
    const E = this.sides[g.side ^ 1];
    if (g.invuln > 0) g.invuln--;
    if (g.poseT > 0 && --g.poseT === 0 && g.state === ST_IDLE) this.play(g, 'wait', true);
    if (g.casting > 0) {
      g.casting--;
      if (g.casting === 18 && g.castCb) {
        const cb = g.castCb;
        g.castCb = null;
        cb();
      }
      if (g.casting === 0) {
        if (g.light) g.light.visible = false;
        g.state = ST_IDLE;
        this.play(g, 'wait', true);
      }
      return;
    }
    if (!fighting) return;
    if (g.cd > 0) g.cd--;
    if (g.state === ST_ATTACK || g.state === ST_HURT) return;
    if (g.gauge < 100 && !S.retreat) g.gauge = Math.min(100, g.gauge + 0.2);
    if (S.locked > 0) return;
    if (S.retreat) {
      const ex = S.dir === 1 ? -90 : W + 90;
      this.moveTo(g, ex, g.y, g.spd * 1.1);
      // enemies adjacent slow the escape (must cut a way out)
      const n = this.query(g.x, g.y, 30, 14);
      let block = 0;
      for (let i = 0; i < n; i++) if (this.qbuf[i].side !== g.side && this.qbuf[i].alive) block++;
      if (block > 1 && !g.mounted) {
        g.x -= (ex > g.x ? 1 : -1) * Math.min(g.spd * 0.7, block * 0.25);
      }
      if ((S.dir === 1 && g.x < -60) || (S.dir === -1 && g.x > W + 60)) {
        g.fled = true;
        g.state = ST_GONE;
        g.view.visible = false;
        g.shadow.visible = false;
      }
      return;
    }
    // pick a target in reach
    let t: Unit | null = null;
    const reach = g.range + 30;
    const n = this.query(g.x + g.facing * 30, g.y, reach + 30, 34);
    let bs = 1e9;
    for (let i = 0; i < n; i++) {
      const e = this.qbuf[i];
      if (e.side === g.side || !e.alive) continue;
      if (e instanceof General && e.casting > 0) continue;
      const s = Math.abs(e.x - g.x) + 2 * Math.abs(e.y - g.y) - (e.kind === K_GEN ? 40 : 0);
      if (s < bs) {
        bs = s;
        t = e;
      }
    }
    if (t) {
      const adx = Math.abs(t.x - g.x);
      if (adx <= g.range && Math.abs(t.y - g.y) <= 26 && adx > 12) {
        if (g.cd <= 0) {
          this.face(g, t.x > g.x ? 1 : -1);
          g.state = ST_ATTACK;
          g.attackHit = false;
          g.target = t;
          g.spr.speed = 1;
          if (g.horse) g.horse.speed = 1;
          const r = rng.next();
          const name = r < 0.08 && g.spr.has('attack10') ? 'attack10' : `attack0${rng.int(1, r < 0.5 ? 3 : 7)}`;
          this.play(g, name, true);
          g.cd = rng.int(8, 20);
          return;
        }
        this.idle(g, t.x > g.x ? 1 : -1);
        return;
      }
    }
    // movement by order
    let gx = g.x;
    let gy = g.y;
    if (g.order === ORD_ADVANCE) {
      const eg = E.gen;
      const tgt = eg.alive && !eg.fled ? eg : null;
      if (tgt) {
        gx = tgt.x - (tgt.x > g.x ? 1 : -1) * g.range * 0.8;
        gy = tgt.y;
      } else if (t) {
        gx = t.x;
        gy = t.y;
      } else gx = g.x + S.dir * 50;
    } else if (g.order === ORD_BACK) {
      gx = S.dir === 1 ? 150 : W - 150;
    } else if (t && Math.abs(t.x - g.x) < reach + 20) {
      gx = t.x - (t.x > g.x ? 1 : -1) * g.range * 0.8;
      gy = t.y;
    }
    gy = Math.max(FIELD_TOP, Math.min(FIELD_BOT, gy));
    if (Math.abs(gx - g.x) < 4 && Math.abs(gy - g.y) < 4) {
      this.idle(g, t ? (t.x > g.x ? 1 : -1) : S.dir);
    } else this.moveTo(g, gx, gy, g.spd);
  }

  /** A general's attack frame: hits several enemies in an arc in front. */
  private generalStrike(g: General) {
    const n = this.query(g.x + g.facing * (g.range * 0.55), g.y, g.range * 0.75 + 12, 32);
    const q = this.qbuf;
    let hits = 0;
    const maxHits = 2 + Math.floor(g.atk / 50);
    // nearest first
    const cand: Unit[] = [];
    for (let i = 0; i < n; i++) {
      const e = q[i];
      if (e.side === g.side || !e.alive) continue;
      const fx = (e.x - g.x) * g.facing;
      if (fx < -14 || fx > g.range + 20) continue;
      cand.push(e);
    }
    cand.sort((a, b) => Math.abs(a.x - g.x) - Math.abs(b.x - g.x));
    for (const e of cand) {
      if (hits >= maxHits) break;
      if (e instanceof General) {
        if (e.invuln > 0) continue;
        const d = genVsGenDamage(g.atk, e.info.gs.str) * rng.range(0.8, 1.2);
        this.damage(e, d, g, true);
        this.snd(`hit0${rng.int(1, 5)}`, e.x, 0.9);
        this.fx.anim(42012, 'wait', e.x, e.y, { z: 60, life: 14, scale: 0.6, bias: 60 });
        this.fx.shake(4);
      } else {
        if (rng.next() > 0.88) {
          if (e.state === ST_IDLE) {
            e.state = ST_DEFEND;
            this.play(e, e.anims.defend, true);
          }
          continue;
        }
        const d = genVsSoldierDamage(g.atk) * rng.range(0.8, 1.25);
        e.kx = g.facing * (e.hp <= d ? 5 : 3);
        this.fx.anim(42021, 'wait', e.x - g.facing * 6, e.y, { z: 50 + rng.range(-10, 20), life: 8, fade: 6, scale: rng.range(1.2, 2), blend: 'add', bias: 50 });
        this.damage(e, d, g, true);
      }
      hits++;
    }
    if (hits) {
      g.gauge = Math.min(100, g.gauge + 1.5 * hits);
      this.snd(rng.next() < 0.5 ? 'sword' : `hit0${rng.int(1, 5)}`, g.x, 0.7);
    } else if (rng.next() < 0.3) this.snd('fight01', g.x, 0.35);
  }

  // ---------------------------------------------------------------- damage
  damage(t: Unit, dmg: number, src: Unit | null, melee: boolean) {
    if (!t.alive) return;
    if (t instanceof General) {
      if (t.invuln > 0 || t.fled) return;
      t.hp -= dmg;
      t.gauge = Math.min(100, t.gauge + Math.min(4, dmg * 0.3));
      if (dmg >= 2) this.fx.number(t.x, t.y - (t.mounted ? 150 : t.foot + 95), String(Math.round(dmg)), t.side === 0 ? 0xff6050 : 0xffd040, dmg >= 25);
      if (t.hp <= 0) {
        t.hp = 0;
        this.kill(t, src);
        return;
      }
      if (melee && t.state === ST_IDLE && rng.next() < 0.35) {
        t.state = ST_HURT;
        this.play(t, 'hurt', true);
      }
      if (rng.next() < 0.25) this.snd(`hurt-${t.female ? 1 : 0}${rng.int(0, 2)}`, t.x, 0.7);
      if (melee && rng.next() < 0.5) this.blood(t.x, t.y - 60);
      return;
    }
    t.hp -= dmg;
    if (t.hp <= 0) {
      this.kill(t, src);
      return;
    }
    if (t.state !== ST_ATTACK && t.state !== ST_HURT) {
      t.state = ST_HURT;
      this.play(t, t.anims.hurt, true);
    }
    if (melee && rng.next() < 0.25) this.blood(t.x, t.y - 45);
  }

  blood(x: number, y: number) {
    this.fx.anim(42065, rng.pick(['wait', 'wait2', 'wait3', 'wait4', 'wait5'])!, x + rng.range(-8, 8), y + rng.range(-10, 10), { scale: rng.range(0.5, 0.8), bias: 60, alpha: 0.9 });
  }

  kill(u: Unit, src: Unit | null) {
    if (!u.alive) return;
    const S = this.sides[u.side];
    u.state = ST_DEAD;
    u.deadT = 0;
    u.target = null;
    u.lock = 0;
    u.burn = 0;
    u.spr.speed = 1;
    this.applyTint(u);
    u.shadow.visible = false;
    if (src) this.sides[src.side].kills += u.kind === K_SOL ? 1 : 0;
    if (u instanceof General) {
      if (u.light) u.light.visible = false;
      u.spr.speed = 0.7;
      this.play(u, rng.next() < 0.5 ? 'die' : 'die2', true);
      if (u.horse) u.horse.speed = 0.7;
      this.snd(`die-${u.female ? 1 : 0}${rng.int(0, 2)}`, u.x, 1);
      this.fx.shake(10);
      this.fx.flash(0xffffff, 0.5, 0.04);
      this.slowmo = 75;
      for (let i = 0; i < 4; i++) this.blood(u.x + rng.range(-20, 20), u.y - 60 + rng.range(-20, 20));
      return;
    }
    if (u.kind === K_SOL) S.alive--;
    const names = u.anims.die;
    let ok = false;
    for (let k = 0; k < 3 && !ok; k++) ok = this.play(u, names[rng.int(0, names.length - 1)], true);
    if (!ok) this.play(u, names[0], true);
    u.view.zIndex = u.y - 2000;
    if (rng.next() < 0.5) this.snd(`soldierdie-${u.female ? 1 : 0}${rng.int(0, 4)}`, u.x, 0.5);
    // gore: generals sometimes behead soldiers
    if (src instanceof General && rng.next() < 0.18 && obj(31001)) {
      this.fx.anim(31001, 'wait', u.x, u.y, { z: 70, vz: rng.range(5, 8), g: 0.45, vx: src.facing * rng.range(1, 3), life: 200, fade: 40, bias: 5 });
      this.blood(u.x, u.y - 70);
    }
    // cavalry: the horse runs away
    if (u.horseId && obj(u.horseId) && rng.next() < 0.6) {
      const hf = this.fx.anim(u.horseId, 'walk', u.x, u.y, { vx: -this.sides[u.side].dir * 4.2, life: 110, fade: 30, speed: 1.4 });
      if (hf) {
        hf.spr!.setFacing(this.sides[u.side].dir === 1 ? 1 : -1);
        hf.spr!.tint = this.tint;
      }
    }
  }

  heal(g: General, amt: number) {
    g.hp = Math.min(g.maxHp, g.hp + amt);
    this.fx.number(g.x, g.y - (g.mounted ? 150 : g.foot + 95), '+' + Math.round(amt), 0x66ff88, true);
  }

  // ---------------------------------------------------------------- projectiles
  private shoot(u: Unit, t: Unit) {
    const crossbow = u.type === 8;
    const lo = crossbow ? this.boltObj : this.arrowObj;
    const sx = u.x + u.facing * 26;
    const sy = u.y;
    const sz = u.mounted ? 85 : 60;
    // lead the target a little
    const tx = t.x + (t.x - t.px) * 10 + rng.range(-10, 10);
    const ty = t.y + (t.y - t.py) * 10 + rng.range(-4, 4);
    const dist = Math.hypot(tx - sx, ty - sy);
    const T = Math.max(12, dist / (crossbow ? 13 : 10));
    const tz = t.kind === K_GEN ? 55 : 45;
    const g = crossbow ? 0.12 : 0.3;
    const vz = (tz - sz + 0.5 * g * T * T) / T;
    let a = this.arrows.find((x) => !x.live);
    if (!a) {
      const s = new Sprite();
      this.layers.units.addChild(s);
      a = { s, x: 0, y: 0, z: 0, px: 0, py: 0, pz: 0, vx: 0, vy: 0, vz: 0, t: null, tx: 0, ty: 0, from: u, live: false, stuck: 0, dmgType: 0, power: 0, general: false, side: 0 };
      this.arrows.push(a);
    }
    a.live = true;
    a.stuck = 0;
    a.x = a.px = sx;
    a.y = a.py = sy;
    a.z = a.pz = sz;
    a.vx = (tx - sx) / T;
    a.vy = (ty - sy) / T;
    a.vz = vz;
    a.t = t;
    a.tx = tx;
    a.ty = ty;
    a.from = u;
    a.dmgType = u.type;
    a.power = u.power;
    a.side = u.side;
    a.general = false;
    a.s.visible = true;
    a.s.alpha = 1;
    a.s.tint = this.tint;
    (a as { g?: number }).g = g;
    if (crossbow && lo) {
      const f = lo.dir.frame('t1');
      if (f) {
        a.s.texture = f.tex;
        a.s.anchor.set(f.ax / f.w, f.ay / f.h);
      }
    }
    if (rng.next() < 0.3) this.snd('arrow', sx, 0.35);
  }

  private tickArrows() {
    for (const a of this.arrows) {
      if (!a.live) continue;
      a.px = a.x;
      a.py = a.y;
      a.pz = a.z;
      if (a.stuck > 0) {
        a.stuck--;
        if (a.stuck === 0) {
          a.live = false;
          a.s.visible = false;
        }
        continue;
      }
      const g = (a as { g?: number }).g ?? 0.3;
      a.x += a.vx;
      a.y += a.vy;
      a.vz -= g;
      a.z += a.vz;
      if (a.z <= 40 && a.vz < 0) {
        // impact check
        const t = a.t;
        let hit = false;
        if (t && t.alive && Math.abs(t.x - a.x) < 24 && Math.abs(t.y - a.y) < 14) {
          if (!(t instanceof General && t.invuln > 0) && rng.next() < hitChance(a.dmgType, t.type)) {
            const dmg = t.kind === K_GEN ? solVsGenDamage(a.power, (t as General).info.gs.str) : solVsSolDamage(a.power, this.morale(a.side));
            this.damage(t, dmg * rng.range(0.8, 1.2), a.from, false);
            hit = true;
          }
        }
        if (hit || a.z <= 0) {
          a.live = hit ? false : true;
          a.s.visible = !hit;
          if (!hit) {
            a.z = 0;
            a.stuck = 90;
          }
        }
      }
    }
  }

  private renderArrows(al: number) {
    for (const a of this.arrows) {
      if (!a.live) continue;
      const x = a.px + (a.x - a.px) * al;
      const y = a.py + (a.y - a.py) * al;
      const z = a.pz + (a.z - a.pz) * al;
      a.s.position.set(x, y - z);
      a.s.zIndex = y + 2;
      if (a.stuck > 0) {
        a.s.alpha = Math.min(1, a.stuck / 30);
        continue;
      }
      const g = (a as { g?: number }).g ?? 0.3;
      if (a.dmgType === 8) {
        // crossbow bolt: one texture, rotate
        // the bolt texture points left
        a.s.rotation = Math.atan2(a.vy - (a.vz - g * al), a.vx) + Math.PI;
      } else {
        const f = arrowFrame(this.arrowObj, a.vx, a.vy - (a.vz - g * al));
        if (f) {
          a.s.texture = f.tex;
          a.s.anchor.set(f.ax / f.w, f.ay / f.h);
        }
      }
    }
  }

  // ---------------------------------------------------------------- separation
  private separate() {
    const us = this.units;
    for (let i = 0; i < us.length; i++) {
      const u = us[i];
      if (!u.alive || u.state === ST_ATTACK || (i + this.tick) % 2) continue;
      const n = this.query(u.x, u.y, 14, 6);
      const q = this.qbuf;
      for (let k = 0; k < n; k++) {
        const o = q[k];
        if (o === u || o.state === ST_DEAD) continue;
        const dx = u.x - o.x;
        const dy = u.y - o.y;
        if (o.side !== u.side) {
          // don't walk through enemies
          if (Math.abs(dx) < 12 && Math.abs(dy) < 5) u.x += dx >= 0 ? 0.8 : -0.8;
          continue;
        }
        if (Math.abs(dx) < 9 && Math.abs(dy) < 4) {
          u.y += dy >= 0 ? 0.5 : -0.5;
          u.x += dx >= 0 ? 0.4 : -0.4;
        }
      }
      if (u.y < FIELD_TOP - 10) u.y = FIELD_TOP - 10;
      if (u.y > FIELD_BOT + 10) u.y = FIELD_BOT + 10;
    }
  }

  // ---------------------------------------------------------------- morale / end
  private moraleCheck() {
    for (const S of this.sides) {
      const ratio = S.initial ? S.alive / S.initial : 1;
      const m = S === this.sides[0] ? this.setup.left.morale : this.setup.right.morale;
      const genHurt = S.gen.hp / S.gen.maxHp;
      if (m >= 60 && genHurt > 0.3) continue;
      if (ratio > 0.5 && genHurt > 0.3) continue;
      const p = ((60 - m) / 60) * (1 - ratio) * 0.06 + (genHurt < 0.3 ? 0.02 : 0);
      for (const u of S.units) if (u.alive && !u.fleeing && rng.next() < p) u.fleeing = true;
    }
  }

  private checkEnd() {
    if (this.phase !== 'fight') return;
    const [L, R] = this.sides;
    let w: 'left' | 'right' | 'draw' | null = null;
    let reason = '';
    if (!L.gen.alive && !L.gen.fled) {
      w = 'right';
      reason = `${L.info.name}战败`;
    } else if (!R.gen.alive && !R.gen.fled) {
      w = 'left';
      reason = `${R.info.name}战败`;
    } else if (L.gen.fled) {
      w = 'right';
      reason = `${L.info.name}撤退`;
    } else if (R.gen.fled) {
      w = 'left';
      reason = `${R.info.name}撤退`;
    } else if (this.timeLeft <= 0) {
      w = 'draw';
      reason = '时间到';
    }
    if (w) {
      this.phase = 'over';
      this.winner = w;
      this.endReason = reason;
    }
  }

  get secondsLeft() {
    return Math.max(0, Math.ceil(this.timeLeft / TICKS_PER_SEC));
  }

  // ---------------------------------------------------------------- render
  render(al: number) {
    const us = this.units;
    for (let i = 0; i < us.length; i++) {
      const u = us[i];
      if (u.state === ST_GONE) continue;
      const x = u.px + (u.x - u.px) * al;
      const y = u.py + (u.y - u.py) * al;
      u.view.position.set(x, y);
      if (u.state !== ST_DEAD) {
        u.view.zIndex = y;
        u.shadow.position.set(x, y);
        if (u.mark) u.mark.position.set(x, y - (u.mounted ? 128 : 104) + Math.sin((this.tick + i) * 0.15) * 2);
      } else if (u.mark) u.mark.visible = false;
    }
    for (const S of this.sides) {
      const g = S.gen;
      if (!g.alive) {
        g.bar.visible = false;
        continue;
      }
      g.bar.clear();
      const k = Math.max(0, g.hp / g.maxHp);
      g.bar.rect(0, 0, 44, 5).fill({ color: 0x000000, alpha: 0.6 }).rect(0.5, 0.5, 43 * k, 4).fill(k > 0.5 ? 0x5ee05a : k > 0.25 ? 0xf0c040 : 0xf04030);
      g.label.alpha = 0.95;
    }
    this.renderArrows(al);
  }

  /** Starts a general's skill cast: invulnerable, charge animation, then `cb`. */
  beginCast(g: General, cb: () => void) {
    g.casting = 40;
    g.invuln = 60;
    g.castCb = cb;
    g.state = ST_CAST;
    g.target = null;
    g.spr.speed = 1;
    if (g.horse) g.horse.speed = 1;
    this.play(g, 'charge', true);
    if (g.light) {
      g.light.visible = true;
      g.light.play('charge', true);
    }
    this.snd(g.female ? 'charge-10' : 'charge-00', g.x, 1);
  }

  /** Living enemy units (soldiers + general + summons) of `side`'s opponent. */
  enemiesOf(side: 0 | 1, out: Unit[]) {
    out.length = 0;
    for (const u of this.units) if (u.side !== side && u.alive && !(u instanceof General && u.fled)) out.push(u);
    return out;
  }

  /** Area damage used by skills. `both` hits soldiers of both sides (never generals of the caster). */
  hitArea(side: 0 | 1, x: number, y: number, rx: number, ry: number, dmg: number, opt: { both?: boolean; burn?: number; knock?: number; genDmg?: number; hitGen?: Set<Unit>; max?: number } = {}) {
    const n = this.query(x, y, rx, ry);
    const q = this.qbuf;
    let hits = 0;
    const list: Unit[] = [];
    for (let i = 0; i < n; i++) {
      const e = q[i];
      if (!e.alive) continue;
      if (e.side === side && (!opt.both || e.kind === K_GEN)) continue;
      const nx = (e.x - x) / rx;
      const ny = (e.y - y) / ry;
      if (nx * nx + ny * ny > 1) continue;
      list.push(e);
    }
    // each strike only catches the few soldiers right under it
    const max = opt.max ?? 3;
    if (list.length > max) {
      list.sort((a, b) => Math.abs(a.x - x) + 2 * Math.abs(a.y - y) - (Math.abs(b.x - x) + 2 * Math.abs(b.y - y)));
      // the general is never shielded by the cap
      const gi = list.findIndex((u) => u.kind === K_GEN);
      if (gi >= max) list[max - 1] = list[gi];
      list.length = max;
    }
    for (const e of list) {
      if (e instanceof General) {
        if (opt.hitGen) {
          if (opt.hitGen.has(e)) continue;
          opt.hitGen.add(e);
        }
        this.damage(e, opt.genDmg ?? dmg * 0.3, null, false);
        if (e.alive && e.state !== ST_ATTACK && e.casting === 0) {
          e.state = ST_HURT;
          this.play(e, 'hurt', true);
        }
      } else {
        const d = dmg * rng.range(0.75, 1.25);
        if (opt.knock) e.kx = (e.x >= x ? 1 : -1) * opt.knock * rng.range(0.5, 1);
        if (opt.burn && d < e.hp) {
          e.burn = opt.burn;
          this.applyTint(e);
        }
        this.damage(e, d, this.sides[side].gen, false);
      }
      hits++;
    }
    return hits;
  }

  /** Spawns extra soldiers for `side` (伏兵/补兵). */
  reinforce(side: 0 | 1, count: number, x: number, y: number) {
    const S = this.sides[side];
    const lo = obj(soldierObject(S.info.soldierType, S.info.advanced, side));
    if (!lo) return;
    const g = S.groups[0];
    for (let i = 0; i < count; i++) {
      const u = this.makeSoldier(side, lo, S.info.soldierType);
      u.horseId = riderlessHorse(S.info.soldierType, S.info.advanced, side);
      u.x = u.px = x + rng.range(-60, 60);
      u.y = u.py = Math.max(FIELD_TOP, Math.min(FIELD_BOT, y + rng.range(-50, 50)));
      u.group = g;
      u.kind = K_SUM; // fights like 全军突击; not counted in results
      u.life = TICKS_PER_SEC * 40;
      this.fx.anim(42033, 'wait', u.x, u.y, { life: 30, fade: 20, scale: 1.2 });
      u.retarget = 0;
    }
  }

  /** Summons a special unit (尸兵/炎兽/井阑) that fights for a while. */
  summon(side: 0 | 1, objId: number, x: number, y: number, o: { hp: number; power: number; life: number; anims?: Partial<Unit['anims']>; range?: number; spd?: number; type?: number }) {
    const lo = obj(objId);
    if (!lo) return null;
    const u = this.makeSoldier(side, lo, o.type ?? 0);
    u.kind = K_SUM;
    u.hp = u.maxHp = o.hp;
    u.power = o.power;
    u.life = o.life;
    u.ranged = false;
    u.mounted = false;
    u.range = o.range ?? 60;
    u.spd = o.spd ?? 1.6;
    u.x = u.px = x;
    u.y = u.py = y;
    Object.assign(u.anims, { wait: 'wait', walk: 'run', attack: 'attack', attack2: 'attack', hurt: 'hurt', defend: 'wait', die: ['die'] }, o.anims ?? {});
    u.spr.play(u.anims.wait, true);
    u.shadow.visible = true;
    return u;
  }

  lockSide(side: 0 | 1, ticks: number) {
    for (const u of this.units) {
      if (u.side !== side || !u.alive) continue;
      if (u instanceof General && u.casting > 0) continue;
      u.lock = ticks;
      if (u.state === ST_ATTACK) {
        u.state = ST_IDLE;
        this.play(u, u.anims.wait, true);
      }
      this.applyTint(u);
    }
  }

  /** Point of highest enemy density for area skills (enemy units of `side`'s opponent). */
  densest(side: 0 | 1): { x: number; y: number } {
    const E = this.sides[side ^ 1];
    const bins = new Float32Array(Math.ceil(W / 100) + 2);
    let any = false;
    for (const u of this.units) {
      if (u.side === side || !u.alive || (u instanceof General && u.fled)) continue;
      const b = Math.max(0, Math.min(bins.length - 1, Math.floor(u.x / 100) + 1));
      bins[b] += u.kind === K_GEN ? 3 : 1;
      any = true;
    }
    if (!any) return { x: E.gen.x, y: E.gen.y };
    let bi = 0;
    for (let i = 1; i < bins.length - 1; i++) if (bins[i - 1] + bins[i] * 1.5 + bins[i + 1] > bins[bi - 1 < 0 ? 0 : bi - 1] + bins[bi] * 1.5 + (bins[bi + 1] ?? 0)) bi = i;
    const cx = (bi - 1) * 100 + 50;
    let sy = 0;
    let n = 0;
    for (const u of this.units) {
      if (u.side === side || !u.alive || Math.abs(u.x - cx) > 160) continue;
      sy += u.y;
      n++;
    }
    return { x: cx, y: n ? sy / n : FIELD_MID };
  }
}

// ------------------------------------------------------------------ objects
export function soldierObject(type: number, advanced: boolean, side: 0 | 1) {
  return 34010 + 10 * type + (advanced ? 100 : 0) + (side === 1 ? 200 : 0);
}
/** riderless horse object for mounted soldier types (or 0) */
export function riderlessHorse(type: number, advanced: boolean, side: 0 | 1) {
  let i = -1;
  if (type === 3) i = advanced ? 2 : 0;
  else if (advanced) i = type === 1 ? 1 : type === 4 ? 3 : type === 5 ? 4 : type === 6 ? 5 : -1;
  return i < 0 ? 0 : 38900 + i + (side === 1 ? 6 : 0);
}

function faceSprite(s: AnimSprite, f: 1 | -1) {
  s.setFacing(f === 1 ? -1 : 1);
}

export { ensureObjects };
export const ST = { IDLE: ST_IDLE, MOVE: ST_MOVE, ATTACK: ST_ATTACK, HURT: ST_HURT, DEAD: ST_DEAD, GONE: ST_GONE, CAST: ST_CAST };
export const KIND = { SOL: K_SOL, GEN: K_GEN, SUM: K_SUM };
