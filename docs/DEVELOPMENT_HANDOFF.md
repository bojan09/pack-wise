# PackWise — development handoff

Last updated: end of **Phase 3 (hardening, settings, release prep)** (smart travel + Packing Studio). Phase 3 is not started.

## Decisions

| Area | Decision | Why |
|---|---|---|
| Stack | Vanilla ES modules, no build step, no runtime deps | Zero-cost static hosting, nothing to break or audit |
| Routing | Hash routes (`#/trip/:id`) | Works from any sub-path and offline, no server rewrites |
| State | `js/store.js`: in-memory state, optimistic mutations, ordered write queue to a storage adapter | UI is instant; storage swappable (IndexedDB / memory) and unit-testable in Node |
| Storage | IndexedDB (trips, bags, items, tasks, templates, meta); `localStorage` for UI prefs | Per spec. Cascading deletes and imports are single atomic transactions |
| Failure handling | Write failures set `state.saveError` (banner with "Export backup"); IndexedDB missing → in-memory session with a warning banner | No silent data loss, no crash in private modes / quota errors |
| Rendering | Screens return `{title, build, static?}`; non-static screens re-render on store change, restoring focus via `data-key` | Simple and accessible; avoids a framework |
| Safety | `h()`/`svg()` set text via text nodes and attributes only; CSP meta forbids inline scripts/styles and third-party hosts; imports are normalized + validated | No XSS surface; enforced by an e2e test |
| Dialogs | Native `<dialog>` (focus trap, Escape, focus restoration built in) | Less code, better a11y |
| Quantities | `target` (how many) vs `packed` (how many done). Invariant `0 <= packed <= target` enforced in `normalizeItem`; progress = Σpacked/Σtarget, never shows 100% unless complete | Spec rule |
| Moving items | Single-record `bagId` update | An item can never be counted in two bags |
| Categories | Preset ids (`clothing`, `toiletries`, `electronics`, `documents`, `essentials`, `misc`) + free-text custom categories; `essential` is a separate flag | "Editable categories" without a categories table |
| Trip types | beach, city, business, camping, winter, custom (design shows six tiles). "Weekend" is intentionally folded into Custom; Phase 2 can add a weekend *template* | Matches approved design |
| Recommendations | `js/templates.js`: pure, deterministic; counts scale with trip length; type-specific extras; deduplicated | Offline, no AI claims |
| Schema versioning | `SCHEMA_VERSION = 1`; `js/migrations.js` has a v0→v1 step for pre-release backups (`qty/done` → `target/packed`), exercised by tests | Framework ready for v2 |
| Updates | New service worker **waits**; the app shows a "Reload" toast; `skipWaiting` only on that click, and never while a dialog is open | Don't swap code under unsaved edits |
| Accent colors | Accent (decorative) and accent-strong (white-text-safe ≥4.5:1) are separate tokens | Contrast across all presets |

## Phase 2 decisions

| Area | Decision |
|---|---|
| Studio engine | `js/ui/suitcase.js`: CSS 3D box (floor, 4 walls, hinged lid with lining), billboard tokens counter-rotated by `--yaw/--tilt`. It only *reads* store data; flights are cosmetic ghosts animated with WAAPI and always cancellable, so the DOM state is the truth. |
| Sync | `StudioScreen` is `static` and subscribes to the store itself; `stage.sync()` diffs by item id (stable slots, 24-token cap with "+N more", tray cap 14, tiles paged at 60). |
| Accessibility | Stage tokens are `aria-hidden`; the tile list, tray buttons and info card are the equivalent controls. Stage is a focusable group (arrows rotate, +/- zoom, Space lid, Home reset). |
| Motion | `prefs.motion` + OS `prefers-reduced-motion` → `data-motion` on `<html>`; `effectiveMotion()` gates flights, settle/hop animations and lid/camera transitions. |
| Schema | Still `SCHEMA_VERSION = 1`: new fields are optional with defaults (`trip.climate`, `trip.returnOf`, `trip.isDemo`; `templates` store now used). Imports drop dangling `returnOf`; merge remaps it with the ids. |
| Templates | Built-ins are named presets of the same pure rules (`BUILTIN_TEMPLATES`); user templates store item snapshots. Creating a trip copies items, so later template edits never alter trips. |
| Return trip | `store.createReturnTrip` copies chosen items unpacked into a new linked trip with its own tasks; original items/tasks are untouched (unit + e2e tested). |
| Reorder | `reorderItems` reassigns the existing `order` slots (spreading ties); drag uses document-level pointer listeners (DOM moves drop pointer capture). Disabled while filtering/searching/selecting. |
| Companion | `js/companion.js` is pure: ordered rules, stable message ids, dismissed ids in prefs. No AI claims. |

