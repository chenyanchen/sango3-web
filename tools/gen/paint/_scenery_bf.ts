// 百人战 battlefield backgrounds (bf/bg): per set NN and time of day v
// (1 day, 2 dusk, 3 night):
//   NNv-3  sky, 800×120, opaque; stretched to fill everything above the horizon
//   NNv-2  far strip, 1000 wide, transparent above its anchor row (= horizon)
//   NNv-1  near strip, 1200 wide, bottom = horizon (faster parallax)
//   groundNNv  512×512 seamless tile for the battlefield floor
// Sets follow src/scenes/battle/rules.ts bgForTerrain: 01 plain, 02 grassland,
// 03 forest, 04 mountains, 05 desert, 06 river (on deck), 07 snow, 09 city wall,
// 11 town; 08/10/12/13 are extra sets (river valley, camp, wasteland, pass).
import sharp from 'sharp';
import type { FrameJob, PaintOut } from '../types.ts';
import {
  army, blob, brush, C, Doc, f2, flag, gate, hills, house, leafTree, mist, mix, pagoda, path, pine, range, ripples, rng, ship, tent, tower, treeLine, wall,
  type Rng,
} from './_scenery_kit.ts';

interface Pal {
  v: number;
  sky: [string, string, string];
  cloud: string;
  far: string;
  mid: string;
  ink: string;
  face: string;
  flag: string;
  flag2: string;
  /** horizon haze colour (mist that melts into the sky) */
  haze: string;
  leaf: string;
  snow: string;
  water: string;
}

function pal(v: number): Pal {
  if (v === 2)
    return {
      v, sky: ['#6e5a5e', '#c99a6c', '#efc98a'], cloud: '#8a5a48', far: '#6a4c48', mid: '#4a3430', ink: '#24170f', face: '#c9a27a',
      flag: '#a8321f', flag2: '#2f3f5c', haze: '#e9bf86', leaf: '#3b3020', snow: '#efd7b4', water: '#b98a66',
    };
  if (v === 3)
    return {
      v, sky: ['#0e1424', '#1f2c46', '#3d4d6c'], cloud: '#56688a', far: '#24304a', mid: '#18202f', ink: '#080b12', face: '#4d5770',
      flag: '#6e2a26', flag2: '#22304a', haze: '#3a4a68', leaf: '#101622', snow: '#a9b4c8', water: '#2c3a56',
    };
  return {
    v: 1, sky: ['#d9d6c6', '#ebe4d0', '#f3ecd9'], cloud: '#b9b4a4', far: '#7d8790', mid: '#4f5258', ink: C.ink, face: '#e3d6b8',
    flag: C.cinnabar, flag2: C.indigo, haze: '#efe7d3', leaf: '#2e3a2a', snow: '#f7f3ea', water: '#a9b6b4',
  };
}

/** ground base colour per set / time */
const GROUND: Record<string, string> = {
  plain: '#d5c6a2', grass: '#c6c8a2', forest: '#b2ae86', rock: '#cbc0a6', sand: '#dfcb9e', deck: '#a77a4e',
  snow: '#efede6', earth: '#cfb88f', paving: '#c9bfa7', camp: '#cdbb93', waste: '#cdb48a',
};
function groundTone(kind: string, v: number) {
  const b = GROUND[kind];
  if (v === 2) return mix(mix(b, '#c06a32', 0.2), '#3a2418', 0.12);
  if (v === 3) return mix(b, '#24324f', kind === 'snow' ? 0.5 : 0.6);
  return b;
}

type Layer = (d: Doc, r: Rng, w: number, h: number, ay: number, P: Pal) => string;
interface Theme {
  ground: string;
  far: Layer;
  near: Layer;
  /** sky extras: dust (desert), overcast (snow) */
  sky?: 'dust' | 'overcast' | 'clear';
}

// ------------------------------------------------------------------ helpers
const op = (a: number) => ` opacity="${f2(a)}"`;

/** sun (dusk) / moon (night) placed in the far strip above the mountains */
function luminary(d: Doc, r: Rng, w: number, ay: number, P: Pal) {
  if (P.v === 1) return '';
  const x = r.range(w * 0.15, w * 0.85);
  if (P.v === 2) {
    const y = ay * r.range(0.35, 0.55), rr = ay * 0.16;
    return `<circle cx="${f2(x)}" cy="${f2(y)}" r="${f2(rr * 2.2)}" fill="#f2b56a" opacity="0.35" filter="${d.blur(rr * 0.8)}"/><circle cx="${f2(x)}" cy="${f2(y)}" r="${f2(rr)}" fill="#c8452a" opacity="0.85"/>`;
  }
  const y = ay * r.range(0.15, 0.3), rr = Math.max(6, ay * 0.1);
  return `<circle cx="${f2(x)}" cy="${f2(y)}" r="${f2(rr * 2.5)}" fill="#c9d4e8" opacity="0.22" filter="${d.blur(rr)}"/><circle cx="${f2(x)}" cy="${f2(y)}" r="${f2(rr)}" fill="#ece8d8" opacity="0.95"/><circle cx="${f2(x + rr * 0.35)}" cy="${f2(y - rr * 0.15)}" r="${f2(rr * 0.9)}" fill="#c9cbd0" opacity="0.18"/>`;
}

/** soft haze band at the horizon line of a strip */
const hazeBand = (d: Doc, w: number, y: number, hh: number, P: Pal, a = 0.8) =>
  `<rect x="0" y="${f2(y - hh)}" width="${w}" height="${f2(hh)}" fill="${d.lin([[0, P.haze, 0], [1, P.haze, a]], 0, y - hh, 0, y)}"/>`;

/** ground-coloured base under/at the bottom of a strip */
const groundBand = (d: Doc, w: number, y: number, hh: number, col: string, a0 = 0, a1 = 1) =>
  `<rect x="0" y="${f2(y)}" width="${w}" height="${f2(hh)}" fill="${d.lin([[0, col, a0], [1, col, a1]], 0, y, 0, y + hh)}"/>`;

