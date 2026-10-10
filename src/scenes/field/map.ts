// 野战 tactical map: parser for the original Map/MapNNN.blk files and grid
// geometry helpers.
//
// .blk format (reverse-engineered, little endian):
//   0  char[7]  "BlkData"
//   7  u32      W  number of tile columns
//   11 u32      H  number of tile rows
//   15 rec[N]   N = W*H - W/2, 8 bytes per tile, stored column by column:
//               even columns hold H tiles, odd columns H-1 tiles (the map is a
//               "staggered" isometric layout where odd columns are shifted down
//               by half a tile).
//   rec: u8 kind      SFMap.ini [terrain] block type (0 transition, 1 fill, 2 wall/gate)
//        u8 attr      terrain attribute of the [terrain] definition (main)
//        u8 near      neighbouring attribute of the definition
//        u8 pos       position code inside the definition (c/b/u/d/l/r/ul…)
//        u8 variant   random variant index within the block
//        u8 terrain   effective terrain attribute 1..13 (Terrain enum) — used for rules
//        u8 marker    1 = entry point (营寨 / camp location), 0 otherwise
//        u8 graphic   index into SFMap.ini [graphics] → Shape/SF/Map/<name>.shp
//
// Tiles are 96×36 diamonds (shape anchor 48,18). Screen position of tile
// (c, r): x = c*48, y = r*36 + (c odd ? 18 : 0).
import { assetUrl } from '../../engine/assets';
import { db } from '../../data/db';

export const TW = 96;
export const TH = 36;
export const HALF_W = 48;
export const HALF_H = 18;

export interface Tile {
  terrain: number; // 1..13, 0 = outside the map
  gfx: string; // shape frame name in sf/map
  marker: boolean;
  kind: number;
}

export class FieldMap {
  readonly tiles: Tile[];
  constructor(
    readonly id: number,
    readonly w: number,
    readonly h: number,
    tiles: Tile[],
  ) {
    this.tiles = tiles;
  }
  idx(c: number, r: number) {
    return r * this.w + c;
  }
  col(i: number) {
    return i % this.w;
  }
  row(i: number) {
    return Math.floor(i / this.w);
  }
  valid(c: number, r: number) {
    return c >= 0 && c < this.w && r >= 0 && r < this.h && this.tiles[r * this.w + c].terrain > 0;
  }
  terrain(i: number) {
    return this.tiles[i]?.terrain ?? 0;
  }
  /** screen centre of tile i (world px) */
  sx(i: number) {
    return this.col(i) * HALF_W + HALF_W;
  }
  sy(i: number) {
    const c = this.col(i);
    return this.row(i) * TH + (c & 1 ? HALF_H : 0) + HALF_H;
  }
  get pxW() {
    return this.w * HALF_W + HALF_W;
  }
  get pxH() {
    return this.h * TH + HALF_H;
  }
  /** isometric axes: edge-neighbours differ by 1 in exactly one of u/v */
  u(i: number) {
    const c = this.col(i);
    return (c + 2 * this.row(i) + (c & 1)) / 2;
  }
  v(i: number) {
    const c = this.col(i);
    return (2 * this.row(i) + (c & 1) - c) / 2;
  }
  fromUV(u: number, v: number): number {
    const c = u - v;
    const s = u + v; // = 2r + (c&1)
    if (c < 0 || c >= this.w) return -1;
    const r = (s - (c & 1)) / 2;
    if (!Number.isInteger(r) || !this.valid(c, r)) return -1;
    return r * this.w + c;
  }
  /** Chebyshev distance in iso space (1 = any of the 8 surrounding tiles). */
  dist(a: number, b: number) {
    return Math.max(Math.abs(this.u(a) - this.u(b)), Math.abs(this.v(a) - this.v(b)));
  }
  /** 4 edge-sharing neighbours */
  edges(i: number): number[] {
    const u = this.u(i), v = this.v(i);
    const out: number[] = [];
    for (const [du, dv] of EDGE) {
      const j = this.fromUV(u + du, v + dv);
      if (j >= 0) out.push(j);
    }
    return out;
  }
  /** 4 corner-touching neighbours */
  corners(i: number): number[] {
    const u = this.u(i), v = this.v(i);
    const out: number[] = [];
    for (const [du, dv] of CORNER) {
      const j = this.fromUV(u + du, v + dv);
      if (j >= 0) out.push(j);
    }
    return out;
  }
  around(i: number): number[] {
    return [...this.edges(i), ...this.corners(i)];
  }
  /** tile index at a world position (px), or -1 */
  pick(x: number, y: number): number {
    // nearest diamond centre among candidate columns
    let best = -1;
    let bd = Infinity;
    const c0 = Math.floor((x - HALF_W) / HALF_W);
    for (let c = c0 - 1; c <= c0 + 2; c++) {
      if (c < 0 || c >= this.w) continue;
      const r = Math.round((y - HALF_H - (c & 1 ? HALF_H : 0)) / TH);
      for (let rr = r - 1; rr <= r + 1; rr++) {
        if (!this.valid(c, rr)) continue;
        const i = rr * this.w + c;
        const dx = Math.abs(x - this.sx(i)) / HALF_W;
        const dy = Math.abs(y - this.sy(i)) / HALF_H;
        const d = dx + dy; // diamond metric
        if (d < bd) {
          bd = d;
          best = i;
        }
      }
    }
    return bd <= 1.15 ? best : -1;
  }
  find(pred: (t: Tile, i: number) => boolean): number[] {
    const out: number[] = [];
    this.tiles.forEach((t, i) => t.terrain && pred(t, i) && out.push(i));
    return out;
  }
}

