# PackWise — Smart Packing Companion

A free, offline-first packing and travel-prep app. Plain HTML, CSS and JavaScript (ES modules) — no framework, no build step, no backend, no account, no tracking. Installable as a PWA.

> **Status:** Phase 1 of 3 (foundation & reliable MVP). The signature pseudo-3D Packing Studio arrives in Phase 2; polish and customization in Phase 3. See `docs/DEVELOPMENT_HANDOFF.md`.

## What works today

- Welcome, dashboard (next-trip hero, countdown, packing readiness, essentials/tasks left, recent trips)
- My Trips: create, search, duplicate, edit, archive/restore, delete (with confirmation), multiple concurrent trips
- Guided Create Trip: type, destination, dates, luggage, optional transport/travelers/notes, deterministic starter list
- Packing checklist: category cards, filters (all / to pack / packed / essentials), search, bag filter, quantity steppers (target vs packed), item notes, priority, essential flag, custom categories, quick add, duplicate, delete with undo, multiple bags and moving items between them
- Travel tasks (before / during / return) kept separate from luggage
- Trip summary that reports honestly what is and isn't done
- Settings: light/dark/system theme, accent colors, name, JSON export/import (validate → preview → merge or replace), clear data
- PWA: manifest, icons, versioned service-worker precache, offline use, update prompt that never interrupts an edit

## Run it

Any static file server works. Service workers need `https://` or `http://localhost`.

```bash
npm start            # serves http://localhost:8080  (node only, no dependencies)
# or: python3 -m http.server 8080
```

## Tests

```bash
npm test             # unit tests (node:test): data rules, progress math, recommendations, import validation, migrations
npm run test:e2e     # real-browser checks (Playwright + Chromium), dev-only
```

The e2e suite needs Playwright, which is **not** a dependency of the app. Install it anywhere (`npm i -D playwright && npx playwright install chromium`) or point `PLAYWRIGHT_MODULE` at an existing install. It covers the main journeys, import/export round-trips and rejection of corrupt files, offline re-open, service-worker upgrade, keyboard and reduced-motion behavior, accessible names, and horizontal overflow at 360×640, 390×844, 768×1024, 1024×768 and 1440×900. Screenshots go to `tests/e2e/.out/` (git-ignored).

## Deploy for free (GitHub Pages)

1. Push to `master`.
2. Repository → **Settings → Pages** → *Deploy from a branch* → branch `master`, folder `/ (root)`.
3. Open `https://<user>.github.io/pack-wise/`. All paths are relative, so the sub-path works; hash routing needs no server rewrites.

Any other static host (Netlify, Cloudflare Pages, Vercel static) works the same way: publish the repository root.

## Architecture

```
index.html            shell + CSP meta (no inline scripts, no third-party hosts)
manifest.webmanifest  install metadata        sw.js  service worker (precache, update flow)
css/                  tokens → base → layout → components → screens
js/
  models.js           enums, limits, normalizers (the single source of data truth)
  progress.js         quantity-based progress + local-calendar date math (pure)
  templates.js        deterministic starter lists + tasks (pure)
  store.js            all mutations, persistence queue, import/export (adapter-based)
  storage/idb.js      IndexedDB adapter     storage/memory.js  tests / fallback adapter
  validate.js         backup parsing, validation, id-collision remapping
  migrations.js       schema migrations     prefs.js  localStorage UI prefs
  router.js, dom.js   hash router, safe DOM helpers (no innerHTML anywhere)
  ui/, screens/       components, dialogs, illustrations; one file per screen
tests/unit, tests/e2e
```

Key decisions: see `docs/DEVELOPMENT_HANDOFF.md`.

## Privacy and your data

Everything is stored in your browser (IndexedDB for trips, items, bags and tasks; `localStorage` for theme/accent/name). Nothing is sent anywhere — there are no accounts, analytics or network calls beyond loading the app itself.

Browsers can evict site data (low disk space, "clear site data", some private modes, long inactivity on iOS Safari). **Export a backup from Settings → Your data** to protect or move your trips. Countdowns use the device clock; there are no background push notifications.

## Limitations

- Starter lists are generic suggestions, not weather, airline-allowance, safety or volume advice.
- Packing progress tracks your own checklist, nothing physical.
- Phase 1 has no drag-reorder, bulk select, templates, return-trip mode or Packing Studio; those are scheduled in Phases 2–3.
