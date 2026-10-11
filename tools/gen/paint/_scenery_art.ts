// Large illustrations: title key art + animated title glow (mm, mm/base),
// era-selection backdrop, endings and credits (ending), court backdrops
// (ad/background, see _scenery_court.ts), tournament bracket (arena/base) and
// the small UI panels of those directories (_scenery_ui.ts).
//
// Full-screen images are painted at 2× their original 640×480 design size
// (Backdrop scales by the texture's own size); the title glow frames share
// that 2× scale so they stay registered with the key art.
import type { FrameJob, PaintOut } from '../types.ts';
import { FONT_KAI, seal } from '../ink.ts';
import { paintCourt } from './_scenery_court.ts';
import { GLYPHS, word } from './_scenery_glyphs.ts';
import {
  army, blob, brush, C, Doc, f2, flag, gate, geese, hills, house, leafTree, mist, mix, path, peak, pine, range, ripples, rng, roof, ship, smoothPath, tent, tower, wall,
  type Pt, type Rng,
} from './_scenery_kit.ts';
import { paintUi } from './_scenery_ui.ts';

const K = 2; // full-screen art scale

// ------------------------------------------------------------------ shared bits
function paperBg(d: Doc, top: string = '#f1e7cf', bottom: string = '#e2d3b2') {
  return `<rect width="${d.w}" height="${d.h}" fill="${d.lin([[0, top, 1], [1, bottom, 1]], 0, 0, 0, d.h)}"/><rect width="${d.w}" height="${d.h}" fill="${C.paperDark}" filter="${d.wash(0.004, 0.5, 3)}" opacity="0.35"/>`;
}
/** vignette darkening the edges (scroll-painting look) */
function vignette(d: Doc, a = 0.35, col = '#3b2a18') {
  return `<rect width="${d.w}" height="${d.h}" fill="${d.rad([[0.55, col, 0], [1, col, a]], d.w / 2, d.h / 2, d.w * 0.72, d.h * 0.72)}"/>`;
}
function river(d: Doc, r: Rng, pts: Pt[], w0: number, w1: number, water: string, ink: string, lw = 1) {
  // a widening ribbon along pts
  const L: Pt[] = [], R: Pt[] = [];
  pts.forEach((p, i) => {
    const t = i / (pts.length - 1);
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let nx = -(b[1] - a[1]), ny = b[0] - a[0];
    const l = Math.hypot(nx, ny) || 1;
    nx /= l;
    ny /= l;
    const w = w0 + (w1 - w0) * t;
    L.push([p[0] + nx * w, p[1] + ny * w]);
    R.push([p[0] - nx * w, p[1] - ny * w]);
  });
  let s = path(smoothPath([...L, ...R.reverse()], true, 0.5), water);
  // bank lines
  s += path(brush(L.slice(0, Math.ceil(L.length * 0.8)), 1.6 * lw, r, { taperIn: 0.3, taperOut: 0.5 }), ink, ' opacity="0.35"');
  return s;
}

// ------------------------------------------------------------------ title (mm/base/main + mm/logofire*)
const TITLE = { text: '三国墨英传', x: 96, y: 62, size: 178 };
const titleGlyphs = (ink: string, extra = '') => word(TITLE.text, TITLE.x, TITLE.y, TITLE.size, rng('title-glyphs'), ink, 0.94, extra);

