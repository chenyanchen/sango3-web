// Landscape kit for the large illustrated images (水墨山水): mountains with
// texture strokes (披麻皴 / 斧劈皴), mist, pines and leaf trees, walls, gate
// towers, tents, banners, tiny ink armies, boats, water. Everything returns SVG
// fragments; a `Doc` collects the <defs> (gradients, filters) with unique ids.
import { blob, brush, C, f2, mix, rng, smoothPath, type Pt, type Rng } from '../ink.ts';

export { C, f2, mix, rng, type Pt, type Rng };

// ------------------------------------------------------------------ doc
export class Doc {
  private defs: string[] = [];
  private n = 0;
  constructor(readonly w: number, readonly h: number, readonly seed: number) {}
  id(p = 'd') {
    return `${p}${++this.n}`;
  }
  def(s: string) {
    this.defs.push(s);
  }
  /** vertical (or any) linear gradient in user space; stops: [offset, color, opacity] */
  lin(stops: [number, string, number][], x1: number, y1: number, x2: number, y2: number) {
    const id = this.id('g');
    this.defs.push(`<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${f2(x1)}" y1="${f2(y1)}" x2="${f2(x2)}" y2="${f2(y2)}">${stops.map(([o, c, a]) => `<stop offset="${f2(o)}" stop-color="${c}" stop-opacity="${f2(a)}"/>`).join('')}</linearGradient>`);
    return `url(#${id})`;
  }
  rad(stops: [number, string, number][], cx: number, cy: number, r: number, ry?: number) {
    const id = this.id('g');
    const tf = ry && ry !== r ? ` gradientTransform="translate(${f2(cx)} ${f2(cy)}) scale(1 ${f2(ry / r)}) translate(${f2(-cx)} ${f2(-cy)})"` : '';
    this.defs.push(`<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${f2(cx)}" cy="${f2(cy)}" r="${f2(r)}"${tf}>${stops.map(([o, c, a]) => `<stop offset="${f2(o)}" stop-color="${c}" stop-opacity="${f2(a)}"/>`).join('')}</radialGradient>`);
    return `url(#${id})`;
  }
  blur(sd: number) {
    const id = this.id('b');
    this.defs.push(`<filter id="${id}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${f2(sd)}"/></filter>`);
    return `url(#${id})`;
  }
  /** ragged ink edge (墨晕) */
  bleed(scale = 2.5, freq = 0.06) {
    const id = this.id('f');
    this.defs.push(`<filter id="${id}" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency="${freq}" numOctaves="2" seed="${(this.seed + this.n * 7) % 997}" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="${f2(scale)}" xChannelSelector="R" yChannelSelector="G"/></filter>`);
    return `url(#${id})`;
  }
  /** blotchy wash: modulates alpha with low-frequency noise (晕染) */
  wash(freq = 0.012, strength = 0.5, octaves = 3) {
    const id = this.id('f');
    const lo = 1 - strength;
    this.defs.push(`<filter id="${id}" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="${freq}" numOctaves="${octaves}" seed="${(this.seed + this.n * 13) % 997}" result="n"/><feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 ${f2(strength * 2.2)} ${f2(lo - strength * 0.6)}" result="a"/><feComposite in="SourceGraphic" in2="a" operator="in"/></filter>`);
    return `url(#${id})`;
  }
  /** rice-paper overlay (fibres + blotches) multiplied over the whole image */
  paperGrain(strength = 1) {
    const id = this.id('p');
    this.defs.push(`<filter id="${id}" x="0" y="0" width="100%" height="100%">
<feTurbulence type="fractalNoise" baseFrequency="0.8 0.025" numOctaves="2" seed="${this.seed % 997}" result="fib"/>
<feTurbulence type="fractalNoise" baseFrequency="0.006" numOctaves="3" seed="${(this.seed + 5) % 997}" result="blot"/>
<feColorMatrix in="fib" type="matrix" values="0 0 0 0 0.32  0 0 0 0 0.25  0 0 0 0 0.16  0 0 0 ${f2(0.12 * strength)} 0" result="fibc"/>
<feColorMatrix in="blot" type="matrix" values="0 0 0 0 0.42  0 0 0 0 0.32  0 0 0 0 0.2  0 0 0 ${f2(0.34 * strength)} ${f2(-0.1 * strength)}" result="blotc"/>
<feMerge><feMergeNode in="blotc"/><feMergeNode in="fibc"/></feMerge></filter>`);
    return `<rect width="${this.w}" height="${this.h}" fill="#000" filter="url(#${id})"/>`;
  }
  svg(body: string) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${this.w}" height="${this.h}" viewBox="0 0 ${this.w} ${this.h}"><defs>${this.defs.join('')}</defs>${body}</svg>`;
  }
}

// ------------------------------------------------------------------ noise
/** periodic 1-D value noise in [-1, 1] (period n) */
export function noise1(r: Rng, n = 64) {
  const v = Array.from({ length: n }, () => r.next() * 2 - 1);
  return (x: number) => {
    x = ((x % n) + n) % n;
    const i = Math.floor(x), f = x - i, t = f * f * (3 - 2 * f);
    return v[i] * (1 - t) + v[(i + 1) % n] * t;
  };
}
export function fbm1(r: Rng, oct = 4) {
  const ns = Array.from({ length: oct }, () => noise1(r));
  return (x: number) => ns.reduce((s, f, k) => s + f(x * 2 ** k) / 2 ** k, 0) * 0.55;
}