const farMountains = (d: Doc, r: Rng, w: number, ay: number, P: Pal, o: { hk?: number; style?: 'hemp' | 'axe' | 'none'; snow?: boolean; foot?: number } = {}) => {
  const hk = o.hk ?? 1;
  // a few big, pale peaks far back; a busier, darker row of lower ridges in front
  let s = range(d, r, { x0: -60, x1: w + 60, base: ay, hMin: ay * 0.55 * hk, hMax: ay * 1.0 * hk, n: r.int(3, 5), wk: 1.6, tone: P.far, alpha: 0.4, style: 'none', lw: 0.6, fade: 0.7, snow: o.snow, foot: 0 });
  s += hills(d, r, { x0: 0, x1: w, base: ay, amp: ay * 0.3 * hk, tone: P.far, alpha: 0.35, fade: 0.7, freq: 1.3 });
  s += range(d, r, { x0: -40, x1: w + 40, base: ay, hMin: ay * 0.18 * hk, hMax: ay * 0.55 * hk, n: r.int(5, 8), wk: 1.5, tone: P.mid, alpha: 0.65, style: o.style ?? 'hemp', lw: 0.6, fade: 0.65, snow: o.snow, foot: o.foot ?? 2, ink: P.ink });
  return s;
};

// ------------------------------------------------------------------ themes
const T: Record<string, Theme> = {
  // 01 plain: far rolling hills, near farmland, trees and a pagoda
  '01': {
    ground: 'plain',
    far: (d, r, w, h, ay, P) =>
      luminary(d, r, w, ay, P) +
      hills(d, r, { x0: 0, x1: w, base: ay, amp: ay * 0.55, tone: P.far, alpha: 0.4, fade: 0.8 }) +
      farMountains(d, r, w, ay, P, { hk: 0.75 }) +
      treeLine(0, w, ay, ay * 0.12, r, P.ink, 0.35) +
      hazeBand(d, w, ay, ay * 0.35, P, 0.7),
    near: (d, r, w, h, ay, P) => {
      let s = hills(d, r, { x0: 0, x1: w, base: h, amp: h * 0.28, tone: P.mid, alpha: 0.35, fade: 0.2, freq: 2 });
      s += treeLine(0, w, h, h * 0.18, r, P.leaf, 0.55);
      const px = r.range(w * 0.6, w * 0.8);
      s += pagoda(px, h - 2, h * 0.85, P.ink, P.face, 0.9);
      for (let i = 0; i < 4; i++) s += house(r.range(0.1, 0.5) * w, h - 1, h * r.range(0.25, 0.32), P.ink, P.face, r, 0.85);
      for (let x = 20; x < w; x += r.range(60, 160)) s += leafTree(x, h, h * r.range(0.35, 0.7), r, P.ink, 0.85, P.leaf);
      return s + groundBand(d, w, h - 4, 4, groundTone('plain', P.v), 0, 1);
    },
  },
  // 02 grassland: snowy ranges far away, an army camp near the horizon
  '02': {
    ground: 'grass',
    far: (d, r, w, h, ay, P) =>
      luminary(d, r, w, ay, P) +
      range(d, r, { x0: -60, x1: w + 60, base: ay, hMin: ay * 0.55, hMax: ay * 0.95, tone: P.far, alpha: 0.45, style: 'hemp', lw: 0.6, fade: 0.75, snow: true, foot: 1, ink: P.ink, density: 0.5 }) +
      hazeBand(d, w, ay, ay * 0.4, P, 0.85) +
      hills(d, r, { x0: 0, x1: w, base: ay, amp: ay * 0.12, tone: mix(P.mid, '#4f6a4a', P.v === 1 ? 0.5 : 0.2), alpha: 0.5, fade: 0.3, freq: 1.5 }),
    near: (d, r, w, h, ay, P) => {
      let s = '';
      const cx0 = r.range(w * 0.05, w * 0.3), cx1 = cx0 + w * r.range(0.35, 0.5);
      // palisade
      for (let x = cx0 - 20; x < cx1 + 20; x += 4) s += `<path d="M${f2(x)},${f2(h)}V${f2(h - h * r.range(0.16, 0.22))}" stroke="${P.ink}" stroke-width="2.2"${op(0.75)}/>`;
      for (let x = cx0; x < cx1; x += r.range(26, 40)) s += tent(x, h - h * 0.1, h * r.range(0.2, 0.28), P.ink, P.face, r, 0.95);
      for (let x = cx0; x < cx1; x += r.range(30, 70)) s += flag(x, h - h * 0.1, h * r.range(0.35, 0.5), r.chance(0.6) ? P.flag : P.flag2, P.ink, r, 0.95);
      s += tower(cx0 - 30, h - 1, h * 0.28, h * 0.6, 1, P.ink, P.face, 0.9);
      s += treeLine(cx1 + 40, w, h, h * 0.14, r, P.leaf, 0.5);
      for (let x = cx1 + 60; x < w; x += r.range(80, 200)) s += leafTree(x, h, h * r.range(0.3, 0.5), r, P.ink, 0.8, P.leaf);
      s += army(w * 0.02, cx0 - 50, h - 2, h * 0.12, h * 0.07, r, P.ink, 0.6, P.flag2);
      return s + groundBand(d, w, h - 5, 5, groundTone('grass', P.v), 0, 1);
    },
  },
  // 03 forest: misty wooded hills, a dark wall of pines
  '03': {
    ground: 'forest',
    far: (d, r, w, h, ay, P) => {
      let s = luminary(d, r, w, ay, P);
      s += hills(d, r, { x0: 0, x1: w, base: ay, amp: ay * 0.75, tone: P.far, alpha: 0.4, fade: 0.8 });
      s += hills(d, r, { x0: 0, x1: w, base: ay, amp: ay * 0.5, tone: P.mid, alpha: 0.5, fade: 0.6, freq: 1.4 });
      for (let x = 0; x < w; x += r.range(5, 11)) {
        const y = ay - r.range(0, ay * 0.35);
        s += pine(x, y, r.range(10, 20), r, P.ink, r.range(0.25, 0.5));
      }
      return s + mist(d, r, 0, w, ay * 0.85, ay * 0.2, P.haze, 0.5, 6) + hazeBand(d, w, ay, ay * 0.25, P, 0.5);
    },
    near: (d, r, w, h, ay, P) => {
      let s = treeLine(0, w, h, h * 0.4, r, P.far, 0.4);
      // back row: pale, misty; front row: dark and sparse enough to read single trees
      for (let x = -10; x < w + 10; x += r.range(10, 22)) s += pine(x, h - r.range(0, 6), h * r.range(0.45, 0.8), r, P.far, r.range(0.45, 0.7));
      s += hazeBand(d, w, h, h * 0.5, P, 0.35);
      for (let x = -10; x < w + 10; x += r.range(18, 40)) s += r.chance(0.6) ? pine(x, h + 2, h * r.range(0.55, 0.98), r, P.ink, r.range(0.8, 0.95)) : leafTree(x, h + 2, h * r.range(0.45, 0.85), r, P.ink, 0.88, P.leaf);
      return s + groundBand(d, w, h - 6, 6, groundTone('forest', P.v), 0, 1);
    },
  },
  // 04 mountains: tall axe-cut peaks; rocky spurs with pines and a hamlet
  '04': {
    ground: 'rock',
    far: (d, r, w, h, ay, P) =>
      luminary(d, r, w, ay, P) +
      range(d, r, { x0: -60, x1: w + 60, base: ay, hMin: ay * 0.35, hMax: ay * 1.0, n: 7, wk: 1.2, tone: P.far, alpha: 0.55, style: "axe", lw: 0.6, fade: 0.6, foot: 2, ink: P.ink }) +
      mist(d, r, 0, w, ay * 0.8, ay * 0.25, P.haze, 0.85, 7) +
      hazeBand(d, w, ay, ay * 0.25, P, 0.7),
    near: (d, r, w, h, ay, P) => {
      let s = range(d, r, { x0: -30, x1: w + 30, base: h, hMin: h * 0.35, hMax: h * 0.85, tone: P.mid, alpha: 0.75, style: 'axe', lw: 0.7, fade: 0.25, foot: 1, ink: P.ink, wk: 1.6 });
      for (let i = 0; i < 18; i++) s += pine(r.range(0, w), h - r.range(0, h * 0.25), h * r.range(0.2, 0.4), r, P.ink, 0.85);
      const vx = r.range(0.3, 0.7) * w;
      for (let i = 0; i < 4; i++) s += house(vx + i * h * 0.3, h - 1, h * 0.25, P.ink, P.face, r, 0.9);
      return s + groundBand(d, w, h - 6, 6, groundTone('rock', P.v), 0, 1);
    },
  },
  // 05 desert: long dunes, a beacon tower, dead trees
  '05': {
    ground: 'sand',
    sky: 'dust',
    far: (d, r, w, h, ay, P) => {
      const sandC = P.v === 1 ? '#c09a62' : P.v === 2 ? '#8f5a36' : '#2e3550';
      let s = luminary(d, r, w, ay, P);
      s += hills(d, r, { x0: 0, x1: w, base: ay, amp: ay * 0.45, tone: P.far, alpha: 0.35, fade: 0.8, freq: 0.7, rough: 0 });
      for (let i = 0; i < 6; i++) {
        // dune: smooth body, sharp ink ridge line
        const x0 = r.range(-200, w), dw = r.range(220, 420), dh = ay * r.range(0.18, 0.4);
        const top = x0 + dw * r.range(0.55, 0.75);
        const dd = `M${f2(x0)},${f2(ay)}Q${f2(x0 + dw * 0.35)},${f2(ay - dh * 0.6)} ${f2(top)},${f2(ay - dh)}Q${f2(top + dw * 0.08)},${f2(ay - dh * 0.6)} ${f2(x0 + dw)},${f2(ay)}Z`;
        s += path(dd, d.lin([[0, sandC, 0.75], [1, sandC, 0.2]], 0, ay - dh, 0, ay));
        s += path(brush([[x0 + dw * 0.1, ay - dh * 0.12], [x0 + dw * 0.35, ay - dh * 0.6], [top, ay - dh]], 1.4, r), P.ink, op(0.5));
      }
      return s + hazeBand(d, w, ay, ay * 0.25, P, 0.6);
    },
    near: (d, r, w, h, ay, P) => {
      const sandC = groundTone('sand', P.v);
      let s = hills(d, r, { x0: 0, x1: w, base: h, amp: h * 0.35, tone: mix(sandC, P.ink, 0.25), alpha: 0.8, fade: 0, freq: 0.8, rough: 0 });
      const bx = r.range(0.2, 0.8) * w;
      s += `<path d="M${f2(bx - h * 0.18)},${f2(h - h * 0.2)}L${f2(bx - h * 0.12)},${f2(h - h * 0.75)}H${f2(bx + h * 0.12)}L${f2(bx + h * 0.18)},${f2(h - h * 0.2)}Z" fill="${P.face}" stroke="${P.ink}" stroke-width="1.2"/>`;
      s += `<path d="M${f2(bx)},${f2(h - h * 0.75)}q${f2(-h * 0.1)},${f2(-h * 0.2)} ${f2(h * 0.05)},${f2(-h * 0.45)}" stroke="${P.ink}" stroke-width="${f2(h * 0.05)}" fill="none" opacity="0.3" stroke-linecap="round"/>`;
      s += flag(bx + h * 0.1, h - h * 0.75, h * 0.3, P.flag, P.ink, r, 1);
      for (let i = 0; i < 5; i++) {
        const x = r.range(0, w), y = h - r.range(0, h * 0.2), th = h * r.range(0.2, 0.4);
        s += path(brush([[x, y], [x + r.range(-4, 4), y - th * 0.6], [x + r.range(-8, 8), y - th]], 2.2, r), P.ink, op(0.85));
        s += path(brush([[x, y - th * 0.5], [x + th * 0.3, y - th * 0.8]], 1.2, r), P.ink, op(0.8));
        s += path(brush([[x, y - th * 0.65], [x - th * 0.25, y - th * 0.95]], 1.2, r), P.ink, op(0.8));
      }
      return s + groundBand(d, w, h - 6, 6, sandC, 0, 1);
    },
  },
  // 06 river: the fight is on deck; far shore and an enemy fleet, near rail of our ship
  '06': {
    ground: 'deck',
    far: (d, r, w, h, ay, P) => {
      let s = luminary(d, r, w, ay, P);
      s += range(d, r, { x0: -60, x1: w + 60, base: ay * 0.7, hMin: ay * 0.25, hMax: ay * 0.55, tone: P.far, alpha: 0.45, style: 'hemp', lw: 0.5, fade: 0.6, foot: 1, ink: P.ink, density: 0.5 });
      s += `<rect x="0" y="${f2(ay * 0.68)}" width="${w}" height="${f2(ay * 0.32 + 1)}" fill="${d.lin([[0, P.water, 0.6], [1, P.water, 0.9]], 0, ay * 0.68, 0, ay)}"/>`;
      s += ripples(0, w, ay * 0.72, ay, r, P.ink, 0.35, 140, 0.6);
      for (let i = 0; i < 5; i++) s += ship(r.range(0.05, 0.95) * w, ay * r.range(0.84, 0.97), ay * r.range(0.5, 0.8), P.ink, P.face, mix(P.face, P.ink, 0.15), r, 0.85, P.flag);
      return s;
    },
    near: (d, r, w, h, ay, P) => {
      // our ship's bulwark: lacquered rail with posts, shields and banners
      const top = h * 0.55;
      const wood = P.v === 3 ? '#3a2a24' : P.v === 2 ? '#5a2e1c' : '#7a3a22';
      let s = `<rect x="0" y="${f2(top)}" width="${w}" height="${f2(h - top)}" fill="${wood}"/>`;
      s += `<rect x="0" y="${f2(top - 3)}" width="${w}" height="5" fill="${P.ink}"/>`;
      for (let x = 10; x < w; x += 48) {
        s += `<rect x="${f2(x)}" y="${f2(top - 8)}" width="5" height="${f2(h - top + 8)}" fill="${P.ink}"${op(0.9)}/>`;
        s += `<circle cx="${f2(x + 24)}" cy="${f2((top + h) / 2)}" r="${f2((h - top) * 0.33)}" fill="${P.face}" stroke="${P.ink}" stroke-width="1.5"${op(0.85)}/>`;
        s += `<circle cx="${f2(x + 24)}" cy="${f2((top + h) / 2)}" r="${f2((h - top) * 0.12)}" fill="${P.flag}"${op(0.8)}/>`;
      }
      for (let x = 60; x < w; x += r.range(180, 300)) s += flag(x, top - 6, h * 0.9, r.chance(0.7) ? P.flag : P.flag2, P.ink, r, 1);
      // rigging
      for (let i = 0; i < 3; i++) {
        const x = r.range(0, w);
        s += `<path d="M${f2(x)},${f2(top)}L${f2(x + r.range(60, 160))},0" stroke="${P.ink}" stroke-width="1"${op(0.6)}/>`;
      }
      return s;
    },
  },
  // 07 snow: white peaks with paper reserve, snowy pines and a village
  '07': {
    ground: 'snow',
    sky: 'overcast',
    far: (d, r, w, h, ay, P) =>
      luminary(d, r, w, ay, P) +
      range(d, r, { x0: -60, x1: w + 60, base: ay, hMin: ay * 0.55, hMax: ay * 0.95, tone: P.far, alpha: 0.6, style: 'axe', lw: 0.6, fade: 0.55, snow: true, foot: 1, ink: P.ink }) +
      hazeBand(d, w, ay, ay * 0.35, { ...P, haze: P.snow }, 0.85),
    near: (d, r, w, h, ay, P) => {
      let s = hills(d, r, { x0: 0, x1: w, base: h, amp: h * 0.35, tone: P.snow, alpha: 1, fade: 0, freq: 1.2 });
      s += hills(d, r, { x0: 0, x1: w, base: h, amp: h * 0.3, tone: P.far, alpha: 0.18, fade: 0.9, freq: 1.2 });
      for (let i = 0; i < 26; i++) {
        const x = r.range(0, w), y = h - r.range(0, h * 0.15), th = h * r.range(0.25, 0.6);
        s += pine(x, y, th, r, P.ink, 0.85);
        // snow caps on the tiers
        for (let k = 0; k < 3; k++) s += `<ellipse cx="${f2(x + r.range(-3, 3))}" cy="${f2(y - th * (0.45 + k * 0.2))}" rx="${f2(th * 0.15)}" ry="${f2(th * 0.03)}" fill="${P.snow}"${op(0.95)}/>`;
      }
      const vx = r.range(0.2, 0.6) * w;
      for (let i = 0; i < 5; i++) {
        const x = vx + i * h * 0.35;
        s += house(x, h - 1, h * 0.3, P.ink, P.face, r, 0.9);
        s += `<path d="M${f2(x - h * 0.17)},${f2(h - h * 0.13 - h * 0.09)}Q${f2(x)},${f2(h - h * 0.13 - h * 0.15)} ${f2(x + h * 0.17)},${f2(h - h * 0.13 - h * 0.09)}" stroke="${P.snow}" stroke-width="3" fill="none"/>`;
      }
      return s + groundBand(d, w, h - 6, 6, groundTone('snow', P.v), 0, 1);
    },
  },
  // 08 river valley: a river and stone bridge far off, green hills and a fort near
  '08': {
    ground: 'grass',
    far: (d, r, w, h, ay, P) => {
      let s = luminary(d, r, w, ay, P);
      s += farMountains(d, r, w, ay * 0.8, P, { hk: 0.9 });
      s += `<rect x="0" y="${f2(ay * 0.78)}" width="${w}" height="${f2(ay * 0.22 + 1)}" fill="${d.lin([[0, P.water, 0.5], [1, P.water, 0.85]], 0, ay * 0.78, 0, ay)}"/>`;
      s += ripples(0, w, ay * 0.8, ay, r, P.ink, 0.3, 80, 0.5);
      const bx = r.range(0.3, 0.7) * w, bw = ay * 2.2;
      s += `<path d="M${f2(bx - bw / 2)},${f2(ay * 0.86)}Q${f2(bx)},${f2(ay * 0.62)} ${f2(bx + bw / 2)},${f2(ay * 0.86)}" stroke="${P.ink}" stroke-width="3" fill="none"${op(0.75)}/>`;
      for (let k = -1; k <= 1; k++) s += `<path d="M${f2(bx + k * bw * 0.25 - bw * 0.09)},${f2(ay * 0.86)}Q${f2(bx + k * bw * 0.25)},${f2(ay * 0.74)} ${f2(bx + k * bw * 0.25 + bw * 0.09)},${f2(ay * 0.86)}" stroke="${P.ink}" stroke-width="1.5" fill="none"${op(0.6)}/>`;
      return s;
    },
    near: (d, r, w, h, ay, P) => {
      let s = range(d, r, { x0: -30, x1: w + 30, base: h, hMin: h * 0.3, hMax: h * 0.7, tone: mix(P.mid, '#3f5a40', P.v === 1 ? 0.5 : 0.2), alpha: 0.6, style: 'hemp', lw: 0.7, fade: 0.3, foot: 1, ink: P.ink, wk: 1.8 });
      const fx = r.range(0.55, 0.8) * w;
      s += wall(fx - h * 0.9, fx + h * 0.9, h - h * 0.3, h * 0.3, P.ink, P.face, r, 0.95);
      s += gate(fx, h - h * 0.3, h * 0.3, h * 0.5, P.ink, P.face, 0.95);
      s += flag(fx - h * 0.7, h - h * 0.35, h * 0.4, P.flag, P.ink, r);
      for (let i = 0; i < 12; i++) s += leafTree(r.range(0, w), h, h * r.range(0.25, 0.5), r, P.ink, 0.85, P.leaf);
      return s + groundBand(d, w, h - 6, 6, groundTone('grass', P.v), 0, 1);
    },
  },
  // 09 city wall: a long rampart with gate towers right at the horizon
  '09': {
    ground: 'earth',
    far: (d, r, w, h, ay, P) => luminary(d, r, w, ay, P) + farMountains(d, r, w, ay, P, { hk: 0.85 }) + hazeBand(d, w, ay, ay * 0.4, P, 0.85),
    near: (d, r, w, h, ay, P) => {
      const top = h * 0.5;
      let s = wall(0, w, top, h - top, P.ink, P.face, r, 1);
      for (const gx of [w * r.range(0.15, 0.3), w * r.range(0.6, 0.8)]) s += gate(gx, top, h - top, h * 0.75, P.ink, P.face, 1);
      for (let x = 30; x < w; x += r.range(50, 90)) s += flag(x, top - 4, h * 0.35, r.chance(0.5) ? P.flag : P.flag2, P.ink, r, 0.95);
      s += army(0, w, top - 2, 4, 5, r, P.ink, 0.7, undefined, 0.5);
      return s;
    },
  },
  // 10 war camp: rows of tents and banners, a wooden palisade
  '10': {
    ground: 'camp',
    far: (d, r, w, h, ay, P) => {
      let s = luminary(d, r, w, ay, P) + farMountains(d, r, w, ay, P, { hk: 0.8 }) + hazeBand(d, w, ay, ay * 0.3, P, 0.8);
      for (let x = 10; x < w; x += r.range(14, 24)) s += tent(x, ay - r.range(0, 4), r.range(10, 16), P.ink, P.face, r, 0.85);
      for (let x = 20; x < w; x += r.range(40, 90)) s += flag(x, ay, r.range(22, 32), r.chance(0.5) ? P.flag : P.flag2, P.ink, r, 0.9);
      return s;
    },
    near: (d, r, w, h, ay, P) => {
      let s = '';
      for (let x = 0; x < w; x += 5) {
        const th = h * r.range(0.4, 0.5);
        s += `<path d="M${f2(x)},${f2(h)}V${f2(h - th)}l2.5,-5l2.5,5V${f2(h)}Z" fill="${mix(P.face, P.ink, 0.45)}" stroke="${P.ink}" stroke-width="0.8"/>`;
      }
      s += `<path d="M0,${f2(h * 0.7)}H${w}" stroke="${P.ink}" stroke-width="3"${op(0.8)}/>`;
      for (const tx of [w * 0.12, w * 0.5, w * 0.88]) {
        s += tower(tx, h - 1, h * 0.35, h * 0.95, 1, P.ink, P.face, 1);
        s += flag(tx + h * 0.1, h - h * 0.95, h * 0.3, P.flag, P.ink, r);
      }
      return s;
    },
  },
  // 11 town: a walled city on a hill far off; roadside houses and willows
  '11': {
    ground: 'paving',
    far: (d, r, w, h, ay, P) => {
      let s = luminary(d, r, w, ay, P) + farMountains(d, r, w, ay, P, { hk: 0.8 });
      const cx = r.range(0.3, 0.7) * w, cw = ay * 4;
      s += wall(cx - cw / 2, cx + cw / 2, ay * 0.72, ay * 0.18, P.ink, P.face, r, 0.85);
      s += gate(cx, ay * 0.72, ay * 0.18, ay * 0.35, P.ink, P.face, 0.85);
      s += tower(cx - cw * 0.3, ay * 0.72, ay * 0.2, ay * 0.3, 2, P.ink, P.face, 0.8);
      s += tower(cx + cw * 0.3, ay * 0.72, ay * 0.2, ay * 0.3, 2, P.ink, P.face, 0.8);
      return s + hazeBand(d, w, ay, ay * 0.2, P, 0.7);
    },
    near: (d, r, w, h, ay, P) => {
      let s = '';
      for (let x = r.range(0, 40); x < w; x += r.range(h * 0.4, h * 0.9)) {
        if (r.chance(0.3)) continue;
        s += house(x, h - 1, h * r.range(0.4, 0.6), P.ink, P.face, r, 0.95);
      }
      for (let i = 0; i < 8; i++) {
        // willow: trunk + drooping strokes
        const x = r.range(0, w), th = h * r.range(0.6, 0.9);
        s += path(brush([[x, h], [x + 3, h - th * 0.5], [x - 2, h - th]], 4, r), P.ink, op(0.9));
        for (let k = 0; k < 14; k++) {
          const sx = x + r.range(-th * 0.3, th * 0.3), sy = h - th * r.range(0.75, 1);
          s += `<path d="M${f2(sx)},${f2(sy)}q${f2(r.range(-4, 4))},${f2(th * 0.25)} ${f2(r.range(-3, 3))},${f2(th * r.range(0.35, 0.55))}" stroke="${P.leaf}" stroke-width="1.1" fill="none"${op(0.7)}/>`;
        }
      }
      return s + groundBand(d, w, h - 6, 6, groundTone('paving', P.v), 0, 1);
    },
  },
  // 12 wasteland: bare hills, dead trees and broken fences
  '12': {
    ground: 'waste',
    sky: 'dust',
    far: (d, r, w, h, ay, P) =>
      luminary(d, r, w, ay, P) +
      hills(d, r, { x0: 0, x1: w, base: ay, amp: ay * 0.6, tone: P.far, alpha: 0.4, fade: 0.8, rough: 2 }) +
      range(d, r, { x0: -40, x1: w + 40, base: ay, hMin: ay * 0.2, hMax: ay * 0.45, tone: P.mid, alpha: 0.6, style: 'axe', lw: 0.6, fade: 0.5, foot: 1, ink: P.ink, wk: 2 }) +
      hazeBand(d, w, ay, ay * 0.3, P, 0.7),
    near: (d, r, w, h, ay, P) => {
      let s = hills(d, r, { x0: 0, x1: w, base: h, amp: h * 0.25, tone: P.mid, alpha: 0.4, fade: 0.2, freq: 2, rough: 2 });
      for (let x = 0; x < w; x += r.range(3, 7)) {
        if (Math.sin(x / 90) > 0.3) continue;
        const th = h * r.range(0.25, 0.45);
        s += `<path d="M${f2(x)},${f2(h)}L${f2(x + r.range(-3, 3))},${f2(h - th)}" stroke="${P.ink}" stroke-width="2.4"${op(0.8)}/>`;
      }
      for (let i = 0; i < 6; i++) {
        const x = r.range(0, w), th = h * r.range(0.4, 0.8);
        s += path(brush([[x, h], [x + r.range(-6, 6), h - th * 0.6], [x + r.range(-12, 12), h - th]], 3.5, r), P.ink, op(0.9));
        for (let k = 0; k < 4; k++) {
          const y = h - th * r.range(0.4, 0.95), dx = r.range(-1, 1) * th * 0.35;
          s += path(brush([[x, y], [x + dx * 0.6, y - th * 0.08], [x + dx, y - th * 0.18]], 1.4, r), P.ink, op(0.85));
        }
      }
      return s + groundBand(d, w, h - 6, 6, groundTone('waste', P.v), 0, 1);
    },
  },
  // 13 mountain pass: steep cliffs and a fortified barrier across the road
  '13': {
    ground: 'rock',
    far: (d, r, w, h, ay, P) =>
      luminary(d, r, w, ay, P) +
      range(d, r, { x0: -60, x1: w + 60, base: ay, hMin: ay * 0.4, hMax: ay * 1.0, n: 8, tone: P.far, alpha: 0.6, style: "axe", lw: 0.6, fade: 0.55, foot: 2, ink: P.ink, wk: 0.9 }) +
      mist(d, r, 0, w, ay * 0.85, ay * 0.2, P.haze, 0.9, 8),
    near: (d, r, w, h, ay, P) => {
      let s = range(d, r, { x0: -40, x1: w * 0.3, base: h, hMin: h * 0.6, hMax: h * 1.0, tone: P.mid, alpha: 0.8, style: 'axe', lw: 0.7, fade: 0.2, ink: P.ink, wk: 1.2 });
      s += range(d, r, { x0: w * 0.7, x1: w + 40, base: h, hMin: h * 0.6, hMax: h * 1.0, tone: P.mid, alpha: 0.8, style: 'axe', lw: 0.7, fade: 0.2, ink: P.ink, wk: 1.2 });
      const top = h * 0.55;
      s += wall(w * 0.3, w * 0.7, top, h - top, P.ink, P.face, r, 1);
      s += gate(w * 0.5, top, h - top, h * 0.6, P.ink, P.face, 1);
      for (let x = w * 0.32; x < w * 0.7; x += 60) s += flag(x, top - 3, h * 0.3, P.flag, P.ink, r, 0.95);
      return s;
    },
  },
};

