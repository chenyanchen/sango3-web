// 野战 maps: one procedurally designed battlefield per city (map%03d.blk, id =
// city id), in the binary .blk layout src/scenes/field/map.ts parses.
//
// Every map is a walled city (or, for a 关卡, a fortress closing a gorge) in a
// landscape drawn from the city's terrain flavour in geo.ts. Attacker camps
// (marker tiles) sit near the map edge in the directions of the neighbouring
// cities; roads lead from them to the gates. Each map is seeded by the city,
// so the same city always gets the same field.
import { CITIES, NEIGHBORS, CITY, type City } from '../data/geo.ts';
import { rng, hash, type Rng } from '../ink.ts';
import { GFX_INDEX, groundFrames, framesOf, type Cls, type TileDef } from './_tiles.ts';

export type Obj = '' | 'forest' | 'hill' | 'rock' | 'peak' | 'house' | 'castle' | 'wall' | 'gate';
type Flavour = City['terrain'];

/** Terrain attribute numbers (src/game/contracts.ts Terrain) */
const T = { Plain: 1, Grass: 2, Forest: 3, Desert: 4, Water: 5, Snow: 6, Road: 7, SnowMountain: 8, Mountain: 9, Wall: 10, Gate: 11, House: 12, Castle: 13 };
const CLS_ATTR: Record<Cls, number> = { P: T.Plain, G: T.Grass, S: T.Snow, A: T.Water, D: T.Desert, R: T.Road };
const OBJ_ATTR: Partial<Record<Obj, number>> = { forest: T.Forest, hill: T.Mountain, rock: T.Mountain, peak: T.SnowMountain, house: T.House, castle: T.Castle, wall: T.Wall, gate: T.Gate };
/** objects that stand on plain ground (their tile corners are forced to P) */
const ON_PLAIN = new Set<Obj>(['hill', 'rock', 'house', 'castle', 'wall', 'gate']);

// ------------------------------------------------------------------ grid
export class Grid {
  readonly n: number;
  cls: Cls[];
  obj: Obj[];
  marker: boolean[];
  /** explicit frame for structures (walls, gates, castle) */
  gfx: string[];
  constructor(readonly W: number, readonly H: number) {
    this.n = W * H;
    this.cls = Array(this.n).fill('P');
    this.obj = Array(this.n).fill('');
    this.marker = Array(this.n).fill(false);
    this.gfx = Array(this.n).fill('');
  }
  col(i: number) { return i % this.W; }
  row(i: number) { return Math.floor(i / this.W); }
  exists(i: number) { const c = this.col(i); return !(c & 1 && this.row(i) === this.H - 1); }
  u(i: number) { const c = this.col(i); return (c + 2 * this.row(i) + (c & 1)) / 2; }
  v(i: number) { const c = this.col(i); return (2 * this.row(i) + (c & 1) - c) / 2; }
  at(u: number, v: number): number {
    const c = u - v;
    if (c < 0 || c >= this.W) return -1;
    const r = (u + v - (c & 1)) / 2;
    if (r < 0 || r >= this.H || (c & 1 && r === this.H - 1)) return -1;
    return r * this.W + c;
  }
  /** screen centre (px) */
  sx(i: number) { return this.col(i) * 48 + 48; }
  sy(i: number) { return this.row(i) * 36 + (this.col(i) & 1 ? 18 : 0) + 18; }
  get pxW() { return this.W * 48 + 48; }
  get pxH() { return this.H * 36 + 18; }
  edges(i: number): number[] {
    const u = this.u(i), v = this.v(i);
    return [this.at(u + 1, v), this.at(u - 1, v), this.at(u, v + 1), this.at(u, v - 1)].filter((j) => j >= 0);
  }
  around(i: number): number[] {
    const u = this.u(i), v = this.v(i);
    const out: number[] = [];
    for (let du = -1; du <= 1; du++) for (let dv = -1; dv <= 1; dv++) if (du || dv) {
      const j = this.at(u + du, v + dv);
      if (j >= 0) out.push(j);
    }
    return out;
  }
  dist(a: number, b: number) {
    return Math.max(Math.abs(this.u(a) - this.u(b)), Math.abs(this.v(a) - this.v(b)));
  }
  all(): number[] {
    const out: number[] = [];
    for (let i = 0; i < this.n; i++) if (this.exists(i)) out.push(i);
    return out;
  }
  attr(i: number): number {
    return OBJ_ATTR[this.obj[i]] ?? CLS_ATTR[this.cls[i]];
  }
  isEdge(i: number) {
    const c = this.col(i), r = this.row(i);
    return c <= 1 || r <= 0 || c >= this.W - 2 || r >= this.H - 2;
  }
}

