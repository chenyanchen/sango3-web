// 野战 HUD and result art: sf/magic status icons, sf/menu (turn banners,
// terrain thumbnails, weather / time icons, VS screen, panels) and sf/judge
// (captive judgement screen).
import { blob, brush, C, f2, FONT_BRUSH, FONT_KAI, hash, paper, rng, seal, svgDoc, type Pt } from '../ink.ts';
import type { FrameJob, PaintOut } from '../types.ts';
import { ensureFonts } from './_ui_fonts.ts';
import { Doc, army, flag, mist, range, tent } from './_scenery_kit.ts';

ensureFonts();

const out = (w: number, h: number, body: string, ax = 0, ay = 0, defs = ''): PaintOut => ({ svg: svgDoc(w, h, body, defs), w, h, ax, ay });
const text = (x: number, y: number, s: string, size: number, fill: string, font = FONT_KAI, extra = '') =>
  `<text x="${f2(x)}" y="${f2(y)}" font-size="${f2(size)}" text-anchor="middle" fill="${fill}" font-family="${font}" ${extra}>${s}</text>`;

/** paper panel with a double ink border and corner brackets */
function panel(w: number, h: number, seed: number, tone: string = C.paper) {
  const p = paper(w, h, seed, tone);
  const r = rng(seed);
  let b = p.body;
  b += `<rect x="2.5" y="2.5" width="${w - 5}" height="${h - 5}" fill="none" stroke="${C.ink}" stroke-width="2"/>`;
  b += `<rect x="6" y="6" width="${w - 12}" height="${h - 12}" fill="none" stroke="${C.inkSoft}" stroke-width="0.8" opacity="0.7"/>`;
  for (const [x, y, sx, sy] of [[0, 0, 1, 1], [w, 0, -1, 1], [0, h, 1, -1], [w, h, -1, -1]] as number[][]) {
    b += `<path d="${brush([[x + sx * 3, y + sy * 16], [x + sx * 3, y + sy * 3], [x + sx * 16, y + sy * 3]], 4, r, { taperIn: 0.1, taperOut: 0.4 })}" fill="${C.cinnabar}" opacity="0.85"/>`;
  }
  return { defs: p.defs, body: b };
}

// ------------------------------------------------------------------ sf/magic: status effect icons
const FX: Record<string, [string, string]> = {
  sfmagic005: ['行', C.malachite], sfmagic006: ['乱', C.rouge], sfmagic007: ['遁', C.inkWash], sfmagic008: ['缓', C.rouge],
  sfmagic009: ['弱', C.rouge], sfmagic010: ['疾', C.azurite], sfmagic013: ['强', C.cinnabar], sfmagic016: ['伏', C.indigo],
  sfmagic018: ['晕', C.rouge], sfmagic019: ['挑', C.ochre], sfmagic020: ['经', C.gold], sfmagic023: ['封', '#5a3f7a'],
};
export function paintMagicIcon(job: FrameJob): PaintOut {
  const [ch, col] = FX[job.name] ?? ['术', C.indigo];
  const w = 30, h = 22;
  const r = rng(hash(job.name));
  const body = `<path d="${blob(w / 2, h / 2, w / 2 - 1.5, h / 2 - 1.5, r, 0.06, 14)}" fill="${col}" stroke="${C.ink}" stroke-width="1.4"/>` +
    text(w / 2, h / 2 + 6, ch, 17, C.white, FONT_KAI, 'font-weight="bold" stroke="#1b1712" stroke-width="0.6"');
  return out(w, h, body, w / 2, h / 2);
}

