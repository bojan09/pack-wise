// One place found online (OpenStreetMap), as a card with a save heart and map links. Shared by "Find places"
// and the Route page. Fee, hours and wheelchair access are shown only as tagged, and labelled as community data.
import { h } from '../dom.js';
import { icon } from './icons.js';
import { KINDS, googleCoordUrl, osmCoordUrl, osmObjectUrl } from '../guide.js';
import { coordsText } from '../online.js';

const KIND = Object.fromEntries(KINDS.map((k) => [k.id, k]));

/** @param {{store: object, tripId: string, p: object, saved: boolean, tags?: string[]}} opts tags = extra facts (distance) */
export function webPlaceCard({ store, tripId, p, saved, tags = [] }) {
  const kind = KIND[p.kind];
  return h(
    'article',
    { class: `place-card web-card kind-${p.kind}`, 'data-osm': p.osm },
    h('div', { class: 'place-art', 'aria-hidden': 'true' }, h('span', { class: 'place-icon' }, icon(kind.icon, { size: 30 })), h('span', { class: `adm-badge ${p.fee === 'no' ? 'adm-free' : p.fee === 'yes' ? 'adm-paid' : 'adm-check'}`, text: p.fee === 'no' ? 'Free per OSM' : p.fee === 'yes' ? 'Ticketed per OSM' : 'Check admission' })),
    h('div', { class: 'place-body' },
      h('div', { class: 'place-head' }, h('h3', { text: p.name }), h('button', { type: 'button', class: `save-btn${saved ? ' is-saved' : ''}`, 'aria-pressed': saved ? 'true' : 'false', 'aria-label': saved ? `Saved: ${p.name}. Remove from this trip` : `Save ${p.name} to this trip`, 'data-key': `save-${p.osm}`, onClick: () => { if (saved) store.removeEntry(tripId, 'web', `o-${p.osm}`); else store.saveWebPlace(tripId, p); } }, icon('heart', { size: 20, fill: saved }))),
      h('p', { class: 'place-why', text: p.desc }),
      h('div', { class: 'place-tags' }, h('span', { class: 'tag' }, icon(kind.icon, { size: 13 }), kind.label), tags.map((t) => h('span', { class: 'tag', text: t }))),
      p.hours ? h('p', { class: 'small web-hours' }, h('strong', { text: 'Hours (OpenStreetMap, may be outdated): ' }), p.hours) : null,
      p.wheelchair ? h('p', { class: 'small' }, h('strong', { text: 'Wheelchair access (OpenStreetMap): ' }), p.wheelchair) : null,
      h('p', { class: 'muted small coords', text: `${coordsText(p.lat, p.lon)} · from OpenStreetMap` }),
      h('div', { class: 'place-links' },
        h('a', { class: 'link', href: googleCoordUrl(p.lat, p.lon), target: '_blank', rel: 'noopener noreferrer' }, icon('external', { size: 14 }), 'Google Maps', h('span', { class: 'sr-only', text: ` at the coordinates of ${p.name} (opens in a new tab)` })),
        h('a', { class: 'link', href: osmCoordUrl(p.lat, p.lon), target: '_blank', rel: 'noopener noreferrer' }, icon('pin', { size: 14 }), 'OpenStreetMap', h('span', { class: 'sr-only', text: ` at the coordinates of ${p.name} (opens in a new tab)` })),
        h('a', { class: 'link', href: osmObjectUrl(p.osm), target: '_blank', rel: 'noopener noreferrer' }, icon('external', { size: 14 }), 'Map entry', h('span', { class: 'sr-only', text: ` for ${p.name} on OpenStreetMap (opens in a new tab)` })),
        p.site ? h('a', { class: 'link', href: p.site, target: '_blank', rel: 'noopener noreferrer' }, icon('external', { size: 14 }), 'Website', h('span', { class: 'sr-only', text: ` of ${p.name} (opens in a new tab)` })) : null)),
  );
}
