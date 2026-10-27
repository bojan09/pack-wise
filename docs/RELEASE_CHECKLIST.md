# Release checklist

1. `npm test` and `npm run test:e2e` green (needs Playwright; see README).
2. Bump `APP_VERSION` (js/models.js) and `CACHE_VERSION` (sw.js) together; add any new runtime file to `PRECACHE`.
3. If the data shape changed: add a migration (js/migrations.js), bump `SCHEMA_VERSION`, add tests.
4. `node scripts/screenshots.mjs`, compare with `docs/design/PackWise_Approved_Design.webp`.
5. Push to `master`; GitHub Pages (Settings → Pages → Deploy from branch `master` / root) redeploys.
6. Open the live https URL: install prompt available, airplane-mode reload works, Settings → About → "Check offline files" reports all files in place.
7. Existing installs show the "new version ready" prompt; reload and confirm data is intact.

## Not verified in CI (do by hand when hardware is available)
Safari/iOS and Firefox rendering of the Packing Studio, real-device install and haptics, screen readers (VoiceOver/NVDA/TalkBack), Lighthouse on the live URL.
