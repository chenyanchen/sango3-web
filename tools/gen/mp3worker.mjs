// Worker thread for tools/gen/main.ts: encodes stereo Float32 PCM to MP3 (lamejs).
import { parentPort } from 'node:worker_threads';
import { Mp3Encoder } from '@breezystack/lamejs';

parentPort.on('message', ({ id, rate, left, right, kbps }) => {
  const enc = new Mp3Encoder(2, rate, kbps);
  const toI16 = (f) => Int16Array.from(f, (v) => Math.max(-1, Math.min(1, v)) * 32767);
  const L = toI16(left), R = toI16(right);
  const parts = [];
  const STEP = 1152 * 32;
  for (let i = 0; i < L.length; i += STEP) parts.push(enc.encodeBuffer(L.subarray(i, i + STEP), R.subarray(i, i + STEP)).slice());
  parts.push(enc.flush().slice());
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of parts) (out.set(p, o), (o += p.length));
  parentPort.postMessage({ id, data: out }, [out.buffer]);
});
