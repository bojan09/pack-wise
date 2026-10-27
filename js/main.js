import { h } from './dom.js';
import { applyPrefs, getPrefs, onPrefsChange, setPrefs } from './prefs.js';
import { buzz } from './haptics.js';
import { detectPlatform, installAdvice } from './install.js';
import { sumQty } from './progress.js';
import { initParallax } from './parallax.js';
import { createStore } from './store.js';
import { createIdbAdapter } from './storage/idb.js';
import { createMemoryAdapter } from './storage/memory.js';
import { createRouter } from './router.js';
import { icon } from './ui/icons.js';
import { backgroundArt, logoMark, destinationArt } from './ui/art.js';
import { button, emptyState } from './ui/components.js';
import { toast } from './ui/toast.js';
import { downloadBackup } from './backup.js';
import { DashboardScreen } from './screens/dashboard.js';
import { TripsScreen } from './screens/trips.js';
import { TripFormScreen } from './screens/tripForm.js';
import { ChecklistScreen } from './screens/checklist.js';
import { TasksRedirectScreen, TasksScreen } from './screens/tasks.js';
import { ExploreRedirectScreen, GuideRedirectScreen, PackRedirectScreen, StudioRedirectScreen, TasteRedirectScreen } from './screens/pack.js';
import { StudioScreen } from './screens/studio.js';
import { PrintScreen } from './screens/print.js';
import { TemplatesScreen } from './screens/templates.js';
import { SummaryScreen } from './screens/summary.js';
import { SettingsScreen } from './screens/settings.js';
import { WelcomeScreen } from './screens/welcome.js';

const NAV = [
  { id: 'home', href: '#/', short: 'Home', long: 'Dashboard', icon: 'home' },
  { id: 'trips', href: '#/trips', short: 'Trips', long: 'My Trips', icon: 'suitcase' },
  { id: 'pack', href: '#/pack', short: 'Pack', long: 'Packing List', icon: 'pack' },
  { id: 'studio', href: '#/studio', short: 'Studio', long: 'Packing Studio', icon: 'luggage' },
  { id: 'explore', href: '#/explore', short: 'Explore', long: 'Explore', icon: 'compass' },
  { id: 'templates', href: '#/templates', short: 'Templates', long: 'Templates', icon: 'template' },
  { id: 'tasks', href: '#/tasks', short: 'Tasks', long: 'Travel Tasks', icon: 'tasks' },
  { id: 'settings', href: '#/settings', short: 'Settings', long: 'Settings', icon: 'sliders' },
];

/**
 * Load a screen module on demand (keeps the large destination catalog out of the startup path).
 * Offline it still works: the module is precached by the service worker.
 */
const lazy = (loader, name) => (ctx) => {
  let inner = null;
  let failed = false;
  loader().then((mod) => {
    inner = mod[name](ctx);
    if (inner.redirect) ctx.navigate(inner.redirect, { replace: true });
    else ctx.refresh();
  }).catch(() => { failed = true; ctx.refresh(); });
  return {
    title: 'Loading…',
    build: () => (inner && !inner.redirect
      ? inner.build()
      : h('div', { class: 'screen' }, failed
        ? emptyState({ title: 'Could not load this page', text: 'Reload the app and try again.', action: button({ label: 'Reload', variant: 'primary', onClick: () => location.reload() }) })
        : h('p', { class: 'muted center', role: 'status', text: 'Loading…' }))),
    destroy: () => inner?.destroy?.(),
  };
};

const NotFound = () => ({
  title: 'Not found',
  build: () => h('div', { class: 'screen' }, emptyState({ title: 'Page not found', text: 'That page does not exist.', action: button({ label: 'Go home', variant: 'primary', href: '#/' }) })),
});

async function openStore() {
  let adapter;
  let kind = 'indexeddb';
  let problem = '';
  try {
    adapter = await createIdbAdapter();
  } catch {
    adapter = createMemoryAdapter();
    kind = 'memory';
    problem = 'unavailable';
  }
  let store = createStore(adapter);
  try {
    await store.init();
  } catch (err) {
    // Stored data could not be used. Run an empty in-memory session and never overwrite what is on disk.
    problem = err?.code === 'NEWER_DATA' ? 'newer' : err?.code === 'MIGRATION_FAILED' ? 'migration' : 'unreadable';
    adapter = createMemoryAdapter();
    kind = 'memory';
    store = createStore(adapter);
    await store.init();
  }
  return { store, kind, problem };
}

const PROBLEM_TEXT = {
  unavailable: 'Local storage is unavailable, so changes will be lost when you close the app. Export a backup to keep your data.',
  newer: 'Your saved trips were created by a newer version of PackWise. They have not been touched. Update the app (reload, or clear the cached copy) to open them; until then this session starts empty and will not be saved.',
  migration: 'Your saved trips could not be upgraded, so they were left untouched. This session starts empty and will not be saved. A safety copy of your data is kept on this device.',
  unreadable: 'Saved data could not be read, so it was left untouched. This session starts empty and will not be saved.',
};