## Verified in Phase 2 (this environment, Chromium only)

- `npm test`: **35/35** unit tests (adds ordering, bulk, templates, copy-trip, return trip, readiness, companion, demo data, backup round-trip of new fields).
- `npm run test:e2e`: **41/41** (adds: studio/tray/case/tile/checklist sync, bag switch, rapid taps, leaving mid-animation, trip switching, camera buttons/keyboard/drag, lid, selection, motion levels incl. OS override, 150-item legibility caps, 500-item performance (checklist ≈0.4 s, studio ≈0.1 s here), reorder by drag/keyboard/dialog, bulk ops, templates + copy trip + climate, return trip, companion + readiness, sample data, new-field backup, offline studio; studio/templates added to the accessible-name and 5-viewport overflow sweeps).

## Phase 3 (v1.2.0): settings, export/print, data safety, PWA hardening

> **Plan change:** the *Destination Discovery* brief (`PackWise_Destination_Discovery_Extension.md`) re-schedules the original final-release phase to **Phase 6** and adds Discovery (3), Food & Drink (4) and My Trip Guide (5) before it. The work below was already in progress when that brief arrived. It is pre-discovery hardening and polish, **not** the final release: Phase 6 must re-run the full audit once discovery exists.

- Settings: tabs (ARIA tablist, arrow/Home/End keys, `?tab=` deep links); backgrounds (`prefs.background`, decorative `#bg-art`); haptics (`js/haptics.js`, off by default, feature-detected, skipped under reduced motion); companion toggle; dismissed-tips reset.
- Export: `js/export.js` (`tripModel`, `tripToText`) feeds text export, clipboard copy and the print route `#/trip/:id/print` (print CSS hides chrome, black on white).
- Data safety: `store.resync()` (retry after quota error), `store.adapter` exposed for tests, safety copy before migration (`adapter.saveSafetyCopy`, downloadable in Settings → Data), `NEWER_DATA`/`MIGRATION_FAILED` leave disk untouched and run an in-memory session with an explanatory banner.
- PWA: `sw.js` `VERIFY`/`REPAIR` messages + integrity check on activate; `app.verifyCache()/repairCache()`; install prompt capture + iOS steps (`js/install.js`); hourly update check on foreground.
- Fixes found by the new tests: skip link broke hash routing (`#view`), initial focus stole the skip link, long button labels overflowed at 360 px, coral/purple accent contrast.
- Tests: 54 unit (adds contrast audit of tokens + accents, export, recovery, safety copy, install advice), e2e adds tabs/backgrounds, haptics, text/print export, quota recovery, newer-version guard, migration safety copy, install help, cache repair, completion scene, dead-link crawl, privacy audit (same-origin GET only, no cookies, preference-only localStorage), keyboard flow, startup timing, full critical workflow, dark-theme sweep.
- Known gaps: Chromium only; no Lighthouse/screen-reader runs; deployment not verified (no Pages access); `_headers` untested on a real host; contrast audited for tokens/accents, not every computed pair.

## v1.10.0: worldwide places (online lookup, schema v4)

- `js/online.js`: the only network module. `getJson` refuses any host outside `ONLINE_HOSTS` (Wikidata + English Wikipedia), non-https, and sends `credentials: omit`, `referrerPolicy: no-referrer`, a 12 s timeout. `findPlaces` (wbsearchentities, ambiguity returned), `coordsOf` (wbgetclaims P625), `nearby` (geosearch 10 km + `prop=description` in batches of 50, then `classify` keyword rules; unclear items are dropped and counted), `lookup` (cache + stale fallback), localStorage cache with LRU (10 destinations, 20 remembered searches).
- `js/screens/online.js` (lazy, route `/trip/:id/online?q=`): consent text, search form with stop chips, candidate picker, results by type with filter, save hearts (`store.saveWebPlace`). Reached from Explore (uncovered destination: primary button; covered: "Find more places online").
- **Schema v4**: entries may be `kind: 'web'` with `label`, `sub` (<=120), `type`, `lat`, `lon`, `wp` (Wikipedia page id), `refId = w-<wp>`; migration 3→4 is a no-op. `setSaved(false)` and `removeEntry` delete web entries outright. My Guide shows them under *Found online* with exact-coordinate links; the text export adds `@ lat, lon` and a "not reviewed" footer; hints treat the type like a custom place.
- **CSP** (`index.html` meta and `_headers`): `connect-src 'self' https://www.wikidata.org https://en.wikipedia.org`. e2e still fails on any other host and any non-GET; `online:` e2e tests mock both hosts with `page.route`.
- **Not verified live**: the build sandbox had no network. `npm run check:online` (scripts/check-online.mjs) is the smoke test to run once with access; the keyword rules in `classify` are the part most likely to need tuning against real descriptions.

