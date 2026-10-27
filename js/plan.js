// My Trip Guide logic: join saved entries with the bundled catalogs, group them by interest or by day,
// build an editable draft day plan, and derive optional packing hints. Pure (no DOM, no storage).
//
// Honesty rules: a day plan has NO times, durations or routes (the catalog has no verified coordinates);
// the draft only groups by the catalog's own area label. Packing hints are suggestions, never applied
// without an explicit user action.
import { CATALOG } from './data/catalog.js';
import { FOOD } from './data/food.js';
import { getPlace, sectionOf } from './guide.js';
import { tripLengthDays } from './progress.js';

const FOOD_CAT = Object.fromEntries(FOOD.categories.map((c) => [c.id, c]));

export const MAX_DAYS = 60;
export const DEFAULT_DAYS = 3;
export const PER_DAY = 3;

/** How many day slots to offer: the trip length when dates exist, else 3; never fewer than days already used. */
export function dayCount(trip, rows = []) {
  const len = tripLengthDays(trip);
  const base = Number.isInteger(len) && len >= 1 ? Math.min(len, MAX_DAYS) : DEFAULT_DAYS;
  return Math.min(MAX_DAYS, Math.max(base, ...rows.map((r) => r.entry.day || 0)));
}

/**
 * Saved entries joined with their catalog item. An entry whose item left the catalog is kept and flagged
 * `missing` so the user can still see and remove it.
 * @returns {{key:string, entry:object, kind:'place'|'food', title:string, sub:string, group:string, groupLabel:string, missing:boolean, place?:object, dest?:object, dish?:object}[]}
 */
export function resolveGuide(entries, { catalog = CATALOG, food = FOOD } = {}) {
  const rows = [];
  for (const entry of entries) {
    if (!entry.saved) continue;
    if (entry.kind === 'place') {
      const hit = getPlace(catalog, entry.refId);
      if (hit) {
        const sec = sectionOf(hit.place);
        rows.push({ key: `place:${entry.refId}`, entry, kind: 'place', title: hit.place.name, sub: `${hit.place.area} · ${hit.dest.name}`, group: sec, groupLabel: SECTION_LABEL[sec] || sec, missing: false, place: hit.place, dest: hit.dest });
      } else rows.push({ key: `place:${entry.refId}`, entry, kind: 'place', title: entry.refId, sub: 'No longer in the guide', group: 'missing', groupLabel: 'No longer in the guide', missing: true });
    } else if (entry.kind === 'food') {
      const dish = food.items.find((i) => i.id === entry.refId);
      if (dish) rows.push({ key: `food:${entry.refId}`, entry, kind: 'food', title: dish.name, sub: FOOD_CAT[dish.category]?.label || '', group: `food-${dish.category}`, groupLabel: FOOD_CAT[dish.category]?.label || 'Food', missing: false, dish });
      else rows.push({ key: `food:${entry.refId}`, entry, kind: 'food', title: entry.refId, sub: 'No longer in the guide', group: 'missing', groupLabel: 'No longer in the guide', missing: true });
    }
  }
  return rows;
}

const SECTION_LABEL = { free: 'Free to Explore', ticket: 'Worth the Ticket', check: 'Check Admission First', gems: 'Hidden Gems', nature: 'Nature & Outdoors' };
export const GROUP_ORDER = ['free', 'ticket', 'check', 'gems', 'nature', 'food-dish', 'food-street', 'food-dessert', 'food-drink', 'missing'];

const byOrder = (a, b) => a.entry.order - b.entry.order || a.entry.createdAt.localeCompare(b.entry.createdAt) || a.key.localeCompare(b.key);

export function groupByInterest(rows) {
  return GROUP_ORDER.map((id) => ({ id, label: rows.find((r) => r.group === id)?.groupLabel || id, rows: rows.filter((r) => r.group === id).sort(byOrder) })).filter((g) => g.rows.length);
}

/** [{day:null|n, rows}] with Unplanned first, then each day in order (empty days included up to `days`). */
export function groupByDay(rows, days) {
  const out = [{ day: null, rows: rows.filter((r) => !r.entry.day).sort(byOrder) }];
  for (let d = 1; d <= days; d += 1) out.push({ day: d, rows: rows.filter((r) => r.entry.day === d).sort(byOrder) });
  return out;
}

export const planned = (rows) => rows.filter((r) => r.entry.day).length;

/**
 * A DRAFT day plan for rows that have no day yet. Places are kept together by the catalog's area label (a
 * label, not a distance), filled up to PER_DAY per day; dishes are spread one per day. No times or routes.
 * @returns {{kind:string, refId:string, day:number, order:number}[]} assignments for the unplanned rows only
 */
export function draftPlan(rows, days) {
  const todo = rows.filter((r) => !r.entry.day && !r.missing);
  const places = todo.filter((r) => r.kind === 'place').sort((a, b) => (a.place.area || '').localeCompare(b.place.area || '') || a.title.localeCompare(b.title));
  const dishes = todo.filter((r) => r.kind === 'food').sort(byOrder);
  const slots = Math.max(1, days);
  const perDay = Math.max(1, Math.min(PER_DAY, Math.ceil(places.length / slots)));
  const next = new Map(); // next free order per day, continuing after rows the user already placed
  const take = (day) => {
    if (!next.has(day)) next.set(day, Math.max(-1, ...rows.filter((r) => r.entry.day === day).map((r) => r.entry.order)) + 1);
    const n = next.get(day);
    next.set(day, n + 1);
    return n;
  };
  const out = [];
  places.forEach((r, i) => { const day = Math.min(slots, Math.floor(i / perDay) + 1); out.push({ kind: r.kind, refId: r.entry.refId, day, order: take(day) }); });
  dishes.forEach((r, i) => { const day = (i % slots) + 1; out.push({ kind: r.kind, refId: r.entry.refId, day, order: take(day) }); });
  return out;
}

