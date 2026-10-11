// Ink painting on a raster layer (normal blending): wash fills with paper-
// texture variation, dry-brush outlines, dots. Used for the solid skill props
// (siege engines, beasts, rocks, debris) so they share the effects' brushwork.
import { C } from '../ink.ts';
import { Cv, Fld, hex, xform, type Pt, type RGB } from './_effects_kit.ts';

export { C };
export type Col = string | RGB;
const col = (c: Col): RGB => (typeof c === 'string' ? hex(c) : c);

export interface LineOpt {
  taperIn?: number;
  taperOut?: number;
  dry?: number;
  rag?: number;
  seed?: number;
  soft?: number;
  wfn?: (t: number) => number;
}

export class Ink {
  cv: Cv;
  /** global offset applied to all coordinates (lets drawings use anchor-relative coords) */
  ox = 0;
  oy = 0;
  constructor(public w: number, public h: number) {
    this.cv = new Cv(w, h);
  }
  private T(pts: Pt[]): Pt[] {
    return this.ox || this.oy ? pts.map(([x, y]) => [x + this.ox, y + this.oy]) : pts;
  }
  /** Wash fill: flat pigment with fbm texture (lo..hi alpha), soft edge `edge` px. */
  fill(pts: Pt[], c: Col, a = 1, o: { tex?: number; texF?: number; edge?: number } = {}) {
    const f = new Fld(this.w, this.h).poly(this.T(pts), 1);
    if (o.edge) f.blur(o.edge, 1);
    const tex = o.tex ?? 0.25;
    if (tex > 0) f.tex(o.texF ?? 0.06, 1 - tex, 1, this.ox * 0.37, this.oy * 0.21);
    this.cv.paint(f, col(c), a);
    return this;
  }
  /** Brush line. */
  line(pts: Pt[], w: number, c: Col = C.ink, a = 1, o: LineOpt = {}) {
    const f = new Fld(this.w, this.h).stroke(this.T(pts), w, 1, { taperIn: o.taperIn ?? 0.1, taperOut: o.taperOut ?? 0.2, dry: o.dry ?? 0.15, rag: o.rag ?? 0.15, seed: o.seed ?? 1, soft: o.soft, wfn: o.wfn, mode: 'max' });
    this.cv.paint(f, col(c), a);
    return this;
  }
  /** Outline of a closed shape. */
  outline(pts: Pt[], w: number, c: Col = C.ink, a = 1, o: LineOpt = {}) {
    return this.line([...pts, pts[0], pts[1] ?? pts[0]], w, c, a, { taperIn: 0.02, taperOut: 0.02, ...o });
  }
  /** Fill + ink outline. */
  shape(pts: Pt[], fillC: Col, lw: number, a = 1, o: { tex?: number; line?: Col; dry?: number } = {}) {
    this.fill(pts, fillC, a, { tex: o.tex });
    if (lw > 0) this.outline(pts, lw, o.line ?? C.ink, a, { dry: o.dry ?? 0.25 });
    return this;
  }
  dot(x: number, y: number, r: number, c: Col = C.ink, a = 1, hard = 0.6) {
    const f = new Fld(this.w, this.h).dab(x + this.ox, y + this.oy, r, 1, { hard });
    this.cv.paint(f, col(c), a);
    return this;
  }
  ell(cx: number, cy: number, rx: number, ry: number, c: Col, a = 1, rot = 0, hard = 0.85) {
    const f = new Fld(this.w, this.h).dab(cx + this.ox, cy + this.oy, Math.max(rx, ry), 1, { hard, sx: rx / Math.max(rx, ry), sy: ry / Math.max(rx, ry), rot });
    this.cv.paint(f, col(c), a);
    return this;
  }
  /** Soft ground shadow. */
  shadow(cx: number, cy: number, rx: number, ry: number, a = 0.35) {
    return this.ell(cx, cy, rx, ry, C.ink, a, 0, 0.35);
  }
  /** Ellipse as points (for fills/outlines). */
  static ellPts(cx: number, cy: number, rx: number, ry: number, rot = 0, n = 28): Pt[] {
    const p: Pt[] = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      p.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
    }
    return rot ? xform(p, cx, cy, rot) : p;
  }
  /** Rectangle (optionally rotated about its centre). */
  static rect(x: number, y: number, w: number, h: number, rot = 0): Pt[] {
    const p: Pt[] = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
    return rot ? xform(p, x + w / 2, y + h / 2, rot) : p;
  }
  /** Spoked wheel seen from the side; `rot` turns the spokes. */
  wheel(cx: number, cy: number, r: number, rot: number, lw: number, rim: Col = C.ochre, spokes = 8) {
    this.fill(Ink.ellPts(cx, cy, r, r), rim, 0.9, { tex: 0.3 });
    this.fill(Ink.ellPts(cx, cy, r * 0.78, r * 0.78), C.paperDark, 0.85, { tex: 0.2 });
    for (let k = 0; k < spokes; k++) {
      const a = rot + (k / spokes) * Math.PI * 2;
      this.line([[cx, cy], [cx + Math.cos(a) * r * 0.8, cy + Math.sin(a) * r * 0.8]], lw * 0.8, C.inkSoft, 1, { taperIn: 0, taperOut: 0 });
    }
    this.outline(Ink.ellPts(cx, cy, r, r), lw, C.ink, 1, { dry: 0.3 });
    this.outline(Ink.ellPts(cx, cy, r * 0.78, r * 0.78), lw * 0.6, C.inkSoft, 1);
    this.dot(cx, cy, r * 0.18, C.ink);
    return this;
  }
  /** Composites another layer. */
  draw(o: Cv | Ink, dx = 0, dy = 0, k = 1) {
    this.cv.draw(o instanceof Ink ? o.cv : o, dx, dy, 'over', k);
    return this;
  }
  out(ax: number, ay: number) {
    return { rgba: this.cv.rgba(), w: this.w, h: this.h, ax: Math.round(ax), ay: Math.round(ay) };
  }
}
