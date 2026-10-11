// Face of the portrait: skin shape, ear, neck, shading and the brushed
// features (眉 eyes nose mouth), all in the facing-right 3/4 frame.
import { C, mix, type Pt } from '../ink.ts';
import { geo, type Model } from './_portrait_model.ts';
import { circ, ell, fill, g, lerp, P, qpts, stroke } from './_portrait_util.ts';

export function faceParts(m: Model) {
  const { X, W } = geo(m);
  const { hx, a, hairY, browY, eyeY, noseY, mouthY, chinY, th } = m;
  const sin = Math.sin(th);

  // hairline (frontal) — women have a rounder, lower line
  const hl: [number, number][] = m.female
    ? [[-0.82, browY - 1], [-0.7, hairY + 9], [-0.35, hairY + 1], [0.05, hairY], [0.45, hairY + 3], [0.8, hairY + 12], [0.97, browY - 5]]
    : [[-0.8, browY - 3], [-0.66, hairY + 9], [-0.32, hairY + 1], [0.08, hairY - 0.5], [0.5, hairY + 3], [0.84, hairY + 13], [0.97, browY - 7]];
  const hairline: Pt[] = hl.map(([u, y]) => [X(u, y), y]);

  const far: Pt[] = [
    [hx + W(browY - 7) * 0.99, browY - 7],
    [hx + W(browY + 1) + 0.8, browY + 1],
    [hx + W(eyeY + 1) - 0.7, eyeY + 1],
    [hx + W(eyeY + 10) + 0.4, eyeY + 10],
    [hx + W(noseY + 3) * 0.98 - 0.8, noseY + 3],
    [hx + W(mouthY - 1) * 0.97, mouthY - 1],
    [X(0.9, mouthY + 6), mouthY + 6],
    [X(0.68, chinY - 7), chinY - 7],
    [X(0.4, chinY - 2.5), chinY - 2.5],
    [X(0.1, chinY) + 2.5, chinY],
  ];
  const sq = m.female ? 0 : Math.max(0, m.jaw - 0.95) * 10; // squarer jaws for big men
  const near: Pt[] = [
    [X(-0.3, chinY - 0.8), chinY - 0.8],
    [X(-0.62 - sq * 0.04, chinY - 4.5 - sq * 0.3), chinY - 4.5 - sq * 0.3],
    [X(-0.86 - sq * 0.03, mouthY + 6 - sq * 0.5), mouthY + 6 - sq * 0.5],
    [X(-0.98, mouthY - 3), mouthY - 3],
    [X(-1, noseY - 2) - 0.5, noseY - 2],
    [X(-1, eyeY + 4), eyeY + 4],
    [X(-0.9, eyeY - 3), eyeY - 3],
  ];
  const facePath = P([...hairline, ...far.slice(1), ...near], true, 0.45);
  const jawLine: Pt[] = [...far.slice(4), ...near.slice(0, 5)];
  const chinPt: Pt = far[far.length - 1];

  // ear (near side), anchored at the head side
  const es = m.ear.size;
  const ex = X(-1, eyeY + 6) + 1.5;
  const et = browY + 3 + (1 - es) * 4, eb = noseY + 2 + (m.ear.lobe - 1) * 5 + (es - 1) * 8;
  const ew = 8.5 * es;
  const earPts: Pt[] = [[ex, et + 4], [ex - ew * 0.45, et - 1], [ex - ew, et + 3], [ex - ew * 1.05, (et + eb) / 2], [ex - ew * 0.8, eb - 6], [ex - ew * 0.45, eb + 0.5], [ex - 1, eb - 2]];

  return { X, W, hairline, far, near, facePath, jawLine, chinPt, ear: { ex, et, eb, ew, pts: earPts }, sin };
}
export type FaceParts = ReturnType<typeof faceParts>;