function buildShell() {
  const nav = h(
    'nav',
    { class: 'nav', 'aria-label': 'Main' },
    h('a', { class: 'nav-brand', href: '#/', 'aria-label': 'PackWise home' }, logoMark({ size: 34 }), h('span', {}, 'Pack', h('b', { text: 'Wise' }))),
    h('div', { class: 'nav-wrap' }, h('ul', { class: 'nav-list' }, NAV.map((n) => h('li', {}, h('a', { class: 'nav-item', href: n.href, 'data-nav': n.id }, icon(n.icon, { size: 20 }), h('span', { class: 'nav-short', text: n.short }), h('span', { class: 'nav-long', text: n.long })))))),
    h('div', { class: 'nav-foot' }, destinationArt('beach', { className: 'nav-foot-art' }), h('p', { text: 'Collect trips, not things.' })),
  );
  const banners = h('div', { class: 'banners' });
  const view = h('main', { id: 'view', class: 'view', tabindex: '-1' });
  // hash routing owns location.hash, so the skip link focuses <main> directly instead of navigating to #view
  document.querySelector('.skip-link')?.addEventListener('click', (e) => { e.preventDefault(); view.focus(); });
  const shell = h('div', { class: 'app' }, nav, h('div', { class: 'content' }, banners, view));
  document.getElementById('app').replaceChildren(shell);
  return { shell, nav, banners, view };
}

