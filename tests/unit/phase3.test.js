import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../../js/store.js';
import { createMemoryAdapter } from '../../js/storage/memory.js';
import { SCHEMA_VERSION } from '../../js/models.js';
import { tripToText, tripModel, textFilename } from '../../js/export.js';
import { tripItems, tripBags, tripTasks } from '../../js/selectors.js';

const mk = (store, over = {}) => store.createTrip({ name: 'Rome', destination: 'Rome, Italy', type: 'city', startDate: '2026-12-12', endDate: '2026-12-20', season: 'winter', conditions: ['cold', 'rainy'], ...over }, { bagKinds: ['carry-on', 'checked'] });
const src = (store, t) => ({ trip: store.state.trips.find((x) => x.id === t.id), bags: tripBags(store.state, t.id), items: tripItems(store.state, t.id), tasks: tripTasks(store.state, t.id) });

test('write failure then resync restores full persistence (quota recovery)', async () => {
  const adapter = createMemoryAdapter();
  const store = createStore(adapter);
  await store.init();
  const t = mk(store);
  await store.flush();
  adapter.failNext = Object.assign(new Error('full'), { name: 'QuotaExceededError' });
  const item = tripItems(store.state, t.id)[0];
  store.setPacked(item.id, item.target); // this write is lost on disk
  await store.flush();
  assert.match(store.state.saveError, /storage is full/);
  assert.equal((await adapter.load()).items.find((i) => i.id === item.id).packed, 0); // disk is behind
  adapter.failNext = Object.assign(new Error('full'), { name: 'QuotaExceededError' });
  assert.equal(await store.resync(), false); // still full: stays in error state, nothing thrown
  assert.ok(store.state.saveError);
  assert.equal(await store.resync(), true); // space freed
  assert.equal(store.state.saveError, null);
  const disk = await adapter.load();
  assert.equal(disk.items.find((i) => i.id === item.id).packed, item.target);
  assert.equal(disk.items.length, store.state.items.length);
});

test('data from a newer app version is refused and left untouched', async () => {
  const adapter = createMemoryAdapter({ schemaVersion: SCHEMA_VERSION + 1, seed: { trips: [{ id: 't1', name: 'Future' }] } });
  const store = createStore(adapter);
  await assert.rejects(() => store.init(), (e) => e.code === 'NEWER_DATA');
  const disk = await adapter.load();
  assert.equal(disk.trips.length, 1);
  assert.equal(disk.schemaVersion, SCHEMA_VERSION + 1);
});

test('migration keeps an untouched safety copy of the pre-migration data', async () => {
  const adapter = createMemoryAdapter({
    schemaVersion: 0,
    seed: { trips: [{ id: 't1', name: 'Old', status: 'active' }], bags: [{ id: 'b1', tripId: 't1', name: 'Bag', kind: 'other', order: 0 }], items: [{ id: 'i1', tripId: 't1', bagId: 'b1', name: 'Shirt', qty: 4, done: true }] },
  });
  const store = createStore(adapter);
  await store.init();
  const copy = await store.getSafetyCopy();
  assert.equal(copy.fromVersion, 0);
  assert.deepEqual(copy.data.items[0], { id: 'i1', tripId: 't1', bagId: 'b1', name: 'Shirt', qty: 4, done: true }); // original shape
  assert.equal(store.state.items[0].target, 4); // migrated
  // no safety copy when nothing migrated
  const fresh = createStore(createMemoryAdapter());
  await fresh.init();
  assert.equal(await fresh.getSafetyCopy(), null);
});

test('migration write failure keeps data usable and flags the error', async () => {
  const adapter = createMemoryAdapter({ schemaVersion: 0, seed: { trips: [{ id: 't1', name: 'Old', status: 'active' }] } });
  adapter.failNext = Object.assign(new Error('full'), { name: 'QuotaExceededError' });
  const store = createStore(adapter);
  await store.init();
  assert.equal(store.state.trips.length, 1);
  assert.ok(store.state.saveError);
});

