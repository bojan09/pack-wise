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

## Online lookup (worldwide, optional): OpenStreetMap
`js/online.js` + `js/screens/online.js` find places near any town or city using **OpenStreetMap**: **Nominatim** finds the town by name and **Overpass** returns tagged places around it. No API key. It runs only when the user taps *Search online* and sends only the typed name, then that place's coordinates.
- **Why OpenStreetMap, not an AI model:** a map database is a real, checkable source with coordinates and tags; a language model produces plausible-sounding attractions, fees and hours that may not exist. Wikipedia was used in v1.10 and replaced in v1.11 (existing saved Wikipedia entries still display).
- **What is shown:** name, coordinates, a type from the tags (`tourism`, `historic`, `natural`, `leisure`, `amenity=place_of_worship`), the mapper's own `description` when there is one, links to the exact point (Google Maps / OpenStreetMap), to the map entry and to the `website` tag. **Fee** (`fee=yes|no` → "Ticketed / Free per OSM"), **opening hours** (`opening_hours`, shown verbatim) and **wheelchair access** only when mappers tagged them, always labelled as OpenStreetMap community data that may be outdated. Untagged means "Check admission". **Ticket prices (`charge`) are never shown.**
- **Filtering:** only named elements with a recognised attraction tag are kept; small parks and places of worship are kept only when they carry a `wikidata` tag (a notability signal); the same thing mapped as a node and a way appears once; up to 60 places, notable ones first, shown nearest first; the rest are counted ("N left out").
- **Autocomplete (v1.12):** the Destination field uses **Photon** (`photon.komoot.io`, built on OSM data for search-as-you-type; Nominatim's usage policy forbids autocomplete). From 3 letters, 350 ms after the last key, one request at a time (older ones are cancelled), `limit=7`, streets / houses / buildings dropped, at most 6 shown. A picked place is stored on the trip (`trip.place`: name, label, lat/lon, ISO country code, OSM id) and *Find places online* uses its coordinates directly (no Nominatim request). Same ODbL attribution.
- **Ambiguity:** several matches are listed with region and country ("Veles, Municipality of Veles, North Macedonia" / "Veles, Obshtina X, Bulgaria") and the user picks. A country or region (Nominatim `place_rank` < 12) has no single point and is refused without any request.
- **Resilience:** if the main Overpass server is busy, unreachable or times out, one mirror is tried; malformed answers are never retried or shown. Results and past searches are cached (`packwise.online.v2`, 10 destinations / 20 searches); a failed refresh falls back to the cached copy and says so. Saved places carry a snapshot (name, description, type, coordinates, fee, hours, wheelchair, website, OSM id) inside the trip.
- **Limits:** 6 km radius; quality and freshness depend on local mappers (fee and hours tags are sparse in many regions); the public Overpass servers are shared, so heavy use is not appropriate: one search is one name lookup plus one area query, only on a tap. Food and drink have no worldwide source and stay limited to the 8 covered countries.
- **Licensing:** data © OpenStreetMap contributors, **ODbL**; the page and every export credit it ("© OpenStreetMap contributors") and link to openstreetmap.org/copyright. Results are cached per device only, never redistributed.
- **Verification status:** the code is tested against a fake server only (the build sandbox had no network). Run `npm run check:online` once with network access to confirm the real responses still match; it prints what it finds, including how many places carry fee and hours tags.

## Matching rules (`js/guide.js`)
Trip destination text is split into stops (`,` `;` `/` `-` `→` "and" "to" `&` parentheses), normalized (case, diacritics, `đ`), and matched against city names and aliases only. No fuzzy matching: "Belgrad" or "Spl" match nothing. A covered country alone offers its covered cities; a city with a conflicting covered country ("Split, Montenegro") is flagged ambiguous and nothing is shown automatically; uncovered stops are reported, not dropped silently.

## Food & drink (Phase 4)
`js/data/food.js`: about 40 regional specialities, scoped by country (cuisine does not follow city limits). Same editorial status: written from general knowledge, not checked against a live source, versioned. Deliberately absent: restaurants or vendors, prices, alcoholic drinks, pronunciation guides, photos. "Commonly found" lists venue *types* only (markets, bakeries, grill houses…). `vegetarian`/`vegan` are `true`, `false` or `'varies'`; `allergens` lists what a typical recipe commonly contains and never implies absence. `tests/unit/food.test.js` enforces the field whitelist and rejects price, alcohol, pronunciation and ranking wording.

## Known limitations
Coverage is 12 cities; a place missing from the list is not a statement that it is unworthy. Descriptions are short and general. Seasonality and accessibility notes are omitted because they could not be verified. Entries are stored per trip by stable id (`<destination>/<place>`); if a place is later removed from the catalog its saved entry would point at nothing (Phase 5 must show those as "no longer in the guide").
