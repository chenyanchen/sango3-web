// Small panels living in the scenery directories (save slots, settings rows,
// plaques, bracket pieces, custom-general frames). The remake draws its UI in
// HTML, so these are mostly unused; they are still painted in the same style
// (dark ink-wash lacquer with a thin gold border) so the set is complete.
import { FONT_KAI } from '../ink.ts';
import type { FrameJob, PaintOut } from '../types.ts';
import { C, f2 } from './_scenery_kit.ts';

const LACQ = '#2b2119';
const GOLD = C.gold;

function frame(w: number, h: number, o: { fill?: string; alpha?: number; hi?: boolean; corners?: boolean } = {}) {
  const b = o.hi ? '#e8c060' : GOLD;
  const ins = 1.5;
  let s = `<rect x="${ins}" y="${ins}" width="${f2(w - ins * 2)}" height="${f2(h - ins * 2)}" rx="3" fill="${o.fill ?? LACQ}" opacity="${f2(o.alpha ?? 0.88)}"/>`;
  s += `<rect x="${ins}" y="${ins}" width="${f2(w - ins * 2)}" height="${f2(h - ins * 2)}" rx="3" fill="none" stroke="${b}" stroke-width="${o.hi ? 2 : 1.4}"/>`;
  if (w > 40 && h > 40) s += `<rect x="5" y="5" width="${f2(w - 10)}" height="${f2(h - 10)}" rx="2" fill="none" stroke="${b}" stroke-width="0.6" opacity="0.6"/>`;
  if (o.corners !== false && w > 30 && h > 20) {
    const k = Math.min(10, h * 0.3);
    for (const [x, y, sx, sy] of [[ins, ins, 1, 1], [w - ins, ins, -1, 1], [ins, h - ins, 1, -1], [w - ins, h - ins, -1, -1]] as const)
      s += `<path d="M${f2(x)},${f2(y + sy * k)}V${f2(y)}H${f2(x + sx * k)}" stroke="${b}" stroke-width="2.6" fill="none"/>`;
  }
  if (o.hi) s += `<rect x="${ins}" y="${ins}" width="${f2(w - ins * 2)}" height="${f2(h - ins * 2)}" rx="3" fill="${C.cinnabar}" opacity="0.18"/>`;
  return s;
}
const text = (x: number, y: number, t: string, size: number, col = '#f0e2bc', anchor = 'middle', extra = '') =>
  `<text x="${f2(x)}" y="${f2(y)}" text-anchor="${anchor}" font-family="${FONT_KAI}" font-size="${f2(size)}" fill="${col}"${extra}>${t}</text>`;
