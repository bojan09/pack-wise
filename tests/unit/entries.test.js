import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../../js/store.js';
import { createMemoryAdapter } from '../../js/storage/memory.js';
import { SCHEMA_VERSION, normalizeEntry, entryId } from '../../js/models.js';
import { parseBackup, validateBackup } from '../../js/validate.js';
import { migrate } from '../../js/migrations.js';
import { exploreMessage } from '../../js/companion.js';
import { tripEntries } from '../../js/selectors.js';

const fresh = async (opts) => { const a = createMemoryAdapter(opts); const s = createStore(a); await s.init(); return { store: s, adapter: a }; };
const mk = (s, name = 'Belgrade') => s.createTrip({ name, destination: name, type: 'city' }, { bagKinds: ['carry-on'] });

test('schema is v2 and v1 data migrates with empty entries', () => {
  assert.equal(SCHEMA_VERSION, 7);
  const r = migrate({ trips: [] }, 1);
  assert.deepEqual([r.from, r.to, r.changed, r.data.entries], [1, 7, true, []]);
  assert.deepEqual([migrate({ trips: [], entries: [] }, 2).from, migrate({ trips: [], entries: [] }, 2).to], [2, 7]);
  assert.deepEqual(migrate({ trips: [], entries: [{ id: 'x' }] }, 1).data.entries, [{ id: 'x' }]); // never drops existing
});

test('entry normalization: deterministic id, bounds, sanitizing', () => {
  const e = normalizeEntry({ tripId: 't1', kind: 'place', refId: 'belgrade/kalemegdan-park-fortress', saved: true, note: 'x'.repeat(999), day: 99, order: 'NaN' });
  assert.equal(e.id, entryId('t1', 'place', 'belgrade/kalemegdan-park-fortress'));
  assert.equal(e.note.length, 300);
  assert.equal(e.day, null);
  assert.equal(e.order, 0);
  assert.equal(normalizeEntry({ tripId: 't1', kind: 'nope', refId: 'a/b' }), null);
  assert.equal(normalizeEntry({ tripId: '../x', kind: 'place', refId: 'a/b' }), null);
  assert.equal(normalizeEntry({ tripId: 't1', kind: 'place', refId: 'A B' }), null);
  assert.equal(normalizeEntry({ tripId: 't1', kind: 'place', refId: '' }), null);
  assert.equal(normalizeEntry({ tripId: 't1', kind: 'place', refId: 'a/b', saved: 'yes' }).saved, false); // only real booleans
});

test('setSaved: toggles, never duplicates, trip-isolated, persisted', async () => {
  const { store, adapter } = await fresh();
  const a = mk(store, 'A');
  const b = mk(store, 'B');
  assert.equal(store.setSaved(a.id, 'place', 'belgrade/knez-mihailova-street', true), true);
  assert.equal(store.setSaved(a.id, 'place', 'belgrade/knez-mihailova-street', true), true); // idempotent
  assert.equal(tripEntries(store.state, a.id).length, 1);
  assert.equal(tripEntries(store.state, b.id).length, 0);
  assert.equal(store.isSaved(a.id, 'place', 'belgrade/knez-mihailova-street'), true);
  assert.equal(store.isSaved(b.id, 'place', 'belgrade/knez-mihailova-street'), false);
  await store.flush();
  assert.equal((await adapter.load()).entries.length, 1);
  assert.equal(store.setSaved(a.id, 'place', 'belgrade/knez-mihailova-street', false), false);
  assert.equal(tripEntries(store.state, a.id).length, 0);
  await store.flush();
  assert.equal((await adapter.load()).entries.length, 0);
  assert.equal(store.setSaved('ghost', 'place', 'a/b', true), null);
  assert.equal(store.setSaved(a.id, 'bogus', 'a/b', true), null);
  assert.equal(store.setSaved(a.id, 'place', 'BAD REF', true), null);
});

test('unsaving keeps an entry that carries a note or tried state (for later phases)', async () => {
  const { store } = await fresh();
  const t = mk(store);
  store.setSaved(t.id, 'food', 'belgrade/x', true);
  store.state.entries[0].note = 'ask for no onions';
  store.setSaved(t.id, 'food', 'belgrade/x', false);
  assert.equal(store.state.entries.length, 1);
  assert.equal(store.state.entries[0].saved, false);
});

