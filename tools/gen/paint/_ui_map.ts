// The strategy map (ad/base/map, 1024×768) as an antique ink-wash map on aged
// paper, and the city-name overlay (ad/base/citiesname).
//
// Layers: paper → land colour washes → rivers → lakes → sea (wash, wave
// pattern, coast echo lines) → coast brush line → mountains (山水 peaks with
// 皴 texture strokes and moss dots) → region names → roads → city icons →
// decorations (title cartouche, compass, seal). Mountains and labels avoid
// city icons, flags and name labels.
import { C, blob, brush, f2, FONT_BRUSH, FONT_KAI, mix, paper, rng, seal, smoothPath, svgDoc, washTexture, type Pt, type Rng } from '../ink.ts';
import { CITIES, COAST, LAKES, MAP_H, MAP_W, MOUNTAINS, NEIGHBORS, RIVERS, project, type City } from '../data/geo.ts';
import { cityIcon, ICON_SIZE } from './_ui_city.ts';
import { distTo, hitsRect, inPoly, offset, overlap, pathD, resample, wiggle, type Rect } from './_ui_geom.ts';

const P = (ll: [number, number]): Pt => project(ll[0], ll[1]);
const SEA = '#8fa39d';
const SEA_DEEP = '#6f8780';
const RIVER = '#34505c';

// ------------------------------------------------------------------ layout (shared with citiesname)
interface Layout {
  coast: Pt[];
  sea: Pt[];
  islands: Pt[][];
  rivers: { name: string; pts: Pt[] }[];
  icons: Rect[];
  flags: Rect[];
  names: { c: City; x: number; y: number; fs: number; rect: Rect }[];
}

let LAYOUT: Layout | null = null;

const NAME_FS = (c: City) => (c.size === 1 ? 15 : c.size === 4 ? 11.5 : 13);
const textW = (s: string, fs: number) => [...s].length * fs + 2;

export function layout(): Layout {
  if (LAYOUT) return LAYOUT;
  const r = rng('map-layout');
  const coast = wiggle(resample(COAST.map(P), 3), r, 3.2, 9, false);
  const first = coast[0], last = coast[coast.length - 1];
  const sea: Pt[] = [...coast, [last[0], MAP_H + 30], [MAP_W + 30, MAP_H + 30], [MAP_W + 30, first[1]]];
  const isl = (pts: [number, number][], seed: string) => wiggle(resample(pts.map(P), 3, true), rng(seed), 2, 7, false);
  const islands = [
    // 夷州 (Taiwan), 朱崖 (Hainan, cut by the map edge), 舟山 islets
    isl([[121.0, 25.3], [121.9, 25.05], [121.8, 24.4], [121.4, 23.4], [120.9, 22.4], [120.75, 21.95], [120.3, 22.5], [120.1, 23.3], [120.2, 24.1], [120.7, 24.9]], 'tw'),
    isl([[108.7, 19.3], [109.2, 19.95], [109.9, 20.1], [110.6, 20.1], [111.05, 19.7], [110.9, 19.0], [109.6, 18.6]], 'hn'),
    isl([[122.0, 30.15], [122.35, 30.1], [122.3, 29.9], [121.95, 29.95]], 'zs'),
  ];
  const rivers = Object.entries(RIVERS).map(([name, ll], i) => ({ name, pts: wiggle(resample(ll.map(P), 3), rng('river' + i), name === '黄河' || name === '长江' ? 5 : 3.5, 14) }));

  const icons: Rect[] = CITIES.map((c) => {
    const [w, h] = ICON_SIZE[c.size];
    return { x: c.x - w / 2, y: c.y - h / 2, w, h };
  });
  const flags: Rect[] = CITIES.map((c) => (c.size === 4 ? { x: c.x + 4, y: c.y - 25, w: 18, h: 24 } : { x: c.x + 8, y: c.y - 28, w: 22, h: 28 }));

  // name placement: greedy, big cities first, candidates around the icon
  const names: Layout['names'] = [];
  const order = [...CITIES].sort((a, b) => a.size - b.size || a.id - b.id);
  for (const c of order) {
    const fs = NAME_FS(c);
    const w = textW(c.name, fs), h = fs + 2;
    const [iw, ih] = ICON_SIZE[c.size];
    const cand: [number, number, number][] = [
      // [left, top, preference penalty]
      [c.x - w / 2, c.y + ih / 2 - 1, 0], // below
      [c.x - iw / 2 - w - 1, c.y - h / 2 + 2, 2], // left
      [c.x - w / 2, c.y - ih / 2 - h - 1, 5], // above
      [c.x - w + 4, c.y + ih / 2, 3], // below-left
      [c.x - 4, c.y + ih / 2, 3], // below-right
      [c.x + iw / 2 + 1, c.y + 2, 4], // right (under the flag)
      [c.x - iw / 2 - w, c.y - ih / 2 - h + 6, 6], // up-left
      [c.x - w / 2, c.y + ih / 2 + 7, 7], // further below
    ];
    let best: Rect | null = null, bs = Infinity;
    for (const [x, y, pen] of cand) {
      const rr = { x, y, w, h };
      let s = pen;
      icons.forEach((o, i) => (s += overlap(rr, o) * (CITIES[i] === c ? 3 : 8)));
      flags.forEach((o, i) => (s += overlap(rr, o) * (CITIES[i] === c ? 1.5 : 3)));
      for (const n of names) s += overlap(rr, n.rect) * 10;
      if (x < 4 || y < 4 || x + w > MAP_W - 4 || y + h > MAP_H - 4) s += 500;
      if (s < bs) (bs = s), (best = rr);
    }
    names.push({ c, x: best!.x + w / 2, y: best!.y + fs - 0.5, fs, rect: best! });
  }
  void r;
  LAYOUT = { coast, sea, islands, rivers, icons, flags, names };
  return LAYOUT;
}

