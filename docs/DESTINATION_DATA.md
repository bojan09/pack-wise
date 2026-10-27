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

## Matching rules (`js/guide.js`)
Trip destination text is split into stops (`,` `;` `/` `-` `→` "and" "to" `&` parentheses), normalized (case, diacritics, `đ`), and matched against city names and aliases only. No fuzzy matching: "Belgrad" or "Spl" match nothing. A covered country alone offers its covered cities; a city with a conflicting covered country ("Split, Montenegro") is flagged ambiguous and nothing is shown automatically; uncovered stops are reported, not dropped silently.

## Food & drink (Phase 4)
`js/data/food.js`: about 40 regional specialities, scoped by country (cuisine does not follow city limits). Same editorial status: written from general knowledge, not checked against a live source, versioned. Deliberately absent: restaurants or vendors, prices, alcoholic drinks, pronunciation guides, photos. "Commonly found" lists venue *types* only (markets, bakeries, grill houses…). `vegetarian`/`vegan` are `true`, `false` or `'varies'`; `allergens` lists what a typical recipe commonly contains and never implies absence. `tests/unit/food.test.js` enforces the field whitelist and rejects price, alcohol, pronunciation and ranking wording.

## Known limitations
Coverage is 12 cities; a place missing from the list is not a statement that it is unworthy. Descriptions are short and general. Seasonality and accessibility notes are omitted because they could not be verified. Entries are stored per trip by stable id (`<destination>/<place>`); if a place is later removed from the catalog its saved entry would point at nothing (Phase 5 must show those as "no longer in the guide").
