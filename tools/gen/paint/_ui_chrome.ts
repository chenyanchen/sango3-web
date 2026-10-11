// UI chrome: command title art (ad/static), lacquer buttons with gold
// calligraphy (ad/btn, mm/button, others/button, cg/button), panel frames
// (ad/base, bf/menu), sword-shaped skill gauges (bf/menu bfmagicpgs*),
// scrollbars, rating stars / tokens, Chinese numerals, cursors.
// Colours follow src/style.css (lacquer #3d1f0e→#6b3a1c, gold #d9b45a/#f6d98a)
// with ink-wash paper accents.
import type { FrameJob, PaintOut } from '../types.ts';
import { C, FONT_BRUSH, FONT_KAI, brush, f2, mix, paper, rng, seal, svgDoc, type Pt } from '../ink.ts';

const GOLD = '#d9b45a';
const GOLD_HI = '#f6d98a';
const LAC_HI = '#6b3a1c';
const LAC_LO = '#3d1f0e';
const LAC_DK = '#1c100a';

let uid = 0;
const nid = (p: string) => `${p}${++uid}`;
const out = (svg: string, w: number, h: number, ax = 0, ay = 0): PaintOut => ({ svg, w, h, ax, ay });
/** Near-invisible corner pixels so the atlas packer does not trim the box (DOM layouts rely on the full size). */
export const pinCorners = (w: number, h: number) => `<rect x="0" y="0" width="1" height="1" fill="#000" fill-opacity="0.012"/><rect x="${w - 1}" y="${h - 1}" width="1" height="1" fill="#000" fill-opacity="0.012"/>`;

// ------------------------------------------------------------------ labels
// prettier-ignore
const LABELS: Record<string, string> = {
  // ad/btn
  add: '增加', adoptstrategy: '采纳', adviser: '军师', alienate: '离间', allycountry: '同盟', appearage: '登场时期', appoint: '任命',
  appointadviser: '任命军师', appointchief: '任命太守', appointgeneral: '任命将军', attackcity: '攻城', awardtitle: '封号', bfmagic: '武将技',
  book: '书', booka: '书籍', campaigncity: '出征', cancel: '取消', canvass: '登用', change: '变更', chief: '太守', commandgeneral: '将军',
  confirm: '确定', delete: '删除', diplomacy: '外交', executive: '执行', foreigncountry: '他国', generals: '武将', goalcity: '目标',
  horse: '马', horsea: '坐骑', hp: '体力', intelligence: '智力', interior: '内政', investigatecity: '调查', level: '等级', loyal: '忠诚',
  military: '军事', morale: '士气', mp: '技力', namea: '姓名', newlord: '新君主', ourcountry: '本国', rank: '官职', rest: '休息',
  selcity: '选城', selectgeneral: '选将', sellord: '选君主', setoutcity: '出发', sfmagic: '军师技', smallint: '智', smalllevel: '等',
  smallloyal: '忠', smallmorale: '士', smallname: '名', smallstr: '武', soldierscountb: '兵数', soldiertype: '兵种', strategy: '计略',
  strength: '武力', superattack: '必杀', supportcity: '支援', surrender: '投降', system: '系统', title: '封号', unallycountry: '解盟',
  weapon: '武器', weapona: '兵器',
  // mm/button
  arena: '单挑擂台', creategeneral: '新建武将', gameover: '离开游戏', loadgame: '读取进度', newgame: '开始新局', option: '游戏设定',
  sex: '性别', startage: '起始时期',
  // others/button
  yes: '是', no: '否',
  // cg/button
  cgw_40113: '登场时期', cgw_40121: '变更', cgw_40122: '男', cgw_40123: '女', cgw_40131: '将军', cgw_40132: '军师', cgw_40133: '全能',
};
/** Scenario eras (mm/button age0N, ad/static age0N). */
const AGES = ['黄巾之乱', '董卓乱政', '群雄割据', '官渡之战', '赤壁之战', '三分天下', '天下归一'];