// ------------------------------------------------------------------ painters
function sky(set: string, v: number, w: number, h: number): string {
  const P = pal(v);
  const th = T[set] ?? T['01'];
  const d = new Doc(w, h, Number(set) * 10 + v);
  const r = rng(`sky${set}${v}`);
  let [c0, c1, c2] = P.sky;
  if (th.sky === 'dust' && v === 1) [c0, c1, c2] = ['#d6c7a6', '#e6d6b2', '#efe0bd'];
  if (th.sky === 'overcast' && v === 1) [c0, c1, c2] = ['#bfc2c0', '#d9d9d2', '#ecebe4'];
  let s = `<rect width="${w}" height="${h}" fill="${d.lin([[0, c0, 1], [0.55, c1, 1], [1, c2, 1]], 0, 0, 0, h)}"/>`;
  // drifting cloud washes (they get stretched, so keep them soft and wide)
  let cl = '';
  for (let i = 0; i < 9; i++) {
    const y = r.range(0.1, 0.7) * h;
    cl += `<ellipse cx="${f2(r.range(0, w))}" cy="${f2(y)}" rx="${f2(r.range(80, 220))}" ry="${f2(r.range(3, 9))}" fill="${r.chance(0.5) ? P.cloud : c2}" opacity="${f2(r.range(0.2, 0.5))}"/>`;
  }
  s += `<g filter="${d.blur(5)}">${cl}</g>`;
  if (v === 3) for (let i = 0; i < 60; i++) s += `<circle cx="${f2(r.range(0, w))}" cy="${f2(r.range(0, h * 0.6))}" r="${f2(r.range(0.3, 0.8))}" fill="#e6e8f0" opacity="${f2(r.range(0.3, 0.8))}"/>`;
  s += `<rect width="${w}" height="${h}" fill="${c0}" filter="${d.wash(0.02, 0.4, 2)}" opacity="0.18"/>`;
  return d.svg(s);
}

