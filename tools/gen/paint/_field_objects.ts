// 野战 map objects (sf/map tall tiles): forests, hills, crags, peaks, houses,
// the 主城 palace, city walls, corner towers and gatehouses — small ink-wash
// isometric drawings standing on a 96×36 diamond. The diamond centre is the
// frame anchor; tiles are drawn back to front by the game.
import { brush, C, f2, hash, mix, rng, smoothPath, svgDoc, type Pt, type Rng } from '../ink.ts';
import type { TileDef } from '../maps/_tiles.ts';

type Out = { svg: string; w: number; h: number; ax: number; ay: number };

class Iso {
  parts: string[] = [];
  constructor(readonly ax: number, readonly ay: number) {}
  /** ground (s,t) in [0,1]², height z (px) → frame px */
  p(s: number, t: number, z = 0): Pt {
    return [this.ax + (s - t) * 48, this.ay + (s + t - 1) * 18 - z];
  }
  add(s: string) {
    this.parts.push(s);
  }
  poly(pts: Pt[], fill: string, stroke = C.ink, sw = 0.9, op = 1) {
    this.add(`<path d="M${pts.map((q) => `${f2(q[0])},${f2(q[1])}`).join('L')}Z" fill="${fill}" fill-opacity="${f2(op)}" stroke="${stroke}" stroke-width="${f2(sw)}" stroke-linejoin="round"/>`);
  }
  line(pts: Pt[], stroke: string, sw = 0.8, op = 1) {
    this.add(`<path d="M${pts.map((q) => `${f2(q[0])},${f2(q[1])}`).join('L')}" fill="none" stroke="${stroke}" stroke-width="${f2(sw)}" stroke-opacity="${f2(op)}" stroke-linecap="round" stroke-linejoin="round"/>`);
  }
  ell(x: number, y: number, rx: number, ry: number, fill: string, op = 1) {
    this.add(`<ellipse cx="${f2(x)}" cy="${f2(y)}" rx="${f2(rx)}" ry="${f2(ry)}" fill="${fill}" fill-opacity="${f2(op)}"/>`);
  }
  path(d: string, fill: string, op = 1, extra = '') {
    this.add(`<path d="${d}" fill="${fill}" fill-opacity="${f2(op)}" ${extra}/>`);
  }
  /** box prism; draws top, +t face (front-left) and +s face (front-right) */
  prism(s0: number, s1: number, t0: number, t1: number, z0: number, z1: number, top: string, left: string, right: string, sw = 0.9, lines?: { every: number; col: string }) {
    const L = [this.p(s0, t1, z0), this.p(s1, t1, z0), this.p(s1, t1, z1), this.p(s0, t1, z1)];
    const R = [this.p(s1, t1, z0), this.p(s1, t0, z0), this.p(s1, t0, z1), this.p(s1, t1, z1)];
    this.poly(L, left, C.ink, sw);
    this.poly(R, right, C.ink, sw);
    if (lines) {
      for (let z = z0 + lines.every; z < z1 - 1; z += lines.every) {
        this.line([this.p(s0, t1, z), this.p(s1, t1, z)], lines.col, 0.5, 0.55);
        this.line([this.p(s1, t1, z), this.p(s1, t0, z)], lines.col, 0.5, 0.55);
      }
    }
    this.poly([this.p(s0, t0, z1), this.p(s1, t0, z1), this.p(s1, t1, z1), this.p(s0, t1, z1)], top, C.ink, sw);
  }
  /** hip roof over [s0,s1]×[t0,t1] from height zb, ridge rh above, eave overhang ov */
  roof(s0: number, s1: number, t0: number, t1: number, zb: number, rh: number, col: string, ov = 0.07, curl = 2.5) {
    const a0 = s0 - ov, a1 = s1 + ov, b0 = t0 - ov, b1 = t1 + ov;
    const alongS = s1 - s0 >= t1 - t0;
    const inset = alongS ? (t1 - t0) / 2 + ov : (s1 - s0) / 2 + ov;
    const R1 = alongS ? this.p(a0 + inset * 0.8, (b0 + b1) / 2, zb + rh) : this.p((a0 + a1) / 2, b0 + inset * 0.8, zb + rh);
    const R2 = alongS ? this.p(a1 - inset * 0.8, (b0 + b1) / 2, zb + rh) : this.p((a0 + a1) / 2, b1 - inset * 0.8, zb + rh);
    const NW = this.p(a0, b0, zb), NE = this.p(a1, b0, zb), SE = this.p(a1, b1, zb), SW = this.p(a0, b1, zb);
    const up = (q: Pt, dx: number): Pt => [q[0] + dx, q[1] - curl];
    const dark = mix(col, C.ink, 0.35), lite = mix(col, C.paper, 0.25);
    // planes back to front
    if (alongS) {
      this.poly([NW, NE, R2, R1], dark, C.ink, 0.8);
      this.poly([NE, SE, R2], lite, C.ink, 0.8);
      this.poly([NW, R1, SW], dark, C.ink, 0.8);
      this.poly([SW, SE, R2, R1], col, C.ink, 0.9);
    } else {
      this.poly([NW, SW, R2, R1], dark, C.ink, 0.8);
      this.poly([NW, NE, R1], dark, C.ink, 0.8);
      this.poly([SW, SE, R2], col, C.ink, 0.8);
      this.poly([NE, SE, R2, R1], lite, C.ink, 0.9);
    }
    // ridge and upturned eave corners
    this.line([R1, R2], C.ink, 1.6);
    for (const [q, dx] of [[SW, -2], [SE, 2], [NE, 2], [NW, -2]] as [Pt, number][]) this.line([[q[0] - dx * 0.8, q[1] + 0.6], up(q, dx)], C.ink, 1.1);
    // tile rows on the front plane
    const rows = 5;
    for (let k = 1; k < rows; k++) {
      const f = k / rows;
      if (alongS) this.line([lerpP(SW, R1, f), lerpP(SE, R2, f)], C.ink, 0.35, 0.5);
      else this.line([lerpP(SE, R2, f), lerpP(NE, R1, f)], C.ink, 0.35, 0.5);
    }
  }
  doc(w: number, h: number): Out {
    // faint corner pins keep the packer from trimming the box: the game treats a
    // frame ≤ 37 px tall as a ground tile, which must never happen to an object
    const pins = `<rect x="0" y="0" width="1" height="1" fill="#000" fill-opacity="0.02"/><rect x="${w - 1}" y="${h - 1}" width="1" height="1" fill="#000" fill-opacity="0.02"/>`;
    return { svg: svgDoc(w, h, pins + this.parts.join('')), w, h, ax: this.ax, ay: this.ay };
  }
}
const lerpP = (a: Pt, b: Pt, f: number): Pt => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];

