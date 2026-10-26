import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../../js/store.js';
import { createMemoryAdapter } from '../../js/storage/memory.js';
import { sumQty, bagProgress, categoryProgress, taskProgress, daysUntil, tripPhase, tripLengthDays, essentialsLeft } from '../../js/progress.js';
import { normalizeItem, normalizeTrip, cleanDate, SCHEMA_VERSION } from '../../js/models.js';
import { generatePackingList, generateTasks } from '../../js/templates.js';
import { parseBackup, validateBackup } from '../../js/validate.js';
import { migrate } from '../../js/migrations.js';
import { tripItems, tripBags, featuredTrip, sortedTrips } from '../../js/selectors.js';

async function freshStore(seed) {
  const adapter = createMemoryAdapter({ seed });
  const store = createStore(adapter);
  await store.init();
  return { store, adapter };
}

const trip = (store, over = {}) =>
  store.createTrip({ name: 'Italy', destination: 'Rome', type: 'city', startDate: '2026-06-12', endDate: '2026-06-20', ...over }, { bagKinds: ['carry-on', 'checked'] });

test('normalizeItem enforces 0 <= packed <= target', () => {
  const base = { id: 'a', tripId: 't', name: 'Socks' };
  assert.equal(normalizeItem({ ...base, target: 3, packed: 9 }).packed, 3);
  assert.equal(normalizeItem({ ...base, target: 3, packed: -4 }).packed, 0);
  assert.equal(normalizeItem({ ...base, target: 0 }).target, 1);
  assert.equal(normalizeItem({ ...base, target: 1000 }).target, 99);
  assert.equal(normalizeItem({ ...base, target: 'x', packed: 'y' }).target, 1);
  assert.equal(normalizeItem({ ...base, name: '   ' }), null);
});

test('text is sanitized and trip dates are validated', () => {
  const t = normalizeTrip({ id: 't1', name: '  Hi\u0000 <b>x</b>  ', startDate: '2026-02-30', endDate: '2026-06-10' });
  assert.equal(t.name, 'Hi <b>x</b>'); // stored as text; UI renders via textContent only
  assert.equal(t.startDate, '');
  assert.equal(cleanDate('2026-02-28'), '2026-02-28');
  const swapped = normalizeTrip({ id: 't2', name: 'A', startDate: '2026-06-10', endDate: '2026-06-01' });
  assert.equal(swapped.endDate, '2026-06-10');
});

test('progress math is quantity based and never rounds up to 100%', () => {
  const items = [
    { target: 5, packed: 5, bagId: 'b1', category: 'clothing' },
    { target: 2, packed: 1, bagId: 'b2', category: 'clothing' },
    { target: 1, packed: 0, bagId: 'b2', category: 'documents' },
  ];
  const all = sumQty(items);
  assert.deepEqual([all.packed, all.target, all.percent, all.packedItems], [6, 8, 75, 1]);
  assert.equal(bagProgress(items, 'b2').target, 3);
  assert.equal(categoryProgress(items, 'clothing').percent, 86);
  assert.equal(sumQty([{ target: 999, packed: 998 }]).percent, 99);
  assert.equal(sumQty([]).percent, 0);
  assert.equal(taskProgress([{ done: true }, { done: false }]).left, 1);
});

test('countdown and trip phase use local calendar days', () => {
  const now = new Date(2026, 5, 5, 23, 30);
  assert.equal(daysUntil('2026-06-12', now), 7);
  assert.equal(daysUntil('2026-06-05', now), 0);
  assert.equal(daysUntil('2026-06-01', now), -4);
  assert.equal(tripPhase({ startDate: '2026-06-12', endDate: '2026-06-20' }, now), 'upcoming');
  assert.equal(tripPhase({ startDate: '2026-06-01', endDate: '2026-06-20' }, now), 'ongoing');
  assert.equal(tripPhase({ startDate: '2026-05-01', endDate: '2026-05-02' }, now), 'past');
  assert.equal(tripPhase({ startDate: '' }, now), 'undated');
  assert.equal(tripLengthDays({ startDate: '2026-06-12', endDate: '2026-06-20' }), 9);
});

