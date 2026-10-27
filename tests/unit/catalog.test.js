import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG } from '../../js/data/catalog.js';
import { ADMISSION, KINDS, SECTIONS, availableFilters, filterPlaces, getPlace, groupSections, mapSearchUrl, matchDestination, normalizeName, refId, sectionOf, splitStops, wikipediaSearchUrl, citiesInCountry } from '../../js/guide.js';

const KIND_IDS = KINDS.map((k) => k.id);
const dest = (id) => CATALOG.destinations.find((d) => d.id === id);

test('catalog integrity: unique ids, allowed values, sensible size', () => {
  assert.match(CATALOG.version, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(CATALOG.reviewedAt, /^\d{4}-\d{2}-\d{2}$/);
  const destIds = new Set();
  const countryIds = new Set(CATALOG.countries.map((c) => c.id));
  for (const d of CATALOG.destinations) {
    assert.ok(!destIds.has(d.id), `duplicate destination ${d.id}`);
    destIds.add(d.id);
    assert.ok(d.name && d.country && countryIds.has(d.countryCode), d.id);
    assert.ok(d.places.length >= 6, `${d.id} has too few places`);
    const ids = new Set();
    for (const p of d.places) {
      assert.ok(!ids.has(p.id), `duplicate place ${d.id}/${p.id}`);
      ids.add(p.id);
      assert.match(p.id, /^[a-z0-9-]+$/);
      assert.ok(KIND_IDS.includes(p.kind), `${p.id}: kind`);
      assert.ok(['free', 'paid', 'check'].includes(p.admission), `${p.id}: admission`);
      assert.ok(['indoor', 'outdoor', 'both'].includes(p.setting), `${p.id}: setting`);
      assert.ok(p.name.length >= 3 && p.area && p.why.length >= 30 && p.why.length <= 220, `${p.id}: text`);
      assert.ok(p.why.endsWith('.'), `${p.id}: sentence`);
    }
  }
  assert.ok(CATALOG.destinations.length >= 10);
});

test('no invented detail: no prices, hours, coordinates or ratings anywhere in the data', () => {
  const allowed = new Set(['id', 'name', 'area', 'kind', 'admission', 'setting', 'why', 'gem', 'family', 'note']);
  for (const d of CATALOG.destinations) {
    for (const p of d.places) {
      for (const key of Object.keys(p)) assert.ok(allowed.has(key), `${d.id}/${p.id} has unexpected field "${key}"`);
      const text = `${p.why} ${p.note || ''}`;
      assert.ok(!/[€$£]\s?\d|\d\s?(€|eur|usd|kn|rsd|bam|mkd|all|lek|bgn)\b/i.test(text), `${p.id}: looks like a price`);
      assert.ok(!/\b\d{1,2}[:.]\d{2}\b|\bopen(s|ing)?\s+(daily|from|until)|\bclosed on\b/i.test(text), `${p.id}: looks like opening hours`);
      assert.ok(!/\b(best|top|#1|rated|stars?)\b/i.test(text), `${p.id}: ranking/rating claim`);
    }
  }
});

test('"free" is only used for open public places; museums and sacred interiors never are', () => {
  for (const d of CATALOG.destinations) {
    for (const p of d.places) {
      if (p.admission !== 'free') continue;
      assert.ok(!['museum', 'religious'].includes(p.kind), `${d.id}/${p.id}: free but ${p.kind}`);
      assert.notEqual(p.setting, 'indoor', `${d.id}/${p.id}: free but indoor`);
    }
  }
});

test('every destination offers at least one free and one non-free place (so filters mean something)', () => {
  for (const d of CATALOG.destinations) {
    const f = availableFilters(d.places);
    assert.ok(f.admission.length >= 2, `${d.id} admission filter`);
  }
});

test('sections: every place lands in exactly one, titles match the brief', () => {
  assert.deepEqual(SECTIONS.map((s) => s.title), ['Free to Explore', 'Worth the Ticket', 'Check Admission First', 'Hidden Gems', 'Nature & Outdoors']);
  for (const d of CATALOG.destinations) {
    const groups = groupSections(d.places);
    assert.equal(groups.reduce((n, g) => n + g.places.length, 0), d.places.length);
    for (const g of groups) for (const p of g.places) assert.equal(sectionOf(p), g.id);
  }
  // unknown admission is never filed under Free
  for (const d of CATALOG.destinations) for (const p of d.places) if (p.admission === 'check') assert.notEqual(sectionOf(p), 'free');
  assert.ok(ADMISSION.check.label === 'Check admission');
});

test('normalizeName / splitStops handle diacritics, scripts and multi-stop text', () => {
  assert.equal(normalizeName('  Tiranë '), 'tirane');
  assert.equal(normalizeName('Đakovo'), 'djakovo');
  assert.deepEqual(splitStops('Belgrade → Novi Sad, Skopje'), ['belgrade', 'novi sad', 'skopje']);
  assert.deepEqual(splitStops('Split - Dubrovnik and Kotor'), ['split', 'dubrovnik', 'kotor']);
  assert.deepEqual(splitStops('Sarajevo & Mostar; Ohrid'), ['sarajevo', 'mostar', 'ohrid']);
  assert.deepEqual(splitStops(''), []);
});

test('matching: exact, alias, diacritics, scripts, country context', () => {
  const m = (t) => matchDestination(t, CATALOG);
  assert.deepEqual(m('Belgrade').matches.map((d) => d.id), ['belgrade']);
  assert.deepEqual(m('Belgrade, Serbia').matches.map((d) => d.id), ['belgrade']);
  assert.equal(m('Belgrade, Serbia').status, 'covered');
  assert.deepEqual(m('Beograd').matches.map((d) => d.id), ['belgrade']);
  assert.deepEqual(m('Београд').matches.map((d) => d.id), ['belgrade']);
  assert.deepEqual(m('TIRANË, Albania').matches.map((d) => d.id), ['tirana']);
  assert.deepEqual(m('Zagreb (Croatia)').matches.map((d) => d.id), ['zagreb']);
  assert.deepEqual(m('Ohrid, North Macedonia').matches.map((d) => d.id), ['ohrid']);
  assert.deepEqual(m('Ohrid, Macedonia').matches.map((d) => d.id), ['ohrid']);
});

test('matching: multi-stop trips return every covered stop and report the rest', () => {
  const r = matchDestination('Zagreb - Split - Dubrovnik - Budva', CATALOG);
  assert.deepEqual(r.matches.map((d) => d.id), ['zagreb', 'split', 'dubrovnik']);
  assert.deepEqual(r.unmatched, ['budva']);
  assert.equal(r.status, 'partial');
});

test('matching: country-only text offers the covered cities, never a guess', () => {
  const r = matchDestination('Croatia', CATALOG);
  assert.equal(r.status, 'country');
  assert.deepEqual(r.countryOnly.map((c) => c.id), ['HR']);
  assert.deepEqual(citiesInCountry(CATALOG, 'HR').map((d) => d.id), ['zagreb', 'split', 'dubrovnik']);
  assert.equal(r.matches.length, 0);
  assert.equal(matchDestination('Bosnia', CATALOG).countryOnly[0].id, 'BA');
});

test('matching: conflicting country is flagged as ambiguous instead of picking one', () => {
  const r = matchDestination('Split, Montenegro', CATALOG);
  assert.equal(r.status, 'ambiguous');
  assert.equal(r.matches.length, 0);
  assert.equal(r.conflicts[0].country, 'Montenegro');
  assert.equal(r.conflicts[0].destination.id, 'split');
  assert.equal(matchDestination('Split, Croatia', CATALOG).status, 'covered');
});

test('matching: unsupported destinations return nothing (no fuzzy invention)', () => {
  for (const t of ['Rome, Italy', 'Paris', 'Tokyo', 'Valencia', 'Bled', 'Spl', 'Belgrad', '', '   ']) {
    const r = matchDestination(t, CATALOG);
    assert.equal(r.matches.length, 0, t);
    assert.ok(['none'].includes(r.status), `${t}: ${r.status}`);
  }
});

test('filters work on the real catalog and only appear when they split the list', () => {
  const b = dest('belgrade');
  const f = availableFilters(b.places);
  assert.deepEqual(f.admission, ['free', 'paid', 'check']);
  assert.ok(f.kinds.length >= 4);
  assert.equal(f.setting, true);
  assert.equal(f.family, true);
  const free = filterPlaces(b, { admission: 'free' });
  assert.ok(free.length > 0 && free.every((p) => p.admission === 'free'));
  assert.ok(filterPlaces(b, { admission: 'paid' }).every((p) => p.admission === 'paid'));
  assert.ok(filterPlaces(b, { kind: 'museum' }).every((p) => p.kind === 'museum'));
  const indoor = filterPlaces(b, { setting: 'indoor' });
  assert.ok(indoor.length > 0 && indoor.every((p) => p.setting !== 'outdoor'));
  const outdoor = filterPlaces(b, { setting: 'outdoor' });
  assert.ok(outdoor.every((p) => p.setting !== 'indoor'));
  assert.ok(filterPlaces(b, { family: true }).every((p) => p.family));
  const saved = new Set([refId(b, b.places[0]), refId(b, b.places[2])]);
  assert.deepEqual(filterPlaces(b, { saved: true }, saved).map((p) => p.id), [b.places[0].id, b.places[2].id]);
  assert.equal(filterPlaces(b, { saved: true }, new Set()).length, 0);
  assert.deepEqual(filterPlaces(b, {}).length, b.places.length);
  // combination
  const combo = filterPlaces(b, { admission: 'free', setting: 'outdoor', family: true });
  assert.ok(combo.every((p) => p.admission === 'free' && p.family && p.setting !== 'indoor'));
  // a destination without any family places omits that filter
  const noFamily = { places: [{ ...b.places[0], family: false }, { ...b.places[1], family: false }] };
  assert.equal(availableFilters(noFamily.places).family, false);
  // single-valued dimensions are omitted
  const oneKind = availableFilters([{ ...b.places[0], kind: 'history', admission: 'free' }, { ...b.places[1], kind: 'history', admission: 'free' }]);
  assert.deepEqual([oneKind.kinds, oneKind.admission], [[], []]);
});

test('links are encoded searches (no fabricated coordinates or routes) and refs resolve', () => {
  const b = dest('belgrade');
  const p = b.places[0];
  assert.match(mapSearchUrl(p, b), /^https:\/\/www\.openstreetmap\.org\/search\?query=Kalemegdan%20Park%20%26%20Fortress%2C%20Belgrade%2C%20Serbia$/);
  assert.match(wikipediaSearchUrl(p, b), /^https:\/\/en\.wikipedia\.org\/w\/index\.php\?search=/);
  assert.deepEqual(getPlace(CATALOG, refId(b, p)), { dest: b, place: p });
  assert.equal(getPlace(CATALOG, 'belgrade/nope'), null);
  assert.equal(getPlace(CATALOG, 'nowhere/x'), null);
});