/** Neck (drawn before the clothes). */
export function drawNeck(m: Model, fp: FaceParts) {
  const { X } = fp;
  const { hx, a, noseY, chinY } = m;
  const nb = m.female ? 0.62 : 0.74;
  const back: Pt[] = [[hx - a * nb, noseY + 2], [hx - a * (nb + 0.02), chinY + 8], [hx - a * (nb + 0.08), chinY + 24]];
  const front: Pt[] = [[X(0.42, chinY - 3), chinY - 3], [X(0.38, chinY) + 1, chinY + 12], [hx + a * 0.5, chinY + 24]];
  const d = P([...back, [hx - a * 0.2, chinY + 28], ...front.reverse()], true);
  const sh = mix(m.skin, m.skinLine, 0.28);
  let s = fill(d, m.skin);
  // shadow cast by the jaw
  s += fill(P([[hx - a * 0.86, noseY + 6], [hx - a * 0.4, chinY + 4], [X(0.2, chinY + 1), chinY + 6], [X(0.5, chinY - 2), chinY - 2], [X(0.45, chinY + 12), chinY + 16], [hx - a * 0.2, chinY + 18], [hx - a * 0.9, chinY + 14]], true), sh, 0.6, 'filter="url(#blur3)"');
  s += stroke(back, 1.6, m.skinLine, m.r, 0.7);
  s += stroke([[X(0.48, chinY + 1), chinY + 1], [X(0.45, chinY) + 1, chinY + 12], [hx + a * 0.53, chinY + 20]], 1.4, m.skinLine, m.r, 0.6);
  if (!m.female && m.look.age !== 'young') {
    // Adam's apple hint
    s += stroke(qpts([X(0.3, chinY + 10), chinY + 10], [X(0.38, chinY + 13) + 1, chinY + 13], [X(0.3, chinY + 17), chinY + 17], 4), 0.9, m.skinLine, m.r, 0.35);
  }
  return s;
}

export function drawEar(m: Model, fp: FaceParts) {
  const { ex, et, eb, ew, pts } = fp.ear;
  let s = fill(P(pts, true), m.skin);
  s += fill(P(pts, true), mix(m.skin, m.skinLine, 0.2), 0.5);
  s += stroke(pts.slice(0, 6), 1.5, m.skinLine, m.r, 0.85, { taperIn: 0.1, taperOut: 0.2 });
  // helix / antihelix
  s += stroke(qpts([ex - ew * 0.55, et + 3], [ex - ew * 0.9, (et + eb) / 2 - 2], [ex - ew * 0.45, eb - 7], 6), 1.1, m.skinLine, m.r, 0.6);
  s += stroke(qpts([ex - ew * 0.2, (et + eb) / 2 - 3], [ex - ew * 0.5, (et + eb) / 2 + 1], [ex - ew * 0.2, (et + eb) / 2 + 4], 4), 1.1, m.skinLine, m.r, 0.55);
  if (m.extras.has('earrings')) {
    const y = eb + 2, x = ex - ew * 0.45;
    s += m.female
      ? `<line x1="${x}" y1="${y - 1}" x2="${x}" y2="${y + 6}" stroke="${C.gold}" stroke-width="0.9"/>${circ(x, y + 8, 2.2, '#6f9f84')}${circ(x - 0.6, y + 7.3, 0.7, '#fff', 0.7)}`
      : `<ellipse cx="${x}" cy="${y + 5}" rx="3.2" ry="4.2" fill="none" stroke="${C.gold}" stroke-width="1.4"/>`;
  }
  return s;
}

