// Court backdrops for strategy-layer dialogues (ad/background/bg001..003):
// 1 a lord's audience hall with a landscape screen, 2 a war-council tent,
// 3 the imperial throne hall. One-point perspective, ink lines with light
// mineral colour. The dialogue panel sits at the bottom centre (and the CSS
// darkens the lower half), so the focal point is in the upper middle.
import { FONT_KAI } from '../ink.ts';
import { official } from './_scenery_art.ts';
import { C, Doc, f2, flag, mist, mix, path, peak, pine, range, rng, roof, type Pt, type Rng } from './_scenery_kit.ts';

interface Cam {
  vx: number;
  vy: number;
  f: number;
  h: number;
}
const P = (c: Cam, X: number, Y: number, Z: number): Pt => [c.vx + (X * c.f) / Z, c.vy + ((c.h - Y) * c.f) / Z];
const quad = (pts: Pt[]) => 'M' + pts.map(([x, y]) => `${f2(x)},${f2(y)}`).join('L') + 'Z';

function room(d: Doc, c: Cam, o: { hw: number; top: number; z0: number; z1: number; floor: string; wall: string; ceil: string; ink: string }) {
  const { hw, top, z0, z1 } = o;
  let s = '';
  // floor
  s += path(quad([P(c, -hw, 0, z0), P(c, hw, 0, z0), P(c, hw, 0, z1), P(c, -hw, 0, z1)]), o.floor);
  // floor tiles converging to the vanishing point
  for (let x = -hw; x <= hw; x += 1) {
    const [a, b] = [P(c, x, 0, z0), P(c, x, 0, z1)];
    s += `<path d="M${f2(a[0])},${f2(a[1])}L${f2(b[0])},${f2(b[1])}" stroke="${o.ink}" stroke-width="1.2" opacity="0.25"/>`;
  }
  for (let z = z0; z <= z1; z *= 1.12) {
    const [a, b] = [P(c, -hw, 0, z), P(c, hw, 0, z)];
    s += `<path d="M${f2(a[0])},${f2(a[1])}L${f2(b[0])},${f2(b[1])}" stroke="${o.ink}" stroke-width="1" opacity="0.2"/>`;
  }
  // side walls and ceiling
  for (const sd of [-1, 1]) s += path(quad([P(c, sd * hw, 0, z0), P(c, sd * hw, 0, z1), P(c, sd * hw, top, z1), P(c, sd * hw, top, z0)]), o.wall);
  s += path(quad([P(c, -hw, top, z0), P(c, hw, top, z0), P(c, hw, top, z1), P(c, -hw, top, z1)]), o.ceil);
  // ceiling beams
  for (let z = z0 + 1; z < z1; z += 2) {
    const [a, b] = [P(c, -hw, top, z), P(c, hw, top, z)];
    const th = (0.35 * c.f) / z;
    s += `<rect x="${f2(a[0])}" y="${f2(a[1])}" width="${f2(b[0] - a[0])}" height="${f2(th)}" fill="${mix(o.ceil, o.ink, 0.4)}"/>`;
  }
  // back wall
  s += path(quad([P(c, -hw, 0, z1), P(c, hw, 0, z1), P(c, hw, top, z1), P(c, -hw, top, z1)]), mix(o.wall, '#ffffff', 0.15));
  return s;
}

function column(c: Cam, X: number, Z: number, H: number, rad: number, col: string, ink: string, gold = C.gold) {
  const [bx, by] = P(c, X, 0, Z), [, ty] = P(c, X, H, Z);
  const w = (rad * 2 * c.f) / Z;
  let s = `<rect x="${f2(bx - w / 2)}" y="${f2(ty)}" width="${f2(w)}" height="${f2(by - ty)}" fill="${col}" stroke="${ink}" stroke-width="${f2(Math.max(1, w * 0.05))}"/>`;
  s += `<rect x="${f2(bx - w * 0.3)}" y="${f2(ty)}" width="${f2(w * 0.15)}" height="${f2(by - ty)}" fill="#fff" opacity="0.18"/>`;
  s += `<rect x="${f2(bx + w * 0.2)}" y="${f2(ty)}" width="${f2(w * 0.3)}" height="${f2(by - ty)}" fill="${ink}" opacity="0.22"/>`;
  // base drum and capital bands
  s += `<rect x="${f2(bx - w * 0.65)}" y="${f2(by - w * 0.5)}" width="${f2(w * 1.3)}" height="${f2(w * 0.5)}" fill="${mix(C.paperDark, ink, 0.2)}" stroke="${ink}" stroke-width="${f2(Math.max(1, w * 0.04))}"/>`;
  s += `<rect x="${f2(bx - w / 2)}" y="${f2(ty)}" width="${f2(w)}" height="${f2(w * 0.4)}" fill="${gold}" opacity="0.85"/>`;
  return s;
}

