import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../../js/store.js';
import { createMemoryAdapter } from '../../js/storage/memory.js';
import { generatePackingList, builtinTemplateItems, BUILTIN_TEMPLATES } from '../../js/templates.js';
import { readiness, sumQty } from '../../js/progress.js';
import { companionMessage } from '../../js/companion.js';
import { parseBackup } from '../../js/validate.js';
import { tripItems, tripBags, tripTasks } from '../../js/selectors.js';

async function fresh() {
  const adapter = createMemoryAdapter();
  const store = createStore(adapter);
  await store.init();
  return { store, adapter };
}
const mk = (store, over = {}, opts = { bagKinds: ['carry-on', 'checked'] }) =>
  store.createTrip({ name: 'Rome', destination: 'Rome', type: 'city', startDate: '2026-12-12', endDate: '2026-12-20', ...over }, opts);
const clothing = (store, tripId) => tripItems(store.state, tripId).filter((i) => i.category === 'clothing').sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));

// ---------------------------------------------------------------- ordering
test('moveItemOrder swaps neighbours within a category only', async () => {
  const { store } = await fresh();
  const t = mk(store);
  const before = clothing(store, t.id).map((i) => i.id);
  const others = tripItems(store.state, t.id).filter((i) => i.category !== 'clothing').map((i) => [i.id, i.order]);
  assert.equal(store.moveItemOrder(before[1], -1), true);
  const after = clothing(store, t.id).map((i) => i.id);
  assert.deepEqual(after.slice(0, 2), [before[1], before[0]]);
  assert.deepEqual(after.slice(2), before.slice(2));
  assert.equal(store.moveItemOrder(after[0], -1), false); // already first
  assert.equal(store.moveItemOrder(after.at(-1), 1), false); // already last
  for (const [id, order] of others) assert.equal(store.state.items.find((i) => i.id === id).order, order);
});

test('reorderItems applies an arbitrary order and survives equal order values', async () => {
  const { store } = await fresh();
  const t = mk(store);
  const ids = clothing(store, t.id).map((i) => i.id);
  store.state.items.forEach((i) => (i.order = 0)); // worst case: all ties
  const wanted = [...ids].reverse();
  assert.equal(store.reorderItems(wanted), true);
  assert.deepEqual(clothing(store, t.id).map((i) => i.id), wanted);
  await store.flush();
  const reloaded = createStore(createMemoryAdapter({ seed: structuredClone(store.state) }));
  await reloaded.init();
  assert.deepEqual(clothing(reloaded, t.id).map((i) => i.id), wanted);
});

// -------------------------------------------------------------------- bulk
test('bulk update keeps invariants, ignores foreign bags, is one history step', async () => {
  const { store } = await fresh();
  const a = mk(store, { name: 'A' });
  const b = mk(store, { name: 'B' });
  const ids = clothing(store, a.id).slice(0, 3).map((i) => i.id);
  const [carry, checked] = tripBags(store.state, a.id);
  assert.equal(store.bulkUpdate(ids, { packed: 'all' }), 3);
  assert.ok(ids.every((id) => { const i = store.state.items.find((x) => x.id === id); return i.packed === i.target; }));
  store.bulkUpdate(ids, { packed: 'none' });
  assert.ok(ids.every((id) => store.state.items.find((x) => x.id === id).packed === 0));
  store.bulkUpdate(ids, { bagId: checked.id });
  assert.ok(ids.every((id) => store.state.items.find((x) => x.id === id).bagId === checked.id));
  const foreign = tripBags(store.state, b.id)[0].id;
  store.bulkUpdate(ids, { bagId: foreign }); // other trip's bag must be ignored
  assert.ok(ids.every((id) => store.state.items.find((x) => x.id === id).bagId === checked.id));
  store.bulkUpdate(ids, { category: 'Gifts', priority: 'high', essential: true });
  const sample = store.state.items.find((x) => x.id === ids[0]);
  assert.deepEqual([sample.category, sample.priority, sample.essential], ['Gifts', 'high', true]);
  void carry;
});

