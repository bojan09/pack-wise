# PackWise — agent notes

Vanilla HTML/CSS/JS (ES modules) offline-first PWA. No framework, no build step, no backend, no runtime dependencies. Read `docs/DEVELOPMENT_HANDOFF.md` first.

## Hard rules
- Work on `master` only (user's rule). No feature branches, merges or force-pushes.
- Three phases with gates: finish → test → fix → retest → commit/push → report → **stop for approval**. Do not start the next phase early.
- Never use `innerHTML`/`eval`/external hosts in app code (`npm run test:e2e` enforces it). Build DOM with `h()` / `svg()` from `js/dom.js`.
- Visual reference: `docs/design/PackWise_Approved_Design.webp`. Match it; palette ocean `#123D40`, teal `#31B6A6`, coral `#F28A72`, cream `#F8F5EF`, sand `#E7B66C`.
- Invariants: `0 <= packed <= target`; moving an item is a single-record update (never double-count); travel tasks never affect packing progress.
- Bump `APP_VERSION` (js/models.js) **and** `CACHE_VERSION` (sw.js) together, and list every new runtime file in `PRECACHE` (a test fails otherwise).

## Commands
- `npm test` — unit tests (node:test)
- `npm run test:e2e` — Playwright/Chromium suite (needs Playwright; see README)
- `npm start` — static server on :8080
- `npm run icons` — regenerate PNG icons from `assets/icons/icon.svg`

## Layout
`js/models.js` (normalizers) → `js/store.js` (mutations) → `js/screens/*` (UI). Pure logic lives in `progress.js`, `templates.js`, `selectors.js`, `validate.js`, `migrations.js` and is unit-tested without a DOM.