/** Hanging drapes (帷幔) across the top edge. */
function drapes(W: number, col: string, ink: string, r: Rng, n = 7, depth = 120) {
  let s = '';
  const sw = W / n;
  for (let i = 0; i < n; i++) {
    const x0 = i * sw, x1 = x0 + sw;
    const dd = depth * r.range(0.8, 1.1);
    s += `<path d="M${f2(x0)},0L${f2(x1)},0L${f2(x1)},${f2(dd * 0.3)}Q${f2((x0 + x1) / 2)},${f2(dd)} ${f2(x0)},${f2(dd * 0.3)}Z" fill="${col}" stroke="${ink}" stroke-width="2"/>`;
    for (let k = 1; k < 4; k++) s += `<path d="M${f2(x0 + (sw * k) / 4)},0Q${f2(x0 + (sw * k) / 4 + 4)},${f2(dd * 0.4)} ${f2(x0 + sw / 2 + (k - 2) * 6)},${f2(dd * 0.75)}" stroke="${ink}" stroke-width="1" fill="none" opacity="0.35"/>`;
    s += `<circle cx="${f2(x1)}" cy="${f2(dd * 0.3)}" r="7" fill="${C.gold}" stroke="${ink}" stroke-width="1.5"/>`;
    s += `<path d="M${f2(x1)},${f2(dd * 0.3 + 7)}v${f2(dd * 0.4)}" stroke="${C.gold}" stroke-width="3"/>`;
  }
  s += `<rect x="0" y="0" width="${W}" height="14" fill="${mix(col, ink, 0.35)}"/>`;
  return s;
}

/** Painted landscape folding screen (屏风) in a frame. */
function screen(d: Doc, x: number, y: number, w: number, h: number, r: Rng, panels = 3) {
  let s = `<rect x="${f2(x - 10)}" y="${f2(y - 10)}" width="${f2(w + 20)}" height="${f2(h + 20)}" fill="#3a1a12" stroke="${C.ink}" stroke-width="3"/>`;
  s += `<rect x="${f2(x)}" y="${f2(y)}" width="${f2(w)}" height="${f2(h)}" fill="#efe6cf"/>`;
  const cid = d.id('c');
  d.def(`<clipPath id="${cid}"><rect x="${f2(x)}" y="${f2(y)}" width="${f2(w)}" height="${f2(h)}"/></clipPath>`);
  let inner = '';
  inner += `<circle cx="${f2(x + w * 0.78)}" cy="${f2(y + h * 0.22)}" r="${f2(h * 0.08)}" fill="${C.cinnabar}" opacity="0.7"/>`;
  inner += range(d, r, { x0: x - 20, x1: x + w + 20, base: y + h * 0.7, hMin: h * 0.3, hMax: h * 0.6, n: 5, wk: 1.1, tone: '#7a858c', alpha: 0.4, style: 'none', lw: 1, fade: 0.8, foot: 0 });
  inner += peak(d, { cx: x + w * 0.3, base: y + h * 1.02, w: w * 0.5, h: h * 0.75, tone: C.inkSoft, alpha: 0.75, style: 'hemp', lw: 1, fade: 0.5, ink: C.ink }, r);
  inner += peak(d, { cx: x + w * 0.75, base: y + h * 1.05, w: w * 0.4, h: h * 0.5, tone: C.inkSoft, alpha: 0.7, style: 'axe', lw: 1, fade: 0.5, ink: C.ink }, r);
  inner += mist(d, r, x, x + w, y + h * 0.82, h * 0.12, '#efe6cf', 0.9, 6);
  for (let i = 0; i < 4; i++) inner += pine(x + w * (0.08 + i * 0.05), y + h, h * (0.25 + 0.06 * i), r, C.ink, 0.9);
  s += `<g clip-path="url(#${cid})">${inner}</g>`;
  for (let i = 1; i < panels; i++) s += `<rect x="${f2(x + (w * i) / panels - 4)}" y="${f2(y - 10)}" width="8" height="${f2(h + 20)}" fill="#3a1a12"/>`;
  return s;
}

