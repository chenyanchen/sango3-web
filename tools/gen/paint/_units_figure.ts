// Draws a solved skeleton as an ink-wash figure: bold ink contours, flat
// light pigment washes, a few calligraphic accents (plumes, beards, ribbons).
import { C, mix, type Rng } from '../ink.ts';
import { add, Canvas, catmull, dir, lerpV, mul, norm, perp, sub, type Dims, type Pose, type Skel, type V } from './_units_rig.ts';

export type Weapon =
  | 'spear' | 'glaive' | 'halberd' | 'axe' | 'sword' | 'twinblades' | 'fan' | 'club'
  | 'dao' | 'staff' | 'bow' | 'xbow' | 'lance' | 'hook' | 'none';
export type Helm = 'helmet' | 'crown' | 'guan' | 'band' | 'bun' | 'wild' | 'lion' | 'cap' | 'topknot' | 'rattan' | 'turban' | 'veil';

export interface Look {
  armor: string;
  armor2: string;
  cloth: string;
  trim: string;
  skin: string;
  boots: string;
  helm: Helm;
  helmColor: string;
  plume: 'pheasant' | 'tassel' | 'feather' | 'none';
  plumeColor: string;
  beard: 'none' | 'long' | 'tiger' | 'short' | 'goatee';
  cape: string | null;
  /** waist sash streamers (ribbons) */
  sash: string | null;
  female: boolean;
  bare: boolean;
  /** heavier armour plates on chest/shoulders */
  plates: boolean;
  weapon: Weapon;
  shield: { color: string; face: string; kind: 'round' | 'rect' | 'rattan' } | null;
  quiver: boolean;
  /** overall bulk multiplier for widths */
  bulk: number;
  /** hair colour */
  hair: string;
  beardColor?: string;
  /** eye patch */
  patch?: boolean;
}

const INK = C.ink;

/** Thick limb chain with ink contour. */
function limb(cv: Canvas, pts: V[], ws: number[], colors: string[], ol: number) {
  for (let i = 0; i < pts.length - 1; i++) cv.line([pts[i], pts[i + 1]], ws[i] + ol * 2, INK);
  for (let i = 0; i < pts.length - 1; i++) cv.line([pts[i], pts[i + 1]], ws[i], colors[i]);
}

// ------------------------------------------------------------------ weapons
export interface WeaponGeo {
  /** total length & length behind the grip (px at scale 1) */
  L: number;
  B: number;
}
export const WEAPON_GEO: Record<Weapon, WeaponGeo> = {
  spear: { L: 142, B: 48 },
  lance: { L: 150, B: 50 },
  glaive: { L: 138, B: 50 },
  halberd: { L: 146, B: 50 },
  axe: { L: 118, B: 44 },
  hook: { L: 120, B: 45 },
  staff: { L: 118, B: 54 },
  sword: { L: 44, B: 6 },
  twinblades: { L: 40, B: 6 },
  dao: { L: 40, B: 7 },
  club: { L: 62, B: 10 },
  fan: { L: 26, B: 4 },
  bow: { L: 0, B: 0 },
  xbow: { L: 0, B: 0 },
  none: { L: 0, B: 0 },
};

const STEEL = '#dfe3e2';
const STEEL2 = '#aab3b5';
const WOOD = '#5a2e1e';

