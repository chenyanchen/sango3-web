// Smart Install Maker 5.x installer unpacker.
// The installer stores its payload as a multi-volume Microsoft Cabinet set whose
// "MSCF" signatures have been stripped. We locate every volume, restore the
// signature and stream the wanted files out (see cab.ts), mapping the numbered
// cabinet entries back to their real paths via the installer's file table.
import type { InflateRaw, RandomAccess, Writer } from './bytes';
import { u16, u32 } from './bytes';
import { extractCabSet } from './cab';

function findOverlay(buf: Uint8Array): number {
  const pe = u32(buf, 0x3c);
  const nsec = u16(buf, pe + 6);
  const optSize = u16(buf, pe + 20);
  let end = 0;
  for (let i = 0; i < nsec; i++) {
    const s = pe + 24 + optSize + i * 40;
    end = Math.max(end, u32(buf, s + 20) + u32(buf, s + 16));
  }
  return end;
}

/** Returns installer-relative paths in payload order (index == cab file name). */
function readFileTable(head: Uint8Array): string[] {
  const gbk = new TextDecoder('gbk');
  const parts: Uint8Array[] = [];
  let start = 0;
  for (let i = 0; i < head.length; i++) {
    if (head[i] === 0) {
      parts.push(head.subarray(start, i));
      start = i + 1;
    }
  }
  const prefix = [...'@$&%04\\'].map((c) => c.charCodeAt(0));
  const is = (p: Uint8Array, c: number) => p.length === 1 && p[0] === c;
  const out: string[] = [];
  for (let i = 0; i + 2 < parts.length; i++) {
    const p = parts[i];
    if (p.length > prefix.length && prefix.every((c, k) => p[k] === c) && is(parts[i + 1], 0x32) && is(parts[i + 2], 0x31)) {
      out.push(gbk.decode(p.subarray(prefix.length)).replaceAll('\\', '/'));
    }
  }
  return out;
}

export interface UnpackOptions {
  /** installer-relative path filter, e.g. "Sango3y/sango3.pak" */
  want: (rel: string) => boolean;
  open: (rel: string, size: number) => Writer;
  inflateRaw: InflateRaw;
  /** phase: "scan" (finding volumes) or "unpack" */
  progress?: (phase: 'scan' | 'unpack', done: number, total: number) => void;
}

export function isInstaller(exe: RandomAccess) {
  const h = exe.read(0, 2);
  return h[0] === 0x4d && h[1] === 0x5a;
}

export function unpackInstaller(exe: RandomAccess, o: UnpackOptions): string[] {
  const size = exe.size;
  const overlay = findOverlay(exe.read(0, 4096));
  const files = readFileTable(exe.read(overlay, Math.min(1 << 20, size - overlay)));
  if (files.length === 0) throw new Error('not a Smart Install Maker installer');

  // Scan for stripped CFHEADERs: [reserved1=0][cbCabinet][reserved2=0][coffFiles][reserved3=0][3][1]
  const CHUNK = 32 << 20;
  const cabs: { off: number; size: number }[] = [];
  for (let pos = overlay; pos < size; ) {
    const buf = exe.read(pos, Math.min(CHUNK + 64, size - pos));
    const n = buf.length;
    let i = 0;
    for (; i + 22 < n && i < CHUNK; i++) {
      if (buf[i + 20] !== 3 || buf[i + 21] !== 1) continue;
      if (u32(buf, i) !== 0 || u32(buf, i + 8) !== 0 || u32(buf, i + 16) !== 0) continue;
      const cb = u32(buf, i + 4);
      const coff = u32(buf, i + 12);
      if (coff > 0x100000 || coff < 36 || cb < coff || pos + i + cb - 4 > size) continue;
      cabs.push({ off: pos + i, size: cb });
      i += cb - 5;
    }
    // a skipped cabinet may jump past the chunk; continue right after it
    pos += Math.max(i, 1);
    if (n < CHUNK + 64) break;
    o.progress?.('scan', pos, size);
  }
  if (cabs.length < 2) throw new Error('no cabinet volumes found');
  const MSCF = [0x4d, 0x53, 0x43, 0x46];
  // Volume 0 holds installer temp files; the payload set starts at volume 1.
  const vols: RandomAccess[] = cabs.slice(1).map((c) => ({
    size: c.size,
    read(off: number, len: number) {
      if (off >= 4) return exe.read(c.off + off - 4, len);
      const b = new Uint8Array(len);
      let k = 0;
      for (; k < len && off + k < 4; k++) b[k] = MSCF[off + k];
      if (k < len) b.set(exe.read(c.off, len - k), k);
      return b;
    },
  }));
  const rel = (name: string) => files[Number(name)];
  const got: string[] = [];
  extractCabSet(
    vols,
    {
      accept: (name) => !!rel(name) && o.want(rel(name)),
      open: (name, n) => (got.push(rel(name)), o.open(rel(name), n)),
      progress: (d, t) => o.progress?.('unpack', d, t),
    },
    o.inflateRaw,
  );
  return got;
}
