// Headwear (helmets, crowns, caps, scarves) and dress (robes, armour, furs,
// gowns, imperial robes) of the portrait.
import { C, mix, type Pt } from '../ink.ts';
import type { FaceParts } from './_portrait_face.ts';
import type { Model } from './_portrait_model.ts';
import { helmBack, helmFront, isHelm } from './_portrait_helm.ts';
import { along, band, circ, ell, fill, g, lerp, P, qpts, stroke } from './_portrait_util.ts';


const lineInt = (a: Pt, b: Pt, c: Pt, d: Pt): Pt => {
  const den = (a[0] - b[0]) * (c[1] - d[1]) - (a[1] - b[1]) * (c[0] - d[0]);
  const t = ((a[0] - c[0]) * (c[1] - d[1]) - (a[1] - c[1]) * (c[0] - d[0])) / den;
  return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
};

// ------------------------------------------------------------------ headwear
/** Parts of the headwear behind the head (helmet flaps, scarf/band tails, back strings). */
export function hatBack(m: Model, fp: FaceParts) {
  const { hx, a, hairY, browY, eyeY, noseY, mouthY, r } = m;
  const top = hairY - 24;
  const k = m.hat.kind;
  const col = m.hat.col;
  let s = '';
  if (isHelm(k)) s += helmBack(m, fp);
  if (k === 'futou') {
    const kx = hx - a * 1.05, ky = top + 12;
    for (const [dx, len] of [[0, 1], [-6, 0.8]]) {
      const pts: Pt[] = [[kx, ky], [kx - 8 + dx, ky + 16], [kx - 6 + dx, ky + 34 * len], [kx - 12 + dx, ky + 46 * len]];
      s += fill(band(pts, 5, 7), '#26221e', 0.95);
    }
  }
  if (k === 'scarf' || k === 'yellowscarf') {
    // two tails from the knot at the back
    const kx = hx - a * 1.12, ky = browY - 2;
    for (const [dx, len] of [[0, 1], [-8, 0.85]]) {
      const pts: Pt[] = [[kx + 2, ky], [kx - 10 + dx, ky + 30], [kx - 4 + dx, ky + 60 * len], [kx - 14 + dx, ky + 88 * len]];
      s += fill(band(pts, 9, 13), col, 0.95);
      s += stroke(pts, 0.9, C.ink, r, 0.4);
    }
  }
  if (k === 'headband' || k === 'feathers') {
    const kx = hx - a * 1.1, ky = hairY + 10;
    for (const [dy, ln] of [[0, 1], [6, 0.8]]) {
      const pts: Pt[] = [[kx, ky], [kx - 14, ky + 8 + dy], [kx - 22, ky + 30 + dy], [kx - 34 * ln, ky + 46 + dy]];
      s += fill(band(pts, 6, 3), col, 0.95);
    }
  }
  if (k === 'mian') {
    // back bead strings behind the head
    for (let i = 0; i < 4; i++) {
      const x = hx - a * (1.2 + i * 0.1), y0 = top - 14 + i;
      s += `<line x1="${x}" y1="${y0}" x2="${x}" y2="${y0 + 40}" stroke="#2b2722" stroke-width="0.6"/>`;
      for (let j = 0; j < 8; j++) s += circ(x, y0 + 5 + j * 4.5, 1.5, j % 2 ? '#6f9f84' : '#f2ede0', 0.9);
    }
  }
  if (k === 'guan' || k === 'wuguan') {
    // cap ribbons hanging behind
    s += fill(band([[hx - a * 1.02, hairY + 6], [hx - a * 1.08, eyeY + 10], [hx - a * 1.05, mouthY + 10]], 3, 2.4), '#2a2622', 0.9);
  }
  void eyeY;
  return s;
}