// ------------------------------------------------------------------ mountains
interface Peak {
  x: number;
  y: number; // base
  w: number;
  h: number;
  tone: 'green' | 'ink' | 'ochre' | 'snow';
}

/** One 山 glyph: wash silhouette, ridge contour, texture strokes, moss dots. */
function peak(p: Peak, r: Rng): string {
  const { x, y, w, h } = p;
  const sx = x + r.range(-0.15, 0.15) * w; // summit x
  const lsh = [x - w * r.range(0.22, 0.32), y - h * r.range(0.45, 0.62)] as Pt;
  const rsh = [x + w * r.range(0.2, 0.32), y - h * r.range(0.35, 0.55)] as Pt;
  const top: Pt = [sx, y - h];
  const L: Pt = [x - w / 2, y], R: Pt = [x + w / 2, y];
  // small secondary bump on the left shoulder
  const lb: Pt = [lsh[0] - w * 0.06, lsh[1] - h * 0.08];
  const ridge: Pt[] = [L, [x - w * 0.4, y - h * 0.2], lb, lsh, [sx - w * 0.08, y - h * 0.86], top, [sx + w * 0.1, y - h * 0.83], rsh, [x + w * 0.4, y - h * 0.18], R];
  const sil = smoothPath([...ridge, [x, y + h * 0.04]], true, 0.45);
  const grad = { green: 'url(#mG)', ink: 'url(#mI)', ochre: 'url(#mO)', snow: 'url(#mS)' }[p.tone];
  let s = `<path d="${sil}" fill="${grad}"/>`;
  // contour: left slope heavier (lit from the right), right slope lighter
  const sw = Math.max(1, Math.min(2.4, w / 16));
  s += `<path d="${brush([L, [x - w * 0.4, y - h * 0.2], lb, lsh, [sx - w * 0.08, y - h * 0.86], top], sw, r, { taperIn: 0.4, taperOut: 0.15 })}" fill="${C.ink}" opacity="0.85"/>`;
  s += `<path d="${brush([top, [sx + w * 0.1, y - h * 0.83], rsh, [x + w * 0.4, y - h * 0.18], R], sw * 0.8, r, { taperIn: 0.15, taperOut: 0.5 })}" fill="${C.ink}" opacity="0.7"/>`;
  // 披麻皴 texture strokes descending from the ridge
  const n = Math.max(2, Math.round(w / 9));
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const left = t < 0.5;
    const a: Pt = left ? [L[0] + (top[0] - L[0]) * (t * 2) * 0.9 + w * 0.08, L[1] + (top[1] - L[1]) * (t * 2) * 0.85 + h * 0.12] : [top[0] + (R[0] - top[0]) * ((t - 0.5) * 2) * 0.9 - w * 0.06, top[1] + (R[1] - top[1]) * ((t - 0.5) * 2) + h * 0.18];
    const len = h * r.range(0.25, 0.45);
    const b: Pt = [a[0] + (left ? 1 : -1) * w * 0.06, a[1] + len];
    s += `<path d="${brush([a, [(a[0] + b[0]) / 2 + (left ? -1 : 1) * w * 0.04, (a[1] + b[1]) / 2], b], sw * 0.55, r, { taperIn: 0.2, taperOut: 0.6 })}" fill="${C.inkSoft}" opacity="0.45"/>`;
  }
  // 苔点 moss dots near the summit
  const dots = r.int(1, 3);
  for (let i = 0; i < dots; i++) {
    const t = r.range(-0.35, 0.35);
    const dx = sx + t * w * 0.5, dy = y - h * (0.92 - Math.abs(t) * 0.9) + 1.2;
    s += `<path d="${blob(dx, dy, sw * 0.55, sw * 0.4, r, 0.3, 6)}" fill="${C.ink}" opacity="0.85"/>`;
  }
  return s;
}

