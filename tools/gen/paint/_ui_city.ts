// City icons for the strategy map (painted into ad/base/map) and their
// highlighted variants (ad/btn/city: active / ft / movable / relief).
// Small ink-drawn walled cities: grey-indigo tiled roofs, ochre rammed-earth
// walls, a dark gate arch; passes are a gate wall between two cliffs.
import { C, f2, mix } from '../ink.ts';

export type CitySize = 1 | 2 | 3 | 4;
/** Visual extent of the icon around the city point (for collision checks). */
export const ICON_SIZE: Record<CitySize, [number, number]> = { 1: [32, 27], 2: [27, 22], 3: [22, 18], 4: [18, 15] };

const WALL = '#d4bb8c';
const WALL_SH = '#a98a5c';
const ROOF = '#2c3138';
const ROOF_HI = '#4c5866';
const LINE = C.ink;

/** Curved Chinese roof (歇山) between x0..x1 with eaves at y, ridge at y-h. */
function roof(cx: number, y: number, hw: number, h: number, sw = 0.8) {
  const lift = h * 0.35;
  const d = `M${f2(cx - hw)},${f2(y - lift)} Q${f2(cx - hw * 0.72)},${f2(y + h * 0.05)} ${f2(cx - hw * 0.55)},${f2(y - h * 0.35)} L${f2(cx - hw * 0.42)},${f2(y - h)} L${f2(cx + hw * 0.42)},${f2(y - h)} L${f2(cx + hw * 0.55)},${f2(y - h * 0.35)} Q${f2(cx + hw * 0.72)},${f2(y + h * 0.05)} ${f2(cx + hw)},${f2(y - lift)} Q${f2(cx)},${f2(y + h * 0.18)} ${f2(cx - hw)},${f2(y - lift)}Z`;
  const tiles = `M${f2(cx - hw * 0.36)},${f2(y - h * 0.82)} L${f2(cx + hw * 0.36)},${f2(y - h * 0.82)}`;
  return `<path d="${d}" fill="${ROOF}" stroke="${LINE}" stroke-width="${sw}" stroke-linejoin="round"/><path d="${tiles}" stroke="${ROOF_HI}" stroke-width="${f2(sw * 0.9)}"/>`;
}

/** Crenellated wall face from x0..x1, top y0, bottom y1. */
function wall(x0: number, x1: number, y0: number, y1: number, merlon = 2.2) {
  let crenel = '';
  const n = Math.max(2, Math.round((x1 - x0) / (merlon * 2)));
  const step = (x1 - x0) / n;
  for (let i = 0; i < n; i++) crenel += `<rect x="${f2(x0 + i * step + step * 0.15)}" y="${f2(y0 - merlon * 0.8)}" width="${f2(step * 0.5)}" height="${f2(merlon * 0.8 + 0.4)}" fill="${WALL}" stroke="${LINE}" stroke-width="0.5"/>`;
  return `${crenel}<path d="M${f2(x0)},${f2(y0)} L${f2(x1)},${f2(y0)} L${f2(x1 + 0.6)},${f2(y1)} L${f2(x0 - 0.6)},${f2(y1)}Z" fill="${WALL}" stroke="${LINE}" stroke-width="0.85"/>
<path d="M${f2(x0)},${f2(y1 - (y1 - y0) * 0.32)} L${f2(x1)},${f2(y1 - (y1 - y0) * 0.32)}" stroke="${WALL_SH}" stroke-width="0.6" opacity="0.7"/>`;
}

function gate(cx: number, y1: number, w: number, h: number) {
  return `<path d="M${f2(cx - w / 2)},${f2(y1)} L${f2(cx - w / 2)},${f2(y1 - h + w / 2)} A${f2(w / 2)},${f2(w / 2)} 0 0 1 ${f2(cx + w / 2)},${f2(y1 - h + w / 2)} L${f2(cx + w / 2)},${f2(y1)}Z" fill="${C.ink}"/>`;
}

/** Tower block (gate house) with red pillars. */
function tower(cx: number, y0: number, y1: number, hw: number) {
  let p = `<rect x="${f2(cx - hw)}" y="${f2(y0)}" width="${f2(hw * 2)}" height="${f2(y1 - y0)}" fill="${mix(WALL, '#fff', 0.15)}" stroke="${LINE}" stroke-width="0.6"/>`;
  const n = hw > 5 ? 4 : 3;
  for (let i = 0; i < n; i++) {
    const x = cx - hw + 1 + ((hw * 2 - 2) * i) / (n - 1);
    p += `<path d="M${f2(x)},${f2(y0 + 0.4)} L${f2(x)},${f2(y1 - 0.2)}" stroke="${C.cinnabar}" stroke-width="0.9"/>`;
  }
  return p;
}

function shadow(cx: number, cy: number, rx: number) {
  return `<ellipse cx="${f2(cx)}" cy="${f2(cy)}" rx="${f2(rx)}" ry="${f2(rx * 0.28)}" fill="${C.ink}" opacity="0.28"/>`;
}

