/* PackWise service worker: versioned app-shell precache, cache-first, offline-ready.
 * Bump CACHE_VERSION (and APP_VERSION in js/models.js) with every release. */
const CACHE_VERSION = 'packwise-v1.10.0';

const PRECACHE = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/tokens.css',
  'css/base.css',
  'css/layout.css',
  'css/components.css',
  'css/screens.css',
  'css/studio.css',
  'css/explore.css',
  'js/theme-boot.js',
  'js/main.js',
  'js/dom.js',
  'js/router.js',
  'js/store.js',
  'js/models.js',
  'js/progress.js',
  'js/templates.js',
  'js/selectors.js',
  'js/validate.js',
  'js/migrations.js',
  'js/backup.js',
  'js/prefs.js',
  'js/guide.js',
  'js/data/catalog.js',
  'js/parallax.js',
  'js/haptics.js',
  'js/install.js',
  'js/export.js',
  'js/companion.js',
  'js/format.js',
  'js/storage/idb.js',
  'js/storage/memory.js',
  'js/ui/art.js',
  'js/ui/bubble.js',
  'js/ui/suitcase.js',
  'js/ui/components.js',
  'js/ui/dialog.js',
  'js/ui/icons.js',
  'js/ui/toast.js',
  'js/screens/shared.js',
  'js/screens/welcome.js',
  'js/screens/dashboard.js',
  'js/screens/trips.js',
  'js/screens/tripForm.js',
  'js/screens/checklist.js',
  'js/screens/tasks.js',
  'js/screens/pack.js',
  'js/screens/summary.js',
  'js/screens/settings.js',
  'js/screens/more.js',
  'js/screens/studio.js',
  'js/screens/explore.js',
  'js/screens/taste.js',
  'js/screens/guide.js',
  'js/screens/online.js',
  'js/online.js',
  'js/screens/customPlace.js',
  'js/ui/itemart.js',
  'js/plan.js',
  'js/taste.js',
  'js/data/food.js',
  'js/screens/print.js',
  'js/screens/templates.js',
  'js/screens/tripDialogs.js',
  'assets/icons/icon.svg',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
  'assets/icons/maskable-192.png',
  'assets/icons/maskable-512.png',
  'assets/icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  // No skipWaiting here: a new version waits until the user chooses to reload,
  // so open pages never swap code (or schema expectations) underneath unsaved edits.
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(PRECACHE.map((p) => new Request(p, { cache: 'reload' })))),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith('packwise-') && k !== CACHE_VERSION).map((k) => caches.delete(k)));
      // integrity: a half-written cache is repaired before this version takes over
      try { if ((await missingFiles()).length) await repairCache(); } catch { /* offline: keep what we have */ }
      await self.clients.claim();
    })(),
  );
});

const precacheUrl = (p) => new URL(p, self.registration.scope).href;

/** Which precached files are absent from the cache (empty = intact). */
async function missingFiles() {
  const cache = await caches.open(CACHE_VERSION);
  const missing = [];
  for (const p of PRECACHE) if (!(await cache.match(precacheUrl(p)))) missing.push(p);
  return missing;
}

async function repairCache() {
  await caches.delete(CACHE_VERSION);
  const cache = await caches.open(CACHE_VERSION);
  await cache.addAll(PRECACHE.map((p) => new Request(p, { cache: 'reload' })));
}

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'SKIP_WAITING') self.skipWaiting();
  const reply = (msg) => event.ports && event.ports[0] && event.ports[0].postMessage(msg);
  if (data.type === 'VERIFY') {
    event.waitUntil(missingFiles().then((missing) => reply({ ok: true, total: PRECACHE.length, missing }), (err) => reply({ ok: false, error: String(err) })));
  }
  if (data.type === 'REPAIR') {
    event.waitUntil(repairCache().then(() => missingFiles()).then((missing) => reply({ ok: missing.length === 0, total: PRECACHE.length, missing }), (err) => reply({ ok: false, error: String(err) })));
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // never touch third-party requests

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_VERSION);
      const isNav = request.mode === 'navigate';
      const cached = await cache.match(isNav ? new URL('index.html', self.registration.scope).href : request, { ignoreSearch: true });
      if (cached) return cached;
      try {
        const response = await fetch(request);
        if (response.ok && response.type === 'basic') cache.put(request, response.clone());
        return response;
      } catch (err) {
        if (isNav) {
          const shell = await cache.match(new URL('index.html', self.registration.scope).href);
          if (shell) return shell;
        }
        throw err;
      }
    })(),
  );
});
