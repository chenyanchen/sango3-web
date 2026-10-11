// Item icons (ad/things): each icon depicts its item (see ITEM_ICONS in
// tools/gen/data/_rules_items.ts): weapons by kind (剑 枪 刀 戟 斧/锤), books
// and scrolls, horse head portraits, treasures, ginseng and lingzhi. Painted
// at 2× (112 px) on a small rice-paper tile; the UI scales them to ~1.8em.
import type { FrameJob, PaintOut } from '../types.ts';
import { C, blob, brush, f2, mix, rng, svgDoc, type Pt, type Rng } from '../ink.ts';

const S = 112;
const STEEL = '#c9d2d6';
const STEEL_D = '#7d8b93';
const BRONZE = '#a8792f';
const GOLD = '#d9aa38';
const WOOD = '#6b4423';
const RED = '#b8322a';
const OUT = C.ink;

let uid = 0;
const id = (p: string) => `${p}${++uid}`;

function tile(body: string, defs: string, glow?: string) {
  const g = id('tile');
  const d = `<radialGradient id="${g}" cx="0.45" cy="0.4" r="0.75"><stop offset="0" stop-color="#f3e9d2"/><stop offset="0.7" stop-color="${C.paper}"/><stop offset="1" stop-color="#c9b48a"/></radialGradient>${defs}`;
  const gl = glow
    ? `<radialGradient id="${g}g"><stop offset="0" stop-color="${glow}" stop-opacity="0.55"/><stop offset="1" stop-color="${glow}" stop-opacity="0"/></radialGradient><filter id="${g}f" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="3"/></filter>`
    : '';
  const back = `<rect x="2" y="2" width="${S - 4}" height="${S - 4}" rx="12" fill="url(#${g})"/>` + (glow ? `<circle cx="${S / 2}" cy="${S / 2}" r="${S * 0.46}" fill="url(#${g}g)"/>` : '');
  const frame = `<rect x="2.5" y="2.5" width="${S - 5}" height="${S - 5}" rx="12" fill="none" stroke="${C.ink}" stroke-width="2" opacity="0.55"/><rect x="7" y="7" width="${S - 14}" height="${S - 14}" rx="8" fill="none" stroke="${C.ink}" stroke-width="0.8" opacity="0.25"/>`;
  return svgDoc(S, S, back + body + frame, d + gl);
}

