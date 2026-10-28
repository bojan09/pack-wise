// Destination guide logic: matching a trip's destination text to the catalog, filtering and
// grouping places. Pure (no DOM, no storage) so it is unit-testable.

export const KINDS = [
  { id: 'history', label: 'History & heritage', icon: 'landmark' },
  { id: 'museum', label: 'Museums', icon: 'museum' },
  { id: 'religious', label: 'Sacred sites', icon: 'dome' },
  { id: 'street', label: 'Streets, squares & markets', icon: 'street' },
  { id: 'park', label: 'Parks & gardens', icon: 'tree' },
  { id: 'viewpoint', label: 'Viewpoints', icon: 'binoculars' },
  { id: 'water', label: 'Beaches & waterfront', icon: 'wave' },
  { id: 'nature', label: 'Nature & trails', icon: 'mountain' },
];

export const ADMISSION = {
  free: { label: 'Free area', note: 'Entry to the area is normally free. Attractions inside can still charge, and free entry may depend on date, age, residency or special exhibitions.' },
  paid: { label: 'Ticketed', note: 'Normally ticketed. PackWise does not list prices or opening hours; check the official source before you go.' },
  check: { label: 'Check admission', note: 'Admission varies or is unknown here. It may depend on date, age, residency or events. Check before you go.' },
};

export const SECTIONS = [
  { id: 'free', title: 'Free to Explore', blurb: 'Open public places. Entry to the area is normally free.' },
  { id: 'ticket', title: 'Worth the Ticket', blurb: 'Normally ticketed. Prices and hours are not listed.' },
  { id: 'check', title: 'Check Admission First', blurb: 'Admission varies or is unknown. Check before you go.' },
  { id: 'gems', title: 'Hidden Gems', blurb: 'Lesser-known places that reward the detour.' },
  { id: 'nature', title: 'Nature & Outdoors', blurb: 'Parks, trails, lakes and wild places.' },
];

// ------------------------------------------------------------------ matching
/** lower-case, strip diacritics/punctuation noise, collapse spaces */
export function normalizeName(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/đ/g, 'dj') // đ has no Unicode decomposition, so map it before stripping accents
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}\s&-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** "Belgrade → Novi Sad, Skopje" -> ['belgrade','novi sad','skopje'] */
export function splitStops(text) {
  return String(text ?? '')
    .split(/\s*(?:[,;/|+→>()]|\s[-–—]\s|\s(?:and|to|then)\s|\s&\s)\s*/i)
    .map(normalizeName)
    .filter(Boolean);
}

const norm = (list) => list.map(normalizeName);

/**
 * Match a trip's destination text against the catalog.
 * @returns {{
 *   stops: string[], matches: object[], countryOnly: object[], unmatched: string[],
 *   conflicts: {stop: string, country: string, destination: object}[], status: 'none'|'covered'|'partial'|'country'|'ambiguous'
 * }}
 */
export function matchDestination(text, catalog) {
  const stops = splitStops(text);
  const matches = [];
  const countryOnly = [];
  const unmatched = [];
  const conflicts = [];
  const byAlias = (stop) => catalog.destinations.filter((d) => norm([d.name, ...(d.aliases || [])]).includes(stop));
  const countryOf = (stop) => catalog.countries.find((c) => norm([c.name, ...(c.aliases || [])]).includes(stop));
  const coveredCountry = stops.map(countryOf).filter(Boolean);

  for (const stop of stops) {
    const dests = byAlias(stop);
    if (dests.length) {
      for (const d of dests) if (!matches.includes(d)) matches.push(d);
      continue;
    }
    const c = countryOf(stop);
    if (c) {
      if (!countryOnly.includes(c)) countryOnly.push(c);
      continue;
    }
    unmatched.push(stop);
  }
  // "Split, Montenegro": a covered city together with a different covered country is ambiguous
  for (const d of matches) {
    const other = coveredCountry.find((c) => c.id !== d.countryCode);
    if (other && !coveredCountry.some((c) => c.id === d.countryCode)) conflicts.push({ stop: normalizeName(d.name), country: other.name, destination: d });
  }
  const conflicted = new Set(conflicts.map((c) => c.destination));
  const good = matches.filter((d) => !conflicted.has(d));
  // countries mentioned alongside a matched city of that country are just context, not a separate ask
  const lonely = countryOnly.filter((c) => !good.some((d) => d.countryCode === c.id) && !conflicts.some((x) => x.country === c.name && false));
  let status = 'none';
  if (conflicts.length && !good.length) status = 'ambiguous';
  else if (good.length && (unmatched.length || lonely.length || conflicts.length)) status = 'partial';
  else if (good.length) status = 'covered';
  else if (lonely.length && !unmatched.length) status = 'country'; // "Veles, North Macedonia": an uncovered town in a covered country is not a country-only trip
  return { stops, matches: good, countryOnly: lonely, unmatched, conflicts, status };
}