function keyArt(): string {
  const W = 640 * K, H = 480 * K;
  const d = new Doc(W, H, 101);
  const r = rng('keyart');
  let s = paperBg(d);
  // setting sun behind the peaks
  s += `<circle cx="1130" cy="330" r="130" fill="${C.gamboge}" opacity="0.18" filter="${d.blur(40)}"/>`;
  s += `<circle cx="1130" cy="330" r="74" fill="${C.cinnabar}" opacity="0.78" filter="${d.wash(0.03, 0.25, 2)}"/>`;
  s += geese(860, 330, 9, 5, r, C.inkSoft, 0.6);
  // far ranges
  s += range(d, r, { x0: 420, x1: 1340, base: 640, hMin: 170, hMax: 400, n: 6, wk: 1.1, tone: '#76828c', alpha: 0.34, style: 'none', lw: 2, fade: 0.8, foot: 0 });
  s += hills(d, r, { x0: 0, x1: W, base: 650, amp: 120, tone: '#76828c', alpha: 0.25, fade: 0.8, freq: 0.6 });
  s += mist(d, r, 0, W, 600, 130, '#efe5cd', 0.9, 8);
  // right: a towering axe-cut peak above the river (fades out where the menu sits)
  s += peak(d, { cx: 1080, base: 820, w: 520, h: 600, tone: C.inkSoft, alpha: 0.72, style: 'axe', lw: 1.8, fade: 0.65, ink: C.ink, lean: -0.1, light: '#f3ead6' }, r);
  s += peak(d, { cx: 900, base: 760, w: 300, h: 300, tone: C.inkSoft, alpha: 0.6, style: 'axe', lw: 1.6, fade: 0.6, ink: C.ink }, r);
  // left: massive hemp-textured mountains under the title
  s += peak(d, { cx: 560, base: 820, w: 520, h: 360, tone: '#55595c', alpha: 0.55, style: 'hemp', lw: 1.8, fade: 0.6, ink: C.ink }, r);
  s += peak(d, { cx: 230, base: 860, w: 640, h: 520, tone: C.inkSoft, alpha: 0.78, style: 'hemp', lw: 2, fade: 0.55, ink: C.ink, lean: 0.12, light: '#f3ead6' }, r);
  s += peak(d, { cx: 420, base: 880, w: 380, h: 260, tone: C.inkSoft, alpha: 0.75, style: 'hemp', lw: 1.8, fade: 0.5, ink: C.ink }, r);
  s += mist(d, r, 100, 1200, 790, 90, '#efe5cd', 0.85, 9);
  // city on the plateau: wall, gate tower, banners
  s += wall(470, 830, 742, 34, C.ink, '#e8dcc0', r, 0.92);
  s += gate(650, 742, 34, 92, C.ink, '#e8dcc0', 0.95);
  s += tower(500, 742, 40, 70, 2, C.ink, '#e8dcc0', 0.9);
  s += tower(800, 742, 40, 70, 2, C.ink, '#e8dcc0', 0.9);
  for (let x = 520; x < 800; x += 46) s += flag(x, 740, 30, C.cinnabar, C.ink, r, 0.9);
  // the river winding out to the lower right
  s += river(d, r, [[880, 790], [960, 830], [1030, 880], [1150, 930], [1290, 960]], 20, 120, '#e9e1cb', C.ink, 2);
  s += ripples(900, 1280, 820, 960, r, C.inkWash, 0.5, 60, 1.6);
  s += ship(1110, 905, 110, C.ink, '#e8dcc0', '#d9ccb0', r, 0.85, C.cinnabar);
  s += ship(990, 850, 70, C.ink, '#e8dcc0', '#d9ccb0', r, 0.7);
  // marching army along the road to the gate
  s += path(smoothPath([[0, 930], [200, 900], [420, 860], [600, 790], [650, 776]], false), 'none', ` stroke="#d8c8a4" stroke-width="26" opacity="0.8" stroke-linecap="round"`);
  for (let i = 0; i < 9; i++) {
    const t = i / 9;
    const x = 40 + t * 540, y = 925 - t * 140;
    s += army(x, x + 50, y, 14, 9 - t * 4, r, C.ink, 0.8, i % 3 === 0 ? C.cinnabar : undefined);
  }
  // foreground pines and rocks
  s += peak(d, { cx: 120, base: 975, w: 360, h: 120, tone: C.ink, alpha: 0.75, style: 'axe', lw: 2, fade: 0.2, ink: C.ink }, r);
  s += pine(70, 960, 330, r, C.ink, 0.95);
  s += pine(170, 965, 260, r, C.ink, 0.9);
  s += pine(260, 970, 190, r, C.ink, 0.85);
  s += leafTree(330, 965, 120, r, C.ink, 0.8, '#3d4a38');
  // title calligraphy + seal + small vertical subtitle
  s += `<g filter="${d.bleed(3, 0.05)}">${titleGlyphs(C.ink)}</g>`;
  const tw = TITLE.size * 0.94 * 5;
  s += seal(TITLE.x + tw - 30, TITLE.y + TITLE.size + 14, 58, '墨英', rng('seal'));
  s += `<text x="${TITLE.x + tw - 44}" y="${TITLE.y + TITLE.size + 52}" text-anchor="end" font-family="${FONT_KAI}" font-size="28" fill="${C.inkSoft}" letter-spacing="8">水墨三国 · 群雄逐鹿</text>`;
  s += `<text x="${W / 2}" y="${H - 16}" text-anchor="middle" font-family="${FONT_KAI}" font-size="20" fill="${C.inkSoft}" opacity="0.75">© 三国墨英传 · 程序生成</text>`;
  s += vignette(d, 0.3);
  s += d.paperGrain(1);
  return d.svg(s);
}

/** Additive ember glow travelling through the title strokes (10-frame loop). */
function logoFire(k: number): string {
  const W = 640 * K, H = 197 * K;
  const d = new Doc(W, H, 200 + k);
  const chars = [...TITLE.text];
  let s = '';
  // per-character intensity: a warm wave sweeping left → right, looping
  const fid = d.id('f');
  d.def(`<filter id="${fid}" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="7" result="n"/><feOffset in="n" dx="0" dy="${-k * 6}" result="m"/><feColorMatrix in="m" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 2.6 -0.9" result="a"/><feComposite in="SourceGraphic" in2="a" operator="in"/></filter>`);
  const glyphs = titleGlyphs('#fff');
  // split glyph paths per character: word() emits strokes in order; count per char
  const counts = chars.map((ch) => (ch in GLYPH_COUNTS ? GLYPH_COUNTS[ch] : 0));
  const parts = glyphs.split('/>').filter((x) => x.trim()).map((x) => x + '/>');
  let i0 = 0;
  chars.forEach((_, ci) => {
    const n = counts[ci];
    const ph = k / 10 - ci / chars.length;
    const inten = Math.pow(0.5 + 0.5 * Math.cos(2 * Math.PI * ph), 2);
    const col = mix('#1a0600', '#a8481a', inten);
    s += `<g filter="url(#${fid})" opacity="${f2(0.25 + 0.6 * inten)}">${parts.slice(i0, i0 + n).join('').replaceAll('fill="#fff"', `fill="${col}"`)}</g>`;
    i0 += n;
  });
  // rising sparks (positions loop with the animation)
  const r = rng('sparks');
  for (let i = 0; i < 26; i++) {
    const x = TITLE.x + r.range(0, TITLE.size * 4.7);
    const y0 = TITLE.y + r.range(40, TITLE.size);
    const t = (k / 10 + r.next()) % 1;
    const y = y0 - t * 90;
    const a = Math.sin(Math.PI * t) * 0.8;
    s += `<circle cx="${f2(x + Math.sin(t * 6 + i) * 6)}" cy="${f2(y)}" r="${f2(r.range(1.2, 2.6))}" fill="#b05018" opacity="${f2(a)}"/>`;
  }
  return d.svg(s);
}
const GLYPH_COUNTS: Record<string, number> = Object.fromEntries(Object.entries(GLYPHS).map(([k, v]) => [k, v.length]));

