// The 野战 tile set: what every sf/map frame depicts, and the [graphics]
// table of SFMap (graphic index → frame). Shared by the map generator
// (maps/field.ts), the SFMap data module (data/field.ts) and the tile painter
// (paint/field.ts), so all three agree on the meaning of every frame.
//
// Ground tiles are corner-based ("Wang") transitions: each diamond has four
// corners N, E, S, W; a corner is either plain ground (P) or the pair's other
// class X. mask bit set = corner is X (N=1, E=2, S=4, W=8). Every class only
// ever borders plain ground, so 6 classes need 5 transition sets.
//
// Diamond geometry: frame 96×36, anchor (48,18). N corner = top, E = right,
// S = bottom, W = left. Iso axes (see src/scenes/field/map.ts): +u = towards
// screen down-right (crossing the SE edge), +v = towards screen down-left
// (crossing the SW edge).

export type Cls = 'P' | 'G' | 'S' | 'A' | 'D' | 'R';
export const CLASSES: Cls[] = ['P', 'G', 'S', 'A', 'D', 'R'];
/** frame-name stem of each non-plain class */
const STEM: Record<Exclude<Cls, 'P'>, string> = { G: 'grs', S: 'snw', A: 'wtr', D: 'drt', R: 'str' };

export const N = 1, E = 2, S = 4, W = 8;

export type TileDef =
  | { kind: 'fill'; cls: Cls; variant: number }
  | { kind: 'edge'; cls: Exclude<Cls, 'P'>; mask: number }
  | { kind: 'forest'; style: 'temperate' | 'jungle' | 'pine' | 'willow'; variant: number }
  | { kind: 'hill'; variant: number }
  | { kind: 'rock'; variant: number }
  | { kind: 'peak'; variant: number }
  | { kind: 'house'; variant: number }
  | { kind: 'castle'; variant: number }
  /** wall pieces. style A = stone (big/medium cities), B = rammed earth + timber (small cities, passes).
   *  dir: 'u' = the wall runs along +u (screen "\"), 'v' = along +v (screen "/").
   *  corner: which corner of the walled square (top/right/bottom/left). */
  | { kind: 'wall'; style: 'A' | 'B'; dir: 'u' | 'v'; ruined?: boolean }
  | { kind: 'corner'; style: 'A' | 'B'; corner: 'top' | 'right' | 'bottom' | 'left'; ruined?: boolean }
  /** gatehouse pieces: 3 tiles along the wall: lo tower (smaller u or v), the gate, hi tower */
  | { kind: 'gate'; style: 'A' | 'B'; dir: 'u' | 'v'; part: 'lo' | 'gate' | 'hi'; ruined?: boolean }
  | { kind: 'mask'; name: 'movable' | 'fightable' | 'castable' | 'active' };

/** corner masks of a transition set, in frame order: pln_X01..09 then X_pln01..04, X_pln09 */
const LO_MASKS = [N, E, S, W, N | E, E | S, S | W, W | N, N | S]; // pln_X01..09
const HI_MASKS = [E | S | W, N | S | W, N | E | W, N | E | S]; // X_pln01..04: single plain corner N, E, S, W
const HI_09 = E | W;