// prettier-ignore
const TITLES: Record<string, string> = {
  adjust: '调兵', alienate: '离间', appoint: '任命', billboard: '排行榜', campaign: '战争', campaign4: '战争', campaignt: '战争',
  command: '军令', develop: '开发', diplomacy: '外交', info: '情报', investigate: '调查', loadgame: '读取进度', money: '金钱', money4: '金钱',
  move: '移动', move4: '移动', movet: '移动', newlord: '新立君主', person: '人才', prepare: '整备', recruit: '征兵', recruit4: '征兵',
  recruitt: '征兵', savegame: '储存进度', search: '搜索', train: '训练',
};

// ------------------------------------------------------------------ title art (ad/static)
/** A paper slip mounted on dark brocade, with brush calligraphy and a small seal. Painted at 2×. */
function titleArt(text: string, w0: number, h0: number, seed: string, dim = false) {
  const k = 2, W = w0 * k, H = h0 * k;
  const r = rng(seed);
  const pp = paper(W, H, 5000 + (uid % 997), '#efe2c2');
  const clip = nid('tc');
  // torn-edged paper slip
  const pts: Pt[] = [];
  const m = 5;
  for (let x = m; x <= W - m; x += 8) pts.push([x, m + r.range(-1.2, 1.2)]);
  for (let y = m; y <= H - m; y += 8) pts.push([W - m + r.range(-1, 1), y]);
  for (let x = W - m; x >= m; x -= 8) pts.push([x, H - m + r.range(-1.2, 1.2)]);
  for (let y = H - m; y >= m; y -= 8) pts.push([m + r.range(-1, 1), y]);
  const slip = 'M' + pts.map((p) => `${f2(p[0])},${f2(p[1])}`).join(' L') + 'Z';
  let defs = pp.defs + `<clipPath id="${clip}"><path d="${slip}"/></clipPath>`;
  let b = `<rect x="0" y="0" width="${W}" height="${H}" rx="6" fill="${LAC_DK}"/><rect x="1.5" y="1.5" width="${W - 3}" height="${H - 3}" rx="5" fill="none" stroke="${GOLD}" stroke-width="2"/>`;
  b += `<g clip-path="url(#${clip})">${pp.body}<rect width="${W}" height="${H}" fill="url(#${clip}v)"/></g>`;
  defs += `<radialGradient id="${clip}v" cx="0.5" cy="0.5" r="0.7"><stop offset="0.55" stop-color="#7a5a2a" stop-opacity="0"/><stop offset="1" stop-color="#7a5a2a" stop-opacity="0.35"/></radialGradient>`;
  // ink wash swash behind the text
  b += `<path d="${brush([[W * 0.14, H * 0.6], [W * 0.4, H * 0.52], [W * 0.66, H * 0.58], [W * 0.86, H * 0.5]], H * 0.5, r, { taperIn: 0.2, taperOut: 0.5, jitter: 0.3 })}" fill="${C.inkWash}" opacity="0.13"/>`;
  const n = [...text].length;
  const fs = Math.min(H * 0.68, (W * 0.74) / Math.max(1, n) / (n > 2 ? 1 : 0.8));
  const sp = n <= 2 ? fs * 0.6 : fs * 0.08;
  b += `<text x="${f2(W * 0.47)}" y="${f2(H * 0.5 + fs * 0.36)}" font-size="${f2(fs)}" font-family="${FONT_BRUSH}" text-anchor="middle" letter-spacing="${f2(sp)}" fill="${dim ? C.inkWash : C.ink}">${text}</text>`;
  b += seal(W - m - H * 0.36 - 6, H * 0.3, H * 0.36, '墨', r);
  return out(svgDoc(W, H, b, defs), W, H);
}