/** Headwear on top of hair and face. */
export function hatFront(m: Model, fp: FaceParts) {
  const { X } = fp;
  const { hx, a, hairY, browY, eyeY, r } = m;
  const top = hairY - 24;
  const k = m.hat.kind;
  const col = m.hat.col;
  let s = '';
  const hl = (c: string, x: number, y: number, rx: number, ry: number, op = 0.35) => fill(ell(x, y, rx, ry, -20), c, op, 'filter="url(#blur4)"');

  if (isHelm(k)) return helmFront(m, fp);

  if (k === 'mian') {
    const cap: Pt[] = [[X(0.95, hairY + 8), hairY + 8], [X(0.4, hairY + 2), hairY + 2], [X(-0.4, hairY + 2), hairY + 3], [hx - a * 1.08, hairY + 6], [hx - a * 1.02, top + 2], [hx + a * 0.8, top - 2]];
    s += fill(P(cap, true, 0.3), '#1f1b18');
    s += fill(band(cap.slice(0, 4), 4), C.gold, 0.9);
    // the board (綖) seen in perspective, tilted forward
    const b0: Pt = [hx - a * 1.5, top - 6], b1: Pt = [hx + a * 1.45, top - 13], b2: Pt = [hx + a * 1.15, top - 22], b3: Pt = [hx - a * 1.75, top - 14];
    s += fill(P([b0, b1, [b1[0], b1[1] + 4], [b0[0], b0[1] + 4]], true, 0), '#7a2a22');
    s += fill(P([b0, b1, b2, b3], true, 0), '#1f1b18');
    s += fill(P([[b0[0] + 3, b0[1] - 1.5], [b1[0] - 3, b1[1] - 1.5], [b2[0] - 3, b2[1] + 1.5], [b3[0] + 3, b3[1] + 1.5]], true, 0), '#4a2a22', 0.6);
    s += stroke([b0, b1], 1.2, C.gold, r, 0.95, { taperIn: 0.02, taperOut: 0.02 });
    // front strings of jade beads (旒)
    for (let i = 0; i < 12; i++) {
      const t = (i + 0.5) / 12;
      const x = lerp(b0[0], b1[0], t), y0 = lerp(b0[1], b1[1], t) + 4;
      const y1 = Math.min(browY - 4, y0 + 34) + Math.sin(i * 1.7) * 1.5;
      s += `<line x1="${x.toFixed(2)}" y1="${y0.toFixed(2)}" x2="${x.toFixed(2)}" y2="${y1.toFixed(2)}" stroke="#2b2722" stroke-width="0.6" opacity="0.8"/>`;
      for (let y = y0 + 4; y <= y1; y += 4.4) s += circ(x, y, 1.45, ['#f2ede0', '#6f9f84', '#b13a2a', '#d4a12a'][Math.round((y - y0) / 4.4) % 4], 0.95);
    }
    // jade ear-plugs on red cords (充耳)
    s += stroke([[hx - a * 1.05, hairY + 6], [hx - a * 1.08, eyeY - 2]], 1.2, C.cinnabar, r);
    s += circ(hx - a * 1.08, eyeY + 1, 3, '#6f9f84') + circ(hx - a * 1.09, eyeY, 1, '#fff', 0.6);
    s += stroke([[hx - a * 1.6, top + 2], [hx + a * 1.0, top - 6]], 1.6, C.gold, r, 0.95);
    return s;
  }

  const bx = hx - a * 0.18, by = top - 6; // topknot position
  if (k === 'goldcrown' || k === 'taoist' || k === 'phoenix') {
    const gold = k === 'taoist' ? '#8a6a42' : C.gold;
    if (m.extras.has('pheasant')) {
      for (const [dx, sc] of [[-3, -1], [4, 0.9]]) {
        const pts = qpts([bx + dx, by - 6], [bx + dx + 40 * sc, by - 16], [bx + dx + 78 * sc, by + 34], 14);
        s += stroke(pts, 4.5, '#b07a3a', r, 0.95, { taperIn: 0.05, taperOut: 0.6 });
        for (let i = 1; i < pts.length - 2; i += 1) s += stroke([[pts[i][0] - 2.5, pts[i][1]], [pts[i][0] + 2.5, pts[i][1] - 1]], 1.1, C.ink, r, 0.75);
      }
    }
    if (k === 'phoenix') {
      // gold phoenix (凤) ornament on the bun, with dangling pearls
      const px = hx - a * 0.1, py = top - 14;
      const bird: Pt[] = [[px + 16, py + 2], [px + 10, py - 6], [px, py - 4], [px - 12, py - 12], [px - 22, py - 22], [px - 16, py - 6], [px - 26, py - 8], [px - 12, py + 4], [px + 6, py + 6]];
      s += fill(P(bird, true), C.gold, 0.95);
      s += stroke(bird.slice(0, 6), 1, '#6a4a1a', r, 0.7);
      s += circ(px + 12, py - 2, 1.2, C.ink);
      for (let i = 0; i < 5; i++) {
        const x = px - 20 + i * 8, y0 = py + 4;
        s += `<line x1="${x}" y1="${y0}" x2="${x}" y2="${y0 + 12 + (i % 2) * 5}" stroke="${C.gold}" stroke-width="0.6"/>`;
        s += circ(x, y0 + 13 + (i % 2) * 5, 1.5, '#f6f2e8');
      }
      return s;
    }
    const crown: Pt[] = [[bx - 12, by + 8], [bx - 13, by - 3], [bx - 8, by - 9], [bx - 4, by - 3], [bx, by - 14], [bx + 4, by - 3], [bx + 9, by - 10], [bx + 12, by - 2], [bx + 12, by + 8]];
    s += fill(P(crown, true, 0.25), gold);
    s += fill(ell(bx - 4, by - 2, 4, 6), '#fff6d0', 0.4, 'filter="url(#blur2)"');
    s += stroke([...crown, crown[0]], 1.2, C.ink, r, 0.75, { taperIn: 0.02, taperOut: 0.02 });
    s += circ(bx, by + 2, 2.4, k === 'taoist' ? '#e8e2d2' : C.cinnabar);
    s += stroke([[bx - 20, by + 5], [bx + 22, by - 2]], 1.8, k === 'taoist' ? '#e8e2d2' : C.gold, r, 0.95, { taperIn: 0.05, taperOut: 0.05 });
    return s;
  }

  if (k === 'guan') {
    const bandPts: Pt[] = [[X(0.92, hairY + 9), hairY + 9], [X(0.4, hairY + 1), hairY + 1], [X(-0.3, hairY + 1), hairY + 1], [X(-0.75, hairY + 6), hairY + 6], [hx - a * 1.08, hairY + 9]];
    const plate: Pt[] = [[hx + a * 0.42, top + 6], [hx + a * 0.18, top - 18], [hx - a * 0.48, top - 26], [hx - a * 0.78, top + 4]];
    s += fill(P(plate, true, 0.15), '#1f1b18', 0.92);
    for (let i = 1; i <= 2; i++) s += stroke([lerp2(plate[0], plate[3], i / 3), lerp2(plate[1], plate[2], i / 3)], 0.9, '#6b6255', r, 0.7);
    s += fill(P([[hx - a * 0.95, hairY + 8], [hx - a * 0.92, top + 2], [hx + a * 0.6, top + 4], [X(0.92, hairY + 8), hairY + 8]], true), '#1f1b18', 0.95);
    s += fill(band(bandPts, 5), '#2a2622');
    s += stroke([[hx - a * 1.25, top + 4], [hx + a * 0.75, top - 2]], 1.6, m.hat.col2 === C.cinnabar ? C.gold : m.hat.col2, r, 0.95);
    return s;
  }
  if (k === 'smallcap') {
    // small lacquered cap (小冠) over the topknot, pinned through
    const cap: Pt[] = [[bx - 12, by + 9], [bx - 13, by - 4], [bx - 6, by - 11], [bx + 6, by - 12], [bx + 12, by - 5], [bx + 12, by + 8]];
    s += fill(P(cap, true, 0.3), '#221e1a');
    s += fill(ell(bx - 3, by - 5, 4, 3, -20), '#ffffff', 0.2, 'filter="url(#blur2)"');
    s += stroke([[bx - 6, by - 10], [bx - 4, by + 8]], 0.8, '#6b6255', r, 0.6);
    s += stroke([[bx - 22, by + 4], [bx + 22, by - 3]], 1.8, m.hat.col2 === C.cinnabar ? '#e8e2d2' : C.gold, r, 0.95, { taperIn: 0.05, taperOut: 0.05 });
    s += circ(bx + 22, by - 3, 1.8, m.hat.col2 === C.cinnabar ? '#6f9f84' : C.gold);
    return s;
  }
  if (k === 'futou' || k === 'jieze') {
    // soft black cloth wrap (幅巾/幞头) or cap with a raised roof (介帻)
    const cap: Pt[] = [[X(0.97, browY - 6), browY - 6], [X(0.5, hairY + 1), hairY + 1], [X(0, hairY - 2), hairY - 2], [X(-0.6, hairY + 3), hairY + 3], [hx - a * 1.12, browY - 2], [hx - a * 1.16, hairY - 8], [hx - a * 0.7, top - 4], [hx + a * 0.2, top - 6], [hx + a * 0.85, top + 2], [hx + a * 1.04, hairY - 4]];
    if (k === 'futou') s += fill(ell(bx, by + 3, 12, 11), '#26221e');
    else s += fill(P([[hx - a * 0.95, top + 4], [hx - a * 0.62, top - 17], [hx + a * 0.15, top - 13], [hx + a * 0.45, top + 2]], true, 0.2), '#26221e');
    s += fill(P(cap, true, 0.45), '#26221e');
    s += fill(ell(hx + a * 0.1, top + 8, a * 0.45, 6, -10), '#ffffff', 0.13, 'filter="url(#blur3)"');
    const knot: Pt = [hx - a * 1.05, top + 12];
    for (let i = 0; i < 4; i++) s += stroke(qpts([X(0.5 - i * 0.3, hairY - 2), hairY - 2], [hx - a * 0.2, top + 2 + i * 3], knot, 6), 0.9, '#5a5248', r, 0.6);
    if (k === 'jieze') s += fill(band(cap.slice(0, 5), 4.5), m.hat.col2 === C.gold ? '#7a2a22' : m.hat.col2, 0.9);
    s += stroke(cap.slice(4).concat([cap[0]]), 1.4, C.ink, r, 0.7);
    return s;
  }
  if (k === 'wuguan' || k === 'eunuch') {
    const cap: Pt[] = [[X(0.96, browY - 7), browY - 7], [X(0.5, hairY + 2), hairY + 2], [X(-0.3, hairY + 2), hairY + 2], [hx - a * 1.12, browY - 2], [hx - a * 1.15, top + 4], [hx - a * 0.9, top - 7], [hx + a * 0.75, top - 6], [hx + a * 1.0, top + 8]];
    s += fill(P(cap, true, 0.3), '#1f1b18', k === 'wuguan' ? 0.82 : 0.96);
    if (k === 'wuguan') for (let i = 0; i < 8; i++) s += stroke([[hx - a * 1.0 + i * a * 0.25, top - 12], [hx - a * 1.05 + i * a * 0.27, hairY]], 0.6, '#6b6255', r, 0.6);
    else {
      s += fill(P([[hx - a * 0.95, top - 6], [hx - a * 0.75, top - 24], [hx - a * 0.1, top - 22], [hx + a * 0.05, top - 8]], true), '#1f1b18');
      s += fill(ell(X(0.1, hairY - 4), hairY - 4, 4, 3), C.gold, 0.95);
    }
    s += fill(band(cap.slice(0, 4), 3.5), '#2a2622');
    return s;
  }
  if (k === 'scarf' || k === 'yellowscarf' || k === 'hood') {
    const cap: Pt[] = [[X(0.97, browY - 6), browY - 6], [X(0.5, hairY + 1), hairY + 1], [X(0, hairY - 3), hairY - 3], [X(-0.6, hairY + 3), hairY + 3], [hx - a * 1.12, browY - 2], [hx - a * 1.22, hairY - 8], [hx - a * 0.7, top - 8], [hx + a * 0.15, top - 10], [hx + a * 0.85, top - 2], [hx + a * 1.04, hairY - 4]];
    if (k === 'hood') {
      s += fill(P(cap, true), col === '#25211d' ? '#6b5a48' : col);
      s += fill(band(cap.slice(0, 5).map(([x, y]) => [x, y - 2] as Pt), 9), '#cdbb98');
      for (let i = 0; i < 30; i++) {
        const p = along(cap.slice(0, 5), i / 29);
        s += stroke([[p[0] + r.range(-1, 1), p[1] - 7], [p[0] + r.range(-2, 2), p[1] + 2.5]], 2, i % 3 ? '#8a7656' : '#f1ebde', r, 0.8, { taperIn: 0.2, taperOut: 0.6 });
      }
      return s;
    }
    const sc = k === 'yellowscarf' ? '#d4a12a' : col;
    s += fill(P(cap, true, 0.45), sc);
    const dark = mix(sc, '#1b1712', 0.4);
    s += g(fill(P(cap, true, 0.45), dark, 0.5, 'filter="url(#blur5)" transform="translate(-5 5)"'), '');
    // folds sweeping to the knot
    const knot: Pt = [hx - a * 1.12, browY - 4];
    for (let i = 0; i < 6; i++) {
      const p = cap[1 + Math.floor(i / 2)];
      s += stroke(qpts([p[0] - i, p[1] - 3 - i * 2], [hx - a * 0.2 + i * 2, top - 4 + i * 3], knot, 8), 1, dark, r, 0.7, { taperIn: 0.3, taperOut: 0.4 });
    }
    s += stroke(cap.slice(4).concat([cap[0]]), 1.6, C.ink, r, 0.7);
    s += stroke(cap.slice(0, 5), 1.4, C.ink, r, 0.6);
    s += fill(ell(knot[0], knot[1], 5, 6), dark, 0.9);
    return s;
  }
  if (k === 'headband' || k === 'feathers') {
    const pts: Pt[] = [[X(0.98, browY - 6), browY - 6], [X(0.5, hairY + 6), hairY + 6], [X(0, hairY + 4), hairY + 4], [X(-0.5, hairY + 6), hairY + 6], [hx - a * 1.1, hairY + 10]];
    if (k === 'feathers') {
      for (const [dx, h, c] of [[-0.85, 70, '#e8e2d2'], [-0.65, 82, '#8a6a42'], [-0.45, 64, '#1f1b18']] as const) {
        const b0: Pt = [hx + dx * a, hairY + 2];
        const pts2 = qpts(b0, [b0[0] - 6, b0[1] - h * 0.6], [b0[0] - 18, b0[1] - h], 10);
        s += stroke(pts2, 7, c, r, 0.95, { taperIn: 0.1, taperOut: 0.6 });
        s += stroke(pts2, 0.8, C.ink, r, 0.6);
      }
    }
    s += fill(band(pts, 6.5, 7.5), col);
    s += stroke(pts, 0.8, C.ink, r, 0.4);
    if (r.chance(0.5) || m.extras.has('bells')) s += fill(ell(pts[2][0], pts[2][1], 3, 3.5), m.extras.has('bells') ? C.gold : '#6f9f84');
    if (m.extras.has('bells')) for (let i = 1; i < 4; i++) s += circ(pts[i][0] - 4, pts[i][1] + 4, 1.8, C.gold);
    void eyeY;
    return s;
  }
  return s;
}

