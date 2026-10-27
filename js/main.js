import { h } from './dom.js';
import { applyPrefs, getPrefs, setPrefs } from './prefs.js';
import { createStore } from './store.js';
import { createIdbAdapter } from './storage/idb.js';
import { createMemoryAdapter } from './storage/memory.js';
import { createRouter } from './router.js';
import { icon } from './ui/icons.js';
import { logoMark, destinationArt } from './ui/art.js';
import { button, emptyState } from './ui/components.js';
import { toast } from './ui/toast.js';
import { downloadBackup } from './backup.js';
import { DashboardScreen } from './screens/dashboard.js';
import { TripsScreen } from './screens/trips.js';
import { TripFormScreen } from './screens/tripForm.js';
import { ChecklistScreen } from './screens/checklist.js';
import { TasksRedirectScreen, TasksScreen } from './screens/tasks.js';
import { PackRedirectScreen, StudioRedirectScreen } from './screens/pack.js';
import { StudioScreen } from './screens/studio.js';
import { TemplatesScreen } from './screens/templates.js';
import { SummaryScreen } from './screens/summary.js';
import { SettingsScreen } from './screens/settings.js';
import { WelcomeScreen } from './screens/welcome.js';

const NAV = [
  { id: 'home', href: '#/', short: 'Home', long: 'Dashboard', icon: 'home' },
  { id: 'trips', href: '#/trips', short: 'Trips', long: 'My Trips', icon: 'suitcase' },
  { id: 'pack', href: '#/pack', short: 'Pack', long: 'Packing List', icon: 'pack' },
  { id: 'studio', href: '#/studio', short: 'Studio', long: 'Packing Studio', icon: 'luggage', desktopOnly: true },
  { id: 'templates', href: '#/templates', short: 'Templates', long: 'Templates', icon: 'template', desktopOnly: true },
  { id: 'tasks', href: '#/tasks', short: 'Tasks', long: 'Travel Tasks', icon: 'tasks' },
  { id: 'more', href: '#/settings', short: 'More', long: 'Settings', icon: 'more' },
];

const NotFound = () => ({
  title: 'Not found',
  build: () => h('div', { class: 'screen' }, emptyState({ title: 'Page not found', text: 'That page does not exist.', action: button({ label: 'Go home', variant: 'primary', href: '#/' }) })),
});

async function openStore() {
  let adapter;
  let kind = 'indexeddb';
  try {
    adapter = await createIdbAdapter();
  } catch {
    adapter = createMemoryAdapter();
    kind = 'memory';
  }
  let store = createStore(adapter);
  try {
    await store.init();
  } catch {
    // Stored data could not be read. Fall back to an empty in-memory session rather than overwrite anything.
    adapter = createMemoryAdapter();
    kind = 'memory';
    store = createStore(adapter);
    await store.init();
  }
  return { store, kind };
}

function buildShell() {
  const nav = h(
    'nav',
    { class: 'nav', 'aria-label': 'Main' },
    h('a', { class: 'nav-brand', href: '#/', 'aria-label': 'PackWise home' }, logoMark({ size: 34 }), h('span', {}, 'Pack', h('b', { text: 'Wise' }))),
    h('ul', { class: 'nav-list' }, NAV.map((n) => h('li', { class: n.desktopOnly ? 'hide-mobile' : '' }, h('a', { class: 'nav-item', href: n.href, 'data-nav': n.id }, icon(n.icon, { size: 22 }), h('span', { class: 'nav-short', text: n.short }), h('span', { class: 'nav-long', text: n.long }))))),
    h('div', { class: 'nav-foot' }, destinationArt('beach', { className: 'nav-foot-art' }), h('p', { text: 'Collect trips, not things.' })),
  );
  const banners = h('div', { class: 'banners' });
  const view = h('main', { id: 'view', class: 'view', tabindex: '-1' });
  const shell = h('div', { class: 'app' }, nav, h('div', { class: 'content' }, banners, view));
  document.getElementById('app').replaceChildren(shell);
  return { shell, nav, banners, view };
}