// ------------------------------------------------------------------ trees
function groundWash(g: Iso, r: Rng, col: string, op = 0.28) {
  for (let k = 0; k < 3; k++) {
    const [x, y] = g.p(r.range(0.3, 0.7), r.range(0.3, 0.7));
    g.ell(x, y + 1, r.range(18, 30), r.range(6, 9), col, op * r.range(0.6, 1));
  }
}

function trunk(g: Iso, r: Rng, x: number, y: number, h: number, w: number, col: string = C.inkSoft) {
  const bend = r.range(-3, 3);
  g.path(brush([[x, y], [x + bend * 0.4, y - h * 0.5], [x + bend, y - h]], w, r, { taperIn: 0.05, taperOut: 0.6 }), col, 0.95);
}

function broadleaf(g: Iso, r: Rng, x: number, y: number, h: number, hue: string) {
  g.ell(x, y, h * 0.32, h * 0.1, '#3b4a30', 0.3);
  trunk(g, r, x, y, h * 0.55, 2.6);
  const cy = y - h * 0.62;
  for (let k = 0; k < 4; k++) {
    const bx = x + r.range(-h * 0.22, h * 0.22), by = cy + r.range(-h * 0.18, h * 0.12);
    g.path(blobPath(bx, by, h * r.range(0.2, 0.3), h * r.range(0.15, 0.22), r), mix(hue, k % 2 ? C.ink : C.paper, k % 2 ? 0.15 : 0.1), 0.78);
  }
  // 点叶: clusters of dark leaf dots
  for (let k = 0; k < 16; k++) {
    const a = r.range(0, Math.PI * 2), d = Math.sqrt(r.next());
    const dx = Math.cos(a) * d * h * 0.36, dy = Math.sin(a) * d * h * 0.26;
    g.ell(x + dx, cy + dy, r.range(0.9, 1.6), r.range(0.7, 1.2), mix(hue, C.ink, 0.6), 0.85);
  }
}

function pine(g: Iso, r: Rng, x: number, y: number, h: number, snow = false) {
  g.ell(x, y, h * 0.3, h * 0.09, '#2d3a2e', 0.3);
  trunk(g, r, x, y, h * 0.92, 2.4, '#4a3a2a');
  const tiers = 4;
  for (let k = 0; k < tiers; k++) {
    const ty = y - h * (0.3 + k * 0.18), tw = h * (0.38 - k * 0.07);
    const side = k % 2 ? 1 : -1;
    const cx = x + side * r.range(0, 3);
    g.path(smoothPath([[cx - tw, ty + 2], [cx - tw * 0.5, ty - 3.5], [cx + tw * 0.4, ty - 4], [cx + tw, ty + 1.5], [cx, ty + 3.5]], true), '#3a5442', 0.9);
    // needle strokes
    for (let n = 0; n < 6; n++) {
      const nx = cx - tw * 0.8 + (n / 5) * tw * 1.6;
      g.line([[nx, ty + 2], [nx + r.range(-1.5, 1.5), ty - 3]], C.ink, 0.6, 0.6);
    }
    if (snow) g.path(smoothPath([[cx - tw * 0.7, ty - 2.2], [cx, ty - 4.2], [cx + tw * 0.7, ty - 2.5], [cx, ty - 1.4]], true), C.white, 0.9);
  }
}

function conifer(g: Iso, r: Rng, x: number, y: number, h: number) {
  g.ell(x, y, h * 0.25, h * 0.08, '#2d3a2e', 0.3);
  g.line([[x, y], [x, y - h * 0.3]], '#4a3a2a', 2);
  const w = h * 0.28;
  for (let k = 0; k < 4; k++) {
    const by = y - h * 0.18 - k * h * 0.2, ww = w * (1 - k * 0.2);
    g.poly([[x - ww, by], [x, by - h * 0.32], [x + ww, by]], k % 2 ? '#2f4a3a' : '#3a5a46', C.ink, 0.6, 0.95);
  }
  g.poly([[x - w * 0.25, y - h * 0.86], [x, y - h * 1.02], [x + w * 0.2, y - h * 0.86]], '#e8ecea', C.ink, 0.4, 0.9);
}

function bamboo(g: Iso, r: Rng, x: number, y: number, h: number) {
  g.ell(x, y, h * 0.3, h * 0.08, '#344a2e', 0.3);
  const n = r.int(3, 5);
  for (let k = 0; k < n; k++) {
    const bx = x + (k - n / 2) * 3 + r.range(-1, 1), hh = h * r.range(0.75, 1), lean = r.range(-4, 4);
    g.line([[bx, y], [bx + lean, y - hh]], '#5d7a4a', 1.4);
    for (let j = 1; j < 5; j++) {
      const q = lerpP([bx, y], [bx + lean, y - hh], j / 5);
      g.line([[q[0] - 1, q[1]], [q[0] + 1, q[1]]], C.ink, 0.7);
    }
    // leaves: tapered strokes in fans
    for (let j = 0; j < 5; j++) {
      const q = lerpP([bx, y], [bx + lean, y - hh], r.range(0.5, 1));
      const a = r.range(-0.4, 0.4) + (r.chance(0.5) ? 0 : Math.PI);
      const L = r.range(4, 7);
      g.path(brush([q, [q[0] + Math.cos(a) * L, q[1] + Math.sin(a) * L * 0.5 + 1.5]], 2, r, { taperIn: 0.1, taperOut: 0.8 }), '#2f4a2c', 0.85);
    }
  }
}

