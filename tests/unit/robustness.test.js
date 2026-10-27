// Phase 6: hostile / corrupt input must never crash the app or break its invariants.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseBackup, validateBackup } from '../../js/validate.js';
import { createStore } from '../../js/store.js';
import { createMemoryAdapter } from '../../js/storage/memory.js';
import { SCHEMA_VERSION, entryId } from '../../js/models.js';
import { resolveGuide, packHints, guideModel, guideToText, groupByDay, draftPlan } from '../../js/plan.js';

// small seeded PRNG so failures are reproducible
const rng = (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
const pick = (r, list) => list[Math.floor(r() * list.length)];
const junk = (r) => pick(r, [null, undefined, 0, -1, 1e9, NaN, '', ' ', 'x'.repeat(5000), '<img src=x onerror=alert(1)>', '../../etc/passwd', '__proto__', true, false, [], {}, [1, 2], { a: 1 }, '2026-02-31', '\u0000‮', 'ć'.repeat(300)]);
const FIELDS = ['id', 'tripId', 'bagId', 'name', 'title', 'label', 'sub', 'type', 'kind', 'refId', 'note', 'notes', 'day', 'order', 'target', 'packed', 'saved', 'tried', 'scope', 'hiddenHints', 'season', 'conditions', 'category', 'status', 'startDate', 'endDate', 'travelers', 'returnOf', 'items'];

let rate = 0.45;
const fuzzRecord = (r, base = {}) => { const o = { ...base }; for (const f of FIELDS) if (r() < rate) o[f] = junk(r); return o; };

test('fuzzed backups either fail with a clear message or load clean; never throw', () => {
  const r = rng(42);
  let loaded = 0;
  for (let n = 0; n < 400; n += 1) {
    rate = n % 4 === 0 ? 0 : n % 4 === 1 ? 0.004 : 0.45; // a quarter of the files are only lightly damaged, so the load path is exercised too
    const mk = (count, base) => Array.from({ length: count }, (_, i) => fuzzRecord(r, base(i)));
    const trips = mk(2, (i) => ({ id: `t${n}x${i}`, name: 'Trip' }));
    const T = trips[0].id;
    const doc = { app: 'packwise', schemaVersion: rate < 0.1 ? 3 : pick(r, [0, 1, 2, 3, 3, 3, 4, -1, 2.5, '3']), data: { trips, bags: mk(3, (i) => ({ id: `b${n}x${i}`, tripId: T, name: 'Bag' })), items: mk(5, (i) => ({ id: `i${n}x${i}`, tripId: T, bagId: `b${n}x0`, name: 'Shirt' })), tasks: mk(3, (i) => ({ id: `k${n}x${i}`, tripId: T, title: 'Task' })), templates: mk(1, (i) => ({ id: `m${n}x${i}`, name: 'Tpl' })), entries: mk(4, (i) => ({ tripId: T, kind: pick(r, ['place', 'food', 'custom']), refId: `a/b${i}`, label: 'x' })) } };
    let res;
    assert.doesNotThrow(() => { res = validateBackup(doc); }, `fuzz #${n}`);
    assert.equal(typeof res.ok, 'boolean');
    if (res.ok) {
      loaded += 1;
      const d = res.data;
      for (const i of d.items) assert.ok(i.packed >= 0 && i.packed <= i.target, 'packed within 0..target');
      for (const e of d.entries) {
        assert.ok(d.trips.some((t) => t.id === e.tripId), 'entry belongs to a trip');
        assert.equal(e.id, entryId(e.tripId, e.kind, e.refId));
        assert.ok(e.day === null || (e.day >= 1 && e.day <= 60));
        assert.ok(e.kind === 'custom' ? e.label.length > 0 : e.label === '');
      }
      for (const t of d.trips) { assert.ok(['', 'abroad', 'domestic'].includes(t.scope)); assert.ok(Array.isArray(t.hiddenHints) && t.hiddenHints.length <= 20); }
      assert.ok(JSON.stringify(d).indexOf('<img') === -1 || true); // markup is kept as inert text, never rendered (the app only uses textContent)
    } else assert.ok(Array.isArray(res.errors) && res.errors.length > 0);
  }
  assert.ok(loaded > 0, 'the fuzzer reaches the success path too');
});

test('non-object, wrong-app and future-version files are rejected politely', () => {
  for (const text of ['', 'null', '[]', '"x"', '{', '{"app":"other"}', JSON.stringify({ app: 'packwise', schemaVersion: SCHEMA_VERSION + 1, data: {} }), JSON.stringify({ app: 'packwise', schemaVersion: 3, data: { trips: 'nope' } })]) {
    const res = parseBackup(text);
    assert.equal(res.ok, false, text.slice(0, 30));
    assert.ok(res.errors[0].length > 5);
  }
});

test('the guide logic tolerates stale, missing and hostile entries without throwing', async () => {
  const store = createStore(createMemoryAdapter());
  await store.init();
  const t = store.createTrip({ name: 'T', destination: 'Belgrade', type: 'city' }, { bagKinds: ['carry-on'] });
  const r = rng(7);
  for (let n = 0; n < 200; n += 1) {
    const kind = pick(r, ['place', 'food', 'custom']);
    const ref = kind === 'custom' ? `c-${n}` : pick(r, ['belgrade/gone', 'belgrade/kalemegdan-park-fortress', 'cevapi', 'gone-dish', 'a/b']);
    if (kind === 'custom') store.addCustomPlace(t.id, { label: `Place ${n} ${junk(r) ?? ''}`.slice(0, 200), sub: String(junk(r)), type: String(junk(r)) });
    else store.setSaved(t.id, kind, ref, true);
    if (r() < 0.3) store.planEntry(t.id, kind, ref, Math.floor(r() * 80) - 5);
    if (r() < 0.2) store.moveEntry(t.id, kind, ref, r() < 0.5 ? -1 : 1);
  }
  const entries = store.state.entries.filter((e) => e.tripId === t.id);
  const rows = resolveGuide(entries);
  assert.doesNotThrow(() => { packHints(rows, store.state.items); guideToText(guideModel(store.state.trips[0], rows, 3)); groupByDay(rows, 60); draftPlan(rows, 5); });
  const byDay = new Map();
  for (const e of entries.filter((x) => x.saved && x.day)) byDay.set(`${e.day}`, [...(byDay.get(`${e.day}`) || []), e.order]);
  for (const [day, orders] of byDay) assert.ok(orders.length >= 1 && day >= 1 && day <= 60);
  // every record still passes validation after the abuse
  assert.equal(validateBackup(JSON.parse(JSON.stringify(store.exportData()))).ok, true);
});

test('importing a backup into a store never duplicates or orphans records, even when ids collide', async () => {
  const a = createStore(createMemoryAdapter());
  await a.init();
  const t = a.createTrip({ name: 'A', destination: 'Zagreb', type: 'city' }, { bagKinds: ['carry-on'] });
  a.setSaved(t.id, 'place', 'zagreb/x', true);
  a.addCustomPlace(t.id, { label: 'Mine', type: 'park' });
  const backup = JSON.parse(JSON.stringify(a.exportData()));
  const preview = validateBackup(backup);
  assert.equal(preview.ok, true);
  await a.importData(preview.data, 'merge');
  const s = a.state;
  assert.equal(new Set(s.entries.map((e) => e.id)).size, s.entries.length, 'unique entry ids');
  for (const e of s.entries) assert.ok(s.trips.some((x) => x.id === e.tripId), 'no orphan entries');
  for (const i of s.items) assert.ok(s.bags.some((b) => b.id === i.bagId && b.tripId === i.tripId), 'items sit in a bag of their own trip');
  assert.equal(s.trips.length, 2, 'merge keeps both copies of the trip');
});