/** SVG of a city icon centred at (cx, cy). */
export function cityIcon(size: CitySize, cx: number, cy: number): string {
  if (size === 1) {
    const y1 = cy + 9, y0 = cy + 1;
    return shadow(cx, y1 + 0.5, 16) +
      // corner turrets
      `<rect x="${f2(cx - 15)}" y="${f2(cy - 2)}" width="5" height="${f2(y1 - cy + 2)}" fill="${WALL}" stroke="${LINE}" stroke-width="0.7"/>` +
      `<rect x="${f2(cx + 10)}" y="${f2(cy - 2)}" width="5" height="${f2(y1 - cy + 2)}" fill="${WALL}" stroke="${LINE}" stroke-width="0.7"/>` +
      roof(cx - 12.5, cy - 2, 4.2, 3.2, 0.6) + roof(cx + 12.5, cy - 2, 4.2, 3.2, 0.6) +
      wall(cx - 10, cx + 10, y0, y1) + gate(cx, y1, 4.2, 5.5) +
      tower(cx, cy - 4, y0, 6.5) + roof(cx, cy - 4, 10, 4.2) +
      tower(cx, cy - 8.6, cy - 5.4, 3.6) + roof(cx, cy - 8.4, 6.6, 3.8);
  }
  if (size === 2) {
    const y1 = cy + 7.5, y0 = cy;
    return shadow(cx, y1 + 0.5, 13.5) +
      `<rect x="${f2(cx - 12.5)}" y="${f2(cy - 2)}" width="4" height="${f2(y1 - cy + 2)}" fill="${WALL}" stroke="${LINE}" stroke-width="0.7"/>` +
      `<rect x="${f2(cx + 8.5)}" y="${f2(cy - 2)}" width="4" height="${f2(y1 - cy + 2)}" fill="${WALL}" stroke="${LINE}" stroke-width="0.7"/>` +
      roof(cx - 10.5, cy - 2, 3.4, 2.6, 0.55) + roof(cx + 10.5, cy - 2, 3.4, 2.6, 0.55) +
      wall(cx - 8.5, cx + 8.5, y0, y1) + gate(cx, y1, 3.8, 5) +
      tower(cx, cy - 4, y0, 5.2) + roof(cx, cy - 4, 8.5, 4.4);
  }
  if (size === 3) {
    const y1 = cy + 6.5, y0 = cy + 0.5;
    return shadow(cx, y1 + 0.5, 11) + wall(cx - 9, cx + 9, y0, y1, 2) + gate(cx, y1, 3.2, 4.2) +
      tower(cx, cy - 2.6, y0, 4) + roof(cx, cy - 2.6, 7, 3.8);
  }
  // pass: gate wall between two cliffs
  const y1 = cy + 5.5;
  const cliff = (s: number) =>
    `<path d="M${f2(cx + s * 9)},${f2(y1 + 0.5)} L${f2(cx + s * 8.6)},${f2(cy - 3)} Q${f2(cx + s * 7)},${f2(cy - 8)} ${f2(cx + s * 4.6)},${f2(cy - 6.5)} L${f2(cx + s * 4)},${f2(y1 + 0.5)}Z" fill="${mix(C.inkWash, C.paper, 0.15)}" stroke="${LINE}" stroke-width="0.8"/>` +
    `<path d="M${f2(cx + s * 6.5)},${f2(cy - 5.5)} Q${f2(cx + s * 7.3)},${f2(cy - 1)} ${f2(cx + s * 6.2)},${f2(y1 - 1)}" stroke="${LINE}" stroke-width="0.6" fill="none" opacity="0.7"/>`;
  return shadow(cx, y1 + 0.5, 9.5) + cliff(-1) + cliff(1) + wall(cx - 4.6, cx + 4.6, cy - 0.5, y1, 1.6) + gate(cx, y1, 2.8, 3.8) + roof(cx, cy - 2.4, 5.6, 3.2, 0.6);
}

export const MARK_COLORS = { active: '#ffe39a', ft: '#e2442c', movable: '#5fcbe8', relief: '#64d27e' } as const;

/** Highlighted city icon (pulse frame k = 1..3) as a standalone SVG doc. */
export function cityMark(size: CitySize, kind: keyof typeof MARK_COLORS, k: number) {
  const [iw, ih] = ICON_SIZE[size];
  const pad = 6;
  const w = iw + pad * 2, h = ih + pad * 2;
  const cx = w / 2, cy = h / 2;
  const col = MARK_COLORS[kind];
  const rad = [1.6, 2.2, 1.6][k - 1];
  const glow = [0.75, 1, 0.55][k - 1];
  const id = `m${size}${kind}${k}`;
  const defs = `<filter id="${id}" x="-30%" y="-30%" width="160%" height="160%">
<feMorphology in="SourceAlpha" operator="dilate" radius="${rad}" result="d"/>
<feGaussianBlur in="d" stdDeviation="${f2(rad * 0.9)}" result="b"/>
<feFlood flood-color="${col}" result="c"/>
<feComposite in="c" in2="b" operator="in" result="g"/>
<feComponentTransfer in="g" result="g2"><feFuncA type="linear" slope="${f2(1.6 * glow)}"/></feComponentTransfer>
<feComposite in="c" in2="d" operator="in" result="edge"/>
<feMerge><feMergeNode in="g2"/><feMergeNode in="edge"/><feMergeNode in="SourceGraphic"/></feMerge>
</filter>`;
  const lift = kind === 'active' ? `<g opacity="${f2(0.12 * glow)}">${cityIcon(size, cx, cy).replace(/fill="[^"]+"/g, 'fill="#fff"')}</g>` : '';
  const body = `<g filter="url(#${id})">${cityIcon(size, cx, cy)}</g>${lift}<rect width="1" height="1" fill-opacity="0.012"/><rect x="${w - 1}" y="${h - 1}" width="1" height="1" fill-opacity="0.012"/>`;
  return { w, h, defs, body };
}