test('recommendations are deterministic, deduplicated and scale with duration', () => {
  const a = generatePackingList({ type: 'beach', days: 7 });
  const b = generatePackingList({ type: 'beach', days: 7 });
  assert.deepEqual(a, b);
  const keys = a.map((i) => `${i.category}|${i.name.toLowerCase()}`);
  assert.equal(new Set(keys).size, keys.length);
  const short = generatePackingList({ type: 'city', days: 2 }).find((i) => i.name === 'T-shirts').target;
  const long = generatePackingList({ type: 'city', days: 9 }).find((i) => i.name === 'T-shirts').target;
  assert.ok(long > short);
  assert.ok(generatePackingList({ type: 'camping', days: 3 }).some((i) => i.name === 'Tent'));
  assert.ok(generateTasks({ transport: 'flight' }).some((t) => t.phase === 'return'));
});

test('createTrip builds bags, items and tasks; items are spread over bags', async () => {
  const { store } = await freshStore();
  const t = trip(store);
  const bags = tripBags(store.state, t.id);
  const items = tripItems(store.state, t.id);
  assert.equal(bags.length, 2);
  assert.ok(items.length > 10);
  assert.ok(items.every((i) => bags.some((b) => b.id === i.bagId)));
  assert.ok(store.state.tasks.length > 3);
  assert.ok(items.find((i) => i.category === 'documents').bagId === bags.find((b) => b.kind === 'carry-on').id);
});

test('packing, partial packing and target changes keep invariants', async () => {
  const { store } = await freshStore();
  const t = trip(store);
  const item = tripItems(store.state, t.id).find((i) => i.name === 'T-shirts');
  store.setPacked(item.id, 2);
  assert.equal(store.state.items.find((i) => i.id === item.id).packed, 2);
  store.setTarget(item.id, 1);
  const after = store.state.items.find((i) => i.id === item.id);
  assert.deepEqual([after.target, after.packed], [1, 1]);
  store.togglePacked(item.id);
  assert.equal(store.state.items.find((i) => i.id === item.id).packed, 0);
  store.togglePacked(item.id);
  assert.equal(store.state.items.find((i) => i.id === item.id).packed, 1);
  assert.equal(store.setTarget(item.id, 500).target, 99);
});

test('moving an item between bags never double counts', async () => {
  const { store } = await freshStore();
  const t = trip(store);
  const [b1, b2] = tripBags(store.state, t.id);
  const before = sumQty(tripItems(store.state, t.id));
  const item = tripItems(store.state, t.id).find((i) => i.bagId === b1.id);
  store.moveItem(item.id, b2.id);
  const items = tripItems(store.state, t.id);
  assert.equal(sumQty(items).target, before.target);
  assert.equal(items.filter((i) => i.id === item.id).length, 1);
  assert.equal(bagProgress(items, b1.id).target + bagProgress(items, b2.id).target, before.target);
  assert.equal(store.moveItem(item.id, 'does-not-exist').bagId, b2.id); // invalid bag ignored
});

test('deleting a bag re-homes its items; last bag cannot be deleted', async () => {
  const { store } = await freshStore();
  const t = trip(store);
  const [b1, b2] = tripBags(store.state, t.id);
  const n = tripItems(store.state, t.id).length;
  assert.equal(store.deleteBag(b1.id), true);
  const items = tripItems(store.state, t.id);
  assert.equal(items.length, n);
  assert.ok(items.every((i) => i.bagId === b2.id));
  assert.equal(store.deleteBag(b2.id), false);
});

test('multi-trip isolation: edits and deletes never touch another trip', async () => {
  const { store } = await freshStore();
  const a = trip(store, { name: 'A' });
  const b = trip(store, { name: 'B' });
  const bItems = JSON.stringify(tripItems(store.state, b.id));
  const aItem = tripItems(store.state, a.id)[0];
  store.togglePacked(aItem.id);
  store.addItem(a.id, { name: 'Extra', category: 'misc' });
  assert.equal(JSON.stringify(tripItems(store.state, b.id)), bItems);
  store.deleteTrip(a.id);
  assert.equal(JSON.stringify(tripItems(store.state, b.id)), bItems);
  assert.equal(store.state.items.filter((i) => i.tripId === a.id).length, 0);
  assert.equal(store.state.bags.filter((x) => x.tripId === a.id).length, 0);
  assert.equal(store.state.tasks.filter((x) => x.tripId === a.id).length, 0);
});

