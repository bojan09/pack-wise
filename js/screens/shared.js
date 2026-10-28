import { h } from '../dom.js';
import { icon } from '../ui/icons.js';
import { button, iconButton, progressBar } from '../ui/components.js';
import { toast } from '../ui/toast.js';
import { ABROAD_ONLY_ITEMS, isAbroadOnlyTask, planScopeChange } from '../templates.js';
import { showDialog } from '../ui/dialog.js';
import { destinationArt } from '../ui/art.js';
import { CONDITIONS, SEASONS, TRIP_TYPES } from '../models.js';
import { daysUntil, tripLengthDays, tripPhase, sumQty } from '../progress.js';
import { formatRange, plural } from '../format.js';
import { tripItems, tripTasks } from '../selectors.js';

export function pageHeader({ title, subtitle, back, actions = [], className = '' }) {
  return h(
    'header',
    { class: `page-head ${className}`.trim() },
    back ? iconButton({ icon: 'chevL', label: back.label || 'Back', href: back.href, className: 'back-btn' }) : null,
    h('div', { class: 'page-title' }, h('h1', { tabindex: '-1', text: title }), subtitle ? h('p', { class: 'muted', text: subtitle }) : null),
    h('div', { class: 'page-actions' }, actions),
  );
}

/** Places | Taste switcher shared by both guide pages. */
export function guideTabs(tripId, active) {
  const path = { places: 'explore', route: 'route', taste: 'taste', guide: 'guide' };
  const tab = (id, label, ic) => h('a', { class: `guide-tab${active === id ? ' is-active' : ''}`, href: `#/trip/${tripId}/${path[id]}`, ...(active === id ? { 'aria-current': 'page' } : {}) }, icon(ic, { size: 16 }), label);
  return h('nav', { class: 'guide-tabs', 'aria-label': 'Trip guide' }, tab('places', 'Places', 'compass'), tab('route', 'Route', 'route'), tab('taste', 'Taste', 'utensils'), tab('guide', 'My Guide', 'heart'));
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

/**
 * Scope banners shared by the packing list and the tasks page:
 *  - trip not yet classified: ask "within my country or abroad?" (two buttons, one tap);
 *  - domestic trip that still has abroad-only tasks / unpacked items: offer to remove them (undoable).
 * Nothing is ever changed without a tap.
 */
export function scopeBanner(store, trip) {
  if (!trip) return null;
  if (!trip.scope) {
    const set = (scope) => { store.updateTrip(trip.id, { scope }); reviewScopeChange({ store, tripId: trip.id }); };
    return h('section', { class: 'banner banner-info scope-ask', 'aria-label': 'Where is this trip going?' },
      icon('compass', { size: 18 }),
      h('span', { class: 'scope-ask-text' }, h('strong', { text: 'Within your country or abroad?' }), h('span', { class: 'muted small block', text: 'Trips at home skip passport, insurance, bank-notice and adapter reminders.' })),
      h('div', { class: 'scope-ask-actions' }, button({ label: 'Within my country', variant: 'primary', key: 'scope-domestic', onClick: () => set('domestic') }), button({ label: 'Abroad', variant: 'secondary', key: 'scope-abroad', onClick: () => set('abroad') })));
  }
  if (trip.scope !== 'domestic') return null;
  const tasks = tripTasks(store.state, trip.id).filter((t) => isAbroadOnlyTask(t.title) && !t.done);
  const items = store.state.items.filter((i) => i.tripId === trip.id && ABROAD_ONLY_ITEMS.includes(i.name) && i.packed === 0);
  const n = tasks.length + items.length;
  if (!n) return null;
  const names = [...tasks.map((t) => t.title), ...items.map((i) => i.name)].map((s) => s.toLowerCase()).join(', ');
  return h('section', { class: 'banner banner-info scope-banner', 'aria-label': 'Reminders usually only needed abroad' },
    icon('info', { size: 18 }),
    h('span', { text: `This trip is within your country, but ${plural(n, 'thing')} here ${n === 1 ? 'is' : 'are'} usually only needed abroad (${names}).` }),
    button({ label: `Remove ${n === 1 ? 'it' : 'them'}`, variant: 'secondary', key: 'drop-abroad', onClick: () => {
      const goneTasks = tasks.map((t) => store.deleteTask(t.id)).filter(Boolean);
      const goneItems = items.map((i) => store.deleteItem(i.id)).filter(Boolean);
      toast(`Removed ${plural(goneTasks.length + goneItems.length, 'thing')}`, { action: { label: 'Undo', run: () => { goneTasks.forEach((t) => store.restoreTask(t)); goneItems.forEach((i) => store.restoreItem(i)); } } });
    } }));
}

/**
 * After a trip's scope is set or changed: show what that would do to the lists that already exist and let the
 * user tick what to apply. Skipped when there is nothing to change. Every applied change is undoable.
 */
export async function reviewScopeChange({ store, tripId }) {
  const trip = store.state.trips.find((t) => t.id === tripId);
  if (!trip?.scope) return;
  const changes = planScopeChange(trip.scope, { tasks: tripTasks(store.state, tripId), items: tripItems(store.state, tripId) });
  if (!changes.length) return;
  const packedKept = trip.scope === 'domestic' ? tripItems(store.state, tripId).filter((i) => ABROAD_ONLY_ITEMS.includes(i.name) && i.packed > 0).map((i) => i.name) : [];
  const chosen = await showDialog({
    title: trip.scope === 'domestic' ? 'Trim the lists for a trip at home?' : 'Add the reminders for a trip abroad?',
    build: (close) => {
      const picked = new Set(changes.map((c) => c.id));
      const rows = changes.map((c) => h('li', {}, h('label', { class: 'pick-row' }, h('input', { type: 'checkbox', class: 'check', checked: true, 'aria-label': c.label, onChange: (e) => { if (e.target.checked) picked.add(c.id); else picked.delete(c.id); } }), h('span', { class: 'pick-name', text: c.label }))));
      return h('div', { class: 'dialog-stack' },
        h('p', { class: 'muted small', text: 'Your lists already exist, so PackWise will not rewrite them on its own. Tick what to change; nothing else is touched, and you can undo it afterwards.' }),
        h('ul', { class: 'pick-list' }, rows),
        packedKept.length ? h('p', { class: 'muted small', text: `Already packed, so kept: ${packedKept.join(', ')}.` }) : null,
        h('div', { class: 'dialog-actions' }, button({ label: 'Keep my lists as they are', variant: 'ghost', onClick: () => close([]) }), button({ label: 'Apply selected', variant: 'primary', key: 'apply-scope', onClick: () => close(changes.filter((c) => picked.has(c.id))) })));
    },
  });
  if (!chosen?.length) return;
  const undo = store.applyScopeChanges(tripId, chosen);
  toast(`Updated ${plural(chosen.length, 'thing')}`, { tone: 'success', action: { label: 'Undo', run: () => store.undoScopeChanges(undo) } });
}