function mountainLayer(L: Layout): string {
  const r = rng('mountains');
  type Site = { x: number; y: number; s: number; tone: Peak['tone'] };
  const sites: Site[] = [];
  const reserved: Rect[] = [...L.icons, ...L.flags, ...L.names.map((n) => n.rect)];
  const ok = (x: number, y: number, w: number, h: number) => {
    const box: Rect = { x: x - w / 2, y: y - h, w, h: h + 3 };
    if (reserved.some((q) => overlap(box, { x: q.x - 3, y: q.y - 3, w: q.w + 6, h: q.h + 6 }) > 0)) return false;
    if (inPoly(x, y - 2, L.sea) || inPoly(x - w * 0.4, y - 2, L.sea) || inPoly(x + w * 0.4, y - 2, L.sea)) return false;
    if (L.islands.some((i) => inPoly(x, y, i))) return false;
    for (const rv of L.rivers) if (distTo(x, y - h * 0.15, rv.pts) < w * 0.3 || distTo(x, y + 2, rv.pts) < 5) return false;
    if (distTo(x, y, L.coast) < w * 0.35) return false;
    return true;
  };
  const add = (x: number, y: number, s: number, tone: Peak['tone']) => {
    // shrink until it fits (keeps ranges continuous between cities)
    for (let k = s; k >= Math.max(12, s * 0.5); k *= 0.82) {
      if (!ok(x, y, k * 1.25, k * 0.95)) continue;
      if (sites.some((q) => Math.abs(q.x - x) < (q.s + k) * 0.3 && Math.abs(q.y - y) < (q.s + k) * 0.12)) return false;
      sites.push({ x, y, s: k, tone });
      return true;
    }
    return false;
  };
  // named ranges: a chain of massifs along the line, in two staggered rows
  for (const [name, ll] of Object.entries(MOUNTAINS)) {
    const line = resample(ll.map(P), 3);
    const big = name === '秦岭' || name === '横断山' || name === '祁连山';
    const tone: Peak['tone'] = name === '祁连山' || name === '横断山' ? 'snow' : 'green';
    const base = big ? 40 : 32;
    for (let i = 0; i < line.length; i += 6) {
      const t = i / Math.max(1, line.length - 1);
      const k = 0.6 + Math.sin(Math.PI * t) * 0.4;
      add(line[i][0] + r.range(-3, 3), line[i][1] + r.range(-2, 2), base * k * r.range(0.85, 1.15), tone);
      if (r.chance(0.6)) add(line[i][0] + r.range(-8, 8), line[i][1] + r.range(8, 13), base * k * 0.62, r.chance(0.5) ? 'ink' : tone === 'snow' ? 'ink' : 'green');
      if (r.chance(0.4)) add(line[i][0] + r.range(-8, 8), line[i][1] - r.range(9, 13), base * k * 0.7, tone);
    }
  }
  // highland fields [lon, lat, rx°, ry°, count, size, tone]
  // prettier-ignore
  const fields: [number, number, number, number, number, number, Peak['tone']][] = [
    [101.2, 33.0, 1.6, 3.4, 34, 40, 'snow'], [100.8, 37.2, 1.2, 1.8, 14, 34, 'snow'], [102.6, 30.0, 1.2, 1.6, 14, 34, 'ink'],
    [103.6, 32.6, 0.9, 0.9, 8, 30, 'green'], [101.8, 25.0, 1.4, 2.0, 16, 30, 'green'], [104.8, 26.3, 1.2, 1.0, 12, 28, 'green'],
    [108.4, 28.6, 1.4, 1.2, 16, 28, 'green'], [110.6, 27.2, 0.7, 1.2, 9, 28, 'green'], [114.3, 26.6, 0.6, 1.1, 9, 28, 'green'],
    [111.0, 37.6, 0.7, 1.4, 10, 28, 'ochre'], [116.0, 40.7, 1.6, 0.6, 12, 26, 'ink'], [118.2, 41.3, 1.6, 0.6, 9, 24, 'ink'],
    [117.2, 36.2, 0.7, 0.5, 5, 26, 'green'], [115.6, 31.3, 0.8, 0.45, 7, 26, 'green'], [118.3, 30.0, 0.8, 0.6, 8, 26, 'green'],
    [109.6, 30.7, 0.9, 0.6, 8, 30, 'green'], [106.6, 39.8, 1.2, 1.4, 6, 24, 'ochre'], [104.0, 40.8, 2.2, 1.2, 9, 24, 'ochre'],
    [111.6, 39.8, 1.0, 0.5, 5, 22, 'ochre'], [106.6, 24.3, 1.8, 0.8, 12, 26, 'green'], [117.0, 24.8, 1.6, 0.8, 10, 26, 'green'],
    [119.2, 28.4, 0.9, 0.8, 8, 26, 'green'], [108.7, 35.3, 0.8, 0.5, 5, 22, 'ochre'], [121.0, 41.5, 1.2, 0.5, 6, 22, 'ink'],
    [124.0, 41.0, 1.3, 0.6, 7, 28, 'ink'], [113.0, 24.4, 1.4, 0.5, 8, 24, 'green'], [109.0, 25.3, 1.0, 0.8, 8, 26, 'green'],
    [107.5, 31.5, 1.0, 0.5, 6, 24, 'green'], [112.3, 36.4, 0.4, 0.6, 4, 24, 'ochre'], [110.8, 34.1, 0.6, 0.4, 4, 24, 'green'],
  ];
  for (const [lon, lat, rx, ry, n, size, tone] of fields) {
    let tries = 0, made = 0;
    while (made < n && tries++ < n * 14) {
      const a = r.next() * Math.PI * 2, d = Math.sqrt(r.next());
      const [x, y] = project(lon + Math.cos(a) * rx * d, lat + Math.sin(a) * ry * d);
      if (x < -10 || x > MAP_W + 10 || y < 20 || y > MAP_H + 20) continue;
      if (add(x, y, size * r.range(0.7, 1.15) * (1 - d * 0.3), tone === 'snow' && r.chance(0.3) ? 'ink' : tone)) made++;
    }
  }
  // each site becomes a massif: a main peak with lower peaks in front, mist at the feet
  const peaks: (Peak & { mist?: boolean })[] = [];
  for (const st of sites) {
    const w = st.s * 1.15, h = st.s * r.range(0.8, 1.05);
    peaks.push({ x: st.x, y: st.y - st.s * 0.12, w, h, tone: st.tone, mist: true });
    const n = st.s > 22 ? r.int(1, 2) : r.int(0, 1);
    for (let i = 0; i < n; i++) {
      const side = r.chance(0.5) ? -1 : 1;
      const k = r.range(0.5, 0.68);
      peaks.push({ x: st.x + side * w * r.range(0.25, 0.42), y: st.y + r.range(0, 2), w: w * k, h: h * k * r.range(0.85, 1.1), tone: st.tone === 'snow' ? 'ink' : st.tone });
    }
  }
  peaks.sort((a, b) => a.y - b.y);
  return peaks
    .map((p) => peak(p, r) + (p.mist ? `<ellipse cx="${f2(p.x)}" cy="${f2(p.y + 1)}" rx="${f2(p.w * 0.55)}" ry="${f2(p.h * 0.16)}" fill="url(#mist)"/>` : ''))
    .join('');
}

