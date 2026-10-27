# Known limitations (v1.7)

Honest list of what PackWise does **not** do, so nobody has to find out the hard way. Items marked ⛔ need a decision or access PackWise does not have today.

## Destination content
- ⛔ **The guide is editorial, not verified against a live source.** 12 cities (96 places) and ~40 dishes in 8 Balkan countries were written by PackWise from general knowledge. The network was blocked while building, so nothing was cross-checked. `scripts/verify-catalog.mjs` exists to do that (reports only, never edits) but has only been tested against a fake `fetch`, not against Wikipedia/Wikidata.
- **No prices, opening hours, coordinates, ratings or photos.** The data model has no fields for them on purpose, because they could not be verified. Admission is only "free area", "ticketed" or "check admission".
- **Coverage is small.** Any other destination (a town, a trail, another country) gets the *Plan it yourself* page: add your own places and use search links. A place missing from the guide is not a judgement about it.
- **Map links need a connection** and open Google Maps / OpenStreetMap / Wikipedia *searches*. PackWise does not embed maps and does not claim coordinates. Google's static map images need an API key and forbid caching, so they are not used.
- **Food and diet tags describe a typical recipe**, never a safety guarantee. A missing allergen does not mean it is absent. Diet and allergen filter choices reset when you leave the page.
- Matching is exact (after case/accent normalisation). "Belgrad" or "Spl" match nothing. Multi-stop, country-only and conflicting ("Split, Montenegro") destinations are handled; free-text with typos is not.

## Trips and planning
- A saved place sits on **one day**. A second visit needs a second entry (own place).
- The **draft day plan** groups only by the catalog's area *name*, never by distance. No times, routes or travel durations anywhere.
- **Trip scope** (within my country / abroad) is applied when a list is generated. Changing it later does not rewrite an existing list; the Travel Tasks page only offers to remove the abroad-only tasks.
- Packing ideas from the guide are reminders based on place *type*; they are deliberately few and simple.
- Hidden packing ideas, saved places and day plans are in backups; **UI preferences** (theme, colors, home country, tips you dismissed) live in `localStorage` on the device and are not in backups.

## Platform
- **Storage** is IndexedDB in the browser. Clearing site data, private windows or low disk can erase trips; export a backup regularly (Settings → Data). There is no sync between devices.
- Tested in **Chromium only** (Playwright). Safari/iOS and Firefox rendering, real-device install, haptics and screen readers (VoiceOver, NVDA, TalkBack) were not run by hand. Automated checks cover accessible names, headings, focus, contrast tokens and overflow at five viewport sizes.
- **Offline**: the app shell, guides and your data work offline after the first load. Updates need one online visit; the update prompt appears when a new version is ready.
- `content-visibility: auto` is used on long checklist rows; very old browsers ignore it and simply render everything.
- Pointer drag-reorder is supported; the buttons, selects and Alt+Arrow keys are the keyboard/screen-reader path.

## Not done on purpose
No accounts, backend, analytics, ads or paid services. No scraping. No invented attractions, prices, hours or routes.
