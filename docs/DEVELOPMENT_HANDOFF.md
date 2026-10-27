# PackWise — development handoff

Last updated: end of **Phase 2.1** (smart travel + Packing Studio). Phase 3 is not started.

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

## Phase 2.1 (season, weather, camping)

- `trip.climate` is replaced by `trip.season` (`''|spring|summer|fall|winter`) and `trip.conditions` (subset of hot/warm/cool/cold/rainy/snowy/windy, canonical order). `normalizeTrip` maps legacy `climate` (warm→warm, mild→cool, cold→cold) when `conditions` is absent, so old backups still import; no schema bump needed.
- Rules (`js/templates.js`): chosen conditions win; with none, the season supplies defaults. Camping adds `CAMPING_CONDITION_EXTRAS` (tarp, cold-rated bag, 4-season tent, extra water, ...). New `camping` item category and `camping` bag kind; `bagForCategory` sends camping gear to that bag, then backpack.
- Form: Season & weather is section 4; choosing the Camping type ticks Backpack + Camping gear unless the user already touched the bag tiles.
- Verified: 40 unit, 42 e2e (adds form flow, bag auto-suggest, weather-driven list, studio camping tokens, edit round-trip). Chromium only.

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