const path = (d: string, fill: string, extra = '') => `<path d="${d}" fill="${fill}"${extra}/>`;
const poly = (pts: Pt[]) => 'M' + pts.map((p) => `${f2(p[0])},${f2(p[1])}`).join('L') + 'Z';

// ------------------------------------------------------------------ mountains
export interface PeakOpt {
  cx: number;
  base: number;
  w: number;
  h: number;
  /** wash colour and opacity at the summit */
  tone: string;
  alpha: number;
  /** texture: 'hemp' 披麻 (soft, rounded), 'axe' 斧劈 (angular), 'none' (far silhouettes) */
  style?: 'hemp' | 'axe' | 'none';
  /** stroke scale (line widths) */
  lw?: number;
  ink?: string;
  /** fraction of the height that fades into mist at the foot (0 = solid to the base) */
  fade?: number;
  /** snow: white paper reserved on the upper slopes */
  snow?: boolean;
  /** summit x offset (-0.5..0.5 of w) */
  lean?: number;
  /** light side colour (paper reserve on the lit flank) */
  light?: string;
  density?: number;
}

/** Outline of one peak: left foot → summit → right foot (bell profile + shoulders + noise). */
export function peakOutline(o: PeakOpt, r: Rng): { pts: Pt[]; L: Pt[]; R: Pt[]; top: Pt } {
  const lean = o.lean ?? r.range(-0.22, 0.22);
  const pe = r.range(1.6, 2.7);
  const axe = o.style === 'axe';
  const sx = o.cx + lean * o.w;
  const nz = fbm1(r);
  const ph = r.range(0, 50);
  // shoulders: secondary bumps on either flank
  const bumps: [number, number, number][] = [];
  for (let i = 0, n = r.int(1, 4); i < n; i++) bumps.push([r.range(-0.7, 0.7), r.range(0.25, 0.75), r.range(0.1, 0.22)]);
  const hAt = (u: number) => {
    // u: -1 (left foot) .. 1 (right foot), measured from the summit
    let v = axe ? Math.max(0, 1 - Math.pow(Math.abs(u), 1.15)) ** 1.25 : Math.exp(-Math.pow(Math.abs(u) * 2.1, pe));
    for (const [c, hh, wd] of bumps) v = Math.max(v, hh * Math.exp(-(((u - c) / wd) ** 2)) * (1 - Math.abs(u)) * 1.6);
    const edge = Math.min(1, (1 - Math.abs(u)) * 8);
    return Math.max(0, v * edge);
  };
  const n = Math.max(16, Math.round(o.w / 5));
  const pts: Pt[] = [];
  let ti = 0;
  for (let i = 0; i <= n; i++) {
    const u = -1 + (2 * i) / n;
    const x = u < 0 ? sx + u * (sx - (o.cx - o.w / 2)) : sx + u * (o.cx + o.w / 2 - sx);
    const v = hAt(u);
    const wob = nz(ph + u * (axe ? 7 : 4)) * (axe ? 0.1 : 0.06) * Math.sin(Math.PI * Math.min(1, v * 1.2)) + (axe ? nz(ph + 40 + u * 25) * 0.035 : 0);
    const y = o.base - o.h * Math.max(0, v + wob * (v > 0.02 ? 1 : 0));
    pts.push([x, Math.min(o.base, y)]);
    if (y < pts[ti][1]) ti = i;
  }
  ti = Math.max(2, Math.min(n - 2, ti));
  const top = pts[ti];
  const L = pts.slice(0, ti + 1);
  const R = pts.slice(ti).reverse();
  return { pts, L, R, top };
}