function palm(g: Iso, r: Rng, x: number, y: number, h: number) {
  g.ell(x, y, h * 0.3, h * 0.08, '#344a2e', 0.3);
  const lean = r.range(-6, 6);
  const top: Pt = [x + lean, y - h * 0.8];
  g.path(brush([[x, y], [x + lean * 0.3, y - h * 0.4], top], 3, r, { taperIn: 0.02, taperOut: 0.5 }), '#5a4a33', 0.95);
  for (let k = 0; k < 7; k++) {
    const a = -Math.PI / 2 + (k - 3) * 0.48 + r.range(-0.1, 0.1);
    const L = h * r.range(0.32, 0.45);
    const end: Pt = [top[0] + Math.cos(a) * L, top[1] + Math.sin(a) * L * 0.6 + L * 0.35];
    const mid: Pt = [top[0] + Math.cos(a) * L * 0.5, top[1] + Math.sin(a) * L * 0.5 - 2];
    g.path(brush([top, mid, end], 4, r, { taperIn: 0.1, taperOut: 0.7 }), k % 2 ? '#3d6040' : '#4f7650', 0.9);
  }
}

function willow(g: Iso, r: Rng, x: number, y: number, h: number) {
  g.ell(x, y, h * 0.32, h * 0.09, '#3b4a30', 0.3);
  trunk(g, r, x, y, h * 0.7, 3.2, '#4a3b2c');
  const top: Pt = [x, y - h * 0.72];
  g.path(blobPath(top[0], top[1] + 2, h * 0.3, h * 0.14, r), '#8fae6e', 0.5);
  for (let k = 0; k < 14; k++) {
    const sx = top[0] + r.range(-h * 0.3, h * 0.3), sy = top[1] + r.range(-3, 3);
    const L = h * r.range(0.35, 0.6);
    g.line([[sx, sy], [sx + r.range(-2, 2), sy + L * 0.5], [sx + r.range(-3, 3), sy + L]], k % 3 ? '#6f9a52' : '#4a6a38', 0.8, 0.85);
  }
}

function blobPath(cx: number, cy: number, rx: number, ry: number, r: Rng) {
  const pts: Pt[] = [];
  const n = 9, ph = r.range(0, 6);
  for (let i = 0; i < n; i++) {
    const a = ph + (i / n) * Math.PI * 2;
    const k = 1 + r.range(-0.18, 0.18);
    pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
  }
  return smoothPath(pts, true);
}

function forest(style: 'temperate' | 'jungle' | 'pine' | 'willow', variant: number, name: string): Out {
  const W = 112, H = 80, g = new Iso(56, 60);
  const r = rng(hash(name) + variant);
  groundWash(g, r, style === 'jungle' ? '#4d6a3a' : '#556b3e', 0.22);
  const n = style === 'willow' ? 2 : r.int(3, 5);
  const spots: [number, number][] = [];
  for (let k = 0; k < n * 4 && spots.length < n; k++) {
    const s = r.range(0.18, 0.82), t = r.range(0.18, 0.82);
    if (spots.every(([a, b]) => Math.hypot(a - s, b - t) > 0.28)) spots.push([s, t]);
  }
  spots.sort((a, b) => a[0] + a[1] - (b[0] + b[1]));
  spots.forEach(([s, t], k) => {
    const [x, y] = g.p(s, t);
    const h = r.range(30, 46);
    if (style === 'temperate') {
      if ((k + variant) % 3 === 0) pine(g, r, x, y, h + 4);
      else broadleaf(g, r, x, y, h, r.pick(['#6f9a62', '#7fa05e', '#5f8a5a', '#8a9a58']));
    } else if (style === 'pine') {
      if ((k + variant) % 2) conifer(g, r, x, y, h + 6);
      else pine(g, r, x, y, h + 2, variant % 2 === 0);
    } else if (style === 'jungle') {
      if ((k + variant) % 3 === 0) palm(g, r, x, y, h + 4);
      else if ((k + variant) % 3 === 1) bamboo(g, r, x, y, h + 6);
      else broadleaf(g, r, x, y, h * 0.85, '#4f7a4a');
    } else willow(g, r, x, y, h + 8);
  });
  return g.doc(W, H);
}

// ------------------------------------------------------------------ relief
/** a mound: rounded top, base curving along the ground (no diamond corners) */
function mound(g: Iso, r: Rng, cx: number, by: number, hw: number, hh: number, fill: string, shade: string, top: string) {
  const crest = r.range(-0.25, 0.2);
  const pts: Pt[] = [[cx - hw, by], [cx - hw * 0.6, by - hh * 0.55], [cx + hw * crest, by - hh], [cx + hw * 0.55, by - hh * 0.6], [cx + hw, by]];
  const d = smoothPath(pts, false) + `Q${f2(cx)},${f2(by + 4)} ${f2(cx - hw)},${f2(by)}Z`;
  g.path(d, fill, 0.97);
  g.path(smoothPath([[cx + hw * crest, by - hh * 0.95], [cx + hw * 0.5, by - hh * 0.55], [cx + hw * 0.95, by], [cx + hw * 0.3, by + 2], [cx + hw * 0.1, by - hh * 0.4]], true), shade, 0.5);
  g.path(smoothPath([[cx - hw * 0.55, by - hh * 0.5], [cx + hw * crest, by - hh * 0.97], [cx + hw * 0.3, by - hh * 0.72], [cx - hw * 0.1, by - hh * 0.55]], true), top, 0.45);
  g.path(brush(pts, 1.7, r, { taperIn: 0.25, taperOut: 0.25 }), C.ink, 0.85);
  return { crest: cx + hw * crest, top: by - hh };
}

