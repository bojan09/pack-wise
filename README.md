# PackWise — Smart Packing Companion

A free, offline-first packing and travel-prep app. Plain HTML, CSS and JavaScript (ES modules) — no framework, no build step, no backend, no account, no tracking. Installable as a PWA.

> **Status:** Phase 2 of 3 (smart travel + interactive Packing Studio). Polish, rich customization and release hardening arrive in Phase 3. See `docs/DEVELOPMENT_HANDOFF.md`.

## What works today

- Welcome, dashboard (next-trip hero, countdown, packing readiness, essentials/tasks left, recent trips)
- My Trips: create, search, duplicate, edit, archive/restore, delete (with confirmation), multiple concurrent trips
- Guided Create Trip: type, destination, dates, luggage, optional transport/travelers/notes, deterministic starter list
- Packing checklist: category cards, filters (all / to pack / packed / essentials), search, bag filter, quantity steppers (target vs packed), item notes, priority, essential flag, custom categories, quick add, duplicate, delete with undo, multiple bags and moving items between them
- Travel tasks (before / during / return) kept separate from luggage
- Trip summary that reports honestly what is and isn't done
- Settings: light/dark/system theme, accent colors, name, JSON export/import (validate → preview → merge or replace), clear data
- PWA: manifest, icons, versioned service-worker precache, offline use, update prompt that never interrupts an edit

## Added in Phase 2

- **Packing Studio** (`#/trip/:id/studio`): layered pseudo-3D suitcase (CSS perspective, no WebGL). Open/close lid, rotate presets + drag, zoom, bag switcher, tray → case pack animation, tappable contents, synchronized item tiles. Everything is also operable from the list below the stage and by keyboard.
- Checklist: drag reorder (plus Alt+Arrow and dialog buttons), bulk select (pack, unpack, move bag, category, delete + undo), sort by priority/name, essentials highlighting.
- Templates: six built-ins, save any trip as a template, edit quantities, build trips from a template or by copying a previous trip.
- Smarter offline rules: trip length, travelers, bag type and optional climate.
- Return-trip mode: a separate checklist for the journey home; the original trip is never changed.
- Dashboard readiness chip; dismissible companion tips (mutable); motion setting (Reduced / Standard / Enhanced; the OS setting always wins); removable sample trip.

## Added in Phase 2.1 (v1.1.1)

- **Camping**: a "Camping gear" bag option (auto-suggested with a backpack when you pick the Camping type), a new "Camping gear" category and a much fuller camping list (shelter, sleeping, cooking, water, tools, hygiene, safety) that adapts to the weather you choose.
- **Season & weather** replace the single climate option: pick a season (spring, summer, fall, winter) and any expected conditions (hot, warm, cool, cold, rainy, snowy, windy). The suggested list, including camping shelter and sleeping gear, follows your choices. It is not a forecast.

## Added in Phase 2.2 (v1.1.2)

- **Balkan seasons from your dates:** choosing departure/return dates sets the season automatically using the meteorological calendar used across the Balkans: spring Mar–May, summer Jun–Aug, fall Sep–Nov, winter Dec–Feb. A trip that spans two seasons gets the one with most days (a tie goes to the departure date). Pick a season yourself and your choice is never overridden.

## Added in Phase 3 (v1.2.0): hardening, settings, release prep

- **Settings** in four tabs (Appearance · Data · Preferences · About): theme, accent, background style (default, mountains, beach, city, minimal), motion level, optional haptics, companion toggle, backup/restore, storage protection, sample data, install help and offline-file check/repair.
- **Export & print:** plain-text export or copy of any trip, an all-trips text export, and a clean print view.
- **Data safety:** "Try saving again" recovery when storage is full, a safety copy kept before any schema upgrade, and refusal to open (or overwrite) data written by a newer version.
- **PWA:** install prompt/iOS steps, hourly update check on return, cache integrity verification and repair.
- **Completion scene** with confetti and a closed suitcase (motion permitting).

## Added in Phase 3 of the Discovery plan (v1.3.0): Explore Destination

