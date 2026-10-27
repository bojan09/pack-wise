// Data models, enums, factories and normalizers. Pure: no DOM, no storage.

export const SCHEMA_VERSION = 2; // v2 adds guide `entries` (saved places / dishes per trip)
export const APP_VERSION = '1.3.0';

export const CATEGORY_PRESETS = [
  { id: 'clothing', label: 'Clothing', icon: 'shirt' },
  { id: 'toiletries', label: 'Toiletries', icon: 'drop' },
  { id: 'electronics', label: 'Electronics', icon: 'plug' },
  { id: 'documents', label: 'Documents', icon: 'file' },
  { id: 'essentials', label: 'Essentials', icon: 'star' },
  { id: 'camping', label: 'Camping gear', icon: 'camping' },
  { id: 'misc', label: 'Miscellaneous', icon: 'box' },
];

export const TRIP_TYPES = [
  { id: 'beach', label: 'Beach', icon: 'beach', days: 7 },
  { id: 'city', label: 'City', icon: 'city', days: 4 },
  { id: 'business', label: 'Business', icon: 'briefcase', days: 3 },
  { id: 'camping', label: 'Camping', icon: 'camping', days: 4 },
  { id: 'winter', label: 'Winter', icon: 'winter', days: 6 },
  { id: 'custom', label: 'Custom', icon: 'sliders', days: 4 },
];

export const SEASONS = [
  { id: '', label: 'Not set' },
  { id: 'spring', label: 'Spring' },
  { id: 'summer', label: 'Summer' },
  { id: 'fall', label: 'Fall' },
  { id: 'winter', label: 'Winter' },
];

/** What the user expects outside. Several can apply (e.g. warm days, rainy). */
export const CONDITIONS = [
  { id: 'hot', label: 'Hot', icon: 'sun' },
  { id: 'warm', label: 'Warm', icon: 'sun' },
  { id: 'cool', label: 'Cool', icon: 'wind' },
  { id: 'cold', label: 'Cold', icon: 'winter' },
  { id: 'rainy', label: 'Rainy', icon: 'rain' },
  { id: 'snowy', label: 'Snowy', icon: 'winter' },
  { id: 'windy', label: 'Windy', icon: 'wind' },
];

export const TRANSPORTS = [
  { id: '', label: 'Not set' },
  { id: 'flight', label: 'Flight' },
  { id: 'car', label: 'Car' },
  { id: 'train', label: 'Train' },
  { id: 'bus', label: 'Bus' },
  { id: 'ship', label: 'Ship' },
  { id: 'other', label: 'Other' },
];

export const BAG_KINDS = [
  { id: 'carry-on', label: 'Carry-on', icon: 'suitcase' },
  { id: 'checked', label: 'Checked', icon: 'luggage' },
  { id: 'backpack', label: 'Backpack', icon: 'backpack' },
  { id: 'camping', label: 'Camping gear', icon: 'camping' },
  { id: 'other', label: 'Other bag', icon: 'box' },
];

export const PRIORITIES = [
  { id: 'low', label: 'Low' },
  { id: 'normal', label: 'Normal' },
  { id: 'high', label: 'High' },
];

export const TASK_PHASES = [
  { id: 'before', label: 'Before trip' },
  { id: 'during', label: 'During trip' },
  { id: 'return', label: 'Return' },
];

export const LIMITS = {
  name: 80,
  destination: 80,
  notes: 500,
  itemName: 80,
  itemNotes: 300,
  category: 40,
  bagName: 40,
  taskTitle: 120,
  maxQty: 99,
  maxTravelers: 50,
};

const ids = (list) => list.map((x) => x.id);
const TRIP_TYPE_IDS = ids(TRIP_TYPES);
const TRANSPORT_IDS = ids(TRANSPORTS);
const SEASON_IDS = ids(SEASONS);
const CONDITION_IDS = ids(CONDITIONS);
// pre-1.1.1 data used a single `climate` value
const LEGACY_CLIMATE = { warm: ['warm'], mild: ['cool'], cold: ['cold'] };
const BAG_KIND_IDS = ids(BAG_KINDS);
const PRIORITY_IDS = ids(PRIORITIES);
const PHASE_IDS = ids(TASK_PHASES);
const PRESET_IDS = ids(CATEGORY_PRESETS);