/** One painted peak: graded wash, shadow flank, ridge contour, 皴 strokes, moss dots. */
export function peak(d: Doc, o: PeakOpt, r: Rng) {
  const { pts, L, R, top } = peakOutline(o, r);
  const lw = o.lw ?? 1;
  const ink = o.ink ?? C.ink;
  const fade = o.fade ?? 0.6;
  const y0 = top[1], y1 = o.base;
  let out = '';
  const shape = o.style === 'axe' ? poly(pts) : smoothPath(pts, true, 0.5);
  out += path(shape, d.lin([[0, o.tone, o.alpha], [1, o.tone, o.alpha * 0.8]], 0, y0, 0, y1));
  // light from the right: shadow wash on the left flank, paper reserve on the right
  const xl = o.cx - o.w / 2, xr = o.cx + o.w / 2;
  const tx = (top[0] - xl) / (xr - xl);
  out += path(shape, d.lin([[0, o.ink ?? C.ink, o.alpha * 0.35], [tx * 0.85, o.ink ?? C.ink, o.alpha * 0.25], [tx + 0.02, o.ink ?? C.ink, 0], [1, o.ink ?? C.ink, 0]], xl, 0, xr, 0));
  if (o.light) out += path(shape, d.lin([[0, o.light, 0], [Math.min(0.98, tx + 0.04), o.light, 0], [Math.min(0.99, tx + 0.18), o.light, 0.35], [1, o.light, 0.1]], xl, 0, xr, 0));
  if (o.snow) {
    // white paper reserved on the upper flanks, cut by dark rock ribs
    const sn: Pt[] = [];
    for (const [x, y] of [...L.slice(Math.floor(L.length * 0.45)), ...R.slice(Math.floor(R.length * 0.45)).reverse()]) sn.push([x, y + 1.5 * lw]);
    out += path(smoothPath(sn, true, 0.5), d.lin([[0, C.white, 0.95], [1, C.white, 0.5]], 0, y0, 0, y0 + o.h * 0.55));
  }
  if (o.style !== 'none') {
    // ridge contour: broken, pressure-varying line
    const cont = [...L.slice(Math.floor(L.length * 0.3)), ...R.slice(Math.floor(R.length * 0.3)).reverse()];
    let i = 0;
    let lines = '';
    while (i < cont.length - 3) {
      const len = r.int(4, 12);
      const seg = cont.slice(i, Math.min(cont.length, i + len + 1));
      if (seg.length > 1 && r.chance(0.8)) lines += path(brush(seg, r.range(1.2, 2.6) * lw, r, { taperIn: 0.2, taperOut: 0.3 }), ink, ` opacity="${f2(r.range(0.5, 0.85) * Math.min(1, o.alpha * 1.6))}"`);
      i += len;
    }
    // 皴 texture strokes following the slopes
    const area = o.w * o.h;
    const n = Math.round((area / (o.style === "axe" ? 650 : 600)) * (o.density ?? 1) / (lw * lw));
    for (let k = 0; k < n; k++) {
      const sideL = r.chance(0.6);
      const S = sideL ? L : R;
      const u = Math.pow(r.next(), 0.7) * 0.85 + 0.12; // along slope toward summit
      const j = Math.floor(u * (S.length - 1));
      const p = S[j];
      // inset toward the peak's axis
      const inset = r.range(0.02, 0.45);
      const sx = p[0] + (top[0] - p[0]) * inset;
      const sy = p[1] + (o.base - p[1]) * r.range(0.02, 0.2) + 2 * lw;
      if (sy > o.base - o.h * fade * 0.25) continue;
      const foot = S[0];
      const dx = foot[0] - top[0], dy = foot[1] - top[1];
      const len = Math.hypot(dx, dy);
      const L1 = r.range(0.08, 0.25) * o.h * (o.style === 'axe' ? 0.8 : 1);
      let pts2: Pt[];
      if (o.style === 'axe') {
        // short, sharp, slanted strokes (斧劈) — side of the brush
        const a = Math.atan2(dy, dx) + r.range(-0.3, 0.3);
        pts2 = [[sx, sy], [sx + Math.cos(a) * L1 * 0.5, sy + Math.sin(a) * L1 * 0.5 + r.range(-1, 1)], [sx + Math.cos(a) * L1, sy + Math.sin(a) * L1]];
        out += path(brush(pts2, r.range(2, 5) * lw, r, { taperIn: 0.05, taperOut: 0.8 }), ink, ` opacity="${f2(r.range(0.15, 0.4) * Math.min(1, o.alpha * 1.4))}"`);
      } else {
        const ux = dx / len, uy = dy / len;
        const bend = r.range(-0.25, 0.25);
        pts2 = [[sx, sy], [sx + ux * L1 * 0.5 + uy * bend * L1 * 0.3, sy + uy * L1 * 0.5 + 0.2 * L1], [sx + ux * L1 * 0.8, sy + uy * L1 + 0.45 * L1]];
        out += path(brush(pts2, r.range(0.7, 1.6) * lw, r, { taperIn: 0.3, taperOut: 0.5 }), ink, ` opacity="${f2(r.range(0.2, 0.5) * Math.min(1, o.alpha * 1.4))}"`);
      }
    }
    // 苔点 moss dots near the ridge
    const nd = Math.round((o.w / (14 * lw)) * (o.density ?? 1));
    for (let k = 0; k < nd; k++) {
      const S = r.chance(0.5) ? L : R;
      const p = S[Math.floor(r.range(0.35, 0.98) * (S.length - 1))];
      const rr = r.range(0.8, 2.2) * lw;
      out += path(blob(p[0] + r.range(-2, 2) * lw, p[1] + r.range(0, 4) * lw, rr * 1.4, rr, r, 0.3, 7), ink, ` opacity="${f2(r.range(0.55, 0.9) * Math.min(1, o.alpha * 1.6))}"`);
    }
    out += lines;
  }
  if (fade <= 0) return out;
  const mid = d.id('m');
  const g = d.lin([[0, '#fff', 1], [Math.max(0, 1 - fade), '#fff', 1], [1, '#fff', 0]], 0, y0, 0, y1);
  d.def(`<mask id="${mid}" maskUnits="userSpaceOnUse" x="${f2(o.cx - o.w)}" y="${f2(y0 - 10)}" width="${f2(o.w * 2)}" height="${f2(y1 - y0 + 20)}"><rect x="${f2(o.cx - o.w)}" y="${f2(y0 - 10)}" width="${f2(o.w * 2)}" height="${f2(y1 - y0 + 20)}" fill="${g}"/></mask>`);
  return `<g mask="url(#${mid})">${out}</g>`;
}

/** A row of peaks between x0..x1 sitting on `base`; returns svg. */
export function range(d: Doc, r: Rng, a: { x0: number; x1: number; base: number; hMin: number; hMax: number; wk?: number; n?: number; foot?: number } & Omit<PeakOpt, 'cx' | 'base' | 'w' | 'h'>) {
  const wk = a.wk ?? 1;
  const n = a.n ?? Math.max(2, Math.round((a.x1 - a.x0) / ((a.hMin + a.hMax) * 0.5 * 1.1 * wk)));
  const peaks: PeakOpt[] = [];
  const feet: PeakOpt[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i + r.range(0.15, 0.85)) / n;
    const h = a.hMin + (a.hMax - a.hMin) * Math.pow(r.next(), 1.4);
    const cx = a.x0 + (a.x1 - a.x0) * t;
    const w = h * r.range(1.2, 2.0) * wk;
    peaks.push({ ...a, cx, base: a.base, h, w });
    // foothills (客山) overlapping the main peak's foot
    for (let k = 0, m = r.int(0, a.foot ?? 2); k < m; k++) {
      const hh = h * r.range(0.3, 0.55);
      feet.push({ ...a, cx: cx + r.range(-0.45, 0.45) * w, base: a.base, h: hh, w: hh * r.range(1.4, 2.4) * wk, tone: a.tone, alpha: Math.min(1, a.alpha * 1.1) });
    }
  }
  // back-to-front: taller first, foothills in front
  peaks.sort((p, q) => q.h - p.h);
  feet.sort((p, q) => q.h - p.h);
  return [...peaks, ...feet].map((p) => peak(d, p, r)).join('');
}