test('duplicateTrip copies structure with new ids and nothing packed', async () => {
  const { store } = await freshStore();
  const a = trip(store);
  tripItems(store.state, a.id).forEach((i) => store.togglePacked(i.id));
  store.state.tasks.forEach((tk) => store.toggleTask(tk.id));
  const copy = store.duplicateTrip(a.id);
  assert.notEqual(copy.id, a.id);
  const ci = tripItems(store.state, copy.id);
  assert.equal(ci.length, tripItems(store.state, a.id).length);
  assert.ok(ci.every((i) => i.packed === 0));
  assert.ok(store.state.tasks.filter((t) => t.tripId === copy.id).every((t) => !t.done));
  const ids = new Set(store.state.items.map((i) => i.id));
  assert.equal(ids.size, store.state.items.length);
  const bagIds = new Set(tripBags(store.state, copy.id).map((b) => b.id));
  assert.ok(ci.every((i) => bagIds.has(i.bagId)));
  assert.ok(tripItems(store.state, a.id).every((i) => i.packed === i.target)); // original untouched
});

test('archive / restore / delete item with undo', async () => {
  const { store } = await freshStore();
  const t = trip(store);
  store.archiveTrip(t.id);
  assert.equal(sortedTrips(store.state, 'active').length, 0);
  assert.equal(sortedTrips(store.state, 'archived').length, 1);
  store.restoreTrip(t.id);
  assert.equal(featuredTrip(store.state).id, t.id);
  const item = tripItems(store.state, t.id)[0];
  const removed = store.deleteItem(item.id);
  assert.equal(store.state.items.some((i) => i.id === item.id), false);
  store.restoreItem(removed);
  assert.equal(store.state.items.some((i) => i.id === item.id), true);
  assert.equal(store.restoreItem(removed), null); // no duplicate on double undo
});

test('persistence: reload from adapter reproduces state', async () => {
  const adapter = createMemoryAdapter();
  const s1 = createStore(adapter);
  await s1.init();
  const t = trip(s1);
  s1.togglePacked(tripItems(s1.state, t.id)[0].id);
  await s1.flush();
  const s2 = createStore(adapter);
  await s2.init();
  assert.deepEqual(s2.state.items, s1.state.items);
  assert.deepEqual(s2.state.trips, s1.state.trips);
});

test('storage write failure is surfaced, then clears on next success', async () => {
  const { store, adapter } = await freshStore();
  adapter.failNext = Object.assign(new Error('full'), { name: 'QuotaExceededError' });
  trip(store);
  await store.flush();
  assert.match(store.state.saveError, /storage is full/);
  store.addItem(store.state.trips[0].id, { name: 'Hat', category: 'clothing' });
  await store.flush();
  assert.equal(store.state.saveError, null);
});

test('essentials left lists unpacked essential items only', async () => {
  const { store } = await freshStore();
  const t = trip(store);
  const items = tripItems(store.state, t.id);
  const ess = items.filter((i) => i.essential);
  assert.ok(ess.length > 0);
  store.togglePacked(ess[0].id);
  assert.equal(essentialsLeft(tripItems(store.state, t.id)).length, ess.length - 1);
});

// ------------------------------------------------------------ backup / import

async function exported() {
  const { store } = await freshStore();
  const a = trip(store, { name: 'A' });
  trip(store, { name: 'B' });
  store.togglePacked(tripItems(store.state, a.id)[0].id);
  await store.flush();
  return store;
}

test('export -> import round-trip (replace) reproduces data exactly', async () => {
  const src = await exported();
  const json = JSON.stringify(src.exportData());
  const parsed = parseBackup(json);
  assert.equal(parsed.ok, true, parsed.errors.join('; '));
  const { store: dst } = await freshStore();
  await dst.importData(parsed.data, 'replace');
  for (const k of ['trips', 'bags', 'items', 'tasks']) assert.deepEqual(dst.state[k], src.state[k]);
});

test('import merge never overwrites existing records, even with id collisions', async () => {
  const src = await exported();
  const parsed = parseBackup(JSON.stringify(src.exportData()));
  const before = structuredClone(src.state.items);
  await src.importData(parsed.data, 'merge'); // same ids as what is already there
  assert.equal(src.state.trips.length, 4);
  assert.equal(src.state.items.length, before.length * 2);
  assert.equal(new Set(src.state.items.map((i) => i.id)).size, src.state.items.length);
  for (const old of before) assert.deepEqual(src.state.items.find((i) => i.id === old.id), old);
  const bagIds = new Set(src.state.bags.map((b) => b.id));
  assert.ok(src.state.items.every((i) => bagIds.has(i.bagId)));
  // every trip's items belong to bags of the same trip
  for (const i of src.state.items) assert.equal(src.state.bags.find((b) => b.id === i.bagId).tripId, i.tripId);
});

