// Trip summary / completion screen. Honest about what is and isn't done.
import { h } from '../dom.js';
import { icon } from '../ui/icons.js';
import { button } from '../ui/components.js';
import { companion } from '../ui/art.js';
import { essentialsLeft, sumQty, taskProgress } from '../progress.js';
import { getTrip, tripBags, tripItems, tripTasks } from '../selectors.js';
import { plural } from '../format.js';
import { tripSubtitle } from './shared.js';

export function SummaryScreen(ctx) {
  const { store, params } = ctx;
  const tripId = params.id;
  if (!getTrip(store.state, tripId)) return { redirect: '/trips', title: 'Trip not found', build: () => h('div') };
  return {
    title: 'Trip summary',
    build() {
      const state = store.state;
      const trip = getTrip(state, tripId);
      if (!trip) return h('div');
      const items = tripItems(state, tripId);
      const q = sumQty(items);
      const t = taskProgress(tripTasks(state, tripId));
      const ess = essentialsLeft(items);
      const allPacked = q.target > 0 && q.packed === q.target;
      const row = (ok, title, detail) => h('li', { class: `check-row${ok ? ' is-ok' : ' is-warn'}` }, h('span', { class: 'check-badge' }, icon(ok ? 'check' : 'alert', { size: 16 })), h('div', {}, h('strong', { text: title }), h('span', { class: 'muted small', text: detail })));
      const dest = trip.destination || trip.name;
      return h(
        'div',
        { class: 'screen summary-screen' },
        h('div', { class: 'celebrate' }, companion({ mood: 'camera', className: 'celebrate-mascot', label: 'PackWise traveler mascot' }), h('h1', { tabindex: '-1', text: allPacked ? 'All Packed!' : 'Almost there' }), h('p', { class: 'muted', text: allPacked ? `You’re ready for ${dest}!` : `Here’s how packing for ${dest} is going.` }), h('p', { class: 'muted small', text: tripSubtitle(trip) })),
        h(
          'ul',
          { class: 'card check-list' },
          row(allPacked, 'Packing items', `${q.packed} / ${q.target} packed across ${plural(tripBags(state, tripId).length, 'bag')}`),
          row(t.total > 0 && t.left === 0, 'Travel tasks', t.total ? `${t.done} / ${t.total} completed` : 'No tasks added'),
          row(ess.length === 0, ess.length ? `${plural(ess.length, 'essential')} left to pack` : 'All essentials packed', ess.length ? ess.slice(0, 4).map((i) => i.name).join(', ') + (ess.length > 4 ? '…' : '') : 'Passport, chargers and other must-haves are in'),
        ),
        h('div', { class: 'form-actions' }, button({ label: 'View packing list', variant: 'primary', href: `#/trip/${tripId}`, className: 'btn-block' }), button({ label: 'Travel tasks', variant: 'secondary', href: `#/trip/${tripId}/tasks`, className: 'btn-block' })),
        h('p', { class: 'muted small center', text: 'Checking items off tracks your own list. PackWise does not measure real volume, weight or airline allowances.' }),
      );
    },
  };
}