// ------------------------------------------------------------------ painter
export function paintMap() {
  const L = layout();
  const r = rng('map');
  const W = MAP_W, H = MAP_H;
  const pp = paper(W, H, 3301, '#e6d6b2');
  let defs = pp.defs + washTexture('seaw', 77, 0.012, 0.3) + washTexture('landw', 31, 0.008, 0.45);
  defs += `<linearGradient id="seaG" x1="0" y1="0" x2="1" y2="0.3"><stop offset="0.55" stop-color="${SEA}"/><stop offset="1" stop-color="${SEA_DEEP}"/></linearGradient>
<linearGradient id="mG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${mix(C.malachite, C.azurite, 0.35)}" stop-opacity="0.75"/><stop offset="0.55" stop-color="${C.jade}" stop-opacity="0.35"/><stop offset="1" stop-color="${C.ochre}" stop-opacity="0.08"/></linearGradient>
<linearGradient id="mI" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.inkWash}" stop-opacity="0.7"/><stop offset="0.6" stop-color="${C.inkWash}" stop-opacity="0.25"/><stop offset="1" stop-color="${C.inkWash}" stop-opacity="0.04"/></linearGradient>
<linearGradient id="mO" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.ochre}" stop-opacity="0.65"/><stop offset="0.6" stop-color="${C.ochre}" stop-opacity="0.25"/><stop offset="1" stop-color="${C.ochre}" stop-opacity="0.04"/></linearGradient>
<linearGradient id="mS" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6f1e4" stop-opacity="0.95"/><stop offset="0.3" stop-color="#f6f1e4" stop-opacity="0.6"/><stop offset="0.45" stop-color="${C.azurite}" stop-opacity="0.45"/><stop offset="1" stop-color="${C.inkWash}" stop-opacity="0.05"/></linearGradient>
<radialGradient id="vig" cx="0.5" cy="0.5" r="0.75"><stop offset="0.6" stop-color="#5a3d1c" stop-opacity="0"/><stop offset="1" stop-color="#3a2410" stop-opacity="0.45"/></radialGradient>
<radialGradient id="mist"><stop offset="0" stop-color="#e6d6b2" stop-opacity="0.85"/><stop offset="1" stop-color="#e6d6b2" stop-opacity="0"/></radialGradient>
<filter id="blur18" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="18"/></filter>
<filter id="blur4" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3"/></filter>
<clipPath id="seaClip"><path d="${pathD(L.sea, true)}"/></clipPath>`;

  let b = pp.body;
  // land colour washes (mineral pigments, very light)
  const wash = (lon: number, lat: number, rx: number, ry: number, col: string, op: number) => {
    const [x, y] = project(lon, lat);
    return `<ellipse cx="${f2(x)}" cy="${f2(y)}" rx="${f2(rx * 40)}" ry="${f2(ry * 33)}" fill="${col}" opacity="${op}"/>`;
  };
  b += `<g filter="url(#blur18)">` +
    wash(103, 39, 4, 3, C.ochre, 0.32) + wash(110, 39.5, 3, 2.2, C.gamboge, 0.18) + wash(101.5, 32, 2, 5, C.inkWash, 0.22) +
    wash(106, 30.4, 2.4, 1.6, C.malachite, 0.2) + wash(112.5, 26, 4, 2.6, C.malachite, 0.18) + wash(106, 24, 3, 2, C.jade, 0.22) +
    wash(117.5, 27.5, 2.2, 3, C.jade, 0.18) + wash(115, 35.5, 3, 2.4, C.gamboge, 0.12) + wash(110.5, 33.4, 3.5, 1, C.malachite, 0.18) +
    `</g>`;
  b += `<rect width="${W}" height="${H}" fill="${C.ochre}" opacity="0.10" filter="url(#landw)"/>`;

  // rivers: soft wash halo, then a brush line swelling downstream
  for (const rv of L.rivers) {
    b += `<path d="${pathD(rv.pts)}" fill="none" stroke="${SEA}" stroke-width="7" stroke-linecap="round" opacity="0.35" filter="url(#blur4)"/>`;
    const big = rv.name === '黄河' || rv.name === '长江';
    const n = rv.pts.length, seg = 20;
    // banks (ink) then water (wash) for the great rivers; single ink line for the others
    for (const pass of big ? [0, 1] : [0]) {
      for (let i = 0; i < n - 1; i += seg) {
        const chunk = rv.pts.slice(i, Math.min(n, i + seg + 1));
        const t = i / n;
        const w = big ? 2.6 + 3.4 * t : 1.1 + 1.4 * t;
        const col = pass ? (rv.name === '黄河' ? '#b7a681' : '#9fb3ab') : RIVER;
        const ww = pass ? Math.max(0.6, w - 2.0) : w;
        b += `<path d="${pathD(chunk)}" fill="none" stroke="${col}" stroke-width="${f2(ww)}" stroke-linecap="round" stroke-linejoin="round" opacity="${pass ? 1 : 0.85}"/>`;
      }
    }
  }
  // lakes
  for (const [, lon, lat, rad] of LAKES) {
    const [x, y] = project(lon, lat);
    const lr = rng('lake' + lon);
    const d = blob(x, y, rad * 40, rad * 30, lr, 0.35, 14);
    b += `<path d="${d}" fill="${SEA}" opacity="0.9" filter="url(#seaw)"/><path d="${d}" fill="none" stroke="${RIVER}" stroke-width="1.1" opacity="0.8"/>`;
  }

  // sea
  b += `<path d="${pathD(L.sea, true)}" fill="url(#seaG)" opacity="0.92" filter="url(#seaw)"/>`;
  let waves = '';
  const wr = rng('waves');
  for (let y = 6; y < H; y += 10) {
    for (let x = ((y / 10) % 2) * 9; x < W; x += 18) {
      const xx = x + wr.range(-2, 2);
      if (!inPoly(xx, y, L.sea)) continue;
      const dc = distTo(xx, y, L.coast);
      if (dc < 14 || L.islands.some((i) => distTo(xx, y, i) < 10)) continue;
      if (wr.chance(0.25 + Math.max(0, 0.5 - dc / 200))) continue;
      waves += `M${f2(xx - 7)},${f2(y)} Q${f2(xx - 3.5)},${f2(y - 4)} ${f2(xx)},${f2(y)} Q${f2(xx + 3.5)},${f2(y - 4)} ${f2(xx + 7)},${f2(y)}`;
    }
  }
  b += `<path d="${waves}" fill="none" stroke="${mix(RIVER, C.paper, 0.2)}" stroke-width="0.8" opacity="0.3"/>`;
  // coast echo lines inside the sea
  b += `<g clip-path="url(#seaClip)" fill="none" stroke="${RIVER}">`;
  for (const [d, op, sw] of [[-5, 0.45, 0.9], [-10, 0.25, 0.7], [-16, 0.13, 0.6]] as const) {
    b += `<path d="${pathD(offset(L.coast, d))}" stroke-width="${sw}" opacity="${op}"/>`;
    for (const isl of L.islands) b += `<path d="${pathD(offset(isl, -d), true)}" stroke-width="${sw}" opacity="${op}"/>`;
  }
  b += `</g>`;
  // islands (land) and coastline brush
  for (const isl of L.islands) b += `<path d="${pathD(isl, true)}" fill="#e3d2ab"/>`;
  const cr = rng('coast');
  for (let i = 0; i < L.coast.length - 1; i += 40) {
    const chunk = L.coast.slice(i, Math.min(L.coast.length, i + 44));
    b += `<path d="${brush(chunk, cr.range(2.2, 3.2), cr, { taperIn: 0.08, taperOut: 0.08, jitter: 0.25 })}" fill="${C.ink}" opacity="0.88"/>`;
  }
  for (const isl of L.islands) b += `<path d="${pathD(isl, true)}" fill="none" stroke="${C.ink}" stroke-width="1.8" stroke-linejoin="round" opacity="0.85"/>`;

  // desert dunes (凉州 / 河套)
  b += dunes(L);
  // mountains
  b += mountainLayer(L);
  // the Great Wall along the northern frontier
  b += greatWall(L);

  // region (州) names: large, faint calligraphy
  // prettier-ignore
  const regions: [string, number, number, boolean][] = [
    ['幽州', 119.6, 41.6, false], ['冀州', 115.6, 39.5, true], ['并州', 110.8, 38.7, true], ['青州', 118.4, 36.0, true],
    ['兖州', 116.0, 35.6, false], ['豫州', 115.0, 33.5, true], ['徐州', 118.7, 33.8, true], ['司隶', 111.3, 35.6, false],
    ['雍州', 107.7, 36.4, true], ['凉州', 102.4, 39.6, true], ['荆州', 110.5, 29.0, true], ['扬州', 118.2, 29.5, true],
    ['益州', 103.0, 31.8, true], ['交州', 109.0, 23.0, false],
  ];
  for (const [nm, lon, lat, vert] of regions) {
    const [x, y] = project(lon, lat);
    const fs = 40;
    if (vert) {
      b += [...nm].map((ch, i) => `<text x="${f2(x)}" y="${f2(y + i * fs * 1.02)}" font-size="${fs}" font-family="${FONT_BRUSH}" text-anchor="middle" fill="${C.ink}" opacity="0.16">${ch}</text>`).join('');
    } else b += `<text x="${f2(x)}" y="${f2(y)}" font-size="${fs}" font-family="${FONT_BRUSH}" text-anchor="middle" letter-spacing="${fs * 0.2}" fill="${C.ink}" opacity="0.16">${nm}</text>`;
  }
  // sea / river names
  const label = (t: string, lon: number, lat: number, fs: number, col: string, op: number, vertical = true) => {
    const [x, y] = project(lon, lat);
    if (!vertical) return `<text x="${f2(x)}" y="${f2(y)}" font-size="${fs}" font-family="${FONT_KAI}" fill="${col}" opacity="${op}" letter-spacing="${fs * 0.5}" text-anchor="middle">${t}</text>`;
    return [...t].map((ch, i) => `<text x="${f2(x)}" y="${f2(y + i * fs * 1.1)}" font-size="${fs}" font-family="${FONT_KAI}" text-anchor="middle" fill="${col}" opacity="${op}">${ch}</text>`).join('');
  };
  b += label('渤海', 119.7, 39.0, 18, RIVER, 0.6) + label('东海', 123.7, 30.6, 24, RIVER, 0.55) + label('黄海', 123.4, 36.0, 22, RIVER, 0.55) + label('涨海', 116.4, 21.6, 22, RIVER, 0.55, false);
  b += label('河', 108.6, 38.6, 13, RIVER, 0.7) + label('江', 110.4, 31.1, 13, RIVER, 0.7) + label('淮', 116.6, 32.95, 12, RIVER, 0.7) + label('汉', 109.5, 32.9, 12, RIVER, 0.7);

  // roads: paper underlay + cinnabar-brown dashed track, gently curved
  const seen = new Set<string>();
  let roads = '';
  for (const c of CITIES)
    for (const nb of NEIGHBORS.get(c.name)!) {
      const key = [c.name, nb].sort().join('-');
      if (seen.has(key)) continue;
      seen.add(key);
      const d = CITIES.find((x) => x.name === nb)!;
      const rr = rng(key);
      const mx = (c.x + d.x) / 2, my = (c.y + d.y) / 2;
      const len = Math.hypot(d.x - c.x, d.y - c.y);
      const bend = rr.range(-0.12, 0.12) * len;
      const nx = -(d.y - c.y) / len, ny = (d.x - c.x) / len;
      roads += `M${c.x},${c.y} Q${f2(mx + nx * bend)},${f2(my + ny * bend)} ${d.x},${d.y}`;
    }
  b += `<path d="${roads}" fill="none" stroke="#efe3c4" stroke-width="3.6" stroke-linecap="round" opacity="0.55"/>`;
  b += `<path d="${roads}" fill="none" stroke="#8c3a22" stroke-width="1.5" stroke-dasharray="4.5 2.5" stroke-linecap="round" opacity="0.8"/>`;

  // city icons
  for (const c of CITIES) b += cityIcon(c.size, c.x, c.y);

  // decorations: title cartouche (bottom-left), compass (sea), ship, seal
  b += cartouche(22, 560, r) + compass(944, 520) + ship(700, 735, rng('ship1'), 1) + ship(930, 300, rng('ship2'), 0.85);
  // vignette and a thin double frame
  b += `<rect width="${W}" height="${H}" fill="url(#vig)"/>`;
  b += `<rect x="4" y="4" width="${W - 8}" height="${H - 8}" fill="none" stroke="${C.ink}" stroke-width="2" opacity="0.55"/><rect x="9" y="9" width="${W - 18}" height="${H - 18}" fill="none" stroke="${C.ink}" stroke-width="0.8" opacity="0.4"/>`;
  return { svg: svgDoc(W, H, b, defs), w: W, h: H, ax: 0, ay: 0 };
}

