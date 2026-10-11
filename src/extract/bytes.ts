// Little-endian helpers over plain Uint8Arrays, so the format decoders run
// unchanged in Node (CLI) and in the browser (import worker).

/** Synchronous random access to a large file (fs fd, File + FileReaderSync, …). */
export interface RandomAccess {
  readonly size: number;
  read(off: number, len: number): Uint8Array;
}

/** Sequential output for one extracted file. */
export interface Writer {
  write(chunk: Uint8Array): void;
  close(): void;
}

export const u16 = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8);
export const u32 = (b: Uint8Array, o: number) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
export const i32 = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24);

export function latin1(b: Uint8Array, start = 0, end = b.length) {
  let s = '';
  for (let i = start; i < end; i++) s += String.fromCharCode(b[i]);
  return s;
}

export function concat(parts: Uint8Array[]): Uint8Array {
  if (parts.length === 1) return parts[0];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** Raw DEFLATE decoder with an optional preset dictionary (MSZIP chains blocks this way). */
export type InflateRaw = (data: Uint8Array, dict: Uint8Array | undefined) => Uint8Array;