// ------------------------------------------------------------------ sf/menu
function smap(n: number): PaintOut {
  const W = 22, H = 22;
  const r = rng(hash('smap' + n));
  const bg: Record<number, string> = { 1: '#ddd0ae', 2: '#c3c995', 3: '#b5c08a', 4: '#e3c78f', 5: '#9db3bd', 6: '#eef0ee', 7: '#c7b291', 8: '#cfd6dc', 9: '#c9c4a6', 10: '#d8cfb6', 11: '#d8cfb6', 12: '#ddd0ae', 13: '#ddd0ae', 14: '#ddd0ae' };
  let b = `<rect width="22" height="22" fill="${bg[n] ?? '#ddd0ae'}"/>`;
  const L = (pts: Pt[], wd: number, c: string = C.ink, op = 1) => `<path d="${brush(pts, wd, r)}" fill="${c}" opacity="${op}"/>`;
  switch (n) {
    case 1: for (let k = 0; k < 6; k++) b += `<circle cx="${f2(r.range(3, 19))}" cy="${f2(r.range(5, 19))}" r="0.9" fill="${C.inkSoft}" opacity="0.6"/>`; break;
    case 2: for (let k = 0; k < 5; k++) { const x = 3 + k * 4, y = 17 - (k % 2) * 6; b += L([[x, y], [x + 1, y - 5]], 1.3, '#4f6a3e'); b += L([[x + 1.5, y], [x + 3, y - 4]], 1.1, '#4f6a3e'); } break;
    case 3: b += `<path d="M11,2 L18,12 L14,12 L19,18 L3,18 L8,12 L4,12Z" fill="#3a5a46" stroke="${C.ink}" stroke-width="0.8"/><rect x="10" y="18" width="2" height="3" fill="#4a3a2a"/>`; break;
    case 4: b += L([[1, 12], [8, 9], [14, 12], [21, 9]], 1.4, '#9a7340') + L([[1, 18], [9, 15], [21, 17]], 1.2, '#9a7340'); break;
    case 5: for (const y of [7, 12, 17]) b += `<path d="M2,${y} q2.5,-2.5 5,0 t5,0 t5,0 t5,0" fill="none" stroke="#4d6b80" stroke-width="1.2"/>`; break;
    case 6: for (let k = 0; k < 5; k++) { const x = r.range(4, 18), y = r.range(4, 18); b += `<path d="M${f2(x - 2.5)},${f2(y)}h5M${f2(x)},${f2(y - 2.5)}v5M${f2(x - 1.8)},${f2(y - 1.8)}l3.6,3.6M${f2(x + 1.8)},${f2(y - 1.8)}l-3.6,3.6" stroke="#8c9aa8" stroke-width="0.7"/>`; } break;
    case 7: b += `<path d="M0,16 Q8,12 11,11 T22,5" fill="none" stroke="#9a8264" stroke-width="5"/><path d="M0,16 Q8,12 11,11 T22,5" fill="none" stroke="${C.inkSoft}" stroke-width="0.6" stroke-dasharray="2 2"/>`; break;
    case 8: b += `<path d="M1,20 L9,4 L13,10 L15,7 L21,20Z" fill="#6a6a6e" stroke="${C.ink}" stroke-width="0.9"/><path d="M6.5,9 L9,4 L11.5,8 L10,9.5 L8.5,8 Z" fill="#fff"/><path d="M14,8.8 L15,7 L16.5,10 Z" fill="#fff"/>`; break;
    case 9: b += `<path d="M1,20 Q5,8 10,5 Q14,9 16,8 Q19,13 21,20Z" fill="#8a8a62" stroke="${C.ink}" stroke-width="0.9"/>` + L([[9, 7], [8, 14]], 1, C.ink, 0.6) + L([[14, 10], [15, 17]], 1, C.ink, 0.6); break;
    case 10: b += `<rect x="2" y="8" width="18" height="11" fill="#a49e90" stroke="${C.ink}" stroke-width="0.9"/>` + [2, 7, 12, 17].map((x) => `<rect x="${x}" y="5" width="3" height="3" fill="#a49e90" stroke="${C.ink}" stroke-width="0.7"/>`).join('') + `<path d="M2,12h18M2,16h18" stroke="${C.ink}" stroke-width="0.4" opacity="0.6"/>`; break;
    case 11: b += `<rect x="2" y="9" width="18" height="11" fill="#a49e90" stroke="${C.ink}" stroke-width="0.9"/><path d="M8,20 V15 A3,3 0 0 1 14,15 V20Z" fill="#3a2a1e"/><path d="M3,9 L11,3 L19,9Z" fill="#3f4a55" stroke="${C.ink}" stroke-width="0.8"/>`; break;
    case 12: b += `<rect x="5" y="11" width="12" height="8" fill="${C.white}" stroke="${C.ink}" stroke-width="0.8"/><path d="M2,12 Q11,3 20,12Z" fill="#55565c" stroke="${C.ink}" stroke-width="0.8"/><rect x="10" y="14" width="2.5" height="5" fill="#6a4a32"/>`; break;
    case 13: b += `<rect x="3" y="17" width="16" height="3" fill="#c9c2b0" stroke="${C.ink}" stroke-width="0.6"/><rect x="6" y="11" width="10" height="6" fill="${C.cinnabar}" stroke="${C.ink}" stroke-width="0.6"/><path d="M2,12 Q11,7 20,12Z" fill="#3f4a55" stroke="${C.ink}" stroke-width="0.7"/><path d="M5,8 Q11,3 17,8Z" fill="#3f4a55" stroke="${C.ink}" stroke-width="0.7"/>`; break;
    default: b += `<path d="M3,19 Q8,9 10,7 Q12,9 17,19Z" fill="#e8dfc6" stroke="${C.ink}" stroke-width="0.9"/><path d="M14,19 V3" stroke="${C.ink}" stroke-width="1"/><path d="M14,3 q4,1 7,0 v5 q-3,1 -7,0Z" fill="${C.cinnabar}"/>`;
  }
  b += `<rect x="0.5" y="0.5" width="21" height="21" fill="none" stroke="${C.ink}" stroke-width="1" opacity="0.8"/>`;
  return out(W, H, b);
}