// ------------------------------------------------------------------ buttons
type BtnState = 'normal' | 'hover' | 'down' | 'disabled';
function lacquerButton(text: string, w0: number, h0: number, state: BtnState, k = 2) {
  const W = w0 * k, H = h0 * k;
  const g = nid('bg');
  const top = state === 'hover' ? mix(LAC_HI, '#c07a3a', 0.35) : state === 'down' ? LAC_LO : state === 'disabled' ? '#4a4038' : LAC_HI;
  const bot = state === 'down' ? mix(LAC_LO, '#000', 0.3) : state === 'disabled' ? '#2a2420' : LAC_LO;
  const txt = state === 'disabled' ? '#8b7d5d' : state === 'hover' ? '#fff3c8' : GOLD_HI;
  const edge = state === 'disabled' ? '#6b6255' : state === 'hover' ? GOLD_HI : GOLD;
  const defs = `<linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bot}"/></linearGradient>`;
  const c = Math.min(H * 0.3, 8 * k);
  const plate = `M${c},1 L${W - c},1 L${W - 1},${c} L${W - 1},${H - c} L${W - c},${H - 1} L${c},${H - 1} L1,${H - c} L1,${c}Z`;
  let b = `<path d="${plate}" fill="url(#${g})" stroke="${LAC_DK}" stroke-width="${k}"/>`;
  b += `<path d="${plate}" fill="none" stroke="${edge}" stroke-width="${k * 0.8}" transform="translate(${W * 0.03} ${H * 0.06}) scale(${0.94} ${0.88})" opacity="0.9"/>`;
  b += `<path d="M${c + 2},${H * 0.16} L${W - c - 2},${H * 0.16}" stroke="#fff" stroke-width="${k * 0.6}" opacity="${state === 'down' ? 0.05 : 0.18}"/>`;
  // corner cloud hooks
  for (const sx of [1, -1]) {
    const x = sx === 1 ? c * 0.9 : W - c * 0.9;
    b += `<path d="M${f2(x)},${f2(H * 0.5 - H * 0.16)} q${f2(sx * H * 0.12)},${f2(H * 0.16)} 0,${f2(H * 0.32)}" fill="none" stroke="${edge}" stroke-width="${k * 0.8}" opacity="0.7"/>`;
  }
  const n = [...text].length;
  const fs = Math.min(H * 0.62, ((W - c * 2.4) / Math.max(1, n)) * 0.92);
  const sp = n <= 2 && W > H * 2.4 ? fs * 0.4 : 0;
  const dy = state === 'down' ? k : 0;
  if (text)
    b += `<text x="${f2(W / 2 + sp / 2)}" y="${f2(H / 2 + fs * 0.36 + dy)}" font-size="${f2(fs)}" font-family="${FONT_KAI}" font-weight="bold" text-anchor="middle" letter-spacing="${f2(sp)}" fill="${txt}" stroke="${LAC_DK}" stroke-width="${f2(k * 1.2)}" paint-order="stroke">${text}</text>`;
  return out(svgDoc(W, H, b, defs), W, H);
}

/** Small square stat badge (ad/btn small*): gold tile with a dark character. */
function badge(ch: string, w0: number, h0: number, state: BtnState) {
  const k = 2, W = w0 * k, H = h0 * k;
  const g = nid('bd');
  const hi = state === 'hover' ? '#fff0b8' : state === 'down' ? '#c8a050' : '#f0d488';
  const defs = `<linearGradient id="${g}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${hi}"/><stop offset="1" stop-color="#9a6a20"/></linearGradient>`;
  const b = `<rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="4" fill="url(#${g})" stroke="${LAC_DK}" stroke-width="2"/><text x="${W / 2}" y="${f2(H / 2 + H * 0.24)}" font-size="${f2(H * 0.66)}" font-family="${FONT_KAI}" font-weight="bold" text-anchor="middle" fill="#4a1e0e">${ch}</text>`;
  return out(svgDoc(W, H, b, defs), W, H);
}

// ------------------------------------------------------------------ panels
/** Lacquer panel with a gold double border and corner fittings. */
function panel(w: number, h: number, opts: { title?: string; alpha?: number; ax?: number; ay?: number } = {}) {
  const W = Math.max(4, w), H = Math.max(4, h);
  const g = nid('pn');
  const a = opts.alpha ?? 0.92;
  const defs = `<linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a2214" stop-opacity="${a}"/><stop offset="0.25" stop-color="#1c100a" stop-opacity="${a}"/><stop offset="1" stop-color="#140b06" stop-opacity="${a}"/></linearGradient>`;
  const rr = Math.min(6, W / 6, H / 6);
  let b = `<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="${rr}" fill="url(#${g})" stroke="${GOLD}" stroke-opacity="0.7" stroke-width="1"/>`;
  if (W > 24 && H > 24) {
    b += `<rect x="4" y="4" width="${W - 8}" height="${H - 8}" rx="${Math.max(1, rr - 2)}" fill="none" stroke="${GOLD}" stroke-opacity="0.25" stroke-width="1"/>`;
    const cs = Math.min(12, W / 5, H / 5);
    for (const [x, y, sx, sy] of [[3, 3, 1, 1], [W - 3, 3, -1, 1], [3, H - 3, 1, -1], [W - 3, H - 3, -1, -1]] as const)
      b += `<path d="M${x},${y + sy * cs} L${x},${y} L${x + sx * cs},${y} M${x + sx * 3},${y + sy * (cs - 3)} L${x + sx * 3},${y + sy * 3} L${x + sx * (cs - 3)},${y + sy * 3}" fill="none" stroke="${GOLD_HI}" stroke-width="1.2" opacity="0.85"/>`;
  }
  if (opts.title) b += `<text x="12" y="22" font-size="16" font-family="${FONT_KAI}" fill="${GOLD_HI}">${opts.title}</text>`;
  return out(svgDoc(W, H, b, defs), W, H, opts.ax ?? 0, opts.ay ?? 0);
}