/** Ridge-line silhouette band (very far hills): one smooth outline, graded wash. */
export function hills(d: Doc, r: Rng, a: { x0: number; x1: number; base: number; amp: number; tone: string; alpha: number; freq?: number; fade?: number; rough?: number }) {
  const nz = fbm1(r);
  const ph = r.range(0, 60);
  const pts: Pt[] = [[a.x0, a.base]];
  const n = Math.round((a.x1 - a.x0) / 8);
  let top = Infinity;
  for (let i = 0; i <= n; i++) {
    const x = a.x0 + ((a.x1 - a.x0) * i) / n;
    const v = nz(ph + (x / 100) * (a.freq ?? 1)) * 1.3 + 0.5 + nz(ph + 30 + (x / 18) * (a.freq ?? 1)) * 0.12 * (a.rough ?? 1);
    const y = a.base - a.amp * Math.max(0.05, v);
    top = Math.min(top, y);
    pts.push([x, y]);
  }
  pts.push([a.x1, a.base]);
  const fade = a.fade ?? 0.7;
  return path(smoothPath(pts, true, 0.5), d.lin([[0, a.tone, a.alpha], [1 - fade, a.tone, a.alpha * 0.8], [1, a.tone, fade > 0 ? 0 : a.alpha]], 0, top, 0, a.base));
}

/** Horizontal mist band (paper colour, blurred). */
export function mist(d: Doc, r: Rng, x0: number, x1: number, y: number, h: number, color: string, alpha: number, n = 6) {
  let s = '';
  for (let i = 0; i < n; i++) {
    const cx = x0 + (x1 - x0) * r.next();
    const rx = (x1 - x0) * r.range(0.12, 0.3);
    s += `<ellipse cx="${f2(cx)}" cy="${f2(y + r.range(-h, h) * 0.3)}" rx="${f2(rx)}" ry="${f2(h * r.range(0.3, 0.6))}" fill="${color}" opacity="${f2(alpha * r.range(0.5, 1))}"/>`;
  }
  return `<g filter="${d.blur(h * 0.35)}">${s}</g>`;
}

// ------------------------------------------------------------------ trees
/** Large pine with 攒针 needle fans on wash clumps and visible branches. */
function pineBig(x: number, y: number, h: number, r: Rng, ink: string, alpha: number) {
  const lean = r.range(-0.18, 0.18) * h;
  const top: Pt = [x + lean, y - h];
  const mid: Pt = [x + lean * 0.2 + r.range(-1, 1) * h * 0.05, y - h * 0.5];
  let s = path(brush([[x, y], mid, top], h * 0.06, r, { taperIn: 0.02, taperOut: 0.85, jitter: 0.2 }), ink, ` opacity="${f2(alpha * 0.85)}"`);
  // bark scales
  for (let i = 0; i < h / 12; i++) {
    const t = r.range(0.05, 0.6);
    const bx = x + (mid[0] - x) * t * 2 * (t < 0.5 ? 1 : 0.5) , by = y - h * t;
    s += `<path d="M${f2(bx - h * 0.012)},${f2(by)}q${f2(h * 0.012)},${f2(-h * 0.01)} ${f2(h * 0.024)},0" stroke="${C.paper}" stroke-width="${f2(h * 0.004)}" fill="none" opacity="0.5"/>`;
  }
  const tiers = Math.max(3, Math.round(h / 45));
  for (let i = 0; i < tiers; i++) {
    const t = 0.38 + (0.62 * i) / tiers + r.range(-0.03, 0.03);
    const tx = x + lean * t * t, ty = y - h * t;
    for (const dir of [-1, 1]) {
      if (i < tiers - 1 && r.chance(0.25)) continue;
      const wl = h * (0.42 - 0.28 * (i / tiers)) * r.range(0.7, 1.15);
      const ex = tx + dir * wl, ey = ty - r.range(-0.02, 0.06) * h;
      s += path(brush([[tx, ty], [tx + dir * wl * 0.5, ty - h * 0.02], [ex, ey]], h * 0.018, r, { taperIn: 0.05, taperOut: 0.7 }), ink, ` opacity="${f2(alpha * 0.85)}"`);
      // clump: grey wash + needle fans
      const cx = tx + dir * wl * 0.6, cy = ey - h * 0.015;
      const rx = wl * 0.55, ry = h * 0.05;
      s += path(blob(cx, cy, rx, ry, r, 0.25, 10), ink, ` opacity="${f2(alpha * 0.28)}"`);
      const fans = Math.max(3, Math.round(rx / (h * 0.045)));
      for (let k = 0; k < fans; k++) {
        const fx = cx - rx * 0.85 + (rx * 1.7 * (k + 0.5)) / fans, fy = cy + r.range(-0.3, 0.3) * ry;
        const L = h * r.range(0.035, 0.05);
        let fan = '';
        for (let j = 0; j < 7; j++) {
          const a = -Math.PI * (0.12 + (0.76 * j) / 6);
          fan += `M${f2(fx)},${f2(fy)}l${f2(Math.cos(a) * L)},${f2(Math.sin(a) * L * 0.75)}`;
        }
        s += `<path d="${fan}" stroke="${ink}" stroke-width="${f2(Math.max(0.7, h * 0.0045))}" stroke-linecap="round" opacity="${f2(alpha * 0.85)}"/>`;
      }
    }
  }
  return s;
}

