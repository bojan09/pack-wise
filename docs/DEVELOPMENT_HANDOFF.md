# PackWise — development handoff

Last updated: end of **Phase 1** (foundation & reliable MVP). Phases 2 and 3 are not started.

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

## Verified in Phase 1 (this environment)

- `npm test`: **22/22** unit tests pass.
- `npm run test:e2e`: **26/26** pass in Chromium (Playwright). Covers: welcome/onboarding, trip validation + list generation, pack/unpack persistence across reload, rapid taps, item add/edit/move/delete+undo, bag management, multi-trip isolation, duplicate/archive/restore/delete confirmations, tasks, summary, settings persistence, export → corrupt-import rejection → merge → replace, clear data, IndexedDB-unavailable fallback, keyboard + focus restoration, accessible names on every screen, reduced motion, no horizontal overflow at 360×640 / 390×844 / 768×1024 / 1024×768 / 1440×900, manifest + icons, service-worker control, **offline reopen and offline edits persisting**, **service-worker upgrade** (old shell keeps running, prompt, dialog blocks reload, data preserved, old cache removed), precache completeness, no `innerHTML`/`eval`/external URLs.

## Not verified / known gaps (be honest in reports)

- Only Chromium was tested. Safari/iOS, Firefox, and real devices (install-to-home-screen, safe areas, haptics) were **not** tested.
- No Lighthouse or screen-reader (VoiceOver/NVDA/TalkBack) run; a11y is checked structurally (names, roles, focus, overflow), not by assistive technology.
- Contrast for accent presets was computed by hand for white-on-accent-strong, not machine-audited for every surface/theme.
- GitHub Pages deployment not performed (instructions in README).
- Phase 1 intentionally omits: Packing Studio, drag-reorder, bulk select, templates UI, return-trip mode, companion bubbles/reactions, backgrounds/motion levels/haptics settings, text/print export.

## Phase 2 plan (do not start without approval)

1. **Packing Studio** (`js/screens/studio.js`, `js/ui/suitcase.js`, `css/studio.css`): layered SVG/CSS pseudo-3D case (lid, shell, lining, compartment, straps, shadows, stickers); category tokens derived from store state (never mutated by animation); open/close, camera presets/rotate, zoom, bag switcher, tap-token → item focus, synchronized list; summarize large counts; cancellable animations safe under rapid taps / navigation. Add `/studio` route + sidebar entry (desktop design) and "Pack" entry point from the checklist.
2. Checklist: drag reorder with button/keyboard alternatives (`order` field already exists), bulk select/operations, priority sorting.
3. Create-trip enhancements: weekend preset, richer rules (travelers, bag type, optional climate), templates (built-in + save custom + copy previous trip) using the existing `templates` store.
4. Return-trip mode (copy chosen belongings into a separate journey-home list, original untouched), refined readiness/countdown, essentials highlighting.
5. Companion: rule-based bubbles (first trip, milestones, remaining essentials, completion, return), dismissible, mute preference; blink/reaction animations (blink already exists).
6. Optional/removable demo data; updated screenshots (`node scripts/screenshots.mjs`); extend unit + e2e suites. Add a motion pref (Reduced/Standard/Enhanced) hook early since Studio depends on it.

## Phase 3 plan

Design-fidelity pass (desktop right panel on more screens, Settings tabs, backgrounds), completion scene, rich settings (backgrounds, motion, haptics, companion toggle), text/print export, install/help messaging, storage-quota recovery UX, performance + a11y audits, deployment verification.

## Conventions

- Add a runtime file → add it to `PRECACHE` in `sw.js` (test enforces it).
- Release → bump `APP_VERSION` and `CACHE_VERSION` together; add a migration if the schema changes (`SCHEMA_VERSION`).
- Never write user strings into the DOM except through `h()` text children / `text:` props.
- After changing UI, run `node scripts/screenshots.mjs` and compare against `docs/design/PackWise_Approved_Design.webp`.