function hill(variant: number, name: string): Out {
  const W = 112, H = 60, g = new Iso(56, 42);
  const r = rng(hash(name));
  g.ell(56, 44, 44, 10, '#56603e', 0.18);
  const n = 1 + (variant % 3);
  const ms: { cx: number; by: number; hw: number; hh: number }[] = [];
  for (let k = 0; k < n; k++) ms.push({ cx: 56 + (n === 1 ? r.range(-4, 4) : (k - (n - 1) / 2) * r.range(22, 30)), by: 46 + (k % 2 ? -5 : 0) + r.range(-2, 2), hw: n === 1 ? r.range(36, 42) : r.range(20, 28), hh: r.range(14, 24) });
  ms.sort((a, b) => a.by - b.by);
  for (const m of ms) {
    const t = mound(g, r, m.cx, m.by, m.hw, m.hh, '#aab27c', '#7c8656', C.malachite);
    // 披麻皴 hemp strokes and moss dots along the crest
    for (let j = 0; j < 4; j++) {
      const x0 = m.cx + r.range(-m.hw * 0.5, m.hw * 0.5), y0 = m.by - m.hh * r.range(0.4, 0.75);
      g.path(brush([[x0, y0], [x0 + r.range(2, 5), y0 + m.hh * 0.25], [x0 + r.range(3, 8), y0 + m.hh * 0.45]], 1, r, { taperIn: 0.3, taperOut: 0.6 }), C.inkWash, 0.5);
    }
    for (let j = 0; j < 7; j++) g.ell(t.crest + r.range(-m.hw * 0.5, m.hw * 0.45), t.top + m.hh * r.range(0.05, 0.3), r.range(1, 1.7), r.range(0.8, 1.2), C.ink, 0.8);
    if (r.chance(0.6)) {
      // a small tree on the slope
      const [x, y] = [m.cx + r.range(-m.hw * 0.4, m.hw * 0.4), m.by - m.hh * r.range(0.5, 0.8)];
      g.line([[x, y + 4], [x, y - 3]], C.inkSoft, 1.2);
      for (let j = 0; j < 7; j++) g.ell(x + r.range(-4, 4), y - 4 + r.range(-3, 2), 1.4, 1.1, '#3f5a3a', 0.85);
    }
  }
  return g.doc(W, H);
}

/** rocky ground: a crag and tumbled boulders (passable, slow) */
function rock(variant: number, name: string): Out {
  const W = 112, H = 66, g = new Iso(56, 46);
  const r = rng(hash(name));
  g.ell(56, 48, 42, 10, '#6b604c', 0.2);
  const items: { x: number; y: number; w: number; h: number; crag: boolean }[] = [];
  items.push({ x: 56 + r.range(-12, 12), y: 46 + r.range(-4, 0), w: r.range(16, 22), h: r.range(22, 34) * (variant === 2 ? 1.2 : 1), crag: true });
  if (variant % 2) items.push({ x: 56 + r.range(-26, -14), y: 44, w: r.range(12, 16), h: r.range(15, 22), crag: true });
  for (let k = 0; k < 3 + (variant % 3); k++) items.push({ x: 56 + r.range(-34, 34), y: 48 + r.range(-6, 6), w: r.range(5, 10), h: r.range(4, 9), crag: false });
  items.sort((a, b) => a.y - b.y);
  for (const it of items) {
    const { x, y, w, h } = it;
    if (it.crag) {
      const top: Pt = [x + r.range(-w * 0.3, w * 0.3), y - h];
      const L: Pt[] = [[x - w, y], [x - w * 0.85, y - h * 0.35], [x - w * 0.45, y - h * 0.62], [top[0] - w * 0.2, y - h * 0.92], top];
      const R: Pt[] = [top, [top[0] + w * 0.35, y - h * 0.8], [x + w * 0.55, y - h * 0.55], [x + w * 0.8, y - h * 0.4], [x + w, y]];
      g.poly([...L, ...R.slice(1), [x, y + 3]], '#b3ad9c', C.ink, 0, 1);
      g.poly([top, ...R.slice(1), [x + w * 0.1, y + 2], [top[0] + 1, y - h * 0.45]], '#6d6a60', C.ink, 0, 0.75);
      // flat top ledge and axe-cut strokes
      g.line([L[3], top, R[1]], C.paper, 1, 0.5);
      for (let j = 0; j < 4; j++) {
        const y0 = y - h * r.range(0.2, 0.75), x0 = x + r.range(-w * 0.1, w * 0.6);
        g.path(brush([[x0, y0], [x0 + r.range(2, 5), y0 + r.range(4, 7)]], 2.4, r, { taperIn: 0.05, taperOut: 0.7 }), C.inkSoft, 0.7);
      }
      g.path(brush(L, 1.9, r, { taperIn: 0.2, taperOut: 0.05 }), C.ink, 0.95);
      g.path(brush(R, 1.5, r, { taperIn: 0.05, taperOut: 0.3 }), C.ink, 0.9);
      // shrub clinging to the rock
      const sx = x - w * 0.3, sy = y - h * 0.5;
      for (let j = 0; j < 6; j++) g.ell(sx + r.range(-4, 4), sy + r.range(-2, 2), 1.4, 1, '#3f5a3a', 0.85);
    } else {
      g.path(smoothPath([[x - w, y], [x - w * 0.7, y - h * 0.8], [x + w * 0.2, y - h], [x + w, y - h * 0.3], [x + w * 0.8, y + 1.5]], true), '#a7a291', 1, `stroke="${C.ink}" stroke-width="1.1"`);
      g.path(smoothPath([[x + w * 0.1, y - h * 0.9], [x + w, y - h * 0.3], [x + w * 0.8, y + 1.5], [x, y + 1]], true), '#66635a', 0.55);
    }
  }
  for (let j = 0; j < 5; j++) {
    const x = 56 + r.range(-36, 36), y = 48 + r.range(-3, 5);
    g.line([[x, y], [x + r.range(-2, 2), y - 4]], '#4f6a3e', 0.8, 0.7);
  }
  return g.doc(W, H);
}

