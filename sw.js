/* PackWise service worker: versioned app-shell precache, cache-first, offline-ready.
 * Bump CACHE_VERSION (and APP_VERSION in js/models.js) with every release. */
const CACHE_VERSION = 'packwise-v1.1.0';

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
  'js/screens/studio.js',
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
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
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