export function newId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const hex = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0');
  return `${hex()}${hex()}-${hex()}-${hex()}-${hex()}-${hex()}${hex()}${hex()}`;
}

export const nowIso = () => new Date().toISOString();

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
export const isId = (v) => typeof v === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(v);

/** Single-line text: strips control characters, collapses whitespace, caps length. */
export function cleanText(v, max) {
  if (typeof v !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  return v.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

/** Multi-line text: keeps newlines, strips other control characters. */
export function cleanMultiline(v, max) {
  if (typeof v !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  return v.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, '').trim().slice(0, max);
}

/** Accepts only a real calendar date in YYYY-MM-DD form. */
export function cleanDate(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return '';
  const [y, m, d] = v.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const valid = dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
  return valid ? v : '';
}

export function cleanIso(v) {
  if (typeof v !== 'string') return '';
  const t = Date.parse(v);
  return Number.isNaN(t) ? '' : new Date(t).toISOString();
}

export function clampInt(v, min, max, fallback) {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

const enumOr = (v, allowed, fallback) => (allowed.includes(v) ? v : fallback);

/** Preset ids are canonical; any other non-empty text is a user-defined category. */
export function normalizeCategory(v) {
  const text = cleanText(v, LIMITS.category);
  if (!text) return 'misc';
  const lower = text.toLowerCase();
  return PRESET_IDS.includes(lower) ? lower : text;
}

export function categoryMeta(id) {
  const preset = CATEGORY_PRESETS.find((c) => c.id === id);
  return preset || { id, label: id, icon: 'box' };
}

export function normalizeConditions(v) {
  if (!Array.isArray(v)) return [];
  return CONDITION_IDS.filter((id) => v.includes(id)); // canonical order, deduplicated, unknown dropped
}

export function normalizeTrip(raw) {
  if (!isObj(raw) || !isId(raw.id)) return null;
  const destination = cleanText(raw.destination, LIMITS.destination);
  const name = cleanText(raw.name, LIMITS.name) || destination;
  if (!name) return null;
  const startDate = cleanDate(raw.startDate);
  let endDate = cleanDate(raw.endDate);
  if (startDate && endDate && endDate < startDate) endDate = startDate;
  const createdAt = cleanIso(raw.createdAt) || nowIso();
  return {
    id: raw.id,
    name,
    destination,
    type: enumOr(raw.type, TRIP_TYPE_IDS, 'custom'),
    startDate,
    endDate,
    transport: enumOr(raw.transport, TRANSPORT_IDS, ''),
    travelers: clampInt(raw.travelers, 1, LIMITS.maxTravelers, 1),
    season: enumOr(raw.season, SEASON_IDS, ''),
    conditions: normalizeConditions(raw.conditions ?? LEGACY_CLIMATE[raw.climate]),
    notes: cleanMultiline(raw.notes, LIMITS.notes),
    returnOf: isId(raw.returnOf) ? raw.returnOf : '', // set on a journey-home trip; points at the original
    isDemo: raw.isDemo === true, // sample data, removable from Settings
    status: raw.status === 'archived' ? 'archived' : 'active',
    createdAt,
    updatedAt: cleanIso(raw.updatedAt) || createdAt,
  };
}

export function normalizeBag(raw) {
  if (!isObj(raw) || !isId(raw.id) || !isId(raw.tripId)) return null;
  const name = cleanText(raw.name, LIMITS.bagName);
  if (!name) return null;
  return {
    id: raw.id,
    tripId: raw.tripId,
    name,
    kind: enumOr(raw.kind, BAG_KIND_IDS, 'other'),
    order: Number.isFinite(raw.order) ? raw.order : 0,
  };
}

export function normalizeItem(raw) {
  if (!isObj(raw) || !isId(raw.id) || !isId(raw.tripId)) return null;
  const name = cleanText(raw.name, LIMITS.itemName);
  if (!name) return null;
  const target = clampInt(raw.target, 1, LIMITS.maxQty, 1);
  const createdAt = cleanIso(raw.createdAt) || nowIso();
  return {
    id: raw.id,
    tripId: raw.tripId,
    bagId: isId(raw.bagId) ? raw.bagId : '',
    category: normalizeCategory(raw.category),
    name,
    target,
    packed: clampInt(raw.packed, 0, target, 0), // invariant: 0 <= packed <= target
    essential: raw.essential === true,
    priority: enumOr(raw.priority, PRIORITY_IDS, 'normal'),
    notes: cleanMultiline(raw.notes, LIMITS.itemNotes),
    order: Number.isFinite(raw.order) ? raw.order : 0,
    createdAt,
    updatedAt: cleanIso(raw.updatedAt) || createdAt,
  };
}

export function normalizeTask(raw) {
  if (!isObj(raw) || !isId(raw.id) || !isId(raw.tripId)) return null;
  const title = cleanText(raw.title, LIMITS.taskTitle);
  if (!title) return null;
  const createdAt = cleanIso(raw.createdAt) || nowIso();
  return {
    id: raw.id,
    tripId: raw.tripId,
    title,
    phase: enumOr(raw.phase, PHASE_IDS, 'before'),
    dueDate: cleanDate(raw.dueDate),
    done: raw.done === true,
    order: Number.isFinite(raw.order) ? raw.order : 0,
    createdAt,
    updatedAt: cleanIso(raw.updatedAt) || createdAt,
  };
}

export function normalizeTemplate(raw) {
  if (!isObj(raw) || !isId(raw.id)) return null;
  const name = cleanText(raw.name, LIMITS.name);
  if (!name) return null;
  const items = (Array.isArray(raw.items) ? raw.items : [])
    .slice(0, 500)
    .map((i) => ({
      category: normalizeCategory(i?.category),
      name: cleanText(i?.name, LIMITS.itemName),
      target: clampInt(i?.target, 1, LIMITS.maxQty, 1),
      essential: i?.essential === true,
    }))
    .filter((i) => i.name);
  return {
    id: raw.id,
    name,
    type: enumOr(raw.type, TRIP_TYPE_IDS, 'custom'),
    items,
    createdAt: cleanIso(raw.createdAt) || nowIso(),
  };
}

/** Guide entries: a saved place or dish (or, later, a day plan slot) belonging to one trip. */
export const ENTRY_KINDS = ['place', 'food'];

/** Deterministic id: one entry per (trip, kind, catalog item), so saving twice can never duplicate. */
export const entryId = (tripId, kind, refId) => `${tripId}:${kind}:${refId}`;

const isRef = (v) => typeof v === 'string' && /^[a-z0-9][a-z0-9/_.-]{0,79}$/.test(v);

export function normalizeEntry(raw) {
  if (!isObj(raw) || !isId(raw.tripId) || !ENTRY_KINDS.includes(raw.kind) || !isRef(raw.refId)) return null;
  const createdAt = cleanIso(raw.createdAt) || nowIso();
  return {
    id: entryId(raw.tripId, raw.kind, raw.refId),
    tripId: raw.tripId,
    kind: raw.kind,
    refId: raw.refId,
    saved: raw.saved === true,
    tried: raw.tried === true,
    note: cleanMultiline(raw.note, 300),
    day: Number.isInteger(raw.day) && raw.day >= 1 && raw.day <= 60 ? raw.day : null,
    order: Number.isFinite(raw.order) ? raw.order : 0,
    createdAt,
    updatedAt: cleanIso(raw.updatedAt) || createdAt,
  };
}

export const makeEntry = (fields) => normalizeEntry({ ...fields, ...stamp() });

const stamp = () => {
  const t = nowIso();
  return { createdAt: t, updatedAt: t };
};

// Factories always assign a fresh id and fresh timestamps, even when copying from an existing record.
export const makeTrip = (fields) => normalizeTrip({ ...fields, id: newId(), ...stamp() });
export const makeBag = (fields) => normalizeBag({ ...fields, id: newId() });
export const makeItem = (fields) => normalizeItem({ ...fields, id: newId(), ...stamp() });
export const makeTemplate = (fields) => normalizeTemplate({ ...fields, id: newId(), createdAt: nowIso() });
export const makeTask = (fields) => normalizeTask({ ...fields, id: newId(), ...stamp() });
