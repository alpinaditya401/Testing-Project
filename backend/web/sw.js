const CACHE = 'aquasmart-v18';
const ASSETS = [
  './',
  './index.html',
  './assets/css/app.css',
  './assets/js/app.js',
  './assets/js/icons.js',
  './assets/js/dom.js',
  './assets/js/format.js',
  './assets/js/ui-overlay.js',
  './assets/js/state-store.js',
  './assets/js/server-mappers.js',
  './assets/js/views-public.js',
  './assets/js/provenance.js',
  './assets/js/views-dashboard.js',
  './assets/js/shell-nav.js',
  './assets/js/api-client.js',
  './assets/js/views-routes.js',
  './assets/js/session.js',
  './assets/js/experience.js',
  './assets/images/logo.svg',
  './assets/images/icon-192.png',
  './assets/images/icon-512.png',
  './assets/images/apple-touch-icon.png',
  './assets/images/water-sample-static.svg',
  './manifest.webmanifest'
];
const STATIC_URLS = new Set(ASSETS.map(path => new URL(path, self.registration.scope).href));

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => key.startsWith('aquasmart-') && key !== CACHE).map(key => caches.delete(key))
  )).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const requestUrl = new URL(event.request.url);
  // Fragment identifies a client route, not a different network asset.
  requestUrl.hash = '';
  if (requestUrl.origin !== self.location.origin || requestUrl.pathname.startsWith('/api/') || requestUrl.pathname === '/api') return;
  // Cache only the public shell's explicit static assets. Unknown or authenticated
  // resources and query-bearing URLs are network-only, never an HTML fallback.
  if (!STATIC_URLS.has(requestUrl.href)) return;
  event.respondWith(fetch(event.request).then(async response => {
    const policy = response.headers.get('Cache-Control') || '';
    if (response.ok && !/no-store|private/i.test(policy)) {
      try { const cache = await caches.open(CACHE); await cache.put(event.request, response.clone()); } catch (_) { /* Storage quota cannot break a successful network read. */ }
    }
    return response;
  }).catch(async () => (await caches.match(event.request)) || Response.error()));
});