export function pine(x: number, y: number, h: number, r: Rng, ink: string = C.ink, alpha = 1) {
  if (h >= 150) return pineBig(x, y, h, r, ink, alpha);
  const lean = r.range(-0.25, 0.25) * h;
  const trunk: Pt[] = [[x, y], [x + lean * 0.3 + r.range(-1, 1) * h * 0.05, y - h * 0.45], [x + lean, y - h * 0.95]];
  let s = path(brush(trunk, Math.max(1, h * 0.08), r, { taperIn: 0.02, taperOut: 0.9 }), ink, ` opacity="${f2(alpha * 0.9)}"`);
  const tiers = Math.max(2, Math.round(h / 13));
  let side = r.chance(0.5) ? 1 : -1;
  for (let i = 0; i < tiers; i++) {
    const t = 0.42 + (0.5 * i) / Math.max(1, tiers - 1) + r.range(-0.03, 0.03);
    const tx = x + lean * t * t, ty = y - h * t;
    const wl = h * (0.4 - 0.22 * (i / tiers)) * r.range(0.75, 1.15);
    // one long bough to alternating sides, a short one opposite
    for (const [dir, k] of [[side, 1], [-side, r.range(0.35, 0.6)]] as const) {
      const ww = wl * k;
      const cx = tx + dir * ww * 0.45, cy = ty - r.range(0, 1) * h * 0.02;
      s += path(blob(cx, cy, ww * 0.6, Math.max(1, h * 0.07), r, 0.4, 9), ink, ` opacity="${f2(alpha * r.range(0.7, 0.92))}"`);
      if (h > 28) {
        const n = Math.round(ww / 3.5);
        let nd = '';
        for (let j = 0; j < n; j++) {
          const px = cx - ww * 0.55 + (ww * 1.1 * j) / n;
          nd += `M${f2(px)},${f2(cy - h * 0.03)}l${f2(dir * h * 0.015)},${f2(-h * 0.045)}`;
        }
        s += `<path d="${nd}" stroke="${ink}" stroke-width="${f2(Math.max(0.6, h * 0.01))}" opacity="${f2(alpha * 0.7)}"/>`;
      }
    }
    side = -side;
  }
  s += path(blob(x + lean, y - h * 0.97, h * 0.12, h * 0.06, r, 0.4, 8), ink, ` opacity="${f2(alpha * 0.85)}"`);
  return s;
}

/** Leaf tree with 点叶 (dotted foliage). */
export function leafTree(x: number, y: number, h: number, r: Rng, ink: string = C.ink, alpha = 1, leaf?: string) {
  const lean = r.range(-0.2, 0.2) * h;
  let s = path(brush([[x, y], [x + lean * 0.4, y - h * 0.4], [x + lean, y - h * 0.65]], Math.max(1, h * 0.08), r, { taperIn: 0.02, taperOut: 0.9 }), ink, ` opacity="${f2(alpha * 0.9)}"`);
  const cx = x + lean, cy = y - h * 0.7;
  const n = Math.max(6, Math.round(h * 0.8));
  for (let i = 0; i < n; i++) {
    const a = r.next() * Math.PI * 2, rr = Math.sqrt(r.next());
    const px = cx + Math.cos(a) * rr * h * 0.38, py = cy + Math.sin(a) * rr * h * 0.28;
    const sz = Math.max(0.8, h * r.range(0.025, 0.055));
    s += `<ellipse cx="${f2(px)}" cy="${f2(py)}" rx="${f2(sz * 1.4)}" ry="${f2(sz)}" fill="${leaf ?? ink}" opacity="${f2(alpha * r.range(0.45, 0.9))}"/>`;
  }
  return s;
}

/** Distant tree line: soft vertical dabs along a base line. */
export function treeLine(x0: number, x1: number, y: number, h: number, r: Rng, ink: string, alpha: number) {
  let s = '';
  for (let x = x0; x < x1; x += r.range(h * 0.25, h * 0.7)) {
    const hh = h * r.range(0.5, 1.1);
    s += path(blob(x, y - hh * 0.5, hh * 0.22, hh * 0.5, r, 0.3, 8), ink, ` opacity="${f2(alpha * r.range(0.5, 1))}"`);
  }
  return s;
}