test('deleting a trip removes its entries; duplicating copies saved places only (untried)', async () => {
  const { store, adapter } = await fresh();
  const t = mk(store);
  store.setSaved(t.id, 'place', 'belgrade/a', true);
  store.setSaved(t.id, 'place', 'belgrade/b', true);
  store.state.entries[0].tried = true;
  const copy = store.duplicateTrip(t.id);
  const copied = tripEntries(store.state, copy.id);
  assert.equal(copied.length, 2);
  assert.ok(copied.every((e) => e.tripId === copy.id && e.tried === false && e.saved));
  assert.equal(new Set(store.state.entries.map((e) => e.id)).size, 4);
  store.deleteTrip(t.id);
  assert.equal(store.state.entries.every((e) => e.tripId === copy.id), true);
  await store.flush();
  assert.equal((await adapter.load()).entries.length, 2);
});

test('existing trips, items and packing math are untouched by saving places', async () => {
  const { store } = await fresh();
  const t = mk(store);
  const before = JSON.stringify([store.state.trips, store.state.bags, store.state.items, store.state.tasks]);
  store.setSaved(t.id, 'place', 'belgrade/a', true);
  store.setSaved(t.id, 'place', 'belgrade/a', false);
  assert.equal(JSON.stringify([store.state.trips, store.state.bags, store.state.items, store.state.tasks]), before);
});

test('backup round-trip keeps entries; invalid or orphaned entries are rejected', async () => {
  const { store } = await fresh();
  const t = mk(store);
  store.setSaved(t.id, 'place', 'belgrade/a', true);
  const json = JSON.stringify(store.exportData());
  const parsed = parseBackup(json);
  assert.equal(parsed.ok, true, parsed.errors.join(';'));
  assert.equal(parsed.counts.entries, 1);
  const file = store.exportData();
  file.data.entries[0].tripId = 'ghost';
  assert.equal(validateBackup(file).ok, false);
  const bad = store.exportData();
  bad.data.entries[0].kind = 'weird';
  assert.equal(validateBackup(bad).ok, false);
  // a v1 backup (no entries) still imports
  const v1 = store.exportData();
  v1.schemaVersion = 1;
  delete v1.data.entries;
  const r = validateBackup(v1);
  assert.equal(r.ok, true);
  assert.deepEqual(r.data.entries, []);
});

test('merge import re-keys entries together with their trip (no overwrite, no orphan)', async () => {
  const { store } = await fresh();
  const t = mk(store);
  store.setSaved(t.id, 'place', 'belgrade/a', true);
  const parsed = parseBackup(JSON.stringify(store.exportData()));
  await store.importData(parsed.data, 'merge'); // same ids as what is already there
  assert.equal(store.state.trips.length, 2);
  assert.equal(store.state.entries.length, 2);
  assert.equal(new Set(store.state.entries.map((e) => e.id)).size, 2);
  for (const e of store.state.entries) {
    assert.ok(store.state.trips.some((x) => x.id === e.tripId));
    assert.equal(e.id, entryId(e.tripId, e.kind, e.refId));
  }
});

test('v1 data on disk upgrades to v2, keeps a safety copy, and loads', async () => {
  const adapter = createMemoryAdapter({ schemaVersion: 1, seed: { trips: [{ id: 't1', name: 'Old', status: 'active' }] } });
  const store = createStore(adapter);
  await store.init();
  assert.equal(store.state.trips.length, 1);
  assert.deepEqual(store.state.entries, []);
  assert.equal((await store.getSafetyCopy()).fromVersion, 1);
  assert.equal((await adapter.load()).schemaVersion, SCHEMA_VERSION);
});