function dunes(L: Layout) {
  const r = rng('dunes');
  const reserved: Rect[] = [...L.icons, ...L.flags, ...L.names.map((n) => n.rect)];
  let d = '';
  const areas: [number, number, number, number, number][] = [[103.6, 39.8, 2.4, 1.3, 40], [108.5, 39.4, 1.4, 0.9, 22], [101.6, 40.9, 1.5, 0.9, 16]];
  for (const [lon, lat, rx, ry, n] of areas)
    for (let i = 0; i < n; i++) {
      const a = r.next() * Math.PI * 2, k = Math.sqrt(r.next());
      const [x, y] = project(lon + Math.cos(a) * rx * k, lat + Math.sin(a) * ry * k);
      if (reserved.some((q) => hitsRect(x, y, q, 8))) continue;
      const w = r.range(8, 16);
      d += `M${f2(x - w)},${f2(y)} Q${f2(x - w * 0.2)},${f2(y - w * 0.45)} ${f2(x + w)},${f2(y + 1)}`;
    }
  return `<path d="${d}" fill="none" stroke="#8a6234" stroke-width="1" stroke-linecap="round" opacity="0.45"/>`;
}

function greatWall(L: Layout) {
  // prettier-ignore
  const ll: [number, number][] = [[100.2, 39.4], [101.6, 38.9], [103.2, 38.6], [104.6, 39.1], [106.0, 40.1], [107.4, 41.25], [109.5, 41.6], [111.8, 41.2], [113.6, 40.85], [115.4, 40.95], [117.2, 40.55], [118.6, 40.25], [119.75, 40.05]];
  const pts = wiggle(resample(ll.map(P), 2), rng('wall'), 1.5, 6);
  const reserved: Rect[] = [...L.icons, ...L.flags, ...L.names.map((n) => n.rect)];
  const runs: Pt[][] = [];
  let cur: Pt[] = [];
  for (const p of pts) {
    if (reserved.some((q) => hitsRect(p[0], p[1], q, 3)) || p[0] < 12) {
      if (cur.length > 2) runs.push(cur);
      cur = [];
    } else cur.push(p);
  }
  if (cur.length > 2) runs.push(cur);
  let s = '';
  for (const run of runs) {
    s += `<path d="${pathD(run)}" fill="none" stroke="${C.ink}" stroke-width="2.6" stroke-linejoin="round" opacity="0.75"/>`;
    s += `<path d="${pathD(run)}" fill="none" stroke="#cdb48a" stroke-width="1.2" stroke-linejoin="round"/>`;
    for (let i = 4; i < run.length - 2; i += 3) {
      const [x, y] = run[i];
      s += `<rect x="${f2(x - 0.7)}" y="${f2(y - 2.6)}" width="1.4" height="1.6" fill="${C.ink}" opacity="0.8"/>`;
    }
    for (let i = 10; i < run.length - 6; i += 22) {
      const [x, y] = run[i];
      s += `<rect x="${f2(x - 2.2)}" y="${f2(y - 5)}" width="4.4" height="5" fill="#cdb48a" stroke="${C.ink}" stroke-width="0.7"/><path d="M${f2(x - 3.4)},${f2(y - 4.6)} L${f2(x)},${f2(y - 7.4)} L${f2(x + 3.4)},${f2(y - 4.6)}Z" fill="${C.ink}"/>`;
    }
  }
  return s;
}

