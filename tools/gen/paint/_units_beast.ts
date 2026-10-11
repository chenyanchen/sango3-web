// Quadruped rig for mounts: horse (plain or barded), war elephant, tiger.
// Side view facing +x, ground at y = 0 under the anchor; the saddle seat sits
// at (SEAT_X, -saddleH), which is where riders are placed.
import { C, mix, type Rng } from '../ink.ts';
import { add, Canvas, clamp, ik, lerp, lerpV, mul, norm, perp, rad, smooth, sub, type V } from './_units_rig.ts';

export type BeastKind = 'horse' | 'elephant' | 'tiger';
export interface BeastLook {
  kind: BeastKind;
  coat: string;
  mane: string;
  /** saddle cloth / caparison colour (team colour for soldiers) */
  cloth: string;
  trim: string;
  barding: boolean;
  /** pale muzzle / socks */
  socks: boolean;
  blaze: boolean;
  /** tiger stripes */
  stripes?: boolean;
  /** dapple spots colour */
  dapple?: string;
  /** small horns (legendary horse) */
  horns?: boolean;
}

export interface BeastPose {
  /** barrel offset and pitch (deg, + = nose down) */
  bx: number;
  by: number;
  pitch: number;
  /** neck raise (deg, + up) relative to default; head nod (+ down) */
  neck: number;
  nod: number;
  /** hoof targets (world, relative to anchor ground): near-fore, far-fore, near-hind, far-hind */
  hooves: [V, V, V, V];
  tail: number;
  /** lying on the ground (legs folded, no IK reach constraints) */
  down: number;
  /** trunk curl for elephants (0 down .. 1 raised) */
  trunk: number;
  /** mouth open */
  roar: number;
}

interface Dim {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  fore: V;
  hind: V;
  l1: number;
  l2: number;
  hl1: number;
  hl2: number;
  wLeg: number;
  wLow: number;
  saddleX: number;
  saddleH: number;
}
export const BDIM: Record<BeastKind, Dim> = {
  horse: { cx: 3, cy: -60, rx: 35, ry: 19, fore: [23, 8], hind: [-24, 2], l1: 23, l2: 23, hl1: 27, hl2: 26, wLeg: 15, wLow: 4.6, saddleX: -4, saddleH: 79 },
  elephant: { cx: 0, cy: -54, rx: 44, ry: 25, fore: [26, 10], hind: [-30, 10], l1: 22, l2: 23, hl1: 22, hl2: 23, wLeg: 17, wLow: 14, saddleX: -4, saddleH: 82 },
  tiger: { cx: 0, cy: -34, rx: 36, ry: 11.5, fore: [26, 4], hind: [-26, 2], l1: 15, l2: 15, hl1: 17, hl2: 16, wLeg: 11, wLow: 6.5, saddleX: -4, saddleH: 48 },
};

export const STAND: (k: BeastKind) => BeastPose = (k) => {
  const d = BDIM[k];
  const fx = d.cx + d.fore[0], hx = d.cx + d.hind[0];
  return { bx: 0, by: 0, pitch: 0, neck: 0, nod: 0, hooves: [[fx + 2, 0], [fx - 4, 0], [hx + 1, 0], [hx - 5, 0]], tail: 0, down: 0, trunk: 0, roar: 0 };
};