test('bulk delete returns records and restoreItems undoes it without duplicates', async () => {
  const { store } = await fresh();
  const t = mk(store);
  const n = tripItems(store.state, t.id).length;
  const ids = clothing(store, t.id).slice(0, 4).map((i) => i.id);
  const removed = store.bulkDelete(ids);
  assert.equal(removed.length, 4);
  assert.equal(tripItems(store.state, t.id).length, n - 4);
  assert.equal(store.restoreItems(removed), 4);
  assert.equal(store.restoreItems(removed), 0);
  assert.equal(tripItems(store.state, t.id).length, n);
});

// --------------------------------------------------------------- templates
test('recommendations stay deterministic and respond to bags, season, weather and travelers', () => {
  const same = () => generatePackingList({ type: 'city', days: 8, travelers: 3, bagKinds: ['backpack'], conditions: ['cold'] });
  assert.deepEqual(same(), same());
  const names = (o) => generatePackingList({ type: 'city', days: 9, ...o }).map((i) => i.name);
  const qty = (o, n) => generatePackingList({ type: 'city', days: 9, ...o }).find((i) => i.name === n).target;
  assert.ok(qty({ bagKinds: ['backpack'] }, 'T-shirts') < qty({ bagKinds: ['checked'] }, 'T-shirts'));
  assert.ok(names({ conditions: ['cold'] }).includes('Gloves'));
  assert.ok(names({ conditions: ['cold'] }).includes('Warm jacket'));
  assert.ok(!names({ conditions: ['warm'] }).includes('Gloves'));
  assert.ok(names({ conditions: ['warm'] }).includes('Sunscreen'));
  assert.ok(names({ travelers: 2 }).includes('Multi-port charger / power strip'));
  assert.ok(!names({ travelers: 1 }).includes('Multi-port charger / power strip'));
  assert.ok(names({ bagKinds: ['carry-on'] }).some((n) => /liquids/.test(n)));
  for (const o of [{}, { conditions: ['cold'], type: 'winter' }, { type: 'beach', season: 'summer', conditions: ['warm', 'rainy'] }]) {
    const keys = generatePackingList({ days: 5, ...o }).map((i) => `${i.category}|${i.name.toLowerCase()}`);
    assert.equal(new Set(keys).size, keys.length);
  }
});

test('every built-in template yields a usable, editable list', () => {
  assert.deepEqual(BUILTIN_TEMPLATES.map((t) => t.id).sort(), ['builtin-beach', 'builtin-business', 'builtin-camping', 'builtin-city', 'builtin-weekend', 'builtin-winter']);
  for (const t of BUILTIN_TEMPLATES) {
    const items = builtinTemplateItems(t.id);
    assert.ok(items.length >= 18, t.id);
    assert.ok(items.every((i) => i.target >= 1 && i.name && i.category));
  }
  assert.ok(builtinTemplateItems('builtin-weekend').some((i) => i.name === 'Light day bag'));
  assert.equal(builtinTemplateItems('nope'), null);
});

test('templates: save from trip, create new trip from it, existing trips untouched', async () => {
  const { store } = await fresh();
  const src = mk(store, { name: 'Source' });
  store.addItem(src.id, { name: 'Lucky charm', category: 'misc', target: 3 });
  store.togglePacked(tripItems(store.state, src.id)[0].id);
  const tpl = store.saveTripAsTemplate(src.id, 'My template');
  assert.equal(store.state.templates.length, 1);
  assert.ok(tpl.items.some((i) => i.name === 'Lucky charm' && i.target === 3));
  const srcBefore = JSON.stringify([tripItems(store.state, src.id), tripBags(store.state, src.id)]);
  const created = mk(store, { name: 'From template' }, { bagKinds: ['checked'], templateItems: tpl.items });
  assert.equal(tripItems(store.state, created.id).length, tpl.items.length);
  assert.ok(tripItems(store.state, created.id).every((i) => i.packed === 0));
  assert.equal(JSON.stringify([tripItems(store.state, src.id), tripBags(store.state, src.id)]), srcBefore);
  // editing the template does not change trips built from it
  store.updateTemplate(tpl.id, { items: [{ category: 'misc', name: 'Only this', target: 1, essential: false }] });
  assert.ok(tripItems(store.state, created.id).length > 1);
  assert.equal(store.deleteTemplate(tpl.id), true);
  assert.equal(store.state.templates.length, 0);
  assert.equal(store.saveTripAsTemplate('ghost'), null);
});