function peak(variant: number, name: string): Out {
  const W = 156, H = 112, g = new Iso(78, 90);
  const r = rng(hash(name) * 31 + variant * 977);
  // footing that covers the whole diamond (peaks are impassable; the base never shows)
  g.poly([g.p(-0.06, -0.06), g.p(1.06, -0.06), g.p(1.06, 1.06), g.p(-0.06, 1.06)], '#9a9282', C.ink, 0, 1);
  g.ell(78, 96, 66, 14, '#5d584c', 0.3);
  const masses = variant >= 4 ? 1 : 1 + (variant % 2);
  for (let m = 0; m < masses; m++) {
    const back = masses === 2 && m === 0;
    const cx = 78 + (masses === 2 ? (back ? r.range(-22, -10) : r.range(8, 20)) : r.range(-6, 6));
    const by = back ? 90 : 100;
    const low = variant >= 4;
    const hw = back ? r.range(42, 52) : r.range(56, 64), hh = (back ? r.range(52, 68) : r.range(48, 64)) * (low ? 0.6 : 1);
    // jagged ridge profile: envelope × noise, 2–3 summits
    const n = 18;
    const sum = [r.range(-0.45, -0.1), r.range(0.05, 0.4)];
    const prof: Pt[] = [];
    for (let i = 0; i <= n; i++) {
      const x = -1 + (2 * i) / n;
      let e = 0;
      for (const s of sum) e = Math.max(e, Math.exp(-(((x - s) / 0.42) ** 2)) * (s === sum[0] ? 1 : r.range(0.7, 0.9)));
      const jag = i === 0 || i === n ? 0 : r.range(-0.08, 0.08) + (i % 2 ? 0.05 : -0.03);
      prof.push([cx + x * hw, by - Math.max(0, e * (1 - x * x * 0.3) + jag * e) * hh]);
    }
    prof[0][1] = by;
    prof[n][1] = by;
    const outline = [...prof, [cx + hw * 0.6, by + 6] as Pt, [cx - hw * 0.6, by + 6] as Pt];
    const top = Math.min(...prof.map((q) => q[1]));
    const gid = `pk${hash(name + m + variant) % 1000000}`;
    g.add(`<defs><linearGradient id="${gid}" x1="0" y1="${f2(top)}" x2="0" y2="${f2(by + 6)}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#f3f1e8"/><stop offset="0.2" stop-color="#d6d4c8"/><stop offset="0.55" stop-color="${back ? '#8e9290' : '#9a9a8c'}"/><stop offset="1" stop-color="#6e6a5c"/></linearGradient></defs>`);
    g.add(`<path d="${smoothPath(outline, true, 0.25)}" fill="url(#${gid})"/>`);
    // shadow flanks: right of every summit
    for (const s of sum) {
      const sx = cx + s * hw, sy = by - hh * 0.95;
      g.path(smoothPath([[sx, sy + 3], [sx + hw * 0.3, by - hh * 0.5], [sx + hw * 0.55, by + 4], [sx + hw * 0.05, by + 4], [sx + hw * 0.08, by - hh * 0.45]], true), back ? '#4a4e52' : '#4a463e', back ? 0.35 : 0.4);
    }
    // ridges and 皴 texture strokes running down the slopes
    for (let j = 0; j < 10; j++) {
      const x0 = cx + r.range(-hw * 0.7, hw * 0.7);
      const yTop = prof[Math.round(((x0 - cx) / hw + 1) * n / 2)]?.[1] ?? by - hh * 0.5;
      const y0 = yTop + r.range(3, 10);
      if (y0 > by - 6) continue;
      const dir = x0 > cx ? 1 : -1;
      g.path(brush([[x0, y0], [x0 + dir * r.range(2, 6), y0 + (by - y0) * 0.4], [x0 + dir * r.range(4, 10), y0 + (by - y0) * 0.75]], r.range(1.2, 2.2), r, { taperIn: 0.2, taperOut: 0.7 }), C.ink, 0.5);
    }
    g.path(brush(prof, back ? 1.8 : 2.4, r, { taperIn: 0.05, taperOut: 0.05, jitter: 0.25 }), C.ink, back ? 0.8 : 0.95);
    // 苔点 on the shoulders and a few pines
    for (let j = 0; j < 8; j++) {
      const x = cx + r.range(-hw * 0.7, hw * 0.7);
      const yTop = prof[Math.round(((x - cx) / hw + 1) * n / 2)]?.[1] ?? by;
      g.ell(x, yTop + r.range(1, 4), r.range(1.2, 2), r.range(0.9, 1.3), C.ink, 0.85);
    }
  }
  // mist across the foot
  const mid = `pm${hash(name) % 1000000}`;
  g.add(`<defs><radialGradient id="${mid}"><stop offset="0" stop-color="#f7f2e6" stop-opacity="0.75"/><stop offset="1" stop-color="#f7f2e6" stop-opacity="0"/></radialGradient></defs>`);
  g.ell(78 + r.range(-20, 20), 97, 64, 9, `url(#${mid})`);
  return g.doc(W, H);
}

// ------------------------------------------------------------------ buildings
const WHITE = '#e9e1cc', WHITE_S = '#cfc5ab', WOOD = '#6a4a32', ROOF = '#55565c', RED = '#9c3b2c';