const lerp2 = (a: Pt, b: Pt, t: number): Pt => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];

// ------------------------------------------------------------------ dress
/** The dress is designed in a 'body space' (neck base at y = 186) and mapped under the chin. */
export const DRESS_K = 0.74;
export const dressXf = (m: Model) => `translate(${m.hx.toFixed(2)} ${(m.chinY + (m.female ? 13 : 17)).toFixed(2)}) scale(${DRESS_K}) translate(${(-m.hx).toFixed(2)} -186)`;

export function drawDress(m: Model) {
  const { hx, r } = m;
  const a = m.a / DRESS_K;
  const d = m.dress;
  const fem = m.female;
  const sb = fem ? 0.88 : m.look.build === 'stout' ? 1.08 : m.look.build === 'slim' ? 0.95 : 1;
  const lift = (sb - 1) * 60;
  const nbx = hx - a * 0.92, nfx = hx + a * 0.55;
  const left: Pt[] = [[-12, 250], [-12, 214 - lift + (fem ? 10 : 0)], [16, 201 - lift * 0.6 + (fem ? 6 : 0)], [nbx - 12, 192 - lift * 0.2], [nbx + 1, 186]];
  const right: Pt[] = [[nfx + 3, 189], [nfx + 22, 194 - lift * 0.2], [168, 203 - lift * 0.5 + (fem ? 6 : 0)], [212, 224 - lift + (fem ? 10 : 0)], [212, 250]];
  const body = P([...left, ...right], true, 0.4);
  const cx = hx + a * 0.15;
  const dark = mix(d.col, '#1b1712', 0.4);
  let s = '';

  if (d.kind === 'armour' && m.extras.has('cape')) {
    s += fill(P([[-12, 205 - lift], [30, 194], [nbx, 188], [nfx + 10, 190], [175, 196], [212, 212 - lift], [212, 250], [-12, 250]], true), d.col2 === d.metal ? C.cinnabar : d.col2);
  }
  s += fill(body, d.kind === 'armour' ? d.metal : d.col);
  // modelling: darker under the arms and at the far side
  s += g(fill(ell(10, 245, 40, 26), dark, 0.5, 'filter="url(#blur5)"') + fill(ell(195, 245, 30, 30), dark, 0.45, 'filter="url(#blur5)"') + fill(ell(cx, 250, 20, 30), '#ffffff', 0.12, 'filter="url(#blur5)"'), `clip-path="url(#bodyclip)"`);
  s = `<clipPath id="bodyclip"><path d="${body}"/></clipPath>` + s;

  // collars: the inner panel (viewer's left) and the outer one crossing over it (右衽)
  const deep = fem ? 1.25 : d.kind === 'armour' ? 0.7 : 1;
  const innerA: Pt = [nbx + 3, 190], innerB: Pt = [cx + 26 * deep, 252];
  const outerA: Pt = [nfx + 3, 190], outerB: Pt = [cx - 34 * deep, 252];
  const X0 = lineInt(innerA, innerB, outerA, outerB);
  const collarW = d.kind === 'crane' ? 13 : d.kind === 'imperial' ? 11 : fem ? 8 : 9;
  const trim = d.kind === 'crane' ? d.col2 : d.kind === 'imperial' ? C.gold : d.kind === 'plainrobe' ? mix(d.col, '#1b1712', 0.3) : d.trim === d.col ? d.col2 : d.trim;
  if (d.kind === 'fur') {
    s += fill(P([innerA, X0, outerA], true), m.skin);
    s += furCollar(m, nbx, nfx);
    s += stroke(left.slice(1, 4), 2.2, C.ink, r, 0.8);
    s += stroke(right.slice(1, 4), 2, C.ink, r, 0.7);
    if (m.extras.has('beads')) s += beads(m, nbx, nfx, ['#efe6d2', '#b13a2a', '#efe6d2', '#2f4f74']);
    return `<g transform="${dressXf(m)}">${s}</g>`;
  }
  // V opening: inner garment, then skin
  s += fill(P([innerA, X0, outerA], true), d.kind === 'imperial' ? C.cinnabar : d.inner);
  const vi = 4.5;
  s += fill(P([[innerA[0] + vi, innerA[1] - 2], lineInt([innerA[0] + vi, innerA[1]], [innerB[0] + vi, innerB[1]], [outerA[0] - vi, outerA[1]], [outerB[0] - vi, outerB[1]]), [outerA[0] - vi, outerA[1] - 2]], true), m.skin);
  if (fem && m.extras.has('pearls')) for (let i = 0; i < 9; i++) s += circ(lerp(innerA[0] + 8, outerA[0] - 6, i / 8), 196 + Math.sin((i / 8) * Math.PI) * 9, 1.6, '#f6f2e8');
  // inner (white) collar edges
  s += fill(band([innerA, lerp2(innerA, X0, 0.5), lerp2(innerA, X0, 1.05)], 3.5), d.inner);
  s += fill(band([outerA, lerp2(outerA, outerB, 0.5), outerB], 3.5), d.inner);
  // collar bands
  const ib = [innerA, lerp2(innerA, X0, 1.08)].map(([x, y]) => [x - collarW * 0.6, y] as Pt);
  s += fill(band(ib, collarW), trim);
  const ob = [outerA, outerB].map(([x, y]) => [x + collarW * 0.55, y] as Pt);
  s += fill(band(ob, collarW), trim);
  s += stroke(ob.map(([x, y]) => [x - collarW / 2, y] as Pt), 1.5, C.ink, r, 0.8, { taperIn: 0.05, taperOut: 0.2 });
  s += stroke(ob.map(([x, y]) => [x + collarW / 2, y] as Pt), 1.2, C.ink, r, 0.55, { taperIn: 0.05, taperOut: 0.2 });
  s += stroke(ib.map(([x, y]) => [x + collarW / 2, y] as Pt), 1.3, C.ink, r, 0.7, { taperIn: 0.05, taperOut: 0.2 });
  if (d.kind === 'imperial') {
    // gold embroidery on the collar and sun/moon on the shoulders
    for (let i = 0; i < 6; i++) s += circ(lerp(ob[0][0], ob[1][0], i / 6 + 0.05), lerp(ob[0][1], ob[1][1], i / 6 + 0.05), 1.3, '#7a2a22');
    s += circ(26, 212, 9, C.cinnabar) + `<circle cx="26" cy="212" r="10.5" fill="none" stroke="${C.gold}" stroke-width="1.2"/>`;
    s += circ(176, 214, 7, '#e8e2d2') + `<circle cx="176" cy="214" r="8.5" fill="none" stroke="${C.gold}" stroke-width="1.2"/>`;
    for (let i = 0; i < 5; i++) {
      const x = r.range(40, 170), y = r.range(222, 240);
      s += stroke(qpts([x, y], [x + 5, y - 6], [x + 10, y], 4), 1.4, C.gold, r, 0.7);
    }
  }

  if (d.kind === 'armour') s += armour(m, left, right, nbx, nfx, cx, lift);
  else {
    // drapery strokes (衣纹): nail-head, rat-tail
    const fold = mix(d.col, '#1b1712', 0.55);
    s += stroke([[nbx - 14, 194], [2, 214], [-6, 238]], 1.6, fold, r, 0.6, { taperIn: 0.05, taperOut: 0.8 });
    s += stroke([[30, 210], [44, 228], [40, 250]], 1.4, fold, r, 0.5, { taperIn: 0.05, taperOut: 0.8 });
    s += stroke([[150, 206], [160, 226], [158, 250]], 1.4, fold, r, 0.5, { taperIn: 0.05, taperOut: 0.8 });
    s += stroke([[outerB[0] + 30, 226], [outerB[0] + 40, 250]], 1.2, fold, r, 0.4, { taperIn: 0.05, taperOut: 0.8 });
  }
  if (fem && d.kind === 'gown') {
    // sheer silk shawl (披帛)
    const sh: Pt[] = [[-12, 222], [12, 205], [40, 214], [70, 240]];
    s += fill(band(sh, 10, 16), d.col2 === C.ink ? '#e8e2d2' : mix(d.col2, '#ffffff', 0.5), 0.55);
    const sh2: Pt[] = [[150, 250], [168, 214], [190, 206], [212, 214]];
    s += fill(band(sh2, 14, 9), d.col2 === C.ink ? '#e8e2d2' : mix(d.col2, '#ffffff', 0.5), 0.5);
  }
  if (m.extras.has('beads')) s += beads(m, nbx, nfx, ['#efe6d2', '#b13a2a', '#efe6d2', '#2f4f74']);
  // shoulder contour
  s += stroke(left.slice(1, 5), 2.2, C.ink, r, 0.85, { taperIn: 0.3, taperOut: 0.1 });
  s += stroke(right.slice(0, 4), 2, C.ink, r, 0.75, { taperIn: 0.1, taperOut: 0.3 });
  return `<g transform="${dressXf(m)}">${s}</g>`;
}