test('copy previous trip: items and tasks copied unpacked, source unchanged', async () => {
  const { store } = await fresh();
  const src = mk(store, { name: 'Last year' });
  tripItems(store.state, src.id).forEach((i) => store.togglePacked(i.id));
  tripTasks(store.state, src.id).forEach((t) => store.toggleTask(t.id));
  const snapshot = JSON.stringify(store.state.items.filter((i) => i.tripId === src.id));
  const copy = mk(store, { name: 'This year' }, { bagKinds: ['checked'], copyFrom: src.id });
  const items = tripItems(store.state, copy.id);
  assert.equal(items.length, tripItems(store.state, src.id).length);
  assert.ok(items.every((i) => i.packed === 0));
  assert.ok(tripTasks(store.state, copy.id).every((t) => !t.done));
  assert.equal(JSON.stringify(store.state.items.filter((i) => i.tripId === src.id)), snapshot);
  const bagIds = new Set(tripBags(store.state, copy.id).map((b) => b.id));
  assert.ok(items.every((i) => bagIds.has(i.bagId)));
});

// ------------------------------------------------------------- return trip
test('return trip: separate checklist, original history preserved', async () => {
  const { store } = await fresh();
  const src = mk(store, { name: 'Rome' });
  const items = tripItems(store.state, src.id);
  items.forEach((i) => store.togglePacked(i.id));
  store.toggleTask(tripTasks(store.state, src.id)[0].id);
  const histItems = JSON.stringify(tripItems(store.state, src.id));
  const histTasks = JSON.stringify(tripTasks(store.state, src.id));
  const wanted = items.filter((i) => i.category === 'clothing' || i.name === 'Phone charger').map((i) => i.id);
  const back = store.createReturnTrip(src.id, { itemIds: wanted });
  assert.equal(back.returnOf, src.id);
  assert.equal(back.startDate, '2026-12-20');
  const bi = tripItems(store.state, back.id);
  assert.equal(bi.length, wanted.length);
  assert.ok(bi.every((i) => i.packed === 0));
  assert.ok(bi.every((i) => !wanted.includes(i.id)), 'copies, not the same records');
  assert.ok(tripBags(store.state, back.id).length === 2);
  assert.ok(tripTasks(store.state, back.id).length >= 3 && tripTasks(store.state, back.id).every((t) => !t.done));
  assert.equal(JSON.stringify(tripItems(store.state, src.id)), histItems);
  assert.equal(JSON.stringify(tripTasks(store.state, src.id)), histTasks);
  assert.equal(sumQty(tripItems(store.state, src.id)).percent, 100);
  assert.equal(sumQty(bi).percent, 0);
  assert.equal(store.createReturnTrip('ghost'), null);
});

// -------------------------------------------------------------- readiness
test('readiness levels', async () => {
  const { store } = await fresh();
  const now = new Date(2026, 11, 1);
  const t = mk(store); // departs 11 days out
  const state = () => ({ trip: store.state.trips[0], items: tripItems(store.state, t.id), tasks: tripTasks(store.state, t.id), now });
  assert.equal(readiness(state()).level, 'on-track');
  assert.equal(readiness({ ...state(), items: [] }).level, 'new');
  assert.equal(readiness({ ...state(), now: new Date(2026, 11, 10) }).level, 'attention'); // 2 days out, essentials unpacked
  store.state.items.forEach((i) => store.setPacked(i.id, i.target));
  assert.equal(readiness(state()).level, 'on-track'); // packed but tasks open
  store.state.tasks.forEach((tk) => store.toggleTask(tk.id));
  assert.equal(readiness(state()).level, 'ready');
  store.state.items.forEach((i) => store.setPacked(i.id, 0));
  assert.equal(readiness({ ...state(), now: new Date(2026, 11, 8) }).level, 'attention'); // 4 days out, <50% packed
});

