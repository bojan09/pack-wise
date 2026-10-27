// Tiny hash router. Hash routing keeps the app working from any static host/sub-path
// and offline, with no server rewrites.
import { rerender } from './dom.js';

export function createRouter({ routes, root, store, services, onRoute }) {
  let current = null;
  let unsubscribe = null;
  let renderingToken = 0;
  let firstRender = true; // keep the skip link first in tab order on page load

  const parse = () => {
    const raw = location.hash.slice(1) || '/';
    const [path, query = ''] = raw.split('?');
    return { path: path.replace(/\/+$/, '') || '/', query: new URLSearchParams(query) };
  };

  function match(path) {
    for (const route of routes) {
      const names = [];
      const re = new RegExp(`^${route.path.replace(/:([a-z]+)/gi, (_, n) => (names.push(n), '([^/]+)'))}$`);
      const m = re.exec(path);
      if (m) {
        const params = {};
        names.forEach((n, i) => {
          try {
            params[n] = decodeURIComponent(m[i + 1]);
          } catch {
            params[n] = m[i + 1];
          }
        });
        return { route, params };
      }
    }
    return null;
  }

  function navigate(path, { replace = false } = {}) {
    const target = `#${path}`;
    if (replace) location.replace(target);
    else if (location.hash === target) render();
    else location.hash = target;
  }

  function render(entering = true) {
    const token = ++renderingToken;
    unsubscribe?.();
    current?.destroy?.();
    const { path, query } = parse();
    const hit = match(path) || match('/404');
    const refresh = () => {
      if (token === renderingToken && current) rerender(root, current.build);
    };
    const ctx = { ...services, store, params: hit.params, query, navigate, refresh, route: hit.route };
    const screen = hit.route.screen(ctx);
    if (screen.redirect) {
      navigate(screen.redirect, { replace: true });
      return;
    }
    current = screen;
    root.dataset.route = hit.route.name;
    onRoute(hit.route, screen);
    root.replaceChildren(screen.build());
    document.title = `${screen.title} · PackWise`;
    if (!screen.static) {
      unsubscribe = store.subscribe(() => {
        if (token === renderingToken) rerender(root, screen.build);
      });
    }
    if (entering) {
      window.scrollTo(0, 0);
      root.classList.remove('page-enter');
      void root.offsetWidth; // restart the CSS animation
      root.classList.add('page-enter');
      if (!firstRender) root.querySelector('h1')?.focus({ preventScroll: true });
      firstRender = false;
    }
  }

  return {
    navigate,
    start() {
      addEventListener('hashchange', () => render(true));
      render(true);
    },
    refresh: () => render(false),
  };
}
