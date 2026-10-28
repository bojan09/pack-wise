// Route: from the trip's starting point to its destination. Shows the straight-line distance and direction,
// opens the real route in the user's maps app, and (on a tap) finds notable places near the line between the two.
// PackWise knows no roads: it never shows a road distance or a travel time, and says so.
import { h } from '../dom.js';
import { icon } from '../ui/icons.js';
import { button, emptyState, field, iconButton } from '../ui/components.js';
import { showDialog } from '../ui/dialog.js';
import { toast } from '../ui/toast.js';
import { placeField } from '../ui/placefield.js';
import { webPlaceCard } from '../ui/webcard.js';
import { appleDirectionsUrl, googleDirectionsUrl, osmDirectionsUrl } from '../guide.js';
import { SOURCE_PAGES, coordsText, friendlyError, readCache, routeKey, routeLookup } from '../online.js';
import { MAX_WAYPOINTS, ROUTE_MAX_KM, ROUTE_MIN_KM, bearing, compass, corridorKm, distanceKm, kmText, onTheWay, travelMode } from '../route.js';
import { getPrefs } from '../prefs.js';
import { getTrip, tripEntries } from '../selectors.js';
import { plural } from '../format.js';
import { guideTabs, pageHeader, tripSubtitle } from './shared.js';

const usable = (p) => (p && !p.large ? p : null);