/** Draws a weapon held at `hand` pointing along `wd` (world unit vector). */
export function drawWeapon(cv: Canvas, kind: Weapon, hand: V, wd: V, s: number, r: Rng, tassel: string = C.cinnabar, flip = 1) {
  const g = WEAPON_GEO[kind];
  if (!g.L) return;
  const n = mul(perp(wd), flip); // blade side
  const butt = add(hand, mul(wd, -g.B * s));
  const tip = add(hand, mul(wd, (g.L - g.B) * s));
  const at = (k: number): V => add(hand, mul(wd, (k - g.B) * s)); // k: distance from butt
  const shaft = (w = 2.4) => {
    cv.line([butt, tip], (w + 2.2) * s, INK);
    cv.line([butt, tip], w * s * 0.75, WOOD);
  };
  const blade = (pts: V[], fill = STEEL) => cv.shape(pts, fill, INK, 1.4 * s, false);
  switch (kind) {
    case 'spear':
    case 'lance': {
      const L = g.L, hb = kind === 'lance' ? 22 : 18;
      cv.line([butt, at(L - hb)], 4.4 * s, INK);
      cv.line([butt, at(L - hb)], 1.9 * s, WOOD);
      // tassel
      const tb = at(L - hb - 1);
      cv.brush([tb, add(tb, add(mul(wd, -9 * s), mul(n, 7 * s))), add(tb, add(mul(wd, -15 * s), mul(n, 4 * s)))], 6 * s, tassel, r);
      cv.brush([tb, add(tb, add(mul(wd, -12 * s), mul(n, -3 * s)))], 4 * s, tassel, r, 0.85);
      // leaf blade
      const b0 = at(L - hb), m = at(L - hb * 0.45);
      blade([b0, add(m, mul(n, 3.6 * s)), tip, add(m, mul(n, -3.6 * s))]);
      cv.line([b0, add(tip, mul(wd, -3 * s))], 0.9 * s, STEEL2);
      break;
    }
    case 'glaive': {
      const L = g.L;
      shaft();
      // 偃月 blade: broad crescent edge on the n+ side, notched spine
      const q = (k: number, o: number): V => add(at(L + k), mul(n, o * s));
      const edge = catmull([q(-34, 2), q(-26, 9), q(-12, 12.5), q(0, 9.5), q(7, 1.5)], 4);
      cv.shape([...edge, q(4, -2.2), q(-6, -3.4), q(-9, -1.2), q(-13, -1.4), q(-15, -4), q(-24, -2.6), q(-34, -1.6)], STEEL, INK, 1.4 * s, false);
      cv.curve([q(-30, 4), q(-17, 8.5), q(-5, 7.5)], 1 * s, STEEL2);
      // dragon-mouth collar + tassel
      cv.circle(at(L - 37), 3.4 * s, C.gold, INK, 1.2 * s);
      const tb = at(L - 39);
      cv.brush([tb, add(tb, add(mul(wd, -8 * s), mul(n, -8 * s))), add(tb, add(mul(wd, -16 * s), mul(n, -6 * s)))], 5 * s, tassel, r);
      // butt spike
      blade([add(butt, mul(n, 1.6 * s)), add(butt, mul(wd, -7 * s)), add(butt, mul(n, -1.6 * s))], STEEL2);
      break;
    }
    case 'halberd': {
      const L = g.L;
      shaft();
      const b0 = at(L - 20);
      blade([add(b0, mul(n, 2.4 * s)), add(at(L - 8), mul(n, 3 * s)), tip, add(at(L - 8), mul(n, -3 * s)), add(b0, mul(n, -2.4 * s))]);
      // crescent (月牙) on one side
      const c0 = at(L - 24), c1 = at(L - 14);
      blade([add(c0, mul(n, 2 * s)), add(at(L - 30), mul(n, 10 * s)), add(at(L - 22), mul(n, 14 * s)), add(at(L - 9), mul(n, 11 * s)), add(at(L - 16), mul(n, 8 * s)), add(c1, mul(n, 2 * s))]);
      cv.brush([at(L - 26), add(at(L - 36), mul(n, -7 * s)), add(at(L - 44), mul(n, -4 * s))], 4.5 * s, tassel, r);
      break;
    }
    case 'axe':
    case 'hook': {
      const L = g.L;
      shaft(2.8);
      if (kind === 'axe') {
        const q = (k: number, o: number): V => add(at(L + k), mul(n, o * s));
        const edge = catmull([q(-38, 13), q(-31, 20), q(-20, 23), q(-9, 21), q(-2, 13)], 4);
        cv.shape([q(-27, 2), q(-33, 8), ...edge, q(-8, 7), q(-11, 2)], STEEL, INK, 1.4 * s, false);
        cv.curve(catmull([q(-34, 14), q(-20, 19), q(-5, 15)], 3), 1 * s, STEEL2);
        cv.circle(q(-19, 6), 1.8 * s, INK);
        blade([q(-22, -2), q(-19, -9), q(-15, -2)], STEEL2);
        blade([q(-6, 2), tip, q(-6, -2)]);
      } else {
        blade([add(at(L - 16), mul(n, 2 * s)), add(at(L - 6), mul(n, 3 * s)), tip, add(at(L - 1), mul(n, -6 * s)), add(at(L - 12), mul(n, -2 * s))]);
      }
      break;
    }
    case 'staff': {
      shaft(2.6);
      cv.line([add(butt, mul(wd, 0)), add(butt, mul(wd, 8 * s))], 3.6 * s, C.gold);
      cv.line([add(tip, mul(wd, -8 * s)), tip], 3.6 * s, C.gold);
      break;
    }
    case 'sword':
    case 'twinblades': {
      const L = g.L;
      const gd = at(g.B + 1);
      cv.line([butt, gd], 4 * s, INK);
      cv.line([butt, gd], 2 * s, WOOD);
      blade([add(gd, mul(n, 2.2 * s)), add(at(L - 5), mul(n, 2 * s)), tip, add(at(L - 5), mul(n, -2 * s)), add(gd, mul(n, -2.2 * s))]);
      cv.line([gd, add(tip, mul(wd, -4 * s))], 0.8 * s, STEEL2);
      cv.line([add(gd, mul(n, 5 * s)), add(gd, mul(n, -5 * s))], 3 * s, INK);
      cv.line([add(gd, mul(n, 4 * s)), add(gd, mul(n, -4 * s))], 1.4 * s, C.gold);
      break;
    }
    case 'dao': {
      const L = g.L;
      const gd = at(g.B + 1);
      cv.line([butt, gd], 4.2 * s, INK);
      cv.line([butt, gd], 2.2 * s, WOOD);
      // broad single-edged sabre, curving to the back at the tip
      blade([add(gd, mul(n, 2.6 * s)), add(at(L * 0.6), mul(n, 4.2 * s)), add(at(L - 3), mul(n, 5.5 * s)), tip, add(at(L - 6), mul(n, -2 * s)), add(gd, mul(n, -2 * s))]);
      cv.line([add(gd, mul(n, 4.5 * s)), add(gd, mul(n, -4 * s))], 3.4 * s, INK);
      break;
    }
    case 'club': {
      const L = g.L;
      cv.line([butt, at(L - 14)], 5.2 * s, INK);
      cv.line([butt, at(L - 14)], 2.8 * s, WOOD);
      const c = at(L - 8);
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI * 2;
        const v: V = [Math.cos(a), Math.sin(a)];
        cv.line([c, add(c, mul(v, 12 * s))], 2.4 * s, INK);
      }
      cv.circle(c, 8.5 * s, '#6d6a62', INK, 1.6 * s);
      cv.circle(add(c, mul(n, -2 * s)), 3 * s, '#8e8a80');
      break;
    }
    case 'fan': {
      const gd = at(g.B + 6);
      cv.line([butt, gd], 3.6 * s, INK);
      cv.line([butt, gd], 1.8 * s, WOOD);
      const c = at(g.L - 6);
      const pts: V[] = [];
      for (let k = 0; k <= 8; k++) {
        const a = -0.95 + (k / 8) * 1.9;
        const v = add(mul(wd, Math.cos(a)), mul(n, Math.sin(a)));
        pts.push(add(gd, mul(v, (16 + (k % 2) * 1.5) * s)));
      }
      cv.shape([gd, ...pts], C.white, INK, 1.3 * s, false);
      for (let k = 1; k < 8; k += 2) cv.line([gd, lerpV(gd, pts[k], 0.9)], 0.7 * s, C.inkWash);
      void c;
      break;
    }
    default:
      break;
  }
}

