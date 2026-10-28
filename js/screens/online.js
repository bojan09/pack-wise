// Find places online: optional live lookup (Wikidata + Wikipedia) for destinations the built-in guide does not cover,
// or to find more around a covered one. Nothing is requested until the user taps "Search online".
// Found places can be saved into My Guide; the saved copy keeps its own snapshot so it works offline.
import { h } from '../dom.js';
import { icon } from '../ui/icons.js';
import { button, chip, emptyState, iconButton } from '../ui/components.js';
import { companionBubble } from '../ui/bubble.js';
import { toast } from '../ui/toast.js';
import { KINDS, googleCoordUrl, osmCoordUrl, wikipediaPageUrl } from '../guide.js';
import { SOURCE_PAGES, coordsText, findPlaces, friendlyError, lookup, recallCandidates, rememberCandidates } from '../online.js';
import { getTrip, tripEntries } from '../selectors.js';
import { plural } from '../format.js';
import { guideTabs, pageHeader, tripSubtitle } from './shared.js';

const KIND = Object.fromEntries(KINDS.map((k) => [k.id, k]));
const STOP_SPLIT = /\s*(?:[,;/|+→>()]|\s[-–—]\s|\s(?:and|to|then)\s|\s&\s)\s*/i;

export function OnlineScreen(ctx) {
  const { store, params, query: qs } = ctx;
  const tripId = params.id;
  if (!getTrip(store.state, tripId)) return { redirect: '/trips', title: 'Trip not found', build: () => h('div') };
  ctx.setLastTrip(tripId);

  const trip0 = getTrip(store.state, tripId);
  const asked = (trip0.destination || trip0.name).trim();
  const stops = [...new Set(asked.split(STOP_SPLIT).map((s) => s.trim()).filter((s) => s.length > 1))].slice(0, 4);
  let query = (qs.get('q') || stops[0] || asked).slice(0, 80);
  let phase = 'idle'; // idle | searching | choosing | empty | loading | done | error
  let candidates = [];
  let chosen = null;
  let result = null;
  let error = '';
  let kindFilter = 'all';
  let notice = '';
  let alive = true;
  const live = (fn) => { if (alive) fn(); };

  async function search() {
    phase = 'searching'; error = ''; result = null; chosen = null; ctx.refresh();
    try {
      const found = await findPlaces(query);
      rememberCandidates(query, found);
      live(() => { candidates = found; phase = found.length ? 'choosing' : 'empty'; notice = ''; });
    } catch (e) {
      const earlier = ['offline', 'timeout', 'http'].includes(e.code) ? recallCandidates(query) : null;
      if (earlier) live(() => { candidates = earlier; phase = 'choosing'; notice = `${friendlyError(e)} Showing what this search found earlier.`; });
      else live(() => { error = friendlyError(e); phase = 'error'; });
    }
    live(() => ctx.refresh());
  }

  async function choose(c, fresh = false) {
    chosen = c; phase = 'loading'; error = ''; kindFilter = 'all'; ctx.refresh();
    try {
      const r = await lookup(c, { fresh });
      live(() => { result = r; phase = 'done'; });
    } catch (e) {
      live(() => { error = friendlyError(e); phase = 'error'; });
    }
    live(() => ctx.refresh());
  }

  // ------------------------------------------------------------------ pieces
  function webCard(p, saved) {
    const kind = KIND[p.kind];
    return h(
      'article',
      { class: `place-card web-card kind-${p.kind}`, 'data-wp': String(p.wp) },
      h('div', { class: 'place-art', 'aria-hidden': 'true' }, h('span', { class: 'place-icon' }, icon(kind.icon, { size: 30 })), h('span', { class: 'adm-badge adm-check', text: 'Check admission' })),
      h('div', { class: 'place-body' },
        h('div', { class: 'place-head' }, h('h3', { text: p.name }), h('button', { type: 'button', class: `save-btn${saved ? ' is-saved' : ''}`, 'aria-pressed': saved ? 'true' : 'false', 'aria-label': saved ? `Saved: ${p.name}. Remove from this trip` : `Save ${p.name} to this trip`, 'data-key': `save-w${p.wp}`, onClick: () => { if (saved) store.removeEntry(tripId, 'web', `w-${p.wp}`); else store.saveWebPlace(tripId, p); } }, icon('heart', { size: 20, fill: saved }))),
        h('p', { class: 'place-why', text: p.desc }),
        h('div', { class: 'place-tags' }, h('span', { class: 'tag' }, icon(kind.icon, { size: 13 }), kind.label), p.dist !== null ? h('span', { class: 'tag', text: p.dist < 1000 ? `${p.dist} m away` : `${(p.dist / 1000).toFixed(1)} km away` }) : null),
        h('p', { class: 'muted small coords', text: `${coordsText(p.lat, p.lon)} · coordinates from Wikidata` }),
        h('div', { class: 'place-links' },
          h('a', { class: 'link', href: googleCoordUrl(p.lat, p.lon), target: '_blank', rel: 'noopener noreferrer' }, icon('external', { size: 14 }), 'Google Maps', h('span', { class: 'sr-only', text: ` at the coordinates of ${p.name} (opens in a new tab)` })),
          h('a', { class: 'link', href: osmCoordUrl(p.lat, p.lon), target: '_blank', rel: 'noopener noreferrer' }, icon('pin', { size: 14 }), 'OpenStreetMap', h('span', { class: 'sr-only', text: ` at the coordinates of ${p.name} (opens in a new tab)` })),
          h('a', { class: 'link', href: wikipediaPageUrl(p.wp), target: '_blank', rel: 'noopener noreferrer' }, icon('external', { size: 14 }), 'Wikipedia', h('span', { class: 'sr-only', text: ` article about ${p.name} (opens in a new tab)` })))),
    );
  }

  const consent = () => h('section', { class: 'card online-consent', 'aria-label': 'About the online search' },
    h('h2', { class: 'card-title', text: 'Look it up online (optional)' }),
    h('p', { class: 'small', text: 'PackWise has hand-picked guides for only a few cities. This searches Wikipedia and Wikidata for places near any town or city in the world.' }),
    h('ul', { class: 'fact-list' },
      h('li', { class: 'fact' }, h('span', { class: 'fact-icon' }, icon('lock', { size: 18 })), h('div', {}, h('strong', { text: 'What is sent' }), h('span', { class: 'muted', text: 'Only the place name you type, then that place’s coordinates, to wikidata.org and wikipedia.org. Nothing about your trip, dates, notes or packing. Nothing is sent until you tap Search online.' }))),
      h('li', { class: 'fact' }, h('span', { class: 'fact-icon' }, icon('alert', { size: 18 })), h('div', {}, h('strong', { text: 'What you get' }), h('span', { class: 'muted', text: 'Names, one-line descriptions and coordinates, shared by volunteers and not reviewed by PackWise. No prices, opening hours or admission: every place says “Check admission”. Items that are not clearly an attraction are left out.' }))),
      h('li', { class: 'fact' }, h('span', { class: 'fact-icon' }, icon('wifi', { size: 18 })), h('div', {}, h('strong', { text: 'Offline' }), h('span', { class: 'muted', text: 'Results are kept on this device and places you save work without a connection. Searching needs one.' })))));

  const searchForm = () => {
    const input = h('input', { type: 'text', name: 'q', class: 'input', maxlength: 80, value: query, placeholder: 'Town or city, e.g. Veles', autocomplete: 'off', 'aria-label': 'Place to search for', 'data-key': 'online-q', onInput: (e) => { query = e.target.value; } });
    return h('form', { class: 'online-search', onSubmit: (e) => { e.preventDefault(); if (phase !== 'searching' && phase !== 'loading') search(); } },
      h('div', { class: 'online-row' }, input, button({ label: phase === 'searching' ? 'Searching…' : 'Search online', icon: 'search', variant: 'primary', type: 'submit', disabled: phase === 'searching' || phase === 'loading', key: 'online-go' })),
      stops.length > 1 ? h('div', { class: 'chips', role: 'group', 'aria-label': 'Stops on this trip' }, stops.map((s) => chip({ label: s, active: query === s, key: `stop-${s}`, onClick: () => { query = s; ctx.refresh(); } }))) : null);
  };

  const results = () => {
    if (!result) return null;
    const saved = new Set(tripEntries(store.state, tripId, 'web').filter((e) => e.saved).map((e) => e.refId));
    const when = new Date(result.at);
    const stamp = Number.isNaN(when.getTime()) ? '' : when.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
    const kinds = KINDS.filter((k) => result.places.some((p) => p.kind === k.id));
    const shown = result.places.filter((p) => kindFilter === 'all' || p.kind === kindFilter);
    const head = h('section', { class: 'card dest-card' },
      h('div', { class: 'dest-title' }, h('span', { class: 'dest-icon' }, icon('compass', { size: 22 })), h('div', {}, h('h2', { class: 'card-title', text: `${result.label}${chosen?.description ? ` · ${chosen.description}` : ''}` }), h('p', { class: 'muted small', text: result.lat === null ? 'No coordinates on record' : `${coordsText(result.lat, result.lon)} · places within 10 km · ${plural(result.places.length, 'place')}` }))),
      h('p', { class: 'muted small', text: `Live data from Wikidata and Wikipedia${stamp ? `, fetched ${stamp}` : ''}. Volunteer-written and not reviewed by PackWise. No prices or opening hours.` }),
      result.stale ? h('div', { class: 'banner banner-warn' }, icon('wifi', { size: 18 }), h('span', { text: 'Could not refresh, so this is the copy saved earlier on this device.' })) : result.fromCache ? h('p', { class: 'muted small', text: 'Shown from the copy saved on this device.' }) : null,
      h('div', { class: 'plan-actions' }, button({ label: 'Refresh', icon: 'refresh', variant: 'secondary', key: 'online-refresh', onClick: () => choose(chosen, true) }), button({ label: 'Search again', icon: 'search', variant: 'ghost', key: 'online-again', onClick: () => { phase = 'idle'; result = null; chosen = null; ctx.refresh(); } })));
    if (result.lat === null) return h('div', { class: 'guide-results' }, head, emptyState({ title: 'That entry has no location', text: 'A country or region has no single point to search around. Search for a town or city instead.', showCompanion: false }));
    if (!result.places.length) return h('div', { class: 'guide-results' }, head, emptyState({ title: 'No attractions found nearby', text: 'Wikipedia has nothing clearly recognisable around this point. Try a larger town nearby, or add your own places.', showCompanion: false, action: button({ label: 'Add your own place', variant: 'secondary', href: `#/trip/${tripId}/guide` }) }));
    return h('div', { class: 'guide-results' }, head,
      kinds.length > 1 ? h('div', { class: 'filter-bar', role: 'group', 'aria-label': 'Filter by type' }, h('div', { class: 'chips' }, chip({ label: 'All', count: result.places.length, active: kindFilter === 'all', key: 'k-all', onClick: () => { kindFilter = 'all'; ctx.refresh(); } }), ...kinds.map((k) => chip({ label: k.label, count: result.places.filter((p) => p.kind === k.id).length, active: kindFilter === k.id, key: `k-${k.id}`, onClick: () => { kindFilter = kindFilter === k.id ? 'all' : k.id; ctx.refresh(); } })))) : null,
      h('p', { class: 'sr-only', 'aria-live': 'polite', text: `${plural(shown.length, 'place')} shown` }),
      KINDS.map((k) => ({ k, list: shown.filter((p) => p.kind === k.id) })).filter((g) => g.list.length).map((g) => h('section', { class: 'guide-section', 'aria-labelledby': `ok-${g.k.id}` }, h('div', { class: 'guide-section-head' }, h('h2', { id: `ok-${g.k.id}`, class: 'section-title', text: g.k.label }), h('span', { class: 'muted small', text: plural(g.list.length, 'place') })), h('div', { class: 'place-grid' }, g.list.map((p) => webCard(p, saved.has(`w-${p.wp}`)))))),
      result.dropped ? h('p', { class: 'muted small', text: `${plural(result.dropped, 'nearby article')} left out because ${result.dropped === 1 ? 'it is' : 'they are'} not clearly an attraction (villages, streets, people, stations and similar).` }) : null);
  };

  return {
    title: 'Find places online',
    destroy() { alive = false; },
    build() {
      const trip = getTrip(store.state, tripId);
      if (!trip) return h('div');
      const tip = companionBubble(phase === 'idle' ? { id: `online-intro:${tripId}`, text: 'Nothing is sent until you tap Search online. You can also add places by hand in My Guide.', mood: 'happy' } : null, { onDismiss: ctx.refresh, className: 'explore-tip' });
      return h('div', { class: 'screen explore-screen online-screen' },
        pageHeader({ title: 'Find places', subtitle: `${trip.name}${tripSubtitle(trip) ? ` · ${tripSubtitle(trip)}` : ''}`, back: { href: `#/trip/${tripId}/explore`, label: 'Back to Explore' }, actions: [iconButton({ icon: 'pack', label: 'Open packing list', href: `#/trip/${tripId}` })] }),
        guideTabs(tripId, 'places'),
        searchForm(),
        h('p', { class: 'muted small' }, 'Searching sends only the place name to Wikipedia and Wikidata, and only when you tap the button.'),
        phase === 'idle' || phase === 'error' || phase === 'empty' || phase === 'choosing' || phase === 'searching' ? consent() : null,
        h('p', { class: 'sr-only', role: 'status', 'aria-live': 'polite', text: phase === 'searching' ? 'Searching' : phase === 'loading' ? 'Loading places' : '' }),
        phase === 'error' ? h('div', { class: 'banner banner-warn', role: 'alert' }, icon('alert', { size: 18 }), h('span', { text: error }), chosen ? button({ label: 'Try again', variant: 'secondary', key: 'online-retry', onClick: () => choose(chosen, true) }) : null) : null,
        phase === 'empty' ? emptyState({ title: `Nothing found for “${query}”`, text: 'Check the spelling or try the nearest larger town.', showCompanion: false }) : null,
        phase === 'choosing' ? h('section', { class: 'card', 'aria-label': 'Which place do you mean?' }, h('h2', { class: 'card-title', text: 'Which one do you mean?' }), notice ? h('div', { class: 'banner banner-warn', role: 'status' }, icon('wifi', { size: 18 }), h('span', { text: notice })) : null, h('p', { class: 'muted small', text: 'Several places can share a name. Pick the right one so the places shown are the right ones.' }), h('ul', { class: 'cand-list' }, candidates.map((c, i) => h('li', {}, h('button', { type: 'button', class: 'cand', 'data-key': `cand-${c.qid}`, onClick: () => choose(c) }, h('strong', { text: c.label }), h('span', { class: 'muted small', text: c.description || 'no description' }), icon('chevR', { size: 16, class: 'chev' })))))) : null,
        phase === 'loading' ? h('div', { class: 'center muted', 'aria-hidden': 'true' }, h('p', { text: 'Looking up places…' })) : null,
        phase === 'idle' ? tip : null,
        phase === 'done' ? results() : null,
        h('p', { class: 'muted small center' }, 'Data: ', h('a', { class: 'link', href: SOURCE_PAGES.wikidata, target: '_blank', rel: 'noopener noreferrer' }, 'Wikidata (CC0)'), ' and ', h('a', { class: 'link', href: SOURCE_PAGES.wikipedia, target: '_blank', rel: 'noopener noreferrer' }, 'Wikipedia'), '.'));
    },
  };
}