## v1.9.0: limits closed

- **Scope change rewrites existing lists, on request**: `planScopeChange(scope, {tasks, items})` (pure, `templates.js`) plans add / remove / rename for generated reminders in both directions; `store.applyScopeChanges` / `undoScopeChanges` apply and revert them; `reviewScopeChange()` (`screens/shared.js`) shows a tick-list dialog after the edit form or the scope question banner. Nothing is changed without Apply; packed items, completed tasks and user-written entries are never touched.
- **Phone navigation**: an eight-tab sideways-scrolling bar was tried and rejected as too crowded; the bar is back to five tabs with a *More* menu (`screens/more.js`) holding Studio, Explore, Taste, My Guide, Templates and Settings. Desktop sidebar unchanged.

## v1.8.0: review fixes from a phone

- **Mobile parity**: the bottom bar's *More* tab now opens `/more` (`screens/more.js`): Packing Studio, Explore, Taste, My Guide, Templates, Settings, each pointing at the current trip (or at "new trip" when there is none). The sidebar (>= 900px) shows *Settings* instead and hides *More* (`hide-sidebar`). `/guide` and `/taste` redirect to the current trip like `/explore`.
- **Scope is asked, not assumed**: creating a trip requires choosing *Within my country* or *Abroad* (home-country suggestion still pre-selects). Trips with no answer (older ones) show a one-tap question banner on the packing list and Travel Tasks (`scopeBanner()` in `screens/shared.js`). Answering *within my country* offers an undoable removal of abroad-only tasks AND unpacked items; nothing changes without a tap.
- Category colors are stronger on the packing list (tinted header band and percent pill).
- Note: the live site is deployed by Vercel from `master`; check Deployments if a pushed commit is not live (a stale service worker can also show the previous version until the update prompt is accepted).

## Phase 6: final polish and production (v1.7.0)

What was audited and what changed:
- **Regression**: full unit (119) and e2e (97) suites green, including every original Phase 1-2 flow and the Discovery phases. New `tests/unit/robustness.test.js` fuzzes backup import (400 seeded hostile files: no throw, invariants hold: `0 <= packed <= target`, unique entry ids, no orphans, `day` 1..60, custom entries named) and abuses the guide logic with stale/hostile entries.
- **Storage recovery / migrations**: v0→v1→v2→v3 chain tested in unit and in e2e against a real IndexedDB (v1 and v2 databases upgrade with a safety copy and no data loss); newer-than-app data is refused, not mangled.
- **Offline integrity**: a test fails if a runtime file is missing from `PRECACHE` or versions disagree; lazy guide screens, catalogs, item art and own places are verified offline in e2e.
- **Privacy**: `docs/PRIVACY.md` updated (what is stored where, what the outbound links contain). CSP unchanged (`connect-src 'self'`); e2e still fails on any request leaving the origin.
- **Accessibility**: automated sweeps (names, headings, focus, overflow at 5 viewports, dark) now include Taste, My Guide and Settings colors; contrast is unit-tested for every background palette and category color in both themes. Still not run by hand: VoiceOver/NVDA/TalkBack.
- **Performance**: `content-visibility: auto` on checklist rows cut the 500-item tap from ~450 ms to ~150 ms (the environment had slowed the previous build past the 400 ms limit). Guide/food/art code stays out of the first load via `lazy()`.
- **Dead code**: removed unused exports (`tripProgress`, `dateBadge`, `getFood`, `bagKindLabel`).
- **Docs**: `docs/KNOWN_LIMITATIONS.md` (the authoritative limits list), release checklist extended (content review, privacy, performance), `scripts/verify-catalog.mjs` + `npm run verify:catalog` documented. Version 1.7.0.
- **Graceful data-source failures**: the app has no live data sources. The only network-touching code is the dev script, which records per-place errors instead of aborting.
- **Not done / needs access**: verified coordinates, photos and hours (network hosts blocked here); Safari/Firefox/real-device/screen-reader passes; Lighthouse on the live URL.