export const citiesInCountry = (catalog, countryId) => catalog.destinations.filter((d) => d.countryCode === countryId);

// ----------------------------------------------------------- filter & grouping
export const sectionOf = (p) => (p.gem ? 'gems' : p.kind === 'nature' ? 'nature' : p.admission === 'free' ? 'free' : p.admission === 'paid' ? 'ticket' : 'check');

export const refId = (dest, place) => `${dest.id}/${place.id}`;

/**
 * Which filters are worth showing for this destination: a filter only appears when it would
 * actually split the list (at least two different outcomes).
 */
export function availableFilters(places) {
  const admissions = [...new Set(places.map((p) => p.admission))];
  const kinds = KINDS.filter((k) => places.some((p) => p.kind === k.id));
  const hasIndoor = places.some((p) => p.setting === 'indoor' || p.setting === 'both');
  const hasOutdoor = places.some((p) => p.setting === 'outdoor' || p.setting === 'both');
  const family = places.filter((p) => p.family).length;
  return {
    admission: admissions.length > 1 ? ['free', 'paid', 'check'].filter((a) => admissions.includes(a)) : [],
    kinds: kinds.length > 1 ? kinds : [],
    setting: hasIndoor && hasOutdoor && places.some((p) => p.setting === 'indoor') && places.some((p) => p.setting === 'outdoor'),
    family: family > 0 && family < places.length,
  };
}

/** @param {{admission?: string, kind?: string, setting?: string, family?: boolean, saved?: boolean}} f  @param {Set<string>} savedRefs */
export function filterPlaces(dest, f, savedRefs = new Set()) {
  return dest.places.filter((p) => {
    if (f.admission && f.admission !== 'all' && p.admission !== f.admission) return false;
    if (f.kind && f.kind !== 'all' && p.kind !== f.kind) return false;
    if (f.setting === 'indoor' && p.setting === 'outdoor') return false;
    if (f.setting === 'outdoor' && p.setting === 'indoor') return false;
    if (f.family && !p.family) return false;
    if (f.saved && !savedRefs.has(refId(dest, p))) return false;
    return true;
  });
}

export function groupSections(places) {
  return SECTIONS.map((s) => ({ ...s, places: places.filter((p) => sectionOf(p) === s.id) })).filter((s) => s.places.length);
}

// ------------------------------------------------------------------ links
// Outbound links only: opened by the user in a new tab, never fetched by the app.
export const osmSearchUrl = (text) => `https://www.openstreetmap.org/search?query=${encodeURIComponent(text)}`;
export const mapSearchUrl = (place, dest) => osmSearchUrl(`${place.name}, ${dest.name}, ${dest.country}`);
export const googleMapsUrl = (place, dest) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([place.name, dest.name, dest.country].filter(Boolean).join(', '))}`;
/** Search links for a destination the catalog does not cover: ordinary web searches, nothing is claimed. */
/** Links for a place whose coordinates came from a source (the online lookup): exact pins, no guessing. */
export const googleCoordUrl = (lat, lon) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lon}`)}`;
export const osmCoordUrl = (lat, lon) => `https://www.openstreetmap.org/?mlat=${encodeURIComponent(lat)}&mlon=${encodeURIComponent(lon)}#map=17/${encodeURIComponent(lat)}/${encodeURIComponent(lon)}`;
export const wikipediaPageUrl = (pageId) => `https://en.wikipedia.org/?curid=${encodeURIComponent(pageId)}`; // legacy v4 entries only
export const osmObjectUrl = (osm) => { const m = /^([nwr])(\d{1,12})$/.exec(osm || ''); return m ? `https://www.openstreetmap.org/${{ n: 'node', w: 'way', r: 'relation' }[m[1]]}/${m[2]}` : ''; };
export const wikipediaTextUrl = (text) => `https://en.wikipedia.org/w/index.php?search=${encodeURIComponent(text)}`;
export const thingsToDoUrl = (text) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`things to do near ${text}`)}`;
export const wikipediaSearchUrl = (place, dest) => `https://en.wikipedia.org/w/index.php?search=${encodeURIComponent(`${place.name} ${dest.name}`)}`;

export function getPlace(catalog, ref) {
  const [destId, placeId] = String(ref).split('/');
  const dest = catalog.destinations.find((d) => d.id === destId);
  const place = dest?.places.find((p) => p.id === placeId);
  return place ? { dest, place } : null;
}
