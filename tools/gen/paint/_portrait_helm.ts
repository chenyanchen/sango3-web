// Helmets (兜鍪) — the most common headwear: skull-hugging domes with a
// pointed visor, flared lamellar neck guards, ear plates, tassels and the
// style-specific ornaments (phoenix wings, beast masks, peaks, pheasant crests).
import { C, mix, type Pt } from '../ink.ts';
import type { FaceParts } from './_portrait_face.ts';
import type { Model } from './_portrait_model.ts';
import { band, circ, ell, fill, g, lerp, P, qpts, stroke } from './_portrait_util.ts';

export const HELM_KINDS = ['helmet', 'winghelm', 'lionhelm', 'peakhelm', 'hequan'] as const;
export const isHelm = (k: string) => (HELM_KINDS as readonly string[]).includes(k);

const dk = (c: string, t = 0.4) => mix(c, '#1b1712', t);

export function helmBack(m: Model, fp: FaceParts) {
  const { hx, a, browY, eyeY, noseY, mouthY, r } = m;
  const col = m.hat.col;
  let s = '';
  if (m.hat.kind === 'hequan') return s;
  // flared neck guard (顿项)
  const flare = m.r.range(1.3, 1.5);
  const guard: Pt[] = [[hx - a * 1.14, browY - 8], [hx - a * 1.3, noseY], [hx - a * flare, mouthY + 20], [hx - a * 1.1, mouthY + 26], [hx - a * 0.72, mouthY + 22], [hx - a * 0.72, noseY + 6], [fp.X(-1, browY + 2) - 3, browY + 2]];
  const gd = P(guard, true);
  const cloth = m.r.chance(0.3);
  s += fill(gd, cloth ? m.hat.col2 : dk(col, 0.3));
  if (!cloth) s += fill(gd, 'url(#scales)', 0.6);
  else for (let i = 1; i < 4; i++) s += stroke([[hx - a * (1.15 + i * 0.04), noseY + i * 3], [hx - a * (1.1 + i * 0.08), mouthY + 14 + i * 3]], 0.9, dk(m.hat.col2, 0.5), r, 0.5);
  s += fill(band([[hx - a * flare, mouthY + 20], [hx - a * 1.1, mouthY + 26], [hx - a * 0.72, mouthY + 22]], 3.5), cloth ? dk(m.hat.col2, 0.3) : m.hat.col2);
  s += stroke(guard.slice(0, 5), 1.5, C.ink, r, 0.75, { taperIn: 0.1, taperOut: 0.1 });
  // a sliver on the far side
  const fx = hx + fp.W(eyeY) + 0.5;
  const ff: Pt[] = [[fx - 3, browY - 8], [fx + 3, browY], [fx + 6, mouthY + 10], [fx - 1, mouthY + 12], [fx - 2, eyeY + 6]];
  s += fill(P(ff, true), dk(col, 0.4));
  if (!cloth) s += fill(P(ff, true), 'url(#scales)', 0.5);
  return s;
}

/** Ear plate (护耳) drawn over the ear position. */
export function earPlate(m: Model, fp: FaceParts) {
  const { r } = m;
  const { ex, et, eb, ew } = fp.ear;
  const cx = ex - ew * 0.45, cy = (et + eb) / 2;
  const col = m.hat.col;
  let s = fill(ell(cx, cy, ew * 0.75, (eb - et) * 0.55, 8), dk(col, 0.15));
  s += fill(ell(cx - 1, cy - 3, ew * 0.4, (eb - et) * 0.25, 8), '#ffffff', 0.25, 'filter="url(#blur2)"');
  s += `<path d="${ell(cx, cy, ew * 0.75, (eb - et) * 0.55, 8)}" fill="none" stroke="${C.ink}" stroke-width="1.2" opacity="0.75"/>`;
  s += circ(cx, cy, 1.6, C.gold);
  void r;
  return s;
}