/** Skin, shading and features. */
export function drawFace(m: Model, fp: FaceParts) {
  const { X, facePath, far } = fp;
  const { hx, a, hairY, browY, eyeY, noseY, mouthY, chinY, r } = m;
  const shade = mix(m.skin, m.skinLine, 0.35);
  let s = '';
  s += `<clipPath id="faceclip"><path d="${facePath}"/></clipPath>`;
  s += fill(facePath, m.skin);
  // ---- soft modelling washes (clipped to the face)
  let w = '';
  // far side of the face turns away from the light
  w += fill(P([...far.map(([x, y]) => [x + 6, y] as Pt), [X(0.62, chinY - 2), chinY], [X(0.62, mouthY), mouthY], [X(0.58, noseY), noseY], [X(0.62, eyeY + 4), eyeY + 4], [X(0.78, browY - 4), browY - 4]], true), shade, 0.55, 'filter="url(#blur4)"');
  // eye sockets
  for (const sd of [-1, 1]) {
    const u = sd * m.eye.ue;
    w += fill(ell(X(u, eyeY - 2), eyeY - 2.5, 9 * (sd < 0 ? 1 : 0.7), 5.5), shade, 0.42, 'filter="url(#blur3)"');
  }
  // nose side + under nose
  w += fill(ell(X(0.18, noseY - 6), noseY - 6, 3.2, 9), shade, 0.5, 'filter="url(#blur3)"');
  w += fill(ell(X(0.02, noseY + 3.5), noseY + 3.5, 6, 2.2), shade, 0.45, 'filter="url(#blur2)"');
  // under lower lip, jaw edge
  w += fill(ell(X(0.06, mouthY + 6), mouthY + 6, 6, 2.4), shade, 0.35, 'filter="url(#blur2)"');
  w += fill(P([...fp.jawLine.map(([x, y]) => [x, y + 2] as Pt)], false) + `L${hx},${chinY + 30}Z`, shade, 0.4, 'filter="url(#blur4)"');
  // temples near the hairline (shaved/blue tint for men)
  if (!m.female) w += fill(P(fp.hairline.map(([x, y]) => [x, y + 1] as Pt).concat([[X(0.5, hairY + 9), hairY + 9], [X(-0.4, hairY + 9), hairY + 9]]), true), mix(m.skin, '#4e5560', 0.45), 0.4, 'filter="url(#blur3)"');
  // cheeks
  w += fill(ell(X(-0.5, eyeY + 13), eyeY + 13, 10, 7), '#d4716a', m.blush, 'filter="url(#blur5)"');
  w += fill(ell(X(0.7, eyeY + 13), eyeY + 13, 5, 6), '#d4716a', m.blush * 0.8, 'filter="url(#blur4)"');
  // forehead light
  w += fill(ell(X(-0.05, hairY + 12), hairY + 12, 15, 7), '#fbf3e6', 0.25, 'filter="url(#blur5)"');
  if (m.extras.has('tattoo')) {
    for (let i = 0; i < 3; i++) w += stroke([[X(-0.75 + i * 0.12, eyeY + 8), eyeY + 8], [X(-0.68 + i * 0.12, eyeY + 15), eyeY + 15], [X(-0.75 + i * 0.12, eyeY + 22), eyeY + 22]], 1.3, '#2f4f74', r, 0.6);
  }
  s += g(w, 'clip-path="url(#faceclip)"');
  // ---- contour
  const cont = [...far.slice(1), ...fp.near.slice(0, 5)];
  s += stroke(cont, 1.5, m.skinLine, r, 0.8, { taperIn: 0.1, taperOut: 0.15, jitter: 0.25 });
  s += drawBrows(m, X);
  s += drawEyes(m, X);
  s += drawNose(m, X);
  s += drawMouth(m, X);
  s += drawWrinkles(m, X);
  if (m.extras.has('furrow')) {
    for (const du of [-0.05, 0.04]) s += stroke([[X(du, browY - 6), browY - 6], [X(du * 1.4, browY + 1), browY + 1]], 1, m.skinLine, r, 0.45);
  }
  if (m.extras.has('scar')) s += stroke([[X(-0.6, eyeY + 4), eyeY + 4], [X(-0.42, eyeY + 12), eyeY + 12], [X(-0.3, eyeY + 20), eyeY + 20]], 1.4, '#8c4038', r, 0.7);
  void a;
  return s;
}