/** linear gradient across the local y axis (for blades / shafts drawn horizontally) */
function lg(stops: [number, string, number?][], vertical = true) {
  const g = id('lg');
  return {
    id: g,
    def: `<linearGradient id="${g}" x1="0" y1="0" x2="${vertical ? 0 : 1}" y2="${vertical ? 1 : 0}">${stops.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${a ?? 1}"/>`).join('')}</linearGradient>`,
  };
}

// ------------------------------------------------------------------ weapons
// Drawn horizontally (head to the right, x 0..100, axis y = 0) and rotated to the diagonal.
type WeaponSpec = {
  kind: 'jian' | 'dao' | 'ringdao' | 'glaive' | 'spear' | 'ji' | 'axe' | 'yue' | 'club' | 'meteor' | 'melon';
  blade?: string; // blade colour
  shaft?: string;
  tassel?: string;
  guard?: string;
  glow?: string;
  ribbons?: boolean;
  stars?: boolean;
  rings?: boolean;
  dragon?: string;
  twin?: boolean;
  wavy?: boolean;
  big?: boolean;
  triple?: boolean;
  wings?: boolean;
  feather?: boolean;
  moon?: boolean;
  scabbard?: string;
  tiger?: boolean;
};

// prettier-ignore
const WEAPONS: Record<string, WeaponSpec> = {
  wep001: { kind: 'ringdao' },
  wep002: { kind: 'spear', shaft: '#c8b07a' },
  wep003: { kind: 'axe', shaft: WOOD },
  wep004: { kind: 'jian', guard: BRONZE },
  wep005: { kind: 'spear', tassel: RED },
  wep006: { kind: 'glaive', big: true },
  wep007: { kind: 'ji' },
  wep008: { kind: 'jian', blade: '#a9c3d0', scabbard: '#1e1b1a' },
  wep009: { kind: 'spear', tiger: true, tassel: RED },
  wep010: { kind: 'glaive', feather: true },
  wep011: { kind: 'ji', twin: true },
  wep012: { kind: 'axe', big: true, shaft: WOOD },
  wep013: { kind: 'jian', blade: '#d6e6ea', guard: C.jade, glow: '#8fc6d8' },
  wep014: { kind: 'spear', tassel: '#f4f0e6' },
  wep015: { kind: 'glaive', feather: true },
  wep016: { kind: 'ji', moon: true },
  wep017: { kind: 'yue', blade: '#7b9a78' },
  wep018: { kind: 'jian', guard: GOLD, dragon: GOLD, blade: '#e3e8ea' },
  wep019: { kind: 'spear', wavy: true, tassel: RED },
  wep020: { kind: 'dao', rings: true, big: true },
  wep021: { kind: 'ji', dragon: '#4f8a6a' },
  wep022: { kind: 'club' },
  wep023: { kind: 'jian', blade: '#bfe3e6', glow: '#58c8c8', tassel: '#2f9a9a' },
  wep024: { kind: 'spear', big: true, shaft: '#1e1b1a', tassel: RED },
  wep025: { kind: 'glaive', big: true, wavy: true },
  wep026: { kind: 'ji', twin: true, tassel: RED, big: true },
  wep027: { kind: 'meteor' },
  wep028: { kind: 'jian', stars: true, guard: GOLD },
  wep029: { kind: 'spear', ribbons: true },
  wep030: { kind: 'glaive', big: true },
  wep031: { kind: 'ji', wings: true, blade: GOLD, glow: '#e8b84a' },
  wep032: { kind: 'melon' },
  wep033: { kind: 'jian', blade: '#dcd2f0', glow: '#9a6ad8', guard: '#5a3a8a' },
  wep034: { kind: 'spear', dragon: GOLD, tassel: RED },
  wep035: { kind: 'glaive', moon: true, blade: '#e8eef2', glow: '#b8d0e8' },
  wep036: { kind: 'ji', triple: true, shaft: RED, glow: '#f0d080', big: true },
  wep037: { kind: 'axe', big: true, blade: GOLD, glow: '#f0c050' },
  wep038: { kind: 'jian', blade: '#f3e2dc', glow: '#e04030', guard: GOLD, dragon: GOLD, tassel: RED },
  wep039: { kind: 'spear', shaft: '#1b1712', glow: '#e8f0ff', tiger: true },
  wep040: { kind: 'glaive', feather: true, ribbons: true, blade: '#eef2f2' },
  wep041: { kind: 'ji', twin: true, big: true, shaft: '#1b1712', blade: '#5b6066', guard: GOLD, glow: '#d8a040' },
};

function steel(spec: WeaponSpec) {
  const base = spec.blade ?? STEEL;
  return lg([[0, mix(base, '#fff', 0.55)], [0.45, base], [0.55, mix(base, STEEL_D, 0.5)], [1, mix(base, '#000', 0.35)]]);
}

function tasselAt(x: number, col: string, r: Rng, n = 7) {
  let s = '';
  for (let i = 0; i < n; i++) {
    const a: Pt = [x, 0];
    const len = r.range(10, 16);
    const b: Pt = [x - len * 0.75, (i - n / 2) * 1.8 + r.range(-1, 1)];
    s += `<path d="${brush([a, [(a[0] + b[0]) / 2, b[1] * 0.6], b], 2.4, r, { taperIn: 0.1, taperOut: 0.6 })}" fill="${col}" stroke="${mix(col, '#000', 0.4)}" stroke-width="0.3"/>`;
  }
  return s + `<rect x="${x - 1}" y="-2.4" width="3" height="4.8" rx="1" fill="${GOLD}" stroke="${OUT}" stroke-width="0.6"/>`;
}

function shaft(x0: number, x1: number, col: string, th = 3.2) {
  const g = lg([[0, mix(col, '#fff', 0.35)], [0.5, col], [1, mix(col, '#000', 0.45)]]);
  return { def: g.def, s: `<rect x="${x0}" y="${-th / 2}" width="${x1 - x0}" height="${th}" rx="${th / 2}" fill="url(#${g.id})" stroke="${OUT}" stroke-width="0.8"/><rect x="${x0 + 1}" y="${-th / 2 + 0.6}" width="3" height="${th - 1.2}" fill="${mix(col, '#000', 0.5)}"/>` };
}

function weapon(spec: WeaponSpec, r: Rng): { body: string; defs: string; glow?: string } {
  let defs = '';
  let s = '';
  const st = steel(spec);
  defs += st.def;
  const blade = `url(#${st.id})`;
  const add = (o: { def: string; s: string }) => ((defs += o.def), (s += o.s));
  const glowF = spec.glow ? id('wg') : '';
  if (spec.glow) defs += `<filter id="${glowF}" x="-30%" y="-80%" width="160%" height="260%"><feGaussianBlur stdDeviation="2.6"/></filter>`;
  const glowPath = (d: string) => (spec.glow ? `<path d="${d}" fill="${spec.glow}" stroke="${spec.glow}" stroke-width="4" filter="url(#${glowF})" opacity="0.9"/>` : '');
  const k = spec.kind;
  if (k === 'jian') {
    // grip -10..14, guard 14..18, blade 18..96
    if (spec.scabbard) s += `<path d="M20,6 L88,6 L94,9 L88,12 L20,12Z" fill="${spec.scabbard}" stroke="${OUT}" stroke-width="0.8" transform="translate(-6,4)"/>` + `<rect x="30" y="9.5" width="4" height="7" fill="${GOLD}" opacity="0.8"/>`;
    const d = 'M18,-3.6 L90,-3 L98,0 L90,3 L18,3.6Z';
    s += glowPath(d);
    s += `<path d="${d}" fill="${blade}" stroke="${OUT}" stroke-width="0.9"/><path d="M19,0 L94,0" stroke="${mix(spec.blade ?? STEEL, '#000', 0.4)}" stroke-width="0.7"/>`;
    if (spec.stars) for (let i = 0; i < 7; i++) s += `<circle cx="${26 + i * 9.5}" cy="${(i % 3 === 1 ? -1.2 : 1) * (i > 3 ? 0.8 : 1.2)}" r="1.3" fill="${GOLD}" stroke="${OUT}" stroke-width="0.3"/>`;
    if (spec.dragon) s += `<path d="M20,-1.5 Q26,-3 30,0 T40,0" fill="none" stroke="${spec.dragon}" stroke-width="1.1"/>`;
    const gc = spec.guard ?? BRONZE;
    s += `<path d="M13,-8 Q16,-4 18,-7 L18,7 Q16,4 13,8 Z" fill="${gc}" stroke="${OUT}" stroke-width="0.8"/>`;
    add(shaft(-8, 13, '#2e2520', 4.2));
    for (let x = -6; x < 12; x += 3) s += `<path d="M${x},-2.1 L${x + 1.6},2.1" stroke="#6d5a40" stroke-width="0.7"/>`;
    s += `<circle cx="-9" cy="0" r="3.2" fill="${gc}" stroke="${OUT}" stroke-width="0.8"/>`;
    if (spec.tassel) s += tasselAt(-11, spec.tassel, r);
    return { body: s, defs, glow: spec.glow };
  }
  if (k === 'dao' || k === 'ringdao') {
    const big = spec.big ? 1.6 : 1;
    const d = `M16,${-3 * big} L84,${-4 * big} Q96,${-4 * big} 99,${-9 * big} Q96,${5 * big} 84,${5 * big} L16,${4 * big}Z`;
    s += glowPath(d);
    s += `<path d="${d}" fill="${blade}" stroke="${OUT}" stroke-width="0.9"/><path d="M16,${-3 * big} L84,${-4 * big}" stroke="${OUT}" stroke-width="${1.4 * big}"/>`;
    if (spec.rings) for (let i = 0; i < 9; i++) s += `<circle cx="${24 + i * 7}" cy="${-4.6 * big - 1.6}" r="2.2" fill="none" stroke="${GOLD}" stroke-width="1"/>`;
    s += `<rect x="12" y="${-6 * big}" width="4" height="${12 * big}" rx="1" fill="${BRONZE}" stroke="${OUT}" stroke-width="0.8"/>`;
    add(shaft(-6, 12, '#3a2a1e', 4));
    if (k === 'ringdao') s += `<circle cx="-10" cy="0" r="4.4" fill="none" stroke="${STEEL_D}" stroke-width="2"/><circle cx="-10" cy="0" r="4.4" fill="none" stroke="${OUT}" stroke-width="0.5"/>`;
    return { body: s, defs, glow: spec.glow };
  }
  // pole arms: shaft along -14..72, head beyond
  const shCol = spec.shaft ?? '#5b3a20';
  const len0 = -16, len1 = spec.kind === 'axe' || spec.kind === 'yue' || spec.kind === 'club' || spec.kind === 'melon' || spec.kind === 'meteor' ? 64 : 74;
  if (k !== 'meteor') add(shaft(len0, len1, shCol, spec.big ? 4 : 3.4));
  if (spec.dragon) {
    let d = 'M20,0';
    for (let x = 24; x < 66; x += 8) d += ` Q${x},${x % 16 ? -6 : 6} ${x + 4},0`;
    s += `<path d="${d}" fill="none" stroke="${OUT}" stroke-width="3.2"/><path d="${d}" fill="none" stroke="${spec.dragon}" stroke-width="2"/><circle cx="64" cy="-2" r="2.6" fill="${spec.dragon}" stroke="${OUT}" stroke-width="0.6"/>`;
  }
  if (k === 'spear') {
    const L = spec.big ? 1.25 : 1;
    let d = `M70,-4 Q${80 * L},-6.5 ${100},0 Q${80 * L},6.5 70,4Z`;
    if (spec.wavy) d = 'M70,-3 Q76,-7 80,-3 Q85,1 89,-3 Q94,-5 100,0 Q94,5 89,3 Q85,-1 80,3 Q76,7 70,3Z';
    s += glowPath(d) + `<path d="${d}" fill="${blade}" stroke="${OUT}" stroke-width="0.9"/><path d="M72,0 L96,0" stroke="${STEEL_D}" stroke-width="0.6"/>`;
    s += `<rect x="66" y="-3" width="5" height="6" rx="1" fill="${spec.tiger ? GOLD : '#4a4038'}" stroke="${OUT}" stroke-width="0.7"/>`;
    if (spec.tiger) s += `<path d="M64,-4.5 L71,-3 L71,3 L64,4.5Z" fill="${BRONZE}" stroke="${OUT}" stroke-width="0.7"/><circle cx="67" cy="-1.2" r="0.8" fill="${OUT}"/>`;
    if (spec.tassel) s += tasselAt(65, spec.tassel, r, 9);
    if (spec.ribbons) {
      for (let i = 0; i < 3; i++) s += `<path d="${brush([[64, 0], [50, -6 + i * 5], [36, -10 + i * 8 + r.range(-2, 2)], [22, -6 + i * 7]], 2.4, r, { taperIn: 0.05, taperOut: 0.7 })}" fill="#f6f2e8" stroke="${C.inkWash}" stroke-width="0.4"/>`;
    }
    if (spec.glow) s += `<circle cx="99" cy="0" r="2.2" fill="#fff"/><path d="M99,-6 L99,6 M93,0 L105,0" stroke="#fff" stroke-width="0.8"/>`;
    s += `<path d="M-16,-1.6 L-20,0 L-16,1.6Z" fill="${STEEL_D}" stroke="${OUT}" stroke-width="0.6"/>`;
    return { body: s, defs, glow: spec.glow };
  }
  if (k === 'glaive') {
    const B = spec.big ? 1.25 : 1;
    let d = `M70,-2.6 L94,-4 Q102,-8 101,-14 Q${108},${2} 96,${7 * B} L70,${5 * B}Z`;
    if (spec.feather) d = 'M70,-2.6 Q86,-3 96,-8 Q102,-12 103,-16 Q104,-2 94,5 Q82,6 70,4.6Z';
    if (spec.moon) d = 'M70,-3 Q90,-2 100,-16 Q104,0 92,8 Q80,8 70,5Z';
    s += glowPath(d) + `<path d="${d}" fill="${blade}" stroke="${OUT}" stroke-width="0.9"/>`;
    if (spec.wavy) s += `<path d="M74,1 Q78,-1 82,1 T90,1 T98,-2" fill="none" stroke="${STEEL_D}" stroke-width="0.8"/>`;
    if (spec.big && !spec.wavy) s += `<path d="M78,1 L84,-5 L90,1 L86,1 L84,-1 L82,1Z" fill="${STEEL_D}" opacity="0.7"/>`;
    s += `<path d="M66,-5.5 Q69,-2 70,-5.5 L70,6 Q69,3 66,6Z" fill="${GOLD}" stroke="${OUT}" stroke-width="0.7"/>`;
    s += `<path d="M86,-1 Q91,-5 94,-2" fill="none" stroke="${OUT}" stroke-width="0.6" opacity="0.6"/>`;
    if (spec.ribbons) s += `<path d="${brush([[66, 0], [56, 6], [44, 2], [32, 8]], 2.6, r, { taperIn: 0.05, taperOut: 0.7 })}" fill="${RED}"/>`;
    return { body: s, defs, glow: spec.glow };
  }
  if (k === 'ji') {
    const tipD = 'M74,-3 Q86,-4 100,0 Q86,4 74,3Z';
    const crescent = (up: number, sc = 1) => `M70,${-3 * up} Q${70},${-16 * sc * up} ${82},${-19 * sc * up} Q${74},${-14 * sc * up} ${77},${-3 * up}Z`;
    let d = tipD + crescent(1);
    if (spec.twin) d += crescent(-1);
    if (spec.moon) d = tipD + crescent(1, 1.35);
    if (spec.triple) d = tipD + crescent(1, 1.2) + crescent(-1, 1.2) + 'M60,-2 L66,-12 L68,-2Z';
    if (spec.wings) d = tipD + 'M66,-3 Q62,-18 80,-22 Q72,-16 78,-12 Q70,-12 76,-3Z M66,3 Q62,18 80,22 Q72,16 78,12 Q70,12 76,3Z';
    s += glowPath(d) + `<path d="${d}" fill="${blade}" stroke="${OUT}" stroke-width="0.9"/>`;
    s += `<rect x="66" y="-3.4" width="8" height="6.8" rx="1.2" fill="${spec.guard ?? '#4a4038'}" stroke="${OUT}" stroke-width="0.7"/>`;
    if (spec.tassel) s += tasselAt(63, spec.tassel, r, 9);
    return { body: s, defs, glow: spec.glow };
  }
  if (k === 'axe' || k === 'yue') {
    const B = spec.big ? 1.2 : 1;
    let d = `M58,-3 L70,-3 Q74,${-14 * B} ${84},${-18 * B} Q${90},0 ${84},${18 * B} Q74,${14 * B} 70,3 L58,3Z`;
    if (k === 'yue') d = 'M56,-4 L66,-4 Q70,-20 84,-20 Q96,0 84,20 Q70,20 66,4 L56,4Z';
    if (!spec.big && k === 'axe') d = 'M58,-3 L66,-3 Q70,-6 78,-10 Q82,0 78,10 Q70,6 66,3 L58,3Z';
    s += glowPath(d) + `<path d="${d}" fill="${k === 'yue' ? '#8aa486' : blade}" stroke="${OUT}" stroke-width="0.9"/>`;
    if (spec.big && k === 'axe') s += `<path d="M72,-6 Q78,-10 80,-4 Q76,-2 78,4 Q74,8 72,4" fill="none" stroke="${spec.blade === GOLD ? '#8a5a10' : STEEL_D}" stroke-width="0.9"/>`;
    if (spec.blade === GOLD) s += `<path d="M84,${-18 * B} Q90,0 84,${18 * B}" fill="none" stroke="#fff3c0" stroke-width="1.6"/>`;
    if (k === 'yue') s += `<circle cx="74" cy="0" r="4" fill="${C.paper}" stroke="${OUT}" stroke-width="0.8"/><path d="M80,-12 Q86,0 80,12" fill="none" stroke="#c9d8c0" stroke-width="1.5"/>`;
    s += `<path d="M58,-3 L52,-6 L52,6 L58,3Z" fill="${STEEL_D}" stroke="${OUT}" stroke-width="0.7"/>`;
    return { body: s, defs, glow: spec.glow };
  }
  if (k === 'club') {
    s += `<path d="M58,-5 Q80,-9 92,-6 Q98,0 92,6 Q80,9 58,5Z" fill="#5a3a20" stroke="${OUT}" stroke-width="0.9"/>`;
    for (let i = 0; i < 12; i++) {
      const x = 62 + (i % 6) * 5.5, side = i < 6 ? -1 : 1;
      s += `<path d="M${x - 1.4},${side * 5} L${x},${side * 10} L${x + 1.4},${side * 5}Z" fill="${STEEL}" stroke="${OUT}" stroke-width="0.5"/>`;
    }
    s += `<path d="M96,-1.5 L102,0 L96,1.5Z" fill="${STEEL}" stroke="${OUT}" stroke-width="0.5"/>`;
    return { body: s, defs };
  }
  if (k === 'melon') {
    const g = lg([[0, '#f0cf7a'], [0.5, BRONZE], [1, '#5a3a10']]);
    defs += g.def;
    s += `<ellipse cx="80" cy="0" rx="16" ry="13" fill="url(#${g.id})" stroke="${OUT}" stroke-width="1"/>`;
    for (const yy of [-8, 0, 8]) s += `<path d="M64.5,${yy * 0.4} Q80,${yy * 1.5} 95.5,${yy * 0.4}" fill="none" stroke="${OUT}" stroke-width="0.7" opacity="0.7"/>`;
    s += `<path d="M96,-2 L101,0 L96,2Z" fill="${BRONZE}" stroke="${OUT}" stroke-width="0.6"/>`;
    return { body: s, defs };
  }
  // meteor hammers: two balls on a chain
  const ball = (x: number, y: number, rr: number) => `<circle cx="${x}" cy="${y}" r="${rr}" fill="#4a4a50" stroke="${OUT}" stroke-width="1"/><circle cx="${x - rr * 0.35}" cy="${y - rr * 0.35}" r="${rr * 0.3}" fill="#9a9ca0"/>` +
    Array.from({ length: 6 }, (_, i) => { const a = (i / 6) * Math.PI * 2; return `<path d="M${f2(x + Math.cos(a) * rr)},${f2(y + Math.sin(a) * rr)} L${f2(x + Math.cos(a) * (rr + 4))},${f2(y + Math.sin(a) * (rr + 4))}" stroke="${OUT}" stroke-width="1.6"/>`; }).join('');
  let chain = '';
  for (let t = 0; t <= 1; t += 0.06) {
    const x = 6 + t * 74, y = Math.sin(t * Math.PI) * 18;
    chain += `<ellipse cx="${f2(x)}" cy="${f2(y)}" rx="2.4" ry="1.4" fill="none" stroke="#5a5a5a" stroke-width="0.9" transform="rotate(${f2(-30 + t * 60)} ${f2(x)} ${f2(y)})"/>`;
  }
  s += chain + ball(0, 0, 9) + ball(86, 0, 11);
  return { body: s, defs };
}