/** Bow held at `hand`, facing `wd` (the arrow direction); `pull` = string hand. */
export function drawBow(cv: Canvas, hand: V, wd: V, s: number, pull: V | null, draw: number) {
  const n = perp(wd);
  const H = 30 * s;
  const bend = (6 + draw * 6) * s;
  const top = add(add(hand, mul(n, -H)), mul(wd, -bend * 0.6));
  const bot = add(add(hand, mul(n, H)), mul(wd, -bend * 0.6));
  const mt = add(add(hand, mul(n, -H * 0.55)), mul(wd, bend * 0.55));
  const mb = add(add(hand, mul(n, H * 0.55)), mul(wd, bend * 0.55));
  const sp = pull ?? add(hand, mul(wd, -bend * 0.6));
  cv.line([top, sp, bot], 0.9 * s, '#3b342b');
  cv.curve([top, mt, add(hand, mul(wd, bend * 0.8)), mb, bot], 4.4 * s, INK);
  cv.curve([top, mt, add(hand, mul(wd, bend * 0.8)), mb, bot], 2.2 * s, '#7a3a22');
  if (pull && draw > 0.25) {
    // arrow on the string
    const tip = add(hand, mul(wd, 12 * s));
    cv.line([pull, tip], 2.6 * s, INK);
    cv.line([pull, tip], 1 * s, '#b8a07a');
    cv.shape([add(tip, mul(n, 2 * s)), add(tip, mul(wd, 6 * s)), add(tip, mul(n, -2 * s))], STEEL, INK, 0.8 * s);
  }
}

/** Crossbow held with stock at `hand`, pointing along `wd`. */
export function drawXbow(cv: Canvas, hand: V, wd: V, s: number, loaded: boolean) {
  const n = perp(wd);
  const back = add(hand, mul(wd, -10 * s));
  const front = add(hand, mul(wd, 24 * s));
  cv.line([back, front], 6 * s, INK);
  cv.line([back, front], 3.4 * s, '#6e4128');
  const pr = add(hand, mul(wd, 18 * s));
  const l1 = add(add(pr, mul(n, -16 * s)), mul(wd, -5 * s)), l2 = add(add(pr, mul(n, 16 * s)), mul(wd, -5 * s));
  cv.curve([l1, add(pr, mul(wd, 3 * s)), l2], 4.2 * s, INK);
  cv.curve([l1, add(pr, mul(wd, 3 * s)), l2], 2 * s, '#7a3a22');
  const sp = loaded ? add(hand, mul(wd, 2 * s)) : add(pr, mul(wd, -3 * s));
  cv.line([l1, sp, l2], 0.9 * s, '#3b342b');
  if (loaded) cv.line([sp, add(front, mul(wd, 3 * s))], 1.6 * s, '#3b342b');
}