export function helmFront(m: Model, fp: FaceParts) {
  const { X, W } = fp;
  const { hx, a, hairY, browY, r } = m;
  const top = hairY - 24;
  const k = m.hat.kind;
  const col = m.hat.col;
  let s = '';
  if (k === 'hequan') return hequan(m, fp);
  const by = browY - 6;
  const visor = k !== 'peakhelm';
  const brim: Pt[] = [[-0.98, by + 3], [-0.6, by - 1], [-0.2, by - 1.5], [0, by + (visor ? 1 : -1)], [0.2, by - 1.5], [0.6, by - 2], [1, by]].map(([u, y]) => [X(u, y), y] as Pt);
  brim[0][0] = hx - a * 1.17;
  brim[brim.length - 1][0] = hx + W(by) + 1.5;
  const peak = k === 'peakhelm';
  const dome: Pt[] = [
    ...brim,
    [hx + a * 1.03, hairY - 8],
    [hx + a * 0.78, top + 5],
    ...(peak ? [[hx + a * 0.3, top - 10], [hx - a * 0.05, top - 24], [hx - a * 0.4, top - 9]] as Pt[] : [[hx + a * 0.25, top - 3], [hx - a * 0.4, top - 2.5]] as Pt[]),
    [hx - a * 0.95, top + 11],
    [hx - a * 1.17, hairY + 4],
    [hx - a * 1.2, by + 3],
  ];
  const dd = P(dome, true, 0.45);
  const tx = peak ? hx - a * 0.05 : hx - a * 0.08, ty = peak ? top - 22 : top - 2.5;

  // spike and tassel (盔缨) behind the dome outline
  const plume = m.hat.plume;
  s += fill(P([[tx - 2.2, ty + 2], [tx - 1, ty - 18], [tx + 1, ty - 18], [tx + 2.2, ty + 2]], true), dk(col, 0.25));
  const ky = ty - 9;
  for (let i = 0; i < 22; i++) {
    const t = i / 21;
    const side = t < 0.62 ? -1 : 1; // most of the tuft falls to the back
    const ang = side < 0 ? lerp(-1.7, -3.3, t / 0.62) : lerp(-1.4, -0.2, (t - 0.62) / 0.38);
    const L = r.range(14, 22);
    const p0: Pt = [tx, ky];
    const p1: Pt = [p0[0] + Math.cos(ang) * L * 0.55, p0[1] + Math.sin(ang) * L * 0.35 - 3];
    const p2: Pt = [p0[0] + Math.cos(ang) * L * 0.9, p0[1] + L * 0.45];
    s += stroke([p0, p1, p2], r.range(1.6, 2.6), i % 4 === 0 ? dk(plume, 0.35) : plume, r, 0.92, { taperIn: 0.15, taperOut: 0.7, jitter: 0.3 });
  }
  s += fill(ell(tx, ky + 1, 4, 2.4), C.gold) + fill(ell(tx, ty - 18, 1.8, 2.4), C.gold);

  // wings (凤翅) behind the dome
  if (k === 'winghelm') {
    for (const sd of [-1, 1]) {
      const bx = sd < 0 ? hx - a * 1.05 : hx + a * 0.9, by0 = hairY - 2;
      const sc = sd < 0 ? 1 : 0.65;
      const wing: Pt[] = [[bx, by0 + 8], [bx + sd * 12 * sc, by0 - 4], [bx + sd * 22 * sc, by0 - 22 * sc], [bx + sd * 18 * sc, by0 - 40 * sc], [bx + sd * 10 * sc, by0 - 26 * sc], [bx + sd * 4 * sc, by0 - 12], [bx - sd * 3, by0]];
      s += fill(P(wing, true), C.gold);
      s += fill(P(wing, true), '#7a5520', 0.25, 'filter="url(#blur2)" transform="translate(2 2)"');
      for (let j = 1; j < 5; j++) s += stroke(qpts([bx + sd * j * 1.5, by0 + 4], [bx + sd * (6 + j * 3) * sc, by0 - (6 + j * 4) * sc], [bx + sd * (12 + j * 2) * sc, by0 - (14 + j * 6) * sc], 4), 0.8, '#6a4a1a', r, 0.7);
      s += stroke(wing.slice(0, 6), 1.1, C.ink, r, 0.7);
    }
  }

  s += fill(dd, col);
  // modelling: shadow to the back and bottom, highlight on the upper front
  s += `<clipPath id="domeclip"><path d="${dd}"/></clipPath>`;
  let sh = fill(dd, dk(col, 0.55), 0.55, 'filter="url(#blur5)" transform="translate(-9 6)"');
  sh += fill(ell(hx + a * 0.15, top + 10, a * 0.35, 7, -25), '#ffffff', 0.45, 'filter="url(#blur4)"');
  sh += fill(ell(hx + a * 0.55, hairY + 4, a * 0.2, 4, -40), '#ffffff', 0.25, 'filter="url(#blur3)"');
  // plates: ribs from brim to apex with rivets
  const ribs = peak ? [-0.7, -0.3, 0.15, 0.6] : [-0.75, -0.35, 0.05, 0.45, 0.85];
  for (const u of ribs) {
    const b0: Pt = [X(u, by - 2), by - 2];
    const c: Pt = [lerp(b0[0], tx, 0.35) + u * a * 0.25, lerp(b0[1], ty, 0.55)];
    sh += stroke(qpts(b0, c, [tx + u * 2, ty + 2], 7), 1.1, dk(col, 0.6), r, 0.55, { taperIn: 0.3, taperOut: 0.2 });
    for (let j = 1; j < 4; j++) {
      const p = qpts(b0, c, [tx, ty], 4)[j];
      sh += circ(p[0] + 1.6, p[1], 0.8, mix(col, '#ffffff', 0.5), 0.8);
    }
  }
  s += g(sh, 'clip-path="url(#domeclip)"');
  s += stroke(dome.slice(brim.length - 1), 1.7, C.ink, r, 0.85, { taperIn: 0.05, taperOut: 0.05, jitter: 0.25 });

  // brim band (眉庇) with the pointed visor
  const trim = m.hat.col2 === col ? C.gold : m.hat.col2;
  s += fill(band(brim, 5.2), trim);
  s += stroke(brim, 1.3, C.ink, r, 0.7, { taperIn: 0.05, taperOut: 0.05 });
  s += stroke(brim.map(([x, y]) => [x, y - 2.6] as Pt), 0.8, C.ink, r, 0.45);
  for (let i = 1; i < brim.length - 1; i++) if (i !== 3) s += circ(brim[i][0], brim[i][1] - 0.3, 1, C.gold);
  if (visor) {
    const vx = brim[3][0], vy = brim[3][1];
    s += fill(P([[vx - 6, vy - 3], [vx, vy + 5], [vx + 5, vy - 3]], true, 0.2), C.gold);
    s += stroke([[vx - 6, vy - 3], [vx, vy + 5], [vx + 5, vy - 3]], 0.9, C.ink, r, 0.6);
  }
  // front ornament
  const ox = X(0.06, by - 12), oy = by - 12;
  if (k === 'lionhelm') s += beastMask(m, ox, oy + 2);
  else if (m.r.chance(0.6) || peak) {
    // flaming pearl (火焰珠)
    for (let i = 0; i < 5; i++) {
      const ang = -Math.PI / 2 + (i - 2) * 0.45;
      s += stroke([[ox + Math.cos(ang) * 3, oy + Math.sin(ang) * 3], [ox + Math.cos(ang) * 8, oy + Math.sin(ang) * 9 - 1]], 2.2, C.gold, r, 0.95, { taperIn: 0.1, taperOut: 0.8 });
    }
    s += circ(ox, oy, 3.6, m.r.chance(0.5) ? C.cinnabar : '#6f9f84') + `<circle cx="${ox}" cy="${oy}" r="3.6" fill="none" stroke="${C.gold}" stroke-width="1.1"/>`;
    s += circ(ox - 1, oy - 1.2, 0.9, '#fff', 0.7);
  }
  return s;
}

