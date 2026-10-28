// "More" (mobile): everything the desktop sidebar offers that does not fit in the bottom bar.
import { h } from '../dom.js';
import { icon } from '../ui/icons.js';
import { pageHeader } from './shared.js';
import { getTrip, sortedTrips } from '../selectors.js';

export function MoreScreen(ctx) {
  const { store } = ctx;
  return {
    title: 'More',
    build() {
      const last = getTrip(store.state, ctx.lastTrip());
      const trip = last && last.status === 'active' ? last : sortedTrips(store.state, 'active')[0];
      const t = (suffix) => (trip ? `#/trip/${trip.id}${suffix}` : '#/trips/new');
      const item = (href, ic, title, text) => h('li', {}, h('a', { class: 'more-item', href }, h('span', { class: 'more-icon' }, icon(ic, { size: 22 })), h('span', { class: 'more-text' }, h('strong', { text: title }), h('span', { class: 'muted small', text: text })), icon('chevR', { size: 18, class: 'chev' })));
      const where = trip ? ` for ${trip.name}` : '';
      return h(
        'div',
        { class: 'screen more-screen' },
        pageHeader({ title: 'More', subtitle: trip ? trip.name : 'Everything else PackWise can do' }),
        h('ul', { class: 'more-list card' },
          item(t('/studio'), 'luggage', 'Packing Studio', `Drop items into a 3D suitcase${where}`),
          item(t('/explore'), 'compass', 'Explore', `Places to see${where}, or add your own`),
          item(t('/route'), 'route', 'Route', `Directions and places on the way${where}`),
          item(t('/taste'), 'utensils', 'Taste', `Local food and drinks${where}`),
          item(t('/guide'), 'heart', 'My Guide', `Saved places and dishes, day plan${where}`),
          item('#/templates', 'template', 'Templates', 'Start a trip from a saved list'),
          item('#/settings', 'sliders', 'Settings', 'Theme, colors, backup, preferences'),
        ),
      );
    },
  };
}