// ------------------------------------------------------------------ figure
export interface FigOpts {
  /** animation phase for flutter (0..1 per cycle-ish) */
  t: number;
  /** don't draw the far leg (rider on a mount: hidden behind the animal) */
  noFarLeg?: boolean;
  /** draw only the parts behind the mount / in front of it */
  layer?: 'all' | 'back' | 'front';
  /** blade side flip for the weapon (+1/-1) */
  bladeFlip?: number;
  /** dropped weapon position (mode 2) */
  dropped?: { at: V; dir: V } | null;
  /** strong motion: smear accent on the weapon */
  tassel?: string;
}

export function drawFigure(cv: Canvas, sk: Skel, p: Pose, L: Look, d: Dims, s: number, r: Rng, o: FigOpts) {
  const ol = d.ol * s * (0.9 + 0.1 * L.bulk);
  const bk = L.bulk;
  const shade = (c: string, k = 0.22) => mix(c, '#2a2520', k);
  const up = sk.up;
  const f: V = [-up[1], up[0]]; // torso forward
  const layer = o.layer ?? 'all';
  const back = layer !== 'front', front = layer !== 'back';
  const twoHand = !!p.g2 && p.mode === 0;
  const wind = p.wind;
  const tt = o.t * Math.PI * 2;

  // -------- behind the body
  if (back) {
    // cape
    if (L.cape) {
      const c0 = add(sk.N, add(mul(f, -3 * s), mul(up, -1 * s)));
      const c1 = add(sk.N, mul(f, -9 * s * bk));
      const upright = Math.cos((sk.rot * Math.PI) / 180) ** 2;
      const flow = norm(add(mul(f, (-0.3 - wind * 1.1) * upright), mul(up, -1)));
      const lenC = 46 * s * (0.6 + 0.4 * upright);
      const sw = Math.sin(tt) * 4 * s;
      const e1 = add(add(add(c1, mul(flow, lenC)), mul(f, -(6 + wind * 10) * s)), mul(up, -sw));
      const e0 = add(add(add(c0, mul(flow, lenC * 0.85)), mul(f, (4 - wind * 6) * s)), mul(up, -sw * 0.6));
      const mid1 = add(lerpV(c1, e1, 0.5), mul(perp(flow), 5 * s));
      const mid0 = add(lerpV(c0, e0, 0.5), mul(perp(flow), 2 * s));
      cv.shape([c0, c1, mid1, e1, add(lerpV(e1, e0, 0.5), [0, 3 * s + sw * 0.3]), e0, mid0], L.cape, INK, ol * 1.1, true, 0.95);
      cv.brush([c1, mid1, e1], 2.2 * s, shade(L.cape, 0.45), r, 0.7);
    }
    if (L.quiver) {
      const q0 = add(sk.N, add(mul(f, -7 * s), mul(up, 4 * s)));
      const q1 = add(sk.P, add(mul(f, -10 * s), mul(up, -4 * s)));
      cv.line([q0, q1], 6.5 * s + ol * 2, INK);
      cv.line([q0, q1], 6.5 * s, '#8a5a32');
      for (let k = -1; k <= 1; k++) cv.line([q0, add(q0, add(mul(norm(sub(q0, q1)), 7 * s), mul(f, k * 2 * s)))], 1.2 * s, '#e8ddc8');
    }
    // back hair / plume behind the head
    if (L.helm === 'bun' || L.helm === 'wild' || L.helm === 'veil') {
      const hb = add(sk.H, add(mul(sk.hd, 2 * s), mul([-sk.hd[1], sk.hd[0]] as V, -6 * s)));
      const tail = add(hb, add(mul(f, -(6 + wind * 8) * s), [0, 14 * s]));
      cv.brush([hb, lerpV(hb, tail, 0.5), tail], 6 * s, L.hair, r);
    }
    // far arm (+ weapon in far hand for twin blades)
    if (p.mode === 1) {
      // bow arm reaches forward
      limb(cv, [sk.S2, sk.E2, sk.W2], [d.wUa * s * bk, d.wFa * s * bk], [shade(L.cloth), shade(L.armor2)], ol);
    } else {
      limb(cv, [sk.S2, sk.E2, sk.W2], [d.wUa * s * bk, d.wFa * s * bk], [shade(L.cloth), shade(L.armor2)], ol);
    }
    cv.circle(sk.W2, 3.3 * s, shade(L.skin, 0.12), INK, ol * 0.8);
    if (L.weapon === 'twinblades' && p.mode === 0) {
      const wd2 = norm(add(sk.wd, mul(perp(sk.wd), 0.35)));
      drawWeapon(cv, 'twinblades', sk.W2, wd2, s, r, o.tassel);
    }
    if (p.mode === 2 && o.dropped && L.weapon !== 'none' && L.weapon !== 'bow' && L.weapon !== 'xbow') {
      drawWeapon(cv, L.weapon, o.dropped.at, o.dropped.dir, s, r, o.tassel, o.bladeFlip ?? 1);
    }
    // far leg
    if (!o.noFarLeg) drawLeg(cv, sk.Hp2, sk.K2, sk.A2, L, d, s, ol, true, sk.fwd);
  }
  if (!front) return;

  // -------- body
  const T = (sk.N[0] - sk.P[0]) ** 2 + (sk.N[1] - sk.P[1]) ** 2 > 0 ? Math.hypot(sk.N[0] - sk.P[0], sk.N[1] - sk.P[1]) : 1;
  const ch = d.chest * s * bk, wa = d.waist * s * bk;
  const at = (k: number, side: number) => add(add(sk.P, mul(up, T * k)), mul(f, side));
  const torso: V[] = [
    at(-0.06, wa * 0.55),
    at(0.45, ch * 0.58),
    at(0.86, ch * 0.5),
    add(sk.N, mul(up, 2 * s)),
    at(0.9, -ch * 0.52),
    at(0.5, -ch * 0.5),
    at(-0.04, -wa * 0.55),
  ];
  // skirt / tassets (between the thighs, below the waist)
  const m1 = lerpV(sk.Hp1, sk.K1, 0.62), m2 = lerpV(sk.Hp2, sk.K2, 0.62);
  const proj = (v: V) => (v[0] - sk.P[0]) * f[0] + (v[1] - sk.P[1]) * f[1];
  const [fr, bkk] = proj(m1) >= proj(m2) ? [m1, m2] : [m2, m1];
  const skirtLen = L.female ? 1.25 : 1;
  const hemF = add(add(sk.P, mul(sub(fr, sk.P), skirtLen)), mul(f, 4 * s));
  const hemB = add(add(sk.P, mul(sub(bkk, sk.P), skirtLen)), mul(f, -5 * s));
  const hemM = add(lerpV(hemF, hemB, 0.5), mul(up, -3 * s));
  const skirt: V[] = [at(0.12, wa * 0.62), hemF, hemM, hemB, at(0.12, -wa * 0.62)];
  cv.shape(skirt, L.bare ? L.cloth : L.armor2, INK, ol * 1.6, false);
  if (!L.bare) cv.line([lerpV(skirt[0], hemF, 0.5), lerpV(at(0.12, 0), hemM, 0.55), lerpV(skirt[4], hemB, 0.5)], 1 * s, shade(L.armor2, 0.5));

  cv.shape(torso, L.bare ? L.skin : L.armor, INK, ol * 1.8, true);
  if (L.bare) {
    // chest / belly lines
    cv.brush([at(0.62, ch * 0.45), at(0.55, ch * 0.2), at(0.6, -ch * 0.02)], 1.4 * s, shade(L.skin, 0.5), r);
    cv.brush([add(sk.N, mul(f, -2 * s)), at(0.4, ch * 0.2)], 3 * s, L.armor2, r, 0.9); // shoulder strap
  } else {
    // back wash for volume
    cv.shape([at(0.85, -ch * 0.15), at(0.86, -ch * 0.48), at(0.45, -ch * 0.48), at(0.05, -wa * 0.5), at(0.05, -wa * 0.05)], shade(L.armor, 0.35), undefined, 0, true, 0.45);
    if (L.plates) {
      // breastplate rim + scale rows
      cv.curve([at(0.78, ch * 0.52), at(0.6, ch * 0.05), at(0.82, -ch * 0.45)], 1.2 * s, shade(L.armor, 0.55));
      cv.curve([at(0.5, ch * 0.56), at(0.4, ch * 0.0), at(0.52, -ch * 0.45)], 1 * s, shade(L.armor, 0.45));
      cv.circle(at(0.68, ch * 0.3), 3.2 * s, L.trim, INK, 0.9 * s); // 护心镜
    } else {
      // robe collar (cross-collar)
      cv.line([add(sk.N, mul(f, 4 * s)), at(0.45, ch * 0.42)], 2.4 * s, L.trim);
    }
  }
  // belt
  cv.line([at(0.1, wa * 0.62), at(0.1, -wa * 0.6)], 3.6 * s + ol * 1.2, INK);
  cv.line([at(0.1, wa * 0.6), at(0.1, -wa * 0.58)], 3 * s, L.trim);
  // sash ribbons
  if (L.sash) {
    const s0 = at(0.08, -wa * 0.5);
    const sw = Math.sin(tt + 1) * 3 * s;
    const e = add(s0, [-(10 + wind * 14) * s, (16 - wind * 6) * s + sw]);
    cv.brush([s0, add(lerpV(s0, e, 0.5), [0, 3 * s]), e], 3.4 * s, L.sash, r);
    cv.brush([s0, add(s0, [-(6 + wind * 10) * s, (19 - wind * 5) * s - sw])], 2.6 * s, L.sash, r, 0.85);
  }
  // shield on the far arm (in front of the body)
  if (L.shield && p.mode === 0) drawShield(cv, sk, L, s, ol);

  // near leg
  drawLeg(cv, sk.Hp1, sk.K1, sk.A1, L, d, s, ol, false, sk.fwd);

  // head
  drawHead(cv, sk, L, d, s, ol, r, wind, tt);

  // bow / crossbow / main weapon
  if (p.mode === 1) {
    if (L.weapon === 'xbow') drawXbow(cv, sk.W1, norm(sub(sk.W2, sk.W1)), s, p.draw > 0.5);
    else drawBow(cv, sk.W2, norm(sub(sk.W2, sk.W1)), s, sk.W1, p.draw);
  } else if (p.mode === 0 && L.weapon !== 'none') {
    if (L.weapon === 'bow') drawBow(cv, sk.W1, sk.wd, s, null, 0);
    else if (L.weapon === 'xbow') drawXbow(cv, sk.W1, sk.wd, s, true);
    else drawWeapon(cv, L.weapon, sk.W1, sk.wd, s, r, o.tassel, o.bladeFlip ?? 1);
  }
  // near arm
  const sleeve = L.bare ? L.skin : L.cloth;
  limb(cv, [sk.S1, sk.E1, sk.W1], [d.wUa * s * bk, d.wFa * s * bk], [sleeve, L.bare ? L.skin : L.armor2], ol);
  if (!L.bare) {
    // shoulder guard
    const sd = norm(sub(sk.E1, sk.S1));
    cv.ellipse(add(sk.S1, mul(sd, 3 * s)), 6.4 * s * bk, 4.6 * s * bk, (Math.atan2(sd[1], sd[0]) * 180) / Math.PI, L.plates ? L.armor : L.cloth, INK, ol * 1.2);
  }
  cv.circle(sk.W1, 3.5 * s, L.skin, INK, ol * 0.9);
  if (twoHand) {
    /* far hand already drawn behind the shaft */
  }
}