function house(variant: number, name: string): Out {
  const W = 104, H = 72, g = new Iso(52, 54);
  const r = rng(hash(name));
  g.ell(52, 56, 40, 10, '#6b604c', 0.18);
  const one = (s0: number, s1: number, t0: number, t1: number, wh: number, rh: number, roof: string) => {
    g.prism(s0, s1, t0, t1, 0, wh, WHITE, WHITE_S, WHITE, 0.8);
    // beams, door, window
    const doorS = (s0 + s1) / 2;
    g.poly([g.p(doorS - 0.05, t1, 0), g.p(doorS + 0.05, t1, 0), g.p(doorS + 0.05, t1, wh * 0.7), g.p(doorS - 0.05, t1, wh * 0.7)], WOOD, C.ink, 0.6);
    const wt = (t0 + t1) / 2;
    g.poly([g.p(s1, wt - 0.06, wh * 0.35), g.p(s1, wt + 0.06, wh * 0.35), g.p(s1, wt + 0.06, wh * 0.7), g.p(s1, wt - 0.06, wh * 0.7)], '#4a3b2c', C.ink, 0.5);
    g.line([g.p(s0, t1, wh), g.p(s1, t1, wh)], WOOD, 1.2);
    g.line([g.p(s1, t1, wh), g.p(s1, t0, wh)], WOOD, 1.2);
    g.roof(s0, s1, t0, t1, wh, rh, roof);
  };
  const roof = r.pick([ROOF, '#5d5a55', '#4c5560']);
  switch (variant) {
    case 0: one(0.22, 0.78, 0.3, 0.7, 11, 9, roof); break;
    case 1: one(0.3, 0.7, 0.2, 0.8, 11, 9, roof); break;
    case 2: one(0.12, 0.5, 0.15, 0.5, 9, 8, roof); one(0.45, 0.88, 0.45, 0.85, 10, 9, roof); break;
    case 3: {
      // courtyard wall + house
      one(0.2, 0.62, 0.15, 0.55, 10, 8, roof);
      g.prism(0.15, 0.9, 0.82, 0.88, 0, 5, '#8d8a85', WHITE_S, WHITE, 0.6);
      g.prism(0.84, 0.9, 0.15, 0.88, 0, 5, '#8d8a85', WHITE_S, WHITE, 0.6);
      break;
    }
    case 4: {
      // two-storey shop with a banner pole
      one(0.25, 0.75, 0.25, 0.75, 18, 9, roof);
      g.line([g.p(0.85, 0.85, 0), g.p(0.85, 0.85, 30)], WOOD, 1.2);
      g.poly([g.p(0.85, 0.85, 29), g.p(0.85, 0.85, 19), [g.p(0.85, 0.85, 19)[0] + 6, g.p(0.85, 0.85, 19)[1] + 1], [g.p(0.85, 0.85, 29)[0] + 6, g.p(0.85, 0.85, 29)[1]]], C.cinnabar, C.ink, 0.5);
      break;
    }
    default: {
      // granary: round-ish store with conical thatch
      one(0.15, 0.48, 0.5, 0.85, 9, 7, roof);
      const [x, y] = g.p(0.6, 0.35);
      g.add(`<path d="M${f2(x - 13)},${f2(y)} L${f2(x - 13)},${f2(y - 12)} L${f2(x + 13)},${f2(y - 12)} L${f2(x + 13)},${f2(y)} A13,5 0 0 1 ${f2(x - 13)},${f2(y)}Z" fill="${WHITE_S}" stroke="${C.ink}" stroke-width="0.8"/>`);
      g.poly([[x - 16, y - 12], [x, y - 26], [x + 16, y - 12], [x, y - 8]], '#b59a5e', C.ink, 0.8);
      for (let k = -2; k <= 2; k++) g.line([[x + k * 5, y - 10], [x, y - 25]], '#7a6440', 0.5, 0.7);
    }
  }
  return g.doc(W, H);
}

function castle(variant: number): Out {
  const W = 132, H = 112, g = new Iso(66, 90);
  const alongS = variant === 0;
  const [s0, s1, t0, t1] = alongS ? [0.08, 0.92, 0.22, 0.78] : [0.22, 0.78, 0.08, 0.92];
  g.ell(66, 94, 56, 13, '#4a4038', 0.2);
  // stone terrace (two steps)
  g.prism(-0.02, 1.02, -0.02, 1.02, 0, 5, '#c9c2b0', '#9b9484', '#aea796', 0.9, { every: 2.5, col: '#6b6558' });
  g.prism(s0, s1, t0, t1, 5, 10, '#d4cdbb', '#a39c8b', '#b6af9d', 0.9);
  // red-pillared hall
  const hs0 = s0 + 0.08, hs1 = s1 - 0.08, ht0 = t0 + 0.08, ht1 = t1 - 0.08;
  g.prism(hs0, hs1, ht0, ht1, 10, 26, '#7a2a20', '#8a3226', RED, 0.9);
  const cols = 6;
  for (let k = 0; k <= cols; k++) {
    const f = k / cols;
    g.line([g.p(hs0 + (hs1 - hs0) * f, ht1, 10), g.p(hs0 + (hs1 - hs0) * f, ht1, 26)], '#5a1d16', 1.1);
    g.line([g.p(hs1, ht1 - (ht1 - ht0) * f, 10), g.p(hs1, ht1 - (ht1 - ht0) * f, 26)], '#5a1d16', 1.1);
  }
  // lattice doors (gold) on the front
  const mid = (hs0 + hs1) / 2;
  g.poly([g.p(mid - 0.08, ht1, 10), g.p(mid + 0.08, ht1, 10), g.p(mid + 0.08, ht1, 22), g.p(mid - 0.08, ht1, 22)], '#c9a24a', C.ink, 0.6);
  // lower roof, upper storey, upper roof
  g.roof(hs0, hs1, ht0, ht1, 26, 9, '#3f4a55', 0.09, 3);
  const us0 = hs0 + 0.12, us1 = hs1 - 0.12, ut0 = ht0 + 0.1, ut1 = ht1 - 0.1;
  g.prism(us0, us1, ut0, ut1, 31, 41, '#7a2a20', '#8a3226', RED, 0.8);
  g.roof(us0, us1, ut0, ut1, 41, 13, '#3a4550', 0.11, 4);
  // gold ridge ornaments
  const R1 = alongS ? g.p(us0 + 0.1, (ut0 + ut1) / 2, 54) : g.p((us0 + us1) / 2, ut0 + 0.1, 54);
  const R2 = alongS ? g.p(us1 - 0.1, (ut0 + ut1) / 2, 54) : g.p((us0 + us1) / 2, ut1 - 0.1, 54);
  for (const q of [R1, R2]) g.ell(q[0], q[1] - 2, 1.8, 3, C.gold);
  // banner poles at the terrace corners
  for (const [s, t] of [[1.0, 0.0], [0.0, 1.0]] as [number, number][]) {
    const b = g.p(s, t, 5), top = g.p(s, t, 44);
    g.line([b, top], WOOD, 1.2);
    g.path(`M${f2(top[0])},${f2(top[1])} q7,2 13,0 l-2,6 2,6 q-6,2 -13,0Z`, C.cinnabar, 0.95, `stroke="${C.ink}" stroke-width="0.6"`);
  }
  return g.doc(W, H);
}

