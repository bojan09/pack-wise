import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG } from '../../js/data/catalog.js';
import { dayCount, draftPlan, groupByDay, groupByInterest, packHints, planned, resolveGuide } from '../../js/plan.js';
import { createStore } from '../../js/store.js';
import { createMemoryAdapter } from '../../js/storage/memory.js';
import { tripEntries } from '../../js/selectors.js';
import { guideMessage } from '../../js/companion.js';

const belgrade = CATALOG.destinations.find((d) => d.id === 'belgrade');
const ref = (p) => `belgrade/${p.id}`;
const fresh = async () => { const s = createStore(createMemoryAdapter()); await s.init(); const t = s.createTrip({ name: 'Belgrade', destination: 'Belgrade', type: 'city', startDate: '2027-05-01', endDate: '2027-05-04' }, { bagKinds: ['carry-on'] }); return { s, t }; };
const saveAll = (s, t, n) => belgrade.places.slice(0, n).forEach((p) => s.setSaved(t.id, 'place', ref(p), true));
const rowsOf = (s, t) => resolveGuide(tripEntries(s.state, t.id));

test('dayCount follows trip length, defaults to 3, never below used days', async () => {
  const { t } = await fresh();
  assert.equal(dayCount(t), 4);
  assert.equal(dayCount({ startDate: '', endDate: '' }), 3);
  assert.equal(dayCount(t, [{ entry: { day: 9 } }]), 9);
  assert.equal(dayCount({ startDate: '2027-01-01', endDate: '2027-12-31' }), 60);
});

test('resolveGuide joins catalog data and keeps entries whose item left the catalog', async () => {
  const { s, t } = await fresh();
  s.setSaved(t.id, 'place', ref(belgrade.places[0]), true);
  s.setSaved(t.id, 'food', 'cevapi', true);
  s.setSaved(t.id, 'place', 'belgrade/gone-place', true);
  s.setSaved(t.id, 'food', 'gone-dish', true);
  s.setSaved(t.id, 'place', ref(belgrade.places[1]), true);
  s.setSaved(t.id, 'place', ref(belgrade.places[1]), false);
  const rows = rowsOf(s, t);
  assert.equal(rows.length, 4);
  assert.deepEqual(rows.filter((r) => r.missing).map((r) => r.sub), ['No longer in the guide', 'No longer in the guide']);
  assert.equal(rows.find((r) => r.kind === 'food' && !r.missing).title, 'Ćevapi');
  assert.ok(groupByInterest(rows).some((g) => g.id === 'missing'));
});

test('unsaved entries never appear; interest groups follow the fixed order', async () => {
  const { s, t } = await fresh();
  saveAll(s, t, belgrade.places.length);
  s.setSaved(t.id, 'food', 'cevapi', true);
  const g = groupByInterest(rowsOf(s, t));
  const order = ['free', 'ticket', 'check', 'gems', 'nature', 'food-dish', 'food-street', 'food-dessert', 'food-drink', 'missing'];
  assert.deepEqual(g.map((x) => x.id), order.filter((id) => g.some((x) => x.id === id)));
  assert.equal(g.reduce((n, x) => n + x.rows.length, 0), belgrade.places.length + 1);
});

test('planEntry / moveEntry: manual day plan, ordering and no cross-trip leakage', async () => {
  const { s, t } = await fresh();
  const other = s.createTrip({ name: 'Other', destination: 'Belgrade', type: 'city' }, { bagKinds: ['carry-on'] });
  saveAll(s, t, 3);
  const [a, b, c] = belgrade.places.slice(0, 3).map(ref);
  for (const r of [a, b, c]) assert.ok(s.planEntry(t.id, 'place', r, 2));
  const dayRows = () => groupByDay(rowsOf(s, t), 4)[2].rows.map((r) => r.entry.refId);
  assert.deepEqual(dayRows(), [a, b, c]);
  assert.equal(s.moveEntry(t.id, 'place', c, -1), true);
  assert.deepEqual(dayRows(), [a, c, b]);
  assert.equal(s.moveEntry(t.id, 'place', a, -1), false, 'cannot move past the start');
  assert.equal(s.moveEntry(t.id, 'place', b, 1), false, 'cannot move past the end');
  s.planEntry(t.id, 'place', a, 1);
  assert.deepEqual(dayRows(), [c, b]);
  s.planEntry(t.id, 'place', a, null);
  assert.equal(planned(rowsOf(s, t)), 2);
  assert.equal(s.planEntry(t.id, 'place', 'belgrade/not-saved', 1), null, 'only saved entries can be planned');
  assert.equal(s.planEntry(t.id, 'place', b, 99).day, null, 'an invalid day means unplanned');
  assert.equal(tripEntries(s.state, other.id).length, 0);
});