function drawLeg(cv: Canvas, H: V, K: V, A: V, L: Look, d: Dims, s: number, ol: number, far: boolean, fwd: V) {
  const sh = (c: string) => (far ? mix(c, '#2a2520', 0.22) : c);
  const bk = L.bulk;
  const bootTop = lerpV(K, A, 0.42);
  const sd = norm(sub(A, K));
  const fd = norm(add(mul([sd[1], -sd[0]] as V, 0.3), mul(fwd, 0.7))); // mostly along the body's forward
  const toe = add(A, mul(fd, 7.5 * s));
  const heel = add(A, mul(fd, -3 * s));
  limb(cv, [H, K, bootTop, A], [d.wTh * s * bk, d.wSh * s * bk, d.wSh * s * 0.95 * bk], [sh(L.cloth), sh(L.cloth), sh(L.boots)], ol);
  cv.line([heel, toe], 4.6 * s + ol * 2, C.ink);
  cv.line([heel, toe], 4.6 * s, sh(L.boots));
}

function drawShield(cv: Canvas, sk: Skel, L: Look, s: number, ol: number) {
  const sh = L.shield!;
  const c = add(sk.W2, mul(sk.fwd, 2 * s));
  const ang = (Math.atan2(sk.up[1], sk.up[0]) * 180) / Math.PI + 90;
  if (sh.kind === 'rect') {
    const u = sk.up, f: V = [-u[1], u[0]];
    const hw = 7 * s, hh = 15 * s;
    const pts: V[] = [add(add(c, mul(u, hh)), mul(f, hw)), add(add(c, mul(u, hh + 3 * s)), mul(f, 0)), add(add(c, mul(u, hh)), mul(f, -hw)), add(add(c, mul(u, -hh)), mul(f, -hw)), add(add(c, mul(u, -hh - 3 * s)), mul(f, 0)), add(add(c, mul(u, -hh)), mul(f, hw))];
    cv.shape(pts, sh.color, C.ink, ol * 1.4);
    cv.shape([add(c, mul(u, 8 * s)), add(c, mul(f, 4 * s)), add(c, mul(u, -8 * s)), add(c, mul(f, -4 * s))], sh.face, undefined, 0);
  } else {
    cv.ellipse(c, 9.5 * s, 12.5 * s, ang, sh.color, C.ink, ol * 1.4);
    if (sh.kind === 'rattan') {
      cv.ellipse(c, 6.5 * s, 9 * s, ang, 'none', mix(sh.color, '#3a2a10', 0.45), 1 * s);
      cv.ellipse(c, 3.4 * s, 5 * s, ang, 'none', mix(sh.color, '#3a2a10', 0.45), 1 * s);
    } else {
      cv.ellipse(c, 5.5 * s, 7.4 * s, ang, sh.face, undefined, 0);
      cv.circle(c, 2 * s, C.gold, C.ink, 0.8 * s);
    }
  }
}