function weather(kind: 'sunny' | 'rain' | 'snow', k: number): PaintOut {
  let b = `<circle cx="11" cy="11" r="10.5" fill="${C.paper}" stroke="${C.ink}" stroke-width="1"/>`;
  if (kind === 'sunny') {
    const rot = k * 9;
    b += `<g transform="rotate(${rot} 11 11)">${Array.from({ length: 8 }, (_, i) => { const a = (i / 8) * Math.PI * 2; return `<path d="M${f2(11 + Math.cos(a) * 5.8)},${f2(11 + Math.sin(a) * 5.8)}L${f2(11 + Math.cos(a) * 8.6)},${f2(11 + Math.sin(a) * 8.6)}" stroke="${C.cinnabar}" stroke-width="1.4" stroke-linecap="round"/>`; }).join('')}</g>`;
    b += `<circle cx="11" cy="11" r="4.4" fill="${C.cinnabar}"/>`;
  } else {
    b += `<path d="M4.5,10 Q4,6 8,6 Q9,3 13,4 Q17,4 17,8 Q19.5,8.5 18.5,11 Z" fill="#7d8790" stroke="${C.ink}" stroke-width="0.7"/>`;
    for (let i = 0; i < 4; i++) {
      const x = 6 + i * 3.4, y = 12 + ((k * 1.5 + i * 2.3) % 7);
      b += kind === 'rain' ? `<path d="M${f2(x)},${f2(y)}l-1,2.6" stroke="${C.azurite}" stroke-width="1.1" stroke-linecap="round"/>` : `<circle cx="${f2(x)}" cy="${f2(y)}" r="1.1" fill="#fff" stroke="#8c9aa8" stroke-width="0.4"/>`;
    }
  }
  return out(22, 22, b);
}

function timezone(n: number): PaintOut {
  let b = `<circle cx="11" cy="11" r="10.5" fill="${n === 3 ? '#2a3448' : n === 2 ? '#e9c8a0' : '#f0e6c8'}" stroke="${C.ink}" stroke-width="1"/>`;
  if (n === 1) b += `<circle cx="11" cy="13" r="4.5" fill="${C.gamboge}"/><path d="M1.5,15 Q7,11 11,14 T20.5,13 V17 Q11,22 1.5,17Z" fill="#6f8a6a"/>`;
  else if (n === 2) b += `<circle cx="11" cy="14" r="5" fill="${C.cinnabar}"/><path d="M1.5,15 H20.5 V17 Q11,22 1.5,17Z" fill="#5a4a3a"/><path d="M4,8h6M13,6h5" stroke="${C.ink}" stroke-width="0.6" opacity="0.5"/>`;
  else b += `<path d="M13,5 A6,6 0 1 0 15.5,15.5 A5,5 0 1 1 13,5Z" fill="#f2ead2"/><circle cx="5" cy="6" r="0.6" fill="#fff"/><circle cx="17" cy="16" r="0.5" fill="#fff"/>`;
  return out(22, 22, b);
}