test('unsaving clears the day; a re-save does not resurrect a stale plan', async () => {
  const { s, t } = await fresh();
  const r = ref(belgrade.places[0]);
  s.setSaved(t.id, 'place', r, true); s.planEntry(t.id, 'place', r, 2); s.setTried(t.id, 'place', r, true);
  s.setSaved(t.id, 'place', r, false);
  assert.equal(tripEntries(s.state, t.id)[0].day, null);
  s.setSaved(t.id, 'place', r, true);
  assert.equal(tripEntries(s.state, t.id)[0].day, null);
});

test('draftPlan: only unplanned items, bounded days, keeps areas together, no times, never overwrites manual picks', async () => {
  const { s, t } = await fresh();
  saveAll(s, t, 8);
  s.setSaved(t.id, 'food', 'cevapi', true);
  s.setSaved(t.id, 'food', 'baklava', true);
  const first = ref(belgrade.places[0]);
  s.planEntry(t.id, 'place', first, 3);
  const rows = rowsOf(s, t);
  const draft = draftPlan(rows, 4);
  assert.ok(!draft.some((a) => a.refId === first), 'manual pick untouched');
  assert.equal(draft.length, 9);
  assert.ok(draft.every((a) => a.day >= 1 && a.day <= 4 && Number.isInteger(a.order)));
  const perDay = {};
  for (const a of draft.filter((x) => x.kind === 'place')) perDay[a.day] = (perDay[a.day] || 0) + 1;
  assert.ok(Math.max(...Object.values(perDay)) <= 3);
  assert.deepEqual(draftPlan(rows.map((r) => ({ ...r, entry: { ...r.entry, day: 1 } })), 4), [], 'nothing left to plan');
  assert.doesNotMatch(JSON.stringify(draft), /\d{1,2}:\d{2}|minutes?|hours?|km\b/i, 'no durations');
  // applying it is one write and can be undone exactly
  const before = s.setPlan(t.id, draft);
  assert.equal(planned(rowsOf(s, t)), 10);
  s.setPlan(t.id, before);
  assert.equal(planned(rowsOf(s, t)), 1);
  // orders within a day are unique after a draft on top of existing picks
  s.setPlan(t.id, draft);
  for (const g of groupByDay(rowsOf(s, t), 4)) assert.equal(new Set(g.rows.map((r) => r.entry.order)).size, g.rows.length);
});

test('packHints are optional, specific, deduplicated against the packing list and never touch it', async () => {
  const { s, t } = await fresh();
  const nature = CATALOG.destinations.flatMap((d) => d.places.map((p) => ({ d, p }))).find(({ p }) => p.kind === 'nature');
  s.setSaved(t.id, 'place', `${nature.d.id}/${nature.p.id}`, true);
  const items = () => s.state.items.filter((i) => i.tripId === t.id);
  const before = JSON.stringify(items());
  let hints = packHints(rowsOf(s, t), items());
  assert.ok(hints.find((x) => x.id === 'footwear') && hints.find((x) => x.id === 'water-bottle'));
  assert.equal(JSON.stringify(items()), before, 'computing hints changes nothing');
  assert.ok(hints.every((x) => x.add === null || (x.add.name && x.add.category)));
  // already packed → covered
  const own = packHints(rowsOf(s, t), [{ name: 'Hiking boots' }, { name: 'Water Bottle 1L' }]);
  assert.equal(own.find((x) => x.id === 'footwear').have, true);
  assert.equal(own.find((x) => x.id === 'water-bottle').have, true);
  // adding the suggested item dedupes it
  const add = hints.find((x) => x.id === 'footwear').add;
  s.addItem(t.id, { name: add.name, category: add.category, target: 1 });
  hints = packHints(rowsOf(s, t), items());
  assert.equal(hints.find((x) => x.id === 'footwear').have, true);
  // food alone suggests no packing; museum-only gives an entry-rules reminder, not an item
  const t2 = s.createTrip({ name: 'Food', destination: 'Belgrade', type: 'city' }, { bagKinds: ['carry-on'] });
  s.setSaved(t2.id, 'food', 'cevapi', true);
  assert.deepEqual(packHints(rowsOf(s, t2), []), []);
  const museum = belgrade.places.find((p) => p.kind === 'museum' && p.admission === 'paid');
  s.setSaved(t2.id, 'place', ref(museum), true);
  const h2 = packHints(rowsOf(s, t2), []);
  assert.deepEqual(h2.map((x) => x.id), ['entry']);
  assert.equal(h2[0].add, null);
  assert.doesNotMatch(JSON.stringify(h2), /[€$£]\s?\d|\b\d{1,2}:\d{2}\b/);
});