function beastMask(m: Model, x: number, y: number) {
  const { r } = m;
  let s = '';
  // mane curls
  for (let i = 0; i < 7; i++) {
    const ang = Math.PI * (1.05 + (i / 6) * 0.9);
    const p: Pt = [x + Math.cos(ang) * 10, y + Math.sin(ang) * 8];
    s += stroke([[x + Math.cos(ang) * 5, y + Math.sin(ang) * 4], p, [p[0] + Math.cos(ang + 1.4) * 3, p[1] + Math.sin(ang + 1.4) * 3]], 2.4, '#b08d4a', r, 0.95, { taperIn: 0.2, taperOut: 0.5 });
  }
  const face: Pt[] = [[x - 8, y - 3], [x - 6, y - 7], [x, y - 8], [x + 6, y - 7], [x + 8, y - 3], [x + 6, y + 4], [x, y + 6], [x - 6, y + 4]];
  s += fill(P(face, true), C.gold);
  s += stroke([...face, face[0]], 0.9, '#5a3a10', r, 0.8);
  // brows, eyes, nose, fangs
  s += stroke([[x - 6, y - 3.5], [x - 3, y - 5], [x - 1, y - 3]], 1.1, '#5a3a10', r);
  s += stroke([[x + 6, y - 3.5], [x + 3, y - 5], [x + 1, y - 3]], 1.1, '#5a3a10', r);
  s += circ(x - 3, y - 1.5, 1.2, C.ink) + circ(x + 3, y - 1.5, 1.2, C.ink);
  s += fill(ell(x, y + 1, 1.8, 1.2), '#5a3a10');
  s += stroke([[x - 4, y + 3], [x, y + 4.2], [x + 4, y + 3]], 1, '#5a3a10', r);
  s += fill(P([[x - 3, y + 3.4], [x - 2.2, y + 6], [x - 1.6, y + 3.6]], true), '#fff6e0') + fill(P([[x + 3, y + 3.4], [x + 2.2, y + 6], [x + 1.6, y + 3.6]], true), '#fff6e0');
  return s;
}