// ------------------------------------------------------------------ era selection backdrop (mm/base/selectagebg)
/** A long handscroll panorama: ranges, river, villages, a distant battle. Shown dimmed behind panels. */
function eraBg(): string {
  const W = 640 * K, H = 480 * K;
  const d = new Doc(W, H, 301);
  const r = rng('era');
  let s = paperBg(d, '#efe4ca', '#ddcca8');
  s += range(d, r, { x0: -80, x1: W + 80, base: 520, hMin: 160, hMax: 380, n: 8, wk: 1.1, tone: '#7a858c', alpha: 0.32, style: 'none', lw: 2, fade: 0.8, foot: 0 });
  s += mist(d, r, 0, W, 500, 110, '#efe4ca', 0.9, 8);
  s += range(d, r, { x0: -60, x1: W + 60, base: 700, hMin: 180, hMax: 360, n: 6, wk: 1.3, tone: C.inkSoft, alpha: 0.62, style: 'hemp', lw: 1.8, fade: 0.6, foot: 2, ink: C.ink });
  s += mist(d, r, 0, W, 690, 90, '#efe4ca', 0.85, 8);
  s += river(d, r, [[-20, 760], [300, 780], [640, 820], [980, 800], [1300, 840]], 30, 70, '#e7decb', C.ink, 2);
  s += ripples(0, W, 740, 880, r, C.inkWash, 0.4, 70, 1.5);
  for (const [x, y, w] of [[260, 780, 90], [760, 815, 70], [1100, 805, 80]] as const) s += ship(x, y, w, C.ink, '#e8dcc0', '#d9ccb0', r, 0.7, C.cinnabar);
  s += range(d, r, { x0: -60, x1: W + 60, base: 980, hMin: 90, hMax: 200, n: 7, wk: 1.8, tone: C.ink, alpha: 0.7, style: 'axe', lw: 1.8, fade: 0.25, foot: 1, ink: C.ink });
  for (const [x, hh] of [[60, 260], [150, 200], [1190, 240], [1110, 170]] as const) s += pine(x, 975, hh, r, C.ink, 0.9);
  for (let i = 0; i < 6; i++) s += house(r.range(100, 1200), r.range(860, 900), 40, C.ink, '#e8dcc0', r, 0.85);
  s += army(380, 900, 880, 30, 7, r, C.ink, 0.6, C.cinnabar);
  s += vignette(d, 0.35);
  s += d.paperGrain(1);
  return d.svg(s);
}

