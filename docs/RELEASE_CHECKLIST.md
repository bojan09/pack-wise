# Release checklist

1. `npm test` and `npm run test:e2e` green (needs Playwright; see README).
2. Bump `APP_VERSION` (js/models.js) and `CACHE_VERSION` (sw.js) together; add any new runtime file to `PRECACHE`.
3. If the data shape changed: add a migration (js/migrations.js), bump `SCHEMA_VERSION`, add tests.
4. `node scripts/screenshots.mjs`, compare with `docs/design/PackWise_Approved_Design.webp`.
5. Push to `master`; GitHub Pages (Settings → Pages → Deploy from branch `master` / root) redeploys.
6. Open the live https URL: install prompt available, airplane-mode reload works, Settings → About → "Check offline files" reports all files in place.
7. Existing installs show the "new version ready" prompt; reload and confirm data is intact.

8. Content: read `docs/DESTINATION_DATA.md` and `docs/KNOWN_LIMITATIONS.md`. If the network is available, run `node scripts/verify-catalog.mjs --coords --out catalog-report.json` and review every "noArticle" and "weakMatch" entry by hand before shipping new places. Never add prices, hours or coordinates without a visible verified date and source.
9. Privacy: `docs/PRIVACY.md` still matches what the app stores and links to.
10. Performance: the "500-item trip" e2e check must pass on the release machine; if it fails, profile before raising the limit.

## Not verified in CI (do by hand when hardware is available)
Safari/iOS and Firefox rendering of the Packing Studio, real-device install and haptics, screen readers (VoiceOver/NVDA/TalkBack), Lighthouse on the live URL.