// ------------------------------------------------------------ packing hints
const norm = (s) => String(s || '').toLowerCase();

/**
 * Optional packing suggestions from the saved places. Each has `have` = true when the packing list already
 * seems to cover it (so it is never suggested twice). `add` is null for reminders that are not items.
 * @returns {{id:string, title:string, why:string, add:null|{name:string, category:string}, have:boolean}[]}
 */
export function packHints(rows, items) {
  const places = rows.filter((r) => r.kind === 'place' && !r.missing);
  const names = (list) => list.slice(0, 3).map((r) => r.title).join(', ') + (list.length > 3 ? ` +${list.length - 3}` : '');
  const owned = items.map((i) => norm(i.name));
  const has = (re) => owned.some((n) => re.test(n));
  const defs = [];

  const trail = places.filter((r) => ['nature', 'viewpoint'].includes(r.place.kind));
  if (trail.length) {
    defs.push({ id: 'footwear', title: 'Comfortable walking shoes', why: `Review your footwear for ${names(trail)}: paths can be uneven or steep.`, add: { name: 'Comfortable walking shoes', category: 'clothing' }, have: has(/shoe|sneaker|boot|trainer|footwear/) });
    defs.push({ id: 'water-bottle', title: 'Refillable water bottle', why: `For longer outdoor stops such as ${names(trail)}.`, add: { name: 'Refillable water bottle', category: 'essentials' }, have: has(/bottle|hydration/) });
  }
  const water = places.filter((r) => r.place.kind === 'water');
  if (water.length) defs.push({ id: 'swim', title: 'Swimwear (if you plan to swim)', why: `You saved waterfront places: ${names(water)}.`, add: { name: 'Swimwear', category: 'clothing' }, have: has(/swim|bikini|trunks|bathing/) });
  const sacred = places.filter((r) => r.place.kind === 'religious');
  if (sacred.length) defs.push({ id: 'modest', title: 'Something to cover shoulders and knees', why: `Some sacred sites ask for modest dress: ${names(sacred)}. Check each site’s rules.`, add: { name: 'Light scarf or cover-up', category: 'clothing' }, have: has(/scarf|shawl|cover|sarong/) });
  const gated = places.filter((r) => r.place.admission !== 'free');
  if (gated.length) defs.push({ id: 'entry', title: `Check entry rules for ${gated.length} ${gated.length === 1 ? 'place' : 'places'}`, why: `Admission, opening times and ID or ticket rules can change: ${names(gated)}. PackWise does not list them.`, add: null, have: false });
  const outdoors = places.filter((r) => r.place.setting !== 'indoor');
  if (outdoors.length >= 3) defs.push({ id: 'sun', title: 'Sun protection', why: `${outdoors.length} saved places are outdoors or partly outdoors. Check the forecast near your dates.`, add: { name: 'Sunscreen', category: 'toiletries' }, have: has(/sun ?screen|sun ?block|spf|sun hat|\bhat\b|cap\b/) });
  return defs;
}

// ------------------------------------------------------------ text / print
/**
 * Display-agnostic model for the text export and the print view of a trip's guide.
 * By day when anything is planned, otherwise by interest. Pure.
 */
export function guideModel(trip, rows, days) {
  const meta = [trip.destination && trip.destination !== trip.name ? trip.destination : '', trip.startDate ? `${trip.startDate}${trip.endDate && trip.endDate !== trip.startDate ? ` to ${trip.endDate}` : ''}` : ''].filter(Boolean).join(' · ');
  const line = (r) => ({
    title: r.title,
    sub: r.sub,
    tag: r.kind === 'place' && r.place ? ADMISSION_LABEL[r.place.admission] : r.kind === 'food' ? 'Food & drink' : '',
    tried: r.kind === 'food' ? Boolean(r.entry.tried) : null,
    note: (r.entry.note || '').replace(/\s*\n\s*/g, ' '),
    missing: r.missing,
  });
  const byDay = planned(rows) > 0;
  const sections = byDay
    ? groupByDay(rows, days).filter((g) => g.rows.length).map((g) => ({ label: g.day === null ? 'Not yet planned' : `Day ${g.day}`, rows: g.rows.map(line) }))
    : groupByInterest(rows).map((g) => ({ label: g.label, rows: g.rows.map(line) }));
  return { title: `${trip.name} — trip guide`, meta, byDay, sections, count: rows.length };
}

const ADMISSION_LABEL = { free: 'Free area', paid: 'Ticketed', check: 'Check admission' };
const FOOT = 'Prices, opening hours and travel times are not included: check admission and hours before you go. Diet and allergen details are general: confirm ingredients with the cook.';

export function guideToText(model) {
  const out = [`PackWise — ${model.title}`, model.meta, model.byDay ? 'A draft you arranged yourself: no times, routes or durations.' : ''].filter(Boolean);
  out.push('');
  for (const s of model.sections) {
    out.push(s.label.toUpperCase());
    for (const r of s.rows) {
      const box = r.tried === null ? '-' : r.tried ? '[x]' : '[ ]';
      out.push(`  ${box} ${r.title}${r.sub && !r.missing ? ` (${r.sub})` : r.missing ? ' (no longer in the guide)' : ''}${r.tag ? ` [${r.tag}]` : ''}${r.note ? ` — ${r.note}` : ''}`);
    }
    out.push('');
  }
  out.push(FOOT, 'Exported from PackWise — your data stays on your device.');
  return out.join('\n');
}

export const GUIDE_FOOT = FOOT;

export function guideFilename(trip) {
  const slug = trip.name.toLowerCase().normalize('NFC').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'trip';
  return `packwise-guide-${slug}.txt`;
}