// ------------------------------------------------------------------ endings
/** Victory: dawn over the palace, officials lined up along the imperial way. */
function victory(): string {
  const W = 640 * K, H = 480 * K;
  const d = new Doc(W, H, 401);
  const r = rng('victory');
  let s = paperBg(d, '#f3e6c8', '#e2cfa8');
  // sunrise rays and clouds
  s += `<circle cx="640" cy="230" r="300" fill="${C.gamboge}" opacity="0.25" filter="${d.blur(70)}"/>`;
  s += `<circle cx="640" cy="250" r="80" fill="${C.cinnabar}" opacity="0.8"/>`;
  for (let i = 0; i < 14; i++) {
    const a = -Math.PI + (i + 0.5) * (Math.PI / 14);
    s += `<path d="M640,250L${f2(640 + Math.cos(a - 0.04) * 900)},${f2(250 + Math.sin(a - 0.04) * 900)}L${f2(640 + Math.cos(a + 0.04) * 900)},${f2(250 + Math.sin(a + 0.04) * 900)}Z" fill="${C.gamboge}" opacity="0.08"/>`;
  }
  // auspicious clouds (祥云): spiral-capped bands
  for (const [cx, cy, sc] of [[220, 170, 1.2], [1060, 150, 1.4], [400, 320, 0.8], [900, 330, 0.9]] as const) s += xiangyun(cx, cy, sc, r);
  s += range(d, r, { x0: -60, x1: W + 60, base: 520, hMin: 120, hMax: 260, n: 7, wk: 1.3, tone: '#7a858c', alpha: 0.3, style: 'none', lw: 2, fade: 0.8, foot: 0 });
  s += mist(d, r, 0, W, 500, 90, '#f1e4c6', 0.9, 8);
  // palace on a three-tier terrace
  const cx = 640;
  for (let t = 0; t < 3; t++) {
    const tw = 900 - t * 160, ty = 640 - t * 34;
    s += `<rect x="${cx - tw / 2}" y="${ty}" width="${tw}" height="34" fill="#efe6d2" stroke="${C.ink}" stroke-width="2"/>`;
    for (let x = cx - tw / 2 + 10; x < cx + tw / 2; x += 18) s += `<path d="M${x},${ty + 4}V${ty + 16}" stroke="${C.ink}" stroke-width="1.4" opacity="0.6"/>`;
  }
  const hy = 538;
  s += `<rect x="${cx - 260}" y="${hy - 150}" width="520" height="150" fill="#e9dcc0" stroke="${C.ink}" stroke-width="2.5"/>`;
  for (let i = 0; i <= 10; i++) s += `<rect x="${cx - 255 + i * 50}" y="${hy - 148}" width="10" height="148" fill="${C.cinnabar}" opacity="0.85"/>`;
  for (let i = 0; i < 10; i++) s += `<rect x="${cx - 240 + i * 50}" y="${hy - 120}" width="30" height="110" fill="${C.ink}" opacity="0.55"/>`;
  s += roof(cx, hy - 150, 620, 90, C.ink, 1);
  s += `<rect x="${cx - 200}" y="${hy - 290}" width="400" height="60" fill="#e9dcc0" stroke="${C.ink}" stroke-width="2"/>`;
  for (let i = 0; i <= 8; i++) s += `<rect x="${cx - 196 + i * 48}" y="${hy - 288}" width="8" height="58" fill="${C.cinnabar}" opacity="0.85"/>`;
  s += roof(cx, hy - 230, 520, 80, C.ink, 1);
  s += roof(cx, hy - 290, 460, 70, C.ink, 1);
  s += `<rect x="${cx - 50}" y="${hy - 268}" width="100" height="34" fill="${C.indigo}" stroke="${C.gold}" stroke-width="3"/><text x="${cx}" y="${hy - 242}" text-anchor="middle" font-family="${FONT_KAI}" font-size="24" fill="${C.gold}">太极殿</text>`;
  // side halls
  for (const sx of [-1, 1]) {
    const x = cx + sx * 470;
    s += `<rect x="${x - 110}" y="${hy - 60}" width="220" height="100" fill="#e9dcc0" stroke="${C.ink}" stroke-width="2"/>`;
    for (let i = 0; i <= 5; i++) s += `<rect x="${x - 106 + i * 42}" y="${hy - 58}" width="7" height="98" fill="${C.cinnabar}" opacity="0.8"/>`;
    s += roof(x, hy - 60, 280, 60, C.ink, 1);
  }
  // imperial way with red carpet, officials lining both sides in perspective
  const vy = hy + 70;
  s += `<path d="M${cx - 60},${vy}L${cx + 60},${vy}L${cx + 420},${H}L${cx - 420},${H}Z" fill="#d9ccb0"/>`;
  s += `<path d="M${cx - 28},${vy}L${cx + 28},${vy}L${cx + 180},${H}L${cx - 180},${H}Z" fill="${C.cinnabar}" opacity="0.85"/>`;
  for (let i = 1; i < 12; i++) {
    const t = Math.pow(i / 12, 1.6);
    const y = vy + (H - vy) * t;
    s += `<path d="M${f2(cx - 60 - 360 * t)},${f2(y)}H${f2(cx + 60 + 360 * t)}" stroke="${C.ink}" stroke-width="1" opacity="0.25"/>`;
  }
  for (const sd of [-1, 1])
    for (let i = 0; i < 9; i++) {
      const t = Math.pow((i + 0.5) / 9, 1.5);
      const y = vy + 10 + (H - vy - 40) * t;
      const sc = 0.35 + t * 1.6;
      for (let j = 0; j < 2; j++) s += official(cx + sd * (90 + 400 * t + j * 46 * sc), y + j * 4, sc, sd, r, i + j);
    }
  s += vignette(d, 0.3);
  s += d.paperGrain(1);
  return d.svg(s);
}

function xiangyun(cx: number, cy: number, sc: number, r: Rng) {
  let s = '';
  const col = '#f6efe0';
  for (let i = 0; i < 4; i++) {
    const x = cx + (i - 1.5) * 60 * sc, y = cy + Math.sin(i * 1.7) * 12 * sc, rr = (26 + (i % 2) * 10) * sc;
    s += `<circle cx="${f2(x)}" cy="${f2(y)}" r="${f2(rr)}" fill="${col}" stroke="${C.ochre}" stroke-width="${f2(2 * sc)}" opacity="0.9"/>`;
    s += `<path d="M${f2(x - rr * 0.5)},${f2(y)}a${f2(rr * 0.5)},${f2(rr * 0.5)} 0 1 1 ${f2(rr * 0.5)},${f2(rr * 0.5)}a${f2(rr * 0.25)},${f2(rr * 0.25)} 0 1 1 0,${f2(-rr * 0.5)}" fill="none" stroke="${C.ochre}" stroke-width="${f2(1.6 * sc)}" opacity="0.8"/>`;
  }
  s += `<path d="M${f2(cx - 130 * sc)},${f2(cy + 22 * sc)}Q${f2(cx)},${f2(cy + 40 * sc)} ${f2(cx + 160 * sc)},${f2(cy + 18 * sc)}" stroke="${C.ochre}" stroke-width="${f2(2 * sc)}" fill="none" opacity="0.7"/>`;
  void r;
  return s;
}

