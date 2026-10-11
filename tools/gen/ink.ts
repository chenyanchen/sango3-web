// Shared 水墨 (ink-wash) drawing kit for the painters: deterministic RNG,
// palette, SVG helpers, brush strokes and paper/ink filters. Keeping these in
// one place keeps the whole game in one visual style.

// ------------------------------------------------------------------ random
/** Deterministic PRNG (mulberry32). Same seed → same art on every machine. */
export function rng(seed: number | string) {
  let a = typeof seed === 'number' ? seed >>> 0 : hash(seed);
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (lo: number, hi: number) => lo + (hi - lo) * next(),
    int: (lo: number, hi: number) => Math.floor(lo + (hi - lo + 1) * next()),
    pick: <T>(a: readonly T[]) => a[Math.floor(next() * a.length)],
    chance: (p: number) => next() < p,
    /** roughly normal, mean 0, sd 1 */
    gauss: () => (next() + next() + next() + next() - 2) * 1.732,
  };
}
export type Rng = ReturnType<typeof rng>;

export function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

// ------------------------------------------------------------------ palette
/** Mineral pigments of Chinese painting on aged paper. */
export const C = {
  paper: '#efe4cc',
  paperDark: '#d9c9a6',
  ink: '#1b1712',
  inkSoft: '#3b342b',
  inkWash: '#6b6255',
  /** 朱砂 vermilion — seals, enemy red */
  cinnabar: '#b13a2a',
  /** 胭脂 rouge */
  rouge: '#9c2f45',
  /** 藤黄 gamboge */
  gamboge: '#d4a12a',
  /** 赭石 ochre / skin */
  ochre: '#b97b45',
  skin: '#e2b98f',
  /** 花青 indigo — player blue */
  indigo: '#2f4f74',
  /** 石青 azurite */
  azurite: '#3f6f9a',
  /** 石绿 malachite */
  malachite: '#4f8a6a',
  jade: '#6f9f84',
  gold: '#c9a24a',
  white: '#f7f2e6',
} as const;

/** Mixes two #rrggbb colors (t = 0 → a, 1 → b). */
export function mix(a: string, b: string, t: number) {
  const p = (c: string, i: number) => parseInt(c.slice(1 + i * 2, 3 + i * 2), 16);
  const h = (i: number) => Math.round(p(a, i) + (p(b, i) - p(a, i)) * t).toString(16).padStart(2, '0');
  return `#${h(0)}${h(1)}${h(2)}`;
}

// ------------------------------------------------------------------ svg
export const f2 = (n: number) => (Math.round(n * 100) / 100).toString();