// ------------------------------------------------------------------ architecture
/** Curved roof with upturned eaves; y is the eave line. */
export function roof(x: number, y: number, w: number, h: number, ink: string, alpha = 1) {
  const e = w * 0.12;
  const dd = `M${f2(x - w / 2 - e)},${f2(y - h * 0.25)}Q${f2(x - w / 2)},${f2(y + h * 0.05)} ${f2(x - w * 0.3)},${f2(y)}L${f2(x + w * 0.3)},${f2(y)}Q${f2(x + w / 2)},${f2(y + h * 0.05)} ${f2(x + w / 2 + e)},${f2(y - h * 0.25)}Q${f2(x + w * 0.3)},${f2(y - h * 0.45)} ${f2(x + w * 0.22)},${f2(y - h)}L${f2(x - w * 0.22)},${f2(y - h)}Q${f2(x - w * 0.3)},${f2(y - h * 0.45)} ${f2(x - w / 2 - e)},${f2(y - h * 0.25)}Z`;
  let s = path(dd, ink, ` opacity="${f2(alpha)}"`);
  if (w > 60) {
    // tile rows (瓦垄) and a ridge line
    const n = Math.round(w / 9);
    let t = '';
    for (let i = 1; i < n; i++) {
      const u = i / n - 0.5;
      t += `M${f2(x + u * w * 1.05)},${f2(y - h * 0.08)}L${f2(x + u * w * 0.42)},${f2(y - h * 0.95)}`;
    }
    s += `<path d="${t}" stroke="#d8ccb0" stroke-width="${f2(Math.max(0.6, w * 0.004))}" opacity="${f2(alpha * 0.28)}"/>`;
    s += `<path d="M${f2(x - w * 0.24)},${f2(y - h)}H${f2(x + w * 0.24)}" stroke="${ink}" stroke-width="${f2(h * 0.12)}" stroke-linecap="round" opacity="${f2(alpha)}"/>`;
    for (const sd of [-1, 1]) s += `<path d="M${f2(x + sd * w * 0.24)},${f2(y - h)}q${f2(sd * w * 0.02)},${f2(-h * 0.1)} ${f2(sd * w * 0.035)},${f2(-h * 0.22)}" stroke="${ink}" stroke-width="${f2(h * 0.07)}" fill="none" stroke-linecap="round" opacity="${f2(alpha)}"/>`;
  }
  return s;
}

/** Multi-storey tower / pavilion standing on baseY. */
export function tower(x: number, baseY: number, w: number, h: number, tiers: number, ink: string, wallC: string, alpha = 1) {
  let s = '';
  const th = h / tiers;
  for (let i = 0; i < tiers; i++) {
    const ww = w * (1 - i * 0.18);
    const yb = baseY - th * i;
    s += `<rect x="${f2(x - ww * 0.36)}" y="${f2(yb - th * 0.62)}" width="${f2(ww * 0.72)}" height="${f2(th * 0.62)}" fill="${wallC}" stroke="${ink}" stroke-width="${f2(Math.max(0.6, w * 0.02))}" opacity="${f2(alpha)}"/>`;
    // pillars / windows
    for (let k = 1; k < 4; k++) s += `<rect x="${f2(x - ww * 0.36 + (ww * 0.72 * k) / 4 - ww * 0.015)}" y="${f2(yb - th * 0.6)}" width="${f2(ww * 0.03)}" height="${f2(th * 0.58)}" fill="${ink}" opacity="${f2(alpha * 0.7)}"/>`;
    s += roof(x, yb - th * 0.58, ww, th * 0.42, ink, alpha);
  }
  return s;
}

/** City wall with crenellations between x0 and x1; top at y, foot at y + h. */
export function wall(x0: number, x1: number, y: number, h: number, ink: string, face: string, r: Rng, alpha = 1) {
  let s = `<rect x="${f2(x0)}" y="${f2(y)}" width="${f2(x1 - x0)}" height="${f2(h)}" fill="${face}" opacity="${f2(alpha)}"/>`;
  const cw = Math.max(2, h * 0.16);
  for (let x = x0; x < x1 - cw; x += cw * 2) s += `<rect x="${f2(x)}" y="${f2(y - cw * 0.8)}" width="${f2(cw)}" height="${f2(cw * 0.8 + 0.5)}" fill="${face}" stroke="${ink}" stroke-width="${f2(Math.max(0.5, h * 0.02))}" opacity="${f2(alpha)}"/>`;
  s += `<path d="M${f2(x0)},${f2(y)}H${f2(x1)}" stroke="${ink}" stroke-width="${f2(Math.max(0.7, h * 0.04))}" opacity="${f2(alpha * 0.9)}"/>`;
  // brick courses
  const rows = Math.max(2, Math.round(h / Math.max(3, h * 0.18)));
  for (let i = 1; i < rows; i++) {
    const yy = y + (h * i) / rows;
    s += `<path d="M${f2(x0)},${f2(yy)}H${f2(x1)}" stroke="${ink}" stroke-width="${f2(Math.max(0.3, h * 0.008))}" opacity="${f2(alpha * r.range(0.15, 0.3))}" stroke-dasharray="${f2(h * 0.4)} ${f2(h * 0.08)}"/>`;
  }
  // shadow at the foot
  s += `<rect x="${f2(x0)}" y="${f2(y + h * 0.65)}" width="${f2(x1 - x0)}" height="${f2(h * 0.35)}" fill="${ink}" opacity="${f2(alpha * 0.18)}"/>`;
  return s;
}

/** Gate tower on a wall: arched gate + two-storey pavilion. */
export function gate(x: number, wallTop: number, wallH: number, w: number, ink: string, face: string, alpha = 1) {
  let s = `<rect x="${f2(x - w / 2)}" y="${f2(wallTop - wallH * 0.15)}" width="${f2(w)}" height="${f2(wallH * 1.15)}" fill="${face}" stroke="${ink}" stroke-width="${f2(Math.max(0.6, w * 0.012))}" opacity="${f2(alpha)}"/>`;
  const gw = w * 0.28, gh = wallH * 0.65;
  s += `<path d="M${f2(x - gw / 2)},${f2(wallTop + wallH)}V${f2(wallTop + wallH - gh * 0.7)}Q${f2(x)},${f2(wallTop + wallH - gh * 1.15)} ${f2(x + gw / 2)},${f2(wallTop + wallH - gh * 0.7)}V${f2(wallTop + wallH)}Z" fill="${ink}" opacity="${f2(alpha * 0.85)}"/>`;
  s += tower(x, wallTop - wallH * 0.15, w * 0.85, wallH * 1.3, 2, ink, face, alpha);
  return s;
}