/** Court official seen from behind/side: robe, hat, holding a tablet. */
export function official(x: number, y: number, sc: number, side: number, r: Rng, i: number) {
  const robes = [C.indigo, C.malachite, C.rouge, '#5a4a3a', C.azurite];
  const col = robes[i % robes.length];
  const h = 70 * sc, w = 26 * sc;
  let s = `<ellipse cx="${f2(x)}" cy="${f2(y)}" rx="${f2(w * 0.7)}" ry="${f2(w * 0.18)}" fill="${C.ink}" opacity="0.2"/>`;
  s += `<path d="M${f2(x - w * 0.5)},${f2(y)}L${f2(x - w * 0.32)},${f2(y - h * 0.72)}Q${f2(x)},${f2(y - h * 0.8)} ${f2(x + w * 0.32)},${f2(y - h * 0.72)}L${f2(x + w * 0.5)},${f2(y)}Z" fill="${col}" stroke="${C.ink}" stroke-width="${f2(Math.max(0.8, 1.6 * sc))}"/>`;
  s += `<path d="M${f2(x)},${f2(y - h * 0.75)}V${f2(y)}" stroke="${C.ink}" stroke-width="${f2(1 * sc)}" opacity="0.5"/>`;
  s += `<circle cx="${f2(x)}" cy="${f2(y - h * 0.83)}" r="${f2(w * 0.24)}" fill="${C.skin}" stroke="${C.ink}" stroke-width="${f2(Math.max(0.6, 1.2 * sc))}"/>`;
  // 进贤冠
  s += `<path d="M${f2(x - w * 0.24)},${f2(y - h * 0.88)}L${f2(x - w * 0.1)},${f2(y - h * 1.0)}H${f2(x + w * 0.2)}L${f2(x + w * 0.24)},${f2(y - h * 0.88)}Z" fill="${C.ink}"/>`;
  // 笏 tablet held in front
  s += `<path d="M${f2(x - side * w * 0.3)},${f2(y - h * 0.62)}l${f2(-side * w * 0.12)},${f2(-h * 0.2)}" stroke="#efe6d2" stroke-width="${f2(3 * sc)}"/>`;
  void r;
  return s;
}

/** Defeat: a burning camp at dusk, a sword planted in the earth beside a fallen helmet. */
function defeat(): string {
  const W = 640 * K, H = 480 * K;
  const d = new Doc(W, H, 501);
  const r = rng('defeat');
  let s = `<rect width="${W}" height="${H}" fill="${d.lin([[0, '#2a1a16', 1], [0.55, '#6a2a1a', 1], [0.75, '#a2482a', 1], [1, '#3a2418', 1]], 0, 0, 0, H)}"/>`;
  s += `<rect width="${W}" height="${H}" fill="#000" filter="${d.wash(0.005, 0.6, 3)}" opacity="0.35"/>`;
  // smoke columns
  for (let i = 0; i < 7; i++) {
    const x = r.range(100, 1200);
    let sm = '';
    for (let k = 0; k < 9; k++) sm += `<ellipse cx="${f2(x + k * r.range(10, 30))}" cy="${f2(620 - k * 70)}" rx="${f2(60 + k * 22)}" ry="${f2(40 + k * 10)}" fill="#120c0a" opacity="${f2(0.5 - k * 0.04)}"/>`;
    s += `<g filter="${d.blur(18)}">${sm}</g>`;
  }
  s += range(d, r, { x0: -60, x1: W + 60, base: 640, hMin: 120, hMax: 280, n: 7, wk: 1.3, tone: '#1a100c', alpha: 0.6, style: 'none', lw: 2, fade: 0.5, foot: 1 });
  // burning tents
  for (let i = 0; i < 11; i++) {
    const x = 60 + i * 115 + r.range(-20, 20), y = 700 + r.range(-10, 30), tw = r.range(110, 170);
    s += fire(d, x, y, tw * 1.3, r);
    s += tent(x, y, tw, '#120a08', '#3a1e14', r, 0.95);
    s += fire(d, x + r.range(-20, 20), y - tw * 0.2, tw * 0.9, r);
  }
  for (let x = 40; x < W; x += r.range(110, 220)) s += flag(x, 720, r.range(90, 140), '#5a1a12', '#120a08', r, 0.9, r.chance(0.5) ? 1 : -1);
  // scorched ground
  s += `<path d="M0,760Q320,730 640,750T1280,740V960H0Z" fill="#1a110c"/>`;
  s += `<path d="M0,760Q320,730 640,750T1280,740V960H0Z" fill="#000" filter="${d.wash(0.01, 0.6, 3)}" opacity="0.5"/>`;
  // the sword, planted at an angle, and a fallen helmet
  const sx = 960, sy = 860;
  const ang = -0.12;
  const tip: Pt = [sx, sy], hilt: Pt = [sx - Math.sin(ang) * -420, sy - 420];
  s += `<g transform="rotate(${f2(ang * 57.3)} ${sx} ${sy})">`;
  s += `<path d="M${sx - 16},${sy - 420}L${sx + 16},${sy - 420}L${sx + 12},${sy - 30}L${sx},${sy}L${sx - 12},${sy - 30}Z" fill="#c9c6bc" stroke="${C.ink}" stroke-width="3"/>`;
  s += `<path d="M${sx},${sy - 418}V${sy - 30}" stroke="#7a7870" stroke-width="2"/>`;
  s += `<path d="M${sx - 60},${sy - 430}Q${sx},${sy - 410} ${sx + 60},${sy - 430}L${sx + 54},${sy - 444}Q${sx},${sy - 430} ${sx - 54},${sy - 444}Z" fill="${C.gold}" stroke="${C.ink}" stroke-width="3"/>`;
  s += `<rect x="${sx - 9}" y="${sy - 560}" width="18" height="120" fill="#3a1a12" stroke="${C.ink}" stroke-width="3"/>`;
  for (let k = 0; k < 7; k++) s += `<path d="M${sx - 9},${sy - 550 + k * 16}l18,8" stroke="${C.gold}" stroke-width="2.5"/>`;
  s += `<circle cx="${sx}" cy="${sy - 572}" r="16" fill="${C.gold}" stroke="${C.ink}" stroke-width="3"/>`;
  s += `<path d="M${sx},${sy - 588}q-30,40 -10,110q5,20 -15,60" stroke="${C.cinnabar}" stroke-width="5" fill="none"/>`;
  s += `</g>`;
  void tip;
  void hilt;
  s += `<path d="M${sx - 120},${sy + 6}Q${sx - 150},${sy - 80} ${sx - 70},${sy - 96}Q${sx + 10},${sy - 96} ${sx},${sy + 6}Z" fill="#2a2620" stroke="${C.ink}" stroke-width="3"/>`;
  s += `<path d="M${sx - 120},${sy + 2}H${sx + 4}" stroke="${C.gold}" stroke-width="5"/>`;
  s += `<path d="M${sx - 80},${sy - 96}q10,-40 40,-60" stroke="${C.cinnabar}" stroke-width="6" fill="none"/>`;
  s += `<ellipse cx="${sx - 40}" cy="${sy + 14}" rx="200" ry="20" fill="#000" opacity="0.4"/>`;
  // 败 in a broken red brush stroke
  s += `<text x="1180" y="520" text-anchor="middle" font-family="${FONT_KAI}" font-size="150" fill="${C.cinnabar}" opacity="0.85" filter="${d.bleed(6, 0.04)}">终</text>`;
  for (let i = 0; i < 60; i++) s += `<circle cx="${f2(r.range(0, W))}" cy="${f2(r.range(200, 760))}" r="${f2(r.range(1, 3))}" fill="#f0a040" opacity="${f2(r.range(0.3, 0.9))}"/>`;
  s += vignette(d, 0.55, '#000');
  return d.svg(s);
}