// ------------------------------------------------------------------ brows
function drawBrows(m: Model, X: (u: number, y: number) => number) {
  const { r, eye, brow } = m;
  const base = m.browY - brow.lift;
  let s = '';
  for (const sd of [-1, 1]) {
    const inner = sd * brow.gap, outer = sd * (eye.ue + eye.ew + (m.female ? 0.1 : 0.08));
    const fsd = sd > 0 ? 0.85 : 1;
    const N = 8;
    const pts: Pt[] = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const u = lerp(inner, outer, t);
      let y = base;
      switch (brow.kind) {
        case 'sword': y += 1.8 - t * 4.5 - Math.sin(Math.PI * t) * 0.8; break;
        case 'silkworm': y += 0.5 - Math.sin(Math.PI * Math.pow(t, 0.8)) * 3 - t * 1.5; break;
        case 'willow': y += 0.5 - Math.sin(Math.PI * Math.pow(t, 0.75)) * 3.2 + t * 0.8; break;
        case 'bushy': y += 0.5 - Math.sin(Math.PI * t) * 1.8 - t * 1.2; break;
        case 'knit': y += -(1 - t) * 1.5 - Math.sin(Math.PI * t) * 1.2 + t * 0.8; break;
        case 'fierce': y += 3 * (1 - t) - t * 3 - Math.sin(Math.PI * t) * 0.6; break;
        case 'flat': y += -Math.sin(Math.PI * t) * 1.5; break;
        case 'sparse': y += -Math.sin(Math.PI * t) * 1.6 + t * 0.5; break;
      }
      pts.push([X(u, y), y]);
    }
    const w = brow.w * fsd;
    const col = brow.col;
    if (brow.kind === 'bushy') {
      s += stroke(pts, w * 0.9, col, r, 0.75, { taperIn: 0.05, taperOut: 0.4 });
      for (let i = 0; i < 9; i++) {
        const t = (i + 0.5) / 9;
        const p = pts[Math.floor(t * N)];
        const dx = (pts[N][0] - pts[0][0]) / N;
        s += stroke([[p[0] - dx * 0.4, p[1] + w * 0.35], [p[0] + dx * 0.6, p[1] - w * 0.2], [p[0] + dx * 1.3, p[1] - w * 0.55 - r.range(0, 1.5)]], 1.3, col, r, 0.9, { taperIn: 0.2, taperOut: 0.6 });
      }
    } else if (brow.kind === 'silkworm') {
      s += stroke(pts, w, col, r, 0.95, { taperIn: 0.35, taperOut: 0.35, jitter: 0.08 });
    } else if (brow.kind === 'sparse') {
      s += stroke(pts, w, col, r, 0.6, { taperIn: 0.25, taperOut: 0.5 });
    } else {
      s += stroke(pts, w, col, r, 0.95, { taperIn: brow.kind === 'sword' || brow.kind === 'fierce' ? 0.08 : 0.25, taperOut: 0.55 });
      if (!m.female) {
        // a few hair flicks along the top edge
        for (let i = 2; i < N - 1; i += 2) {
          const p = pts[i], q = pts[i + 1];
          s += stroke([[p[0], p[1] + 0.5], [q[0] + (q[0] - p[0]) * 0.5, q[1] - w * 0.5]], 0.9, col, r, 0.6, { taperIn: 0.2, taperOut: 0.7 });
        }
      }
    }
  }
  return s;
}

