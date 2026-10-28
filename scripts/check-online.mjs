// Live smoke test for the optional online lookup (js/online.js, OpenStreetMap). Run it once with real network access:
//   node scripts/check-online.mjs [place name]
// The app's own tests use a fake server, so this is the only check that the real Nominatim / Overpass responses still
// have the shape the code expects. It prints what it found and exits non-zero on any mismatch.
import { findPlaces, nearby } from '../js/online.js';

const name = process.argv[2] || 'Veles';
const fail = (msg) => { console.error(`FAIL ${msg}`); process.exitCode = 1; };
try {
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
} catch (e) {
  fail(`${e.code || 'error'}: ${e.message}`);
}