/** Gallop/walk cycle; `bob` keeps the saddle in sync with the rider. */
export function gaitPose(k: BeastKind, ph: number, bob: number): BeastPose {
  const p = STAND(k);
  const d = BDIM[k];
  const A = k === 'elephant' ? 11 : k === 'tiger' ? 15 : 17;
  const lift = k === 'elephant' ? 8 : k === 'tiger' ? 12 : 16;
  const stance = k === 'elephant' ? 0.6 : 0.42;
  const offs = k === 'elephant' ? [0.0, 0.5, 0.25, 0.75] : k === 'tiger' ? [0.5, 0.56, 0.0, 0.06] : [0.55, 0.47, 0.08, 0.0];
  const base = [d.cx + d.fore[0] + 2, d.cx + d.fore[0] - 3, d.cx + d.hind[0] + 2, d.cx + d.hind[0] - 3];
  p.hooves = offs.map((o, i) => {
    const q = (((ph + o) % 1) + 1) % 1;
    if (q < stance) return [base[i] + A * (1 - (2 * q) / stance), 0] as V;
    const t = (q - stance) / (1 - stance);
    return [base[i] - A + 2 * A * smooth(t), -lift * Math.sin(Math.PI * t) * (i < 2 ? 1 : 0.75)] as V;
  }) as [V, V, V, V];
  p.by = bob;
  p.pitch = (k === 'elephant' ? 1 : 3) * Math.sin(ph * Math.PI * 2 + 1.2);
  p.neck = (k === 'elephant' ? 2 : 6) * Math.sin(ph * Math.PI * 2 + 2);
  p.tail = 0.6 + 0.3 * Math.sin(ph * Math.PI * 2);
  p.trunk = 0.15 + 0.1 * Math.sin(ph * Math.PI * 2);
  return p;
}

/** Collapse: `t` 0..1 from standing to lying on the ground. */
export function downPose(k: BeastKind, t: number, rear = false): BeastPose {
  const p = STAND(k);
  const d = BDIM[k];
  if (rear && t < 0.45) {
    const u = t / 0.45;
    p.pitch = -26 * Math.sin(Math.PI * u);
    p.by = -4 * Math.sin(Math.PI * u);
    p.neck = 20 * Math.sin(Math.PI * u);
    p.hooves[0] = [d.cx + d.fore[0] + 10, -26 * Math.sin(Math.PI * u)];
    p.hooves[1] = [d.cx + d.fore[0] + 4, -20 * Math.sin(Math.PI * u)];
    p.roar = Math.sin(Math.PI * u);
    return p;
  }
  const u = rear ? (t - 0.45) / 0.55 : t;
  const e = smooth(clamp(u, 0, 1));
  const groundBy = -d.cy - d.ry - 2;
  p.by = lerp(0, groundBy, e);
  p.pitch = 10 * Math.sin(Math.PI * Math.min(1, e * 1.3)) * (1 - e) + e * 2;
  p.neck = lerp(0, -40, e);
  p.nod = lerp(0, -20, e);
  p.down = e;
  p.tail = lerp(0.2, -0.2, e);
  return p;
}

// ------------------------------------------------------------------ drawing
const INK = C.ink;

export interface BeastOut {
  /** where the rider's pelvis goes (world) */
  seat: V;
  /** pitch of the back (deg) */
  pitch: number;
}