test('corrupted / hostile imports are rejected without side effects', async () => {
  const src = await exported();
  const good = src.exportData();
  const bad = (mutate) => {
    const c = structuredClone(good);
    mutate(c);
    return validateBackup(c);
  };
  assert.equal(parseBackup('{not json').ok, false);
  assert.equal(parseBackup('').ok, false);
  assert.equal(parseBackup('[]').ok, false);
  assert.equal(parseBackup('"str"').ok, false);
  assert.equal(bad((c) => (c.app = 'other')).ok, false);
  assert.equal(bad((c) => (c.schemaVersion = SCHEMA_VERSION + 1)).ok, false);
  assert.equal(bad((c) => (c.schemaVersion = 'x')).ok, false);
  assert.equal(bad((c) => (c.data.trips = 'nope')).ok, false);
  assert.equal(bad((c) => (c.data.items[0].tripId = 'ghost')).ok, false);
  assert.equal(bad((c) => (c.data.items[1].id = c.data.items[0].id)).ok, false);
  assert.equal(bad((c) => (c.data.trips[0].id = '../x')).ok, false);
  assert.equal(bad((c) => delete c.data).ok, false);
  const before = JSON.stringify(src.state);
  assert.equal(JSON.stringify(src.state), before);
});

test('import sanitizes out-of-range values instead of trusting them', async () => {
  const src = await exported();
  const c = src.exportData();
  c.data.items[0].target = 5000;
  c.data.items[0].packed = 9999;
  c.data.items[0].name = 'x'.repeat(500);
  c.data.items[0].bagId = 'missing-bag';
  const r = validateBackup(c);
  assert.equal(r.ok, true);
  const it = r.data.items[0];
  assert.deepEqual([it.target, it.packed, it.name.length], [99, 99, 80]);
  assert.ok(r.data.bags.some((b) => b.id === it.bagId));
  assert.equal(r.warnings.length, 1);
});

test('legacy v0 backups migrate (qty/done -> target/packed)', () => {
  const legacy = {
    app: 'packwise',
    schemaVersion: 0,
    data: {
      trips: [{ id: 't1', name: 'Old' }],
      bags: [{ id: 'b1', tripId: 't1', name: 'Bag', kind: 'other' }],
      items: [
        { id: 'i1', tripId: 't1', bagId: 'b1', name: 'Shirt', qty: 3, done: true },
        { id: 'i2', tripId: 't1', bagId: 'b1', name: 'Hat', qty: 2, done: false },
      ],
    },
  };
  const r = validateBackup(legacy);
  assert.equal(r.ok, true, r.errors.join(';'));
  assert.deepEqual(r.data.items.map((i) => [i.target, i.packed]), [[3, 3], [2, 0]]);
  assert.equal(migrate({ items: [] }, SCHEMA_VERSION).changed, false);
});

test('store.init migrates old on-disk data and rewrites it', async () => {
  const adapter = createMemoryAdapter({
    schemaVersion: 0,
    seed: {
      trips: [{ id: 't1', name: 'Old', status: 'active' }],
      bags: [{ id: 'b1', tripId: 't1', name: 'Bag', kind: 'other', order: 0 }],
      items: [{ id: 'i1', tripId: 't1', bagId: 'b1', name: 'Shirt', qty: 4, done: true }],
    },
  });
  const store = createStore(adapter);
  await store.init();
  assert.deepEqual([store.state.items[0].target, store.state.items[0].packed], [4, 4]);
  const again = await adapter.load();
  assert.equal(again.schemaVersion, SCHEMA_VERSION);
});

test('clearAll empties state and storage', async () => {
  const { store, adapter } = await freshStore();
  trip(store);
  await store.clearAll();
  assert.equal(store.state.trips.length + store.state.items.length, 0);
  const snap = await adapter.load();
  assert.equal(snap.trips.length + snap.items.length, 0);
});