function fire(d: Doc, x: number, y: number, w: number, r: Rng) {
  let s = '';
  for (let i = 0; i < 6; i++) {
    const fx = x + r.range(-0.4, 0.4) * w, fh = w * r.range(0.6, 1.3), fw = w * r.range(0.15, 0.3);
    const pts: Pt[] = [[fx - fw, y], [fx - fw * 0.6, y - fh * 0.4], [fx + r.range(-0.5, 0.5) * fw, y - fh], [fx + fw * 0.5, y - fh * 0.5], [fx + fw, y]];
    const col = i % 3 === 0 ? C.gamboge : i % 3 === 1 ? '#e06a28' : C.cinnabar;
    s += path(smoothPath(pts, true, 0.6), col, ` opacity="${f2(r.range(0.55, 0.9))}"`);
  }
  return `<g filter="${d.bleed(5, 0.05)}">${s}</g><ellipse cx="${f2(x)}" cy="${f2(y - w * 0.4)}" rx="${f2(w * 0.8)}" ry="${f2(w * 0.6)}" fill="#f07a30" opacity="0.18" filter="${d.blur(w * 0.2)}"/>`;
}

/** Credits background: moonlit, peaceful land after the war (640×508 → 2×). */
function creditsSky(w: number, h: number): string {
  const d = new Doc(w, h, 601);
  const r = rng('credits-sky');
  let s = `<rect width="${w}" height="${h}" fill="${d.lin([[0, '#0c1222', 1], [0.6, '#1f2d48', 1], [1, '#2c3a56', 1]], 0, 0, 0, h)}"/>`;
  s += `<rect width="${w}" height="${h}" fill="#3d5070" filter="${d.wash(0.004, 0.6, 3)}" opacity="0.35"/>`;
  for (let i = 0; i < 160; i++) s += `<circle cx="${f2(r.range(0, w))}" cy="${f2(r.range(0, h * 0.6))}" r="${f2(r.range(0.6, 1.8))}" fill="#e9e6d8" opacity="${f2(r.range(0.2, 0.8))}"/>`;
  const mx = w * 0.78, my = h * 0.2;
  s += `<circle cx="${mx}" cy="${my}" r="${w * 0.12}" fill="#c9d4e8" opacity="0.2" filter="${d.blur(w * 0.04)}"/><circle cx="${mx}" cy="${my}" r="${w * 0.045}" fill="#f0ecdc"/>`;
  s += range(d, r, { x0: -60, x1: w + 60, base: h * 0.72, hMin: h * 0.18, hMax: h * 0.4, n: 7, wk: 1.3, tone: '#3a4a68', alpha: 0.7, style: 'none', lw: 2, fade: 0.7, foot: 0 });
  s += mist(d, r, 0, w, h * 0.7, h * 0.08, '#4a5a7a', 0.6, 8);
  s += range(d, r, { x0: -60, x1: w + 60, base: h * 0.86, hMin: h * 0.1, hMax: h * 0.22, n: 6, wk: 1.8, tone: '#141c2c', alpha: 0.9, style: 'hemp', lw: 2, fade: 0.3, foot: 1, ink: '#05070c' });
  // a quiet town with lamplight by the river
  const ty = h * 0.88;
  s += `<rect x="0" y="${f2(ty)}" width="${w}" height="${f2(h - ty)}" fill="#1a2438"/>`;
  s += ripples(0, w, ty + 6, h, r, '#8090b0', 0.35, 90, 1.5);
  for (let x = 30; x < w; x += r.range(40, 90)) {
    s += house(x, ty, r.range(36, 60), '#05070c', '#2a3348', r, 1);
    s += `<rect x="${f2(x - 6)}" y="${f2(ty - 16)}" width="8" height="8" fill="#f0b050" opacity="0.85"/>`;
    s += `<circle cx="${f2(x - 2)}" cy="${f2(ty - 12)}" r="14" fill="#f0b050" opacity="0.15" filter="${d.blur(6)}"/>`;
  }
  for (let i = 0; i < 14; i++) {
    // floating river lanterns
    const x = r.range(0, w), y = r.range(ty + 14, h - 6);
    s += `<circle cx="${f2(x)}" cy="${f2(y)}" r="3" fill="#f4c060" opacity="0.9"/><ellipse cx="${f2(x)}" cy="${f2(y + 8)}" rx="2" ry="8" fill="#f4c060" opacity="0.25"/>`;
  }
  return d.svg(s);
}