test('guideMessage: empty, hints, draft prompt, dismissible', () => {
  assert.match(guideMessage({ saved: 0, tripId: 't' }).text, /Nothing here yet/);
  const h = guideMessage({ saved: 2, planned: 0, hints: 2, tripId: 't' });
  assert.match(h.text, /2 optional packing ideas/);
  assert.match(guideMessage({ saved: 2, planned: 0, hints: 2, tripId: 't', dismissed: [h.id] }).text, /draft day plan/);
  assert.equal(guideMessage({ saved: 2, planned: 1, hints: 0, tripId: 't' }), null);
});

import { guideFilename, guideModel, guideToText } from '../../js/plan.js';
import { parseBackup } from '../../js/validate.js';

test('guide text export: by day when planned, by interest otherwise, honest footer, no invented specifics', async () => {
  const { s, t } = await fresh();
  s.setSaved(t.id, 'place', ref(belgrade.places[0]), true);
  s.setSaved(t.id, 'food', 'cevapi', true);
  s.setNote(t.id, 'food', 'cevapi', 'with\nonion');
  s.setTried(t.id, 'food', 'cevapi', true);
  const trip = s.state.trips.find((x) => x.id === t.id);
  let txt = guideToText(guideModel(trip, rowsOf(s, t), 4));
  assert.match(txt, /^PackWise — Belgrade — trip guide/);
  assert.match(txt, /FREE TO EXPLORE|CHECK ADMISSION FIRST|WORTH THE TICKET|HIDDEN GEMS/);
  assert.match(txt, /\[x\] Ćevapi \(Street Food & Snacks\) \[Food & drink\] — with onion/);
  assert.doesNotMatch(txt, /\bDay \d/);
  s.planEntry(t.id, 'place', ref(belgrade.places[0]), 2);
  txt = guideToText(guideModel(trip, rowsOf(s, t), 4));
  assert.match(txt, /\nDAY 2\n/);
  assert.match(txt, /NOT YET PLANNED/);
  assert.match(txt, /no times, routes or durations/);
  assert.match(txt, /Prices, opening hours and travel times are not included/);
  assert.doesNotMatch(txt, /[€$£]\s?\d|\b\d{1,2}:\d{2}\b/);
  assert.equal(guideFilename({ name: 'Zagreb — May 2027!' }), 'packwise-guide-zagreb-may-2027.txt');
  assert.equal(guideToText(guideModel(trip, [], 3)).includes('undefined'), false);
});

test('hidden packing ideas live on the trip: validated, in backups, copied by duplicate, resettable', async () => {
  const { s, t } = await fresh();
  s.setHintHidden(t.id, 'footwear', true);
  s.setHintHidden(t.id, 'footwear', true);
  s.setHintHidden(t.id, 'water-bottle', true);
  assert.deepEqual(s.state.trips[0].hiddenHints, ['footwear', 'water-bottle']);
  const backup = s.exportData();
  assert.deepEqual(backup.data.trips[0].hiddenHints, ['footwear', 'water-bottle']);
  assert.deepEqual(parseBackup(JSON.stringify(backup)).data.trips[0].hiddenHints, ['footwear', 'water-bottle']);
  const copy = s.duplicateTrip(t.id);
  assert.deepEqual(copy.hiddenHints, ['footwear', 'water-bottle']);
  s.setHintHidden(t.id, 'footwear', false);
  assert.deepEqual(s.state.trips.find((x) => x.id === t.id).hiddenHints, ['water-bottle']);
  s.resetHints(t.id);
  assert.deepEqual(s.state.trips.find((x) => x.id === t.id).hiddenHints, []);
  // junk from an old or hostile backup is dropped
  const dirty = JSON.parse(JSON.stringify(backup));
  dirty.data.trips[0].hiddenHints = ['ok-id', '<script>', 5, 'x'.repeat(99), 'ok-id'];
  assert.deepEqual(parseBackup(JSON.stringify(dirty)).data.trips[0].hiddenHints, ['ok-id']);
  // trips from before this field existed load with an empty list
  assert.deepEqual(parseBackup(JSON.stringify({ ...backup, data: { ...backup.data, trips: backup.data.trips.map(({ hiddenHints, ...rest }) => rest) } })).data.trips[0].hiddenHints, []);
});