/** 鹖冠: a dark cloth cap with two pheasant tail feathers standing up. */
function hequan(m: Model, fp: FaceParts) {
  const { X } = fp;
  const { hx, a, hairY, browY, r } = m;
  const top = hairY - 24;
  let s = '';
  for (const [dx, h, lean] of [[-0.55, 78, -12], [0.15, 70, 8]] as const) {
    const b0: Pt = [hx + dx * a, top + 2];
    const pts = qpts(b0, [b0[0] + lean * 0.3, b0[1] - h * 0.55], [b0[0] + lean, b0[1] - h], 10);
    s += stroke(pts, 5.5, '#2b2722', r, 0.95, { taperIn: 0.1, taperOut: 0.5 });
    for (let i = 2; i < pts.length - 1; i++) s += stroke([[pts[i][0] - 2.4, pts[i][1] + 1], [pts[i][0] + 2.4, pts[i][1] - 1]], 1.6, '#e8e2d2', r, 0.9);
  }
  const cap: Pt[] = [[X(0.96, browY - 8), browY - 8], [X(0.5, hairY + 2), hairY + 2], [X(-0.3, hairY + 2), hairY + 2], [hx - a * 1.12, browY - 2], [hx - a * 1.12, top + 6], [hx - a * 0.6, top - 6], [hx + a * 0.5, top - 4], [hx + a * 1.0, top + 10]];
  s += fill(P(cap, true, 0.35), '#26221e', 0.95);
  s += fill(ell(hx, top + 8, a * 0.4, 6), '#ffffff', 0.12, 'filter="url(#blur3)"');
  s += fill(band(cap.slice(0, 4), 4), m.hat.col2 === C.gold ? '#7a2a22' : m.hat.col2);
  s += stroke(cap.slice(3).concat([cap[0]]), 1.4, C.ink, r, 0.7);
  return s;
}