// ------------------------------------------------------------------ battle gauges
// 5 weapon styles; blade outline on a 0..1 x range (hilt excluded), y in -1..1
function bladeShape(st: number, W: number, H: number, x0: number): string {
  const cy = H / 2;
  const L = W - x0;
  const X = (t: number) => f2(x0 + t * L);
  const Y = (v: number) => f2(cy + v * H * 0.5);
  switch (st) {
    case 1: // straight jian
      return `M${X(0)},${Y(-0.42)} L${X(0.93)},${Y(-0.36)} L${X(1)},${Y(0)} L${X(0.93)},${Y(0.36)} L${X(0)},${Y(0.42)}Z`;
    case 2: { // serpent spear blade
      let d = `M${X(0)},${Y(-0.3)}`;
      for (let i = 1; i <= 8; i++) d += ` Q${X(i / 9 - 0.055)},${Y(i % 2 ? -0.62 : -0.18)} ${X(i / 9)},${Y(-0.36)}`;
      d += ` L${X(1)},${Y(0)} L${X(8 / 9)},${Y(0.36)}`;
      for (let i = 7; i >= 0; i--) d += ` Q${X(i / 9 + 0.055)},${Y(i % 2 ? 0.18 : 0.62)} ${X(i / 9)},${Y(0.36)}`;
      return d + 'Z';
    }
    case 3: // broad dao, upswept tip
      return `M${X(0)},${Y(-0.4)} L${X(0.82)},${Y(-0.42)} Q${X(0.96)},${Y(-0.5)} ${X(1)},${Y(-0.92)} Q${X(1)},${Y(0.6)} ${X(0.8)},${Y(0.8)} Q${X(0.4)},${Y(0.82)} ${X(0)},${Y(0.62)}Z`;
    case 4: // ji: blade with a crescent side spur
      return `M${X(0)},${Y(-0.36)} L${X(0.16)},${Y(-0.36)} Q${X(0.14)},${Y(-0.9)} ${X(0.3)},${Y(-0.98)} Q${X(0.22)},${Y(-0.7)} ${X(0.27)},${Y(-0.36)} L${X(0.9)},${Y(-0.3)} L${X(1)},${Y(0)} L${X(0.9)},${Y(0.3)} L${X(0)},${Y(0.36)}Z`;
    default: // heavy zhanmadao with thick spine and notch
      return `M${X(0)},${Y(-0.46)} L${X(0.5)},${Y(-0.46)} L${X(0.54)},${Y(-0.62)} L${X(0.58)},${Y(-0.46)} L${X(0.88)},${Y(-0.46)} Q${X(1)},${Y(-0.4)} ${X(1)},${Y(0.1)} Q${X(0.96)},${Y(0.56)} ${X(0.84)},${Y(0.56)} L${X(0)},${Y(0.5)}Z`;
  }
}