// ------------------------------------------------------------------ horses
type HorseSpec = { coat: string; mane: string; spots?: string; dapple?: boolean; horns?: boolean; flame?: boolean; blaze?: boolean; glow?: string; tuft?: boolean };
// prettier-ignore
const HORSES: Record<string, HorseSpec> = {
  hor001: { coat: '#8a6a4a', mane: '#3a2a1c', tuft: true },
  hor002: { coat: '#8f99a0', mane: '#2a2a2e', dapple: true },
  hor003: { coat: '#d8a940', mane: '#efe0b0', spots: '#fff6dc' },
  hor004: { coat: '#9a3d22', mane: '#1b1712' },
  hor005: { coat: '#24201e', mane: '#0c0a09', glow: '#8a7aa0' },
  hor006: { coat: '#f1ece2', mane: '#ffffff', blaze: false },
  hor007: { coat: '#b8742a', mane: '#6a3a14', glow: '#f0c070' },
  hor008: { coat: '#2a2624', mane: '#0c0a09', blaze: true },
  hor009: { coat: '#7a2e3c', mane: '#3a0e1a' },
  hor010: { coat: '#7a4a2a', mane: '#1b1712', tuft: true },
  hor011: { coat: '#d23a24', mane: '#ff8a3a', flame: true, glow: '#ff7040' },
  hor012: { coat: '#e2b23a', mane: '#ff9a2a', flame: true, horns: true, glow: '#ffd060' },
  hor013: { coat: '#a2482a', mane: '#14100e' },
  hor014: { coat: '#e8cf8a', mane: '#fff8e8', flame: true, glow: '#fff0a0' },
};