export function house(x: number, y: number, w: number, ink: string, face: string, r: Rng, alpha = 1) {
  const h = w * r.range(0.35, 0.5);
  let s = `<rect x="${f2(x - w * 0.4)}" y="${f2(y - h)}" width="${f2(w * 0.8)}" height="${f2(h)}" fill="${face}" stroke="${ink}" stroke-width="${f2(Math.max(0.5, w * 0.015))}" opacity="${f2(alpha)}"/>`;
  s += `<rect x="${f2(x - w * 0.08)}" y="${f2(y - h * 0.7)}" width="${f2(w * 0.16)}" height="${f2(h * 0.7)}" fill="${ink}" opacity="${f2(alpha * 0.7)}"/>`;
  s += roof(x, y - h + 0.5, w * 0.95, w * 0.32, ink, alpha);
  return s;
}

export function pagoda(x: number, y: number, h: number, ink: string, face: string, alpha = 1) {
  let s = '';
  const n = 7;
  const th = (h * 0.9) / n;
  for (let i = 0; i < n; i++) {
    const w = h * 0.28 * (1 - i * 0.09);
    const yb = y - th * i;
    s += `<rect x="${f2(x - w * 0.3)}" y="${f2(yb - th * 0.6)}" width="${f2(w * 0.6)}" height="${f2(th * 0.6)}" fill="${face}" opacity="${f2(alpha)}"/>`;
    s += roof(x, yb - th * 0.55, w, th * 0.45, ink, alpha);
  }
  s += `<path d="M${f2(x)},${f2(y - h * 0.9)}V${f2(y - h)}" stroke="${ink}" stroke-width="${f2(Math.max(0.6, h * 0.015))}" opacity="${f2(alpha)}"/>`;
  return s;
}

export function tent(x: number, y: number, w: number, ink: string, face: string, r: Rng, alpha = 1) {
  const h = w * r.range(0.5, 0.7);
  const d = `M${f2(x - w / 2)},${f2(y)}Q${f2(x - w * 0.3)},${f2(y - h * 0.6)} ${f2(x)},${f2(y - h)}Q${f2(x + w * 0.3)},${f2(y - h * 0.6)} ${f2(x + w / 2)},${f2(y)}Z`;
  let s = path(d, face, ` stroke="${ink}" stroke-width="${f2(Math.max(0.5, w * 0.03))}" opacity="${f2(alpha)}"`);
  s += `<path d="M${f2(x)},${f2(y - h)}V${f2(y)}" stroke="${ink}" stroke-width="${f2(Math.max(0.4, w * 0.02))}" opacity="${f2(alpha * 0.6)}"/>`;
  s += `<path d="M${f2(x - w * 0.1)},${f2(y)}L${f2(x)},${f2(y - h * 0.45)}L${f2(x + w * 0.1)},${f2(y)}Z" fill="${ink}" opacity="${f2(alpha * 0.75)}"/>`;
  return s;
}

/** Banner: pole + waving flag. */
export function flag(x: number, y: number, h: number, color: string, ink: string, r: Rng, alpha = 1, dir = 1) {
  const fw = h * r.range(0.35, 0.5) * dir, fh = h * 0.28;
  let s = `<path d="M${f2(x)},${f2(y)}V${f2(y - h)}" stroke="${ink}" stroke-width="${f2(Math.max(0.5, h * 0.03))}" opacity="${f2(alpha)}"/>`;
  const t = y - h;
  s += `<path d="M${f2(x)},${f2(t)}Q${f2(x + fw * 0.5)},${f2(t - fh * 0.2)} ${f2(x + fw)},${f2(t + fh * 0.1)}L${f2(x + fw * 0.9)},${f2(t + fh * 0.6)}L${f2(x + fw)},${f2(t + fh * 1.05)}Q${f2(x + fw * 0.5)},${f2(t + fh * 0.8)} ${f2(x)},${f2(t + fh)}Z" fill="${color}" opacity="${f2(alpha * 0.92)}"/>`;
  return s;
}

/** Tiny ink soldiers in a loose formation (for distant armies). */
export function army(x0: number, x1: number, y: number, depth: number, s: number, r: Rng, ink: string, alpha: number, flagC?: string, density = 1) {
  let out = '';
  const rows = Math.max(1, Math.round(depth / (s * 1.2)));
  for (let j = 0; j < rows; j++) {
    const yy = y - depth + (depth * (j + 1)) / rows;
    const k = 1 - (rows - 1 - j) * 0.06;
    for (let x = x0 + r.range(0, s); x < x1; x += s * r.range(0.7, 1.1) / density) {
      const sz = s * k;
      out += `<ellipse cx="${f2(x)}" cy="${f2(yy - sz * 1.6)}" rx="${f2(sz * 0.22)}" ry="${f2(sz * 0.25)}" fill="${ink}" opacity="${f2(alpha)}"/>`;
      out += `<path d="M${f2(x - sz * 0.25)},${f2(yy)}L${f2(x)},${f2(yy - sz * 1.4)}L${f2(x + sz * 0.25)},${f2(yy)}Z" fill="${ink}" opacity="${f2(alpha * 0.85)}"/>`;
      if (r.chance(0.5)) out += `<path d="M${f2(x + sz * 0.3)},${f2(yy - sz * 0.2)}L${f2(x + sz * 0.45)},${f2(yy - sz * 2.6)}" stroke="${ink}" stroke-width="${f2(Math.max(0.3, sz * 0.07))}" opacity="${f2(alpha * 0.8)}"/>`;
    }
    if (flagC && j === 0) for (let x = x0 + s * 3; x < x1; x += s * r.range(6, 12)) out += flag(x, yy - s * 0.5, s * 4, flagC, ink, r, alpha);
  }
  return out;
}