function banner(textS: string, col: string, seed: number): PaintOut {
  const W = 176, H = 50;
  const r = rng(seed);
  let b = `<path d="${brush([[8, 25], [60, 23], [120, 26], [168, 24]], 40, r, { taperIn: 0.08, taperOut: 0.1, jitter: 0.05 })}" fill="${C.ink}" opacity="0.88"/>`;
  b += `<path d="${brush([[14, 26], [90, 24], [162, 25]], 30, r, { taperIn: 0.05, taperOut: 0.08, jitter: 0.04 })}" fill="${col}" opacity="0.92"/>`;
  b += text(80, 35, textS, 26, C.white, FONT_BRUSH, 'stroke="#1b1712" stroke-width="0.8" letter-spacing="4"');
  b += seal(146, 13, 22, textS[0] === '我' ? '我' : '敌', r);
  return out(W, H, b);
}

function vsIcon(): PaintOut {
  const r = rng(7);
  let b = `<path d="${blob(22, 22, 20, 20, r, 0.05, 16)}" fill="${C.cinnabar}" stroke="${C.ink}" stroke-width="1.5"/>`;
  b += `<path d="M9,35 L33,9 M35,35 L11,9" stroke="${C.ink}" stroke-width="3.2" stroke-linecap="round" opacity="0.6"/>`;
  b += text(22, 31, '战', 26, C.paper, FONT_BRUSH, 'font-weight="bold"');
  return out(44, 44, b);
}

/** large battlefield painting (VS screen / judgement background) */
function landscape(seed: number, camp: boolean): PaintOut {
  const W = 640, H = 480;
  const d = new Doc(W, H, seed);
  const r = rng(seed);
  let b = `<rect width="${W}" height="${H}" fill="${camp ? '#cdbf9c' : '#c6b994'}"/>`;
  b += `<rect width="${W}" height="${H}" fill="${d.lin([[0, '#efe4cc', 0.85], [0.55, '#d8c9a3', 0.2], [1, '#7a6a50', 0.35]], 0, 0, 0, H)}"/>`;
  b += `<circle cx="${camp ? 120 : 520}" cy="90" r="34" fill="${C.cinnabar}" opacity="0.55"/>`;
  b += range(d, r, { x0: -40, x1: 680, base: 250, hMin: 90, hMax: 170, tone: '#6b6f72', alpha: 0.35, style: 'none', fade: 0.6 });
  b += range(d, r, { x0: -60, x1: 700, base: 290, hMin: 60, hMax: 120, tone: '#4a4e4c', alpha: 0.55, style: 'hemp', fade: 0.5 });
  b += mist(d, r, -20, 660, 285, 40, C.paper, 0.6);
  b += `<rect y="300" width="${W}" height="${H - 300}" fill="${d.lin([[0, '#b7a37a', 0.6], [1, '#6e5d42', 0.8]], 0, 300, 0, H)}"/>`;
  if (camp) {
    for (let k = 0; k < 7; k++) b += tent(60 + k * 90 + r.range(-20, 20), 330 + (k % 2) * 18, r.range(60, 90), C.ink, '#e8dfc6', r);
    b += flag(320, 400, 140, C.cinnabar, C.ink, r);
    b += flag(130, 420, 110, C.indigo, C.ink, r);
    b += army(380, 620, 470, 60, 9, r, C.ink, 0.85, C.cinnabar);
  } else {
    b += army(20, 280, 430, 90, 9, r, C.ink, 0.85, C.indigo);
    b += army(360, 620, 430, 90, 9, r, C.ink, 0.85, C.cinnabar);
    b += flag(150, 360, 90, C.indigo, C.ink, r);
    b += flag(500, 360, 90, C.cinnabar, C.ink, r, 1, -1);
  }
  b += d.paperGrain(0.8);
  // vignette so overlaid text stays readable
  b += `<rect width="${W}" height="${H}" fill="${d.rad([[0.5, '#000', 0], [1, '#000', 0.45]], W / 2, H / 2, 420, 320)}"/>`;
  return { svg: d.svg(b), w: W, h: H, ax: 0, ay: 0 };
}

function statusbar(): PaintOut {
  const W = 640, H = 480, r = rng(31);
  let b = `<rect x="0" y="452" width="640" height="28" fill="#2b241c"/>`;
  b += `<path d="${brush([[0, 452], [320, 451], [640, 452]], 3, r)}" fill="${C.gold}" opacity="0.8"/>`;
  b += `<rect x="0" y="455" width="640" height="25" fill="#3b2f22" opacity="0.6"/>`;
  return out(W, H, b);
}