export const TILES: Record<string, TileDef> = (() => {
  const t: Record<string, TileDef> = {};
  const p2 = (n: number) => String(n).padStart(2, '0');
  for (let k = 1; k <= 5; k++) t[`plane00${k}`] = { kind: 'fill', cls: 'P', variant: k - 1 };
  for (let k = 0; k <= 4; k++) t[`gggg${k}`] = { kind: 'fill', cls: 'G', variant: k };
  for (let k = 0; k <= 2; k++) t[`ssss${k}`] = { kind: 'fill', cls: 'S', variant: k };
  for (let k = 1; k <= 5; k++) t[`wtr0${k}`] = { kind: 'fill', cls: 'A', variant: k - 1 };
  t['drt-01'] = { kind: 'fill', cls: 'D', variant: 0 };
  for (const [cls, stem] of Object.entries(STEM) as [Exclude<Cls, 'P'>, string][]) {
    LO_MASKS.forEach((m, i) => (t[`pln_${stem}${p2(i + 1)}`] = { kind: 'edge', cls, mask: m }));
    HI_MASKS.forEach((m, i) => (t[`${stem}_pln${p2(i + 1)}`] = { kind: 'edge', cls, mask: m }));
    t[`${stem}_pln09`] = { kind: 'edge', cls, mask: HI_09 };
    // X_pln05..08: extra fill variants of the class
    const base = cls === 'G' ? 5 : cls === 'A' ? 5 : cls === 'S' ? 3 : cls === 'D' ? 1 : 0;
    for (let k = 5; k <= 8; k++) t[`${stem}_pln${p2(k)}`] = { kind: 'fill', cls, variant: base + k - 5 };
  }
  // vegetation and relief
  for (let k = 1; k <= 9; k++) t[`grs_wod${p2(k)}`] = { kind: 'forest', style: 'temperate', variant: k - 1 };
  for (let k = 1; k <= 6; k++) t[`wod_grs${p2(k)}`] = { kind: 'forest', style: 'jungle', variant: k - 1 };
  for (let k = 7; k <= 8; k++) t[`wod_grs${p2(k)}`] = { kind: 'forest', style: 'willow', variant: k - 7 };
  for (let k = 1; k <= 4; k++) t[`wwww${k}`] = { kind: 'forest', style: 'pine', variant: k - 1 };
  for (let k = 1; k <= 5; k++) t[`grs_mtn${p2(k)}`] = { kind: 'hill', variant: k - 1 };
  for (let k = 1; k <= 5; k++) t[`pln_mtn${p2(k)}`] = { kind: 'rock', variant: k - 1 };
  ['smticon-01', 'smticon-02', 'tal00_z', 'tam00_z', 'tar00_z', 'tbl00_z', 'tbm00_z', 'tbr00_z'].forEach(
    (n, i) => (t[n] = { kind: 'peak', variant: i }),
  );
  for (let k = 1; k <= 6; k++) t[`str-hus${p2(k)}`] = { kind: 'house', variant: k - 1 };
  t['pls-l'] = { kind: 'castle', variant: 0 };
  t['pls-r'] = { kind: 'castle', variant: 1 };
  // stone walls (style A)
  t['wal-l'] = { kind: 'wall', style: 'A', dir: 'v' };
  t['wal-r'] = { kind: 'wall', style: 'A', dir: 'u' };
  t['walcor-u'] = { kind: 'corner', style: 'A', corner: 'top' };
  t['walcor-r'] = { kind: 'corner', style: 'A', corner: 'right' };
  t['walcor-d'] = { kind: 'corner', style: 'A', corner: 'bottom' };
  t['walcor-l'] = { kind: 'corner', style: 'A', corner: 'left' };
  t['tal00'] = { kind: 'gate', style: 'A', dir: 'u', part: 'lo' };
  t['tam00'] = { kind: 'gate', style: 'A', dir: 'u', part: 'gate' };
  t['tar00'] = { kind: 'gate', style: 'A', dir: 'u', part: 'hi' };
  t['tbr00'] = { kind: 'gate', style: 'A', dir: 'v', part: 'lo' };
  t['tbm00'] = { kind: 'gate', style: 'A', dir: 'v', part: 'gate' };
  t['tbl00'] = { kind: 'gate', style: 'A', dir: 'v', part: 'hi' };
  // earthen walls (style B)
  t['wal2l'] = { kind: 'wall', style: 'B', dir: 'v' };
  t['wal2r'] = { kind: 'wall', style: 'B', dir: 'u' };
  t['wal2cor1'] = { kind: 'corner', style: 'B', corner: 'top' };
  t['wal2cor2'] = { kind: 'corner', style: 'B', corner: 'right' };
  t['wal2cor3'] = { kind: 'corner', style: 'B', corner: 'bottom' };
  t['wal2cor4'] = { kind: 'corner', style: 'B', corner: 'left' };
  t['dor2l01'] = { kind: 'gate', style: 'B', dir: 'u', part: 'lo' };
  t['dor2l02'] = { kind: 'gate', style: 'B', dir: 'u', part: 'gate' };
  t['dor2l03'] = { kind: 'gate', style: 'B', dir: 'u', part: 'hi' };
  t['dor2r01'] = { kind: 'gate', style: 'B', dir: 'v', part: 'lo' };
  t['dor2r02'] = { kind: 'gate', style: 'B', dir: 'v', part: 'gate' };
  t['dor2r03'] = { kind: 'gate', style: 'B', dir: 'v', part: 'hi' };
  // spare frames of the set: ruined variants (not placed by the generator)
  const ruin = (n: string, src: string) => (t[n] = { ...(t[src] as Extract<TileDef, { kind: 'wall' | 'corner' | 'gate' }>), ruined: true });
  for (const n of ['wal-l', 'wal-r', 'walcor-u', 'walcor-r', 'walcor-d', 'walcor-l', 'wal2l', 'wal2r', 'wal2cor1', 'wal2cor2', 'wal2cor3', 'wal2cor4'])
    ruin(`${n}_z`, n);
  for (const s of ['l', 'r']) for (let k = 1; k <= 3; k++) {
    ruin(`dor2${s}0${k}_z`, `dor2${s}0${k}`);
    ruin(`wal2dor${s}0${k}`, `dor2${s}0${k}`);
    ruin(`wal2dor${s}0${k}_z`, `dor2${s}0${k}`);
  }
  for (const m of ['movable', 'fightable', 'castable', 'active'] as const) t[`${m}mask`] = { kind: 'mask', name: m };
  return t;
})();

/** [graphics] table: 1-based index → frame name (masks are not map graphics). */
export const GRAPHICS: string[] = Object.keys(TILES).filter((n) => TILES[n].kind !== 'mask');
export const GFX_INDEX = new Map(GRAPHICS.map((n, i) => [n, i + 1]));

/** frame name for a ground tile of class `cls` (≠ P) with corner mask `m` (0 = plain fill, 15 = X fill) */
export function groundFrames(cls: Cls, m: number): string[] {
  const fills = (c: Cls) => Object.keys(TILES).filter((n) => { const d = TILES[n]; return d.kind === 'fill' && d.cls === c; });
  if (cls === 'P' || m === 0) return fills('P');
  if (m === 15) return fills(cls);
  return Object.keys(TILES).filter((n) => { const d = TILES[n]; return d.kind === 'edge' && d.cls === cls && d.mask === m; });
}

export function framesOf(pred: (d: TileDef) => boolean): string[] {
  return Object.keys(TILES).filter((n) => pred(TILES[n]));
}
