// SafeWalk UK — Service Worker
// Purpose: let the app SHELL (HTML/CSS/JS/icons + map/library files) open with no
// signal, so the app isn't a blank white screen if you lose signal after opening it.
// Deliberately does NOT cache live data: crime data, routing, CCTV/POI, or Firestore
// (Live Companion) calls always go to the network — caching those would risk showing
// stale/wrong safety information, which is worse than showing an error.

const SW_VERSION = 'v1.5.6';
const SHELL_CACHE = `safewalk-shell-${SW_VERSION}`;
const RUNTIME_CACHE = `safewalk-runtime-${SW_VERSION}`;
const TILE_CACHE = `safewalk-tiles-${SW_VERSION}`;
const TILE_CACHE_MAX = 300; // cap map-tile cache so it doesn't grow unbounded

const SHELL_FILES = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-192-maskable.png',
  '/icon-512-maskable.png'
];

// Hosts whose data must ALWAYS be live — never served from cache, never stored.
const NEVER_CACHE_HOSTS = [
  'data.police.uk',
  'router.project-osrm.org',
  'routing.openstreetmap.de',
  'nominatim.openstreetmap.org',
  'overpass-api.de',
  'overpass.kumi.systems',
  'firestore.googleapis.com',
  'firebaseio.com',
  'googleapis.com',
  'google-analytics.com',
  'googletagmanager.com'
];

// Hosts for static libraries/fonts that rarely change — safe to cache and reuse.
const RUNTIME_CACHEABLE_HOSTS = [
  'cdnjs.cloudflare.com',
  'gstatic.com'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(cache => cache.addAll(SHELL_FILES))
      .catch(err => console.warn('[SW] Shell precache failed (non-fatal):', err))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => ![SHELL_CACHE, RUNTIME_CACHE, TILE_CACHE].includes(k)).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

function isNeverCache(url) {
  return NEVER_CACHE_HOSTS.some(h => url.hostname.includes(h));
}
function isRuntimeCacheable(url) {
  return RUNTIME_CACHEABLE_HOSTS.some(h => url.hostname.includes(h));
}
function isTile(url) {
  return url.hostname.endsWith('tile.openstreetmap.org');
}

async function trimCache(cacheName, maxItems) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length > maxItems) {
    await cache.delete(keys[0]);
    await trimCache(cacheName, maxItems);
  }
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return; // never intercept POST etc (Firestore writes, etc.)
  const url = new URL(req.url);

  // 1) Live data APIs — always network, never touched by the service worker.
  if (isNeverCache(url)) return;

  // 2) Navigations (opening/reloading the app) — network first, fall back to the
  //    cached shell so the app still opens with no signal.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then(res => {
        caches.open(SHELL_CACHE).then(cache => cache.put('/index.html', res.clone()));
        return res;
      }).catch(() => caches.match('/index.html'))
    );
    return;
  }

  // 3) Map tiles — cache-first with a background refresh, capped cache size, so
  //    previously viewed map areas still render offline.
  if (isTile(url)) {
    event.respondWith(
      caches.open(TILE_CACHE).then(async cache => {
        const cached = await cache.match(req);
        const fetchPromise = fetch(req).then(res => {
          if (res && res.status === 200) { cache.put(req, res.clone()); trimCache(TILE_CACHE, TILE_CACHE_MAX); }
          return res;
        }).catch(() => cached);
        return cached || fetchPromise;
      })
    );
    return;
  }

  // 4) Static libraries (Leaflet, Firebase SDK, fonts) — cache-first, refresh in background.
  if (isRuntimeCacheable(url)) {
    event.respondWith(
      caches.open(RUNTIME_CACHE).then(async cache => {
        const cached = await cache.match(req);
        const fetchPromise = fetch(req).then(res => {
          if (res && res.status === 200) cache.put(req, res.clone());
          return res;
        }).catch(() => cached);
        return cached || fetchPromise;
      })
    );
    return;
  }

  // 5) Same-origin shell files (manifest, icons) — cache-first.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then(cached => cached || fetch(req))
    );
    return;
  }

  // 6) Anything else — just go to network, don't intercept.
});

self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