function hilt(st: number, x1: number, H: number): string {
  const cy = H / 2;
  const col = ['#7a2a1a', '#2e5a4a', '#3a2a1e', '#5a3a7a', '#1e1e24'][st - 1] ?? '#3a2a1e';
  const guard = st === 3 ? `<circle cx="${f2(x1 - 2)}" cy="${f2(cy - H * 0.3)}" r="${f2(H * 0.14)}" fill="none" stroke="${GOLD}" stroke-width="2"/>` : '';
  const gx = x1 - H * 0.28;
  let s = `<rect x="${f2(H * 0.5)}" y="${f2(cy - H * 0.16)}" width="${f2(gx - H * 0.5)}" height="${f2(H * 0.32)}" rx="${f2(H * 0.1)}" fill="${col}" stroke="${LAC_DK}" stroke-width="1.6"/>`;
  for (let x = H * 0.62; x < gx - 3; x += H * 0.22) s += `<path d="M${f2(x)},${f2(cy - H * 0.15)} L${f2(x + H * 0.12)},${f2(cy + H * 0.15)}" stroke="${mix(col, '#fff', 0.35)}" stroke-width="1.4"/>`;
  s += `<circle cx="${f2(H * 0.46)}" cy="${f2(cy)}" r="${f2(H * 0.22)}" fill="${GOLD}" stroke="${LAC_DK}" stroke-width="1.6"/>`;
  s += `<path d="M${f2(gx)},${f2(cy - H * 0.46)} Q${f2(x1 + 2)},${f2(cy)} ${f2(gx)},${f2(cy + H * 0.46)} L${f2(x1)},${f2(cy + H * 0.3)} L${f2(x1)},${f2(cy - H * 0.3)}Z" fill="${GOLD}" stroke="${LAC_DK}" stroke-width="1.6"/>`;
  return s + guard;
}

function gauge(name: string, box: [number, number, number, number]) {
  const m = /^bfmagicpgs(frame)?0(\d)(?:-(\d))?(r?)$/.exec(name)!;
  const isFrame = !!m[1], st = +m[2], kind = m[3] ? +m[3] : 0, right = m[4] === 'r';
  const k = 2;
  // all five use one frame height so the HUD row stays even
  const FW = 156 * k, FH = 24 * k;
  const x0 = Math.round(FW * 0.195);
  const flip = (s: string, w: number) => (right ? `<g transform="translate(${w} 0) scale(-1 1)">${s}</g>` : s);
  if (isFrame) {
    const g = nid('fr');
    const defs = `<linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a3430" stop-opacity="0.85"/><stop offset="0.5" stop-color="#14100c" stop-opacity="0.85"/><stop offset="1" stop-color="#2a2420" stop-opacity="0.85"/></linearGradient>`;
    const d = bladeShape(st, FW - 2, FH, x0);
    const body = `<path d="${d}" fill="url(#${g})"/><path d="${d}" fill="none" stroke="${GOLD}" stroke-width="2.4" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="${LAC_DK}" stroke-width="0.8" stroke-linejoin="round"/>` + hilt(st, x0, FH);
    return out(svgDoc(FW, FH, flip(body, FW) + pinCorners(FW, FH), defs), FW, FH);
  }
  // fill image covers the blade area only (CSS places it at left 19.5%, width 79.5%)
  const BW = Math.round(FW * 0.795), BH = FH;
  const g = nid('fl');
  const white = kind === 2;
  const defs = white
    ? `<linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="0.5" stop-color="#fff6d8"/><stop offset="1" stop-color="#e8d090"/></linearGradient>`
    : `<linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff9a6a"/><stop offset="0.45" stop-color="#d0402a"/><stop offset="1" stop-color="#7a1a10"/></linearGradient>`;
  // the blade path in fill coordinates (shift by -x0, then trim the far tip margin)
  const d = bladeShape(st, FW - 2, FH, x0);
  const shine = `<path d="M${x0 + 6},${f2(BH * 0.38)} L${FW - 18},${f2(BH * 0.4)}" stroke="#fff" stroke-width="2" opacity="${white ? 0.9 : 0.45}"/>`;
  const body = `<g transform="translate(${-x0} 0)"><path d="${d}" fill="url(#${g})"/>${shine}</g>`;
  void box;
  return out(svgDoc(BW, BH, flip(body, BW) + pinCorners(BW, BH), defs), BW, BH);
}