function horseHead(h: HorseSpec, r: Rng) {
  const g = lg([[0, mix(h.coat, '#fff', 0.25)], [0.6, h.coat], [1, mix(h.coat, '#000', 0.4)]], false);
  let defs = g.def;
  // head facing left, neck descending to bottom-right
  const head = 'M30,34 Q36,22 50,18 Q56,10 60,14 Q66,10 66,18 Q80,22 88,40 Q96,60 92,98 L50,98 Q54,78 50,66 Q44,62 36,64 Q24,66 18,60 Q14,54 18,48 Q22,40 30,34Z';
  let s = `<path d="${head}" fill="url(#${g.id})"/>`;
  // shading on the cheek / jaw
  s += `<path d="M40,46 Q52,44 58,52 Q56,62 46,64" fill="${mix(h.coat, '#000', 0.5)}" opacity="0.25"/>`;
  if (h.dapple) for (let i = 0; i < 16; i++) s += `<circle cx="${f2(r.range(46, 88))}" cy="${f2(r.range(40, 94))}" r="${f2(r.range(2, 4))}" fill="#e8ecee" opacity="0.45"/>`;
  if (h.spots) for (let i = 0; i < 18; i++) s += `<circle cx="${f2(r.range(40, 88))}" cy="${f2(r.range(36, 94))}" r="${f2(r.range(1, 1.8))}" fill="${h.spots}" opacity="0.85"/>`;
  if (h.blaze) s += `<path d="M48,24 Q42,36 30,40 Q28,46 24,52 Q32,48 36,40 Q46,34 52,24Z" fill="#f6f2e8"/>`;
  // mane along the back of the neck
  let mane = '';
  const mn = h.flame ? 9 : 7;
  for (let i = 0; i < mn; i++) {
    const t = i / (mn - 1);
    const a: Pt = [64 + t * 20, 16 + t * 74];
    const len = h.flame ? r.range(14, 22) : r.range(9, 14);
    const b: Pt = [a[0] + len, a[1] - len * (h.flame ? 0.6 : 0.2)];
    mane += `<path d="${brush([a, [(a[0] + b[0]) / 2 + 2, (a[1] + b[1]) / 2 + 3], b], h.flame ? 6 : 5, r, { taperIn: 0.15, taperOut: 0.7 })}" fill="${h.mane}"/>`;
  }
  if (h.tuft) mane += `<path d="${brush([[56, 14], [50, 20], [46, 26]], 5, r)}" fill="${h.mane}"/>`;
  s = mane + s;
  // forelock
  s += `<path d="${brush([[60, 14], [54, 22], [50, 28]], 4.5, r, { taperOut: 0.7 })}" fill="${h.mane}"/>`;
  // ink contour
  s += `<path d="${brush([[18, 52], [22, 42], [30, 34], [40, 24], [50, 18]], 2.6, r, { taperIn: 0.1, taperOut: 0.2 })}" fill="${OUT}"/>`;
  s += `<path d="${brush([[18, 58], [26, 64], [38, 64], [48, 66], [52, 78], [50, 98]], 2.4, r, { taperIn: 0.1, taperOut: 0.1 })}" fill="${OUT}"/>`;
  s += `<path d="${brush([[66, 18], [80, 26], [88, 42], [94, 64], [92, 98]], 2.2, r, { taperIn: 0.2, taperOut: 0.1 })}" fill="${OUT}" opacity="0.9"/>`;
  // ears
  s += `<path d="M52,20 L52,6 L60,16Z" fill="${h.coat}" stroke="${OUT}" stroke-width="1.6" stroke-linejoin="round"/><path d="M60,16 L64,4 L67,18Z" fill="${mix(h.coat, '#000', 0.2)}" stroke="${OUT}" stroke-width="1.6" stroke-linejoin="round"/>`;
  if (h.horns) s += `<path d="M54,10 Q50,0 56,-2 Q54,4 58,10Z M62,8 Q62,-2 68,-2 Q64,4 66,10Z" fill="${GOLD}" stroke="${OUT}" stroke-width="1" transform="translate(0,6)"/>`;
  // eye, nostril, mouth
  s += `<path d="M44,32 Q48,28 52,32 Q48,35 44,32Z" fill="${OUT}"/><circle cx="49" cy="31.4" r="0.9" fill="#fff"/>`;
  s += `<path d="M23,48 Q26,46 27,50" fill="none" stroke="${OUT}" stroke-width="1.6"/><path d="M17,57 Q22,60 28,58" fill="none" stroke="${OUT}" stroke-width="1.2"/>`;
  // bridle (red cord, gold boss)
  s += `<path d="M34,36 Q44,44 52,40 M52,40 Q56,30 58,20 M30,54 Q40,52 52,40" fill="none" stroke="${RED}" stroke-width="2.2"/><circle cx="52" cy="40" r="2.4" fill="${GOLD}" stroke="${OUT}" stroke-width="0.7"/>`;
  return { body: s, defs, glow: h.glow };
}

