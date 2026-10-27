// Explore Destination: an editorial, offline guide for the trip's existing destination.
// Never invents data: unsupported destinations get an honest empty state.
import { h } from '../dom.js';
import { icon } from '../ui/icons.js';
import { button, chip, emptyState, iconButton } from '../ui/components.js';
import { companionBubble } from '../ui/bubble.js';
import { CATALOG } from '../data/catalog.js';
import { ADMISSION, KINDS, availableFilters, citiesInCountry, filterPlaces, groupSections, googleMapsUrl, mapSearchUrl, matchDestination, osmSearchUrl, refId, wikipediaSearchUrl } from '../guide.js';
import { exploreMessage } from '../companion.js';
import { getPrefs } from '../prefs.js';
import { getTrip, tripEntries } from '../selectors.js';
import { plural } from '../format.js';
import { pageHeader, tripSubtitle } from './shared.js';

const KIND = Object.fromEntries(KINDS.map((k) => [k.id, k]));
const SETTING_LABEL = { indoor: 'Indoors', outdoor: 'Outdoors', both: 'Indoors & outdoors' };

export function ExploreScreen(ctx) {
  const { store, navigate, params, query } = ctx;
  const tripId = params.id;
  if (!getTrip(store.state, tripId)) return { redirect: '/trips', title: 'Trip not found', build: () => h('div') };
  ctx.setLastTrip(tripId);

  const manual = query.get('dest') || ''; // browse another covered destination without touching the trip
  let chosenId = '';
  let filters = { admission: 'all', kind: 'all', setting: 'all', family: false, saved: false };
  let filterKey = 0; // bumps on every filter change so the card grid replays its transition

  const resetFilters = () => { filters = { admission: 'all', kind: 'all', setting: 'all', family: false, saved: false }; };
  const setFilter = (patch) => { filters = { ...filters, ...patch }; filterKey += 1; ctx.refresh(); };

  // ------------------------------------------------------------- place card
  function placeCard(dest, place, saved) {
    const kind = KIND[place.kind];
    const adm = ADMISSION[place.admission];
    const ref = refId(dest, place);
    const notes = [place.note, adm.note].filter(Boolean);
    return h(
      'article',
      { class: `place-card kind-${place.kind}`, 'data-ref': ref },
      h(
        'div',
        { class: 'place-art', 'aria-hidden': 'true' },
        h('span', { class: 'place-icon' }, icon(kind.icon, { size: 30 })),
        h('span', { class: `adm-badge adm-${place.admission}` }, adm.label),
      ),
      h(
        'div',
        { class: 'place-body' },
        h('div', { class: 'place-head' }, h('h3', { text: place.name }), h('button', { type: 'button', class: `save-btn${saved ? ' is-saved' : ''}`, 'aria-pressed': saved ? 'true' : 'false', 'aria-label': saved ? `Saved: ${place.name}. Remove from this trip` : `Save ${place.name} to this trip`, 'data-key': `save-${ref}`, onClick: () => store.setSaved(tripId, 'place', ref, !saved) }, icon('heart', { size: 20, fill: saved }))),
        h('p', { class: 'place-meta muted small' }, icon('pin', { size: 13 }), `${place.area}, ${dest.name}`),
        h('p', { class: 'place-why', text: place.why }),
        h('div', { class: 'place-tags' }, h('span', { class: 'tag' }, icon(kind.icon, { size: 13 }), kind.label), h('span', { class: 'tag' }, SETTING_LABEL[place.setting]), place.family ? h('span', { class: 'tag tag-family' }, icon('family', { size: 13 }), 'Family-friendly') : null),
        h('details', { class: 'place-admission' }, h('summary', { text: 'About admission' }), ...notes.map((n) => h('p', { class: 'muted small', text: n }))),
        h(
          'div',
          { class: 'place-links' },
          h('a', { class: 'link', href: mapSearchUrl(place, dest), target: '_blank', rel: 'noopener noreferrer' }, icon('pin', { size: 14 }), 'Find on map', h('span', { class: 'sr-only', text: ` for ${place.name} (opens in a new tab)` })),
          h('a', { class: 'link', href: googleMapsUrl(place, dest), target: '_blank', rel: 'noopener noreferrer' }, icon('external', { size: 14 }), 'Google Maps', h('span', { class: 'sr-only', text: ` for ${place.name} (opens in a new tab)` })),
          h('a', { class: 'link', href: wikipediaSearchUrl(place, dest), target: '_blank', rel: 'noopener noreferrer' }, icon('external', { size: 14 }), 'Read more', h('span', { class: 'sr-only', text: ` about ${place.name} on Wikipedia (opens in a new tab)` })),
        ),
      ),
    );
  }

  // ------------------------------------------------------------ status blocks
  function coveredList(extraClass = '') {
    const byCountry = CATALOG.countries.map((c) => ({ c, cities: citiesInCountry(CATALOG, c.id) })).filter((x) => x.cities.length);
    return h(
      'div',
      { class: `covered ${extraClass}`.trim() },
      byCountry.map(({ c, cities }) => h('div', { class: 'covered-row' }, h('strong', { text: c.name }), h('div', { class: 'chips-inner' }, cities.map((d) => h('a', { class: 'chip', href: `#/trip/${tripId}/explore?dest=${d.id}` }, d.name))))),
    );
  }

  function noGuide(asked, why) {
    return h(
      'div',
      { class: 'screen-block' },
      emptyState({
        title: why === 'country' ? 'Pick a city' : `No verified guide for “${asked}” yet`,
        text: why === 'country' ? 'A whole country is too big to guess at. These cities have a guide:' : 'PackWise only lists places it has reviewed, and it does not make guesses. These destinations are covered today:',
      }),
      coveredList(),
      h('p', { class: 'muted small center', text: `Coverage: ${CATALOG.destinations.length} destinations in ${CATALOG.countries.length} countries.` }),
      asked ? h('div', { class: 'center' }, h('a', { class: 'link', href: osmSearchUrl(asked), target: '_blank', rel: 'noopener noreferrer' }, icon('pin', { size: 14 }), 'Search the map for this place', h('span', { class: 'sr-only', text: ' (opens in a new tab)' }))) : null,
    );
  }

  // ------------------------------------------------------------------- build
  return {
    title: 'Explore destination',
    build() {
      const state = store.state;
      const trip = getTrip(state, tripId);
      if (!trip) return h('div');
      const asked = (trip.destination || trip.name).trim();
      const match = matchDestination(asked, CATALOG);
      const override = manual ? CATALOG.destinations.find((d) => d.id === manual) : null;
      const candidates = override ? [override] : match.matches;
      const dest = candidates.find((d) => d.id === chosenId) || candidates[0] || null;
      const savedRefs = new Set(tripEntries(state, tripId, 'place').filter((e) => e.saved).map((e) => e.refId));
      const savedHere = dest ? [...savedRefs].filter((r) => r.startsWith(`${dest.id}/`)).length : 0;

      const tip = companionBubble(
        exploreMessage({ status: dest ? 'covered' : match.status === 'ambiguous' ? 'ambiguous' : match.status, destName: dest?.name || '', asked, saved: savedHere, dismissed: getPrefs().dismissed }),
        { onDismiss: ctx.refresh, className: 'explore-tip' },
      );

      const header = pageHeader({
        title: 'Explore',
        subtitle: `${trip.name}${tripSubtitle(trip) ? ` · ${tripSubtitle(trip)}` : ''}`,
        back: { href: `#/trip/${tripId}`, label: 'Back to packing list' },
        actions: [iconButton({ icon: 'pack', label: 'Open packing list', href: `#/trip/${tripId}` })],
      });

      // ---- no destination to show
      if (!dest) {
        const why = match.status === 'country' ? 'country' : match.status === 'ambiguous' ? 'ambiguous' : 'none';
        const extra = match.status === 'country'
          ? h('div', { class: 'covered' }, match.countryOnly.map((c) => h('div', { class: 'covered-row' }, h('strong', { text: c.name }), h('div', { class: 'chips-inner' }, citiesInCountry(CATALOG, c.id).map((d) => h('a', { class: 'chip', href: `#/trip/${tripId}/explore?dest=${d.id}` }, d.name))))))
          : null;
        const conflict = match.conflicts[0];
        return h(
          'div',
          { class: 'screen explore-screen' },
          header,
          tip,
          conflict
            ? h('div', { class: 'banner banner-warn' }, icon('alert', { size: 18 }), h('span', { text: `Your trip says “${asked}”, but the guide covers ${conflict.destination.name}, ${conflict.destination.country}. These are different places, so nothing is shown automatically.` }), h('a', { class: 'link', href: `#/trip/${tripId}/explore?dest=${conflict.destination.id}`, text: `Show ${conflict.destination.name}, ${conflict.destination.country}` }))
            : null,
          why === 'country' ? extra : noGuide(asked, why),
          disclaimer(),
        );
      }

      // ---- a guide to show
      const filterOpts = availableFilters(dest.places);
      const visible = filterPlaces(dest, filters, new Set([...savedRefs]));
      const groups = groupSections(visible);
      const activeCount = (filters.admission !== 'all') + (filters.kind !== 'all') + (filters.setting !== 'all') + Number(filters.family) + Number(filters.saved);

      const stopChooser = candidates.length > 1
        ? h('div', { class: 'chips', role: 'group', 'aria-label': 'Stops on this trip' }, candidates.map((d) => chip({ label: d.name, active: d.id === dest.id, key: `stop-${d.id}`, onClick: () => { chosenId = d.id; resetFilters(); ctx.refresh(); } })))
        : null;

      const notices = [];
      if (override) notices.push(h('div', { class: 'banner banner-info' }, icon('compass', { size: 18 }), h('span', { text: `Browsing ${dest.name} instead of your trip’s destination. Saved places still belong to this trip.` }), h('a', { class: 'link', href: `#/trip/${tripId}/explore`, text: 'Use trip destination' })));
      if (!override && match.unmatched.length) notices.push(h('div', { class: 'banner banner-info' }, icon('info', { size: 18 }), h('span', { text: `No guide yet for: ${match.unmatched.join(', ')}. Showing ${plural(candidates.length, 'covered stop')}.` })));
      if (!override && match.conflicts.length) notices.push(h('div', { class: 'banner banner-warn' }, icon('alert', { size: 18 }), h('span', { text: `“${match.conflicts[0].destination.name}” was left out because your trip also names ${match.conflicts[0].country}, a different country.` })));

      const filterBar = h(
        'div',
        { class: 'filter-bar', role: 'group', 'aria-label': 'Filter places' },
        h('div', { class: 'chips' },
          chip({ label: 'Saved', count: savedHere, active: filters.saved, key: 'f-saved', onClick: () => setFilter({ saved: !filters.saved }) }),
          filterOpts.admission.length ? [chip({ label: 'All', active: filters.admission === 'all', key: 'f-adm-all', onClick: () => setFilter({ admission: 'all' }) }), ...filterOpts.admission.map((a) => chip({ label: ADMISSION[a].label, active: filters.admission === a, key: `f-adm-${a}`, onClick: () => setFilter({ admission: filters.admission === a ? 'all' : a }) }))] : null,
          filterOpts.setting ? ['indoor', 'outdoor'].map((s) => chip({ label: s === 'indoor' ? 'Indoors' : 'Outdoors', active: filters.setting === s, key: `f-set-${s}`, onClick: () => setFilter({ setting: filters.setting === s ? 'all' : s }) })) : null,
          filterOpts.family ? chip({ label: 'Family-friendly', active: filters.family, key: 'f-family', onClick: () => setFilter({ family: !filters.family }) }) : null,
        ),
        filterOpts.kinds.length ? h('div', { class: 'chips', role: 'group', 'aria-label': 'Category' }, chip({ label: 'Any category', active: filters.kind === 'all', key: 'f-kind-all', onClick: () => setFilter({ kind: 'all' }) }), ...filterOpts.kinds.map((k) => chip({ label: k.label, active: filters.kind === k.id, key: `f-kind-${k.id}`, onClick: () => setFilter({ kind: filters.kind === k.id ? 'all' : k.id }) }))) : null,
      );

      const results = groups.length
        ? groups.map((g) => h('section', { class: 'guide-section', 'aria-labelledby': `sec-${g.id}` }, h('div', { class: 'guide-section-head' }, h('h2', { id: `sec-${g.id}`, class: 'section-title', text: g.title }), h('span', { class: 'muted small', text: `${plural(g.places.length, 'place')}` })), h('p', { class: 'muted small', text: g.blurb }), h('div', { class: 'place-grid', 'data-fk': filterKey }, g.places.map((p) => placeCard(dest, p, savedRefs.has(refId(dest, p)))))))
        : [emptyState({ title: filters.saved && !savedHere ? 'Nothing saved yet' : 'No places match', text: filters.saved && !savedHere ? 'Tap the heart on a place to save it to this trip.' : 'Try removing a filter.', showCompanion: false, action: activeCount ? button({ label: 'Clear filters', variant: 'secondary', key: 'clear-filters', onClick: () => { resetFilters(); filterKey += 1; ctx.refresh(); } }) : null })];

      return h(
        'div',
        { class: 'screen explore-screen' },
        header,
        h('section', { class: 'card dest-card' }, h('div', { class: 'dest-title' }, h('span', { class: 'dest-icon' }, icon('compass', { size: 22 })), h('div', {}, h('h2', { class: 'card-title', text: `${dest.name}, ${dest.country}` }), h('p', { class: 'muted small', text: `${plural(dest.places.length, 'place')} · editorial guide reviewed ${CATALOG.reviewedAt}` }))), stopChooser),
        ...notices,
        tip,
        filterBar,
        h('p', { class: 'sr-only', 'aria-live': 'polite', text: `${plural(visible.length, 'place')} shown` }),
        h('div', { class: 'guide-results' }, results),
        h('section', { class: 'card browse-other' }, h('h2', { class: 'card-title', text: 'Browse another covered destination' }), coveredList()),
        disclaimer(),
      );
    },
  };

  function disclaimer() {
    return h(
      'section',
      { class: 'card about-guide', 'aria-label': 'About this guide' },
      h('h2', { class: 'card-title', text: 'About this guide' }),
      h('ul', { class: 'fact-list' },
        h('li', { class: 'fact' }, h('span', { class: 'fact-icon' }, icon('info', { size: 18 })), h('div', {}, h('strong', { text: 'Editorial, not live' }), h('span', { class: 'muted', text: `Places are chosen and described by PackWise from general public knowledge (version ${CATALOG.version}). They were not checked against a live source, and the list is short on purpose.` }))),
        h('li', { class: 'fact' }, h('span', { class: 'fact-icon' }, icon('alert', { size: 18 })), h('div', {}, h('strong', { text: 'No prices, hours or routes' }), h('span', { class: 'muted', text: 'PackWise does not list prices, opening hours or coordinates because it cannot verify them. Free entry can depend on date, age, residency or special exhibitions. “Check admission” means unknown, not free.' }))),
        h('li', { class: 'fact' }, h('span', { class: 'fact-icon' }, icon('wifi', { size: 18 })), h('div', {}, h('strong', { text: 'Works offline' }), h('span', { class: 'muted', text: 'This guide and your saved places work without a connection. “Find on map”, “Google Maps” and “Read more” open map and Wikipedia searches in a new tab and need one.' }))),
      ),
    );
  }
}