function plaque(w: number, h: number, label: string, hi = false) {
  return frame(w, h, { fill: '#4a2a1a', alpha: 0.95, hi }) + text(w / 2, h / 2 + h * 0.2, label, Math.min(h * 0.55, (w / Math.max(1, label.length)) * 0.8), '#f0d890', 'middle', ' letter-spacing="2"');
}
const svg = (w: number, h: number, body: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;

/** bracket connector: ⊓ shape of width w, height h (line drawn at the top) */
function bracketPiece(w: number, h: number, won: boolean) {
  const col = won ? C.cinnabar : C.ink;
  const sw = won ? 3 : 2.2;
  if (h <= 6) return `<path d="M0,${f2(h / 2)}H${w}" stroke="${col}" stroke-width="${sw}"/>`;
  return `<path d="M${f2(sw / 2)},${h}V${f2(sw / 2)}H${f2(w - sw / 2)}V${h}" stroke="${col}" stroke-width="${sw}" fill="none" stroke-linejoin="round"/>` +
    `<circle cx="${f2(w / 2)}" cy="${f2(sw / 2 + 1)}" r="${f2(sw * 1.2)}" fill="${col}"/>`;
}

const ROLES = ['主将', '副将', '中坚', '次锋', '先锋'];

export function paintUi(job: FrameJob): PaintOut {
  const [w, h, ax, ay] = job.box;
  const n = job.name;
  const out = (body: string) => ({ svg: svg(w, h, body), w, h, ax, ay });
  let m: RegExpExecArray | null;
  // ---- mm/base
  if (n === 'loadtitle') return out(plaque(w, h, '读取进度'));
  if (n === 'savetitle') return out(plaque(w, h, '储存进度'));
  if (n === 'selectagetitle') return out(plaque(w, h, '选择剧本'));
  if (n === 'settingtitle') return out(plaque(w, h, '游戏设定'));
  if (n === 'selnewgeneralmessage') return out(frame(w, h, { corners: false }) + text(w / 2, h * 0.7, '请选择登场的自创武将', h * 0.55));
  if (n === 'selnewgeneral') return out(frame(w, h, { alpha: 0.92 }));
  if ((m = /^saveslot(\d\d)(-2)?$/.exec(n))) {
    const hi = !!m[2];
    const num = +m[1];
    let s = frame(w, h, { hi });
    const bw = Math.min(60, w * 0.18);
    s += `<rect x="4" y="4" width="${f2(bw)}" height="${h - 8}" rx="2" fill="#5a2a1a" stroke="${GOLD}" stroke-width="1"/>`;
    s += text(4 + bw / 2, h * 0.7, num === 0 ? '自动' : String(num), h * 0.5, '#f0d890');
    return out(s);
  }
  if ((m = /^setting(\d\d)(-2)?$/.exec(n))) {
    const hi = !!m[2];
    let s = frame(w, h, { hi });
    s += `<rect x="4" y="4" width="96" height="${h - 8}" rx="2" fill="#5a2a1a" stroke="${GOLD}" stroke-width="1"/>`;
    s += text(52, h * 0.68, `设定 ${['一', '二', '三', '四', '五', '六', '七', '八', '九'][+m[1] - 1] ?? m[1]}`, h * 0.45, '#f0d890');
    return out(s);
  }
  if (n === 'tokens') {
    let s = '';
    for (let i = 0; i < 5; i++) {
      const cx = 26 + i * 51, cy = h / 2;
      s += `<circle cx="${cx}" cy="${cy}" r="21" fill="${[C.jade, C.gold, C.cinnabar, C.azurite, C.paperDark][i]}" stroke="${C.ink}" stroke-width="2"/>`;
      s += `<circle cx="${cx}" cy="${cy}" r="8" fill="none" stroke="${C.ink}" stroke-width="1.5" opacity="0.6"/>`;
    }
    return out(s);
  }
  // ---- arena
  if (n === 'frame' || n === 'framew') return out(frame(w, h, { fill: '#e9dcc0', alpha: 0.3, hi: n === 'framew' }));
  if ((m = /^u?line(\d)(w)?$/.exec(n))) return out(bracketPiece(w, h, !!m[2]));
  if (n === 'asw_40301') return out(plaque(w, h, '比武大会'));
  if (n === 'asw_40370') return out(frame(w, h, { corners: false }));
  if (n === 'asw_40400') return out(plaque(w, h, '对'));
  if ((m = /^asw_4040([1-5])$/.exec(n))) return out(frame(w, h, { fill: '#e9dcc0', alpha: 0.25 }) + plaqueAt(w, ROLES[+m[1] - 1]));
  if (n === 'asw_40380' || n === 'asw_40390') {
    let s = '';
    for (let i = 0; i < 5; i++) s += `<g transform="translate(0 ${i * 83})">${frame(w, 78, { alpha: 0.6 })}${text(w / 2, 28, ROLES[i], 18, '#f0d890')}</g>`;
    return out(s);
  }
  if (n === 'asw_40310') {
    let s = '';
    for (let i = 0; i < 5; i++) s += `<g transform="translate(${i * 114} 0)">${frame(110, 189, { fill: '#e9dcc0', alpha: 0.25 })}${plaqueAt(110, ROLES[i])}</g>`;
    return out(s);
  }
  if (n === 'asw_40413') return out(frame(w, h));
  // ---- ending
  if (n === 'top5') return out(plaque(w, h, '功臣榜'));
  if (n === 'general') return out(frame(w, h) + `<rect x="8" y="8" width="${h - 16}" height="${h - 16}" fill="#e9dcc0" opacity="0.25" stroke="${GOLD}"/>`);
  // ---- others / cg/base and anything else: an empty lacquer panel
  if (job.dir === 'cg/base' && w > 300) return out(frame(w, h, { alpha: 0.9 }) + text(w - 60, 30, '自创武将', 18, '#f0d890'));
  return out(frame(w, h));
}

function plaqueAt(w: number, label: string) {
  return `<g transform="translate(${f2(w / 2 - 34)} 0)">${plaque(68, 24, label)}</g>`;
}