// ------------------------------------------------------------------ books & scrolls
function bambooBundle(cord: string, r: Rng, tag?: string, gold = false) {
  let s = `<g transform="translate(56 58) rotate(-18)">`;
  // rolled slips: a cylinder seen from the side with slip lines
  s += `<rect x="-36" y="-16" width="72" height="32" rx="8" fill="#c9a86a" stroke="${OUT}" stroke-width="1.4"/>`;
  for (let i = -30; i <= 30; i += 4.6) s += `<path d="M${f2(i)},-15 Q${f2(i + 1.2)},0 ${f2(i)},15" fill="none" stroke="#8a6a3a" stroke-width="0.9"/>`;
  s += `<ellipse cx="36" cy="0" rx="6" ry="16" fill="#e0c48a" stroke="${OUT}" stroke-width="1.2"/>`;
  for (let k = 3; k < 16; k += 3.2) s += `<ellipse cx="36" cy="0" rx="${f2(k * 0.36)}" ry="${f2(k)}" fill="none" stroke="#9a7a4a" stroke-width="0.6"/>`;
  for (const x of [-18, 12]) s += `<path d="M${x},-17 Q${x + 3},0 ${x},17" fill="none" stroke="${gold ? GOLD : cord}" stroke-width="3"/>`;
  s += `<path d="${brush([[-18, 17], [-22, 26], [-28, 30]], 2.6, r)}" fill="${gold ? GOLD : cord}"/>`;
  if (tag) s += `<rect x="-6" y="-24" width="10" height="16" fill="${tag}" stroke="${OUT}" stroke-width="0.8"/><path d="M-1,-21 L-1,-11" stroke="${C.paper}" stroke-width="1.2"/>`;
  if (gold) s += `<rect x="-34" y="10" width="9" height="9" fill="${C.cinnabar}" transform="rotate(10 -30 14)"/>`;
  return s + `</g>`;
}

function threadBook(cover: string, x: number, y: number, rot: number, mark = '', label = C.paper) {
  let s = `<g transform="translate(${x} ${y}) rotate(${rot})">`;
  s += `<rect x="-26" y="-34" width="52" height="68" rx="2" fill="${C.paper}" stroke="${OUT}" stroke-width="1"/>`;
  s += `<rect x="-28" y="-36" width="52" height="68" rx="2" fill="${cover}" stroke="${OUT}" stroke-width="1.3"/>`;
  for (let i = -30; i <= 26; i += 9) s += `<circle cx="-23" cy="${i}" r="0.9" fill="${C.paper}"/><path d="M-28,${i} L-23,${i}" stroke="${C.paper}" stroke-width="0.8"/>`;
  s += `<rect x="4" y="-31" width="12" height="38" fill="${label}" stroke="${OUT}" stroke-width="0.7"/>`;
  s += `<path d="M10,-27 L10,2" stroke="${OUT}" stroke-width="1.4" stroke-dasharray="5 2.5"/>`;
  return s + mark + `</g>`;
}

function silkScroll(content: string, r: Rng) {
  let s = `<g transform="translate(56 56) rotate(-8)">`;
  s += `<rect x="-38" y="-26" width="76" height="52" fill="#efe6cf" stroke="${OUT}" stroke-width="1.1"/>`;
  s += `<rect x="-38" y="-26" width="76" height="6" fill="#7a4a2a" opacity="0.6"/>`;
  s += content;
  for (const x of [-42, 42]) s += `<rect x="${x - 3.5}" y="-30" width="7" height="60" rx="3" fill="${WOOD}" stroke="${OUT}" stroke-width="1"/><rect x="${x - 2}" y="-34" width="4" height="4" fill="${GOLD}"/><rect x="${x - 2}" y="30" width="4" height="4" fill="${GOLD}"/>`;
  void r;
  return s + `</g>`;
}

