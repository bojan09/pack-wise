import { parseLocalDate } from './progress.js';

const md = () => new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });
const mdy = () => new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

export function formatDate(str) {
  const d = parseLocalDate(str);
  return d ? mdy().format(d) : '';
}

/** "12 Jun – 20 Jun 2026" (locale-aware). Empty string if no start date. */
export function formatRange(start, end) {
  const a = parseLocalDate(start);
  if (!a) return 'No dates set';
  const b = parseLocalDate(end);
  if (!b || end === start) return mdy().format(a);
  return `${md().format(a)} – ${mdy().format(b)}`;
}

export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function greeting(now = new Date()) {
  const hr = now.getHours();
  if (hr < 12) return 'Good morning';
  if (hr < 18) return 'Good afternoon';
  return 'Good evening';
}
