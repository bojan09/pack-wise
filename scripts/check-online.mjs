// Live smoke test for the optional online lookup (js/online.js, OpenStreetMap). Run it once with real network access:
//   node scripts/check-online.mjs [place name]
// The app's own tests use a fake server, so this is the only check that the real Photon (autocomplete), Nominatim and
// Overpass responses still have the shape the code expects. It prints what it found and exits non-zero on any mismatch.
import { alongTheWay, findPlaces, nearby, suggestPlaces } from '../js/online.js';

const name = process.argv[2] || 'Veles';
const fail = (msg) => { console.error(`FAIL ${msg}`); process.exitCode = 1; };
try {
  const sug = await suggestPlaces(name);
  console.log(`autocomplete for "${name}":`, sug.map((s) => `${s.osm} ${s.label} [${s.cc}]`));
  if (!sug.length) fail('Photon returned no suggestions');
  const found = await findPlaces(name);
  console.log(`candidates for "${name}":`, found.map((f) => `${f.id} ${f.label} (${f.description})${f.large ? ' [region]' : ''}`));
  const first = found.find((f) => !f.large);
  if (!first) fail('no town or city candidate');
  else {
    const { places, dropped } = await nearby(first.lat, first.lon);
    console.log(`${places.length} attractions around ${first.label}, ${dropped} dropped`);
    for (const p of places.slice(0, 15)) console.log(` - ${p.name} [${p.kind}] ${p.desc} (${p.dist} m)${p.fee ? ` fee=${p.fee}` : ''}${p.hours ? ` hours="${p.hours}"` : ''}`);
    if (!places.length) fail('no attractions near the first candidate; try a larger town, or check the tag filters in overpassQuery()');
    const kinds = {};
    for (const p of places) kinds[p.kind] = (kinds[p.kind] || 0) + 1;
    console.log('by kind:', kinds, `· with fee tag: ${places.filter((p) => p.fee).length} · with hours: ${places.filter((p) => p.hours).length}`);
  }
  // Route: Skopje -> Ohrid (about 111 km), notable places near the straight line
  const way = await alongTheWay({ lat: 41.9981, lon: 21.4254 }, { lat: 41.1172, lon: 20.8016 });
  console.log(`${way.places.length} places on the way Skopje -> Ohrid (within ${way.radiusKm} km):`, way.places.map((p) => `${p.name} @${p.alongKm} km`));
  if (!way.places.length) fail('no places on the way; check corridorQuery()');
} catch (e) {
  fail(`${e.code || 'error'}: ${e.message}`);
}