## v1.6.0: user feedback round (item art, category colors, scope, background colors, own places)

- **Schema v3**: `entries.kind` gains `'custom'` (user-written places: `label` ≤80, `sub` ≤60, `type` ∈ `CUSTOM_TYPES`, ref = `customRef(label)`); `trips.scope` (`''|'abroad'|'domestic'`) and `trips.hiddenHints` are optional trip fields. Migration v2→v3 is a no-op (additive); an older build refuses newer data via the NEWER_DATA guard instead of dropping custom entries.
- `js/ui/itemart.js`: data-driven SVG illustrations (`ART` = ordered `[regex, shapes]`; first match wins, so specific names come first). Classes `a-f1…` take colors from the category custom properties in `css/tokens.css` (`[data-cat]`), dark mode adds a faint outline filter. `tokenFace()` now returns that SVG. A unit test fails if any generated template item lacks its own picture, if shapes are malformed, or if a class has no CSS rule.
- Category colors: `categoryKey()` maps custom categories to `misc`; `data-cat` on checklist cards, chips, tray tokens and tiles drives `--cat`, `--cat-strong`, `--cat-pale`, `--cat-soft`, `--cat-ink`.
- Scope: `generatePackingList` / `generateTasks` take `scope`; `ABROAD_ONLY_TASKS` / `ABROAD_ONLY_ITEMS` in `templates.js`. Existing trips (`scope ''`) are unchanged. `prefs.homeCountry` + `HOME_COUNTRIES` (test keeps it equal to the catalog) drive a dynamic-import auto suggestion in the trip form that never overrides a manual choice.
- Background colors: `prefs.bgLight` / `prefs.bgDark`, applied as `data-bgl` / `data-bgd` (also in `theme-boot.js` to avoid a flash). CSS has an explicit-theme rule and a `prefers-color-scheme` rule for each palette. `tests/unit/backgrounds.test.js` enforces text ≥7:1 and muted text ≥4.5:1 on every variant.
- Own places: `customPlaceDialog` (screens/customPlace.js), store `addCustomPlace` / `editCustomPlace` / `removeEntry` / `restoreEntry`; `resolveGuide` turns them into rows with `admission: null` (never claimed free/ticketed).
- Wording: uncovered destinations no longer say "I won't make one up"; they offer the plan-it-yourself page.

## Discovery plan, Phase 5: My Trip Guide & packing integration (v1.5.0)

- `js/plan.js` (pure): `resolveGuide` (join saved entries with catalogs; entries whose item left the catalog stay, flagged `missing`), `groupByInterest`, `groupByDay`, `dayCount`, `draftPlan`, `packHints`. `js/screens/guide.js` (lazy, precached). No schema change: uses `entries.day` / `entries.order`.
- Store: `planEntry` (end of a day), `moveEntry` (swap with neighbour), `setPlan` (batch, returns previous values so a draft / clear / undo is one write). Unsaving clears `day`.
- Day plan is manual-first. The draft groups by the catalog `area` *label* (not distance), max 3 places per day, one dish per day; never touches items that already have a day. No times/durations/routes anywhere (tested).
- Packing hints are pure suggestions with `have` (already covered by an item name regex) and `add` (null for reminders). They never write; the only write is the explicit button (undoable). Dismissals are stored in prefs as `hint:<tripId>:<id>`; they are not part of backups.
- Entry points: guide tabs, checklist menu, trips action sheet, summary.
- Tests: unit `tests/unit/plan.test.js`; e2e 6 `guide:` checks (+ guide in a11y/overflow/dark sweeps).
- Phase 5.1 follow-up: guide export (copy / `.txt` / print route `/trip/:id/guide/print`, `guideModel` + `guideToText` in `plan.js`), pointer drag reorder within a day (buttons, select and Alt+Arrow remain the keyboard path), hidden packing ideas stored on the trip (`trip.hiddenHints`, travels with backups and duplicates; old prefs-based hides are migrated on first visit), `scripts/verify-catalog.mjs` (dev-only Wikipedia/Wikidata cross-check that prints a report and never edits the catalog; unit-tested with a fake `fetch`, NOT run against the live services because the sandbox blocks them).
- Known gaps: one place sits on one day only (a second visit needs a second entry; deliberate, a multi-day model would need schema v3 for little value); catalog data still unverified and no coordinates/photos/hours until network access allows running the verifier.

## Discovery plan, Phase 4: Taste the Destination (v1.4.0)