function cartouche(x: number, y: number, r: Rng) {
  const w = 52, h = 190;
  const title = '汉末天下形势图';
  let s = `<rect x="${x + 3}" y="${y + 3}" width="${w}" height="${h}" fill="${C.ink}" opacity="0.15"/>`;
  s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#efe4c8"/>`;
  s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${C.ink}" stroke-width="2"/><rect x="${x + 4}" y="${y + 4}" width="${w - 8}" height="${h - 8}" fill="none" stroke="${C.ink}" stroke-width="0.8"/>`;
  s += [...title].map((ch, i) => `<text x="${x + w / 2}" y="${y + 30 + i * 22}" font-size="21" font-family="${FONT_BRUSH}" text-anchor="middle" fill="${C.ink}">${ch}</text>`).join('');
  s += seal(x + w + 6, y + h - 34, 28, '墨英', r);
  return s;
}

function compass(cx: number, cy: number) {
  const R = 34;
  let s = `<g opacity="0.75">`;
  s += `<circle cx="${cx}" cy="${cy}" r="${R}" fill="#e9dcc0" opacity="0.55" stroke="${C.ink}" stroke-width="1.4"/><circle cx="${cx}" cy="${cy}" r="${R - 5}" fill="none" stroke="${C.ink}" stroke-width="0.6"/>`;
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4 - Math.PI / 2;
    const long = i % 2 === 0;
    const len = long ? R - 6 : R * 0.5;
    const tip: Pt = [cx + Math.cos(a) * len, cy + Math.sin(a) * len];
    const s1: Pt = [cx + Math.cos(a + Math.PI / 2) * 4.5, cy + Math.sin(a + Math.PI / 2) * 4.5];
    const s2: Pt = [cx + Math.cos(a - Math.PI / 2) * 4.5, cy + Math.sin(a - Math.PI / 2) * 4.5];
    s += `<path d="M${f2(tip[0])},${f2(tip[1])} L${f2(s1[0])},${f2(s1[1])} L${cx},${cy}Z" fill="${i === 0 ? C.cinnabar : C.ink}"/><path d="M${f2(tip[0])},${f2(tip[1])} L${f2(s2[0])},${f2(s2[1])} L${cx},${cy}Z" fill="#efe4c8" stroke="${C.ink}" stroke-width="0.6"/>`;
  }
  // 北 南 东 西 (north up)
  const lab: [string, number, number][] = [['北', 0, -R - 7], ['南', 0, R + 17], ['东', R + 12, 5], ['西', -R - 12, 5]];
  for (const [t, dx, dy] of lab) s += `<text x="${cx + dx}" y="${cy + dy}" font-size="14" font-family="${FONT_KAI}" text-anchor="middle" fill="${t === '北' ? C.cinnabar : C.ink}">${t}</text>`;
  return s + `</g>`;
}