// ------------------------------------------------------------------ treasures & herbs
function ginseng(x: number, y: number, s: number, r: Rng, giant = false) {
  let g = `<g transform="translate(${x} ${y}) scale(${s})">`;
  // leaves on top
  for (const [a, b] of [[-14, -40], [0, -46], [14, -40]] as const) {
    g += `<path d="M0,-22 Q${a * 0.5},${b * 0.7} ${a},${b} Q${a * 1.2},${b * 0.8} 0,-22" fill="${C.malachite}" stroke="${OUT}" stroke-width="0.9"/>`;
  }
  g += `<circle cx="0" cy="-50" r="3" fill="${RED}"/><circle cx="4" cy="-48" r="2.4" fill="${RED}"/><path d="M0,-22 L0,-47" stroke="#4a6a3a" stroke-width="1.2"/>`;
  // root body (human-like when giant)
  const body = giant
    ? 'M-6,-22 Q-12,-10 -10,4 Q-18,14 -22,30 Q-14,24 -8,14 Q-8,26 -12,40 Q-4,32 -2,20 Q2,32 6,40 Q6,26 6,14 Q14,24 22,30 Q16,14 10,4 Q12,-10 6,-22Z'
    : 'M-5,-22 Q-9,-6 -6,8 Q-10,20 -16,30 Q-6,22 -2,12 Q0,26 2,36 Q4,22 4,10 Q10,18 16,24 Q10,10 6,4 Q8,-8 5,-22Z';
  g += `<path d="${body}" fill="#e6c89a" stroke="${OUT}" stroke-width="1.2"/>`;
  for (let i = -16; i < 16; i += 5) g += `<path d="M-6,${i} Q0,${i + 1.6} 6,${i}" fill="none" stroke="#a07a4a" stroke-width="0.7"/>`;
  for (let i = 0; i < 8; i++) {
    const a: Pt = [r.range(-14, 14), r.range(10, 34)];
    g += `<path d="M${f2(a[0])},${f2(a[1])} q${f2(r.range(-8, 8))},${f2(r.range(4, 10))} ${f2(r.range(-10, 10))},${f2(r.range(8, 14))}" fill="none" stroke="#a07a4a" stroke-width="0.6"/>`;
  }
  if (giant) g += `<path d="M-8,-4 Q0,0 8,-4" stroke="${RED}" stroke-width="2.4" fill="none"/><path d="M-6,-14 L-2,-14 M2,-14 L6,-14" stroke="${OUT}" stroke-width="1"/>`;
  return g + `</g>`;
}

function lingzhi(cap: string, rim: string, r: Rng, cloud = false) {
  let s = `<path d="M54,96 Q50,76 56,58" fill="none" stroke="${mix(cap, '#000', 0.4)}" stroke-width="6" stroke-linecap="round"/>`;
  const mk = (cx: number, cy: number, rx: number, ry: number) => {
    let d = `M${cx - rx},${cy} Q${cx - rx},${cy - ry * 1.6} ${cx},${cy - ry * 1.4} Q${cx + rx},${cy - ry * 1.6} ${cx + rx},${cy} Q${cx},${cy + ry * 0.6} ${cx - rx},${cy}Z`;
    if (cloud) d = `M${cx - rx},${cy} Q${cx - rx * 1.1},${cy - ry} ${cx - rx * 0.5},${cy - ry * 1.2} Q${cx - rx * 0.3},${cy - ry * 1.9} ${cx},${cy - ry * 1.4} Q${cx + rx * 0.4},${cy - ry * 1.9} ${cx + rx * 0.6},${cy - ry * 1.1} Q${cx + rx * 1.15},${cy - ry * 0.9} ${cx + rx},${cy} Q${cx},${cy + ry * 0.6} ${cx - rx},${cy}Z`;
    let o = `<path d="${d}" fill="${cap}" stroke="${OUT}" stroke-width="1.3"/>`;
    for (let k = 1; k <= 3; k++) o += `<path d="M${cx - rx * (1 - k * 0.2)},${cy - ry * 0.1 * k} Q${cx},${cy - ry * (0.2 + k * 0.25)} ${cx + rx * (1 - k * 0.2)},${cy - ry * 0.1 * k}" fill="none" stroke="${rim}" stroke-width="1" opacity="0.7"/>`;
    return o + `<path d="M${cx - rx},${cy} Q${cx},${cy + ry * 0.6} ${cx + rx},${cy}" fill="none" stroke="${rim}" stroke-width="2.4"/>`;
  };
  s += mk(58, 58, 30, 18) + `<path d="M44,78 Q36,72 30,74" fill="none" stroke="${mix(cap, '#000', 0.4)}" stroke-width="4"/>` + mk(30, 76, 14, 8);
  s += `<path d="${blob(56, 98, 26, 5, r, 0.2)}" fill="${C.malachite}" opacity="0.6"/>`;
  return s;
}

