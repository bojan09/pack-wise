// Live smoke test for the optional online lookup (js/online.js). Run it once with real network access:
//   node scripts/check-online.mjs [place name]
// The app's own tests use a fake server, so this is the only check that the real Wikidata / Wikipedia responses
// still have the shape the code expects. It prints what it found and exits non-zero on any mismatch.
import { classify, coordsOf, findPlaces, nearby } from '../js/online.js';

const name = process.argv[2] || 'Veles';
const fail = (msg) => { console.error(`FAIL ${msg}`); process.exitCode = 1; };
try {
  const found = await findPlaces(name);
  console.log(`candidates for "${name}":`, found.map((f) => `${f.qid} ${f.label} (${f.description})`));
  if (!found.length) fail('no candidates');
  const first = found[0];
  const c = await coordsOf(first.qid);
  console.log('coordinates:', c);
  if (!c) { fail(`${first.qid} has no coordinates; try another name`); }
  else {
    const { places, dropped } = await nearby(c.lat, c.lon);
    console.log(`${places.length} attractions, ${dropped} dropped`);
    for (const p of places.slice(0, 15)) console.log(` - ${p.name} [${p.kind}] ${p.desc} (${p.dist} m)`);
    if (!places.length) fail('no attractions near the first candidate; check the description keywords in js/online.js');
    const types = {};
    for (const p of places) types[p.kind] = (types[p.kind] || 0) + 1;
    console.log('by kind:', types, '· classify("Orthodox church") =', classify('Orthodox church'));
  }
} catch (e) {
  fail(`${e.code || 'error'}: ${e.message}`);
}
