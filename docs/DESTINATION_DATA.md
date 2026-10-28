# Destination guide: data, sources and limits

## What the catalog is
`js/data/catalog.js` is a **short editorial catalog**: 12 destinations (Belgrade, Skopje, Ohrid, Sarajevo, Mostar, Zagreb, Split, Dubrovnik, Ljubljana, Kotor, Tirana, Sofia), 96 well-known places. PackWise wrote the names, areas and one-sentence descriptions from general public knowledge. It is bundled, versioned (`version`, `reviewedAt`) and works fully offline.

**It was not checked against a live source when written.** The build environment had no access to Wikidata, Wikipedia, Wikivoyage or OpenStreetMap, and nothing was fabricated to stand in for them.

## What is deliberately not in it
Prices, opening hours, coordinates, ratings, rankings, restaurant listings, travel times. The data model has no fields for them, and `tests/unit/catalog.test.js` fails if the text looks like a price, an opening hour or a ranking. Admission is only:
- `free`: an open public place (street, square, promenade, bridge, park, shoreline). Never a museum, sacred interior or indoor place.
- `paid`: normally ticketed (price not listed).
- `check`: varies or unknown. Shown as **Check admission**, never as free.

## Links
- "Find on map" (OpenStreetMap) and "Google Maps": *search* links for "<place>, <city>, <country>". Not routes; no coordinates claimed. No map image is embedded (Google Static Maps needs an API key and forbids caching; the CSP allows no external hosts).
- "Read more": a Wikipedia *search* for "<place> <city>". Searches always resolve, unlike guessed article titles.
Both open in a new tab (`noopener noreferrer`) and need a connection. Nothing is fetched by the app.

## Licensing
Original wording by PackWise; place names are facts. No third-party text, images or data are bundled, so no attribution is required today. If a future build imports Wikidata (CC0), OpenStreetMap (ODbL, "© OpenStreetMap contributors") or Wikivoyage/Wikipedia text (CC BY-SA), add the attribution and share-alike obligations in the guide footer first.

## Upgrading to verified data (needs network access)
The sandbox denied these hosts; allowing them would let a build script verify and enrich the catalog: `www.wikidata.org`, `query.wikidata.org`, `en.wikipedia.org`, `en.wikivoyage.org`, `overpass-api.de`. Plan: a dev-only script that, for each place, confirms the Wikidata item and coordinates, reads OSM `fee=*`/`opening_hours` where tagged, records `source` + `verifiedAt` per field, and fails the build on mismatches. Hours/prices would only be shown with a visible "verified <date>" label.

## Online lookup (worldwide, optional)
`js/online.js` + `js/screens/online.js` find places near any town or city using **Wikidata** (place search and coordinates, CC0) and the **English Wikipedia** (nearby articles and their one-line descriptions, CC0 short descriptions). It runs only when the user taps *Search online* and sends only the typed name, then that place's coordinates.
- **What is shown:** name, one-line description, a type, coordinates *as given by Wikidata*, links to the exact point on Google Maps / OpenStreetMap and to the Wikipedia article. **Never** prices, hours or admission (every place says "Check admission").
- **Type filter:** the one-line description is matched against keyword rules (museum, church, mosque, castle, park, waterfall, square…). Anything that does not clearly match, or that looks like a village, station, person or company, is left out and counted ("N nearby articles left out").
- **Ambiguity:** several matches are listed with their descriptions ("Veles, city in North Macedonia" / "Veles, village in Bulgaria") and the user picks; nothing is guessed. A country or region has no single point and is refused with an explanation.
- **Offline:** results and the candidate lists of past searches are cached on the device (`packwise.online.v1`, 10 destinations / 20 searches). A failed refresh falls back to the cached copy and says so. Saved places carry a snapshot (name, description, coordinates, Wikipedia page id) inside the trip.
- **Limits:** English Wikipedia only (thin coverage in some regions, descriptions in English); 10 km radius; quality depends on volunteer-written descriptions, so it can miss places or include odd ones. Food and drink have no worldwide source and stay limited to the 8 covered countries.
- **Licensing:** coordinates and short descriptions are CC0 (Wikidata); article text is never copied, only linked. The page credits Wikidata (CC0) and Wikipedia. No API key is used or needed. Be gentle with the services: one search is about 3-5 small requests, only on a tap.
- **Verification status:** the code is tested against a fake server only (the build sandbox had no network). Run `npm run check:online` once with network access to confirm the real responses still match; it prints what it finds.

## Matching rules (`js/guide.js`)
Trip destination text is split into stops (`,` `;` `/` `-` `→` "and" "to" `&` parentheses), normalized (case, diacritics, `đ`), and matched against city names and aliases only. No fuzzy matching: "Belgrad" or "Spl" match nothing. A covered country alone offers its covered cities; a city with a conflicting covered country ("Split, Montenegro") is flagged ambiguous and nothing is shown automatically; uncovered stops are reported, not dropped silently.

## Food & drink (Phase 4)
`js/data/food.js`: about 40 regional specialities, scoped by country (cuisine does not follow city limits). Same editorial status: written from general knowledge, not checked against a live source, versioned. Deliberately absent: restaurants or vendors, prices, alcoholic drinks, pronunciation guides, photos. "Commonly found" lists venue *types* only (markets, bakeries, grill houses…). `vegetarian`/`vegan` are `true`, `false` or `'varies'`; `allergens` lists what a typical recipe commonly contains and never implies absence. `tests/unit/food.test.js` enforces the field whitelist and rejects price, alcohol, pronunciation and ranking wording.

## Known limitations
Coverage is 12 cities; a place missing from the list is not a statement that it is unworthy. Descriptions are short and general. Seasonality and accessibility notes are omitted because they could not be verified. Entries are stored per trip by stable id (`<destination>/<place>`); if a place is later removed from the catalog its saved entry would point at nothing (Phase 5 must show those as "no longer in the guide").
