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
  makeTemplate,
  makeTrip,
  newId,
  normalizeBag,
  normalizeItem,
  normalizeTask,
  normalizeTemplate,
  normalizeTrip,
  nowIso,
  clampInt,
} from './models.js';
import { migrate } from './migrations.js';
import { bagForCategory, defaultDays, generatePackingList, generateReturnTasks, generateTasks } from './templates.js';
import { remapCollisions, BACKUP_APP } from './validate.js';
import { tripBags, tripItems, tripTasks } from './selectors.js';
import { tripLengthDays } from './progress.js';
import { describeStorageError } from './storage/idb.js';

const COLLECTIONS = ['trips', 'bags', 'items', 'tasks', 'templates'];
const normalizeCategoryOf = (g) => String(g.category || 'misc').toLowerCase();

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
  /**
   * @param {object} fields trip fields
   * @param {{bagKinds?: string[], generate?: boolean, withTasks?: boolean, templateItems?: object[], copyFrom?: string}} [opts]
   *   templateItems: use these items instead of the rules. copyFrom: copy items + tasks (unpacked) from an earlier trip.
   */
  function createTrip(fields, { bagKinds = ['carry-on'], generate = true, withTasks = true, templateItems = null, copyFrom = '' } = {}) {
    const trip = makeTrip(fields);
    if (!trip) return null;
    const kinds = bagKinds.length ? bagKinds : ['carry-on'];
    const bags = kinds.map((kind, order) =>
      makeBag({ tripId: trip.id, kind, order, name: BAG_KINDS.find((k) => k.id === kind)?.label ?? 'Bag' }),
    );
    const days = tripLengthDays(trip) || defaultDays(trip.type);
    const source = copyFrom ? find('trips', copyFrom) : null;
    let seeds = [];
    let tasks = [];
    if (source) {
      seeds = tripItems(state, source.id).sort((a, b) => a.order - b.order);
      tasks = tripTasks(state, source.id).map((t, order) => makeTask({ ...t, order, tripId: trip.id, done: false }));
    } else {
      if (templateItems) seeds = templateItems;
      else if (generate) seeds = generatePackingList({ type: trip.type, days, travelers: trip.travelers, bagKinds: kinds, climate: trip.climate });
      if (withTasks) tasks = generateTasks({ transport: trip.transport }).map((g, order) => makeTask({ ...g, order, tripId: trip.id }));
    }
    const items = seeds
      .map((g, order) => makeItem({ category: g.category, name: g.name, target: g.target, essential: g.essential, priority: g.priority, notes: g.notes, order, tripId: trip.id, bagId: bagForCategory(normalizeCategoryOf(g), bags), packed: 0 }))
      .filter(Boolean);
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

  // ------------------------------------------------- ordering & bulk edits
  const displayOrder = (a, b) => a.order - b.order || a.name.localeCompare(b.name);

  /** Persist a new manual order for the given items (all in one category). Other items keep their order. */
  function reorderItems(orderedIds) {
    const recs = orderedIds.map((id) => find('items', id)).filter(Boolean);
    if (recs.length < 2) return false;
    const slots = recs.map((r) => r.order).sort((a, b) => a - b);
    // slots can collide (equal orders after imports); spread them so every position is unique
    const unique = slots.every((v, i) => i === 0 || v > slots[i - 1]) ? slots : slots.map((_, i) => slots[0] + i);
    const changed = [];
    recs.forEach((r, i) => {
      if (r.order !== unique[i]) changed.push({ ...touch(r), order: unique[i] });
    });
    if (!changed.length) return false;
    commit({ put: { items: changed } });
    return true;
  }

  /** Move an item one position up (-1) or down (+1) within its category. */
  function moveItemOrder(id, delta) {
    const cur = find('items', id);
    if (!cur) return false;
    const group = tripItems(state, cur.tripId).filter((i) => i.category === cur.category).sort(displayOrder);
    const from = group.findIndex((i) => i.id === id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= group.length) return false;
    const ids = group.map((i) => i.id);
    [ids[from], ids[to]] = [ids[to], ids[from]];
    return reorderItems(ids);
  }

  /**
   * One atomic update over several items. patch keys: bagId, category, priority, essential,
   * and packed: 'all' | 'none'. Unknown bags are ignored; invariants hold via normalizeItem.
   */
  function bulkUpdate(ids, patch) {
    const out = [];
    for (const id of ids) {
      const cur = find('items', id);
      if (!cur) continue;
      const merged = { ...touch(cur) };
      if (patch.bagId && tripBags(state, cur.tripId).some((b) => b.id === patch.bagId)) merged.bagId = patch.bagId;
      if (patch.category) merged.category = patch.category;
      if (patch.priority) merged.priority = patch.priority;
      if (typeof patch.essential === 'boolean') merged.essential = patch.essential;
      if (patch.packed === 'all') merged.packed = cur.target;
      if (patch.packed === 'none') merged.packed = 0;
      const next = normalizeItem(merged);
      if (next) out.push(next);
    }
    if (out.length) commit({ put: { items: out } });
    return out.length;
  }

  /** Deletes several items; returns the removed records so the UI can offer Undo. */
  function bulkDelete(ids) {
    const removed = ids.map((id) => find('items', id)).filter(Boolean);
    if (removed.length) commit({ remove: { items: removed.map((r) => r.id) } });
    return removed;
  }

  function restoreItems(items) {
    return items.map((i) => restoreItem(i)).filter(Boolean).length;
  }

  // ------------------------------------------------------------ templates
  function addTemplate({ name, type = 'custom', items = [] }) {
    const t = makeTemplate({ name, type, items });
    if (!t) return null;
    commit({ put: { templates: [t] } });
    return t;
  }

  function updateTemplate(id, patch) {
    const cur = find('templates', id);
    if (!cur) return null;
    const next = normalizeTemplate({ ...cur, ...patch, id, createdAt: cur.createdAt });
    if (!next) return null;
    commit({ put: { templates: [next] } });
    return next;
  }

  function deleteTemplate(id) {
    if (!find('templates', id)) return false;
    commit({ remove: { templates: [id] } });
    return true;
  }

  /** Snapshot a trip's list (names, categories, quantities, essentials) as a reusable template. */
  function saveTripAsTemplate(tripId, name) {
    const trip = find('trips', tripId);
    if (!trip) return null;
    const items = tripItems(state, tripId)
      .sort(displayOrder)
      .map((i) => ({ category: i.category, name: i.name, target: i.target, essential: i.essential }));
    return addTemplate({ name: name || `${trip.name} template`, type: trip.type, items });
  }

  // ---------------------------------------------------------- return trip
  /**
   * Journey-home checklist: copies the chosen belongings (unpacked) into a NEW trip linked via
   * returnOf. The original trip, its packed state and its tasks are not touched.
   */
  function createReturnTrip(sourceId, { itemIds, name } = {}) {
    const src = find('trips', sourceId);
    if (!src) return null;
    const trip = makeTrip({
      name: name || `${src.name} — return`,
      destination: '',
      type: src.type,
      climate: src.climate,
      travelers: src.travelers,
      transport: src.transport,
      startDate: src.endDate || src.startDate,
      endDate: src.endDate || src.startDate,
      returnOf: src.id,
      status: 'active',
    });
    if (!trip) return null;
    const bagMap = new Map();
    const bags = tripBags(state, sourceId).map((b) => {
      const nb = makeBag({ ...b, tripId: trip.id });
      bagMap.set(b.id, nb.id);
      return nb;
    });
    const want = itemIds ? new Set(itemIds) : null;
    const items = tripItems(state, sourceId)
      .filter((i) => !want || want.has(i.id))
      .sort(displayOrder)
      .map((i, order) => makeItem({ ...i, order, tripId: trip.id, bagId: bagMap.get(i.bagId) || bags[0]?.id || '', packed: 0 }))
      .filter(Boolean);
    const tasks = generateReturnTasks().map((g, order) => makeTask({ ...g, order, tripId: trip.id }));
    commit({ put: { trips: [trip], bags, items, tasks } });
    return trip;
  }

  // ------------------------------------------------------------ sample data
  /** Adds a removable sample trip (isDemo) about three weeks out, roughly 60% packed. */
  function loadDemo(now = new Date()) {
    const ymd = (offset) => {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };
    const trip = createTrip(
      { name: 'Sample: Lisbon city break', destination: 'Lisbon, Portugal', type: 'city', startDate: ymd(21), endDate: ymd(25), transport: 'flight', travelers: 2, climate: 'mild', isDemo: true },
      { bagKinds: ['carry-on', 'checked'] },
    );
    if (!trip) return null;
    const items = tripItems(state, trip.id).sort(displayOrder);
    bulkUpdate(items.filter((_, n) => n % 5 < 3).map((i) => i.id), { packed: 'all' });
    tripTasks(state, trip.id).slice(0, 2).forEach((t) => toggleTask(t.id));
    return trip;
  }

  function removeDemo() {
    const ids = state.trips.filter((t) => t.isDemo).map((t) => t.id);
    ids.forEach((id) => deleteTrip(id));
    return ids.length;
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
    reorderItems,
    moveItemOrder,
    bulkUpdate,
    bulkDelete,
    restoreItems,
    addTemplate,
    updateTemplate,
    deleteTemplate,
    saveTripAsTemplate,
    createReturnTrip,
    loadDemo,
    removeDemo,
    exportData,
    importData,
    clearAll,
  };
}