/** War junk: hull, deck house, mast and sail; (x, y) = waterline centre. */
export function ship(x: number, y: number, w: number, ink: string, face: string, sail: string, r: Rng, alpha = 1, flagC?: string) {
  const h = w * 0.16;
  let s = `<path d="M${f2(x - w / 2)},${f2(y - h)}Q${f2(x - w * 0.42)},${f2(y)} ${f2(x - w * 0.3)},${f2(y)}L${f2(x + w * 0.32)},${f2(y)}Q${f2(x + w * 0.45)},${f2(y)} ${f2(x + w / 2)},${f2(y - h * 1.2)}Z" fill="${ink}" opacity="${f2(alpha * 0.9)}"/>`;
  s += `<rect x="${f2(x - w * 0.2)}" y="${f2(y - h * 2)}" width="${f2(w * 0.38)}" height="${f2(h * 1.05)}" fill="${face}" stroke="${ink}" stroke-width="${f2(Math.max(0.5, w * 0.008))}" opacity="${f2(alpha)}"/>`;
  s += roof(x, y - h * 2, w * 0.42, h * 0.6, ink, alpha);
  s += tower(x + w * 0.05, y - h * 2.5, w * 0.2, h * 1.4, 1, ink, face, alpha);
  const mx = x - w * 0.05;
  s += `<path d="M${f2(mx)},${f2(y - h)}V${f2(y - w * 0.85)}" stroke="${ink}" stroke-width="${f2(Math.max(0.6, w * 0.012))}" opacity="${f2(alpha)}"/>`;
  // battened sail
  const sw = w * 0.32, st = y - w * 0.8, sb = y - h * 2.8;
  s += `<path d="M${f2(mx - sw * 0.1)},${f2(st)}L${f2(mx + sw)},${f2(st + (sb - st) * 0.08)}Q${f2(mx + sw * 1.1)},${f2((st + sb) / 2)} ${f2(mx + sw * 0.95)},${f2(sb)}L${f2(mx - sw * 0.05)},${f2(sb)}Z" fill="${sail}" stroke="${ink}" stroke-width="${f2(Math.max(0.5, w * 0.006))}" opacity="${f2(alpha * 0.9)}"/>`;
  for (let i = 1; i < 6; i++) {
    const yy = st + ((sb - st) * i) / 6;
    s += `<path d="M${f2(mx - sw * 0.08)},${f2(yy)}L${f2(mx + sw * 1.02)},${f2(yy + w * 0.01)}" stroke="${ink}" stroke-width="${f2(Math.max(0.4, w * 0.004))}" opacity="${f2(alpha * 0.6)}"/>`;
  }
  if (flagC) s += flag(mx, y - w * 0.85, w * 0.12, flagC, ink, r, alpha);
  // oars
  for (let i = 0; i < 7; i++) {
    const ox = x - w * 0.3 + (w * 0.6 * i) / 6;
    s += `<path d="M${f2(ox)},${f2(y - h * 0.5)}l${f2(-w * 0.03)},${f2(h * 1.2)}" stroke="${ink}" stroke-width="${f2(Math.max(0.4, w * 0.005))}" opacity="${f2(alpha * 0.7)}"/>`;
  }
  return s;
}

/** Water ripple strokes in a band. */
export function ripples(x0: number, x1: number, y0: number, y1: number, r: Rng, ink: string, alpha: number, n: number, lw = 1) {
  let s = '';
  for (let i = 0; i < n; i++) {
    const t = Math.pow(r.next(), 0.8);
    const y = y0 + (y1 - y0) * t;
    const x = x0 + (x1 - x0) * r.next();
    const len = (x1 - x0) * r.range(0.01, 0.05) * (0.4 + t);
    const a = y + r.range(-1, 1);
    s += path(brush([[x, y], [x + len * 0.5, a - len * 0.05], [x + len, y]], Math.max(0.5, (0.5 + t * 1.5) * lw), r, { taperIn: 0.4, taperOut: 0.4 }), ink, ` opacity="${f2(alpha * r.range(0.4, 1))}"`);
  }
  return s;
}

/** A wild goose formation (a few V strokes) — sky accent. */
export function geese(x: number, y: number, s: number, n: number, r: Rng, ink: string, alpha: number) {
  let o = '';
  for (let i = 0; i < n; i++) {
    const gx = x + i * s * r.range(1.6, 2.4), gy = y + (i % 2) * s * 0.6 + i * s * 0.15;
    o += `<path d="M${f2(gx - s)},${f2(gy - s * 0.3)}Q${f2(gx - s * 0.4)},${f2(gy - s * 0.4)} ${f2(gx)},${f2(gy)}Q${f2(gx + s * 0.4)},${f2(gy - s * 0.45)} ${f2(gx + s)},${f2(gy - s * 0.35)}" stroke="${ink}" fill="none" stroke-width="${f2(Math.max(0.6, s * 0.18))}" stroke-linecap="round" opacity="${f2(alpha)}"/>`;
  }
  return o;
}

export { blob, brush, smoothPath, poly, path };