function lamp(x: number, y: number, s: number, d: Doc) {
  return `<circle cx="${f2(x)}" cy="${f2(y)}" r="${f2(s * 3)}" fill="#f2c06a" opacity="0.22" filter="${d.blur(s)}"/>` +
    `<path d="M${f2(x)},${f2(y - s * 2.4)}v${f2(s * 0.8)}" stroke="${C.ink}" stroke-width="2"/>` +
    `<ellipse cx="${f2(x)}" cy="${f2(y)}" rx="${f2(s * 0.8)}" ry="${f2(s * 1.1)}" fill="${C.cinnabar}" stroke="${C.ink}" stroke-width="2"/>` +
    `<ellipse cx="${f2(x)}" cy="${f2(y)}" rx="${f2(s * 0.4)}" ry="${f2(s * 1.0)}" fill="#f2b05a" opacity="0.6"/>` +
    `<path d="M${f2(x - s * 0.6)},${f2(y - s * 1.0)}h${f2(s * 1.2)}M${f2(x - s * 0.6)},${f2(y + s * 1.0)}h${f2(s * 1.2)}" stroke="${C.gold}" stroke-width="3"/>` +
    `<path d="M${f2(x)},${f2(y + s * 1.1)}v${f2(s * 0.9)}" stroke="${C.cinnabar}" stroke-width="2"/>`;
}

/** Low desk (案) with a seated lord's silhouette behind it. */
function dais(c: Cam, Z: number, w: number, ink: string, r: Rng) {
  let s = '';
  // steps
  for (let i = 0; i < 3; i++) {
    const zz = Z - 0.6 + i * 0.25, yy = 0.15 * (3 - i);
    s += path(quad([P(c, -w - i * 0.3, yy, zz), P(c, w + i * 0.3, yy, zz), P(c, w + i * 0.3, 0, zz), P(c, -w - i * 0.3, 0, zz)]), mix('#d8c8a6', ink, 0.1 + i * 0.05), ` stroke="${ink}" stroke-width="1.5"`);
  }
  const [x0, y0] = P(c, -w * 0.6, 0.85, Z), [x1, y1] = P(c, w * 0.6, 0.45, Z);
  s += `<rect x="${f2(x0)}" y="${f2(y0)}" width="${f2(x1 - x0)}" height="${f2(y1 - y0)}" fill="#3a1a12" stroke="${ink}" stroke-width="2"/>`;
  s += `<rect x="${f2(x0)}" y="${f2(y0)}" width="${f2(x1 - x0)}" height="${f2((y1 - y0) * 0.25)}" fill="${C.cinnabar}" opacity="0.8"/>`;
  // scrolls and a seal box on the desk
  s += `<rect x="${f2(x0 + (x1 - x0) * 0.15)}" y="${f2(y0 - 8)}" width="${f2((x1 - x0) * 0.25)}" height="8" rx="4" fill="#efe6cf" stroke="${ink}" stroke-width="1.5"/>`;
  s += `<rect x="${f2(x0 + (x1 - x0) * 0.65)}" y="${f2(y0 - 18)}" width="22" height="18" fill="${C.gold}" stroke="${ink}" stroke-width="1.5"/>`;
  void r;
  return s;
}

