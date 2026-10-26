import { h } from '../dom.js';
import { button, emptyState } from '../ui/components.js';
import { getTrip, sortedTrips } from '../selectors.js';
import { pageHeader } from './shared.js';

/** `/pack` tab: jump to the most relevant trip's packing list, or show an empty state. */
export function PackRedirectScreen(ctx) {
  const { store } = ctx;
  const last = getTrip(store.state, ctx.lastTrip());
  const trip = last && last.status === 'active' ? last : sortedTrips(store.state, 'active')[0];
  if (trip) return { redirect: `/trip/${trip.id}`, title: 'Packing', build: () => h('div') };
  return {
    title: 'Packing',
    build: () =>
      h('div', { class: 'screen' }, pageHeader({ title: 'Packing list' }), emptyState({ title: 'Nothing to pack yet', text: 'Create a trip and PackWise will suggest what to bring.', action: button({ label: 'Plan a trip', icon: 'plus', variant: 'primary', href: '#/trips/new' }) })),
  };
}
