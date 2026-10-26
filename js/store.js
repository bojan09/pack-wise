// Application state + all mutations. Framework-free and storage-agnostic (takes an adapter),
// so every business rule is unit-testable in Node with the in-memory adapter.
import {
  LIMITS,
  BAG_KINDS,
  SCHEMA_VERSION,
  APP_VERSION,
  makeBag,
  makeItem,
  makeTask,
  makeTrip,
  newId,
  normalizeBag,
  normalizeItem,
  normalizeTask,
  normalizeTrip,
  nowIso,
  clampInt,
} from './models.js';
import { migrate } from './migrations.js';
import { bagForCategory, defaultDays, generatePackingList, generateTasks } from './templates.js';
import { remapCollisions, BACKUP_APP } from './validate.js';
import { tripBags, tripItems, tripTasks } from './selectors.js';
import { tripLengthDays } from './progress.js';
import { describeStorageError } from './storage/idb.js';

const COLLECTIONS = ['trips', 'bags', 'items', 'tasks', 'templates'];

export function createStore(adapter) {
  const state = { trips: [], bags: [], items: [], tasks: [], templates: [], loaded: false, saveError: null };
  const listeners = new Set();
  let queue = Promise.resolve();

  const emit = () => listeners.forEach((fn) => fn(state));
  const subscribe = (fn) => {
    listeners.add(fn);
    return () => listeners.delete(fn);
  };

  /** Apply ops to in-memory state synchronously, then persist in order. */
  function commit({ put = {}, remove = {} }) {
    for (const [coll, recs] of Object.entries(put)) {
      for (const rec of recs) {
        const idx = state[coll].findIndex((r) => r.id === rec.id);
        if (idx >= 0) state[coll][idx] = rec;
        else state[coll].push(rec);
      }
    }
    for (const [coll, ids] of Object.entries(remove)) {
      const gone = new Set(ids);
      state[coll] = state[coll].filter((r) => !gone.has(r.id));
    }
    emit();
    queue = queue
      .then(() => adapter.commit({ put, remove }))
      .then(() => {
        if (state.saveError) {
          state.saveError = null;
          emit();
        }
      })
      .catch((err) => {
        state.saveError = describeStorageError(err);
        emit();
      });
    return queue;
  }

  async function init() {
    const snap = await adapter.load();
    const { data, changed } = migrate(snap, snap.schemaVersion);
    for (const c of COLLECTIONS) state[c] = data[c] || [];
    if (changed) await adapter.replaceAll(state);
    state.loaded = true;
    emit();
  }

  const find = (coll, id) => state[coll].find((r) => r.id === id) || null;
  const touch = (rec) => ({ ...rec, updatedAt: nowIso() });
  const nextOrder = (list) => list.reduce((m, r) => Math.max(m, r.order ?? 0), -1) + 1;

  // ---------------------------------------------------------------- trips
  function createTrip(fields, { bagKinds = ['carry-on'], generate = true, withTasks = true } = {}) {
    const trip = makeTrip(fields);
    if (!trip) return null;
    const kinds = bagKinds.length ? bagKinds : ['carry-on'];
    const bags = kinds.map((kind, order) =>
      makeBag({ tripId: trip.id, kind, order, name: BAG_KINDS.find((k) => k.id === kind)?.label ?? 'Bag' }),
    );
    const days = tripLengthDays(trip) || defaultDays(trip.type);
    const items = generate
      ? generatePackingList({ type: trip.type, days }).map((g, order) =>
          makeItem({ ...g, order, tripId: trip.id, bagId: bagForCategory(g.category, bags) }),
        )
      : [];
    const tasks = withTasks
      ? generateTasks({ transport: trip.transport }).map((g, order) => makeTask({ ...g, order, tripId: trip.id }))
      : [];
    commit({ put: { trips: [trip], bags, items, tasks } });
    return trip;
  }

  function updateTrip(id, patch) {
    const cur = find('trips', id);
    if (!cur) return null;
    const next = normalizeTrip({ ...touch(cur), ...patch, id, createdAt: cur.createdAt });
    if (!next) return null;
    commit({ put: { trips: [next] } });
    return next;
  }

  function duplicateTrip(id, name) {
    const src = find('trips', id);
    if (!src) return null;
    const trip = makeTrip({ ...src, name: name || `${src.name} (copy)`, status: 'active' });
    const bagMap = new Map();
    const bags = tripBags(state, id).map((b) => {
      const nb = makeBag({ ...b, tripId: trip.id });
      bagMap.set(b.id, nb.id);
      return nb;
    });
    const items = tripItems(state, id).map((i) =>
      makeItem({ ...i, tripId: trip.id, bagId: bagMap.get(i.bagId) || '', packed: 0 }),
    );
    const tasks = tripTasks(state, id).map((t) => makeTask({ ...t, tripId: trip.id, done: false }));
    commit({ put: { trips: [trip], bags, items, tasks } });
    return trip;
  }

  const setArchived = (id, archived) => updateTrip(id, { status: archived ? 'archived' : 'active' });
  const archiveTrip = (id) => setArchived(id, true);
  const restoreTrip = (id) => setArchived(id, false);

  function deleteTrip(id) {
    if (!find('trips', id)) return false;
    commit({
      remove: {
        trips: [id],
        bags: tripBags(state, id).map((b) => b.id),
        items: tripItems(state, id).map((i) => i.id),
        tasks: tripTasks(state, id).map((t) => t.id),
      },
    });
    return true;
  }

  // ---------------------------------------------------------------- bags
  function addBag(tripId, { name, kind = 'other' }) {
    if (!find('trips', tripId)) return null;
    const bag = makeBag({ tripId, name, kind, order: nextOrder(tripBags(state, tripId)) });
    if (!bag) return null;
    commit({ put: { bags: [bag] } });
    return bag;
  }

  function updateBag(id, patch) {
    const cur = find('bags', id);
    if (!cur) return null;
    const next = normalizeBag({ ...cur, ...patch, id, tripId: cur.tripId });
    if (!next) return null;
    commit({ put: { bags: [next] } });
    return next;
  }

  /** Items in the deleted bag move to another bag of the same trip; a trip keeps at least one bag. */
  function deleteBag(id) {
    const bag = find('bags', id);
    if (!bag) return false;
    const others = tripBags(state, bag.tripId).filter((b) => b.id !== id);
    if (!others.length) return false;
    const moved = tripItems(state, bag.tripId)
      .filter((i) => i.bagId === id)
      .map((i) => ({ ...touch(i), bagId: others[0].id }));
    commit({ put: { items: moved }, remove: { bags: [id] } });
    return true;
  }

  // --------------------------------------------------------------- items
  function addItem(tripId, fields) {
    const trip = find('trips', tripId);
    if (!trip) return null;
    const bags = tripBags(state, tripId);
    const bagId = bags.some((b) => b.id === fields.bagId) ? fields.bagId : bagForCategory(fields.category, bags);
    const item = makeItem({ target: 1, ...fields, tripId, bagId, order: nextOrder(tripItems(state, tripId)) });
    if (!item) return null;
    commit({ put: { items: [item] } });
    return item;
  }

  function updateItem(id, patch) {
    const cur = find('items', id);
    if (!cur) return null;
    const merged = { ...touch(cur), ...patch, id, tripId: cur.tripId, createdAt: cur.createdAt };
    if (!tripBags(state, cur.tripId).some((b) => b.id === merged.bagId)) merged.bagId = cur.bagId;
    const next = normalizeItem(merged);
    if (!next) return null;
    commit({ put: { items: [next] } });
    return next;
  }

  const setPacked = (id, packed) => updateItem(id, { packed: clampInt(packed, 0, LIMITS.maxQty, 0) });
  const togglePacked = (id) => {
    const cur = find('items', id);
    return cur ? updateItem(id, { packed: cur.packed >= cur.target ? 0 : cur.target }) : null;
  };
  const setTarget = (id, target) => updateItem(id, { target: clampInt(target, 1, LIMITS.maxQty, 1) });

  /** Moving is a single-record update, so an item can never be counted in two bags. */
  const moveItem = (id, bagId) => updateItem(id, { bagId });

  function duplicateItem(id) {
    const cur = find('items', id);
    if (!cur) return null;
    return addItem(cur.tripId, { ...cur, name: `${cur.name} (copy)`, packed: 0 });
  }

  function deleteItem(id) {
    const cur = find('items', id);
    if (!cur) return null;
    commit({ remove: { items: [id] } });
    return cur; // returned so the UI can offer Undo
  }

  /** Re-insert a previously deleted record (Undo). */
  function restoreItem(item) {
    if (!item || !find('trips', item.tripId) || find('items', item.id)) return null;
    const norm = normalizeItem(item);
    if (!norm) return null;
    const bags = tripBags(state, norm.tripId);
    if (!bags.some((b) => b.id === norm.bagId)) norm.bagId = bags[0]?.id || '';
    commit({ put: { items: [norm] } });
    return norm;
  }

  // --------------------------------------------------------------- tasks
  function addTask(tripId, fields) {
    if (!find('trips', tripId)) return null;
    const task = makeTask({ ...fields, tripId, order: nextOrder(tripTasks(state, tripId)) });
    if (!task) return null;
    commit({ put: { tasks: [task] } });
    return task;
  }

  function updateTask(id, patch) {
    const cur = find('tasks', id);
    if (!cur) return null;
    const next = normalizeTask({ ...touch(cur), ...patch, id, tripId: cur.tripId, createdAt: cur.createdAt });
    if (!next) return null;
    commit({ put: { tasks: [next] } });
    return next;
  }

  const toggleTask = (id) => {
    const cur = find('tasks', id);
    return cur ? updateTask(id, { done: !cur.done }) : null;
  };

  function deleteTask(id) {
    const cur = find('tasks', id);
    if (!cur) return null;
    commit({ remove: { tasks: [id] } });
    return cur;
  }

  function restoreTask(task) {
    if (!task || !find('trips', task.tripId) || find('tasks', task.id)) return null;
    const norm = normalizeTask(task);
    if (!norm) return null;
    commit({ put: { tasks: [norm] } });
    return norm;
  }

  // ------------------------------------------------------- backup / import
  function exportData() {
    return {
      app: BACKUP_APP,
      schemaVersion: SCHEMA_VERSION,
      appVersion: APP_VERSION,
      exportedAt: nowIso(),
      data: Object.fromEntries(COLLECTIONS.map((c) => [c, structuredClone(state[c])])),
    };
  }

  /** @param data validated output of parseBackup().data  @param mode 'merge' | 'replace' */
  async function importData(data, mode) {
    if (mode === 'replace') {
      const clean = Object.fromEntries(COLLECTIONS.map((c) => [c, structuredClone(data[c] || [])]));
      for (const c of COLLECTIONS) state[c] = clean[c];
      emit();
      queue = queue.then(() => adapter.replaceAll(clean)).catch((err) => {
        state.saveError = describeStorageError(err);
        emit();
      });
      await queue;
      return;
    }
    const incoming = remapCollisions(data, state, newId);
    await commit({ put: Object.fromEntries(COLLECTIONS.map((c) => [c, incoming[c]])) });
  }

  async function clearAll() {
    for (const c of COLLECTIONS) state[c] = [];
    emit();
    queue = queue.then(() => adapter.clear()).catch((err) => {
      state.saveError = describeStorageError(err);
      emit();
    });
    await queue;
  }

  return {
    state,
    subscribe,
    init,
    flush: () => queue,
    createTrip,
    updateTrip,
    duplicateTrip,
    archiveTrip,
    restoreTrip,
    deleteTrip,
    addBag,
    updateBag,
    deleteBag,
    addItem,
    updateItem,
    setPacked,
    togglePacked,
    setTarget,
    moveItem,
    duplicateItem,
    deleteItem,
    restoreItem,
    addTask,
    updateTask,
    toggleTask,
    deleteTask,
    restoreTask,
    exportData,
    importData,
    clearAll,
  };
}