// ------------------------------------------------------------------ eyes
function drawEyes(m: Model, X: (u: number, y: number) => number) {
  const { r, eye, eyeY } = m;
  let s = '';
  for (const sd of [-1, 1]) {
    if (sd > 0 && m.extras.has('eyepatch')) continue;
    const uc = sd * eye.ue;
    const inner = uc - sd * eye.ew, outer = uc + sd * eye.ew;
    const eh = eye.eh;
    const N = 10;
    const up: Pt[] = [], lo: Pt[] = [];
    const peak = { almond: 0.45, phoenix: 0.38, round: 0.5, narrow: 0.45, droop: 0.4 }[eye.kind];
    const lowPeak = { almond: 0.55, phoenix: 0.6, round: 0.5, narrow: 0.55, droop: 0.6 }[eye.kind];
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const u = lerp(inner, outer, t);
      const sl = eye.slant * (t - 0.4);
      const bu = Math.sin(Math.PI * Math.pow(t, Math.log(0.5) / Math.log(peak)));
      const bl = Math.sin(Math.PI * Math.pow(t, Math.log(0.5) / Math.log(lowPeak)));
      const yu = eyeY - eh * Math.pow(bu, 0.8) - sl - (eye.kind === 'droop' ? -t * t * 1.5 : 0);
      const yl = eyeY + eh * 0.5 * Math.pow(bl, 0.9) - sl + (eye.kind === 'phoenix' ? -t * 0.6 : 0);
      up.push([X(u, yu), yu]);
      lo.push([X(u, yl), yl]);
    }
    const shape = P([...up, ...lo.slice(1, -1).reverse()], true, 0.45);
    const id = `eye${sd < 0 ? 'n' : 'f'}`;
    s += `<clipPath id="${id}"><path d="${shape}"/></clipPath>`;
    s += fill(shape, '#f3ede0');
    // iris
    const ui = uc + eye.gaze + sd * 0.01;
    const ix = X(ui, eyeY), iy = eyeY - eh * 0.15;
    const ir = Math.min(eh * 1.1 + 1.7, 5) * (eye.kind === 'round' ? 0.85 : 1);
    const rx = ir * (sd > 0 ? 0.72 : 0.9);
    let iris = `<ellipse cx="${ix}" cy="${iy}" rx="${rx}" ry="${ir}" fill="${eye.iris}"/>`;
    iris += `<ellipse cx="${ix}" cy="${iy}" rx="${rx * 0.5}" ry="${ir * 0.5}" fill="#0c0806"/>`;
    iris += fill(P(up, false) + `L${up[N][0]},${up[0][1] - 10}L${up[0][0]},${up[0][1] - 10}Z`, '#5a4a3a', 0.25);
    s += g(iris, `clip-path="url(#${id})"`);
    s += circ(ix - rx * 0.3, iy - ir * 0.25, Math.max(0.55, ir * 0.16), '#fffaf0', 0.85);
    // upper lid (strong) — phoenix eyes get a lifted tail
    const lid = [...up];
    if (eye.kind === 'phoenix' || m.female) {
      const e = up[N];
      lid.push([e[0] + sd * 2.6 * (sd > 0 ? 0.6 : 1), e[1] - (eye.kind === 'phoenix' ? 1.8 : 0.6)]);
    }
    const lw = (m.female ? 2.4 : 2.1) * (sd > 0 ? 0.85 : 1);
    s += stroke(lid, lw, C.ink, r, 0.95, { taperIn: 0.18, taperOut: 0.3, jitter: 0.08 });
    // lower lid
    s += stroke(lo.slice(3), 0.9, m.skinLine, r, 0.55, { taperIn: 0.3, taperOut: 0.2 });
    // crease (double lid)
    const cr = up.slice(2, N).map(([x, y]) => [x + sd * 0.4, y - eh * 0.5 - 1.6] as Pt);
    s += stroke(cr, 0.9, m.skinLine, r, 0.38 * eye.lids, { taperIn: 0.4, taperOut: 0.4 });
    if (eye.kind === 'round') s += stroke(lo.slice(1, N).map(([x, y]) => [x, y + 0.6] as Pt), 0.8, m.skinLine, r, 0.4);
  }
  if (m.extras.has('eyepatch')) {
    const ux = X(m.eye.ue, eyeY), y = eyeY - 1;
    s += fill(P([[ux - 7, y - 5], [ux + 4, y - 7], [ux + 9, y - 1], [ux + 5, y + 6], [ux - 5, y + 5]], true), '#1e1a16', 0.95);
    s += stroke([[ux + 8, y - 4], [m.hx + m.a * 0.3, m.hairY + 2], [m.hx - m.a * 0.9, m.hairY + 6]], 1.6, '#1e1a16', r, 0.9, { taperIn: 0.05, taperOut: 0.1 });
    s += stroke([[ux - 6, y + 2], [m.hx - m.a * 0.95, eyeY + 4]], 1.4, '#1e1a16', r, 0.9, { taperIn: 0.05, taperOut: 0.1 });
  }
  return s;
}

