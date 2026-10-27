// Taste the Destination: editorial regional food & drink for the trip's destination, plus a per-trip
// Must-Try list (saved + tried + short note). No venues, no prices, no safety guarantees.
import { h } from '../dom.js';
import { icon } from '../ui/icons.js';
import { button, chip, emptyState, iconButton } from '../ui/components.js';
import { companionBubble } from '../ui/bubble.js';
import { CATALOG } from '../data/catalog.js';
import { FOOD } from '../data/food.js';
import { matchDestination } from '../guide.js';
import { ALLERGEN_LABEL, DIET_NOTE, availableDietFilters, filterFood, foodForCountries, foodRef, groupFood, maybeSuitable } from '../taste.js';
import { tasteMessage } from '../companion.js';
import { getPrefs } from '../prefs.js';
import { getTrip, tripEntries } from '../selectors.js';
import { plural } from '../format.js';
import { guideTabs, pageHeader, tripSubtitle } from './shared.js';

const CAT = Object.fromEntries(FOOD.categories.map((c) => [c.id, c]));
const COUNTRY = Object.fromEntries(CATALOG.countries.map((c) => [c.id, c]));
const NEW_FILTERS = () => ({ diet: 'all', avoid: [], category: 'all', saved: false });

export function TasteScreen(ctx) {
  const { store, params, query } = ctx;
  const tripId = params.id;
  if (!getTrip(store.state, tripId)) return { redirect: '/trips', title: 'Trip not found', build: () => h('div') };
  ctx.setLastTrip(tripId);

  const manual = (query.get('country') || '').toUpperCase(); // browse another covered country without touching the trip
  let filters = NEW_FILTERS();
  let filterKey = 0;
  const setFilter = (patch) => { filters = { ...filters, ...patch }; filterKey += 1; ctx.refresh(); };

  // ------------------------------------------------------------------ card
  function dietLine(item) {
    const parts = [];
    for (const [key, label] of [['vegetarian', 'Vegetarian'], ['vegan', 'Vegan']]) {
      const v = item[key];
      parts.push(h('span', { class: `diet diet-${v === true ? 'yes' : v === 'varies' ? 'ask' : 'no'}`, text: `${label}: ${DIET_NOTE[String(v)]}` }));
    }
    return h('div', { class: 'diet-row' }, parts);
  }

  function foodCard(item, entry) {
    const cat = CAT[item.category];
    const saved = Boolean(entry?.saved);
    const ref = foodRef(item);
    const noteId = `note-${ref}`;
    return h(
      'article',
      { class: `place-card food-card cat-${item.category}`, 'data-ref': ref },
      h('div', { class: 'place-art', 'aria-hidden': 'true' }, h('span', { class: 'place-icon' }, icon(cat.icon, { size: 30 })), entry?.tried && saved ? h('span', { class: 'adm-badge adm-free', text: 'Tried' }) : null),
      h(
        'div',
        { class: 'place-body' },
        h('div', { class: 'place-head' }, h('h3', {}, item.name, item.means ? h('span', { class: 'muted small food-means', text: ` · ${item.means}` }) : null), h('button', { type: 'button', class: `save-btn${saved ? ' is-saved' : ''}`, 'aria-pressed': saved ? 'true' : 'false', 'aria-label': saved ? `On your Must-Try list: ${item.name}. Remove` : `Add ${item.name} to your Must-Try list`, 'data-key': `save-${ref}`, onClick: () => store.setSaved(tripId, 'food', ref, !saved) }, icon('heart', { size: 20, fill: saved }))),
        h('p', { class: 'place-why', text: item.what }),
        h('p', { class: 'muted small', text: item.culture }),
        h('p', { class: 'small' }, h('strong', { text: 'Typically: ' }), item.ingredients.join(', ')),
        h('p', { class: 'small' }, h('strong', { text: 'Commonly found: ' }), item.found.join(', ')),
        dietLine(item),
        item.allergens.length ? h('div', { class: 'place-tags' }, h('span', { class: 'sr-only', text: 'Often contains:' }), ...item.allergens.map((a) => h('span', { class: 'tag tag-allergen', text: ALLERGEN_LABEL[a] || a }))) : null,
        saved
          ? h(
            'div',
            { class: 'food-extra' },
            h('label', { class: 'tried-row' }, h('input', { type: 'checkbox', checked: entry.tried, 'data-key': `tried-${ref}`, onChange: (ev) => store.setTried(tripId, 'food', ref, ev.target.checked) }), h('span', { text: 'I tried it' })),
            h('label', { class: 'sr-only', for: noteId, text: `Note about ${item.name}` }),
            h('input', { id: noteId, class: 'input note-input', type: 'text', maxlength: '300', placeholder: 'Add a short note (optional)', value: entry.note || '', 'data-key': noteId, onChange: (ev) => store.setNote(tripId, 'food', ref, ev.target.value) }),
          )
          : null,
      ),
    );
  }

  const coveredCountries = () => h(
    'div',
    { class: 'covered' },
    h('div', { class: 'chips-inner' }, CATALOG.countries.map((c) => h('a', { class: 'chip', href: `#/trip/${tripId}/taste?country=${c.id}` }, c.name))),
  );

  function disclaimer() {
    return h(
      'section',
      { class: 'card about-guide', 'aria-label': 'About this food guide' },
      h('h2', { class: 'card-title', text: 'About this food guide' }),
      h('ul', { class: 'fact-list' },
        h('li', { class: 'fact' }, h('span', { class: 'fact-icon' }, icon('info', { size: 18 })), h('div', {}, h('strong', { text: 'Editorial, regional, not live' }), h('span', { class: 'muted', text: `Dishes are chosen and described by PackWise from general public knowledge (version ${FOOD.version}) and shown by country. They were not checked against a live source. PackWise does not list restaurants or claim a dish is served anywhere in particular.` }))),
        h('li', { class: 'fact' }, h('span', { class: 'fact-icon' }, icon('alert', { size: 18 })), h('div', {}, h('strong', { text: 'Not a safety guarantee' }), h('span', { class: 'muted', text: 'Vegetarian, vegan and allergen tags describe a typical recipe only. Recipes and kitchens differ and a missing allergen does not mean it is absent. Always confirm ingredients with the cook or vendor.' }))),
        h('li', { class: 'fact' }, h('span', { class: 'fact-icon' }, icon('wifi', { size: 18 })), h('div', {}, h('strong', { text: 'Works offline' }), h('span', { class: 'muted', text: 'This guide and your Must-Try list work without a connection and stay on this device.' }))),
      ),
    );
  }

  // ------------------------------------------------------------------- build
  return {
    title: 'Taste the destination',
    build() {
      const state = store.state;
      const trip = getTrip(state, tripId);
      if (!trip) return h('div');
      const asked = (trip.destination || trip.name).trim();
      const match = matchDestination(asked, CATALOG);
      const override = COUNTRY[manual] || null;
      const codes = override
        ? [override.id]
        : match.status === 'ambiguous' ? [] : [...new Set([...match.matches.map((d) => d.countryCode), ...match.countryOnly.map((c) => c.id)])];
      const places = override ? [override.name] : [...new Set([...match.matches.map((d) => d.name), ...match.countryOnly.map((c) => c.name)])];
      const items = foodForCountries(codes);
      const entries = new Map(tripEntries(state, tripId, 'food').map((e) => [e.refId, e]));
      const savedRefs = new Set([...entries.values()].filter((e) => e.saved).map((e) => e.refId));
      const savedHere = items.filter((i) => savedRefs.has(foodRef(i))).length;
      const triedHere = items.filter((i) => savedRefs.has(foodRef(i)) && entries.get(foodRef(i))?.tried).length;
      const countryLabel = codes.map((c) => COUNTRY[c]?.name).filter(Boolean).join(' & ');

      const header = pageHeader({
        title: 'Taste',
        subtitle: `${trip.name}${tripSubtitle(trip) ? ` · ${tripSubtitle(trip)}` : ''}`,
        back: { href: `#/trip/${tripId}`, label: 'Back to packing list' },
        actions: [iconButton({ icon: 'pack', label: 'Open packing list', href: `#/trip/${tripId}` })],
      });
      const tip = companionBubble(
        tasteMessage({ status: items.length ? 'covered' : match.status === 'ambiguous' ? 'ambiguous' : 'none', countryLabel, asked, saved: savedHere, dismissed: getPrefs().dismissed }),
        { onDismiss: ctx.refresh, className: 'explore-tip' },
      );

      if (!items.length) {
        const conflict = match.conflicts[0];
        return h(
          'div',
          { class: 'screen explore-screen' },
          header,
          guideTabs(tripId, 'taste'),
          tip,
          conflict ? h('div', { class: 'banner banner-warn' }, icon('alert', { size: 18 }), h('span', { text: `Your trip says “${asked}”, but the guide covers ${conflict.destination.name}, ${conflict.destination.country}. These are different places, so nothing is shown automatically. Pick a country below.` })) : null,
          emptyState({ title: `No food guide for “${asked}” yet`, text: 'PackWise only lists specialities it has reviewed, and it does not make guesses. These countries are covered today:' }),
          coveredCountries(),
          disclaimer(),
        );
      }

      const opts = availableDietFilters(items);
      const visible = filterFood(items, filters, savedRefs);
      const groups = groupFood(visible);
      const hint = maybeSuitable(filterFood(items, { ...filters, diet: 'all' }, savedRefs), filters);
      const activeCount = (filters.diet !== 'all') + filters.avoid.length + (filters.category !== 'all') + Number(filters.saved);

      const filterBar = h(
        'div',
        { class: 'filter-bar', role: 'group', 'aria-label': 'Filter dishes and drinks' },
        h('div', { class: 'chips' },
          chip({ label: 'My Must-Try list', count: savedHere, active: filters.saved, key: 'f-saved', onClick: () => setFilter({ saved: !filters.saved }) }),
          opts.diets.length ? [chip({ label: 'Any diet', active: filters.diet === 'all', key: 'f-diet-all', onClick: () => setFilter({ diet: 'all' }) }), ...opts.diets.map((d) => chip({ label: d === 'vegan' ? 'Vegan' : 'Vegetarian', active: filters.diet === d, key: `f-diet-${d}`, onClick: () => setFilter({ diet: filters.diet === d ? 'all' : d }) }))] : null,
        ),
        opts.categories.length > 1 ? h('div', { class: 'chips', role: 'group', 'aria-label': 'Category' }, chip({ label: 'Everything', active: filters.category === 'all', key: 'f-cat-all', onClick: () => setFilter({ category: 'all' }) }), ...FOOD.categories.filter((c) => opts.categories.includes(c.id)).map((c) => chip({ label: c.label, active: filters.category === c.id, key: `f-cat-${c.id}`, onClick: () => setFilter({ category: filters.category === c.id ? 'all' : c.id }) }))) : null,
        opts.allergens.length ? h('div', { class: 'chips', role: 'group', 'aria-label': 'Hide dishes that often contain' }, h('span', { class: 'muted small chips-label', text: 'Hide if often contains:' }), ...opts.allergens.map((a) => chip({ label: ALLERGEN_LABEL[a], active: filters.avoid.includes(a), key: `f-avoid-${a}`, onClick: () => setFilter({ avoid: filters.avoid.includes(a) ? filters.avoid.filter((x) => x !== a) : [...filters.avoid, a] }) }))) : null,
      );

      const results = groups.length
        ? groups.map((g) => h('section', { class: 'guide-section', 'aria-labelledby': `cat-${g.id}` }, h('div', { class: 'guide-section-head' }, h('h2', { id: `cat-${g.id}`, class: 'section-title', text: g.label }), h('span', { class: 'muted small', text: plural(g.items.length, 'item') })), h('p', { class: 'muted small', text: g.blurb }), h('div', { class: 'place-grid', 'data-fk': filterKey }, g.items.map((i) => foodCard(i, entries.get(foodRef(i)))))))
        : [emptyState({ title: filters.saved && !savedHere ? 'Your Must-Try list is empty' : 'Nothing matches', text: filters.saved && !savedHere ? 'Tap the heart on a dish or drink to add it to this trip.' : 'Try removing a filter. Hidden items are not necessarily unsafe — the filters only use general recipe data.', showCompanion: false, action: activeCount ? button({ label: 'Clear filters', variant: 'secondary', key: 'clear-filters', onClick: () => { filters = NEW_FILTERS(); filterKey += 1; ctx.refresh(); } }) : null })];

      return h(
        'div',
        { class: 'screen explore-screen taste-screen' },
        header,
        guideTabs(tripId, 'taste'),
        h('section', { class: 'card dest-card' }, h('div', { class: 'dest-title' }, h('span', { class: 'dest-icon' }, icon('utensils', { size: 22 })), h('div', {}, h('h2', { class: 'card-title', text: countryLabel }), h('p', { class: 'muted small', text: `${plural(items.length, 'speciality', 'specialities')} · editorial, shown by country${places.length ? ` · for ${places.join(', ')}` : ''}${savedHere ? ` · ${savedHere} on your list, ${triedHere} tried` : ''}` })))),
        override ? h('div', { class: 'banner banner-info' }, icon('compass', { size: 18 }), h('span', { text: `Browsing ${override.name} instead of your trip’s destination. Your Must-Try list still belongs to this trip.` }), h('a', { class: 'link', href: `#/trip/${tripId}/taste` }, 'Back to trip destination')) : null,
        tip,
        filterBar,
        h('p', { class: 'sr-only', 'aria-live': 'polite', text: `${plural(visible.length, 'item')} shown` }),
        hint ? h('p', { class: 'muted small', text: `${plural(hint, 'more item')} may have a ${filters.diet} version depending on the recipe. They are hidden by this filter; ask the cook or vendor.` }) : null,
        h('div', { class: 'guide-results' }, results),
        h('section', { class: 'card browse-other' }, h('h2', { class: 'card-title', text: 'Taste another covered country' }), coveredCountries()),
        disclaimer(),
      );
    },
  };
}