// ------------------------------------------------------------------ walls
interface WallStyle { z: number; top: string; left: string; right: string; course: string; merlon: boolean }
const STYLE: Record<'A' | 'B', WallStyle> = {
  A: { z: 26, top: '#bdb7a8', left: '#8b8679', right: '#a49e90', course: '#5c584e', merlon: true },
  B: { z: 19, top: '#bfae8c', left: '#8c7c62', right: '#a59379', course: '#5e5040', merlon: false },
};
const HW = 0.17; // half thickness of a wall (tile units)

/** a straight wall segment along one axis from a0 to a1 (dir u: along s at t=.5; dir v: along t at s=.5) */
function wallSeg(g: Iso, st: WallStyle, dir: 'u' | 'v', a0: number, a1: number, ruined = false) {
  const z = ruined ? st.z * 0.6 : st.z;
  const [s0, s1, t0, t1] = dir === 'u' ? [a0, a1, 0.5 - HW, 0.5 + HW] : [0.5 - HW, 0.5 + HW, a0, a1];
  g.prism(s0, s1, t0, t1, 0, z, st.top, st.left, st.right, 0.9, { every: st.merlon ? 4.5 : 3.5, col: st.course });
  if (st.merlon) {
    // crenellations on both rims
    const n = Math.max(1, Math.round((a1 - a0) / 0.2));
    for (let k = 0; k < n; k++) {
      const b0 = a0 + ((k + 0.2) / n) * (a1 - a0), b1 = a0 + ((k + 0.7) / n) * (a1 - a0);
      if (ruined && k % 2) continue;
      for (const rim of [0, 1]) {
        if (dir === 'u') g.prism(b0, b1, rim ? t1 - 0.06 : t0, rim ? t1 : t0 + 0.06, z, z + 4, st.top, st.left, st.right, 0.6);
        else g.prism(rim ? s1 - 0.06 : s0, rim ? s1 : s0 + 0.06, b0, b1, z, z + 4, st.top, st.left, st.right, 0.6);
      }
    }
  } else {
    // timber palisade stakes along the top
    const n = Math.max(1, Math.round((a1 - a0) / 0.1));
    for (let k = 0; k <= n; k++) {
      const a = a0 + (k / n) * (a1 - a0);
      const b = dir === 'u' ? g.p(a, 0.5, z) : g.p(0.5, a, z);
      g.line([b, [b[0], b[1] - 6]], '#5a4028', 1.3);
    }
    const q0 = dir === 'u' ? g.p(a0, 0.5, z + 4) : g.p(0.5, a0, z + 4), q1 = dir === 'u' ? g.p(a1, 0.5, z + 4) : g.p(0.5, a1, z + 4);
    g.line([q0, q1], '#5a4028', 0.8);
  }
}

function tower(g: Iso, st: WallStyle, s0: number, s1: number, t0: number, t1: number, extra: number, roof: boolean) {
  const z = st.z + extra;
  g.prism(s0, s1, t0, t1, 0, z, st.top, st.left, st.right, 1, { every: 4.5, col: st.course });
  if (st.merlon) {
    for (const [a, b] of [[0, 0.3], [0.7, 1]]) {
      g.prism(s0 + (s1 - s0) * a, s0 + (s1 - s0) * b, t1 - 0.06, t1, z, z + 4, st.top, st.left, st.right, 0.6);
      g.prism(s1 - 0.06, s1, t0 + (t1 - t0) * a, t0 + (t1 - t0) * b, z, z + 4, st.top, st.left, st.right, 0.6);
    }
  }
  if (roof) {
    // corner pavilion posts + roof
    const ps0 = s0 + 0.06, ps1 = s1 - 0.06, pt0 = t0 + 0.06, pt1 = t1 - 0.06;
    for (const [s, t] of [[ps0, pt1], [ps1, pt1], [ps1, pt0]] as [number, number][]) g.line([g.p(s, t, z), g.p(s, t, z + 9)], st.merlon ? RED : WOOD, 1.6);
    g.roof(ps0, ps1, pt0, pt1, z + 9, 8, st.merlon ? '#3f4a55' : '#8f7a50', 0.08, 2.5);
  }
}