function drawHead(cv: Canvas, sk: Skel, L: Look, d: Dims, s: number, ol: number, r: Rng, wind: number, tt: number) {
  const R = d.headR * s;
  const H = sk.H;
  const hu = sk.hd; // head up
  const hf: V = [-hu[1], hu[0]]; // face forward
  const P = (a: number, k = 1): V => add(H, add(mul(hf, Math.cos((a * Math.PI) / 180) * R * k), mul(hu, Math.sin((a * Math.PI) / 180) * R * k)));
  // neck
  cv.line([sk.N, add(H, mul(hu, -R * 0.6))], 6 * s + ol * 2, C.ink);
  cv.line([sk.N, add(H, mul(hu, -R * 0.6))], 6 * s, L.skin);
  // plume behind
  if (L.plume === 'pheasant') {
    const base = P(95, 1.15);
    for (const k of [0, 1]) {
      const sway = Math.sin(tt + k) * 3 * s;
      const p1 = add(base, add(mul(hu, (16 + k * 4) * s), mul(hf, -(8 + wind * 6) * s)));
      const p2 = add(base, add(mul(hu, (22 + k * 6) * s), mul(hf, -(30 + wind * 12 + k * 6) * s)));
      const p3 = add(base, add(mul(hu, (8 + k * 8) * s + sway), mul(hf, -(50 + wind * 10 + k * 8) * s)));
      cv.brush([base, p1, p2, p3], (3.4 - k * 0.6) * s, C.ink, r, 1, { taperIn: 0.1, taperOut: 0.6 });
      cv.brush([lerpV(base, p1, 0.5), p1, p2], (1.4 - k * 0.3) * s, L.plumeColor, r, 0.9);
    }
  }
  // face
  cv.circle(H, R, L.skin, C.ink, ol * 1.1);
  // jaw / chin
  cv.shape([P(-20), P(-60, 1.08), P(-100, 1.02), P(-140)], L.skin, undefined, 0, true);
  // eye + brow + nose
  const eye = add(H, add(mul(hf, R * 0.5), mul(hu, R * 0.08)));
  if (L.patch) {
    cv.circle(add(eye, mul(hf, 1 * s)), 2.8 * s, C.ink);
    cv.line([add(eye, mul(hu, 2 * s)), P(160, 1.02)], 1 * s, C.ink);
  } else cv.line([eye, add(eye, mul(hf, 2.2 * s))], 1.6 * s, C.ink);
  cv.line([add(eye, add(mul(hu, 2.6 * s), mul(hf, -1.5 * s))), add(eye, add(mul(hu, 3.4 * s), mul(hf, 3 * s)))], 1.4 * s, C.ink);
  cv.line([P(-5, 1.02), add(P(-15, 1.12), mul(hu, -0.6 * s)), P(-28, 1.0)], 1.1 * s, C.ink);
  // mouth
  if (L.beard !== 'long' && L.beard !== 'short') cv.line([P(-38, 0.98), add(P(-38, 0.98), mul(hf, -2.4 * s))], 0.9 * s, C.inkSoft);
  // ear
  cv.circle(add(H, add(mul(hf, -R * 0.15), mul(hu, -R * 0.05))), 2 * s, mix(L.skin, C.ochre, 0.3), C.ink, 0.8 * s);
  // beard
  if (L.beard === 'long') {
    const b0 = P(-75, 0.95);
    const sway = Math.sin(tt) * 2 * s;
    cv.brush([P(-45, 0.9), b0, add(b0, add(mul(hu, -12 * s), mul(hf, (1 - wind * 3) * s + sway))), add(b0, add(mul(hu, -24 * s), mul(hf, -(3 + wind * 5) * s + sway)))], 5.4 * s, L.beardColor ?? C.ink, r, 1, { taperIn: 0.15, taperOut: 0.7 });
    if (L.beardColor) cv.brush([P(-25, 0.95), b0, add(b0, mul(hu, -18 * s))], 1.2 * s, C.inkSoft, r, 0.8);
  } else if (L.beard === 'tiger') {
    for (let k = 0; k < 6; k++) {
      const a = -20 - k * 20;
      cv.brush([P(a, 0.85), P(a - 6, 1.45)], 2.4 * s, C.ink, r);
    }
  } else if (L.beard === 'short') {
    cv.shape([P(-15, 1.0), P(-55, 1.15), P(-95, 1.1), P(-130, 0.9), P(-70, 0.6)], C.inkSoft, undefined, 0, true);
  } else if (L.beard === 'goatee') {
    cv.brush([P(-50, 0.95), add(P(-55, 1), mul(hu, -9 * s))], 3 * s, C.ink, r);
  }
  // headgear
  const cap = (from: number, to: number, k: number, fill: string) => {
    const pts: V[] = [];
    for (let a = from; a <= to; a += 15) pts.push(P(a, k));
    cv.shape(pts, fill, C.ink, ol * 1.1, true);
  };
  switch (L.helm) {
    case 'helmet':
    case 'lion': {
      cap(10, 215, 1.18, L.helmColor);
      cv.line([P(12, 1.18), P(210, 1.15)], 2.4 * s, L.trim); // brim band
      // neck guard
      cv.shape([P(170, 1.15), P(215, 1.2), add(P(230, 1.25), mul(hu, -5 * s)), P(250, 0.9)], L.helmColor, C.ink, ol, true);
      if (L.helm === 'lion') {
        // lion mask brow
        cv.shape([P(15, 1.2), P(40, 1.45), P(70, 1.35), P(55, 1.1)], C.gold, C.ink, ol, true);
      }
      const top = P(90, 1.2);
      cv.line([top, add(top, mul(hu, 5 * s))], 2.4 * s, C.ink);
      if (L.plume === 'tassel') cv.brush([add(top, mul(hu, 4 * s)), add(top, add(mul(hu, 10 * s), mul(hf, -(5 + wind * 6) * s))), add(top, add(mul(hu, 7 * s), mul(hf, -(14 + wind * 8) * s)))], 6 * s, L.plumeColor, r);
      if (L.plume === 'feather') cv.brush([top, add(top, add(mul(hu, 16 * s), mul(hf, -(10 + wind * 5) * s)))], 4 * s, L.plumeColor, r);
      break;
    }
    case 'crown': {
      // hair cap + golden crown
      cap(30, 215, 1.06, L.hair);
      const c0 = P(70, 1.05), c1 = P(125, 1.05);
      cv.shape([c0, add(c0, mul(hu, 6 * s)), add(lerpV(c0, c1, 0.5), mul(hu, 9 * s)), add(c1, mul(hu, 6 * s)), c1], L.helmColor, C.ink, ol);
      break;
    }
    case 'guan': {
      // scholar's 纶巾: soft cap with two tails
      cap(45, 220, 1.1, L.helmColor);
      const t0 = P(185, 1.1);
      cv.brush([t0, add(t0, add(mul(hf, -(8 + wind * 6) * s), mul(hu, -10 * s)))], 3 * s, L.helmColor, r);
      cv.brush([t0, add(t0, add(mul(hf, -(4 + wind * 6) * s), mul(hu, -13 * s)))], 2.4 * s, mix(L.helmColor, C.ink, 0.25), r);
      cv.shape([P(70, 1.1), add(P(85, 1.1), mul(hu, 7 * s)), add(P(120, 1.1), mul(hu, 6 * s)), P(125, 1.1)], L.helmColor, C.ink, ol);
      break;
    }
    case 'band':
    case 'turban': {
      cap(55, 220, 1.05, L.hair);
      cv.line([P(62, 1.07), P(200, 1.07)], (L.helm === 'turban' ? 5 : 3.2) * s, L.helmColor);
      const k0 = P(195, 1.05);
      cv.brush([k0, add(k0, add(mul(hf, -(10 + wind * 8) * s), mul(hu, -4 * s)))], 3 * s, L.helmColor, r);
      if (L.helm === 'turban') cap(40, 160, 1.22, L.helmColor);
      break;
    }
    case 'topknot':
    case 'cap': {
      cap(50, 220, 1.05, L.hair);
      if (L.helm === 'cap') cap(40, 200, 1.16, L.helmColor);
      cv.circle(P(110, 1.25), 3.6 * s, L.helm === 'cap' ? L.helmColor : L.hair, C.ink, ol * 0.8);
      break;
    }
    case 'bun':
    case 'veil': {
      cap(25, 230, 1.07, L.hair);
      cv.circle(P(135, 1.3), 4.6 * s, L.hair, C.ink, ol * 0.8);
      cv.line([P(120, 1.2), P(150, 1.65)], 1.4 * s, C.gold); // hairpin
      if (L.helm === 'veil') cv.line([P(30, 1.08), P(190, 1.08)], 2.2 * s, L.helmColor);
      break;
    }
    case 'wild': {
      for (let k = 0; k < 7; k++) {
        const a = 40 + k * 26;
        cv.brush([P(a, 0.8), P(a + 8, 1.5)], 4 * s, L.hair, r);
      }
      cap(30, 220, 1.06, L.hair);
      cv.line([P(30, 1.07), P(200, 1.07)], 2.4 * s, L.helmColor);
      if (L.plume === 'feather') {
        const t = P(150, 1.1);
        cv.brush([t, add(t, add(mul(hu, 14 * s), mul(hf, -(6 + wind * 4) * s)))], 3.6 * s, L.plumeColor, r);
        cv.brush([t, add(t, add(mul(hu, 11 * s), mul(hf, -(12 + wind * 4) * s)))], 3 * s, C.ink, r);
      }
      break;
    }
    case 'rattan': {
      cap(5, 215, 1.2, L.helmColor);
      for (let k = 1; k < 4; k++) cv.curve([P(15, 1.2 - k * 0.0), P(90, 1.2 - k * 0.05 + 0.0), P(200, 1.18)].map((v, i) => (i === 1 ? add(v, mul(hu, -k * 2.4 * s)) : add(v, mul(hu, -k * 1.6 * s)))), 0.9 * s, mix(L.helmColor, '#3a2a10', 0.5));
      break;
    }
  }
}
