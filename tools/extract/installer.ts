// Smart Install Maker 5.x installer unpacker.
// The installer stores its payload as a multi-volume Microsoft Cabinet set whose
// "MSCF" signatures have been stripped. We locate every volume, restore the
// signature, extract with `cabextract`, then map the numbered output files back
// to their real paths using the file table in the installer header.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

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

export function unpackInstaller(exe: string, outDir: string): void {
  const fd = fs.openSync(exe, 'r');
  const size = fs.fstatSync(fd).size;
  const overlay = findOverlay(Buffer.from(readHead(fd, 4096)));
  const files = readFileTable(fd, overlay);
  if (files.length === 0) throw new Error('not a Smart Install Maker installer');

  const cabDir = path.join(outDir, '.cabs');
  const rawDir = path.join(outDir, '.raw');
  fs.mkdirSync(cabDir, { recursive: true });
  fs.mkdirSync(rawDir, { recursive: true });

  // Scan for stripped CFHEADERs: [reserved1=0][cbCabinet][reserved2=0][coffFiles][reserved3=0][3][1]
  const CHUNK = 64 << 20;
  const buf = Buffer.alloc(CHUNK + 64);
  const cabs: { off: number; size: number }[] = [];
  for (let pos = overlay; pos < size; pos += CHUNK) {
    const n = fs.readSync(fd, buf, 0, CHUNK + 64, pos);
    for (let i = 0; i + 26 < n && i < CHUNK; i++) {
      if (buf[i + 24] !== 3 || buf[i + 25] !== 1) continue;
      if (buf.readUInt32LE(i) !== 0 || buf.readUInt32LE(i + 8) !== 0 || buf.readUInt32LE(i + 16) !== 0) continue;
      const cb = buf.readUInt32LE(i + 4);
      const coff = buf.readUInt32LE(i + 12);
      if (coff > 0x100000 || coff < 36 || cb < coff || pos + i + cb - 4 > size) continue;
      cabs.push({ off: pos + i, size: cb });
      i += cb - 5;
    }
  }
  if (cabs.length === 0) throw new Error('no cabinet volumes found');
  // Volume 0 holds installer temp files; volumes 1.. are named 0000.tmp, 0001.tmp, ...
  cabs.forEach((c, idx) => {
    const data = Buffer.alloc(c.size);
    data.write('MSCF', 0, 'latin1');
    fs.readSync(fd, data, 4, c.size - 4, c.off);
    const name = idx === 0 ? 'setup.cab' : `${String(idx - 1).padStart(4, '0')}.tmp`;
    fs.writeFileSync(path.join(cabDir, name), data);
  });
  fs.closeSync(fd);

  execFileSync('cabextract', ['-q', '-d', rawDir, path.join(cabDir, '0000.tmp')], { stdio: 'inherit' });
  files.forEach((rel, i) => {
    const src = path.join(rawDir, String(i));
    if (!fs.existsSync(src)) return;
    const dst = path.join(outDir, rel);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.renameSync(src, dst);
  });
  fs.rmSync(cabDir, { recursive: true, force: true });
  fs.rmSync(rawDir, { recursive: true, force: true });
}

function readHead(fd: number, n: number): Uint8Array {
  const b = Buffer.alloc(n);
  fs.readSync(fd, b, 0, n, 0);
  return b;
}