function wallTile(def: Extract<TileDef, { kind: 'wall' | 'corner' | 'gate' }>, name: string): Out {
  const st = STYLE[def.style];
  const ruined = !!def.ruined;
  const W = 112, H = def.kind === 'gate' ? 116 : 92;
  const g = new Iso(56, H - 22);
  const r = rng(hash(name));
  g.ell(56, H - 21, 44, 11, '#5c5346', 0.16);
  if (def.kind === 'wall') {
    wallSeg(g, st, def.dir, -0.01, 1.01, ruined);
    if (ruined) for (let k = 0; k < 5; k++) g.ell(56 + r.range(-30, 30), H - 22 + r.range(-4, 6), r.range(2, 4), r.range(1.2, 2), st.left, 0.9);
  } else if (def.kind === 'corner') {
    const c = def.corner;
    // which half-walls leave the corner: top → +u,+v; right → -u,+v; bottom → -u,-v; left → +u,-v
    const segs: ['u' | 'v', number, number][] = [];
    const T0 = 0.5 - 0.24, T1 = 0.5 + 0.24;
    segs.push(['u', c === 'top' || c === 'left' ? T1 - 0.02 : -0.01, c === 'top' || c === 'left' ? 1.01 : T0 + 0.02]);
    segs.push(['v', c === 'top' || c === 'right' ? T1 - 0.02 : -0.01, c === 'top' || c === 'right' ? 1.01 : T0 + 0.02]);
    // painter's order: segments behind the tower, tower, segments in front
    const behind = segs.filter(([, a0]) => a0 < 0.5), front = segs.filter(([, a0]) => a0 >= 0.5);
    for (const [d, a0, a1] of behind) wallSeg(g, st, d, a0, a1, ruined);
    tower(g, st, T0, T1, T0, T1, ruined ? 0 : 8, !ruined);
    for (const [d, a0, a1] of front) wallSeg(g, st, d, a0, a1, ruined);
  } else {
    // gatehouse: towers flank the gate tile
    if (def.part !== 'gate') {
      wallSeg(g, st, def.dir, -0.01, 1.01, ruined);
      const [a0, a1] = [0.22, 0.78];
      const ext = 0.27;
      if (def.dir === 'u') tower(g, st, a0, a1, 0.5 - ext, 0.5 + ext, ruined ? 0 : 6, !ruined && def.style === 'B');
      else tower(g, st, 0.5 - ext, 0.5 + ext, a0, a1, ruined ? 0 : 6, !ruined && def.style === 'B');
      // a war banner on the tower
      if (!ruined) {
        const b = g.p(0.5, 0.5, st.z + 10);
        g.line([b, [b[0], b[1] - 20]], WOOD, 1.2);
        g.path(`M${f2(b[0])},${f2(b[1] - 20)} q6,2 11,0 l0,9 q-5,2 -11,0Z`, def.style === 'A' ? C.cinnabar : C.ochre, 0.95, `stroke="${C.ink}" stroke-width="0.5"`);
      }
    } else {
      wallSeg(g, st, def.dir, -0.01, 1.01, ruined);
      // arch on the visible face (front-left for u walls, front-right for v walls)
      const face = (a: number, z: number) => (def.dir === 'u' ? g.p(a, 0.5 + HW, z) : g.p(0.5 + HW, a, z));
      const ah = st.z * 0.68;
      const arch: Pt[] = [];
      for (let k = 0; k <= 10; k++) {
        const ang = Math.PI * (k / 10);
        arch.push(face(0.5 - Math.cos(ang) * 0.17, ah * 0.62 + Math.sin(ang) * ah * 0.38));
      }
      g.poly([face(0.33, 0), ...arch, face(0.67, 0)], ruined ? '#2a2420' : '#3a2a1e', C.ink, 0.9);
      if (!ruined) {
        // studded doors
        g.line([face(0.5, 0), face(0.5, ah * 0.98)], '#1a120c', 0.8);
        for (let k = 0; k < 3; k++) for (const a of [0.41, 0.59]) {
          const q = face(a, ah * (0.2 + k * 0.22));
          g.ell(q[0], q[1], 0.8, 0.8, C.gold);
        }
        // gate tower (城楼)
        const z = st.z + (st.merlon ? 4 : 2);
        const [s0, s1, t0, t1] = def.dir === 'u' ? [0.18, 0.82, 0.32, 0.68] : [0.32, 0.68, 0.18, 0.82];
        g.prism(s0, s1, t0, t1, z, z + 12, '#7a2a20', '#8a3226', RED, 0.8);
        for (let k = 1; k < 4; k++) {
          const f = k / 4;
          if (def.dir === 'u') g.line([g.p(s0 + (s1 - s0) * f, t1, z), g.p(s0 + (s1 - s0) * f, t1, z + 12)], '#5a1d16', 1);
          else g.line([g.p(s1, t0 + (t1 - t0) * f, z), g.p(s1, t0 + (t1 - t0) * f, z + 12)], '#5a1d16', 1);
        }
        g.roof(s0, s1, t0, t1, z + 12, 10, '#3f4a55', 0.1, 3);
        if (def.style === 'A') {
          const s2 = s0 + 0.08, s3 = s1 - 0.08, t2 = t0 + 0.06, t3 = t1 - 0.06;
          g.prism(s2, s3, t2, t3, z + 18, z + 25, '#7a2a20', '#8a3226', RED, 0.7);
          g.roof(s2, s3, t2, t3, z + 25, 10, '#3a4550', 0.1, 3.5);
        }
      } else for (let k = 0; k < 6; k++) g.ell(56 + r.range(-26, 26), H - 22 + r.range(-3, 6), r.range(2, 4), r.range(1.2, 2), st.left, 0.9);
    }
  }
  return g.doc(W, H);
}

export function paintObject(def: TileDef, name: string): Out | null {
  switch (def.kind) {
    case 'forest': return forest(def.style, def.variant, name);
    case 'hill': return hill(def.variant, name);
    case 'rock': return rock(def.variant, name);
    case 'peak': return peak(def.variant, name);
    case 'house': return house(def.variant, name);
    case 'castle': return castle(def.variant);
    case 'wall':
    case 'corner':
    case 'gate': return wallTile(def, name);
  }
  return null;
}