// ------------------------------------------------------------------ scrollbars, progress, digits, cursor
function scrollPiece(name: string, w: number, h: number) {
  const k = 2, W = w * k, H = h * k;
  const hover = /2$/.test(name);
  const vert = H > W;
  const g = nid('sc');
  if (/^(v|h)\d+$/.test(name) || /^cgw_40142$/.test(name) || /^bfscroll/.test(name)) {
    // track
    const defs = `<linearGradient id="${g}" x1="0" y1="0" x2="${vert ? 1 : 0}" y2="${vert ? 0 : 1}"><stop offset="0" stop-color="#0e0806"/><stop offset="0.5" stop-color="#2a1a10"/><stop offset="1" stop-color="#0e0806"/></linearGradient>`;
    return out(svgDoc(W, H, `<rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="${Math.min(W, H) / 2 - 1}" fill="url(#${g})" stroke="${GOLD}" stroke-opacity="0.5" stroke-width="1.5"/>`, defs), W, H);
  }
  if (/^thumb/.test(name)) {
    const defs = `<linearGradient id="${g}" x1="0" y1="0" x2="${vert ? 1 : 0}" y2="${vert ? 0 : 1}"><stop offset="0" stop-color="${hover ? '#f6d98a' : '#c99a3a'}"/><stop offset="1" stop-color="#6a4410"/></linearGradient>`;
    return out(svgDoc(W, H, `<rect x="2" y="2" width="${W - 4}" height="${H - 4}" rx="${Math.min(W, H) / 2 - 2}" fill="url(#${g})" stroke="${LAC_DK}" stroke-width="2"/>`, defs), W, H);
  }
  // arrow buttons
  const dir = /^up/.test(name) ? 'up' : /^down/.test(name) ? 'down' : /^left/.test(name) ? 'left' : 'right';
  const cx = W / 2, cy = H / 2, s = Math.min(W, H) * 0.3;
  const tri = { up: `M${cx - s},${cy + s * 0.5} L${cx},${cy - s * 0.7} L${cx + s},${cy + s * 0.5}Z`, down: `M${cx - s},${cy - s * 0.5} L${cx},${cy + s * 0.7} L${cx + s},${cy - s * 0.5}Z`, left: `M${cx + s * 0.5},${cy - s} L${cx - s * 0.7},${cy} L${cx + s * 0.5},${cy + s}Z`, right: `M${cx - s * 0.5},${cy - s} L${cx + s * 0.7},${cy} L${cx - s * 0.5},${cy + s}Z` }[dir];
  const body = `<rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="3" fill="${hover ? LAC_HI : LAC_LO}" stroke="${GOLD}" stroke-width="1.5"/>` + (W > 14 ? `<path d="${tri}" fill="${hover ? GOLD_HI : GOLD}"/>` : '');
  return out(svgDoc(W, H, body), W, H);
}

function star(cx: number, cy: number, r: number) {
  const p: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    p.push(`${f2(cx + Math.cos(a) * rr)},${f2(cy + Math.sin(a) * rr)}`);
  }
  return `M${p.join(' L')}Z`;
}

const RANK_COLORS = ['#e2442c', '#f0c040', '#f6e8a0', '#8fd06a', '#7fc8e8'];