/** Credits roll: transparent, light text; starts with ~500 px of empty space. */
function staff(w: number, h: number): string {
  const d = new Doc(w, h, 701);
  const ink = '#f1e6c8';
  let s = '';
  const sh = `<filter id="tsh" x="-10%" y="-10%" width="120%" height="120%"><feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#000" flood-opacity="0.85"/></filter>`;
  d.def(sh);
  let y = 560;
  // title calligraphy
  const size = 92;
  s += `<g filter="url(#tsh)">${word('三国墨英传', (w - size * 0.94 * 5) / 2, y, size, rng('title-glyphs'), ink, 0.94)}</g>`;
  s += seal(w / 2 + size * 2.45, y + size * 0.9, 34, '墨英', rng('seal2'));
  y += size + 70;
  const t = (txt: string, yy: number, sz: number, col = ink, extra = '') =>
    `<text x="${w / 2}" y="${yy}" text-anchor="middle" font-family="${FONT_KAI}" font-size="${sz}" fill="${col}" filter="url(#tsh)"${extra}>${txt}</text>`;
  s += t('程序生成水墨素材版', y, 22, '#e2c27a');
  y += 110;
  const roles: [string, string[]][] = [
    ['制　作', ['Claude &amp; 玩家']],
    ['游戏程序', ['TypeScript · PixiJS · Preact']],
    ['水墨美术', ['程序生成 · SVG 笔墨']],
    ['山水战场', ['程序生成']],
    ['人物绘像', ['程序生成']],
    ['兵种动画', ['程序生成']],
    ['音乐音效', ['程序合成']],
    ['剧本数据', ['依《三国志》史实重新编写']],
    ['书法题字', ['逐笔绘制 · 「三国墨英传」']],
    ['测试', ['每一位玩家']],
    ['特别鸣谢', ['热爱三国的你']],
  ];
  for (const [role, names] of roles) {
    s += t(role, y, 18, '#c9a24a', ' letter-spacing="4"');
    y += 34;
    for (const n of names) {
      s += t(n, y, 26);
      y += 38;
    }
    y += 70;
  }
  y += 40;
  s += t('滚滚长江东逝水', y, 26);
  y += 44;
  s += t('浪花淘尽英雄', y, 26);
  y += 180;
  s += t('谢 谢 游 玩', y, 36, ink, ' letter-spacing="8"');
  y += 70;
  s += t('© 三国墨英传 · 程序生成', y, 18, '#c9b88a');
  void h;
  return d.svg(s);
}

// ------------------------------------------------------------------ splash logos (mm/odinlogo, mm/starlogo; unused by the remake)
function splash(kind: 'odin' | 'star', w: number, h: number) {
  const d = new Doc(w, h, kind === 'odin' ? 801 : 802);
  const r = rng(kind);
  let s = paperBg(d);
  if (kind === 'odin') {
    // ensō circle with 墨
    const cx = w / 2, cy = h * 0.45, rr = h * 0.25;
    const pts: Pt[] = [];
    for (let i = 0; i <= 40; i++) {
      const a = -1.2 + (i / 40) * Math.PI * 1.85;
      pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
    }
    s += path(brush(pts, rr * 0.18, r, { taperIn: 0.05, taperOut: 0.6 }), C.ink, ` filter="${d.bleed(4, 0.05)}"`);
    s += `<text x="${cx}" y="${cy + rr * 0.32}" text-anchor="middle" font-family="${FONT_KAI}" font-size="${f2(rr * 0.9)}" fill="${C.ink}">墨</text>`;
    s += `<text x="${cx}" y="${h * 0.86}" text-anchor="middle" font-family="${FONT_KAI}" font-size="${f2(h * 0.05)}" fill="${C.inkSoft}" letter-spacing="6">程序生成 · 水墨工坊</text>`;
  } else {
    s += `<g filter="${d.bleed(3, 0.05)}">${word('三国墨英传', (w - 90 * 0.94 * 5) / 2, h * 0.36, 90, rng('title-glyphs'), C.ink, 0.94)}</g>`;
    s += seal(w / 2 - 22, h * 0.62, 44, '墨英', r);
  }
  s += d.paperGrain(1);
  return d.svg(s);
}