/** Draws the mount. Returns the saddle seat point. */
export function drawBeast(cv: Canvas, look: BeastLook, p: BeastPose, s: number, r: Rng, t: number, layer: 'all' | 'back' | 'front' = 'all'): BeastOut {
  const d = BDIM[look.kind];
  const ol = 1.6 * s;
  const pr = rad(p.pitch);
  const cs = Math.cos(pr), sn = Math.sin(pr);
  const C0: V = [(d.cx + p.bx) * s, (d.cy + p.by) * s];
  // body frame → world (pitch + = nose down → rotate clockwise for +x forward)
  const B = (v: V): V => add(C0, mul([v[0] * cs - v[1] * sn, v[0] * sn + v[1] * cs], s));
  const seat = B([d.saddleX - d.cx, -(d.saddleH + d.cy)]);
  const out = { seat, pitch: p.pitch };
  const shade = (c: string, k = 0.25) => mix(c, '#2a2520', k);
  const coat = look.coat, coatF = shade(coat, 0.28);
  const down = p.down;

  // legs: target hooves; when lying, fold under the body
  const legRoot = [B(add(d.fore, [3, 0])), B(add(d.fore, [-2, 0])), B(add(d.hind, [2, 0])), B(add(d.hind, [-3, 0]))];
  const lens = [[d.l1, d.l2], [d.l1, d.l2], [d.hl1, d.hl2], [d.hl1, d.hl2]];
  const legPts = (i: number): V[] => {
    let tgt: V = mul(p.hooves[i], s);
    const fore = i < 2;
    if (down > 0) {
      const fold: V = add(legRoot[i], mul(fore ? [10, d.ry * 0.9] : [16, d.ry * 0.6], s));
      tgt = lerpV(tgt, fold, down);
    }
    const isHorse = look.kind === 'horse';
    // pastern: the fetlock sits up and back from the hoof
    const fet: V = isHorse ? add(tgt, mul([-2.6, -5.5], s)) : add(tgt, mul([-1, -3], s));
    const [a, b] = lens[i].map((x) => x * s);
    const sa = ik(legRoot[i], fet, a, b, 1), sb = ik(legRoot[i], fet, a, b, -1);
    // fore knees point forward, hind hocks point backward
    const pick = fore ? (sa.mid[0] > sb.mid[0] ? sa : sb) : sa.mid[0] < sb.mid[0] ? sa : sb;
    const hoof = add(pick.end, sub(tgt, fet));
    return [legRoot[i], pick.mid, pick.end, hoof];
  };
  const drawLeg = (i: number, far: boolean) => {
    const [a, b, c, h] = legPts(i);
    const col = far ? coatF : coat;
    const w1 = d.wLeg * s, w2 = d.wLow * s;
    if (look.kind === 'elephant') {
      cv.line([a, b, c, h], w1 + ol * 2, INK);
      cv.line([a, b, c, h], w1, col);
      cv.ellipse(add(h, [0, -1 * s]), w1 * 0.55, 2.4 * s, 0, mix(col, '#eee', 0.3), INK, ol * 0.7);
      return;
    }
    const fore = i < 2;
    // muscular upper leg (forearm / gaskin) then thin cannon and pastern
    cv.shape(capsule(a, b, w1 * (fore ? 0.5 : 0.66), w2 * 0.8), col, INK, ol);
    cv.line([b, c, h], w2 + ol * 2, INK);
    cv.line([b, c, h], w2, col);
    if (look.kind === 'horse') {
      if (look.socks) cv.line([lerpV(b, c, 0.5), c, h], w2, mix(col, '#f2ece0', 0.75));
      const hd = norm(sub(h, c));
      const hf: V = [hd[1], -hd[0]];
      void hf;
      cv.shape([add(h, [-2.6 * s, -2.4 * s]), add(h, [3.2 * s, -2 * s]), add(h, [4.4 * s, 1.2 * s]), add(h, [-2.8 * s, 1.2 * s])], '#2a2520', INK, ol * 0.6);
    } else {
      cv.ellipse(add(h, [2 * s, -1 * s]), 4.6 * s, 2.6 * s, 0, col, INK, ol);
    }
  };

  // ---- back layer: far legs, tail
  if (layer !== 'front') {
    drawLeg(1, true);
    drawLeg(3, true);
    // tail
    const tr = B([-d.rx + 2, -d.ry * 0.5]);
    if (look.kind === 'horse') {
      const sw = Math.sin(t * Math.PI * 2) * 3 * s;
      const t1 = add(tr, mul([-12 - p.tail * 8, 10 - p.tail * 6], s));
      const t2 = add(tr, add(mul([-16 - p.tail * 14, 30 - p.tail * 14], s), [sw, 0]));
      cv.brush([tr, t1, t2], 10 * s, look.mane, r, 1, { taperIn: 0.1, taperOut: 0.6 });
      cv.brush([tr, add(t1, [2 * s, 2 * s]), add(t2, [6 * s, 1 * s])], 3 * s, INK, r, 0.6);
    } else if (look.kind === 'tiger') {
      const t1 = add(tr, mul([-14, -4 - p.tail * 10], s));
      const t2 = add(tr, mul([-26, -16 - p.tail * 10 + Math.sin(t * 6.28) * 3], s));
      cv.brush([tr, t1, t2], 5 * s + ol * 2, INK, r, 1, { taperIn: 0.05, taperOut: 0.2 });
      cv.brush([tr, t1, t2], 4.4 * s, coat, r, 1, { taperIn: 0.05, taperOut: 0.2 });
      cv.line([t2, add(t2, mul(norm(sub(t2, t1)), 3 * s))], 5 * s, INK);
    } else {
      cv.line([tr, add(tr, mul([-6, 20 + Math.sin(t * 6.28) * 2], s))], 2.6 * s, INK);
    }
  }
  if (layer === 'back') return out;

  // near legs (their tops disappear under the body)
  drawLeg(0, false);
  drawLeg(2, false);

  // ---- body
  const body: V[] = [];
  const N = 18;
  for (let k = 0; k < N; k++) {
    const a = (k / N) * Math.PI * 2;
    // horse: deeper chest at front, rounder rump
    let rx = d.rx, ry = d.ry;
    const cx = Math.cos(a), cy = Math.sin(a);
    if (look.kind === 'horse') {
      if (cx > 0) ry *= 1.05;
      if (cy < 0) ry *= 0.92 + 0.1 * Math.abs(cx);
    }
    if (look.kind === 'tiger' && cy > 0) ry *= 1.1;
    body.push(B([cx * rx, cy * ry]));
  }
  cv.shape(body, coat, INK, ol * 1.4, true);
  // belly shade
  cv.shape([B([-d.rx * 0.8, d.ry * 0.3]), B([0, d.ry * 0.92]), B([d.rx * 0.8, d.ry * 0.35]), B([0, d.ry * 0.6])], shade(coat, 0.3), undefined, 0, true, 0.5);
  if (look.kind !== 'elephant') {
    // shoulder and haunch contours
    cv.brush([B([d.fore[0] - 4, -d.ry * 0.55]), B([d.fore[0] + 4, d.ry * 0.1]), B([d.fore[0] + 1, d.ry * 0.85])], 1.8 * s, INK, r, 0.75);
    cv.brush([B([d.hind[0] + 12, -d.ry * 0.7]), B([d.hind[0] + 14, d.ry * 0.2]), B([d.hind[0] + 6, d.ry * 0.9])], 1.8 * s, INK, r, 0.75);
  }
  if (look.dapple) {
    const rr = 0.5;
    for (let k = 0; k < 9; k++) {
      const u = ((k * 0.618) % 1) * 1.6 - 0.8, v = ((k * 0.382 + 0.2) % 1) * 1.2 - 0.6;
      cv.circle(B([u * d.rx, v * d.ry]), (2 + (k % 3)) * s * rr * 2, look.dapple, undefined, 0, 0.55);
    }
  }
  if (look.kind === 'tiger' || look.stripes) {
    for (let k = -3; k <= 3; k++) {
      const x = k * d.rx * 0.26;
      cv.brush([B([x + 2, -d.ry * 0.95]), B([x - 1, -d.ry * 0.2]), B([x + 3, d.ry * 0.35])], 3.2 * s, INK, r, 0.85, { taperIn: 0.05, taperOut: 0.8 });
    }
  }
  // tack
  if (look.kind === 'horse') {
    if (look.barding) {
      const bp: V[] = [B([-d.rx * 0.95, -d.ry * 0.5]), B([-d.rx * 0.6, -d.ry * 1.05]), B([d.rx * 0.55, -d.ry * 1.05]), B([d.rx * 1.02, -d.ry * 0.2]), B([d.rx * 0.9, d.ry * 0.95]), B([-d.rx * 0.9, d.ry * 0.9])];
      cv.shape(bp, '#8f8a80', INK, ol * 1.2, true);
      for (let row = 0; row < 3; row++) {
        const y = -d.ry * 0.5 + row * d.ry * 0.5;
        const pts: V[] = [];
        for (let k = 0; k <= 10; k++) pts.push(B([-d.rx * 0.85 + (k / 10) * d.rx * 1.75, y + (k % 2) * 2.4]));
        cv.line(pts, 1 * s, '#4d4943');
      }
      cv.line([B([-d.rx * 0.9, d.ry * 0.88]), B([d.rx * 0.88, d.ry * 0.92])], 3.4 * s, look.cloth);
    }
    // saddle cloth
    const sx = d.saddleX - d.cx;
    const cloth: V[] = [B([sx - 13, -d.ry * 0.95]), B([sx + 11, -d.ry * 0.98]), B([sx + 13, d.ry * 0.05]), B([sx + 6, d.ry * 0.32]), B([sx - 8, d.ry * 0.32]), B([sx - 15, d.ry * 0.02])];
    cv.shape(cloth, look.cloth, INK, ol, true);
    cv.curve([B([sx - 13, d.ry * 0.05]), B([sx - 1, d.ry * 0.22]), B([sx + 11, d.ry * 0.08])], 2 * s, look.trim);
    // saddle
    cv.shape([B([sx - 13, -d.ry - 2]), B([sx - 10, -d.ry - 6]), B([sx + 8, -d.ry - 4]), B([sx + 11, -d.ry - 8]), B([sx + 13, -d.ry - 1]), B([sx, -d.ry + 3])], '#4a2a1c', INK, ol, true);
    // girth + breast strap
    cv.line([B([sx + 13, -d.ry * 0.2]), B([d.rx * 0.95, -d.ry * 0.1])], 2 * s, '#4a2a1c');
    cv.line([B([sx - 15, -d.ry * 0.3]), B([-d.rx * 0.95, -d.ry * 0.15])], 2 * s, '#4a2a1c');
  } else if (look.kind === 'elephant') {
    // howdah blanket
    const sx = d.saddleX - d.cx;
    cv.shape([B([sx - 26, -d.ry * 0.95]), B([sx + 24, -d.ry * 0.95]), B([sx + 28, d.ry * 0.5]), B([sx - 30, d.ry * 0.45])], look.cloth, INK, ol, true);
    cv.line([B([sx - 28, d.ry * 0.3]), B([sx + 26, d.ry * 0.34])], 3 * s, look.trim);
    for (let k = -2; k <= 2; k++) cv.circle(B([sx + k * 10, d.ry * 0.1]), 2 * s, look.trim);
    cv.shape([B([sx - 14, -d.ry - 1]), B([sx - 12, -d.ry - 6]), B([sx + 12, -d.ry - 6]), B([sx + 14, -d.ry - 1])], '#5a2e1e', INK, ol);
  } else {
    // tiger: a simple rug + strap
    const sx = d.saddleX - d.cx;
    cv.shape([B([sx - 12, -d.ry * 0.95]), B([sx + 10, -d.ry * 0.95]), B([sx + 12, d.ry * 0.4]), B([sx - 14, d.ry * 0.4])], look.cloth, INK, ol, false);
  }


  // ---- neck & head
  drawHead(cv, look, p, d, B, s, ol, r, t);
  return out;
}