test('text export: bags, categories, packed state, essentials, notes and tasks', async () => {
  const store = createStore(createMemoryAdapter());
  await store.init();
  const t = mk(store);
  const items = tripItems(store.state, t.id);
  store.setPacked(items.find((i) => i.name === 'T-shirts').id, 2);
  store.togglePacked(items.find((i) => i.name === 'Keys').id);
  store.addItem(t.id, { name: 'Camera', category: 'electronics', notes: 'line one\nline two', priority: 'high', essential: true });
  store.toggleTask(tripTasks(store.state, t.id)[0].id);
  store.updateTrip(t.id, { notes: 'Meet Ana at 9' });
  const text = tripToText(src(store, t));
  assert.match(text, /^PackWise — Rome\nRome, Italy · 2026-12-12 to 2026-12-20\nWinter · Cold, Rainy\n\d+ of \d+ items packed \(\d+%\)/);
  assert.match(text, /CARRY-ON \(\d+\/\d+\)/);
  assert.match(text, /CHECKED \(\d+\/\d+\)/);
  assert.match(text, /\[x\] Keys \*/);
  assert.match(text, /\[ \] T-shirts x\d+ \(2 packed\)/);
  assert.match(text, /\[ \] Camera \* ! — line one line two/);
  assert.match(text, /TRAVEL TASKS \(1 of \d+ tasks done\)/);
  assert.match(text, /\[x\] Online check-in|\[x\] Check passport/);
  assert.match(text, /NOTES\n  Meet Ana at 9/);
  assert.ok(text.endsWith('your data stays on your device.'));
  // deterministic and free of undefined/NaN
  assert.equal(text, tripToText(src(store, t)));
  assert.ok(!/undefined|NaN|null/.test(text));
});

test('text export copes with empty trips, loose items and odd names', async () => {
  const store = createStore(createMemoryAdapter());
  await store.init();
  const t = store.createTrip({ name: 'Ünïcode / Trip: "x"' }, { generate: false, withTasks: false });
  const text = tripToText(src(store, t));
  assert.match(text, /0 of 0 items packed \(0%\)/);
  assert.equal(textFilename({ name: 'Ünïcode / Trip: "x"' }), 'packwise-ünïcode-trip-x.txt');
  assert.equal(textFilename({ name: '!!!' }), 'packwise-trip.txt');
  const model = tripModel({ trip: store.state.trips[0], bags: [], items: [{ id: 'i', tripId: t.id, bagId: 'gone', category: 'misc', name: 'Stray', target: 1, packed: 0, essential: false, priority: 'normal', notes: '', order: 0 }], tasks: [] });
  assert.equal(model.sections[0].name, 'No bag');
});

import { detectPlatform, installAdvice } from '../../js/install.js';

test('install advice covers installed, prompt, iOS, manual, insecure and unsupported', () => {
  const base = { standalone: false, secure: true, hasPrompt: false, ios: false, serviceWorker: true };
  assert.equal(installAdvice({ ...base, standalone: true }).kind, 'installed');
  assert.equal(installAdvice({ ...base, hasPrompt: true }).kind, 'prompt');
  assert.equal(installAdvice({ ...base, ios: true }).kind, 'ios');
  assert.match(installAdvice({ ...base, ios: true }).text, /Share/);
  assert.equal(installAdvice(base).kind, 'manual');
  assert.equal(installAdvice({ ...base, secure: false }).kind, 'insecure');
  assert.equal(installAdvice({ ...base, serviceWorker: false }).kind, 'unsupported');
  assert.equal(installAdvice({ ...base, standalone: true, secure: false }).kind, 'installed');
  assert.equal(detectPlatform({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' }).ios, true);
  assert.equal(detectPlatform({ userAgent: 'Mozilla/5.0 (Macintosh)', platform: 'MacIntel', maxTouchPoints: 5 }).ios, true); // iPadOS
  assert.equal(detectPlatform({ userAgent: 'Mozilla/5.0 (Macintosh)', platform: 'MacIntel', maxTouchPoints: 0 }).ios, false);
  assert.equal(detectPlatform({ userAgent: 'Mozilla/5.0 (Linux; Android 14)' }).android, true);
});