function progress(name: string, w: number, h: number, ax: number) {
  const k = 2;
  const m = /(\d\d)$/.exec(name);
  const i = m ? +m[1] - 1 : 0;
  if (name.startsWith('star')) {
    const W = w * k, H = h * k;
    let b = '';
    for (let s = 0; s < 5; s++) b += `<path d="${star(H * 0.55 + s * (W - H * 0.1) / 5, H / 2, H * 0.48)}" fill="${RANK_COLORS[i]}" stroke="${LAC_DK}" stroke-width="1.6" stroke-linejoin="round"/>`;
    return out(svgDoc(W, H, b), W, H);
  }
  if (name.startsWith('limit')) {
    // "unlimited" mark: a looping brush stroke (∞)
    const W = w * k, H = h * k;
    const d = `M${W / 2},${H / 2} C${W * 0.75},${H * 0.05} ${W * 0.98},${H * 0.3} ${W * 0.9},${H * 0.62} C${W * 0.8},${H * 0.98} ${W * 0.6},${H * 0.75} ${W / 2},${H / 2} C${W * 0.4},${H * 0.25} ${W * 0.2},${H * 0.02} ${W * 0.1},${H * 0.38} C${W * 0.02},${H * 0.7} ${W * 0.25},${H * 0.95} ${W / 2},${H / 2}`;
    return out(svgDoc(W, H, `<path d="${d}" fill="none" stroke="${LAC_DK}" stroke-width="5"/><path d="${d}" fill="none" stroke="${RANK_COLORS[i]}" stroke-width="2.6"/>`), W, H, ax * k, 0);
  }
  // tokens: a strip of 10 command tallies (bamboo tokens with a red seal mark)
  const W = w * k, H = h * k;
  let b = '';
  const tw = W / 10;
  for (let t = 0; t < 10; t++) {
    const x = t * tw + tw * 0.12, ww = tw * 0.76;
    b += `<path d="M${f2(x)},${f2(H * 0.08)} L${f2(x + ww)},${f2(H * 0.08)} L${f2(x + ww)},${f2(H * 0.8)} L${f2(x + ww / 2)},${f2(H * 0.97)} L${f2(x)},${f2(H * 0.8)}Z" fill="#d8b56a" stroke="${LAC_DK}" stroke-width="2"/>`;
    b += `<rect x="${f2(x + ww * 0.12)}" y="${f2(H * 0.14)}" width="${f2(ww * 0.76)}" height="${f2(H * 0.12)}" fill="${C.cinnabar}"/>`;
    b += `<text x="${f2(x + ww / 2)}" y="${f2(H * 0.62)}" font-size="${f2(ww * 0.7)}" font-family="${FONT_KAI}" text-anchor="middle" fill="${C.ink}">令</text>`;
  }
  return out(svgDoc(W, H, b), W, H, ax * k, 0);
}

const NUMERALS = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
function numeral(name: string, w: number, h: number) {
  const m = /^a(\d\d)$/.exec(name);
  if (!m) return out(svgDoc(1, 1, ''), 1, 1);
  const k = 2, S = 26 * k;
  const ch = NUMERALS[+m[1]] ?? '';
  const b = `<text x="${S / 2}" y="${f2(S * 0.82)}" font-size="${f2(S * 0.9)}" font-family="${FONT_BRUSH}" text-anchor="middle" fill="${GOLD_HI}" stroke="${LAC_DK}" stroke-width="4" paint-order="stroke">${ch}</text>`;
  void w;
  void h;
  return out(svgDoc(S, S, b), S, S);
}

function cursor(name: string, job: FrameJob) {
  const [w, h, ax, ay] = job.box;
  if (name.startsWith('mouse')) {
    // a small brush-pen pointer with a glint that travels along it
    const i = +name.slice(5) - 1;
    const W = 24, H = 48;
    const tip: Pt = [2, 2], end: Pt = [18, 44];
    const t = (i % 10) / 9;
    const gx = tip[0] + (end[0] - tip[0]) * t * 0.6, gy = tip[1] + (end[1] - tip[1]) * t * 0.6;
    let b = `<path d="M2,2 L9,8 L22,40 L18,46 L14,44 L5,12Z" fill="#3a2414" stroke="${LAC_DK}" stroke-width="1"/>`;
    b += `<path d="M2,2 L9,8 L7,12 L5,12Z" fill="${C.ink}"/><path d="M12,30 L22,40 L18,46 L14,44Z" fill="${C.cinnabar}"/><path d="M10,22 L18,22" stroke="${GOLD}" stroke-width="1.6"/>`;
    b += `<path d="M2,2 L9,8" stroke="${GOLD_HI}" stroke-width="1"/><circle cx="${f2(gx)}" cy="${f2(gy)}" r="1.6" fill="#fff" opacity="${f2(0.4 + 0.6 * Math.sin(t * Math.PI))}"/>`;
    return out(svgDoc(W, H, b), W, H, 0, 0);
  }
  // g000N: direction arrows (left, down, right, up) with the point at the anchor
  const dir = +name.slice(1);
  const L = 44, T = 20;
  let b = `<path d="M2,${T / 2} L16,2 L14,${T / 2} L16,${T - 2}Z" fill="${GOLD_HI}" stroke="${LAC_DK}" stroke-width="1.2"/><rect x="14" y="${T / 2 - 3}" width="${L - 18}" height="6" rx="2" fill="${C.cinnabar}" stroke="${LAC_DK}" stroke-width="1"/><circle cx="${L - 4}" cy="${T / 2}" r="3.4" fill="${GOLD}" stroke="${LAC_DK}" stroke-width="1"/>`;
  b = `<g>${b}</g>`;
  const rot = { 1: 0, 2: -90, 3: 180, 4: 90 }[dir] ?? 0;
  const W = w, H = h;
  const body = `<g transform="translate(${W / 2} ${H / 2}) rotate(${rot}) translate(${-L / 2} ${-T / 2})">${b}</g>`;
  return out(svgDoc(W, H, body), W, H, ax, ay);
}