function treasure(name: string, r: Rng): { body: string; defs: string; glow?: string } {
  let defs = '';
  switch (name) {
    case 'a01': {
      // tiger tally: crouching tiger in bronze, split line, inscription
      const g = lg([[0, '#e2b860'], [0.5, BRONZE], [1, '#5a3a10']]);
      defs += g.def;
      const tiger = 'M16,70 Q18,58 30,56 Q34,46 44,48 L72,48 Q82,40 90,46 Q98,48 96,58 Q100,64 94,68 L92,78 L84,78 L82,70 L44,70 L42,78 L34,78 L32,70 Q24,74 16,70Z';
      let s = `<path d="${tiger}" fill="url(#${g.id})" stroke="${OUT}" stroke-width="1.6"/>`;
      s += `<path d="M30,56 Q20,44 14,50" fill="none" stroke="${OUT}" stroke-width="3" stroke-linecap="round"/>`;
      s += `<path d="M56,48 L56,70" stroke="${OUT}" stroke-width="1.2" stroke-dasharray="3 2"/>`;
      for (const x of [40, 48, 66, 74]) s += `<path d="M${x},52 Q${x + 2},58 ${x},64" fill="none" stroke="#3a2008" stroke-width="1.6"/>`;
      s += `<circle cx="90" cy="52" r="1.6" fill="${OUT}"/><path d="M84,44 L86,38 L90,44" fill="url(#${g.id})" stroke="${OUT}" stroke-width="1"/>`;
      s += `<text x="56" y="92" font-size="12" text-anchor="middle" fill="${C.cinnabar}" font-family="'Baoli SC','STLiti','Kaiti SC','AR PL UKai CN',serif">兵符</text>`;
      return { body: s, defs };
    }
    case 'b01': {
      let c = '';
      const pts: Pt[] = [[-24, -10], [-12, -12], [0, -14], [12, -12], [24, -10], [-18, 4], [-6, 2], [6, 2], [18, 4], [0, 16]];
      c += `<path d="M-24,-10 L0,-14 L24,-10 M-18,4 L18,4 M-24,-10 L-18,4 L0,16 L18,4 L24,-10" fill="none" stroke="${C.inkWash}" stroke-width="0.9" stroke-dasharray="2 2"/>`;
      pts.forEach(([x, y], i) => (c += `<circle cx="${x}" cy="${y}" r="2.6" fill="${i % 3 === 0 ? C.cinnabar : OUT}"/>`));
      c += `<path d="M28,14 L34,8 M28,8 L34,14" stroke="${C.cinnabar}" stroke-width="1.6"/>`;
      return { body: silkScroll(c, r), defs };
    }
    case 'c05': {
      // folded brocade bolt
      const p = id('pat');
      defs += `<pattern id="${p}" width="10" height="10" patternUnits="userSpaceOnUse"><rect width="10" height="10" fill="${C.rouge}"/><path d="M5,1 L9,5 L5,9 L1,5Z" fill="none" stroke="${GOLD}" stroke-width="1.2"/><circle cx="5" cy="5" r="1.2" fill="${GOLD}"/></pattern>`;
      let s = '';
      for (let i = 0; i < 3; i++) s += `<path d="M${20 + i * 4},${70 - i * 14} L${88 - i * 2},${60 - i * 14} L${92 - i * 2},${72 - i * 14} L${24 + i * 4},${84 - i * 14}Z" fill="url(#${p})" stroke="${OUT}" stroke-width="1.2"/><path d="M${88 - i * 2},${60 - i * 14} Q${98 - i * 2},${66 - i * 14} ${92 - i * 2},${72 - i * 14}" fill="${mix(C.rouge, '#000', 0.3)}" stroke="${OUT}" stroke-width="1"/>`;
      s += `<path d="M18,88 Q40,98 70,92" fill="none" stroke="${GOLD}" stroke-width="2"/>`;
      return { body: s, defs };
    }
    case 'c04': {
      const g = id('jade');
      defs += `<radialGradient id="${g}" cx="0.4" cy="0.35"><stop offset="0" stop-color="#eef6e8"/><stop offset="0.6" stop-color="#a9cdb0"/><stop offset="1" stop-color="#5f9a7a"/></radialGradient>`;
      let s = `<circle cx="56" cy="56" r="36" fill="url(#${g})" stroke="${OUT}" stroke-width="1.6"/><circle cx="56" cy="56" r="11" fill="#e8dcc0" stroke="${OUT}" stroke-width="1.4"/>`;
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        s += `<circle cx="${f2(56 + Math.cos(a) * 24)}" cy="${f2(56 + Math.sin(a) * 24)}" r="2.2" fill="none" stroke="#4f7f62" stroke-width="0.8"/>`;
      }
      s += `<path d="M30,40 Q38,28 52,24" fill="none" stroke="#fff" stroke-width="2" opacity="0.7"/>`;
      return { body: s, defs };
    }
    case 'c03': {
      const g = id('pearl');
      defs += `<radialGradient id="${g}" cx="0.38" cy="0.35"><stop offset="0" stop-color="#ffffff"/><stop offset="0.6" stop-color="#e8ecf0"/><stop offset="1" stop-color="#a9b4c4"/></radialGradient>`;
      let s = `<path d="M34,96 L78,96 L72,84 Q56,78 40,84Z" fill="${C.rouge}" stroke="${OUT}" stroke-width="1.2"/><path d="M40,84 Q56,90 72,84" fill="none" stroke="${GOLD}" stroke-width="1.5"/>`;
      s += `<circle cx="56" cy="56" r="24" fill="url(#${g})" stroke="${C.inkWash}" stroke-width="1"/><circle cx="48" cy="48" r="6" fill="#fff" opacity="0.9"/>`;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        s += `<path d="M${f2(56 + Math.cos(a) * 30)},${f2(56 + Math.sin(a) * 30)} L${f2(56 + Math.cos(a) * 40)},${f2(56 + Math.sin(a) * 40)}" stroke="#fff6c8" stroke-width="2" stroke-linecap="round" opacity="0.9"/>`;
      }
      return { body: s, defs, glow: '#fff3b0' };
    }
    case 'c02': {
      let s = `<path d="M14,58 L98,58 L92,92 L20,92Z" fill="#5a1e14" stroke="${OUT}" stroke-width="1.4"/><path d="M14,58 L28,40 L86,40 L98,58Z" fill="#7a2a1a" stroke="${OUT}" stroke-width="1.2"/>`;
      s += `<path d="M18,64 L94,64" stroke="${GOLD}" stroke-width="1.4"/>`;
      const cakes: Pt[] = [[34, 52], [52, 50], [70, 52], [42, 44], [62, 44]];
      for (const [x, y] of cakes) {
        const g = id('gold');
        defs += `<radialGradient id="${g}" cx="0.4" cy="0.35"><stop offset="0" stop-color="#fff0b0"/><stop offset="0.6" stop-color="${GOLD}"/><stop offset="1" stop-color="#8a5a10"/></radialGradient>`;
        s += `<ellipse cx="${x}" cy="${y}" rx="10" ry="6" fill="url(#${g})" stroke="${OUT}" stroke-width="1"/><ellipse cx="${x}" cy="${y - 1}" rx="5" ry="2.6" fill="none" stroke="#8a5a10" stroke-width="0.8"/>`;
      }
      return { body: s, defs, glow: '#ffe08a' };
    }
    case 'c01': {
      const g = lg([[0, '#e8c060'], [0.5, BRONZE], [1, '#4a3010']], false);
      defs += g.def;
      let s = `<path d="M40,98 L72,98 L66,88 L46,88Z" fill="url(#${g.id})" stroke="${OUT}" stroke-width="1.2"/><path d="M54,88 L54,80 L58,80 L58,88" fill="url(#${g.id})" stroke="${OUT}" stroke-width="1"/>`;
      s += `<path d="M34,70 Q34,82 56,82 Q78,82 78,70Z" fill="url(#${g.id})" stroke="${OUT}" stroke-width="1.2"/>`;
      // mountain-shaped lid
      s += `<path d="M34,70 L38,58 L44,62 L48,46 L54,54 L58,38 L64,52 L68,46 L72,60 L78,70Z" fill="url(#${g.id})" stroke="${OUT}" stroke-width="1.2" stroke-linejoin="round"/>`;
      s += `<path d="M40,74 Q56,78 72,74" fill="none" stroke="${GOLD}" stroke-width="1.6"/>`;
      for (let i = 0; i < 3; i++) s += `<path d="${brush([[50 + i * 6, 44 - i * 4], [44 + i * 8, 32], [56 + i * 4, 22], [48 + i * 8, 10]], 3, r, { taperIn: 0.2, taperOut: 0.8 })}" fill="${C.inkWash}" opacity="0.45"/>`;
      return { body: s, defs };
    }
    case 'g01':
      return { body: ginseng(56, 58, 0.95, r), defs };
    case 'g03':
      return { body: ginseng(56, 56, 1.05, r, true), defs, glow: '#f0d890' };
    case 'g02':
      return { body: lingzhi('#8a2e1e', '#d8a06a', r), defs };
    case 'g04':
      return { body: lingzhi('#6a3a8a', '#d0a8e8', r, true), defs, glow: '#c8a0f0' };
  }
  return { body: '', defs };
}