function armour(m: Model, left: Pt[], right: Pt[], nbx: number, nfx: number, cx: number, lift: number) {
  const { r } = m;
  const d = m.dress;
  let s = '';
  // chest lamellae
  s += fill(P([[nbx - 6, 196], [nfx + 18, 196], [190, 250], [10, 250]], true), 'url(#scales)', 0.55);
  // round mirror (护心镜)
  s += circ(cx + 6, 240, 13, mix(d.metal, '#ffffff', 0.25));
  s += `<circle cx="${cx + 6}" cy="240" r="13" fill="none" stroke="${C.ink}" stroke-width="1.3" opacity="0.8"/>`;
  s += `<circle cx="${cx + 6}" cy="240" r="9" fill="none" stroke="${C.gold}" stroke-width="1" opacity="0.8"/>`;
  s += fill(ell(cx + 2, 235, 4, 2.5, -30), '#ffffff', 0.5, 'filter="url(#blur2)"');
  // neck scarf (护项)
  const scarf: Pt[] = [[nbx - 6, 190], [nbx + 6, 199], [hx(m) - 2, 204], [nfx + 2, 199], [nfx + 10, 190]];
  s += fill(band(scarf, 9, 9), d.col2 === d.metal ? C.cinnabar : d.col2);
  s += stroke(scarf, 0.9, C.ink, r, 0.4);
  // pauldrons
  const lp: Pt[] = [[-14, 214 - lift], [8, 197 - lift * 0.6], [36, 192 - lift * 0.3], [58, 203], [56, 224], [32, 232], [-14, 238]];
  const rp: Pt[] = [[nfx + 20, 199], [160, 196 - lift * 0.4], [190, 205 - lift * 0.6], [214, 222 - lift], [214, 240], [182, 236], [nfx + 24, 218]];
  for (const p of [rp, lp]) {
    s += fill(P(p, true), d.col);
    s += fill(P(p, true), 'url(#scales)', 0.5);
    s += stroke([...p.slice(0, 5)], 1.8, C.ink, r, 0.8);
    s += fill(band(p.slice(3, 7), 3.5), d.trim === d.col ? C.gold : d.trim, 0.9);
  }
  void left;
  void right;
  return s;
}
const hx = (m: Model) => m.hx;