function strip(kind: 'far' | 'near', set: string, v: number, w: number, h: number, ay: number): string {
  const P = pal(v);
  const th = T[set] ?? T['01'];
  const d = new Doc(w, h, Number(set) * 31 + v * 7 + (kind === 'far' ? 0 : 3));
  // same layout for all three times of day: seed by set only
  const r = rng(`${kind}${set}`);
  let s = (kind === 'far' ? th.far : th.near)(d, r, w, h, ay, P);
  if (kind === 'far' && ay < h) s += `<rect x="0" y="${f2(ay - 1)}" width="${w}" height="${f2(h - ay + 1)}" fill="${groundTone(th.ground, v)}"/>`;
  return d.svg(`<g filter="${d.bleed(1.6, 0.08)}">${s}</g>`);
}

/** Seamless 512² ground tile. */
function ground(set: string, v: number, S = 512) {
  const th = T[set] ?? T['01'];
  const kind = th.ground;
  const P = pal(v);
  const base = groundTone(kind, v);
  const d = new Doc(S, S, Number(set) * 17 + v);
  const r = rng(`ground${set}`);
  const dark = mix(base, P.ink, 0.35);
  let s = '';
  // marks, wrapped around the edges
  const marks: string[] = [];
  const wrap = (x: number, y: number, m: number, f: (x: number, y: number) => string) => {
    for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) if (x + dx > -m && x + dx < S + m && y + dy > -m && y + dy < S + m) marks.push(f(x + dx, y + dy));
  };
  const ink = P.ink;
  const tuft = (x: number, y: number, k: number, col: string, a: number) => {
    let t = '';
    for (let i = 0; i < 4; i++) {
      const dx = (i - 1.5) * 2.2 * k, hh = k * (6 + ((i * 7) % 5));
      t += `<path d="M${f2(x + dx)},${f2(y)}q${f2(dx * 0.3)},${f2(-hh * 0.6)} ${f2(dx * 0.9 + (i - 1.5))},${f2(-hh)}" stroke="${col}" stroke-width="${f2(0.9 * k)}" fill="none" stroke-linecap="round" opacity="${f2(a)}"/>`;
    }
    return t;
  };
  const stone = (x: number, y: number, k: number, a: number) => `<path d="${blob(x, y, 5 * k, 3.2 * k, rng(Math.round(x * 13 + y)), 0.3, 8)}" fill="${mix(base, ink, 0.15)}" stroke="${mix(base, ink, 0.6)}" stroke-width="${f2(0.6 * k)}" opacity="${f2(a * 0.7)}"/>`;
  const leafCol = mix(P.leaf, base, 0.25);
  switch (kind) {
    case 'grass':
    case 'plain':
    case 'camp':
    case 'forest':
    case 'waste': {
      const n = kind === 'grass' ? 120 : kind === 'forest' ? 70 : kind === 'waste' ? 25 : 60;
      for (let i = 0; i < n; i++) {
        const x = r.range(0, S), y = r.range(0, S), k = r.range(0.7, 1.4);
        wrap(x, y, 20, (a, b) => tuft(a, b, k, kind === 'waste' ? ink : leafCol, r.range(0.18, 0.4)));
      }
      for (let i = 0; i < (kind === 'waste' ? 30 : 14); i++) {
        const x = r.range(0, S), y = r.range(0, S), k = r.range(0.5, 1.2);
        wrap(x, y, 12, (a, b) => stone(a, b, k, 0.35));
      }
      if (kind === 'forest')
        for (let i = 0; i < 160; i++) {
          const x = r.range(0, S), y = r.range(0, S), rr = r.range(1.2, 3);
          wrap(x, y, 6, (a, b) => `<ellipse cx="${f2(a)}" cy="${f2(b)}" rx="${f2(rr * 1.5)}" ry="${f2(rr)}" fill="${r.chance(0.5) ? leafCol : mix(C.ochre, base, 0.4)}" opacity="${f2(r.range(0.15, 0.35))}"/>`);
        }
      if (kind === 'waste')
        for (let i = 0; i < 14; i++) {
          // dry cracks
          const x = r.range(0, S), y = r.range(0, S);
          const pts: [number, number][] = [[0, 0]];
          for (let k = 0; k < 4; k++) pts.push([pts[k][0] + r.range(-14, 14), pts[k][1] + r.range(-10, 10)]);
          wrap(x, y, 70, (a, b) => `<path d="M${pts.map(([px, py]) => `${f2(a + px)},${f2(b + py)}`).join('L')}" stroke="${ink}" stroke-width="0.9" fill="none" opacity="0.25"/>`);
        }
      if (kind === 'camp')
        for (let i = 0; i < 6; i++) {
          // cart ruts / hoof prints
          const y = r.range(0, S);
          marks.push(`<path d="M0,${f2(y)}C${S / 3},${f2(y + r.range(-20, 20))} ${(2 * S) / 3},${f2(y + r.range(-20, 20))} ${S},${f2(y)}" stroke="${ink}" stroke-width="1.2" fill="none" opacity="0.12" stroke-dasharray="6 9"/>`);
        }
      break;
    }
    case 'rock':
      for (let i = 0; i < 26; i++) {
        const x = r.range(0, S), y = r.range(0, S), k = r.range(0.8, 2.2);
        wrap(x, y, 20, (a, b) => stone(a, b, k, 0.4));
      }
      for (let i = 0; i < 30; i++) {
        const x = r.range(0, S), y = r.range(0, S), k = r.range(0.7, 1.1);
        wrap(x, y, 20, (a, b) => tuft(a, b, k, leafCol, 0.3));
      }
      break;
    case 'sand':
      for (let i = 0; i < 40; i++) {
        // wind ripples
        const x = r.range(0, S), y = r.range(0, S), L = r.range(40, 110);
        wrap(x, y, 120, (a, b) => `<path d="M${f2(a)},${f2(b)}q${f2(L / 2)},${f2(-6)} ${f2(L)},0" stroke="${mix(base, ink, 0.45)}" stroke-width="1.1" fill="none" opacity="${f2(0.25)}"/>`);
      }
      for (let i = 0; i < 8; i++) {
        const x = r.range(0, S), y = r.range(0, S);
        wrap(x, y, 12, (a, b) => stone(a, b, 0.6, 0.25));
      }
      break;
    case 'snow':
      for (let i = 0; i < 30; i++) {
        const x = r.range(0, S), y = r.range(0, S), L = r.range(30, 90);
        wrap(x, y, 100, (a, b) => `<path d="M${f2(a)},${f2(b)}q${f2(L / 2)},${f2(-4)} ${f2(L)},0" stroke="${mix(base, '#6a7a96', 0.6)}" stroke-width="1.4" fill="none" opacity="0.2"/>`);
      }
      for (let i = 0; i < 10; i++) {
        const x = r.range(0, S), y = r.range(0, S), k = r.range(0.6, 1.2);
        wrap(x, y, 20, (a, b) => tuft(a, b, k, ink, 0.3));
      }
      break;
    case 'deck': {
      // planks: horizontal boards with staggered joints and nail heads
      const ph = 32;
      for (let y = 0; y < S; y += ph) {
        marks.push(`<path d="M0,${y}H${S}" stroke="${ink}" stroke-width="1.6" opacity="0.45"/>`);
        marks.push(`<rect x="0" y="${y + 1}" width="${S}" height="${ph * 0.3}" fill="#fff" opacity="0.05"/>`);
        const off = ((y / ph) % 4) * 64;
        for (let x = off % 256; x < S; x += 256) {
          marks.push(`<path d="M${x},${y}V${y + ph}" stroke="${ink}" stroke-width="1.2" opacity="0.4"/>`);
          for (const nx of [x - 5, x + 5]) for (const ny of [y + 8, y + ph - 8]) marks.push(`<circle cx="${nx}" cy="${ny}" r="1.3" fill="${ink}" opacity="0.5"/>`);
        }
        for (let i = 0; i < 5; i++) {
          // wood grain
          const gy = y + r.range(4, ph - 4), gx = r.range(0, S), L = r.range(60, 200);
          wrap(gx, gy, 200, (a, b) => `<path d="M${f2(a)},${f2(b)}q${f2(L / 2)},${f2(r.range(-3, 3))} ${f2(L)},0" stroke="${ink}" stroke-width="0.7" fill="none" opacity="0.18"/>`);
        }
      }
      break;
    }
    case 'paving':
    case 'earth': {
      if (kind === 'paving') {
        const tile = 64;
        for (let y = 0; y < S; y += tile / 2) {
          marks.push(`<path d="M0,${y}H${S}" stroke="${ink}" stroke-width="1" opacity="0.22"/>`);
          for (let x = ((y / (tile / 2)) % 2) * (tile / 2); x < S; x += tile) marks.push(`<path d="M${x},${y}V${y + tile / 2}" stroke="${ink}" stroke-width="1" opacity="0.22"/>`);
        }
      }
      for (let i = 0; i < 28; i++) {
        const x = r.range(0, S), y = r.range(0, S), k = r.range(0.5, 1.4);
        wrap(x, y, 14, (a, b) => stone(a, b, k, 0.3));
      }
      for (let i = 0; i < 25; i++) {
        const x = r.range(0, S), y = r.range(0, S), k = r.range(0.6, 1);
        wrap(x, y, 20, (a, b) => tuft(a, b, k, leafCol, 0.25));
      }
      break;
    }
  }
  s += marks.join('');
  return { svg: d.svg(s), base, dark };
}