function hall(W: number, H: number) {
  const d = new Doc(W, H, 1101);
  const r = rng('court1');
  const c: Cam = { vx: W / 2, vy: H * 0.43, f: 760, h: 1.7 };
  let s = `<rect width="${W}" height="${H}" fill="#e6d8b8"/>`;
  s += room(d, c, { hw: 6, top: 6.5, z0: 1.2, z1: 13, floor: '#cdb98f', wall: '#e8dcc0', ceil: '#6a3a24', ink: C.ink });
  // the landscape screen behind the dais
  const [sx0, sy0] = P(c, -3.6, 5.2, 13), [sx1, sy1] = P(c, 3.6, 0.6, 13);
  s += screen(d, sx0, sy0, sx1 - sx0, sy1 - sy0, r, 3);
  s += dais(c, 11.5, 3, C.ink, r);
  // columns
  for (let z = 3; z <= 12; z += 3) for (const sd of [-1, 1]) s += column(c, sd * 4.2, z, 6.5, 0.32, '#9a2e1e', C.ink);
  // banners hanging between the columns
  for (let z = 4.5; z <= 11; z += 3)
    for (const sd of [-1, 1]) {
      const [x, y] = P(c, sd * 4.9, 5.6, z), [, y2] = P(c, sd * 4.9, 2.6, z);
      const bw = (0.7 * c.f) / z;
      s += `<path d="M${f2(x - bw / 2)},${f2(y)}H${f2(x + bw / 2)}V${f2(y2)}L${f2(x)},${f2(y2 - bw * 0.3)}L${f2(x - bw / 2)},${f2(y2)}Z" fill="${sd < 0 ? C.indigo : C.malachite}" stroke="${C.ink}" stroke-width="1.5" opacity="0.92"/>`;
    }
  // officials lining both sides
  for (let z = 10; z >= 3.2; z -= 1.15)
    for (const sd of [-1, 1]) {
      const [x, y] = P(c, sd * 2.7, 0, z);
      s += official(x, y, 5.2 / z, -sd, r, Math.round(z * 3) + (sd > 0 ? 1 : 0));
    }
  s += lamp(W * 0.12, H * 0.33, 22, d) + lamp(W * 0.88, H * 0.33, 22, d);
  s += drapes(W, '#a8321f', C.ink, r, 8, 110);
  s += `<rect width="${W}" height="${H}" fill="#000" filter="${d.wash(0.006, 0.5, 3)}" opacity="0.12"/>`;
  s += d.paperGrain(0.8);
  return d.svg(s);
}