function furCollar(m: Model, nbx: number, nfx: number) {
  const { r } = m;
  const base = r.pick(['#d6c8ac', '#8f7a60', '#e4dccb', '#6b5a48']);
  const dk = mix(base, '#1b1712', 0.45), lt = mix(base, '#ffffff', 0.5);
  const shape: Pt[] = [[nbx - 22, 192], [nbx - 6, 180], [nfx + 6, 182], [nfx + 30, 192], [nfx + 24, 214], [m.hx - 8, 224], [nbx - 24, 214]];
  let s = `<g filter="url(#wash)">${fill(P(shape, true), base)}</g>`;
  s += fill(ell(m.hx - 10, 214, 40, 8), dk, 0.35, 'filter="url(#blur4)"');
  // tufts: short curved strokes, light on top of dark
  for (let layer = 0; layer < 2; layer++) {
    for (let i = 0; i < 26; i++) {
      const t = (i + r.next() * 0.8) / 26;
      const p = along(shape, t);
      const c: Pt = [m.hx - 6, 202];
      const dx = p[0] - c[0], dy = p[1] - c[1];
      const l = Math.hypot(dx, dy) || 1;
      const L = r.range(5, 9);
      const en: Pt = [p[0] + (dx / l) * L, p[1] + (dy / l) * L];
      const bend: Pt = [lerp(p[0], en[0], 0.5) + r.range(-2, 2), lerp(p[1], en[1], 0.5) + r.range(-2, 2)];
      s += stroke([[p[0] - (dx / l) * 4, p[1] - (dy / l) * 4], bend, en], layer ? 1.2 : 2.6, layer ? lt : dk, r, layer ? 0.8 : 0.6, { taperIn: 0.2, taperOut: 0.8 });
    }
  }
  return s;
}