test('explore tip: honest about coverage, deterministic, dismissible', () => {
  const none = exploreMessage({ status: 'none', asked: 'Rome, Italy' });
  assert.match(none.text, /don’t have a built-in guide/);
  assert.match(none.text, /add your own places/);
  assert.equal(exploreMessage({ status: 'none', asked: 'Rome, Italy', dismissed: [none.id] }), null);
  assert.match(exploreMessage({ status: 'country', asked: 'Croatia' }).text, /Pick a city/);
  const intro = exploreMessage({ status: 'covered', destName: 'Belgrade' });
  assert.match(intro.text, /editorial guide to Belgrade/);
  assert.deepEqual(exploreMessage({ status: 'covered', destName: 'Belgrade' }), intro);
  assert.match(exploreMessage({ status: 'covered', destName: 'Belgrade', saved: 3 }).text, /3 saved/);
  assert.equal(exploreMessage({ status: 'covered', destName: 'Belgrade', saved: 3, dismissed: ['explore-saved:Belgrade', 'explore-intro:Belgrade'] }), null);
});

import { generatePackingList, generateTasks, isAbroadOnlyTask } from '../../js/templates.js';
import { HOME_COUNTRIES } from '../../js/prefs.js';
import { CATALOG } from '../../js/data/catalog.js';

test('domestic trips skip abroad-only tasks and items; abroad and unset trips are unchanged', () => {
  const abroad = generateTasks({ transport: 'car', scope: 'abroad' }).map((t) => t.title);
  assert.deepEqual(generateTasks({ transport: 'car' }).map((t) => t.title), abroad, 'unset behaves like abroad');
  assert.ok(abroad.includes('Buy travel insurance') && abroad.includes('Notify bank about travel') && abroad.includes('Check passport / ID validity'));
  const home = generateTasks({ transport: 'car', scope: 'domestic' }).map((t) => t.title);
  assert.ok(!home.some(isAbroadOnlyTask) && !home.includes('Check passport / ID validity'));
  assert.ok(home.includes('Check your ID is valid') && home.includes('Confirm accommodation booking') && home.includes('Check the weather forecast'));
  const names = (scope) => generatePackingList({ type: 'city', days: 3, scope }).map((i) => i.name);
  assert.ok(names('abroad').includes('Travel adapter') && names('').includes('ID / Passport') && names('abroad').includes('Travel insurance details'));
  assert.ok(!names('domestic').includes('Travel adapter') && !names('domestic').includes('Travel insurance details'));
  assert.ok(names('domestic').includes('ID card / driving licence') && !names('domestic').includes('ID / Passport'));
  assert.ok(names('domestic').includes('Phone charger') && names('domestic').includes('Tickets / booking confirmations'), 'everything else stays');
});

test('scope is stored on the trip, validated, drives generation, and survives backup and duplicate', async () => {
  const { store } = await fresh();
  const home = store.createTrip({ name: 'Veles', destination: 'Veles - Babuna', type: 'custom', scope: 'domestic', transport: 'car' }, { bagKinds: ['backpack'] });
  assert.equal(home.scope, 'domestic');
  assert.ok(!store.state.tasks.filter((t) => t.tripId === home.id).some((t) => isAbroadOnlyTask(t.title)));
  assert.ok(!store.state.items.filter((i) => i.tripId === home.id).some((i) => i.name === 'Travel adapter'));
  const away = store.createTrip({ name: 'Rome', destination: 'Rome', type: 'city' });
  assert.equal(away.scope, '');
  assert.ok(store.state.tasks.some((t) => t.tripId === away.id && t.title === 'Buy travel insurance'));
  assert.equal(store.createTrip({ name: 'x', destination: 'x', type: 'city', scope: 'mars' }).scope, '');
  assert.equal(store.duplicateTrip(home.id).scope, 'domestic');
  assert.equal(parseBackup(JSON.stringify(store.exportData())).data.trips.find((t) => t.id === home.id).scope, 'domestic');
});