export function RouteScreen(ctx) {
  const { store, params } = ctx;
  const tripId = params.id;
  if (!getTrip(store.state, tripId)) return { redirect: '/trips', title: 'Trip not found', build: () => h('div') };
  ctx.setLastTrip(tripId);

  let phase = 'idle'; // idle | loading | done | error
  let result = null;
  let resultKey = '';
  let error = '';
  let alive = true;
  const live = (fn) => { if (alive) fn(); };

  async function find(from, to, fresh = false) {
    phase = 'loading'; error = ''; ctx.refresh();
    try {
      const r = await routeLookup(from, to, { fresh });
      live(() => { result = r; resultKey = routeKey(from, to); phase = 'done'; });
    } catch (e) {
      live(() => { error = friendlyError(e); phase = 'error'; });
    }
    live(() => ctx.refresh());
  }

  /** Pick the start or the destination from the map. Saved on the trip as soon as a place is picked. */
  function pointDialog(which) {
    const trip = getTrip(store.state, tripId);
    const cur = trip[which];
    const isStart = which === 'origin';
    return showDialog({
      title: isStart ? 'Where does the trip start?' : 'Where are you going?',
      build: (close) => {
        const input = h('input', { type: 'text', name: 'point', maxlength: 80, value: cur ? cur.name : isStart ? '' : trip.destination, placeholder: 'Town or city', autocomplete: 'off', 'data-autofocus': '' });
        const fieldEl = field({ label: isStart ? 'Starting from' : 'Destination', input, hint: getPrefs().placeSuggest ? 'Start typing and pick the right place from the list. What you type is sent to photon.komoot.io (OpenStreetMap).' : 'Type the place, tap Look up and pick it from the list. What you type is sent to photon.komoot.io (OpenStreetMap) only when you tap.' });
        fieldEl.insertBefore(placeField({
          input,
          enabled: () => getPrefs().placeSuggest,
          onPick: (p) => {
            const saved = store.updateTrip(tripId, { [which]: { name: p.name, label: p.label, lat: p.lat, lon: p.lon, cc: p.cc, osm: p.osm, large: p.large } });
            if (saved) toast(isStart ? `Starting from ${p.name}` : `Destination set to ${p.name}`, { tone: 'success' });
            close(Boolean(saved));
          },
          onClear: () => {},
        }), fieldEl.children[1]);
        return h('div', { class: 'form-stack' },
          fieldEl,
          !isStart ? h('p', { class: 'muted small', text: 'This sets the point on the map only. The destination name of the trip stays as you wrote it.' }) : null,
          h('div', { class: 'dialog-actions' },
            cur && isStart ? button({ label: 'Remove starting point', variant: 'ghost', onClick: () => { store.updateTrip(tripId, { origin: null }); close(true); } }) : null,
            h('span', { class: 'spacer' }),
            button({ label: 'Cancel', variant: 'ghost', onClick: () => close() })));
      },
    });
  }

  const endpointRow = (label, p, which) => h('div', { class: 'route-point' },
    h('span', { class: `route-dot route-dot-${which}`, 'aria-hidden': 'true' }),
    h('div', { class: 'route-point-text' },
      h('span', { class: 'muted small', text: label }),
      p ? h('strong', { text: p.name }) : h('strong', { class: 'muted', text: 'Not set' }),
      p ? h('span', { class: 'muted small', text: `${p.label} · ${coordsText(p.lat, p.lon)}` }) : null),
    button({ label: p ? 'Change' : 'Set', variant: p ? 'ghost' : 'secondary', key: `set-${which}`, ariaLabel: `${p ? 'Change' : 'Set'} ${label.toLowerCase()}`, onClick: () => pointDialog(which) }));

  function directions(from, to, mode, stops) {
    const link = (href, text, ic) => h('a', { class: 'btn btn-secondary', href, target: '_blank', rel: 'noopener noreferrer' }, icon(ic, { size: 16 }), text, h('span', { class: 'sr-only', text: ' (opens in a new tab)' }));
    return h('div', { class: 'route-links' },
      link(googleDirectionsUrl(from, to, mode), 'Google Maps', 'external'),
      link(appleDirectionsUrl(from, to, mode), 'Apple Maps', 'external'),
      link(osmDirectionsUrl(from, to), 'OpenStreetMap', 'pin'),
      stops.length ? h('a', { class: 'btn btn-primary', href: googleDirectionsUrl(from, to, mode, stops), target: '_blank', rel: 'noopener noreferrer', 'data-key': 'route-with-stops' }, icon('route', { size: 16 }), `Google Maps with ${plural(stops.length, 'saved stop')}`, h('span', { class: 'sr-only', text: ' (opens in a new tab)' })) : null);
  }

  function onTheWayCard(from, to, total) {
    const head = h('h2', { class: 'card-title', text: 'On the way' });
    if (total < ROUTE_MIN_KM) return h('section', { class: 'card' }, head, h('p', { class: 'muted small', text: `The destination is only ${kmText(total)} away, so there is nothing “on the way” that is not already around it. Places shows what is there.` }), h('div', {}, button({ label: 'Open Places', icon: 'compass', variant: 'secondary', href: `#/trip/${tripId}/explore` })));
    if (total > ROUTE_MAX_KM) return h('section', { class: 'card' }, head, h('p', { class: 'muted small', text: `This trip is over ${kmText(ROUTE_MAX_KM)} in a straight line. A search along a line that long is too heavy for the free map servers, and the road may go a very different way. Use the directions links above, or look up places around a stop with Find places.` }));
    const key = routeKey(from, to);
    if (phase === 'idle' || resultKey !== key) {
      const cached = readCache(key); // earlier search on this device: no request
      if (cached) { result = { ...cached, stale: false, fromCache: true }; resultKey = key; phase = 'done'; } else if (resultKey !== key && phase === 'done') { result = null; phase = 'idle'; }
    }
    const busy = phase === 'loading';
    const radius = corridorKm(total);
    const intro = h('p', { class: 'muted small', text: `Notable places (castles, museums, viewpoints, waterfalls and the like, the ones linked to Wikidata) within ${radius} km of the straight line between the two. Your road may run elsewhere, so check the detour in your maps app. Searching sends the coordinates of the start, the destination and points on the line between them to overpass-api.de (OpenStreetMap), only when you tap.` });
    const go = button({ label: busy ? 'Searching…' : 'Find places on the way', icon: 'search', variant: 'primary', key: 'route-go', disabled: busy, onClick: () => find(from, to) });
    if (phase !== 'done' || !result) {
      return h('section', { class: 'card route-way' }, head, intro, h('div', {}, go),
        h('p', { class: 'sr-only', role: 'status', 'aria-live': 'polite', text: busy ? 'Searching for places on the way' : '' }),
        phase === 'error' ? h('div', { class: 'banner banner-warn', role: 'alert' }, icon('alert', { size: 18 }), h('span', { text: error })) : null);
    }
    const saved = new Set(tripEntries(store.state, tripId, 'web').filter((e) => e.saved).map((e) => e.refId));
    const when = new Date(result.at);
    const stamp = Number.isNaN(when.getTime()) ? '' : when.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
    return h('section', { class: 'route-way' },
      h('div', { class: 'card' }, head,
        h('p', { class: 'muted small', text: `${plural(result.places.length, 'place')} within ${result.radiusKm || radius} km of the straight line, in travel order. Live data from OpenStreetMap${stamp ? `, fetched ${stamp}` : ''}; volunteer-edited and not reviewed by PackWise. Tap the heart to save a stop: saved stops go into My Guide and into the Google Maps route above.` }),
        result.stale ? h('div', { class: 'banner banner-warn' }, icon('wifi', { size: 18 }), h('span', { text: 'Could not refresh, so this is the copy saved earlier on this device.' })) : result.fromCache ? h('p', { class: 'muted small', text: 'Shown from the copy saved on this device.' }) : null,
        h('div', { class: 'plan-actions' }, button({ label: busy ? 'Refreshing…' : 'Refresh', icon: 'refresh', variant: 'secondary', key: 'route-refresh', disabled: busy, onClick: () => find(from, to, true) })),
        phase === 'error' ? h('div', { class: 'banner banner-warn', role: 'alert' }, icon('alert', { size: 18 }), h('span', { text: error })) : null),
      result.places.length
        ? h('ol', { class: 'route-stops' }, result.places.map((p) => h('li', {}, webPlaceCard({ store, tripId, p, saved: saved.has(`o-${p.osm}`), tags: [`${kmText(p.alongKm)} from the start`, p.offKm < 1 ? 'on the line' : `${kmText(p.offKm)} off the line`] }))))
        : emptyState({ title: 'Nothing notable found on the way', text: 'OpenStreetMap has no Wikidata-linked attractions near this line. Try Find places around a town you will pass through.', showCompanion: false, action: button({ label: 'Find places', variant: 'secondary', href: `#/trip/${tripId}/online` }) }));
  }

  return {
    title: 'Route',
    destroy() { alive = false; },
    build() {
      const trip = getTrip(store.state, tripId);
      if (!trip) return h('div');
      const from = usable(trip.origin);
      const to = usable(trip.place);
      const header = pageHeader({ title: 'Route', subtitle: `${trip.name}${tripSubtitle(trip) ? ` · ${tripSubtitle(trip)}` : ''}`, back: { href: `#/trip/${tripId}/explore`, label: 'Back to Explore' }, actions: [iconButton({ icon: 'pack', label: 'Open packing list', href: `#/trip/${tripId}` })] });
      const points = h('section', { class: 'card route-points', 'aria-label': 'Start and destination' },
        endpointRow('Starting point', from, 'origin'),
        endpointRow('Destination', to, 'place'),
        trip.place?.large ? h('p', { class: 'muted small', text: `“${trip.place.name}” is a country or region, so it has no single point to route to. Set a town or city instead.` }) : null);
      if (!from || !to) {
        return h('div', { class: 'screen explore-screen route-screen' }, header, guideTabs(tripId, 'route'), points,
          emptyState({ title: !from && !to ? 'Set where you start and where you are going' : !from ? 'Where does the trip start?' : 'Where exactly are you going?', text: 'With both on the map, PackWise shows the distance, opens directions in your maps app and can find places to see on the way.', showCompanion: false }));
      }
      const total = distanceKm(from, to);
      const mode = travelMode(trip.transport);
      const savedStops = onTheWay(tripEntries(store.state, tripId, 'web').filter((e) => e.saved && Number.isFinite(e.lat) && Number.isFinite(e.lon)).map((e) => ({ name: e.label, lat: e.lat, lon: e.lon })), from, to, { radiusKm: corridorKm(total), max: MAX_WAYPOINTS });
      const summary = h('section', { class: 'card route-summary' },
        h('div', { class: 'route-km' }, h('strong', { text: total < 0.5 ? 'Same place' : kmText(total) }), total < 0.5 ? null : h('span', { class: 'muted', text: ` in a straight line, heading ${compass(bearing(from, to))}` })),
        h('p', { class: 'muted small', text: 'Roads are longer than a straight line. Your maps app shows the real route and travel time.' }),
        trip.transport === 'flight' ? h('p', { class: 'small', text: 'You are flying: places on the way only help if you travel part of it overland.' }) : null,
        mode === 'transit' ? h('p', { class: 'muted small', text: 'Directions open in public transport mode, where the app supports it.' }) : null,
        directions(from, to, mode, savedStops));
      return h('div', { class: 'screen explore-screen route-screen' }, header, guideTabs(tripId, 'route'), points, summary,
        total >= 0.5 ? onTheWayCard(from, to, total) : null,
        h('p', { class: 'muted small center' }, 'Map data © ', h('a', { class: 'link', href: SOURCE_PAGES.copyright, target: '_blank', rel: 'noopener noreferrer' }, 'OpenStreetMap contributors'), ' (ODbL).'));
    },
  };
}
