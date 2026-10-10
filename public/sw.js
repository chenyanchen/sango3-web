// Service worker: cache-first for game assets (immutable once extracted),
// network-first for the app shell so updates are picked up.
const ASSETS = 'sg3-assets-v1';
const SHELL = 'sg3-shell-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.includes('/assets/') && !url.pathname.endsWith('version.json')) {
    // Range requests (audio seeking) bypass the cache.
    if (req.headers.has('range')) return;
    e.respondWith(
      caches.open(ASSETS).then(async (c) => {
        const hit = await c.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok && res.status === 200) c.put(req, res.clone());
        return res;
      }),
    );
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