function beads(m: Model, nbx: number, nfx: number, cols: string[]) {
  let s = '';
  for (let i = 0; i < 13; i++) {
    const t = i / 12;
    const x = lerp(nbx - 4, nfx + 14, t), y = 214 + Math.sin(t * Math.PI) * 18;
    s += i % 4 === 2 ? fill(P([[x - 2, y - 2], [x + 2, y - 2], [x, y + 7]], true), '#efe6d2') : circ(x, y, 2.6, cols[i % cols.length]);
  }
  void m;
  return s;
}

// ------------------------------------------------------------------ props
export function drawFan(m: Model) {
  const { r } = m;
  // feather fan (羽扇) held up before the chest
  const cx = m.hx + 64, cy = 196, rot = 18;
  let s = stroke([[cx + 8, cy + 26], [cx + 20, cy + 60]], 4, '#5a3a1a', r, 1, { taperIn: 0.02, taperOut: 0.02 });
  const R = (ang: number, k: number): Pt => {
    const t = ((ang + rot) * Math.PI) / 180;
    return [cx + Math.cos(t) * 23 * k, cy + Math.sin(t) * 33 * k];
  };
  s += fill(ell(cx, cy, 23, 33, rot), '#f4efe2', 0.97);
  // dark-tipped outer feathers
  for (let i = 0; i < 22; i++) {
    const ang = (i / 22) * 360;
    s += fill(ell(...R(ang, 0.9), 4.5, 7, ang + rot + 90), i % 2 ? '#3b342b' : '#6b6255', 0.55, 'filter="url(#blur2)"');
  }
  s += fill(ell(cx, cy, 18, 27, rot), '#f6f2e8', 0.9);
  const base = R(90, 0.75);
  for (let i = 0; i < 17; i++) {
    const ang = -90 + (i - 8) * 14;
    s += stroke([base, R(ang, 0.95)], 0.8, '#8a8478', r, 0.6, { taperIn: 0.1, taperOut: 0.8 });
  }
  s += `<path d="${ell(cx, cy, 23, 33, rot)}" fill="none" stroke="#2b2722" stroke-width="1" opacity="0.6"/>`;
  s += fill(ell(base[0], base[1], 5, 3.5, rot), '#5a3a1a');
  return `<g transform="${dressXf(m)}">${s}</g>`;
}
