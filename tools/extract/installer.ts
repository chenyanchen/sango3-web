// Smart Install Maker 5.x installer unpacker.
// The installer stores its payload as a multi-volume Microsoft Cabinet set whose
// "MSCF" signatures have been stripped. We locate every volume, restore the
// signature and stream the wanted files out (see cab.ts), mapping the numbered
// cabinet entries back to their real paths via the installer's file table.
import fs from 'node:fs';
import { extractCabSet, type CabVolume } from './cab.ts';

const gbk = new TextDecoder('gbk');

function findOverlay(buf: Buffer): number {
  const pe = buf.readUInt32LE(0x3c);
  const nsec = buf.readUInt16LE(pe + 6);
  const optSize = buf.readUInt16LE(pe + 20);
  let end = 0;
  for (let i = 0; i < nsec; i++) {
    const s = pe + 24 + optSize + i * 40;
    end = Math.max(end, buf.readUInt32LE(s + 20) + buf.readUInt32LE(s + 16));
  }
  return end;
}

/** Returns installer-relative paths in payload order (index == cab file name). */
function readFileTable(fd: number, overlay: number): string[] {
  const head = Buffer.alloc(1 << 20);
  fs.readSync(fd, head, 0, head.length, overlay);
  const parts: Buffer[] = [];
  let start = 0;
  for (let i = 0; i < head.length; i++) {
    if (head[i] === 0) {
      parts.push(head.subarray(start, i));
      start = i + 1;
    }
  }
  const out: string[] = [];
  const prefix = Buffer.from('@$&%04\\');
  for (let i = 0; i + 2 < parts.length; i++) {
    const p = parts[i];
    if (p.subarray(0, prefix.length).equals(prefix) && parts[i + 1].toString() === '2' && parts[i + 2].toString() === '1') {
      out.push(gbk.decode(p.subarray(prefix.length)).replaceAll('\\', '/'));
    }
  }
  return out;
}

export function unpackInstaller(exe: string, outDir: string, want: (rel: string) => boolean = () => true): void {
  const fd = fs.openSync(exe, 'r');
  const size = fs.fstatSync(fd).size;
  const overlay = findOverlay(Buffer.from(readHead(fd, 4096)));
  const files = readFileTable(fd, overlay);
  if (files.length === 0) throw new Error('not a Smart Install Maker installer');

  // Scan for stripped CFHEADERs: [reserved1=0][cbCabinet][reserved2=0][coffFiles][reserved3=0][3][1]
  const CHUNK = 64 << 20;
  const buf = Buffer.alloc(CHUNK + 64);
  const cabs: { off: number; size: number }[] = [];
  for (let pos = overlay; pos < size; pos += CHUNK) {
    const n = fs.readSync(fd, buf, 0, CHUNK + 64, pos);
    for (let i = 0; i + 22 < n && i < CHUNK; i++) {
      if (buf[i + 20] !== 3 || buf[i + 21] !== 1) continue;
      if (buf.readUInt32LE(i) !== 0 || buf.readUInt32LE(i + 8) !== 0 || buf.readUInt32LE(i + 16) !== 0) continue;
      const cb = buf.readUInt32LE(i + 4);
      const coff = buf.readUInt32LE(i + 12);
      if (coff > 0x100000 || coff < 36 || cb < coff || pos + i + cb - 4 > size) continue;
      cabs.push({ off: pos + i, size: cb });
      i += cb - 5;
    }
  }
  if (cabs.length < 2) throw new Error('no cabinet volumes found');
  // Volume 0 holds installer temp files; the payload set starts at volume 1.
  const vols: CabVolume[] = cabs.slice(1).map((c) => ({
    size: c.size,
    read(off: number, len: number) {
      const b = Buffer.alloc(len);
      let o = 0;
      if (off < 4) {
        const sig = Buffer.from('MSCF').subarray(off, Math.min(4, off + len));
        sig.copy(b, 0);
        o = sig.length;
      }
      if (o < len) fs.readSync(fd, b, o, len - o, c.off + (off + o - 4));
      return b;
    },
  }));
  extractCabSet(vols, outDir, (name) => {
    const rel = files[Number(name)];
    return rel && want(rel) ? rel : null;
  });
  fs.closeSync(fd);
}

function readHead(fd: number, n: number): Uint8Array {
  const b = Buffer.alloc(n);
  fs.readSync(fd, b, 0, n, 0);
  return b;
}