/** Periodic fBm value noise on a torus (seamless), in [0, 1]. */
function torusNoise(S: number, seed: string, periods: number[], weights: number[]) {
  const r = rng(seed);
  const out = new Float32Array(S * S);
  let wsum = 0;
  periods.forEach((P, o) => {
    const g = Float32Array.from({ length: P * P }, () => r.next());
    const w = weights[o];
    wsum += w;
    const cell = S / P;
    for (let y = 0; y < S; y++) {
      const fy = y / cell, iy = Math.floor(fy), ty = fy - iy, sy = ty * ty * (3 - 2 * ty);
      const y0 = (iy % P) * P, y1 = ((iy + 1) % P) * P;
      for (let x = 0; x < S; x++) {
        const fx = x / cell, ix = Math.floor(fx), tx = fx - ix, sx = tx * tx * (3 - 2 * tx);
        const x0 = ix % P, x1 = (ix + 1) % P;
        const a = g[y0 + x0] + (g[y0 + x1] - g[y0 + x0]) * sx;
        const b = g[y1 + x0] + (g[y1 + x1] - g[y1 + x0]) * sx;
        out[y * S + x] += (a + (b - a) * sy) * w;
      }
    }
  });
  for (let i = 0; i < out.length; i++) out[i] /= wsum;
  return out;
}

