// Service worker: serves game assets from Cache Storage. Assets either come
// from the host (cached on first use) or were imported in the browser from the
// player's own installer (src/import writes them into the same cache).
// The app shell is network-first so updates are picked up.
const ASSETS = 'sg3-assets-v1';
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
  if (url.pathname.includes('/assets/')) {
    e.respondWith(serveAsset(req, url));
    return;
  }
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) caches.open(SHELL).then((c) => c.put(req, res.clone()));
        return res;
      })
      .catch(() => caches.match(req).then((r) => r || Response.error())),
  );
});