test('home-country choices cover every country, including all the guide covers', () => {
  const ids = HOME_COUNTRIES.map((c) => c.id);
  assert.ok(ids.length >= 249);
  for (const c of CATALOG.countries) assert.ok(ids.includes(c.id), c.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(HOME_COUNTRIES.find((c) => c.id === 'MK').label, 'North Macedonia');
  assert.ok(HOME_COUNTRIES.every((c, i, a) => i === 0 || a[i - 1].label.localeCompare(c.label) <= 0), 'sorted by name');
});

import { planScopeChange } from '../../js/templates.js';

test('planScopeChange: only generated, unpacked things are touched; both directions; nothing for custom items', async () => {
  const { store } = await fresh();
  const trip = store.createTrip({ name: 'A', destination: 'Rome', type: 'city', scope: 'abroad', transport: 'train' }, { bagKinds: ['carry-on'] });
  const lists = () => ({ tasks: store.state.tasks.filter((t) => t.tripId === trip.id), items: store.state.items.filter((i) => i.tripId === trip.id) });
  const home = planScopeChange('domestic', lists());
  assert.deepEqual(home.map((c) => c.kind).sort(), ['item-remove', 'item-remove', 'item-rename', 'task-remove', 'task-remove', 'task-rename']);
  assert.equal(planScopeChange('abroad', lists()).length, 0, 'already abroad: nothing to add');
  // a packed adapter stays; a done insurance task stays; custom items are never matched
  const adapter = lists().items.find((i) => i.name === 'Travel adapter');
  store.setPacked(adapter.id, 1);
  store.toggleTask(lists().tasks.find((t) => t.title === 'Buy travel insurance').id);
  store.addItem(trip.id, { name: 'My own adapter', category: 'electronics', target: 1 });
  const again = planScopeChange('domestic', lists());
  assert.ok(!again.some((c) => c.ref === adapter.id), 'packed item kept');
  assert.ok(!again.some((c) => /insurance$/.test(c.label) && c.kind === 'task-remove'), 'done task kept');
  assert.ok(!again.some((c) => /My own adapter/.test(c.label)));
  assert.deepEqual(planScopeChange('', lists()), []);
});

test('applying a scope change rewrites the existing lists in both directions, and undo restores everything exactly', async () => {
  const { store } = await fresh();
  const trip = store.createTrip({ name: 'A', destination: 'Rome', type: 'city', scope: 'abroad' }, { bagKinds: ['carry-on'] });
  const snap = () => JSON.stringify([store.state.tasks, store.state.items].map((l) => l.filter((x) => x.tripId === trip.id).map((x) => [x.id, x.title || x.name, x.packed, x.done]).sort()));
  const before = snap();
  const toHome = planScopeChange('domestic', { tasks: store.state.tasks.filter((t) => t.tripId === trip.id), items: store.state.items.filter((i) => i.tripId === trip.id) });
  const undoHome = store.applyScopeChanges(trip.id, toHome);
  const names = () => store.state.items.filter((i) => i.tripId === trip.id).map((i) => i.name);
  const titles = () => store.state.tasks.filter((t) => t.tripId === trip.id).map((t) => t.title);
  assert.ok(!names().includes('Travel adapter') && !names().includes('ID / Passport') && names().includes('ID card / driving licence'));
  assert.ok(!titles().includes('Buy travel insurance') && titles().includes('Check your ID is valid'));
  store.undoScopeChanges(undoHome);
  assert.equal(snap(), before, 'undo restores the lists exactly');
  // home -> abroad on a list generated for home brings the reminders back
  const home = store.createTrip({ name: 'H', destination: 'Veles', type: 'city', scope: 'domestic', transport: 'car' }, { bagKinds: ['carry-on'] });
  const lists = () => ({ tasks: store.state.tasks.filter((t) => t.tripId === home.id), items: store.state.items.filter((i) => i.tripId === home.id) });
  const toAbroad = planScopeChange('abroad', lists());
  assert.deepEqual(toAbroad.map((c) => c.kind).sort(), ['item-add', 'item-add', 'item-rename', 'task-add', 'task-add', 'task-rename']);
  store.applyScopeChanges(home.id, toAbroad);
  const l = lists();
  assert.ok(l.items.some((i) => i.name === 'Travel adapter') && l.items.some((i) => i.name === 'ID / Passport') && l.tasks.some((t) => t.title === 'Notify bank about travel') && l.tasks.some((t) => t.title === 'Check passport / ID validity'));
  assert.equal(planScopeChange('abroad', lists()).length, 0, 'idempotent');
  assert.equal(store.applyScopeChanges('nope', toAbroad), null);
});