- `js/data/food.js` (editorial; no venues, prices, alcohol, pronunciations), `js/taste.js` (pure: country scoping, diet/allergen/category filters, grouping), `js/screens/taste.js` (lazy, precached), `Places | Taste` tabs via `guideTabs()` in `screens/shared.js`.
- Food is keyed by country (cuisine is regional), resolved from the trip destination with the same `matchDestination`; ambiguous destinations show nothing; `?country=XX` browses another covered country without touching the trip.
- Reuses schema v2 `entries` with `kind: 'food'`, `refId` = dish id. Added `store.setTried` / `store.setNote` (an entry with no saved/tried/note is removed). No schema change.
- Diet filter keeps only items *definitely* suitable (`true`); `'varies'` items are hidden and counted in a hint. Allergen chips hide items listing that allergen; absence of a tag never means absence of the allergen (stated on the page).
- Tests: unit `tests/unit/food.test.js`; e2e adds 7 `taste:` checks (+ taste in a11y/overflow/dark sweeps).
- Known gaps: data is editorial, not verified against a live source; no images (category art only, by design: no unlicensed food photos); no pronunciation; diet/allergen filters are session state (not remembered).

## Discovery plan, Phase 3: Explore Destination (v1.3.0)

Roadmap now follows `PackWise_Destination_Discovery_Extension.md`: Phase 3 Discovery (this), Phase 4 Food & Drink, Phase 5 My Trip Guide, Phase 6 final release (rescheduled). Gates: stop for approval after each.

- **Schema v2**: new `entries` store (`{id: tripId:kind:refId, tripId, kind: place|food, refId, saved, tried, note, day, order}`), IndexedDB v2, migration v1→v2, validation + merge re-keying, cascade delete, duplicate copies saved (untried) entries. Phase 4 reuses `kind: 'food'` + `tried`/`note`; Phase 5 uses `day`/`order`.
- `js/guide.js` (pure): destination matching, filtering, sectioning; `js/data/catalog.js` (editorial data); `js/screens/explore.js` loaded lazily via `lazy()` in `main.js` (precached, works offline).
- Honesty rules enforced by tests: no price/hours/coordinate fields, free ≠ unknown, no fuzzy matching, conflicts flagged.
- Tests: 77 unit (catalog integrity + content rules, matching, filters, entries, migration, backup), e2e adds 10 explore checks (multi-destination, unsupported, multi-stop/country/ambiguous, filters, saved persistence/isolation, backup/duplicate/delete, v1→v2 upgrade, keyboard/SR semantics, reduced motion + offline, packing flows unchanged) plus explore in the a11y, overflow (5 viewports) sweeps.
- Known gaps: data is editorial, not verified against a live source (network hosts were blocked); Chromium only; no screen-reader run.

## UI polish + parallax (v1.2.1)

- Fixes from user screenshots: welcome tagline now sits on a readable chip (and "Wise" uses the bright accent in dark mode); template cards have a footer row with equal-width **Use template** / **Customize** (secondary, visible in dark); Settings: solid accent selected tab, two balanced columns (CSS columns), row/fact patterns (`srow`, `fact`), About split into Install / Offline & updates / Privacy / Good to know; fixed a stray "null" rendered by `replaceChildren(null)`.
- **Parallax** (`js/parallax.js`): layers opt in with `data-parallax="<rate>"` (+ `data-parallax-max`, `data-parallax-mode="scroll"` for the fixed background). Transform-only, eased with a per-frame lerp, overscanned art so edges never show, off screen layers skipped, MutationObserver picks up re-rendered screens. Used on: dashboard hero art, trip-card art, optional background art, welcome art/characters, completion scene. Intensity follows the motion setting (Reduced = none, Enhanced = 1.6×) and the OS reduced-motion preference. Meaningful content (text, controls, the 3D studio) is never parallaxed.
- Tests: 60 → 66 e2e (parallax easing/bounds/overscan/reduced/enhanced, layout unchanged, template footer geometry, settings tab contrast + column balance, tagline contrast).

## Compact UI pass (v1.2.0)

User feedback: the app felt zoomed in on phones. Controls, type, spacing, nav and radii were scaled down across all screens (buttons 46→38 px, nav 68→58 px, body 16→14.5 px, cards/tiles/steppers/chips tighter, studio stage shorter). Text inputs stay at 16 px on touch devices (`pointer: coarse`) because iOS Safari zooms into smaller inputs. Touch targets remain ≥ 28 px (steppers) / 32–38 px (buttons, chips). Verified: 60 e2e (no overflow at 5 viewports), screenshots refreshed.