// ------------------------------------------------------------------ router
function btnState(name: string): [string, BtnState] {
  let m = /^(cgw_\d+)([nfd])$/.exec(name);
  if (m) return [m[1], m[2] === 'f' ? 'hover' : m[2] === 'd' ? 'down' : 'normal'];
  m = /^(.+?)_?([234])$/.exec(name);
  if (m && !/^(age0\d|city0\d|arygupa?chk0)$/.test(m[1]) && !/^age0\d$/.test(name)) return [m[1], m[2] === '2' ? 'hover' : m[2] === '3' ? 'down' : 'disabled'];
  return [name, 'normal'];
}

export function paintChrome(job: FrameJob): PaintOut {
  const { dir, name } = job;
  const [w, h, ax, ay] = job.box;
  if (w <= 1 && h <= 1) return out(svgDoc(1, 1, ''), 1, 1);
  if (dir === 'ad/static') {
    if (/^age0\d$/.test(name)) return titleArt(AGES[+name.slice(4) - 1], w, h, name);
    const t = TITLES[name.replace(/4$/, '')] ?? TITLES[name];
    if (!t) return panel(w, h, { ax, ay });
    return titleArt(t, 120, 31, name, /4$/.test(name));
  }
  if (dir === 'bf/menu' && name.startsWith('bfmagicpgs')) return gauge(name, job.box);
  if (dir === 'bf/menu' && /^bf(hp|mp)[01]$/.test(name)) {
    const W = w * 2, H = h * 2;
    const col = name.startsWith('bfhp') ? (name.endsWith('0') ? '#3a7ad8' : '#d8402a') : '#e0b030';
    return out(svgDoc(W, H, `<rect x="0" y="0" width="${W}" height="${H}" rx="${H / 2}" fill="${col}"/><rect x="2" y="2" width="${W - 4}" height="${H * 0.3}" rx="${H * 0.15}" fill="#fff" opacity="0.35"/>`), W, H);
  }
  if (dir === 'bf/menu' && /^bfcover/.test(name)) return out(svgDoc(w, h, `<rect width="${w}" height="${h}" fill="${GOLD}"/>`), w, h, ax, ay);
  if (dir === 'ad/scroll' || dir === 'cg/scroll' || name.startsWith('bfscroll')) return scrollPiece(name, w, h);
  if (dir === 'ad/progress') return progress(name, w, h, ax);
  if (dir === 'digits') return numeral(name, w, h);
  if (dir === 'cursor') return cursor(name, job);
  if (dir === 'ad/btn' || dir === 'mm/button' || dir === 'others/button' || dir === 'cg/button') {
    const [base, state] = btnState(name);
    if (/^small/.test(base)) return badge(LABELS[base] ?? '', w, h, state);
    if (/^(left|right)$/.test(base)) return scrollPiece(`${base}btn${state === 'normal' ? '' : '2'}`, w, h);
    if (/^(arraygroupa?|arraythingicon|arygupa?chk0\d)$/.test(base) || /^arraythingicon\d?$/.test(name)) {
      const sel = /chk/.test(name) || state !== 'normal';
      const W = w * 2, H = h * 2;
      return out(svgDoc(W, H, `<rect x="2" y="2" width="${W - 4}" height="${H - 4}" rx="6" fill="#1c100a" fill-opacity="0.6" stroke="${sel ? GOLD_HI : GOLD}" stroke-width="${sel ? 4 : 2}"/>`), W, H);
    }
    const label = /^age0\d$/.test(base) ? AGES[+base.slice(3) - 1] : LABELS[base] ?? '';
    return lacquerButton(label, w, h, state);
  }
  // panels / frames (ad/base, bf/menu, ad root)
  return panel(w, h, { ax, ay, alpha: /^bg/.test(name) ? 0.95 : 0.88 });
}
