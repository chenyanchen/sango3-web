// Contracts between the generator runner (main.ts) and the content modules
// (paint/*, data/*, audio/*, maps/*). Every module is auto-discovered: drop a
// file in the folder that exports the named binding and it is picked up.

/** Original frame box: size, and anchor (pivot) inside it. */
export type Box = [w: number, h: number, ax: number, ay: number];

/** Where a frame is used in an animation (from spec/objects.json). */
export interface FrameUse {
  /** object id (Things sequence), e.g. "30001" */
  obj: string;
  /** animation name, e.g. "attack01", "walk", "die" */
  anim: string;
  /** index of this frame in the animation, and the animation length */
  i: number;
  n: number;
  /** event fired on this frame (e.g. "attack": the hit lands here) */
  ev?: string;
}

export interface FrameJob {
  /** shape directory, e.g. "bf/general/001", "" for the root */
  dir: string;
  /** frame name (lower-case), e.g. "com010007" */
  name: string;
  /** original box; a painter may return another size, but must keep the anchor meaning (e.g. feet) */
  box: Box;
  /** large standalone image in the original (backgrounds, maps, title art) */
  single: boolean;
  uses: FrameUse[];
}

/** Painter output: an SVG document (rasterized at its width/height) or raw RGBA. */
export type PaintOut =
  | { svg: string; w: number; h: number; ax: number; ay: number }
  | { rgba: Uint8Array; w: number; h: number; ax: number; ay: number };

export interface Painter {
  /** short id for logs / --only */
  id: string;
  /** directories this painter owns (a dir is painted by the first painter that matches) */
  match(dir: string): boolean;
  /** optional per-directory setup (e.g. to share a palette across the frames of one sprite set) */
  prepare?(dir: string, jobs: FrameJob[]): void | Promise<void>;
  paint(job: FrameJob): PaintOut | Promise<PaintOut>;
}

/** tools/gen/paint/*.ts export `painter` (or `painters`). */
export interface PaintModule {
  painter?: Painter;
  painters?: Painter[];
}

/**
 * tools/gen/data/*.ts export `files()`: data file base name → INI-JSON
 * sections, e.g. { General01: [{ _: 'GENERAL', No: '1', Name: '刘备', ... }] }.
 * Values are strings or string arrays, exactly like the extracted original
 * (src/data/db.ts parses them).
 */
export interface DataModule {
  files(): Record<string, IniSection[]> | Promise<Record<string, IniSection[]>>;
}
export type IniSection = { _: string } & Record<string, string | string[]>;

/** tools/gen/audio/*.ts: synthesized sound effects and music. */
export interface AudioModule {
  /** effect names this module provides (see spec/audio.json) */
  sounds?: string[];
  /** mono samples in [-1, 1] at `rate` */
  sound?(name: string): { rate: number; data: Float32Array } | null;
  music?: string[];
  /** stereo samples in [-1, 1]; the track loops seamlessly from end to start */
  track?(name: string): { rate: number; left: Float32Array; right: Float32Array } | null;
}

/** tools/gen/maps/*.ts: binary files under map/, e.g. { 'map001.blk': bytes }. */
export interface MapModule {
  maps(): Record<string, Uint8Array> | Promise<Record<string, Uint8Array>>;
}

/**
 * Appearance of a portrait, decided by the people data (tools/gen/data/people.ts
 * exports `PORTRAITS: PortraitSlot[]`) and drawn by the portrait painter.
 */
export interface Look {
  sex: 1 | 2;
  age: 'young' | 'adult' | 'old';
  build: 'slim' | 'normal' | 'stout';
  role: 'warrior' | 'strategist' | 'lord' | 'scholar' | 'barbarian' | 'beauty' | 'eunuch' | 'emperor';
  beard: 'none' | 'stubble' | 'short' | 'long' | 'full';
  face: 'gentle' | 'stern' | 'fierce' | 'cunning' | 'noble';
  skin?: 'pale' | 'normal' | 'ruddy' | 'dark';
  hat?: 'helmet' | 'crown' | 'guan' | 'scarf' | 'headband' | 'none';
}
/** frame: portrait frame name, e.g. "portrait012", "emperor01", "mface003", "wface010" */
export interface PortraitSlot {
  frame: string;
  name: string;
  look: Look;
}