## Phase 2.1 (season, weather, camping)

- `trip.climate` is replaced by `trip.season` (`''|spring|summer|fall|winter`) and `trip.conditions` (subset of hot/warm/cool/cold/rainy/snowy/windy, canonical order). `normalizeTrip` maps legacy `climate` (warm→warm, mild→cool, cold→cold) when `conditions` is absent, so old backups still import; no schema bump needed.
- Rules (`js/templates.js`): chosen conditions win; with none, the season supplies defaults. Camping adds `CAMPING_CONDITION_EXTRAS` (tarp, cold-rated bag, 4-season tent, extra water, ...). New `camping` item category and `camping` bag kind; `bagForCategory` sends camping gear to that bag, then backpack.
- Form: Season & weather is section 4; choosing the Camping type ticks Backpack + Camping gear unless the user already touched the bag tiles.
- Verified: 40 unit, 42 e2e (adds form flow, bag auto-suggest, weather-driven list, studio camping tokens, edit round-trip). Chromium only.

## Phase 2.2 (Balkan seasons)

- `seasonOfDate` / `seasonForDates` in `js/progress.js` (pure, unit-tested incl. boundaries, year wrap, ties). The form calls it on date change unless `seasonTouched`; editing a trip that already has a season counts as touched.
- Assumption: northern hemisphere, meteorological seasons. Mountain areas can be wintry earlier/later than the calendar says; users add Snowy/Cold themselves. Southern-hemisphere support would need a region setting (not built).
- Verified: 42 unit, 43 e2e (adds auto-season, multi-season trips, manual override, season-driven list). Existing e2e fixtures use December dates, so those trips now correctly get winter items (e.g. "Warm jacket").

## Phase 2 known gaps

- Chromium only; Safari/iOS handling of `preserve-3d` with `backface-visibility`, touch drag and haptics are **unverified**. Mobile devices were not tested; only emulated viewports.
- Pinch-zoom on touch is not implemented (zoom button, keyboard, ctrl+wheel are).
- Camera presets/yaw are remembered per session only.
- Performance numbers are from a headless container, not mid-range phones.
- Still pending from the spec: backgrounds, haptics toggle, text/print export, install help, quota-recovery UX (Phase 3).

## Verified in Phase 1 (this environment)

- `npm test`: **22/22** unit tests pass.
- `npm run test:e2e`: **26/26** pass in Chromium (Playwright). Covers: welcome/onboarding, trip validation + list generation, pack/unpack persistence across reload, rapid taps, item add/edit/move/delete+undo, bag management, multi-trip isolation, duplicate/archive/restore/delete confirmations, tasks, summary, settings persistence, export → corrupt-import rejection → merge → replace, clear data, IndexedDB-unavailable fallback, keyboard + focus restoration, accessible names on every screen, reduced motion, no horizontal overflow at 360×640 / 390×844 / 768×1024 / 1024×768 / 1440×900, manifest + icons, service-worker control, **offline reopen and offline edits persisting**, **service-worker upgrade** (old shell keeps running, prompt, dialog blocks reload, data preserved, old cache removed), precache completeness, no `innerHTML`/`eval`/external URLs.

## Not verified / known gaps (be honest in reports)

- Only Chromium was tested. Safari/iOS, Firefox, and real devices (install-to-home-screen, safe areas, haptics) were **not** tested.
- No Lighthouse or screen-reader (VoiceOver/NVDA/TalkBack) run; a11y is checked structurally (names, roles, focus, overflow), not by assistive technology.
- Contrast for accent presets was computed by hand for white-on-accent-strong, not machine-audited for every surface/theme.
- GitHub Pages deployment not performed (instructions in README).
- Phase 1 intentionally omitted what Phase 2 now delivers; backgrounds, haptics and text/print export remain for Phase 3.

## Phase 3 plan

Design-fidelity pass (desktop right panel on more screens, Settings tabs, backgrounds), completion scene, rich settings (backgrounds, motion, haptics, companion toggle), text/print export, install/help messaging, storage-quota recovery UX, performance + a11y audits, deployment verification.

## Conventions

- Add a runtime file → add it to `PRECACHE` in `sw.js` (test enforces it).
- Release → bump `APP_VERSION` and `CACHE_VERSION` together; add a migration if the schema changes (`SCHEMA_VERSION`).
- Never write user strings into the DOM except through `h()` text children / `text:` props.
- After changing UI, run `node scripts/screenshots.mjs` and compare against `docs/design/PackWise_Approved_Design.webp`.