async function boot() {
  applyPrefs(getPrefs());
  const { store, kind } = await openStore();
  const { shell, nav, banners, view } = buildShell();

  // ---- service worker + update flow
  const app = { storageKind: kind, swSupported: false, registration: null, checkForUpdate: async () => 'unsupported' };
  const secure = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if ('serviceWorker' in navigator && secure) {
    app.swSupported = true;
    registerServiceWorker(app);
  }

  // ---- persistent banners
  const bannerState = { offline: !navigator.onLine };
  const renderBanners = () => {
    const items = [];
    if (kind === 'memory') items.push(h('div', { class: 'banner banner-warn', role: 'alert' }, icon('alert', { size: 18 }), h('span', { text: 'Local storage is unavailable, so changes will be lost when you close the app. Export a backup to keep your data.' })));
    if (store.state.saveError) items.push(h('div', { class: 'banner banner-error', role: 'alert' }, icon('alert', { size: 18 }), h('span', { text: store.state.saveError }), button({ label: 'Export backup', variant: 'secondary', onClick: () => downloadBackup(store) })));
    if (bannerState.offline) items.push(h('div', { class: 'banner banner-info' }, icon('wifi', { size: 18 }), h('span', { text: 'You’re offline. PackWise keeps working and saves everything on this device.' })));
    banners.replaceChildren(...items);
  };
  addEventListener('online', () => { bannerState.offline = false; renderBanners(); });
  addEventListener('offline', () => { bannerState.offline = true; renderBanners(); });
  store.subscribe(() => renderBanners());
  renderBanners();

  const lastTrip = () => getPrefs().lastTripId;
  const services = { app, prefs: getPrefs, lastTrip, setLastTrip: (id) => { if (id !== lastTrip()) setPrefs({ lastTripId: id }); } };

  const routes = [
    { path: '/', name: 'home', nav: 'home', screen: DashboardScreen },
    { path: '/welcome', name: 'welcome', nav: null, chrome: false, screen: WelcomeScreen },
    { path: '/trips', name: 'trips', nav: 'trips', screen: TripsScreen },
    { path: '/trips/new', name: 'trip-new', nav: 'trips', screen: (c) => TripFormScreen(c, { mode: 'create' }) },
    { path: '/trip/:id', name: 'checklist', nav: 'pack', screen: ChecklistScreen },
    { path: '/trip/:id/edit', name: 'trip-edit', nav: 'trips', screen: (c) => TripFormScreen(c, { mode: 'edit' }) },
    { path: '/trip/:id/tasks', name: 'tasks', nav: 'tasks', screen: TasksScreen },
    { path: '/trip/:id/summary', name: 'summary', nav: 'pack', screen: SummaryScreen },
    { path: '/trip/:id/studio', name: 'studio', nav: 'studio', screen: StudioScreen },
    { path: '/templates', name: 'templates', nav: 'templates', screen: TemplatesScreen },
    { path: '/studio', name: 'studio-home', nav: 'studio', screen: StudioRedirectScreen },
    { path: '/pack', name: 'pack', nav: 'pack', screen: PackRedirectScreen },
    { path: '/tasks', name: 'tasks-home', nav: 'tasks', screen: TasksRedirectScreen },
    { path: '/settings', name: 'settings', nav: 'more', screen: SettingsScreen },
    { path: '/404', name: 'notfound', nav: null, screen: NotFound },
  ];

  const router = createRouter({
    routes,
    root: view,
    store,
    services,
    onRoute(route) {
      shell.dataset.chrome = route.chrome === false ? 'none' : 'full';
      nav.querySelectorAll('[data-nav]').forEach((a) => {
        const active = a.dataset.nav === route.nav;
        if (active) a.setAttribute('aria-current', 'page');
        else a.removeAttribute('aria-current');
      });
    },
  });

  // first visit: show the welcome screen once
  if (!getPrefs().onboarded && store.state.trips.length === 0 && !location.hash.replace('#', '').replace('/', '')) {
    location.replace('#/welcome');
  }
  router.start();
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => applyPrefs());
  window.__packwise = { store, router }; // handy for debugging; no secrets here
}

function registerServiceWorker(app) {
  const showUpdate = (worker) => {
    toast('A new version of PackWise is ready.', {
      timeout: 0,
      action: {
        label: 'Reload',
        run: () => {
          if (document.querySelector('dialog[open]')) {
            toast('Finish what you’re editing, then tap Reload again.');
            showUpdate(worker);
            return;
          }
          worker.postMessage({ type: 'SKIP_WAITING' });
        },
      },
    });
  };
  navigator.serviceWorker
    .register('./sw.js')
    .then((reg) => {
      app.registration = reg;
      if (reg.waiting && navigator.serviceWorker.controller) showUpdate(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const worker = reg.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) showUpdate(worker);
        });
      });
      app.checkForUpdate = async () => {
        try {
          await reg.update();
          return reg.waiting || reg.installing ? 'update' : 'none';
        } catch {
          return 'error';
        }
      };
    })
    .catch(() => {});
  let reloading = false;
  const hadController = Boolean(navigator.serviceWorker.controller); // first install must not trigger a reload
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading || !hadController) return;
    reloading = true;
    location.reload();
  });
}

boot().catch((err) => {
  console.error(err);
  document.getElementById('app').replaceChildren(h('div', { class: 'screen' }, emptyState({ title: 'PackWise could not start', text: 'Something went wrong while loading. Reload the page; your data on this device has not been touched.', action: button({ label: 'Reload', variant: 'primary', onClick: () => location.reload() }) })));
});
