// Progress and date math. Pure functions only.

/** Quantity-based progress: packed vs target units. Never reports 100% unless truly complete. */
export function sumQty(items) {
  let packed = 0;
  let target = 0;
  let packedItems = 0;
  for (const it of items) {
    target += it.target;
    packed += Math.min(it.packed, it.target);
    if (it.packed >= it.target) packedItems += 1;
  }
  let percent = target ? Math.round((packed / target) * 100) : 0;
  if (packed < target && percent === 100) percent = 99;
  return { packed, target, percent, items: items.length, packedItems };
}

export const tripProgress = (items) => sumQty(items);
export const bagProgress = (items, bagId) => sumQty(items.filter((i) => i.bagId === bagId));
export const categoryProgress = (items, category) => sumQty(items.filter((i) => i.category === category));

export function taskProgress(tasks) {
  const done = tasks.filter((t) => t.done).length;
  const total = tasks.length;
  return { done, total, left: total - done, percent: total ? Math.round((done / total) * 100) : 0 };
}

export const isItemPacked = (item) => item.packed >= item.target;
export const essentialsLeft = (items) => items.filter((i) => i.essential && !isItemPacked(i));

// ---- dates (YYYY-MM-DD strings, interpreted in the device's local time zone) ----

export function parseLocalDate(str) {
  if (!str) return null;
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** Whole calendar days from `now` to the date; negative if in the past. */
export function daysUntil(dateStr, now = new Date()) {
  const target = parseLocalDate(dateStr);
  if (!target) return null;
  return Math.round((startOfDay(target) - startOfDay(now)) / 86400000);
}

/** Inclusive trip length in days, or null if dates are missing. */
export function tripLengthDays(trip) {
  const a = parseLocalDate(trip.startDate);
  const b = parseLocalDate(trip.endDate || trip.startDate);
  if (!a || !b) return null;
  return Math.round((b - a) / 86400000) + 1;
}

/** 'upcoming' | 'ongoing' | 'past' | 'undated' */
export function tripPhase(trip, now = new Date()) {
  if (!trip.startDate) return 'undated';
  const toStart = daysUntil(trip.startDate, now);
  const toEnd = daysUntil(trip.endDate || trip.startDate, now);
  if (toStart > 0) return 'upcoming';
  if (toEnd >= 0) return 'ongoing';
  return 'past';
}

/**
 * Overall readiness for the dashboard. Deterministic; reasons are short plain strings.
 * @returns {{level: 'new'|'ready'|'on-track'|'attention', label: string, reasons: string[]}}
 */
export function readiness({ trip, items, tasks, now = new Date() }) {
  if (!items.length) return { level: 'new', label: 'Add items to start', reasons: [] };
  const q = sumQty(items);
  const ess = essentialsLeft(items).length;
  const t = taskProgress(tasks);
  const phase = tripPhase(trip, now);
  const days = trip.startDate ? daysUntil(trip.startDate, now) : null;

  const reasons = [];
  if (ess) reasons.push(`${ess} essential${ess === 1 ? '' : 's'} not packed`);
  if (t.left) reasons.push(`${t.left} task${t.left === 1 ? '' : 's'} to do`);

  if (q.packed === q.target && !ess && !t.left) return { level: 'ready', label: 'Ready to go', reasons: [] };

  const soon = phase === 'upcoming' && days <= 3;
  const behind = phase === 'upcoming' && (soon || (days <= 7 && q.percent < 50));
  if ((ess && soon) || behind) {
    if (behind && !reasons.length) reasons.push(`${q.percent}% packed`);
    return { level: 'attention', label: 'Needs attention', reasons };
  }
  return { level: 'on-track', label: 'On track', reasons };
}
