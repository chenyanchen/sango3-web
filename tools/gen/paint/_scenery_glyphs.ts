// Hand-built brush calligraphy for the game title 「三国墨英传」, stroke by
// stroke, so the key art never depends on which CJK fonts are installed.
// Coordinates are in a 100×100 character box (y down); w = stroke width.
import { brush, f2, type Pt, type Rng } from '../ink.ts';

interface Stroke {
  p: Pt[];
  w: number;
  tin?: number;
  tout?: number;
}
const S = (p: Pt[], w: number, tin?: number, tout?: number): Stroke => ({ p, w, tin, tout });

// 横 strokes rise slightly to the right and press at the end; 竖 strokes press at the top.
export const GLYPHS: Record<string, Stroke[]> = {
  三: [
    S([[26, 22], [48, 19], [70, 18], [73, 20]], 9, 0.15, 0.2),
    S([[32, 47], [50, 45], [66, 44], [68, 46]], 9, 0.15, 0.2),
    S([[10, 80], [40, 77], [72, 73], [88, 73], [91, 76]], 12, 0.12, 0.18),
  ],
  国: [
    S([[16, 14], [15, 50], [17, 90]], 10, 0.1, 0.3),
    S([[17, 13], [50, 10], [81, 9], [85, 13], [83, 50], [82, 86], [77, 90]], 10, 0.1, 0.12),
    S([[31, 30], [50, 28], [67, 27]], 7, 0.15, 0.25),
    S([[34, 51], [50, 50], [63, 49]], 7, 0.15, 0.25),
    S([[28, 73], [50, 71], [71, 70]], 8, 0.15, 0.2),
    S([[49, 29], [50, 50], [50, 71]], 8, 0.1, 0.3),
    S([[59, 57], [66, 64]], 8, 0.2, 0.3),
    S([[18, 88], [50, 87], [80, 86]], 9, 0.1, 0.2),
  ],
  墨: [
    S([[22, 6], [23, 30]], 7, 0.1, 0.3),
    S([[23, 6], [50, 4], [76, 4], [76, 8], [74, 30]], 7, 0.1, 0.2),
    S([[34, 11], [41, 21]], 6, 0.2, 0.3),
    S([[65, 11], [58, 21]], 6, 0.2, 0.3),
    S([[50, 5], [50, 38]], 7, 0.1, 0.3),
    S([[24, 29], [50, 28], [74, 27]], 7, 0.15, 0.25),
    S([[16, 40], [50, 38], [84, 36]], 8, 0.15, 0.2),
    S([[22, 49], [17, 58]], 7, 0.2, 0.4),
    S([[39, 49], [40, 58]], 7, 0.2, 0.4),
    S([[58, 49], [61, 58]], 7, 0.2, 0.4),
    S([[75, 48], [83, 57]], 8, 0.2, 0.4),
    S([[30, 72], [50, 70], [70, 68]], 8, 0.15, 0.25),
    S([[50, 62], [50, 90]], 8, 0.1, 0.3),
    S([[12, 93], [50, 91], [88, 88]], 11, 0.12, 0.2),
  ],
  英: [
    S([[8, 19], [50, 16], [92, 13]], 9, 0.12, 0.18),
    S([[32, 5], [34, 29]], 8, 0.1, 0.4),
    S([[67, 5], [64, 29]], 8, 0.1, 0.4),
    S([[26, 38], [28, 60]], 7, 0.1, 0.3),
    S([[27, 38], [50, 36], [72, 35], [73, 38], [71, 60]], 7, 0.1, 0.2),
    S([[50, 25], [50, 61]], 8, 0.1, 0.3),
    S([[6, 63], [50, 60], [94, 57]], 10, 0.12, 0.18),
    S([[49, 63], [40, 76], [26, 87], [10, 94]], 9, 0.1, 0.7),
    S([[53, 65], [64, 78], [78, 88], [92, 92], [96, 92]], 12, 0.5, 0.15),
  ],
  传: [
    S([[30, 5], [24, 22], [14, 38], [5, 47]], 9, 0.1, 0.6),
    S([[20, 30], [21, 60], [21, 95]], 9, 0.15, 0.3),
    S([[40, 21], [62, 19], [84, 17]], 8, 0.15, 0.2),
    S([[35, 41], [62, 38], [92, 36]], 9, 0.12, 0.2),
    S([[61, 5], [57, 30], [52, 56], [55, 57], [80, 55], [82, 58], [70, 72], [62, 78]], 8, 0.1, 0.25),
    S([[60, 80], [68, 86], [76, 94]], 10, 0.3, 0.3),
  ],
};

/** One character at (x, y) (top-left of its box), `size` px, ink colour. */
export function glyph(ch: string, x: number, y: number, size: number, r: Rng, ink: string, extra = '') {
  const strokes = GLYPHS[ch];
  if (!strokes) return '';
  const k = size / 100;
  let s = '';
  for (const st of strokes) {
    const pts = st.p.map(([px, py]) => [x + px * k, y + py * k] as Pt);
    s += `<path d="${brush(pts, st.w * k * 1.15, r, { taperIn: st.tin ?? 0.15, taperOut: st.tout ?? 0.25, jitter: 0.1 })}" fill="${ink}"${extra}/>`;
  }
  return s;
}

/** A word laid out horizontally with slight size/baseline variation (行书 rhythm). */
export function word(text: string, x: number, y: number, size: number, r: Rng, ink: string, gap = 0.92, extra = '') {
  let s = '';
  let cx = x;
  [...text].forEach((ch, i) => {
    const sz = size * (1 + Math.sin(i * 2.1 + 0.5) * 0.06);
    const dy = Math.sin(i * 1.7) * size * 0.04;
    s += glyph(ch, cx, y + dy + (size - sz) / 2, sz, r, ink, extra);
    cx += sz * gap;
  });
  return s;
}

export const wordWidth = (text: string, size: number, gap = 0.92) => [...text].length * size * gap;
void f2;