// ------------------------------------------------------------------ nose
function drawNose(m: Model, X: (u: number, y: number) => number) {
  const { r, noseY, browY, eyeY, th, nose } = m;
  const sin = Math.sin(th);
  const dep = nose.depth * sin;
  const tipX = X(0, noseY - 2) + dep;
  const tipY = noseY - 1.5;
  let s = '';
  // bridge profile against the far cheek: faint at the top, firm at the tip
  const bridge: Pt[] = [
    [X(0.06, browY + 5) + 0.6, browY + 5],
    [X(0.02, eyeY + 4) + dep * 0.35 + nose.hook * 0.3, eyeY + 4],
    [X(0, noseY - 9) + dep * 0.75 + nose.hook * 0.6, noseY - 9],
    [tipX + 0.8, tipY - 2],
  ];
  s += stroke(bridge, 1.2, m.skinLine, r, 0.42, { taperIn: 0.5, taperOut: 0.1 });
  // tip and septum
  const tip: Pt[] = [[tipX + 0.8, tipY - 3], [tipX + 1.2, tipY + 0.5], [tipX - 0.5, noseY + 1.8], [X(0.03, noseY + 2.3), noseY + 2.3]];
  s += stroke(tip, 1.5, m.skinLine, r, 0.85, { taperIn: 0.3, taperOut: 0.4 });
  // near nostril wing
  const wx = X(-0.17 * nose.wide, noseY);
  const wing: Pt[] = [[X(-0.09, noseY - 5), noseY - 5], [wx - 1.2, noseY - 2], [wx - 0.8, noseY + 1.2], [X(-0.07, noseY + 2.4), noseY + 2.4]];
  s += stroke(wing, 1.7, m.skinLine, r, 0.9, { taperIn: 0.4, taperOut: 0.3 });
  // nostrils
  s += fill(ell(X(-0.06, noseY + 1.3), noseY + 1.3, 1.9, 0.9, -10), '#3a2418', 0.75);
  s += fill(ell(tipX - 3, noseY + 1.5, 0.9, 0.6), '#3a2418', 0.5);
  return s;
}

// ------------------------------------------------------------------ mouth
function drawMouth(m: Model, X: (u: number, y: number) => number) {
  const { r, mouthY, mouth } = m;
  const mw = mouth.w;
  let s = '';
  const N = 8;
  const line: Pt[] = [];
  const cy = (t: number) => {
    // corner offsets by expression; t 0 = near corner, 1 = far corner
    const e = Math.pow(2 * t - 1, 2);
    switch (mouth.kind) {
      case 'smile': return -e * 1.6 + 0.3;
      case 'frown': return e * 1.8 - 0.3;
      case 'smirk': return t > 0.5 ? -e * 2 : e * 0.5;
      case 'pout': return e * 0.6;
      case 'shout': return e * 0.8;
      default: return e * 0.5;
    }
  };
  const mw2 = mouth.kind === 'pout' ? mw * 0.8 : mw;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const u = lerp(-mw2, mw2 * 0.95, t);
    const y = mouthY + cy(t) + (Math.abs(t - 0.5) < 0.12 ? 0.5 : 0);
    line.push([X(u, y), y]);
  }
  const lip = m.lip;
  const lh = 2.4 + mouth.lip * 0.9;
  if (mouth.kind === 'shout') {
    // open mouth, teeth showing
    const top = line.map(([x, y], i) => [x, y - 1 - Math.sin((Math.PI * i) / N) * 0.8] as Pt);
    const bot = line.map(([x, y], i) => [x, y + Math.sin((Math.PI * i) / N) * 5.5] as Pt);
    const op = P([...top, ...bot.reverse()], true);
    s += fill(op, '#3a1612');
    s += fill(P([...top, ...top.slice().reverse().map(([x, y]) => [x, y + 2.2] as Pt)], true), '#efe8da', 0.95);
    s += stroke(top, 1.6, m.skinLine, r, 0.9);
    s += stroke(bot.slice(1, -1), 1.2, m.skinLine, r, 0.6);
    return s;
  }
  // upper lip
  const upper: Pt[] = line.map(([x, y], i) => {
    const t = i / N;
    const bow = Math.abs(t - 0.5) < 0.1 ? 0.9 : 0;
    return [x, y - Math.sin(Math.PI * t) * lh * 0.75 + bow];
  });
  s += fill(P([...line, ...upper.reverse()], true), lip, m.female ? 0.8 : 0.4);
  // lower lip
  const lower: Pt[] = line.map(([x, y], i) => [x, y + Math.pow(Math.sin((Math.PI * i) / N), 0.8) * lh] as Pt);
  s += fill(P([...line, ...lower.reverse()], true), lip, m.female ? 0.55 : 0.28);
  if (m.female) s += fill(ell(line[N / 2][0], mouthY + lh * 0.55, 1.6, 0.6), '#fff4ea', 0.5);
  // the parting line: darkest at the corners and the middle
  s += stroke(line, m.female ? 1.4 : 1.7, mix(m.skinLine, '#3a0d08', 0.4), r, 0.92, { taperIn: 0.15, taperOut: 0.2 });
  // corner tick
  s += stroke([[line[0][0] - 1, line[0][1] - 1], [line[0][0] - 0.3, line[0][1] + 1.3]], 0.9, m.skinLine, r, 0.5);
  // shadow under lower lip
  if (!m.female) s += stroke(line.slice(3, 7).map(([x, y]) => [x, y + lh + 2] as Pt), 1.1, m.skinLine, r, 0.3);
  return s;
}