const EDGE = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;
const CORNER = [
  [1, 1],
  [-1, -1],
  [1, -1],
  [-1, 1],
] as const;

let graphics: Record<number, string> | null = null;
function graphicNames(): Record<number, string> {
  if (!graphics) {
    graphics = {};
    const sec = db.raw.SFMap.find((s) => s._ === 'graphics') ?? { _: '' };
    for (const [k, v] of Object.entries(sec)) {
      if (k === '_') continue;
      graphics[+k] = String(Array.isArray(v) ? v[0] : v).toLowerCase().replace(/\.shp$/, '');
    }
  }
  return graphics;
}

export function parseBlk(id: number, buf: ArrayBuffer): FieldMap {
  const b = new Uint8Array(buf);
  const dv = new DataView(buf);
  const magic = String.fromCharCode(...b.slice(0, 7));
  if (magic !== 'BlkData') throw new Error(`map${id}: bad blk header`);
  const w = dv.getUint32(7, true);
  const h = dv.getUint32(11, true);
  const gn = graphicNames();
  const tiles: Tile[] = Array.from({ length: w * h }, () => ({ terrain: 0, gfx: '', marker: false, kind: 0 }));
  let p = 15;
  for (let c = 0; c < w; c++) {
    const n = c & 1 ? h - 1 : h;
    for (let r = 0; r < n; r++) {
      if (p + 8 > b.length) break;
      const t = tiles[r * w + c];
      t.kind = b[p];
      t.terrain = b[p + 5] || 1;
      t.marker = b[p + 6] === 1;
      t.gfx = gn[b[p + 7]] ?? 'plane001';
      p += 8;
    }
  }
  return new FieldMap(id, w, h, tiles);
}

const cache = new Map<number, Promise<FieldMap>>();
export function loadMap(id: number): Promise<FieldMap> {
  let p = cache.get(id);
  if (!p) {
    p = (async () => {
      const r = await fetch(assetUrl(`map/map${String(id).padStart(3, '0')}.blk`));
      if (!r.ok) throw new Error(`map ${id} missing`);
      return parseBlk(id, await r.arrayBuffer());
    })();
    // don't remember failures (a transient network error would break this map for good)
    p.catch(() => cache.delete(id));
    cache.set(id, p);
  }
  return p;
}

export const TERRAIN_NAME = ['', '平地', '草原', '森林', '沙漠', '水区', '雪地', '街道', '雪山', '山地', '城墙', '城门', '房舍', '主城'];
