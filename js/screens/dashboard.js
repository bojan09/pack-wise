import { h } from '../dom.js';
import { icon } from '../ui/icons.js';
import { button, emptyState, progressBar } from '../ui/components.js';
import { companion, destinationArt } from '../ui/art.js';
import { essentialsLeft, sumQty, taskProgress } from '../progress.js';
import { sortedTrips, tripBags, tripItems, tripTasks } from '../selectors.js';
import { bagProgress } from '../progress.js';
import { greeting, plural } from '../format.js';
import { countdown, tripCard, tripSubtitle } from './shared.js';

export function DashboardScreen(ctx) {
  const { store, prefs } = ctx;
  return {
    title: 'Home',
    build() {
      const state = store.state;
      const trips = sortedTrips(state, 'active');
      const name = prefs().name || 'Traveler';

      const head = h(
        'header',
        { class: 'dash-head' },
        h('div', { class: 'dash-greeting' }, icon('sun', { size: 26, class: 'sun' }), h('div', {}, h('p', { class: 'muted', text: `${greeting()},` }), h('h1', { tabindex: '-1', text: `${name}!` }))),
        companion({ className: 'dash-mascot', mood: 'happy' }),
      );

      if (!trips.length) {
        return h(
          'div',
          { class: 'screen dashboard' },
          head,
          emptyState({
            title: 'Your first adventure awaits',
            text: 'Create a trip and PackWise builds an editable packing list for you. Everything stays on this device.',
            action: button({ label: 'Plan a trip', icon: 'plus', variant: 'primary', href: '#/trips/new' }),
          }),
        );
      }

      const trip = trips[0];
      const items = tripItems(state, trip.id);
      const tasks = tripTasks(state, trip.id);
      const bags = tripBags(state, trip.id);
      const q = sumQty(items);
      const left = essentialsLeft(items).length;
      const tasksLeft = taskProgress(tasks).left;
      const bagsToPack = bags.filter((b) => {
        const p = bagProgress(items, b.id);
        return p.target > 0 && p.packed < p.target;
      }).length;
      const cd = countdown(trip);
      const others = trips.slice(1, 5);

      const hero = h(
        'section',
        { class: 'hero', 'aria-label': 'Next trip' },
        destinationArt(trip.type, { className: 'hero-art' }),
        h('div', { class: 'hero-shade' }),
        h('div', { class: 'hero-text' }, h('h2', { text: trip.name }), h('p', { class: 'hero-dates', text: tripSubtitle(trip) || 'No dates yet' }), trip.destination && trip.destination !== trip.name ? h('p', { class: 'hero-place' }, icon('pin', { size: 14 }), trip.destination) : null),
        h(
          'div',
          { class: 'hero-count' },
          h('div', {}, h('span', { class: 'count-value', text: cd.value }), cd.unit ? h('span', { class: 'count-unit', text: ` ${cd.unit}` }) : null, h('p', { class: 'muted', text: cd.sub })),
          icon('plane', { size: 40, class: 'count-plane' }),
        ),
      );

      const progress = h(
        'section',
        { class: 'card progress-card', 'aria-label': 'Packing progress' },
        h('div', { class: 'row-between' }, h('h2', { class: 'card-title', text: 'Packing Progress' }), h('strong', { class: 'pct', text: `${q.percent}%` })),
        progressBar(q.percent, { label: 'Packing progress' }),
        h('p', { class: 'muted small', text: `${q.packed} / ${q.target} items` }),
      );

      const stat = (ic, n, label, cls = '') =>
        h('div', { class: `stat ${cls}`.trim() }, h('span', { class: 'stat-icon' }, icon(ic, { size: 20 })), h('div', {}, h('strong', { text: String(n) }), h('span', { class: 'muted small', text: label })));

      const stats = h('div', { class: 'stats' }, stat('box', left, 'Essentials left', 'tone-sand'), stat('alert', tasksLeft, 'Travel tasks left', 'tone-coral'), stat('suitcase', bagsToPack, 'Bags to pack', 'tone-teal hide-mobile'));

      const actions = h('div', { class: 'dash-actions' }, button({ label: 'Continue Packing', icon: 'arrowR', iconAfter: true, variant: 'primary', href: `#/trip/${trip.id}`, className: 'btn-block' }), button({ label: 'View Details', variant: 'secondary', href: `#/trip/${trip.id}/summary`, className: 'hide-mobile' }));

      const recent = h(
        'section',
        { class: 'recent', 'aria-label': 'Recent trips' },
        h('div', { class: 'row-between' }, h('h2', { class: 'section-title', text: 'Recent Trips' }), h('a', { class: 'link', href: '#/trips', text: 'See all' })),
        h('div', { class: 'recent-row' }, others.map((t) => tripCard({ trip: t, state, href: `#/trip/${t.id}`, compact: true })), h('a', { class: 'new-trip-tile', href: '#/trips/new' }, icon('plus', { size: 26 }), h('span', { text: 'New Trip' }))),
      );

      return h('div', { class: 'screen dashboard' }, head, h('div', { class: 'dash-grid' }, h('div', { class: 'dash-main' }, hero, h('div', { class: 'dash-side' }, progress, stats, actions)), recent), h('p', { class: 'sr-only', 'aria-live': 'polite', text: `${plural(q.packed, 'item')} of ${q.target} packed` }));
    },
  };
}