Every trip has an **Explore** page (packing-list header, trip menu, dashboard, summary, and *Explore* in the desktop sidebar) that reuses the trip's destination. Places are grouped into Free to Explore, Worth the Ticket, Check Admission First, Hidden Gems and Nature & Outdoors, with filters (free/ticketed/check, category, indoor/outdoor, family-friendly, saved) that only appear when they would split the list. Save places to the trip with the heart; saved places are stored locally, included in backups and work offline.

The catalog is a short editorial list (12 Balkan cities) with **no prices, hours or coordinates**; unsupported destinations get an honest empty state. See `docs/DESTINATION_DATA.md` for sources, licensing and limits.

## Added in Phase 4 of the Discovery plan (v1.4.0): Taste the Destination

The Explore page has a **Places | Taste** switch. *Taste* lists regional dishes, street food, desserts and non-alcoholic drinks for the trip's country (≈40 editorial entries across the 8 covered countries), with typical ingredients, where each is commonly found (markets, bakeries… never a named venue), and vegetarian / vegan / common-allergen tags. Filters (diet, "hide if often contains", category, Must-Try list) only appear when they change something. The heart adds a dish to the trip's **Must-Try list**; saved dishes get an "I tried it" tick and a short note, all local and offline.

Diet and allergen tags describe a typical recipe, not a safety guarantee. See `docs/DESTINATION_DATA.md`.

## Added in Phase 5 of the Discovery plan (v1.5.0): My Trip Guide

The guide switch has a third tab, **My Guide**: everything saved from Places and Taste, arranged **by interest** or **by day**. Pick a day for any item (one slot per trip day, or 3 if the trip has no dates) and reorder within a day with the arrow buttons. *Suggest a draft plan* fills only the unplanned items, keeps places with the same area name together and is fully undoable; day plans have **no times, routes or travel durations** because PackWise has no verified ones. *Packing ideas* (walking shoes and water for trails, swimwear for waterfront places, a cover-up for sacred sites, "check entry rules" for ticketed places) are optional, skip anything already on the packing list, and never change it unless you tap *Add to packing list*. Drag the grip to reorder within a day. **Copy as text**, **Save as .txt** and **Print** export the guide. Everything works offline, is included in backups (including hidden packing ideas) and is copied when you duplicate a trip.

## Added in v1.6.0: item pictures, category colors, trip scope, background colors, own places

- **Item pictures:** the Packing Studio tray, case and tiles show a small illustration of the item itself (T-shirt, toothbrush, passport, tent…), about 90 distinct drawings; custom items fall back to a per-category glyph.
- **Category colors:** every packing category has its own hue in the checklist, the Studio chips, tiles and tray, in light and dark.
- **Trip scope:** *Where to? Within my country / Abroad*. Domestic trips skip passport, insurance, bank-notice and adapter reminders. Set a **Home country** in Settings and PackWise suggests the right choice from the destination. The Travel Tasks page offers to remove abroad-only tasks from a domestic trip (undoable).
- **Background colors:** Settings → Appearance has separate color choices for light mode (7) and dark mode (6); each applies only in its own mode, also when the theme is "System".
- **Destinations without a built-in guide** (for example a small town or a trail) now get a *Plan it yourself* page: add **your own places** (name, type, area, note), which appear in My Guide with days, packing ideas and exports, plus search links for each stop. PackWise still shows no invented data for them.

## Status: v1.9.0

All planned phases are complete: packing (lists, bags, Studio, templates, tasks, return trips, backup), then the Destination Discovery plan (Explore, Taste, My Guide) and a feedback round (item pictures, category colors, trip scope, background colors, own places). Read `docs/KNOWN_LIMITATIONS.md` before relying on the destination content, and `docs/PRIVACY.md` for what is stored and linked.

## v1.8.0

Mobile now has a **More** tab with everything the desktop sidebar has (Studio, Explore, Taste, My Guide, Templates, Settings). New trips must say whether they are **within your country or abroad** (older trips are asked once, with a one-tap banner), and the packing list's category headers are color-banded.

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

## Deploy for free

`_headers` (Netlify / Cloudflare Pages), `.nojekyll`, `robots.txt` and `docs/RELEASE_CHECKLIST.md` are included. Privacy details: `docs/PRIVACY.md`.

### GitHub Pages

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
- The Packing Studio is an illustration of your checklist, not a physical simulation: a full case does not mean items fit.
- Not yet: backgrounds, haptics, text/print export and install help (Phase 3).