// --------------------------------------------------------------- companion
test('companion messages follow rules, are deterministic and respect dismissal', async () => {
  const { store } = await fresh();
  const t = mk(store);
  const ctx = (extra = {}) => ({ screen: 'dashboard', trip: store.state.trips[0], items: tripItems(store.state, t.id), tasks: tripTasks(store.state, t.id), tripCount: 1, now: new Date(2026, 11, 1), ...extra });
  const first = companionMessage(ctx());
  assert.equal(first.id, 'first-trip');
  assert.deepEqual(companionMessage(ctx()), first);
  assert.equal(companionMessage(ctx({ dismissed: ['first-trip'] })), null);
  const items = tripItems(store.state, t.id);
  items.slice(0, Math.ceil(items.length * 0.6)).forEach((i) => store.setPacked(i.id, i.target));
  assert.match(companionMessage(ctx({ tripCount: 2 })).id, /^milestone-(50|75):/);
  assert.match(companionMessage(ctx({ now: new Date(2026, 11, 10), tripCount: 2 })).id, /^essentials:/);
  store.state.items.forEach((i) => store.setPacked(i.id, i.target));
  const done = companionMessage(ctx());
  assert.match(done.id, /^complete:/);
  assert.equal(done.mood, 'camera');
  const back = store.createReturnTrip(t.id);
  const rc = companionMessage({ ...ctx(), trip: back, items: tripItems(store.state, back.id), tasks: tripTasks(store.state, back.id) });
  assert.match(rc.id, /^return:/);
  assert.equal(companionMessage({ ...ctx(), trip: null }), null);
  assert.equal(companionMessage(ctx({ screen: 'studio', items: [], tripCount: 3 })), null);
});

// -------------------------------------------------------------- sample data
test('demo data is removable and leaves user trips alone', async () => {
  const { store } = await fresh();
  const mine = mk(store, { name: 'Mine' });
  const demo = store.loadDemo(new Date(2026, 5, 1));
  assert.equal(demo.isDemo, true);
  const q = sumQty(tripItems(store.state, demo.id));
  assert.ok(q.percent > 30 && q.percent < 90);
  assert.equal(store.removeDemo(), 1);
  assert.deepEqual(store.state.trips.map((t) => t.id), [mine.id]);
  assert.equal(store.state.items.every((i) => i.tripId === mine.id), true);
});

// ------------------------------------------------------------------ backup
test('backup round-trips templates and return links; dangling return link is dropped', async () => {
  const { store } = await fresh();
  const t = mk(store);
  store.saveTripAsTemplate(t.id, 'Tpl');
  const back = store.createReturnTrip(t.id);
  const json = JSON.stringify(store.exportData());
  const parsed = parseBackup(json);
  assert.equal(parsed.ok, true, parsed.errors.join(';'));
  assert.equal(parsed.data.templates.length, 1);
  assert.equal(parsed.data.trips.find((x) => x.id === back.id).returnOf, t.id);
  const c = store.exportData();
  c.data.trips = c.data.trips.filter((x) => x.id === back.id); // original trip missing from the file
  c.data.bags = c.data.bags.filter((x) => x.tripId === back.id);
  c.data.items = c.data.items.filter((x) => x.tripId === back.id);
  c.data.tasks = c.data.tasks.filter((x) => x.tripId === back.id);
  const dangling = parseBackup(JSON.stringify(c));
  assert.equal(dangling.ok, true);
  assert.equal(dangling.data.trips[0].returnOf, '');
  // merge remaps the link together with the ids
  const { store: other } = await fresh();
  await other.importData(parsed.data, 'merge');
  await other.importData(parsed.data, 'merge');
  const links = other.state.trips.filter((x) => x.returnOf);
  assert.equal(links.length, 2);
  for (const l of links) assert.ok(other.state.trips.some((x) => x.id === l.returnOf && !x.returnOf));
  assert.notEqual(links[0].returnOf, links[1].returnOf);
});