function warTent(W: number, H: number) {
  const d = new Doc(W, H, 1102);
  const r = rng('court2');
  const canvas = '#d9c9a2';
  let s = `<rect width="${W}" height="${H}" fill="${canvas}"/>`;
  // tent walls: sloping canvas panels meeting at the ridge, lit by lamps
  const ridgeY = 40;
  s += `<path d="M0,0H${W}V${H * 0.7}H0Z" fill="${d.lin([[0, '#8a6a48', 1], [1, '#d4c09a', 1]], 0, 0, 0, H * 0.7)}"/>`;
  for (let i = 0; i <= 12; i++) {
    const x = (W * i) / 12;
    s += `<path d="M${W / 2},${ridgeY}L${f2(x + (x - W / 2) * 0.4)},${f2(H * 0.7)}" stroke="#5a4028" stroke-width="3" opacity="0.4"/>`;
  }
  for (let k = 0; k < 4; k++) s += `<path d="M0,${f2(H * (0.18 + k * 0.14))}Q${W / 2},${f2(H * (0.12 + k * 0.14))} ${W},${f2(H * (0.18 + k * 0.14))}" stroke="#5a4028" stroke-width="2" fill="none" opacity="0.25"/>`;
  // back wall: big 帅 banner flanked by spears
  s += `<rect x="${W / 2 - 110}" y="120" width="220" height="300" fill="${C.cinnabar}" stroke="${C.ink}" stroke-width="3"/>`;
  s += `<rect x="${W / 2 - 96}" y="134" width="192" height="272" fill="none" stroke="${C.gold}" stroke-width="3"/>`;
  s += `<text x="${W / 2}" y="330" text-anchor="middle" font-family="${FONT_KAI}" font-size="170" fill="${C.ink}" opacity="0.88">帅</text>`;
  for (const sd of [-1, 1])
    for (let k = 0; k < 4; k++) {
      const x = W / 2 + sd * (170 + k * 36);
      s += `<path d="M${x},560V${150 + k * 6}" stroke="#4a2c18" stroke-width="6"/>`;
      s += `<path d="M${x - 9},${160 + k * 6}L${x},${110 + k * 6}L${x + 9},${160 + k * 6}Z" fill="#c9c6bc" stroke="${C.ink}" stroke-width="2"/>`;
      s += `<path d="M${x},${170 + k * 6}q${sd * 14},10 ${sd * 4},28" stroke="${C.cinnabar}" stroke-width="5" fill="none"/>`;
    }
  // ground: rug and earth
  s += `<path d="M0,${H * 0.7}H${W}V${H}H0Z" fill="#a88a62"/>`;
  s += `<path d="M${W * 0.2},${H * 0.72}H${W * 0.8}L${W * 0.98},${H}H${W * 0.02}Z" fill="#7a2a1e"/>`;
  s += `<path d="M${W * 0.23},${H * 0.735}H${W * 0.77}L${W * 0.93},${H}H${W * 0.07}Z" fill="none" stroke="${C.gold}" stroke-width="4" opacity="0.8"/>`;
  // command table with a campaign map
  const tx = W / 2, ty = H * 0.62;
  s += `<path d="M${tx - 300},${ty}H${tx + 300}L${tx + 340},${ty + 60}H${tx - 340}Z" fill="#5a3420" stroke="${C.ink}" stroke-width="3"/>`;
  s += `<rect x="${tx - 340}" y="${ty + 60}" width="680" height="24" fill="#3a2214" stroke="${C.ink}" stroke-width="3"/>`;
  for (const lx of [-320, 300]) s += `<rect x="${tx + lx}" y="${ty + 84}" width="20" height="70" fill="#3a2214" stroke="${C.ink}" stroke-width="2"/>`;
  s += `<path d="M${tx - 220},${ty + 6}H${tx + 220}L${tx + 240},${ty + 52}H${tx - 240}Z" fill="#e9dcbc" stroke="${C.ink}" stroke-width="2"/>`;
  const mapPts: Pt[] = [];
  for (let i = 0; i < 9; i++) mapPts.push([tx - 200 + i * 50, ty + 20 + Math.sin(i * 1.3) * 10 + i * 2]);
  s += path(`M${mapPts.map(([x, y]) => `${f2(x)},${f2(y)}`).join('L')}`, 'none', ` stroke="${C.azurite}" stroke-width="3"`);
  for (let i = 0; i < 6; i++) s += `<path d="M${f2(tx - 180 + r.range(0, 360))},${f2(ty + r.range(14, 44))}l6,-12l6,12z" fill="${C.inkWash}"/>`;
  for (let i = 0; i < 5; i++) s += flag(tx - 160 + i * 80, ty + 40, 26, i % 2 ? C.cinnabar : C.indigo, C.ink, r, 1);
  // war drum and weapon rack
  s += `<ellipse cx="${W * 0.1}" cy="${H * 0.62}" rx="70" ry="90" fill="#7a2a1e" stroke="${C.ink}" stroke-width="4"/><ellipse cx="${W * 0.1 + 20}" cy="${H * 0.62}" rx="50" ry="84" fill="#e9dcbc" stroke="${C.ink}" stroke-width="3"/>`;
  for (let k = 0; k < 8; k++) s += `<circle cx="${W * 0.1 - 40 + (k % 2) * 6}" cy="${H * 0.62 - 70 + k * 20}" r="4" fill="${C.gold}"/>`;
  s += `<rect x="${W * 0.86}" y="${H * 0.36}" width="12" height="${H * 0.36}" fill="#4a2c18"/><rect x="${W * 0.96}" y="${H * 0.36}" width="12" height="${H * 0.36}" fill="#4a2c18"/>`;
  s += `<rect x="${W * 0.85}" y="${H * 0.42}" width="${W * 0.13}" height="10" fill="#4a2c18"/>`;
  for (let k = 0; k < 4; k++) {
    const x = W * 0.875 + k * 30;
    s += `<path d="M${x},${H * 0.7}V${H * 0.3}" stroke="#3a2214" stroke-width="5"/><path d="M${x - 8},${H * 0.31}L${x},${H * 0.26}L${x + 8},${H * 0.31}L${x + 10},${H * 0.34}H${x - 10}Z" fill="#c9c6bc" stroke="${C.ink}" stroke-width="2"/>`;
  }
  // generals standing around the table
  for (let i = 0; i < 6; i++) {
    const sd = i < 3 ? -1 : 1, k = i % 3;
    s += official(W / 2 + sd * (420 + k * 90), H * 0.78 + k * 50, 1.6 + k * 0.4, -sd, r, i + 2);
  }
  s += lamp(W * 0.3, H * 0.2, 20, d) + lamp(W * 0.7, H * 0.2, 20, d);
  s += `<rect width="${W}" height="${H}" fill="#2a1a0a" filter="${d.wash(0.006, 0.5, 3)}" opacity="0.18"/>`;
  s += d.paperGrain(0.8);
  return d.svg(s);
}

