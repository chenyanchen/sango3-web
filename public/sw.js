// Service worker.
//  - assets-orig/: the player's original assets, imported in the browser
//    (src/import writes them into the ASSETS cache) — cache-first.
//  - assets/ (generated set shipped with the site) and the app shell:
//    network-first with a cache fallback, so updates are picked up and the
//    game still runs offline.
const ASSETS = 'sg3-assets-v1';
const GEN = 'sg3-gen-v1';
const SHELL = 'sg3-shell-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

async function rangeResponse(res, range) {
  const m = /bytes=(\d*)-(\d*)/.exec(range);
  const blob = await res.blob();
  if (!m) return new Response(blob, { headers: res.headers });
  let start = m[1] ? +m[1] : blob.size - +m[2];
  let end = m[1] && m[2] ? +m[2] : blob.size - 1;
  start = Math.max(0, start);
  end = Math.min(blob.size - 1, end);
  return new Response(blob.slice(start, end + 1), {
    status: 206,
    headers: {
      'content-type': res.headers.get('content-type') || 'application/octet-stream',
      'content-range': `bytes ${start}-${end}/${blob.size}`,
      'content-length': String(end - start + 1),
      'accept-ranges': 'bytes',
    },
  });
}

async function serveAsset(req, url) {
  const c = await caches.open(ASSETS);
  const hit = await c.match(url.href, { ignoreSearch: true });
  if (hit) {
    const range = req.headers.get('range');
    return range ? rangeResponse(hit, range) : hit;
  }
  const res = await fetch(req);
  // version.json marks a complete asset set: never cache the host's copy
  if (res.ok && res.status === 200 && !url.pathname.endsWith('version.json') && !req.headers.has('range')) {
    c.put(url.href, res.clone());
  }
  return res;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.includes('/assets-orig/')) {
    e.respondWith(serveAsset(req, url));
    return;
  }
  if (req.headers.has('range')) return;
  const bucket = url.pathname.includes('/assets/') ? GEN : SHELL;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && res.status === 200) {
          const copy = res.clone();
          caches.open(bucket).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || Response.error())),
  );
});
