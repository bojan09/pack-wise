import { h } from '../dom.js';
import { icon } from '../ui/icons.js';
import { iconButton, progressBar } from '../ui/components.js';
import { destinationArt } from '../ui/art.js';
import { CONDITIONS, SEASONS, TRIP_TYPES } from '../models.js';
import { daysUntil, parseLocalDate, tripLengthDays, tripPhase, sumQty } from '../progress.js';
import { formatRange, plural } from '../format.js';
import { tripItems } from '../selectors.js';

export function pageHeader({ title, subtitle, back, actions = [], className = '' }) {
  return h(
    'header',
    { class: `page-head ${className}`.trim() },
    back ? iconButton({ icon: 'chevL', label: back.label || 'Back', href: back.href, className: 'back-btn' }) : null,
    h('div', { class: 'page-title' }, h('h1', { tabindex: '-1', text: title }), subtitle ? h('p', { class: 'muted', text: subtitle }) : null),
    h('div', { class: 'page-actions' }, actions),
  );
}

export const typeMeta = (type) => TRIP_TYPES.find((t) => t.id === type) || TRIP_TYPES[TRIP_TYPES.length - 1];

/** "Summer · Warm, Rainy" or '' when nothing was chosen. */
export function weatherLabel(trip) {
  const season = SEASONS.find((s) => s.id && s.id === trip.season)?.label || '';
  const conds = CONDITIONS.filter((c) => trip.conditions?.includes(c.id)).map((c) => c.label).join(', ');
  return [season, conds].filter(Boolean).join(' · ');
}

export function tripSubtitle(trip) {
  return [trip.destination && trip.destination !== trip.name ? trip.destination : '', formatRange(trip.startDate, trip.endDate)].filter(Boolean).join(' · ');
}

/** Countdown copy for the hero card. */
export function countdown(trip, now = new Date()) {
  const phase = tripPhase(trip, now);
  if (phase === 'upcoming') {
    const n = daysUntil(trip.startDate, now);
    return { value: String(n), unit: n === 1 ? 'day' : 'days', sub: 'until departure' };
  }
  if (phase === 'ongoing') {
    const day = -daysUntil(trip.startDate, now) + 1;
    if (day <= 1 && daysUntil(trip.startDate, now) === 0) return { value: 'Today', unit: '', sub: 'is departure day!' };
    const total = tripLengthDays(trip);
    return { value: `Day ${day}`, unit: '', sub: total ? `of ${total} — enjoy the trip` : 'of your trip' };
  }
  if (phase === 'past') return { value: 'Done', unit: '', sub: 'Welcome back!' };
  return { value: '—', unit: '', sub: 'Add dates to start the countdown' };
}

export function dateBadge(trip) {
  const d = parseLocalDate(trip.startDate);
  return d ? new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(d) : '';
}

/** Compact trip card used on My Trips and the dashboard's Recent Trips row. */
export function tripCard({ trip, state, href, onMenu, compact = false }) {
  const q = sumQty(tripItems(state, trip.id));
  const meta = typeMeta(trip.type);
  return h(
    'article',
    { class: `trip-card${compact ? ' is-compact' : ''}${trip.status === 'archived' ? ' is-archived' : ''}` },
    h(
      'a',
      { class: 'trip-card-link', href, 'aria-label': `Open ${trip.name}` },
      h('div', { class: 'trip-card-art' }, (() => { const art = destinationArt(trip.type); art.dataset.parallax = '0.07'; art.dataset.parallaxMax = '14'; return art; })(), h('span', { class: 'trip-card-type' }, icon(meta.icon, { size: 14 }), meta.label), trip.returnOf ? h('span', { class: 'trip-card-return' }, icon('restore', { size: 12 }), 'Return') : null),
      h(
        'div',
        { class: 'trip-card-body' },
        h('h3', { text: trip.name }),
        h('p', { class: 'muted', text: tripSubtitle(trip) || 'No details yet' }),
        compact ? null : h('div', { class: 'trip-card-progress' }, progressBar(q.percent, { label: `${trip.name} packing progress` }), h('span', { class: 'muted', text: `${q.percent}% · ${plural(q.packed, 'item')} of ${q.target}` })),
      ),
    ),
    onMenu ? iconButton({ icon: 'dots', label: `Actions for ${trip.name}`, onClick: onMenu, className: 'trip-card-menu' }) : null,
  );
}