function plainPanel(w: number, h: number, seed: number, title?: string): PaintOut {
  const p = panel(w, h, seed);
  let b = p.body;
  if (title) {
    const r = rng(seed + 1);
    b += `<path d="${brush([[12, 20], [w / 2, 19], [w - 12, 20]], 22, r, { taperIn: 0.05, taperOut: 0.05 })}" fill="${C.ink}" opacity="0.85"/>`;
    b += text(w / 2, 26, title, 16, C.paper, FONT_BRUSH);
  }
  return out(w, h, b, 0, 0, p.defs);
}

export function paintMenu(job: FrameJob): PaintOut {
  const n = job.name;
  let m: RegExpExecArray | null;
  if ((m = /^smap(\d\d)$/.exec(n))) return smap(+m[1]);
  if ((m = /^(sunny|rain|snow)(\d\d)$/.exec(n))) return weather(m[1] as 'sunny', +m[2] - 1);
  if ((m = /^timezone0(\d)-01$/.exec(n))) return timezone(+m[1]);
  if ((m = /^weather0(\d)-01$/.exec(n))) return weather((['sunny', 'rain', 'snow'] as const)[+m[1] - 1] ?? 'sunny', 0);
  if (n === 'myaction') return banner('我军行动', C.indigo, 3);
  if (n === 'enemyaction') return banner('敌军行动', C.cinnabar, 4);
  if (n === 'vs') return vsIcon();
  if (n === 'fightbg') return landscape(41, false);
  if (n === 'statusbar') return statusbar();
  if (n === 'generalname') {
    const r = rng(5);
    return out(90, 30, `<path d="${brush([[4, 15], [45, 14], [86, 15]], 26, r, { taperIn: 0.05, taperOut: 0.05, jitter: 0.04 })}" fill="${C.ink}" opacity="0.85"/><rect x="6" y="5" width="78" height="20" fill="none" stroke="${C.gold}" stroke-width="0.8" opacity="0.8"/>`, 5, 4);
  }
  const [w, h, ax, ay] = job.box;
  const title = n === 'sfmagic01' || n === 'sfmagic02' || n === 'sfmagic03' ? '计略' : undefined;
  const o = plainPanel(w, h, hash(n) % 1000, title);
  return { ...o, ax, ay };
}