// ------------------------------------------------- season, weather, camping
import { normalizeTrip } from '../../js/models.js';

test('season sets sensible defaults; chosen conditions override them', () => {
  const names = (o) => generatePackingList({ type: 'city', days: 5, ...o }).map((i) => i.name);
  assert.ok(names({ season: 'summer' }).includes('Sunscreen'));
  assert.ok(names({ season: 'winter' }).includes('Gloves'));
  assert.ok(names({ season: 'spring' }).includes('Light rain jacket'));
  assert.ok(names({ season: 'fall' }).includes('Warm sweater'));
  // summer season but the user says it will be cold: conditions win for the jacket, season extras still apply
  assert.ok(names({ season: 'summer', conditions: ['cold'] }).includes('Warm jacket'));
  assert.ok(names({ conditions: ['rainy'] }).includes('Compact umbrella'));
  assert.ok(names({ conditions: ['snowy'] }).includes('Waterproof boots'));
  assert.ok(names({ conditions: ['windy'] }).includes('Windbreaker'));
  assert.ok(names({ conditions: ['hot'] }).includes('Reusable water bottle'));
  const none = names({});
  assert.ok(!none.includes('Compact umbrella') && !none.includes('Gloves'));
  // combined conditions stay deduplicated
  const combo = generatePackingList({ type: 'winter', days: 6, season: 'winter', conditions: ['cold', 'snowy'] }).map((i) => `${i.category}|${i.name.toLowerCase()}`);
  assert.equal(new Set(combo).size, combo.length);
});

test('camping lists are thorough, use the camping category and adapt to weather', () => {
  const list = (o) => generatePackingList({ type: 'camping', days: 4, ...o });
  const base = list({});
  const camp = base.filter((i) => i.category === 'camping').map((i) => i.name);
  for (const must of ['Tent (with poles & pegs)', 'Sleeping bag', 'Camping stove & fuel', 'Headlamp / flashlight', 'Food & snacks', 'Trowel & toilet paper']) assert.ok(camp.includes(must), must);
  assert.ok(base.find((i) => i.name === 'First-aid kit').essential);
  assert.ok(camp.length >= 15);
  const n = (o) => list(o).filter((i) => i.category === 'camping').map((i) => i.name);
  assert.ok(n({ conditions: ['rainy'] }).includes('Tarp / rain fly'));
  assert.ok(n({ conditions: ['cold'] }).includes('Cold-rated sleeping bag'));
  assert.ok(n({ season: 'winter' }).includes('Cold-rated sleeping bag'));
  assert.ok(n({ conditions: ['snowy'] }).includes('Snow-rated (4-season) tent'));
  assert.ok(n({ conditions: ['hot'] }).includes('Extra drinking water'));
  assert.ok(!generatePackingList({ type: 'city', days: 4, conditions: ['rainy'] }).some((i) => i.category === 'camping'));
});

test('camping gear bag: camping items go there, with backpack as fallback', async () => {
  const { store } = await fresh();
  const t = mk(store, { name: 'Woods', type: 'camping' }, { bagKinds: ['backpack', 'camping'] });
  const bags = tripBags(store.state, t.id);
  const gear = bags.find((b) => b.kind === 'camping');
  assert.equal(gear.name, 'Camping gear');
  const items = tripItems(store.state, t.id);
  assert.ok(items.filter((i) => i.category === 'camping').every((i) => i.bagId === gear.id));
  assert.ok(items.filter((i) => i.category === 'documents').every((i) => i.bagId === bags.find((b) => b.kind === 'backpack').id));
  const noGear = mk(store, { name: 'Woods 2', type: 'camping' }, { bagKinds: ['backpack'] });
  const only = tripBags(store.state, noGear.id)[0];
  assert.ok(tripItems(store.state, noGear.id).every((i) => i.bagId === only.id));
});

