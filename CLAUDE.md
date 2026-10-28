# PackWise — agent notes

Vanilla HTML/CSS/JS (ES modules) offline-first PWA. No framework, no build step, no backend, no runtime dependencies. Read `docs/DEVELOPMENT_HANDOFF.md` first.

## Hard rules
- Work on `master` only (user's rule). No feature branches, merges or force-pushes.
- Phases have gates (original 1-3, then the Destination Discovery plan 3-6, all done as of v1.7.0): finish → test → fix → retest → commit/push → report → **stop for approval**. Do not start the next phase early.
- Never use `innerHTML`/`eval`/external hosts in app code (`npm run test:e2e` enforces it). Build DOM with `h()` / `svg()` from `js/dom.js`.
- Visual reference: `docs/design/PackWise_Approved_Design.webp`. Match it; palette ocean `#123D40`, teal `#31B6A6`, coral `#F28A72`, cream `#F8F5EF`, sand `#E7B66C`.
- Invariants: `0 <= packed <= target`; moving an item is a single-record update (never double-count); travel tasks never affect packing progress.
- Honest data only: the destination/food catalogs are editorial. Never add prices, hours, coordinates, ratings or photos without a verified, dated source (see `docs/DESTINATION_DATA.md`). Packing lists are only ever changed by an explicit user tap.
- The only network code is `js/online.js` (four fixed OpenStreetMap hosts: Nominatim, Overpass + mirror, Photon; allow-list enforced there, in the CSP and in a test). Never add another host or an API key in the code. Place lookups run only on a user tap; the single exception is destination autocomplete (Photon, `js/ui/placefield.js`): on by default with a visible notice and an off switch (Settings → Preferences), 3+ letters, debounced, sends only the typed text. AI models are not a source of places, fees or hours.
- Schema is v7 (`js/models.js`); any data-shape change needs a migration, a `SCHEMA_VERSION` bump and tests.
- Bump `APP_VERSION` (js/models.js) **and** `CACHE_VERSION` (sw.js) together, and list every new runtime file in `PRECACHE` (a test fails otherwise).

## Commands
- `npm test` — unit tests (node:test)
- `npm run test:e2e` — Playwright/Chromium suite (needs Playwright; see README)
- `npm start` — static server on :8080
- `npm run icons` — regenerate PNG icons from `assets/icons/icon.svg`

## Layout
`js/models.js` (normalizers) → `js/store.js` (mutations) → `js/screens/*` (UI). Pure logic lives in `progress.js`, `templates.js`, `selectors.js`, `validate.js`, `migrations.js`, `guide.js`, `taste.js`, `plan.js`, `route.js` and is unit-tested without a DOM. Catalogs: `js/data/catalog.js` (places), `js/data/food.js` (dishes); optional live lookup: `js/online.js`. Item pictures: `js/ui/itemart.js`. Guide screens (`explore`, `route`, `taste`, `guide`, `online`) are lazy-loaded and precached. The Route page shows straight-line distance only: never invent road distances or travel times (directions links hand that to the user's maps app).

Docs: `docs/DEVELOPMENT_HANDOFF.md` (architecture + per-phase notes), `docs/DESTINATION_DATA.md` (sources, licensing), `docs/KNOWN_LIMITATIONS.md`, `docs/PRIVACY.md`, `docs/RELEASE_CHECKLIST.md`.