// ------------------------------------------------------------------ sf/judge
function execution(female: boolean, k: number): PaintOut {
  // a captive kneels before the guard, who slowly raises his blade (k = 1..8)
  const W = 139, H = 191;
  const d = new Doc(W, H, 77);
  const r = rng(hash(`kill${female}${k}`));
  let b = `<rect width="${W}" height="${H}" fill="#d9c9a3"/>`;
  b += `<rect width="${W}" height="${H}" fill="${d.lin([[0, '#efe4cc', 0.9], [1, '#9a8762', 0.6]], 0, 0, 0, H)}"/>`;
  b += `<ellipse cx="70" cy="168" rx="60" ry="12" fill="#6e5d42" opacity="0.35"/>`;
  // guard (left/back)
  const raise = Math.min(1, (k - 1) / 4);
  const strike = k >= 6;
  const gx = 46, gy = 160;
  b += `<path d="${brush([[gx - 6, gy], [gx - 4, gy - 30]], 7, r)}" fill="#2b2a2e"/><path d="${brush([[gx + 5, gy], [gx + 3, gy - 30]], 7, r)}" fill="#2b2a2e"/>`;
  b += `<path d="M${gx - 12},${gy - 28} L${gx + 12},${gy - 28} L${gx + 10},${gy - 70} L${gx - 10},${gy - 70}Z" fill="#7a2a20" stroke="${C.ink}" stroke-width="1.5"/>`;
  b += `<circle cx="${gx}" cy="${gy - 80}" r="9" fill="${C.skin}" stroke="${C.ink}" stroke-width="1.4"/><path d="M${gx - 10},${gy - 82} Q${gx},${gy - 96} ${gx + 10},${gy - 82}Z" fill="#2b2622"/>`;
  const ang = strike ? 0.5 + (k - 6) * 0.3 : -1.9 + raise * -0.4;
  const hx = gx + 10 + Math.cos(ang) * 14, hy = gy - 64 + Math.sin(ang) * 14;
  b += `<path d="M${gx + 8},${gy - 64} L${f2(hx)},${f2(hy)}" stroke="${C.ink}" stroke-width="5" stroke-linecap="round"/>`;
  const bx = hx + Math.cos(ang - 0.3) * 40, by = hy + Math.sin(ang - 0.3) * 40;
  b += `<path d="M${f2(hx)},${f2(hy)} L${f2(bx)},${f2(by)}" stroke="#cfcfc6" stroke-width="4" stroke-linecap="round"/><path d="M${f2(hx)},${f2(hy)} L${f2(bx)},${f2(by)}" stroke="${C.ink}" stroke-width="0.8"/>`;
  if (k === 6) b += `<path d="${brush([[hx - 10, hy - 40], [bx + 6, by - 10], [bx + 20, by + 20]], 10, r, { taperIn: 0.3, taperOut: 0.5 })}" fill="#ffffff" opacity="0.55"/>`;
  // captive (right/front), bound, kneeling; slumps in the last frames
  const fallen = k >= 7;
  const cx = 92, cy = 166;
  const col = female ? '#c9a0a8' : '#b8a888';
  if (!fallen) {
    b += `<path d="M${cx - 18},${cy} Q${cx - 18},${cy - 18} ${cx},${cy - 16} Q${cx + 16},${cy - 18} ${cx + 18},${cy}Z" fill="${col}" stroke="${C.ink}" stroke-width="1.4"/>`;
    b += `<path d="M${cx - 12},${cy - 14} L${cx + 12},${cy - 14} L${cx + 8},${cy - 46} L${cx - 8},${cy - 46}Z" fill="${col}" stroke="${C.ink}" stroke-width="1.4"/>`;
    b += `<path d="M${cx - 12},${cy - 30} L${cx + 12},${cy - 34} M${cx - 12},${cy - 24} L${cx + 12},${cy - 28}" stroke="#6a4a32" stroke-width="2"/>`;
    b += `<circle cx="${cx + 2}" cy="${cy - 54}" r="8.5" fill="${C.skin}" stroke="${C.ink}" stroke-width="1.4"/>`;
    b += female ? `<path d="M${cx - 7},${cy - 58} Q${cx + 2},${cy - 68} ${cx + 11},${cy - 58} L${cx + 12},${cy - 38} L${cx + 8},${cy - 52} L${cx - 6},${cy - 52}Z" fill="#1b1712"/>` : `<path d="M${cx - 7},${cy - 57} Q${cx + 2},${cy - 66} ${cx + 11},${cy - 57}Z" fill="#1b1712"/><circle cx="${cx + 2}" cy="${cy - 64}" r="3" fill="#1b1712"/>`;
  } else {
    b += `<path d="M${cx - 30},${cy} Q${cx - 26},${cy - 16} ${cx},${cy - 14} Q${cx + 24},${cy - 12} ${cx + 30},${cy}Z" fill="${col}" stroke="${C.ink}" stroke-width="1.4"/>`;
    b += `<circle cx="${cx + 30}" cy="${cy - 6}" r="8" fill="${C.skin}" stroke="${C.ink}" stroke-width="1.4"/>`;
    b += `<path d="${blob(cx + 10, cy + 6, 26, 5, r, 0.3)}" fill="${C.ink}" opacity="0.35"/>`;
  }
  b += d.paperGrain(0.6);
  b += `<rect x="1" y="1" width="${W - 2}" height="${H - 2}" fill="none" stroke="${C.ink}" stroke-width="2"/>`;
  return { svg: d.svg(b), w: W, h: H, ax: 0, ay: 0 };
}

export function paintJudge(job: FrameJob): PaintOut {
  const n = job.name;
  let m: RegExpExecArray | null;
  if ((m = /^kill([mw])(\d{3})$/.exec(n))) return execution(m[1] === 'w', +m[2]);
  if (n === 'judgebg') return landscape(57, true);
  const [w, h, ax, ay] = job.box;
  const title = n === 'judgemenu' ? '处置俘虏' : undefined;
  if (n === 'judgemessage') {
    const p = panel(w, h, 91, '#e6d9b8');
    return out(w, h, p.body, ax, ay, p.defs);
  }
  const o = plainPanel(w, h, hash(n) % 1000, title);
  return { ...o, ax, ay };
}