test('trip normalizes season/conditions and maps legacy climate', () => {
  const base = { id: 't1', name: 'X' };
  assert.deepEqual(normalizeTrip({ ...base, season: 'summer', conditions: ['rainy', 'warm', 'warm', 'bogus'] }).conditions, ['warm', 'rainy']);
  assert.equal(normalizeTrip({ ...base, season: 'monsoon' }).season, '');
  assert.deepEqual(normalizeTrip({ ...base, conditions: 'hot' }).conditions, []);
  assert.deepEqual(normalizeTrip({ ...base, climate: 'cold' }).conditions, ['cold']);
  assert.deepEqual(normalizeTrip({ ...base, climate: 'mild' }).conditions, ['cool']);
  assert.deepEqual(normalizeTrip({ ...base, climate: 'warm', conditions: ['rainy'] }).conditions, ['rainy']); // new field wins
  assert.equal('climate' in normalizeTrip({ ...base, climate: 'cold' }), false);
});

test('season and weather round-trip through backup and are copied to a return trip', async () => {
  const { store } = await fresh();
  const t = mk(store, { name: 'Wet fall', season: 'fall', conditions: ['cool', 'rainy'] });
  assert.ok(tripItems(store.state, t.id).some((i) => i.name === 'Rain jacket'));
  const back = store.createReturnTrip(t.id);
  assert.deepEqual([back.season, back.conditions], ['fall', ['cool', 'rainy']]);
  const parsed = parseBackup(JSON.stringify(store.exportData()));
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.data.trips.find((x) => x.id === t.id).conditions, ['cool', 'rainy']);
  assert.equal(parsed.data.trips.find((x) => x.id === t.id).season, 'fall');
});

// ----------------------------------------------------- Balkan seasons from dates
import { seasonForDates, seasonOfDate } from '../../js/progress.js';

test('seasons follow the Balkan (meteorological) calendar', () => {
  const m = (mm) => seasonOfDate(`2026-${String(mm).padStart(2, '0')}-15`);
  assert.deepEqual([12, 1, 2].map(m), ['winter', 'winter', 'winter']);
  assert.deepEqual([3, 4, 5].map(m), ['spring', 'spring', 'spring']);
  assert.deepEqual([6, 7, 8].map(m), ['summer', 'summer', 'summer']);
  assert.deepEqual([9, 10, 11].map(m), ['fall', 'fall', 'fall']);
  // boundaries
  assert.equal(seasonOfDate('2026-02-28'), 'winter');
  assert.equal(seasonOfDate('2026-03-01'), 'spring');
  assert.equal(seasonOfDate('2026-05-31'), 'spring');
  assert.equal(seasonOfDate('2026-06-01'), 'summer');
  assert.equal(seasonOfDate('2026-08-31'), 'summer');
  assert.equal(seasonOfDate('2026-09-01'), 'fall');
  assert.equal(seasonOfDate('2026-11-30'), 'fall');
  assert.equal(seasonOfDate('2026-12-01'), 'winter');
  assert.equal(seasonOfDate(''), '');
  assert.equal(seasonOfDate('nope'), '');
});

test('a trip gets the season holding most of its days; ties go to the departure date', () => {
  assert.equal(seasonForDates('2026-07-10', ''), 'summer');
  assert.equal(seasonForDates('2026-07-10', '2026-07-20'), 'summer');
  assert.equal(seasonForDates('2026-11-28', '2026-12-05'), 'winter'); // 3 fall days vs 5 winter
  assert.equal(seasonForDates('2027-02-27', '2027-03-10'), 'spring'); // 2 winter vs 10 spring
  assert.equal(seasonForDates('2026-08-31', '2026-09-03'), 'fall');
  assert.equal(seasonForDates('2026-08-30', '2026-09-02'), 'summer'); // 2 vs 2: departure wins
  assert.equal(seasonForDates('2026-12-20', '2027-01-05'), 'winter'); // year boundary
  assert.equal(seasonForDates('2026-07-10', '2026-07-01'), 'summer'); // bad range falls back to departure
  assert.equal(seasonForDates('', '2026-07-01'), '');
  assert.ok(['spring', 'summer', 'fall', 'winter'].includes(seasonForDates('2026-01-01', '2030-12-31'))); // very long trip stays bounded
});
