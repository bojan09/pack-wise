import { h } from '../dom.js';
import { button, emptyState } from '../ui/components.js';
import { getTrip, sortedTrips } from '../selectors.js';
import { pageHeader } from './shared.js';

/** Tab entry points (`/pack`, `/studio`): jump to the most relevant trip, or show an empty state. */
function redirectScreen(suffix, title, emptyTitle) {
  return (ctx) => {
    const { store } = ctx;
    const last = getTrip(store.state, ctx.lastTrip());
    const trip = last && last.status === 'active' ? last : sortedTrips(store.state, 'active')[0];
    if (trip) return { redirect: `/trip/${trip.id}${suffix}`, title, build: () => h('div') };
    return {
      title,
      build: () =>
        h('div', { class: 'screen' }, pageHeader({ title }), emptyState({ title: emptyTitle, text: 'Create a trip and PackWise will suggest what to bring.', action: button({ label: 'Plan a trip', icon: 'plus', variant: 'primary', href: '#/trips/new' }) })),
    };
  };
}

export const PackRedirectScreen = redirectScreen('', 'Packing list', 'Nothing to pack yet');
export const ExploreRedirectScreen = redirectScreen('/explore', 'Explore', 'No trip to explore yet');
export const StudioRedirectScreen = redirectScreen('/studio', 'Packing Studio', 'No suitcase to show yet');