/** Wraps SVG content in a document of the given pixel size. */
export function svgDoc(w: number, h: number, body: string, defs = '') {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${defs ? `<defs>${defs}</defs>` : ''}${body}</svg>`;
}

export type Pt = [number, number];

/** Smooth closed/open path through points (Catmull-Rom → cubic Bézier). */
export function smoothPath(pts: Pt[], closed = false, tension = 0.5) {
  if (pts.length < 2) return '';
  const P = closed ? [pts[pts.length - 1], ...pts, pts[0], pts[1]] : [pts[0], ...pts, pts[pts.length - 1]];
  let d = `M${f2(P[1][0])},${f2(P[1][1])}`;
  for (let i = 1; i < P.length - 2; i++) {
    const [p0, p1, p2, p3] = [P[i - 1], P[i], P[i + 1], P[i + 2]];
    const k = tension / 3;
    d += `C${f2(p1[0] + (p2[0] - p0[0]) * k)},${f2(p1[1] + (p2[1] - p0[1]) * k)} ${f2(p2[0] - (p3[0] - p1[0]) * k)},${f2(p2[1] - (p3[1] - p1[1]) * k)} ${f2(p2[0])},${f2(p2[1])}`;
  }
  return closed ? d + 'Z' : d;
}

/**
 * A brush stroke along `pts` as a filled outline: pressure swells in the middle
 * and tapers at both ends (like 中锋 strokes). `w` is the max width.
 */
export function brush(pts: Pt[], w: number, r?: Rng, opts: { taperIn?: number; taperOut?: number; jitter?: number } = {}) {
  if (pts.length < 2) return '';
  // resample densely
  const dense: Pt[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [a, b] = [pts[i], pts[i + 1]];
    const n = Math.max(2, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 3));
    for (let k = 0; k < n; k++) dense.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  dense.push(pts[pts.length - 1]);
  const tin = opts.taperIn ?? 0.25, tout = opts.taperOut ?? 0.35, jit = opts.jitter ?? 0.12;
  const L: Pt[] = [], R: Pt[] = [];
  const N = dense.length;
  // smooth, low-frequency width variation (dry-brush feel without a sawtooth edge)
  const ph = [r?.next() ?? 0, r?.next() ?? 0].map((v) => v * Math.PI * 2);
  const wav = (t: number) => (Math.sin(t * 7.3 + ph[0]) * 0.6 + Math.sin(t * 17.9 + ph[1]) * 0.4) * jit * 1.6;
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const a = dense[Math.max(0, i - 1)], b = dense[Math.min(N - 1, i + 1)];
    let nx = -(b[1] - a[1]), ny = b[0] - a[0];
    const len = Math.hypot(nx, ny) || 1;
    nx /= len;
    ny /= len;
    const press = Math.min(1, t / Math.max(1e-3, tin), (1 - t) / Math.max(1e-3, tout));
    const hw = (w / 2) * (0.25 + 0.75 * Math.sqrt(Math.max(0, press))) * (1 + (r ? wav(t) : 0));
    L.push([dense[i][0] + nx * hw, dense[i][1] + ny * hw]);
    R.push([dense[i][0] - nx * hw, dense[i][1] - ny * hw]);
  }
  return smoothPath([...L, ...R.reverse()], true, 0.4);
}

/** A wobbly closed blob around a center (ink dot, tree crown, rock). */
export function blob(cx: number, cy: number, rx: number, ry: number, r: Rng, wobble = 0.18, n = 12) {
  const pts: Pt[] = [];
  const ph = r.next() * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    const a = ph + (i / n) * Math.PI * 2;
    const k = 1 + r.gauss() * wobble * 0.5;
    pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
  }
  return smoothPath(pts, true);
}

// ------------------------------------------------------------------ filters
/**
 * Ink-bleed filter: ragged, slightly feathered edges (墨晕). Apply to a group
 * with `filter="url(#id)"`. `scale` is the edge roughness in px.
 */
export function inkBleed(id: string, seed: number, scale = 2.5, freq = 0.06) {
  return `<filter id="${id}" x="-10%" y="-10%" width="120%" height="120%">
<feTurbulence type="fractalNoise" baseFrequency="${freq}" numOctaves="2" seed="${seed % 1000}" result="n"/>
<feDisplacementMap in="SourceGraphic" in2="n" scale="${scale}" xChannelSelector="R" yChannelSelector="G"/>
</filter>`;
}

/** Wash texture: modulates alpha with noise so flat fills look like ink wash (晕染). */
export function washTexture(id: string, seed: number, freq = 0.025, strength = 0.35) {
  const lo = 1 - strength;
  return `<filter id="${id}" x="0" y="0" width="100%" height="100%">
<feTurbulence type="fractalNoise" baseFrequency="${freq}" numOctaves="3" seed="${seed % 1000}" result="n"/>
<feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 ${f2(strength * 2)} ${f2(lo - strength * 0.5)}" result="a"/>
<feComposite in="SourceGraphic" in2="a" operator="in"/>
</filter>`;
}

/** Aged rice-paper background (宣纸) with fibres and blotches; returns { defs, body }. */
export function paper(w: number, h: number, seed: number, tone: string = C.paper) {
  const id = `paper${seed % 10000}`;
  const defs = `<filter id="${id}" x="0" y="0" width="100%" height="100%">
<feTurbulence type="fractalNoise" baseFrequency="0.9 0.02" numOctaves="2" seed="${seed % 1000}" result="fib"/>
<feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="3" seed="${(seed + 7) % 1000}" result="blot"/>
<feColorMatrix in="fib" type="matrix" values="0 0 0 0 0.35  0 0 0 0 0.28  0 0 0 0 0.18  0 0 0 0.10 0" result="fibc"/>
<feColorMatrix in="blot" type="matrix" values="0 0 0 0 0.45  0 0 0 0 0.36  0 0 0 0 0.22  0 0 0 0.28 -0.05" result="blotc"/>
<feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="blotc"/><feMergeNode in="fibc"/></feMerge>
</filter>`;
  return { defs, body: `<rect width="${w}" height="${h}" fill="${tone}" filter="url(#${id})"/>` };
}

/** Square red seal (印章) with up to 4 characters, e.g. for title art. */
export function seal(x: number, y: number, size: number, text: string, r: Rng) {
  const chars = [...text].slice(0, 4);
  const n = chars.length <= 1 ? 1 : 2;
  const cell = size / n;
  let t = '';
  chars.forEach((ch, i) => {
    const col = n === 1 ? 0 : 1 - Math.floor(i / 2), row = n === 1 ? 0 : i % 2;
    t += `<text x="${f2(x + cell * (col + 0.5))}" y="${f2(y + cell * (row + 0.82))}" font-size="${f2(cell * 0.86)}" text-anchor="middle" fill="${C.paper}" font-family="${FONT_SEAL}">${ch}</text>`;
  });
  return `<g><path d="${blob(x + size / 2, y + size / 2, size * 0.52, size * 0.52, r, 0.05, 4 * 4)}" fill="${C.cinnabar}" opacity="0.92"/>${t}</g>`;
}

/** Brush-style CJK font stacks (resolved by librsvg via fontconfig). */
export const FONT_BRUSH = "'Xingkai SC','STXingkai','Kaiti SC','STKaiti','KaiTi','AR PL UKai CN','Noto Serif CJK SC',serif";
export const FONT_SEAL = "'Baoli SC','STLiti','Kaiti SC','STKaiti','KaiTi','AR PL UKai CN','Noto Serif CJK SC',serif";
export const FONT_KAI = "'Kaiti SC','STKaiti','KaiTi','AR PL UKai CN','Noto Serif CJK SC',serif";