function ship(x: number, y: number, r: Rng, k: number) {
  const s = (v: number) => f2(v * k);
  let p = `<g transform="translate(${x},${y})" opacity="0.8">`;
  p += `<path d="M${s(-16)},${s(0)} Q${s(0)},${s(7)} ${s(17)},${s(-2)} L${s(13)},${s(-4)} L${s(-13)},${s(-4)}Z" fill="${C.inkSoft}"/>`;
  p += `<path d="M${s(-1)},${s(-4)} L${s(-1)},${s(-26)}" stroke="${C.ink}" stroke-width="1"/>`;
  p += `<path d="M${s(-1)},${s(-25)} Q${s(10)},${s(-17)} ${s(9)},${s(-7)} L${s(-1)},${s(-7)}Z" fill="#e9dcc0" stroke="${C.ink}" stroke-width="0.8"/>`;
  for (let i = 0; i < 3; i++) p += `<path d="M${s(-1)},${s(-21 + i * 5)} L${s(8 + i * 0.6)},${s(-19 + i * 5)}" stroke="${C.ink}" stroke-width="0.5"/>`;
  p += `<path d="M${s(-20)},${s(4)} Q${s(-10)},${s(1)} ${s(0)},${s(4)} T${s(20)},${s(4)}" fill="none" stroke="${RIVER}" stroke-width="0.8"/>`;
  void r;
  return p + `</g>`;
}

// ------------------------------------------------------------------ names overlay
export function paintCityNames() {
  const L = layout();
  let b = '';
  for (const n of L.names) {
    const col = n.c.size === 4 ? '#4a2a14' : C.ink;
    const weight = n.c.size === 1 ? ' font-weight="bold"' : '';
    const ls = n.c.name.length === 1 ? 0 : 0;
    b += `<text x="${f2(n.x)}" y="${f2(n.y)}" font-size="${n.fs}" font-family="${FONT_KAI}"${weight} text-anchor="middle" letter-spacing="${ls}" fill="${col}" stroke="#f1e6c9" stroke-width="3.2" stroke-linejoin="round" paint-order="stroke" stroke-opacity="0.92">${n.c.name}</text>`;
  }
  return { svg: svgDoc(MAP_W, MAP_H, b), w: MAP_W, h: MAP_H, ax: 0, ay: 0 };
}