function throneHall(W: number, H: number) {
  const d = new Doc(W, H, 1103);
  const r = rng('court3');
  const c: Cam = { vx: W / 2, vy: H * 0.4, f: 760, h: 1.7 };
  let s = `<rect width="${W}" height="${H}" fill="#e6d8b8"/>`;
  s += room(d, c, { hw: 7, top: 8, z0: 1.2, z1: 16, floor: '#c9b48a', wall: '#a03424', ceil: '#4a2416', ink: C.ink });
  // the throne platform: long stairs up to the dragon throne under a canopy
  for (let i = 0; i < 9; i++) {
    const z = 15 - i * 0.35, y = 0.2 * (9 - i);
    s += path(quad([P(c, -2.4, y, z), P(c, 2.4, y, z), P(c, 2.4, y - 0.2, z), P(c, -2.4, y - 0.2, z)]), mix('#e2d4b4', C.ink, (i % 2) * 0.08), ` stroke="${C.ink}" stroke-width="1"`);
  }
  const [px0, py0] = P(c, -2.2, 6, 15.6), [px1, py1] = P(c, 2.2, 1.8, 15.6);
  s += `<rect x="${f2(px0)}" y="${f2(py0)}" width="${f2(px1 - px0)}" height="${f2(py1 - py0)}" fill="${C.gold}" opacity="0.85" stroke="${C.ink}" stroke-width="3"/>`;
  s += screen(d, px0 + 12, py0 + 12, px1 - px0 - 24, py1 - py0 - 24, r, 5);
  const [tx, ty] = P(c, 0, 1.8, 15);
  s += `<path d="M${f2(tx - 60)},${f2(ty)}V${f2(ty - 70)}Q${f2(tx)},${f2(ty - 100)} ${f2(tx + 60)},${f2(ty - 70)}V${f2(ty)}Z" fill="${C.gold}" stroke="${C.ink}" stroke-width="3"/>`;
  s += `<rect x="${f2(tx - 70)}" y="${f2(ty - 14)}" width="140" height="14" fill="#7a2a1e" stroke="${C.ink}" stroke-width="2"/>`;
  s += roof(tx, ty - 130, 260, 50, C.ink, 1);
  // red carpet down the middle
  s += path(quad([P(c, -1, 0, 1.2), P(c, 1, 0, 1.2), P(c, 1, 0, 12.4), P(c, -1, 0, 12.4)]), C.cinnabar, ' opacity="0.9"');
  s += path(quad([P(c, -0.85, 0, 1.2), P(c, 0.85, 0, 1.2), P(c, 0.85, 0, 12.4), P(c, -0.85, 0, 12.4)]), 'none', ` stroke="${C.gold}" stroke-width="3" opacity="0.8"`);
  // great columns with coiling gold bands
  for (let z = 2.5; z <= 14; z += 2.3)
    for (const sd of [-1, 1]) {
      s += column(c, sd * 4.6, z, 8, 0.42, '#b0301e', C.ink);
      const [bx, by] = P(c, sd * 4.6, 0, z), [, tyy] = P(c, sd * 4.6, 8, z);
      const w = (0.84 * c.f) / z;
      for (let k = 0; k < 6; k++) {
        const y = tyy + ((by - tyy) * (k + 0.5)) / 6;
        s += `<path d="M${f2(bx - w / 2)},${f2(y)}q${f2(w / 2)},${f2(w * 0.4)} ${f2(w)},${f2(-w * 0.1)}" stroke="${C.gold}" stroke-width="${f2(Math.max(1, w * 0.1))}" fill="none" opacity="0.8"/>`;
      }
    }
  // officials in two long rows
  for (let z = 12; z >= 3; z -= 0.95)
    for (const sd of [-1, 1]) {
      const [x, y] = P(c, sd * 2.1, 0, z);
      s += official(x, y, 5.6 / z, -sd, r, Math.round(z * 2) + (sd > 0 ? 2 : 0));
      const [x2, y2] = P(c, sd * 3.1, 0, z + 0.4);
      s += official(x2, y2, 5.6 / (z + 0.4), -sd, r, Math.round(z * 2) + 1);
    }
  s += drapes(W, C.gold, C.ink, r, 6, 150);
  s += lamp(W * 0.2, H * 0.3, 24, d) + lamp(W * 0.8, H * 0.3, 24, d);
  s += `<rect width="${W}" height="${H}" fill="#000" filter="${d.wash(0.006, 0.5, 3)}" opacity="0.12"/>`;
  s += d.paperGrain(0.8);
  return d.svg(s);
}

export function paintCourt(n: number, W: number, H: number): string {
  return n === 2 ? warTent(W, H) : n === 3 ? throneHall(W, H) : hall(W, H);
}