const hex = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));

async function groundTile(set: string, v: number, S: number): Promise<Uint8Array> {
  const { svg, base, dark } = ground(set, v, S);
  const { data } = await sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const big = torusNoise(S, `gn${set}`, [4, 8, 16], [1, 0.5, 0.25]);
  const fine = torusNoise(S, `gf${set}`, [32, 64, 128], [1, 0.6, 0.4]);
  const B = hex(base), D = hex(dark);
  const px = new Uint8Array(S * S * 4);
  for (let i = 0; i < S * S; i++) {
    // blotchy wash + fine paper grain
    const k = Math.max(0, Math.min(1, (big[i] - 0.38) * 1.6)) * 0.4 + Math.max(0, fine[i] - 0.5) * 0.35;
    const a = data[i * 4 + 3] / 255;
    for (let c = 0; c < 3; c++) {
      const g = B[c] + (D[c] - B[c]) * k;
      px[i * 4 + c] = Math.round(g * (1 - a) + data[i * 4 + c] * a);
    }
    px[i * 4 + 3] = 255;
  }
  return px;
}

export async function paintBg(job: FrameJob): Promise<PaintOut> {
  const [w, h, ax, ay] = job.box;
  let m = /^ground(\d\d)(\d)\d?$/.exec(job.name);
  if (m) return { rgba: await groundTile(m[1], +m[2], w), w, h, ax, ay };
  m = /^(\d\d)(\d)-([123])$/.exec(job.name);
  if (!m) throw new Error('unknown bg frame ' + job.name);
  const [, set, vs, layer] = m;
  const v = Math.min(3, +vs); // 114..116 are spare near strips
  if (layer === '3') return { svg: sky(set, v, w, h), w, h, ax, ay };
  if (layer === '2') return { svg: strip('far', set, v, w, h, ay), w, h, ax, ay };
  return { svg: strip('near', set, v, w, h, h), w, h, ax, ay };
}

void leafTree;