// ------------------------------------------------------------------ age
function drawWrinkles(m: Model, X: (u: number, y: number) => number) {
  const { r, wrinkles: k, eyeY, noseY, mouthY, browY, hairY } = m;
  let s = '';
  // nasolabial folds (adults get a faint one)
  const nl = m.female ? 0.12 : 0.2 + k * 0.5;
  if (nl > 0.15 && m.look.age !== 'young') {
    s += stroke(qpts([X(-0.24, noseY - 1), noseY - 1], [X(-0.38, noseY + 5), noseY + 5], [X(-0.36, mouthY + 4), mouthY + 4], 6), 1.2, m.skinLine, r, nl);
    s += stroke(qpts([X(0.26, noseY), noseY], [X(0.38, noseY + 6), noseY + 6], [X(0.34, mouthY + 3), mouthY + 3], 6), 1, m.skinLine, r, nl * 0.7);
  }
  if (k < 0.3) return s;
  // forehead lines
  for (let i = 0; i < 3; i++) {
    const y = browY - 7 - i * 4;
    if (y < hairY + 4) break;
    s += stroke([[X(-0.4 + i * 0.05, y + 1), y + 1], [X(0, y - 0.6), y - 0.6], [X(0.4 - i * 0.05, y + 0.8), y + 0.8]], 1, m.skinLine, r, 0.25 * k);
  }
  // crow's feet, eye bags
  const ox = X(-m.eye.ue - m.eye.ew - 0.04, eyeY);
  for (let i = -1; i <= 1; i++) s += stroke([[ox, eyeY + i * 1.8], [ox - 4, eyeY + i * 3.2]], 0.8, m.skinLine, r, 0.35 * k);
  for (const sd of [-1, 1]) {
    const u = sd * m.eye.ue;
    s += stroke([[X(u - 0.12, eyeY + 4), eyeY + 4], [X(u, eyeY + 6.5), eyeY + 6.5], [X(u + 0.14, eyeY + 4.5), eyeY + 4.5]], 0.9, m.skinLine, r, 0.35 * k);
  }
  // glabella
  s += stroke([[X(-0.06, browY + 1), browY + 1], [X(-0.04, browY - 4), browY - 4]], 0.8, m.skinLine, r, 0.3 * k);
  return s;
}
