// Runtime access to converted shapes (see tools/extract).
//
// Shapes are grouped by their original directory, e.g. "bf/general/001".
// Each directory has a JSON manifest with atlas pages (small frames) and
// standalone images (large frames). Frames are addressed by lower-case name.
import { Assets, Rectangle, Texture } from 'pixi.js';

const BASE = import.meta.env.BASE_URL + 'assets/';
export const assetUrl = (rel: string) => BASE + rel;

export interface Frame {
  tex: Texture;
  /** anchor (pixel offset inside the frame) — draw at pos - (ax, ay) */
  ax: number;
  ay: number;
  w: number;
  h: number;
}

type FrameRec = [number, number, number, number, number, number, number];
type SingleRec = [string, number, number, number, number];
interface DirManifest {
  pages: string[];
  frames: Record<string, FrameRec>;
  singles: Record<string, SingleRec>;
}

export class ShapeDir {
  private cache = new Map<string, Frame>();
  constructor(
    readonly dir: string,
    private man: DirManifest,
    private pages: Texture[],
  ) {}

  has(name: string) {
    name = name.toLowerCase();
    return name in this.man.frames || name in this.man.singles;
  }

  names(): string[] {
    return [...Object.keys(this.man.frames), ...Object.keys(this.man.singles)];
  }

  /** Synchronous lookup for atlas frames (always loaded with the dir). */
  frame(name: string): Frame | undefined {
    name = name.toLowerCase();
    const c = this.cache.get(name);
    if (c) return c;
    const r = this.man.frames[name];
    if (!r) return undefined;
    const [p, x, y, w, h, ax, ay] = r;
    const f: Frame = { tex: new Texture({ source: this.pages[p].source, frame: new Rectangle(x, y, w, h) }), ax, ay, w, h };
    this.cache.set(name, f);
    return f;
  }

  /** Lookup for any frame, loading large standalone images on demand. */
  async load(name: string): Promise<Frame | undefined> {
    name = name.toLowerCase();
    const f = this.frame(name) ?? this.cache.get(name);
    if (f) return f;
    const s = this.man.singles[name];
    if (!s) return undefined;
    const tex = await Assets.load<Texture>(assetUrl('shape/' + s[0]));
    const fr: Frame = { tex, w: s[1], h: s[2], ax: s[3], ay: s[4] };
    this.cache.set(name, fr);
    return fr;
  }

  /** Synchronous access to a standalone image previously loaded with load()/preloadSingles(). */
  single(name: string): Frame | undefined {
    return this.cache.get(name.toLowerCase());
  }

  singleFile(name: string): string | undefined {
    return this.man.singles[name.toLowerCase()]?.[0];
  }

  async preloadSingles(names?: string[]) {
    await Promise.all((names ?? Object.keys(this.man.singles)).map((n) => this.load(n)));
  }
}

const dirs = new Map<string, Promise<ShapeDir>>();

export function normDir(dir: string) {
  return dir.replaceAll('\\', '/').replace(/^\/+|\/+$/g, '').toLowerCase();
}

/** Loads (once) a shape directory's manifest and atlas pages. */
export function shapes(dir: string): Promise<ShapeDir> {
  dir = normDir(dir);
  let p = dirs.get(dir);
  if (!p) {
    p = (async () => {
      const key = dir ? dir.replaceAll('/', '_') : '_root';
      const r = await fetch(assetUrl(`shape/${key}.json`));
      if (!r.ok) throw new Error(`shape dir not found: ${dir}`);
      const man = (await r.json()) as DirManifest;
      const pages = await Promise.all(man.pages.map((pg) => Assets.load<Texture>(assetUrl('shape/' + pg))));
      return new ShapeDir(dir, man, pages);
    })();
    dirs.set(dir, p);
  }
  return p;
}

/** Convenience: load one frame by full path, e.g. "mm/base/main". */
export async function shape(path: string): Promise<Frame> {
  path = normDir(path);
  const i = path.lastIndexOf('/');
  const d = await shapes(i < 0 ? '' : path.slice(0, i));
  const f = await d.load(path.slice(i + 1));
  if (!f) throw new Error(`shape not found: ${path}`);
  return f;
}

/** URL of a standalone (large) image or atlas page for use in DOM <img>/CSS. */
export function shapeUrlSync(file: string) {
  return assetUrl('shape/' + file);
}

/** Direct URL for a standalone (large) image, e.g. "ad/base/map"; falls back to frameDataUrl. */
export async function imageUrl(path: string): Promise<string> {
  path = normDir(path);
  const i = path.lastIndexOf('/');
  const d = await shapes(i < 0 ? '' : path.slice(0, i));
  const file = d.singleFile(path.slice(i + 1));
  return file ? assetUrl('shape/' + file) : frameDataUrl(path);
}

const canvasCache = new Map<string, Promise<string>>();
/**
 * Returns an object URL with a single frame cut out as PNG, for DOM UI
 * (portraits, icons). Cached.
 */
export function frameDataUrl(path: string): Promise<string> {
  path = normDir(path);
  let p = canvasCache.get(path);
  if (!p) {
    p = (async () => {
      const f = await shape(path);
      const src = f.tex.source.resource as CanvasImageSource;
      const fr = f.tex.frame;
      const c = document.createElement('canvas');
      c.width = fr.width;
      c.height = fr.height;
      c.getContext('2d')!.drawImage(src, fr.x, fr.y, fr.width, fr.height, 0, 0, fr.width, fr.height);
      const blob = await new Promise<Blob>((res) => c.toBlob((b) => res(b!), 'image/png'));
      return URL.createObjectURL(blob);
    })();
    canvasCache.set(path, p);
  }
  return p;
}