async function boot() {
  applyPrefs(getPrefs());
  const { store, kind, problem } = await openStore();
  const { shell, nav, banners, view } = buildShell();

  // ---- service worker + update flow
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const platform = detectPlatform({ userAgent: navigator.userAgent, maxTouchPoints: navigator.maxTouchPoints, platform: navigator.platform });
  const installListeners = new Set();
  const app = {
    storageKind: kind,
    storageProblem: problem,
    swSupported: false,
    registration: null,
    installPrompt: null,
    standalone,
    ios: platform.ios,
    secure: location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1',
    checkForUpdate: async () => 'unsupported',
    verifyCache: async () => ({ ok: false, error: 'unsupported' }),
    repairCache: async () => ({ ok: false, error: 'unsupported' }),
    onInstallChange: (fn) => { installListeners.add(fn); return () => installListeners.delete(fn); },
    installAdvice: () => installAdvice({ standalone: app.standalone, secure: app.secure, hasPrompt: Boolean(app.installPrompt), ios: app.ios, serviceWorker: 'serviceWorker' in navigator }),
    async install() {
      const evt = app.installPrompt;
      if (!evt) return 'unavailable';
      app.installPrompt = null;
      installListeners.forEach((fn) => fn());
      try {
        await evt.prompt();
        const choice = await evt.userChoice;
        return choice?.outcome || 'dismissed';
      } catch {
        return 'error';
      }
    },
  };
  addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // keep the event so Settings can offer the install button
    app.installPrompt = e;
    installListeners.forEach((fn) => fn());
  });
  addEventListener('appinstalled', () => {
    app.installPrompt = null;
    app.standalone = true;
    installListeners.forEach((fn) => fn());
    toast('PackWise is installed.', { tone: 'success' });
  });
  const secure = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if ('serviceWorker' in navigator && secure) {
    app.swSupported = true;
    registerServiceWorker(app);
  }

  // ---- persistent banners
  const bannerState = { offline: !navigator.onLine };
  const renderBanners = () => {
    const items = [];
    if (kind === 'memory') items.push(h('div', { class: 'banner banner-warn', role: 'alert' }, icon('alert', { size: 18 }), h('span', { text: PROBLEM_TEXT[problem] || PROBLEM_TEXT.unavailable }), button({ label: 'Export backup', variant: 'secondary', onClick: () => downloadBackup(store) })));
    if (store.state.saveError) {
      items.push(h('div', { class: 'banner banner-error', role: 'alert' }, icon('alert', { size: 18 }), h('span', { text: store.state.saveError }), h('div', { class: 'banner-actions' }, button({ label: 'Export backup', variant: 'secondary', onClick: () => downloadBackup(store) }), button({ label: 'Try saving again', variant: 'secondary', key: 'retry-save', onClick: async () => { const ok = await store.resync(); toast(ok ? 'Everything is saved now.' : 'Still could not save. Free up space, then try again.', { tone: ok ? 'success' : 'error' }); } }), button({ label: 'Manage storage', variant: 'ghost', href: '#/settings?tab=data' }))));
    }
    if (bannerState.offline) items.push(h('div', { class: 'banner banner-info' }, icon('wifi', { size: 18 }), h('span', { text: 'You’re offline. PackWise keeps working and saves everything on this device.' })));
    banners.replaceChildren(...items);
  };
  addEventListener('online', () => { bannerState.offline = false; renderBanners(); });
  addEventListener('offline', () => { bannerState.offline = true; renderBanners(); });
  store.subscribe(() => renderBanners());
  renderBanners();

  // ---- optional decorative background (Settings > Appearance)
  const bgHost = h('div', { id: 'bg-art', class: 'bg-art', 'aria-hidden': 'true', 'data-parallax': '0.22', 'data-parallax-mode': 'scroll', 'data-parallax-max': '240' });
  document.body.prepend(bgHost);
  const paintBackground = () => { const art = backgroundArt(getPrefs().background); bgHost.replaceChildren(...(art ? [art] : [])); };
  paintBackground();
  onPrefsChange(paintBackground);
  initParallax(document.body);

  // ---- optional haptics: a tick when more is packed, a pattern when a trip becomes complete
  let lastPacked = sumQty(store.state.items).packed;
  const completed = new Set(store.state.trips.filter((t) => { const q = sumQty(store.state.items.filter((i) => i.tripId === t.id)); return q.target > 0 && q.packed === q.target; }).map((t) => t.id));
  store.subscribe((state) => {
    const packed = sumQty(state.items).packed;
    if (packed > lastPacked) {
      const nowDone = state.trips.filter((t) => { const q = sumQty(state.items.filter((i) => i.tripId === t.id)); return q.target > 0 && q.packed === q.target; }).map((t) => t.id);
      const fresh = nowDone.some((id) => !completed.has(id));
      completed.clear();
      nowDone.forEach((id) => completed.add(id));
      buzz(fresh ? 'success' : 'tick');
    } else if (packed < lastPacked) {
      completed.clear();
      state.trips.forEach((t) => { const q = sumQty(state.items.filter((i) => i.tripId === t.id)); if (q.target > 0 && q.packed === q.target) completed.add(t.id); });
    }
    lastPacked = packed;
  });

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
    { path: '/trip/:id/explore', name: 'explore', nav: 'explore', screen: lazy(() => import('./screens/explore.js'), 'ExploreScreen') },
    { path: '/trip/:id/guide', name: 'guide', nav: 'explore', screen: lazy(() => import('./screens/guide.js'), 'GuideScreen') },
    { path: '/trip/:id/guide/print', name: 'guide-print', nav: 'pack', screen: lazy(() => import('./screens/guide.js'), 'GuidePrintScreen') },
    { path: '/trip/:id/taste', name: 'taste', nav: 'explore', screen: lazy(() => import('./screens/taste.js'), 'TasteScreen') },
    { path: '/guide', name: 'guide-home', nav: 'explore', screen: GuideRedirectScreen },
    { path: '/taste', name: 'taste-home', nav: 'explore', screen: TasteRedirectScreen },
    { path: '/explore', name: 'explore-home', nav: 'explore', screen: ExploreRedirectScreen },
    { path: '/trip/:id/print', name: 'print', nav: 'pack', screen: PrintScreen },
    { path: '/templates', name: 'templates', nav: 'templates', screen: TemplatesScreen },
    { path: '/studio', name: 'studio-home', nav: 'studio', screen: StudioRedirectScreen },
    { path: '/pack', name: 'pack', nav: 'pack', screen: PackRedirectScreen },
    { path: '/tasks', name: 'tasks-home', nav: 'tasks', screen: TasksRedirectScreen },
    { path: '/settings', name: 'settings', nav: 'settings', screen: SettingsScreen },
    { path: '/404', name: 'notfound', nav: null, screen: NotFound },
  ];

  // phone bottom bar: every destination is a tab; it scrolls sideways, keeps the current tab in view and fades at an overflowing edge
  const navList = nav.querySelector('.nav-list');
  const navWrap = nav.querySelector('.nav-wrap');
  const navHints = () => {
    navWrap.dataset.moreLeft = String(navList.scrollLeft > 4);
    navWrap.dataset.moreRight = String(navList.scrollLeft + navList.clientWidth < navList.scrollWidth - 4);
  };
  navList.addEventListener('scroll', navHints, { passive: true });
  window.addEventListener('resize', navHints);

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
        if (active && navList.scrollWidth > navList.clientWidth) navList.scrollLeft = a.offsetLeft - (navList.clientWidth - a.offsetWidth) / 2; // instant, no animation to respect
      });
      navHints();
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
      const ask = (type) =>
        new Promise((resolve) => {
          const worker = reg.active || navigator.serviceWorker.controller;
          if (!worker) { resolve({ ok: false, error: 'no-worker' }); return; }
          const channel = new MessageChannel();
          const timer = setTimeout(() => resolve({ ok: false, error: 'timeout' }), 15000);
          channel.port1.onmessage = (e) => { clearTimeout(timer); resolve(e.data); };
          worker.postMessage({ type }, [channel.port2]);
        });
      app.verifyCache = () => ask('VERIFY');
      app.repairCache = () => ask('REPAIR');
      // re-check for a new version when the app comes back to the foreground (at most hourly)
      let lastCheck = Date.now();
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && Date.now() - lastCheck > 3600000) {
          lastCheck = Date.now();
          reg.update().catch(() => {});
        }
      });
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