function capsule(a: V, b: V, ra: number, rb: number): V[] {
  const dd = norm(sub(b, a));
  const n = perp(dd);
  return [add(a, mul(n, ra)), add(b, mul(n, rb)), add(b, mul(dd, rb * 0.6)), add(b, mul(n, -rb)), add(a, mul(n, -ra)), add(a, mul(dd, -ra * 0.6))];
}

function drawHead(cv: Canvas, look: BeastLook, p: BeastPose, d: Dim, B: (v: V) => V, s: number, ol: number, r: Rng, t: number) {
  const neckUp = rad(p.neck);
  if (look.kind === 'horse') {
    const base = B([d.rx * 0.72, -d.ry * 0.35]);
    const a = rad(58) + neckUp;
    const pitchR = rad(p.pitch);
    const nd: V = [Math.cos(a + pitchR) * 1, -Math.sin(a + pitchR)];
    const poll = add(base, mul(nd, 32 * s));
    const ha = a + pitchR - rad(105) - rad(p.nod);
    const hd: V = [Math.cos(ha), -Math.sin(ha)];
    const muz = add(poll, mul(hd, 25 * s));
    const nn = perp(nd); // points "down/forward" of the neck
    const hn = perp(hd);
    // neck
    const neck: V[] = [add(base, mul(nn, -11 * s)), add(poll, mul(nn, -4 * s)), add(poll, mul(nn, 6 * s)), add(lerpV(base, poll, 0.5), mul(nn, 11 * s)), add(base, mul(nn, 15 * s))];
    cv.shape(neck, look.coat, INK, ol * 1.3, true);
    // head
    const head: V[] = [add(poll, mul(hn, 5 * s)), add(lerpV(poll, muz, 0.55), mul(hn, 5.5 * s)), add(muz, mul(hn, 3.6 * s)), add(muz, mul(hd, 2 * s)), add(muz, mul(hn, -3.4 * s)), add(lerpV(poll, muz, 0.35), mul(hn, -6.5 * s)), add(poll, mul(hn, -6 * s))];
    cv.shape(head, look.coat, INK, ol * 1.3, true);
    if (look.blaze) cv.brush([add(lerpV(poll, muz, 0.15), mul(hn, 4 * s)), add(lerpV(poll, muz, 0.85), mul(hn, 3 * s))], 3 * s, '#f2ece0', r, 0.95);
    if (look.barding) cv.shape([add(poll, mul(hn, 5.6 * s)), add(lerpV(poll, muz, 0.7), mul(hn, 5.6 * s)), add(lerpV(poll, muz, 0.7), mul(hn, -1 * s)), add(poll, mul(hn, -2 * s))], '#8f8a80', INK, ol * 0.8);
    if (look.horns) for (const k of [0, 3]) cv.brush([add(poll, mul(hn, (2 + k) * s)), add(add(poll, mul(nd, 10 * s)), mul(hn, (6 + k) * s))], 2.4 * s, C.gold, r);
    // ear, eye, nostril, mouth
    cv.shape([add(poll, mul(hn, -3 * s)), add(add(poll, mul(nd, 9 * s)), mul(hn, -4 * s)), add(poll, mul(hn, 1 * s))], look.coat, INK, ol, false);
    cv.circle(add(lerpV(poll, muz, 0.3), mul(hn, -1.5 * s)), 1.5 * s, INK);
    cv.circle(add(muz, mul(hn, 0.6 * s)), 1.1 * s, INK);
    // bridle + reins
    cv.line([add(lerpV(poll, muz, 0.15), mul(hn, -5.5 * s)), add(lerpV(poll, muz, 0.15), mul(hn, 5 * s))], 1.6 * s, '#7a2a1c');
    cv.line([add(lerpV(poll, muz, 0.8), mul(hn, -3 * s)), add(lerpV(poll, muz, 0.8), mul(hn, 4 * s))], 1.6 * s, '#7a2a1c');
    cv.curve([add(lerpV(poll, muz, 0.8), mul(hn, -2 * s)), add(lerpV(base, poll, 0.5), mul(nn, 2 * s)), B([d.saddleX - d.cx + 14, -d.ry - 6])], 1.1 * s, '#3a1a10');
    // mane
    const sw = Math.sin(t * 6.28) * 1.5 * s;
    for (let k = 0; k < 5; k++) {
      const q = add(lerpV(poll, base, k / 5), mul(nn, -4 * s));
      cv.brush([q, add(q, add(mul(nd, -6 * s), mul(nn, -(6 + k) * s + sw)))], 4 * s, look.mane, r, 1, { taperIn: 0.1, taperOut: 0.7 });
    }
    cv.brush([add(poll, mul(nn, -3 * s)), add(add(poll, mul(hd, 6 * s)), mul(hn, 6 * s))], 3.4 * s, look.mane, r); // forelock
    if (p.roar > 0.3) cv.line([add(muz, mul(hn, -1 * s)), add(add(muz, mul(hd, -5 * s)), mul(hn, -6 * s))], 1.6 * s, INK);
  } else if (look.kind === 'elephant') {
    const hc = B([d.rx * 0.95, -d.ry * 0.3]);
    const hd = add(hc, mul([8, -2 - p.neck * 0.3], s));
    // trunk: from forehead down, curling forward at the tip when raised
    const tr = p.trunk;
    const t0 = add(hd, mul([10, 6], s));
    const t1 = add(t0, mul([6 + tr * 8, 22 - tr * 16], s));
    const t2 = add(t0, mul([4 + tr * 20, 44 - tr * 40], s));
    const t3 = add(t2, mul([tr * 8 - 2, 4 - tr * 12], s));
    cv.brush([t0, t1, t2, t3], 12 * s + ol * 2, INK, r, 1, { taperIn: 0.02, taperOut: 0.25, jitter: 0.02 });
    cv.brush([t0, t1, t2, t3], 11 * s, look.coat, r, 1, { taperIn: 0.02, taperOut: 0.25, jitter: 0.02 });
    for (let k = 1; k < 6; k++) {
      const q = lerpV(t1, t2, k / 6);
      cv.line([add(q, [-3 * s, 0]), add(q, [3 * s, -1 * s])], 0.8 * s, mix(look.coat, INK, 0.4));
    }
    cv.circle(hd, 17 * s, look.coat, INK, ol * 1.3);
    // tusk
    const tk = add(hd, mul([10, 12], s));
    cv.curve([tk, add(tk, mul([8, 6], s)), add(tk, mul([18, 2], s))], 4.2 * s, INK);
    cv.curve([tk, add(tk, mul([8, 6], s)), add(tk, mul([18, 2], s))], 2.6 * s, '#f4efe2');
    cv.circle(add(hd, mul([7, -3], s)), 1.6 * s, INK);
    // ear flap
    cv.shape([add(hd, mul([-6, -12], s)), add(hd, mul([-20, -6], s)), add(hd, mul([-22, 12], s)), add(hd, mul([-10, 20], s)), add(hd, mul([-2, 6], s))], mix(look.coat, '#c9a090', 0.25), INK, ol * 1.2, true);
    // head cloth
    cv.shape([add(hd, mul([-4, -16], s)), add(hd, mul([10, -14], s)), add(hd, mul([12, -4], s)), add(hd, mul([-2, -6], s))], look.cloth, INK, ol, true);
  } else {
    // tiger head
    const hc = B([d.rx + 6, -d.ry * 0.6 - p.neck * 0.2]);
    const h = add(hc, mul([4, -2], s));
    cv.circle(h, 10.5 * s, look.coat, INK, ol * 1.3);
    const muz = add(h, mul([8, 4], s));
    cv.ellipse(muz, 6.5 * s, 5 * s, 0, mix(look.coat, '#f4ead8', 0.6), INK, ol);
    // ears
    cv.circle(add(h, mul([-5, -9], s)), 3.4 * s, look.coat, INK, ol);
    // stripes on head, eye, nose, mouth
    cv.brush([add(h, mul([-2, -10], s)), add(h, mul([0, -4], s))], 2.2 * s, INK, r);
    cv.brush([add(h, mul([-8, -4], s)), add(h, mul([-3, 0], s))], 2 * s, INK, r);
    cv.line([add(h, mul([4, -3], s)), add(h, mul([7, -3.5], s))], 1.8 * s, INK);
    cv.circle(add(muz, mul([5, -2], s)), 1.6 * s, INK);
    if (p.roar > 0.2) {
      cv.shape([add(muz, mul([-2, 2], s)), add(muz, mul([7, 2], s)), add(muz, mul([4, 6 + p.roar * 5], s)), add(muz, mul([-2, 5 + p.roar * 4], s))], '#7a2a20', INK, ol);
      cv.line([add(muz, mul([5, 2], s)), add(muz, mul([5, 4.5], s))], 1.2 * s, '#f4efe2');
    } else cv.line([add(muz, mul([-1, 3], s)), add(muz, mul([6, 2.5], s))], 1 * s, INK);
    for (const k of [-1, 1]) cv.line([add(muz, mul([2, 1], s)), add(muz, mul([12, 1 + k * 3], s))], 0.6 * s, INK);
  }
}