// ------------------------------------------------------------------ arena bracket (arena/base/asw_40350)
/** 8-slot tournament bracket matching src/scenes/duel/arena.tsx (640×480 design, painted 2×). */
function bracket(): string {
  const W = 640 * K, H = 480 * K;
  const d = new Doc(W, H, 901);
  const r = rng('bracket');
  const X = (v: number) => v * K;
  let s = '';
  // faint landscape wash across the top
  s += range(d, r, { x0: -40, x1: W + 40, base: 330, hMin: 120, hMax: 260, n: 6, wk: 1.4, tone: '#7a858c', alpha: 0.22, style: 'none', lw: 2, fade: 0.9, foot: 0 });
  const ink = C.ink;
  const ln = (pts: Pt[], wdt = 4.2) => path(brush(pts.map(([x, y]) => [X(x), X(y)] as Pt), wdt, r, { taperIn: 0.04, taperOut: 0.06, jitter: 0.06 }), ink, ' opacity="0.85"');
  const SLOT_X = (i: number) => 18 + 78 * i, LEAF = (i: number) => 47 + 78 * i, N1 = (m: number) => 86 + 156 * m, N2 = (k: number) => 164 + 312 * k;
  let lines = '';
  for (let i = 0; i < 8; i++) lines += ln([[LEAF(i), 311], [LEAF(i), 249]]);
  for (let m = 0; m < 4; m++) {
    lines += ln([[LEAF(2 * m), 249], [LEAF(2 * m + 1), 249]]);
    lines += ln([[N1(m), 249], [N1(m), 185]]);
  }
  for (let k = 0; k < 2; k++) {
    lines += ln([[N1(2 * k), 185], [N1(2 * k + 1), 185]]);
    lines += ln([[N2(k), 185], [N2(k), 121]]);
  }
  lines += ln([[N2(0), 121], [N2(1), 121]]);
  lines += ln([[320, 121], [320, 57]], 5);
  s += `<g filter="${d.bleed(1.5, 0.08)}">${lines}</g>`;
  // match nodes
  for (const [x, y] of [[N1(0), 217], [N1(1), 217], [N1(2), 217], [N1(3), 217], [N2(0), 153], [N2(1), 153], [320, 89]] as const)
    s += `<circle cx="${X(x)}" cy="${X(y)}" r="${X(7)}" fill="#efe4c8" stroke="${ink}" stroke-width="3"/><circle cx="${X(x)}" cy="${X(y)}" r="${X(3)}" fill="${C.cinnabar}"/>`;
  // slot frames (portraits sit inside)
  for (let i = 0; i < 8; i++) {
    const x = X(SLOT_X(i)), y = X(311), w = X(58), h = X(143);
    s += `<rect x="${x - 6}" y="${y - 6}" width="${w + 12}" height="${h + 12}" rx="6" fill="#3a1a12" opacity="0.9"/>`;
    s += `<rect x="${x - 3}" y="${y - 3}" width="${w + 6}" height="${h + 6}" rx="4" fill="none" stroke="${C.gold}" stroke-width="3"/>`;
    s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#e9dcc0"/>`;
    for (const [cx, cy] of [[x - 3, y - 3], [x + w + 3, y - 3], [x - 3, y + h + 3], [x + w + 3, y + h + 3]]) s += `<rect x="${cx - 6}" y="${cy - 6}" width="12" height="12" fill="${C.gold}" stroke="#3a1a12" stroke-width="2" transform="rotate(45 ${cx} ${cy})"/>`;
  }
  // champion plaque
  const px = X(320), py = X(34);
  s += `<rect x="${px - 120}" y="${py - 34}" width="240" height="68" rx="10" fill="#3a1a12" stroke="${C.gold}" stroke-width="5"/>`;
  s += `<rect x="${px - 108}" y="${py - 24}" width="216" height="48" rx="6" fill="none" stroke="${C.gold}" stroke-width="2"/>`;
  s += `<text x="${px}" y="${py + 15}" text-anchor="middle" font-family="${FONT_KAI}" font-size="42" fill="${C.gold}" letter-spacing="14">优胜</text>`;
  return d.svg(s);
}

// ------------------------------------------------------------------ dispatch
export function paintArt(job: FrameJob): PaintOut {
  const [w, h, ax, ay] = job.box;
  const key = `${job.dir}/${job.name}`;
  const full = (svg: string, ww = 640, hh = 480) => ({ svg, w: ww * K, h: hh * K, ax: 0, ay: 0 });
  switch (key) {
    case 'mm/base/main':
      return full(keyArt());
    case 'mm/base/selectagebg':
      return full(eraBg());
    case 'ending/ok':
      return full(victory());
    case 'ending/failedbg':
      return full(defeat());
    case 'ending/successbg':
      return full(creditsSky(w * K, h * K), w, h);
    case 'ending/staff':
      return { svg: staff(w, h), w, h, ax, ay };
    case 'arena/base/asw_40350':
      return full(bracket());
    case 'mm/odinlogo':
      return { svg: splash('odin', w, h), w, h, ax, ay };
    case 'mm/starlogo':
      return { svg: splash('star', w, h), w, h, ax, ay };
  }
  let m = /^mm\/logofire(\d\d)$/.exec(key);
  if (m) return { svg: logoFire(+m[1] - 1), w: w * K, h: h * K, ax: 0, ay: 0 };
  m = /^ad\/background\/bg00(\d)$/.exec(key);
  if (m) return full(paintCourt(+m[1], 640 * K, 480 * K));
  return paintUi(job);
}

void blob;
void hills;
void leafTree;
void ship;
void roof;
void mix;