// ------------------------------------------------------------------ noise
function noise2(seed: number) {
  const h = (x: number, y: number) => (hash(`${seed}:${x}:${y}`) & 0xffff) / 0xffff;
  const sm = (t: number) => t * t * (3 - 2 * t);
  const vn = (x: number, y: number) => {
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = sm(x - x0), fy = sm(y - y0);
    const a = h(x0, y0), b = h(x0 + 1, y0), c = h(x0, y0 + 1), d = h(x0 + 1, y0 + 1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
  return (x: number, y: number) => (vn(x, y) * 0.6 + vn(x * 2.1 + 17, y * 2.1 + 5) * 0.3 + vn(x * 4.3 + 3, y * 4.3 + 11) * 0.1);
}

// ------------------------------------------------------------------ helpers
/** screen direction → continuous uv direction (normalized) */
function uvDir(dx: number, dy: number): [number, number] {
  const du = (dx / 48 + dy / 18) / 2, dv = (dy / 18 - dx / 48) / 2;
  const l = Math.hypot(du, dv) || 1;
  return [du / l, dv / l];
}

/** cheapest 4-connected path (Dijkstra) with a per-tile cost; Infinity = blocked */
function path(g: Grid, from: number, to: (i: number) => boolean, cost: (i: number) => number): number[] | null {
  const dist = new Float64Array(g.n).fill(Infinity);
  const prev = new Int32Array(g.n).fill(-1);
  dist[from] = 0;
  const open: number[] = [from];
  while (open.length) {
    let bi = 0;
    for (let k = 1; k < open.length; k++) if (dist[open[k]] < dist[open[bi]]) bi = k;
    const cur = open[bi];
    open[bi] = open[open.length - 1];
    open.pop();
    if (to(cur)) {
      const p: number[] = [];
      for (let c = cur; c >= 0; c = prev[c]) p.unshift(c);
      return p;
    }
    for (const j of g.edges(cur)) {
      const c = cost(j);
      if (!Number.isFinite(c)) continue;
      const nd = dist[cur] + c;
      if (nd < dist[j]) {
        if (dist[j] === Infinity) open.push(j);
        dist[j] = nd;
        prev[j] = cur;
      }
    }
  }
  return null;
}

/** tiles reachable by an attacker (8-way like the game, walls/peaks block; gates per flag) */
export function reachable(g: Grid, from: number, gatesOpen: boolean): Set<number> {
  const block = (i: number) => g.obj[i] === 'wall' || g.obj[i] === 'peak' || (!gatesOpen && g.obj[i] === 'gate');
  const seen = new Set<number>([from]);
  const q = [from];
  while (q.length) {
    const cur = q.pop()!;
    const u = g.u(cur), v = g.v(cur);
    for (let du = -1; du <= 1; du++) for (let dv = -1; dv <= 1; dv++) {
      if (!du && !dv) continue;
      const j = g.at(u + du, v + dv);
      if (j < 0 || seen.has(j) || block(j)) continue;
      if (du && dv) {
        // corner step: one of the two shared edge tiles must be open
        const a = g.at(u + du, v), b = g.at(u, v + dv);
        if (!((a >= 0 && !block(a)) || (b >= 0 && !block(b)))) continue;
      }
      seen.add(j);
      q.push(j);
    }
  }
  return seen;
}

// ------------------------------------------------------------------ design
interface Plan {
  city: City;
  r: Rng;
  g: Grid;
  flavour: Flavour;
  pass: boolean;
  /** walled square in uv: [u0,u1]×[v0,v1] (walls on the border) */
  box: [number, number, number, number];
  centre: number;
  gates: number[];
  /** directions (screen, unit vectors) of neighbouring cities */
  dirs: [number, number][];
  snowy: boolean;
}

function neighbourDirs(c: City): [number, number][] {
  return (NEIGHBORS.get(c.name) ?? []).map((n) => {
    const o = CITY.get(n)!;
    const dx = o.x - c.x, dy = o.y - c.y, l = Math.hypot(dx, dy) || 1;
    return [dx / l, dy / l] as [number, number];
  });
}

function mapSize(c: City, r: Rng, vertical: boolean): [number, number] {
  if (c.size === 4) return vertical ? [r.int(30, 32), r.int(38, 40)] : [r.int(44, 46), r.int(24, 26)];
  if (c.size === 1) return [r.int(46, 50), r.int(28, 30)];
  if (c.size === 2) return [r.int(42, 44), r.int(26, 28)];
  return [r.int(38, 40), r.int(24, 26)];
}

export function design(c: City): Grid {
  const r = rng(`field-map:${c.id}:${c.name}`);
  const dirs = neighbourDirs(c);
  // passes: the gorge runs between the two main neighbours
  let vertical = false;
  if (c.size === 4 && dirs.length >= 2) {
    const [a, b] = dirs;
    const ax = a[0] - b[0], ay = a[1] - b[1];
    vertical = Math.abs(ay) > Math.abs(ax) * 0.9;
  }
  const [W, H] = mapSize(c, r, vertical);
  const g = new Grid(W, H);
  // city centre: near the middle of the map
  const cx = g.pxW / 2 + r.range(-0.06, 0.06) * g.pxW, cy = g.pxH / 2 + r.range(-0.05, 0.05) * g.pxH;
  let centre = 0, bd = Infinity;
  for (const i of g.all()) {
    const d = Math.hypot(g.sx(i) - cx, (g.sy(i) - cy) * 2.6);
    if (d < bd) (bd = d), (centre = i);
  }
  const uc = g.u(centre), vc = g.v(centre);
  const [ku, kv] = c.size === 1 ? [4, r.pick([4, 5])] : c.size === 2 ? [r.pick([3, 4]), 3] : [3, r.pick([2, 3])];
  const box: [number, number, number, number] = c.size === 4 ? [uc - 3, uc + 3, vc - 3, vc + 3] : [uc - ku, uc + ku, vc - kv, vc + kv];
  const p: Plan = {
    city: c, r, g, flavour: c.terrain, pass: c.size === 4, box, centre, gates: [], dirs,
    snowy: c.snow === 2 && (c.terrain === 'mountain' || c.terrain === 'hills'),
  };
  landscape(p);
  if (p.pass) gorge(p, vertical);
  const markers = placeMarkers(p, vertical);
  buildCity(p);
  roads(p, markers);
  legalize(p);
  ensureConnected(p, markers);
  for (const m of markers) g.marker[m] = true;
  return g;
}

/** ground classes and natural features by flavour */
function landscape(p: Plan) {
  const { g, r, flavour } = p;
  const s = hash(p.city.name);
  const nA = noise2(s + 1), nB = noise2(s + 2), nC = noise2(s + 3), nD = noise2(s + 4);
  const [u0, u1, v0, v1] = p.box;
  const uc = (u0 + u1) / 2, vc = (v0 + v1) / 2;
  const near = (i: number, m: number) => g.u(i) >= u0 - m && g.u(i) <= u1 + m && g.v(i) >= v0 - m && g.v(i) <= v1 + m;
  // water bodies
  const water = new Set<number>();
  const awayDir = (): [number, number] => {
    // the direction with no neighbouring city (largest angular gap)
    const angs = p.dirs.map(([x, y]) => Math.atan2(y, x)).sort((a, b) => a - b);
    if (!angs.length) return [1, 0];
    let best = 0, gap = -1;
    for (let k = 0; k < angs.length; k++) {
      const a = angs[k], b = k + 1 < angs.length ? angs[k + 1] : angs[0] + Math.PI * 2;
      if (b - a > gap) (gap = b - a), (best = (a + b) / 2);
    }
    return [Math.cos(best), Math.sin(best)];
  };
  if (flavour === 'coast') {
    const [dx, dy] = awayDir();
    const [du, dv] = uvDir(dx, dy);
    for (const i of g.all()) {
      const d = (g.u(i) - uc) * du + (g.v(i) - vc) * dv;
      const lim = Math.max(u1 - uc, v1 - vc) + 4 + (nA(g.u(i) / 4, g.v(i) / 4) - 0.5) * 5;
      if (d > lim) water.add(i);
    }
  } else if (flavour === 'lake') {
    const [dx, dy] = awayDir();
    const [du, dv] = uvDir(dx, dy);
    const off = Math.max(u1 - uc, v1 - vc) + r.range(5, 7);
    const lu = uc + du * off, lv = vc + dv * off;
    const ra = r.range(4, 6), rb = r.range(3, 4.5), rot = r.range(0, Math.PI);
    for (const i of g.all()) {
      const x = g.u(i) - lu, y = g.v(i) - lv;
      const a = x * Math.cos(rot) + y * Math.sin(rot), b = -x * Math.sin(rot) + y * Math.cos(rot);
      const d = Math.hypot(a / ra, b / rb) + (nB(g.u(i) / 3, g.v(i) / 3) - 0.5) * 0.5;
      if (d < 1) water.add(i);
    }
  }
  if (flavour === 'river' || flavour === 'lake' || flavour === 'jungle') {
    // a river (or a stream) sweeping past the city
    const ang = r.range(0, Math.PI);
    const tu = Math.cos(ang), tv = Math.sin(ang); // direction along the river (uv)
    const nu = -tv, nv = tu;
    const side = r.chance(0.5) ? 1 : -1;
    const half = flavour === 'river' ? 1.15 : 0.8;
    const off = side * (Math.max(u1 - uc, v1 - vc) * 1.45 + 3.2);
    const amp = r.range(1, 2.2), fr = r.range(0.12, 0.2), ph = r.range(0, 6);
    for (const i of g.all()) {
      const x = g.u(i) - uc, y = g.v(i) - vc;
      const along = x * tu + y * tv, across = x * nu + y * nv;
      const centreLine = off + Math.sin(along * fr + ph) * amp;
      if (Math.abs(across - centreLine) <= half) water.add(i);
    }
  }
  for (const i of g.all()) {
    const u = g.u(i), v = g.v(i);
    const a = nA(u / 5.5, v / 5.5), b = nB(u / 4.2, v / 4.2), cN = nC(u / 4.5, v / 4.5), d = nD(u / 6, v / 6);
    let cls: Cls = 'P';
    let obj: Obj = '';
    switch (flavour) {
      case 'plain':
        if (a > 0.56) cls = 'G';
        if (b > 0.66) obj = 'forest';
        if (cN > 0.74) obj = 'hill';
        break;
      case 'hills':
        if (a > 0.44) cls = 'G';
        if (b > 0.6) obj = 'forest';
        if (cN > 0.6) obj = 'hill';
        if (cN > 0.72) obj = 'rock';
        break;
      case 'mountain':
        if (a > 0.5) cls = 'G';
        if (b > 0.62) obj = 'forest';
        if (cN > 0.56) obj = 'rock';
        if (cN > 0.66) obj = 'hill';
        if (cN > 0.73) obj = 'peak';
        break;
      case 'river':
      case 'lake':
      case 'coast':
        if (a > 0.46) cls = 'G';
        if (b > 0.68) obj = 'forest';
        if (cN > 0.77) obj = 'hill';
        break;
      case 'desert':
        if (a > 0.36) cls = 'D';
        if (cN > 0.7) obj = 'rock';
        if (cN > 0.8) obj = 'peak';
        if (b > 0.8 && a < 0.3) obj = 'forest';
        break;
      case 'jungle':
        if (a > 0.3) cls = 'G';
        if (b > 0.52) obj = 'forest';
        if (cN > 0.72) obj = 'hill';
        break;
    }
    if (p.snowy && d > 0.55 && cls !== 'D') cls = 'S';
    if (water.has(i)) (cls = 'A'), (obj = '');
    // the city and a clear glacis around it
    if (near(i, 2)) {
      obj = '';
      if (cls === 'A' || cls === 'S' || cls === 'D') cls = 'P';
      if (near(i, 0)) cls = 'P';
    } else if (near(i, 3) && (obj === 'peak' || obj === 'rock')) obj = '';
    g.cls[i] = cls;
    g.obj[i] = obj;
  }
  // mountain basins: a broken ring of mountains around the city
  if (flavour === 'mountain' && !p.pass) {
    for (const i of g.all()) {
      if (g.cls[i] === 'A' || near(i, 3)) continue;
      const dx = (g.sx(i) - g.pxW / 2) / (g.pxW / 2), dy = (g.sy(i) - g.pxH / 2) / (g.pxH / 2);
      const rr = Math.hypot(dx, dy) + (nB(g.u(i) / 3, g.v(i) / 3) - 0.5) * 0.35;
      if (rr > 0.62 && rr < 0.9) g.obj[i] = rr > 0.7 && rr < 0.82 ? 'peak' : 'rock';
    }
  }
}

/** 关卡: impassable mountains on both sides of a gorge; the fortress closes it */
function gorge(p: Plan, vertical: boolean) {
  const { g } = p;
  const s = hash(p.city.name + 'gorge');
  const nA = noise2(s), nB = noise2(s + 9);
  const [u0, u1, v0, v1] = p.box;
  const inFort = (i: number) => g.u(i) >= u0 && g.u(i) <= u1 && g.v(i) >= v0 && g.v(i) <= v1;
  const fx = g.sx(p.centre), fy = g.sy(p.centre);
  for (const i of g.all()) {
    if (inFort(i)) continue;
    const x = g.sx(i) - fx, y = g.sy(i) - fy;
    // distance across / along the gorge, in tiles
    const across = vertical ? Math.abs(x) / 96 : Math.abs(y) / 36;
    const along = vertical ? Math.abs(y) / 36 : Math.abs(x) / 96;
    const wob = (nA(g.u(i) / 4, g.v(i) / 4) - 0.5) * 2.2;
    const halfW = (vertical ? 3.4 : 4.6) + Math.min(vertical ? 1 : 2.5, along * (vertical ? 0.08 : 0.25)) + wob;
    let obj: Obj = g.obj[i];
    if (across > halfW + (vertical ? 1.3 : 2.2)) obj = 'peak';
    else if (across > halfW) { const k = nB(g.u(i) / 2, g.v(i) / 2); obj = k > 0.6 ? 'rock' : k > 0.36 ? 'hill' : k > 0.25 ? 'forest' : ''; }
    else if (obj === 'peak') obj = 'rock';
    // the fortress seals the gorge: peaks right up to its corners
    if (along < (vertical ? 2.5 : 1.6) && across > 0.5) obj = 'peak';
    if (obj !== g.obj[i]) {
      g.obj[i] = obj;
      if (obj === 'peak' || obj === 'rock' || obj === 'hill') g.cls[i] = g.cls[i] === 'A' ? 'P' : g.cls[i];
    }
  }
}

/** attacker camps: near the map edge, towards the neighbouring cities */
function placeMarkers(p: Plan, vertical: boolean): number[] {
  const { g } = p;
  const cx = g.sx(p.centre), cy = g.sy(p.centre);
  let dirs: [number, number][];
  if (p.pass) dirs = vertical ? [[0, -1], [0, 1]] : [[-1, 0], [1, 0]];
  else {
    // 45° bins: the neighbours' bins, then fill to at least 5 well spread bins
    const bins = new Set<number>();
    for (const [x, y] of p.dirs) bins.add(((Math.round(Math.atan2(y, x) / (Math.PI / 4)) % 8) + 8) % 8);
    const order = [0, 4, 2, 6, 1, 5, 3, 7];
    for (const b of order) if (bins.size < 5 && ![...bins].some((x) => Math.min((x - b + 8) % 8, (b - x + 8) % 8) < 2)) bins.add(b);
    for (const b of order) if (bins.size < 5) bins.add(b);
    dirs = [...bins].map((b) => [Math.cos((b * Math.PI) / 4), Math.sin((b * Math.PI) / 4)]);
  }
  const out: number[] = [];
  for (const [dx, dy] of dirs) {
    // walk outwards to the inset border
    const mx = 3 * 48 + 48, my = 2 * 36 + 18;
    let t = 0;
    while (true) {
      const x = cx + dx * (t + 8), y = cy + dy * (t + 8) * 0.42;
      if (x < mx || x > g.pxW - mx || y < my || y > g.pxH - my) break;
      t += 8;
    }
    const tx = cx + dx * t, ty = cy + dy * t * 0.42;
    let best = -1, bd = Infinity;
    for (const i of g.all()) {
      if (g.isEdge(i) || g.cls[i] === 'A' || g.obj[i] === 'peak') continue;
      if (g.row(i) < 2 || g.row(i) > g.H - 3 || g.col(i) < 2 || g.col(i) > g.W - 3) continue;
      const d = Math.hypot(g.sx(i) - tx, (g.sy(i) - ty) * 2.4);
      if (d < bd) (bd = d), (best = i);
    }
    if (best < 0 || out.some((o) => g.dist(o, best) < 6)) continue;
    out.push(best);
  }
  // clear the camp grounds
  for (const m of out) {
    const clear = [m, ...g.around(m)];
    for (const i of clear) {
      if (g.obj[i] === 'forest' || g.obj[i] === 'peak' || g.obj[i] === 'rock' || g.obj[i] === 'hill') g.obj[i] = '';
      if (g.cls[i] === 'A' || g.cls[i] === 'S') g.cls[i] = 'P';
    }
    g.cls[m] = 'P';
  }
  return out;
}

/** walls, gates, streets, houses and the 主城 */
function buildCity(p: Plan) {
  const { g, r, city } = p;
  const [u0, u1, v0, v1] = p.box;
  const style = city.size <= 2 ? 'A' : 'B';
  const uc = g.u(p.centre), vc = g.v(p.centre);
  const name = (pred: (d: TileDef) => boolean) => framesOf(pred)[0];
  const set = (u: number, v: number, obj: Obj, gfx: string, cls: Cls = 'P') => {
    const i = g.at(u, v);
    if (i < 0) return;
    g.obj[i] = obj;
    g.gfx[i] = gfx;
    g.cls[i] = cls;
  };
  // which walls get a gate: big cities all four; others towards the attackers
  const sides: { key: 'u0' | 'u1' | 'v0' | 'v1'; dx: number; dy: number }[] = [
    { key: 'v0', dx: 1, dy: -1 }, // top-right wall (runs along u at v = v0)
    { key: 'u1', dx: 1, dy: 1 }, // bottom-right (along v at u = u1)
    { key: 'v1', dx: -1, dy: 1 }, // bottom-left
    { key: 'u0', dx: -1, dy: -1 }, // top-left
  ];
  const want = city.size === 1 ? 4 : city.size === 2 ? 3 : 2;
  let chosen: typeof sides;
  if (p.pass) {
    // the gates face both ends of the gorge: horizontal → left (u0 | v1) and right (v0 | u1);
    // vertical → top (u0 | v0) and bottom (u1 | v1)
    const [v0s, u1s, v1s, u0s] = sides;
    chosen = g.pxH > g.pxW ? [r.pick([u0s, v0s]), r.pick([u1s, v1s])] : [r.pick([u0s, v1s]), r.pick([v0s, u1s])];
  } else {
    const score = (s: (typeof sides)[number]) => Math.max(...p.dirs.map(([x, y]) => (x * s.dx * 0.94 + y * s.dy * 0.35)), -1);
    chosen = [...sides].sort((a, b) => score(b) - score(a)).slice(0, want);
  }
  const isGateSide = (k: string) => chosen.some((s) => s.key === k);
  // walls
  for (let u = u0; u <= u1; u++) for (let v = v0; v <= v1; v++) {
    const onU = u === u0 || u === u1, onV = v === v0 || v === v1;
    if (!onU && !onV) continue;
    if (onU && onV) {
      const corner = u === u0 ? (v === v0 ? 'top' : 'left') : v === v0 ? 'right' : 'bottom';
      set(u, v, 'wall', name((d) => d.kind === 'corner' && d.style === style && d.corner === corner && !d.ruined));
    } else if (onV) set(u, v, 'wall', name((d) => d.kind === 'wall' && d.style === style && d.dir === 'u' && !d.ruined));
    else set(u, v, 'wall', name((d) => d.kind === 'wall' && d.style === style && d.dir === 'v' && !d.ruined));
  }
  const gatePiece = (dir: 'u' | 'v', part: 'lo' | 'gate' | 'hi') =>
    name((d) => d.kind === 'gate' && d.style === style && d.dir === dir && d.part === part && !d.ruined);
  for (const s of sides) {
    if (!isGateSide(s.key)) continue;
    if (s.key === 'v0' || s.key === 'v1') {
      const v = s.key === 'v0' ? v0 : v1;
      set(uc - 1, v, 'wall', gatePiece('u', 'lo'));
      set(uc, v, 'gate', gatePiece('u', 'gate'));
      set(uc + 1, v, 'wall', gatePiece('u', 'hi'));
      p.gates.push(g.at(uc, v));
    } else {
      const u = s.key === 'u0' ? u0 : u1;
      set(u, vc - 1, 'wall', gatePiece('v', 'lo'));
      set(u, vc, 'gate', gatePiece('v', 'gate'));
      set(u, vc + 1, 'wall', gatePiece('v', 'hi'));
      p.gates.push(g.at(u, vc));
    }
  }
  // interior: streets on the cross through the centre, houses, gardens
  const big = u1 - u0 >= 8;
  for (let u = u0 + 1; u < u1; u++) for (let v = v0 + 1; v < v1; v++) {
    const i = g.at(u, v);
    if (i < 0) continue;
    const street = u === uc || v === vc || (big && (u === u0 + 1 || v === v0 + 1 || u === u1 - 1 || v === v1 - 1) && (Math.abs(u - uc) <= 1 || Math.abs(v - vc) <= 1));
    const plaza = Math.abs(u - uc) + Math.abs(v - vc) <= 1;
    g.obj[i] = '';
    g.cls[i] = street ? 'R' : 'P';
    if (plaza) g.cls[i] = 'R';
    if (!street && !plaza) {
      const k = r.next();
      if (k < (p.pass ? 0.5 : 0.8)) g.obj[i] = 'house';
      else if (k < 0.8) g.cls[i] = 'P';
      else g.cls[i] = 'P';
    }
  }
  set(uc, vc, 'castle', r.pick(framesOf((d) => d.kind === 'castle')));
  // keep the inner side of each gate open
  for (const gi of p.gates) for (const j of g.around(gi)) if (g.obj[j] === 'house') g.obj[j] = '';
}

/** roads from the camps to the nearest gate (4-connected so they read as one band) */
function roads(p: Plan, markers: number[]) {
  const { g } = p;
  const [u0, u1, v0, v1] = p.box;
  const inside = (i: number) => g.u(i) >= u0 && g.u(i) <= u1 && g.v(i) >= v0 && g.v(i) <= v1;
  // the tile just outside each gate
  const outsideOf = (gi: number) => g.edges(gi).find((j) => !inside(j)) ?? gi;
  const doors = p.gates.map(outsideOf);
  const cost = (i: number) => {
    if (inside(i)) return Infinity;
    const o = g.obj[i];
    if (o === 'peak') return 40;
    if (o === 'rock' || o === 'hill') return 5;
    if (o === 'forest') return 3;
    if (g.cls[i] === 'A') return 8;
    if (g.cls[i] === 'R') return 0.5;
    if (g.around(i).some((j) => g.cls[j] === 'A')) return 4;
    return 1 + ((hash(`${i}`) & 7) / 7) * 0.6;
  };
  for (const m of markers) {
    if (!doors.length) break;
    const target = doors.slice().sort((a, b) => g.dist(a, m) - g.dist(b, m))[0];
    const pth = path(g, m, (i) => i === target, cost);
    if (!pth) continue;
    for (const i of pth) {
      if (g.obj[i] === 'peak' || g.obj[i] === 'rock' || g.obj[i] === 'hill' || g.obj[i] === 'forest') g.obj[i] = '';
      if (g.cls[i] !== 'A') g.cls[i] = 'R';
    }
  }
}

/** keeps every tile's corner classes a legal pair (X with plain only) */
function legalize(p: Plan) {
  const { g } = p;
  const prio: Record<Cls, number> = { P: 0, G: 1, D: 2, S: 3, R: 4, A: 5 };
  for (let pass = 0; pass < 3; pass++) {
    // lone water tiles would be invisible: drop them
    for (const i of g.all()) {
      if (g.cls[i] !== 'A') continue;
      if (g.around(i).filter((j) => g.cls[j] === 'A').length < 2) g.cls[i] = 'P';
    }
    for (const i of g.all()) {
      const a = g.cls[i];
      if (a === 'P') continue;
      for (const j of g.around(i)) {
        const b = g.cls[j];
        if (b === 'P' || b === a) continue;
        // structures keep their ground; otherwise the weaker class yields
        const lose = g.gfx[i] ? j : g.gfx[j] ? i : prio[a] < prio[b] ? i : j;
        g.cls[lose] = 'P';
        if (lose === i) break;
      }
    }
    // forests stand in grass: all 8 neighbours must be grass (or forest)
    for (const i of g.all()) {
      if (g.obj[i] !== 'forest') continue;
      g.cls[i] = 'G';
      for (const j of g.around(i)) {
        if (g.cls[j] === 'G' && !ON_PLAIN.has(g.obj[j])) continue;
        if (g.cls[j] === 'P' && !g.gfx[j] && !ON_PLAIN.has(g.obj[j]) && g.obj[j] !== 'peak' && !g.around(j).some((k) => g.cls[k] !== 'P' && g.cls[k] !== 'G')) g.cls[j] = 'G';
        else if (g.obj[j] !== 'peak') {
          g.obj[i] = '';
          break;
        }
      }
    }
  }
}

/** every camp must reach the 主城 (through the gates) */
function ensureConnected(p: Plan, markers: number[]) {
  const { g } = p;
  const castle = g.obj.indexOf('castle');
  for (const m of markers) {
    if (reachable(g, m, true).has(castle)) continue;
    // carve through the cheapest blocking mountains
    const pth = path(g, m, (i) => reachable(g, i, true).has(castle) || i === castle, (i) => (g.obj[i] === 'wall' ? Infinity : g.obj[i] === 'peak' ? 30 : 1));
    for (const i of pth ?? []) if (g.obj[i] === 'peak') g.obj[i] = 'rock';
  }
}

// ------------------------------------------------------------------ graphics
/** corner vertex class: see _tiles.ts. Vertex (a,b) touches tiles (a-1,b-1) (a,b-1) (a-1,b) (a,b). */
function vertexClass(g: Grid, a: number, b: number): Cls {
  const ts = [g.at(a - 1, b - 1), g.at(a, b - 1), g.at(a - 1, b), g.at(a, b)].filter((i) => i >= 0 && g.obj[i] !== 'peak');
  if (ts.some((i) => ON_PLAIN.has(g.obj[i]))) return 'P';
  if (ts.some((i) => g.obj[i] === 'forest')) return 'G';
  const cnt = new Map<Cls, number>();
  for (const i of ts) if (g.cls[i] !== 'P') cnt.set(g.cls[i], (cnt.get(g.cls[i]) ?? 0) + 1);
  let best: Cls = 'P', bn = 1, tie = false;
  for (const [k, n] of cnt) {
    if (n > bn) (best = k), (bn = n), (tie = false);
    else if (n === bn && n >= 2) tie = true;
  }
  return tie ? 'P' : best;
}

export interface Rec { kind: number; attr: number; near: number; pos: number; variant: number; terrain: number; marker: number; gfx: number }

export function render(g: Grid, seed: string, forests: string[]): Rec[] {
  const r = rng(seed);
  const recs: Rec[] = Array(g.n);
  const pickVar = (i: number, list: string[]) => list[hash(`${seed}:${i}`) % list.length];
  for (const i of g.all()) {
    const u = g.u(i), v = g.v(i);
    const terrain = g.attr(i);
    let name = g.gfx[i];
    let kind = 1, near = terrain, pos = 0;
    if (!name) {
      const o = g.obj[i];
      if (o === 'forest') name = pickVar(i, forests);
      else if (o === 'hill') name = pickVar(i, framesOf((d) => d.kind === 'hill'));
      else if (o === 'rock') name = pickVar(i, framesOf((d) => d.kind === 'rock'));
      else if (o === 'peak') name = pickVar(i, framesOf((d) => d.kind === 'peak' && (hash(`${seed}:pk:${i}`) % 5 < 2) === (d.variant < 4)));
      else if (o === 'house') name = pickVar(i, framesOf((d) => d.kind === 'house'));
      else {
        const cs = [vertexClass(g, u, v), vertexClass(g, u + 1, v), vertexClass(g, u + 1, v + 1), vertexClass(g, u, v + 1)];
        const other = cs.filter((c) => c !== 'P');
        let x: Cls = 'P';
        if (other.length) {
          // majority non-plain class (more than one only on rare conflicts)
          const cnt = new Map<Cls, number>();
          for (const c of other) cnt.set(c, (cnt.get(c) ?? 0) + 1);
          x = [...cnt].sort((a, b) => b[1] - a[1])[0][0];
        }
        let m = 0;
        cs.forEach((c, k) => c === x && x !== 'P' && (m |= 1 << k));
        name = pickVar(i, groundFrames(x, m));
        kind = m === 0 || m === 15 ? 1 : 0;
        near = CLS_ATTR[x];
        pos = m;
      }
    } else kind = 2;
    const gi = GFX_INDEX.get(name);
    if (!gi) throw new Error(`field map: unknown frame ${name}`);
    recs[i] = { kind, attr: terrain, near, pos, variant: r.int(0, 4), terrain, marker: g.marker[i] ? 1 : 0, gfx: gi };
  }
  return recs;
}

export function encode(g: Grid, recs: Rec[]): Uint8Array {
  const n = g.W * g.H - Math.floor(g.W / 2);
  const out = new Uint8Array(15 + n * 8);
  out.set([...'BlkData'].map((c) => c.charCodeAt(0)), 0);
  const dv = new DataView(out.buffer);
  dv.setUint32(7, g.W, true);
  dv.setUint32(11, g.H, true);
  let o = 15;
  for (let c = 0; c < g.W; c++) {
    const h = c & 1 ? g.H - 1 : g.H;
    for (let rr = 0; rr < h; rr++) {
      const t = recs[rr * g.W + c];
      out.set([t.kind, t.attr, t.near, t.pos, t.variant, t.terrain, t.marker, t.gfx], o);
      o += 8;
    }
  }
  return out;
}

export function buildMap(c: City): { grid: Grid; bytes: Uint8Array } {
  const styles: string[] = c.terrain === 'jungle' ? ['jungle'] : c.snow === 2 ? ['pine', 'temperate'] : c.terrain === 'lake' || c.terrain === 'river' ? ['temperate', 'willow'] : c.snow === 1 ? ['temperate', 'pine'] : ['temperate'];
  const forests = framesOf((d) => d.kind === 'forest' && styles.includes(d.style));
  const grid = design(c);
  return { grid, bytes: encode(grid, render(grid, `field-gfx:${c.id}`, forests)) };
}

export function maps(): Record<string, Uint8Array> {
  const out: Record<string, Uint8Array> = {};
  for (const c of CITIES) out[`map${String(c.id).padStart(3, '0')}.blk`] = buildMap(c).bytes;
  return out;
}