function book(name: string, r: Rng): { body: string; defs: string } {
  switch (name) {
    case 'book01': return { body: bambooBundle(RED, r), defs: '' };
    case 'book02': return { body: bambooBundle(C.indigo, r), defs: '' };
    case 'book03': return { body: bambooBundle('#7a4a2a', r, C.cinnabar) + bambooBundle('#7a4a2a', r).replace('translate(56 58)', 'translate(50 78) scale(0.7)'), defs: '' };
    case 'book04': {
      let s = `<path d="M10,78 L102,78 L94,92 L18,92Z" fill="#3a1410" stroke="${OUT}" stroke-width="1.2"/><path d="M18,82 L94,82" stroke="${GOLD}" stroke-width="1"/>`;
      const cols = ['#c8b07a', '#d8c08a', '#b89a6a'];
      for (let i = 0; i < 3; i++) s += `<g transform="translate(${30 + i * 26} ${66 - (i % 2) * 4})"><rect x="-12" y="-9" width="24" height="18" rx="9" fill="${cols[i]}" stroke="${OUT}" stroke-width="1"/><ellipse cx="12" cy="0" rx="4" ry="9" fill="#efe4c8" stroke="${OUT}" stroke-width="0.9"/><path d="M-2,-9 L-2,9" stroke="${RED}" stroke-width="2"/></g>`;
      return { body: s, defs: '' };
    }
    case 'book05': {
      let s = '';
      for (let i = 0; i < 6; i++) s += `<rect x="${22 + (i % 2) * 3}" y="${82 - i * 9}" width="66" height="9" fill="${i % 2 ? '#8a6a3a' : '#5a3a20'}" stroke="${OUT}" stroke-width="1"/><path d="M${26 + (i % 2) * 3},${86.5 - i * 9} L${84 + (i % 2) * 3},${86.5 - i * 9}" stroke="${C.paper}" stroke-width="0.6" opacity="0.6"/>`;
      s += `<rect x="40" y="24" width="30" height="12" fill="${C.paper}" stroke="${OUT}" stroke-width="0.8"/><path d="M48,30 Q55,24 62,30 Q55,34 48,30" fill="none" stroke="${OUT}" stroke-width="1.4"/><circle cx="51" cy="29" r="1" fill="${OUT}"/>`;
      return { body: s, defs: '' };
    }
    case 'book06': return { body: bambooBundle('#7a4a2a', r, undefined, true), defs: '' };
    case 'book07': return { body: threadBook(C.gamboge, 54, 56, -8, `<path d="${brush([[12, 30], [20, 22], [26, 12]], 3, r)}" fill="${C.malachite}"/><path d="M20,22 Q28,22 30,16 M18,26 Q12,20 14,14" fill="none" stroke="${C.malachite}" stroke-width="2.4"/>`), defs: '' };
    case 'book08': {
      let c = '';
      for (let i = 0; i < 6; i++) {
        const x = -26 + (i % 3) * 22, y = i < 3 ? -6 : 14;
        c += `<circle cx="${x}" cy="${y - 8}" r="2.4" fill="${OUT}"/><path d="M${x},${y - 6} L${x},${y + 2} M${x - 5},${y - 4 + (i % 2) * 3} L${x},${y - 3} L${x + 5},${y - 6 + (i % 3) * 3} M${x - 3},${y + 8} L${x},${y + 2} L${x + 4},${y + 8}" fill="none" stroke="${OUT}" stroke-width="1.4"/>`;
      }
      return { body: silkScroll(c, r), defs: '' };
    }
    case 'book09': return { body: threadBook(C.indigo, 56, 56, 6, `<circle cx="-9" cy="18" r="8" fill="${C.paper}" stroke="${OUT}" stroke-width="0.8"/><path d="M-9,10 A4,4 0 0 1 -9,18 A4,4 0 0 0 -9,26 A8,8 0 0 1 -9,10Z" fill="${OUT}"/><circle cx="-9" cy="14" r="1.2" fill="${C.paper}"/><circle cx="-9" cy="22" r="1.2" fill="${OUT}"/>`), defs: '' };
    case 'book10': {
      let s = bambooBundle('#7a4a2a', r).replace('translate(56 58) rotate(-18)', 'translate(44 50) rotate(-18) scale(0.8)');
      const g = lg([[0, '#c89a4a'], [1, '#4a3010']], false);
      s += `<path d="M62,80 Q62,98 80,98 Q98,98 98,80Z" fill="url(#${g.id})" stroke="${OUT}" stroke-width="1.2"/><rect x="60" y="76" width="40" height="5" fill="${BRONZE}" stroke="${OUT}" stroke-width="1"/><path d="M66,98 L64,104 M94,98 L96,104 M80,98 L80,104" stroke="${OUT}" stroke-width="2"/>`;
      s += `<path d="${brush([[76, 74], [72, 64], [80, 56], [74, 46]], 3, r, { taperOut: 0.8 })}" fill="${C.inkWash}" opacity="0.45"/>`;
      return { body: s, defs: g.def };
    }
  }
  return { body: bambooBundle(RED, r), defs: '' };
}

export function paintThing(job: FrameJob): PaintOut {
  const n = job.name;
  const r = rng('thing:' + n);
  let out: { body: string; defs: string; glow?: string };
  if (WEAPONS[n]) {
    const w = weapon(WEAPONS[n], r);
    // fit the 120-unit long weapon on the diagonal
    out = { body: `<g transform="translate(16 96) rotate(-45) scale(0.86 1.45) translate(4 0)">${w.body}</g>`, defs: w.defs, glow: w.glow };
  } else if (HORSES[n]) out = horseHead(HORSES[n], r);
  else if (/^book/.test(n)) out = book(n, r);
  else if (n === 'null') return { svg: svgDoc(1, 1, ''), w: 1, h: 1, ax: 0, ay: 0 };
  else out = treasure(n, r);
  return { svg: tile(out.body, out.defs, out.glow), w: S, h: S, ax: 0, ay: 0 };
}
