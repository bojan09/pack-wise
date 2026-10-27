// Backup parsing + validation. Nothing is written until the whole file passes.
import {
  SCHEMA_VERSION,
  isId,
  normalizeBag,
  normalizeItem,
  normalizeTask,
  normalizeTemplate,
  normalizeTrip,
} from './models.js';
import { migrate } from './migrations.js';

export const BACKUP_APP = 'packwise';
export const MAX_BACKUP_BYTES = 20 * 1024 * 1024;
const MAX_RECORDS = 50000;
const STORES = ['trips', 'bags', 'items', 'tasks', 'templates'];

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** @returns {{ok: boolean, errors: string[], warnings: string[], data?: object, counts?: object}} */
export function parseBackup(text) {
  if (typeof text !== 'string' || !text.trim()) return fail('The file is empty.');
  if (text.length > MAX_BACKUP_BYTES) return fail('The file is too large to be a PackWise backup.');
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return fail('The file is not valid JSON.');
  }
  return validateBackup(parsed);
}

export function validateBackup(obj) {
  if (!isObj(obj)) return fail('The file does not contain a PackWise backup.');
  if (obj.app !== BACKUP_APP) return fail('This file was not created by PackWise.');
  const version = obj.schemaVersion;
  if (!Number.isInteger(version) || version < 0) return fail('The backup has no valid version number.');
  if (version > SCHEMA_VERSION) {
    return fail('This backup was created by a newer version of PackWise. Update the app and try again.');
  }
  if (!isObj(obj.data)) return fail('The backup contains no data section.');

  let data;
  try {
    data = migrate(obj.data, version).data;
  } catch (e) {
    return fail(e.message);
  }

  const errors = [];
  const warnings = [];
  let total = 0;
  for (const key of STORES) {
    if (data[key] !== undefined && !Array.isArray(data[key])) errors.push(`"${key}" must be a list.`);
    total += Array.isArray(data[key]) ? data[key].length : 0;
  }
  if (total > MAX_RECORDS) errors.push('The backup contains too many records.');
  if (errors.length) return { ok: false, errors, warnings };

  const out = { trips: [], bags: [], items: [], tasks: [], templates: [] };
  const seen = { trips: new Set(), bags: new Set(), items: new Set(), tasks: new Set(), templates: new Set() };

  const collect = (key, normalize, label) => {
    (data[key] || []).forEach((raw, idx) => {
      const rec = normalize(raw);
      if (!rec) {
        errors.push(`${label} #${idx + 1} is invalid.`);
      } else if (seen[key].has(rec.id)) {
        errors.push(`${label} #${idx + 1} has a duplicate id.`);
      } else {
        seen[key].add(rec.id);
        out[key].push(rec);
      }
    });
  };
  collect('trips', normalizeTrip, 'Trip');
  collect('bags', normalizeBag, 'Bag');
  collect('items', normalizeItem, 'Item');
  collect('tasks', normalizeTask, 'Task');
  collect('templates', normalizeTemplate, 'Template');

  // Referential integrity
  for (const b of out.bags) if (!seen.trips.has(b.tripId)) errors.push(`Bag "${b.name}" refers to a missing trip.`);
  for (const t of out.tasks) if (!seen.trips.has(t.tripId)) errors.push(`Task "${t.title}" refers to a missing trip.`);
  for (const i of out.items) if (!seen.trips.has(i.tripId)) errors.push(`Item "${i.name}" refers to a missing trip.`);
  if (errors.length) return { ok: false, errors: errors.slice(0, 20), warnings };

  // A return-trip link to a trip that is not in the file is dropped, not rejected.
  for (const t of out.trips) if (t.returnOf && !seen.trips.has(t.returnOf)) t.returnOf = '';

  // Items whose bag is missing or belongs to another trip are re-homed, not rejected.
  const bagTrip = new Map(out.bags.map((b) => [b.id, b.tripId]));
  const firstBag = new Map();
  for (const b of [...out.bags].sort((a, c) => a.order - c.order)) if (!firstBag.has(b.tripId)) firstBag.set(b.tripId, b.id);
  let rehomed = 0;
  for (const i of out.items) {
    if (bagTrip.get(i.bagId) !== i.tripId) {
      i.bagId = firstBag.get(i.tripId) || '';
      rehomed += 1;
    }
  }
  if (rehomed) warnings.push(`${rehomed} item(s) referred to a missing bag and were moved to the trip's first bag.`);

  return {
    ok: true,
    errors: [],
    warnings,
    data: out,
    counts: Object.fromEntries(STORES.map((k) => [k, out[k].length])),
  };
}

/**
 * Re-key imported records whose ids already exist locally so a merge never overwrites.
 * Returns a new data object; input is untouched.
 */
export function remapCollisions(data, existing, makeId) {
  const used = new Set(STORES.flatMap((k) => (existing[k] || []).map((r) => r.id)));
  const fresh = (id) => {
    if (!used.has(id)) {
      used.add(id);
      return id;
    }
    let next = makeId();
    while (used.has(next) || !isId(next)) next = makeId();
    used.add(next);
    return next;
  };
  const trips = data.trips.map((t) => ({ ...t, id: fresh(t.id) }));
  const tripMap = new Map(data.trips.map((t, i) => [t.id, trips[i].id]));
  trips.forEach((t) => { if (t.returnOf) t.returnOf = tripMap.get(t.returnOf) ?? t.returnOf; });
  const bags = data.bags.map((b) => ({ ...b, id: fresh(b.id), tripId: tripMap.get(b.tripId) }));
  const bagMap = new Map(data.bags.map((b, i) => [b.id, bags[i].id]));
  const items = data.items.map((i) => ({
    ...i,
    id: fresh(i.id),
    tripId: tripMap.get(i.tripId),
    bagId: bagMap.get(i.bagId) ?? i.bagId,
  }));
  const tasks = data.tasks.map((t) => ({ ...t, id: fresh(t.id), tripId: tripMap.get(t.tripId) }));
  const templates = data.templates.map((t) => ({ ...t, id: fresh(t.id) }));
  return { trips, bags, items, tasks, templates };
}

function fail(message) {
  return { ok: false, errors: [message], warnings: [] };
}
