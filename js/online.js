// Optional live place lookup for destinations the built-in guide does not cover, from OpenStreetMap.
//
// Sources (free, no API key, CORS-enabled): Nominatim (find a town or city by name) and the Overpass API (tagged
// places around a point). Data © OpenStreetMap contributors, ODbL. Nothing is fetched unless the user taps
// "Search online"; only the typed place name and, afterwards, that place's coordinates are sent.
//
// Honesty rules: a place is shown only if OpenStreetMap tags it as an attraction; fee, opening hours and wheelchair
// access are copied verbatim from its tags and labelled as community data; nothing is inferred or invented; places
// without a recognisable type are dropped and counted. There is no API key, and no AI model is a source of facts.
//
// The Route page adds one more tap-only Overpass search: notable places near the straight line between the trip's
// start and destination (only coordinates are sent).
//
// Network access goes through `getJson` only, which refuses any host outside ONLINE_HOSTS.
import { onTheWay, pathPoints, corridorKm, distanceKm } from './route.js';

export const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
export const OVERPASS_ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
export const PHOTON = 'https://photon.komoot.io/api/';
export const ONLINE_HOSTS = ['nominatim.openstreetmap.org', 'overpass-api.de', 'overpass.kumi.systems', 'photon.komoot.io'];
/** Plain pages for the attribution line (opened by the user, never fetched). */
export const SOURCE_PAGES = { osm: 'https://www.openstreetmap.org/', copyright: 'https://www.openstreetmap.org/copyright' };
export const TIMEOUT_MS = 20000;
export const RADIUS_M = 6000;
const CACHE_KEY = 'packwise.online.v2';
const CACHE_MAX = 10; // destinations kept for offline use
const MAX_PLACES = 60;

export class OnlineError extends Error {
  /** @param {'offline'|'timeout'|'http'|'format'|'blocked'|'input'|'cancelled'} code */
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const FRIENDLY = {
  offline: 'No connection. Saved results still work; try again when you are online.',
  timeout: 'The lookup took too long. Try again in a moment.',
  http: 'The map service is busy or unavailable right now. Try again later.',
  format: 'The map service sent something unexpected, so nothing was shown. Try again later.',
  blocked: 'That address is not allowed.',
  input: 'Type a place name of at least two letters.',
  cancelled: '',
};
export const friendlyError = (e) => FRIENDLY[e?.code] || FRIENDLY.http;

// ------------------------------------------------------------------ network
export function withParams(base, params) {
  const u = new URL(base);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v));
  return u.toString();
}

/**
 * GET JSON from an allowed host only, with a timeout and no cookies. Nominatim's usage policy asks for an
 * identifying referrer, so it gets the site origin only; Overpass gets none.
 */
export async function getJson(url, { fetchImpl = globalThis.fetch, timeoutMs = TIMEOUT_MS, signal } = {}) {
  let host = '';
  try {
    const u = new URL(url);
    host = u.protocol === 'https:' ? u.hostname : '';
  } catch { host = ''; }
  if (!ONLINE_HOSTS.includes(host)) throw new OnlineError('blocked', FRIENDLY.blocked);
  if (signal?.aborted) throw new OnlineError('cancelled', '');
  const ctl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : null;
  const onCancel = () => ctl?.abort('cancelled');
  signal?.addEventListener?.('abort', onCancel);
  try {
    const res = await fetchImpl(url, { method: 'GET', credentials: 'omit', referrerPolicy: host === 'nominatim.openstreetmap.org' ? 'origin' : 'no-referrer', redirect: 'error', signal: ctl?.signal, headers: { accept: 'application/json' } });
    if (!res.ok) throw new OnlineError('http', FRIENDLY.http);
    let body;
    try { body = await res.json(); } catch { throw new OnlineError('format', FRIENDLY.format); }
    if (!body || typeof body !== 'object') throw new OnlineError('format', FRIENDLY.format);
    return body;
  } catch (e) {
    if (e instanceof OnlineError) throw e;
    if (signal?.aborted) throw new OnlineError('cancelled', ''); // the caller moved on (e.g. the user kept typing)
    if (e?.name === 'AbortError') throw new OnlineError('timeout', FRIENDLY.timeout);
    throw new OnlineError('offline', FRIENDLY.offline); // fetch rejects with a TypeError when there is no connection
  } finally {
    if (timer) clearTimeout(timer);
    signal?.removeEventListener?.('abort', onCancel);
  }
}

const cleanQuery = (q) => String(q ?? '').replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
const str = (v, n) => (typeof v === 'string' ? v.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n) : '');
const inRange = (lat, lon) => Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;

// ------------------------------------------------------------- autocomplete
const LARGE_TYPES = new Set(['country', 'state', 'region', 'county', 'continent']);
const SKIP_TYPES = new Set(['house', 'street']);

/**
 * Type-ahead suggestions for the destination field (Photon, an OpenStreetMap search built for autocomplete;
 * Nominatim's policy forbids autocomplete). Called by the form only when suggestions are on, from 3 letters,
 * after a short pause; earlier requests are cancelled through `signal`.
 * @returns {Promise<{name: string, label: string, lat: number, lon: number, cc: string, osm: string, large: boolean}[]>}
 */
export async function suggestPlaces(query, opts = {}) {
  const q = cleanQuery(query);
  if (q.length < 3) return [];
  const body = await getJson(withParams(PHOTON, { q, limit: 7, lang: 'en' }), opts);
  if (!Array.isArray(body.features)) throw new OnlineError('format', FRIENDLY.format);
  const out = [];
  const seen = new Set();
  for (const f of body.features) {
    const p = f?.properties || {};
    const [lon, lat] = Array.isArray(f?.geometry?.coordinates) ? f.geometry.coordinates.map(Number) : [];
    const name = str(p.name, 80);
    if (!name || !inRange(lat, lon) || SKIP_TYPES.has(p.type) || ['highway', 'building'].includes(p.osm_key)) continue;
    const cc = typeof p.countrycode === 'string' && /^[A-Za-z]{2}$/.test(p.countrycode) ? p.countrycode.toUpperCase() : '';
    const where = [p.city !== name ? p.city : '', p.state !== name ? p.state : '', p.country !== name ? p.country : ''].map((x) => str(x, 40)).filter(Boolean);
    const label = str([name, ...[...new Set(where)]].join(', '), 120);
    if (seen.has(label.toLowerCase())) continue; // the same town as a node and as a boundary
    seen.add(label.toLowerCase());
    const t = String(p.osm_type || '').toLowerCase();
    out.push({ name, label, country: str(p.country, 60), lat, lon, cc, osm: ['n', 'w', 'r'].includes(t) && Number.isInteger(p.osm_id) ? `${t}${p.osm_id}` : '', large: LARGE_TYPES.has(p.type) || p.osm_value === 'country' });
  }
  return out.slice(0, 6);
}

/** A trip's stored place as a lookup candidate (so Explore can search around it without another name search). */
export const placeCandidate = (place) => (place && !place.large ? { id: place.osm || `p${place.lat.toFixed(3)},${place.lon.toFixed(3)}`, label: place.name, description: place.label, lat: place.lat, lon: place.lon, large: false } : null);

// ------------------------------------------------------------------- search
/**
 * Candidate places for a typed name (Nominatim). Ambiguity is shown, never guessed: "Split" returns every Split with
 * its region and country so the user picks. `large` marks countries, states and regions, which have no single
 * point to search around.
 * @returns {Promise<{id: string, label: string, description: string, lat: number, lon: number, large: boolean}[]>}
 */
export async function findPlaces(query, opts = {}) {
  const q = cleanQuery(query);
  if (q.length < 2) throw new OnlineError('input', FRIENDLY.input);
  const body = await getJson(withParams(NOMINATIM, { q, format: 'jsonv2', limit: 8, 'accept-language': 'en', dedupe: 1 }), opts);
  if (!Array.isArray(body)) throw new OnlineError('format', FRIENDLY.format);
  const out = [];
  for (const r of body) {
    const lat = Number(r?.lat);
    const lon = Number(r?.lon);
    if (!r || !['node', 'way', 'relation'].includes(r.osm_type) || !Number.isInteger(r.osm_id) || !inRange(lat, lon)) continue;
    const rank = Number(r.place_rank);
    const label = str(r.name || String(r.display_name || '').split(',')[0], 80);
    if (!label) continue;
    out.push({
      id: `${r.osm_type[0]}${r.osm_id}`,
      label,
      description: str(String(r.display_name || '').split(',').slice(1).join(','), 120) || str(r.type, 40),
      lat,
      lon,
      large: Number.isFinite(rank) && rank < 12, // country 4, state 8, region/county 10-12
    });
  }
  return out.slice(0, 8);
}

// ------------------------------------------------------------ OSM -> a place
const HISTORIC = new Set(['castle', 'fort', 'monument', 'memorial', 'ruins', 'archaeological_site', 'city_gate', 'tower', 'palace', 'manor', 'tomb', 'citywalls']);
const WORSHIP = new Set(['church', 'monastery']);

/** Which of the guide's kinds an element's tags describe, or null when it is not clearly an attraction. */
export function kindOf(tags = {}) {
  const t = tags;
  if (['museum', 'gallery'].includes(t.tourism)) return 'museum';
  if (t.amenity === 'place_of_worship' || WORSHIP.has(t.historic)) return 'religious';
  if (t.tourism === 'viewpoint') return 'viewpoint';
  if (['waterfall', 'peak', 'cave_entrance', 'hot_spring'].includes(t.natural) || t.waterway === 'waterfall' || t.leisure === 'nature_reserve') return 'nature';
  if (t.natural === 'beach') return 'water';
  if (['park', 'garden'].includes(t.leisure) || ['zoo', 'theme_park'].includes(t.tourism)) return 'park';
  if (HISTORIC.has(t.historic)) return 'history';
  if (t.tourism === 'attraction') return 'history';
  return null;
}

const TYPE_LABEL = { waterfall: 'Waterfall', peak: 'Peak', cave_entrance: 'Cave', hot_spring: 'Hot spring', beach: 'Beach' };
const titleCase = (s) => s.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

/** A short human description from the tags: the mapper's own `description` when present, else the tagged type. */
export function describe(tags = {}) {
  const own = str(tags['description:en'] || tags.description, 120);
  if (own) return own;
  if (tags.amenity === 'place_of_worship') return `Place of worship${tags.religion ? ` (${str(tags.religion, 20)})` : ''}`;
  const raw = tags.tourism === 'attraction' && tags.attraction ? tags.attraction : tags.historic || tags.tourism || tags.leisure || '';
  if (raw) return titleCase(str(raw, 40));
  if (tags.waterway === 'waterfall') return 'Waterfall';
  return TYPE_LABEL[tags.natural] || '';
}

const distM = (a, b, c, d) => {
  const R = 6371000;
  const rad = Math.PI / 180;
  const x = Math.sin(((c - a) * rad) / 2) ** 2 + Math.cos(a * rad) * Math.cos(c * rad) * Math.sin(((d - b) * rad) / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(x)));
};

/** Overpass QL for named attractions around a point. Numbers are sanitised, nothing user-typed is interpolated. */
export function overpassQuery(lat, lon, radius = RADIUS_M) {
  const la = Number(lat).toFixed(5);
  const lo = Number(lon).toFixed(5);
  const r = Math.max(500, Math.min(15000, Math.round(radius)));
  const a = `(around:${r},${la},${lo})`;
  return `[out:json][timeout:25];(`
    + `nwr["tourism"~"^(attraction|museum|gallery|viewpoint|zoo|theme_park)$"]["name"]${a};`
    + `nwr["historic"~"^(castle|fort|monument|memorial|ruins|archaeological_site|city_gate|tower|palace|manor|monastery|church|tomb|citywalls)$"]["name"]${a};`
    + `nwr["amenity"="place_of_worship"]["name"]["wikidata"]${a};`
    + `nwr["natural"~"^(waterfall|peak|cave_entrance|beach|hot_spring)$"]["name"]${a};`
    + `nwr["waterway"="waterfall"]["name"]${a};`
    + `nwr["leisure"~"^(park|garden|nature_reserve)$"]["name"]["wikidata"]${a};`
    + `);out center tags 300;`;
}

const ACCESS = { yes: 'yes', limited: 'limited', no: 'no' };

/**
 * Turn Overpass elements into places: attractions only, de-duplicated, notable ones first, nearest first.
 * @returns {{places: object[], dropped: number}}
 */
export function parseElements(elements, lat, lon, max = MAX_PLACES) {
  if (!Array.isArray(elements)) throw new OnlineError('format', FRIENDLY.format);
  const seen = new Set();
  const places = [];
  let dropped = 0;
  for (const el of elements) {
    const t = el?.tags;
    const type = { node: 'n', way: 'w', relation: 'r' }[el?.type];
    const pLat = Number(el?.lat ?? el?.center?.lat);
    const pLon = Number(el?.lon ?? el?.center?.lon);
    if (!t || !type || !Number.isInteger(el.id) || !inRange(pLat, pLon)) { dropped += 1; continue; }
    const name = str(t['name:en'] || t.name, 80);
    const kind = kindOf(t);
    if (!name || !kind) { dropped += 1; continue; }
    const key = `${str(t.name || name, 80).toLowerCase()}|${pLat.toFixed(3)}|${pLon.toFixed(3)}`; // by the local name, so name:en does not hide duplicates
    if (seen.has(key)) continue; // the same thing mapped as a node and as a way
    seen.add(key);
    const site = str(t.website || t['contact:website'], 200);
    places.push({
      osm: `${type}${el.id}`,
      name,
      desc: describe(t),
      kind,
      lat: pLat,
      lon: pLon,
      dist: distM(lat, lon, pLat, pLon),
      fee: t.fee === 'yes' || t.fee === 'no' ? t.fee : '',
      hours: str(t.opening_hours, 120),
      wheelchair: ACCESS[t.wheelchair] || '',
      site: /^https?:\/\/[^\s<>"']{3,200}$/i.test(site) ? site : '',
      notable: Boolean(t.wikidata || t.wikipedia),
    });
  }
  places.sort((a, b) => Number(b.notable) - Number(a.notable) || a.dist - b.dist);
  const top = places.slice(0, max).sort((a, b) => a.dist - b.dist);
  return { places: top.map(({ notable, ...p }) => p), dropped: dropped + Math.max(0, places.length - max) };
}

// ------------------------------------------------------------------ nearby
/** Run one Overpass query: the main server, then a mirror if the first is busy or unreachable. */
async function overpass(data, opts) {
  let lastError = null;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const body = await getJson(withParams(endpoint, { data }), opts);
      if (typeof body.remark === 'string' && /error|timed out|out of memory/i.test(body.remark) && !Array.isArray(body.elements)) throw new OnlineError('http', FRIENDLY.http);
      return body.elements;
    } catch (e) {
      lastError = e;
      if (!['http', 'timeout', 'offline'].includes(e.code)) throw e; // garbage or bad input will not improve on a mirror
    }
  }
  throw lastError;
}

/** Attractions around a point. */
export async function nearby(lat, lon, opts = {}) {
  if (!inRange(lat, lon)) throw new OnlineError('input', FRIENDLY.input);
  return parseElements(await overpass(overpassQuery(lat, lon, opts.radius), opts), lat, lon);
}

// ------------------------------------------------------------- on the way
/**
 * Overpass QL for notable attractions (those with a Wikidata link, so a long corridor stays small) within
 * `radiusM` of a polyline. Numbers only; nothing typed is interpolated.
 */
export function corridorQuery(points, radiusM) {
  const r = Math.max(1000, Math.min(10000, Math.round(radiusM)));
  const line = points.map((p) => `${Number(p.lat).toFixed(4)},${Number(p.lon).toFixed(4)}`).join(',');
  const a = `(around:${r},${line})`;
  return `[out:json][timeout:25];(`
    + `nwr["tourism"~"^(attraction|museum|gallery|viewpoint|zoo|theme_park)$"]["name"]["wikidata"]${a};`
    + `nwr["historic"~"^(castle|fort|monument|ruins|archaeological_site|city_gate|palace|monastery|church)$"]["name"]["wikidata"]${a};`
    + `nwr["amenity"="place_of_worship"]["name"]["wikidata"]${a};`
    + `nwr["natural"~"^(waterfall|peak|cave_entrance|beach|hot_spring)$"]["name"]["wikidata"]${a};`
    + `nwr["waterway"="waterfall"]["name"]["wikidata"]${a};`
    + `nwr["leisure"~"^(park|nature_reserve)$"]["name"]["wikidata"]${a};`
    + `);out center tags 400;`;
}

/** Notable attractions near the straight line from a to b, in travel order (see route.js for the geometry). */
export async function alongTheWay(a, b, opts = {}) {
  if (!a || !b || !inRange(a.lat, a.lon) || !inRange(b.lat, b.lon)) throw new OnlineError('input', FRIENDLY.input);
  const radiusKm = corridorKm(distanceKm(a, b));
  const { places, dropped } = parseElements(await overpass(corridorQuery(pathPoints(a, b), radiusKm * 1000), opts), a.lat, a.lon, 1000);
  const stops = onTheWay(places, a, b, { radiusKm });
  return { places: stops, dropped, radiusKm };
}

const pointKey = (p) => p.osm || `${p.lat.toFixed(3)},${p.lon.toFixed(3)}`;
export const routeKey = (a, b) => `route:${pointKey(a)}>${pointKey(b)}`;

/** Like `lookup`, for a route: cached for offline use, stale copy on network failure, `fresh` to refresh. */
export async function routeLookup(a, b, { fresh = false, now = () => new Date().toISOString(), ...opts } = {}) {
  if (!a || !b || !inRange(a.lat, a.lon) || !inRange(b.lat, b.lon)) throw new OnlineError('input', FRIENDLY.input);
  const id = routeKey(a, b);
  const cached = readCache(id);
  if (cached && !fresh) return { ...cached, stale: false, fromCache: true };
  try {
    const { places, dropped, radiusKm } = await alongTheWay(a, b, opts);
    const result = { id, label: `${a.name} → ${b.name}`, lat: a.lat, lon: a.lon, places, dropped, radiusKm, at: now() };
    writeCache(id, result);
    return { ...result, stale: false, fromCache: false };
  } catch (e) {
    if (cached && ['offline', 'timeout', 'http'].includes(e.code)) return { ...cached, stale: true, fromCache: true };
    throw e;
  }
}

// -------------------------------------------------------------------- cache
const storage = () => { try { return globalThis.localStorage || null; } catch { return null; } };

function readBlob() {
  let raw = null;
  try { raw = JSON.parse(storage()?.getItem(CACHE_KEY) || 'null'); } catch { /* corrupt cache: start over */ }
  return raw?.v === 1 ? { items: raw.items || {}, q: raw.q || {} } : { items: {}, q: {} };
}

function saveBlob({ items, q }) {
  try {
    const newest = (o, n) => Object.fromEntries(Object.entries(o).sort((a, b) => (b[1].at || '').localeCompare(a[1].at || '')).slice(0, n));
    storage()?.setItem(CACHE_KEY, JSON.stringify({ v: 1, items: newest(items, CACHE_MAX), q: newest(q, 20) }));
  } catch { /* storage full or blocked: the lookup still works, it just is not kept */ }
}

export function readCache(id) {
  const hit = readBlob().items[id];
  return hit && Array.isArray(hit.places) ? hit : null;
}

export function writeCache(id, value) {
  const blob = readBlob();
  blob.items[id] = value;
  saveBlob(blob);
}

const qKey = (q) => cleanQuery(q).toLowerCase();

/** Remember which places a search offered, so the same search still works with no connection. */
export function rememberCandidates(query, candidates, at = new Date().toISOString()) {
  const k = qKey(query);
  if (!k || !candidates.length) return;
  const blob = readBlob();
  blob.q[k] = { at, candidates };
  saveBlob(blob);
}

export function recallCandidates(query) {
  const hit = readBlob().q[qKey(query)];
  return hit && Array.isArray(hit.candidates) && hit.candidates.length ? hit.candidates : null;
}

export const clearCache = () => { try { storage()?.removeItem(CACHE_KEY); } catch { /* ignore */ } };

/**
 * Places around one chosen candidate. Live when possible; if the network fails and an earlier result exists, that is
 * returned and marked `stale` so the UI can say so. `fresh: true` forces a refresh attempt.
 * @returns {Promise<{id: string, label: string, lat: number, lon: number, places: object[], dropped: number, at: string, stale: boolean, fromCache: boolean}>}
 */
export async function lookup(candidate, { fresh = false, now = () => new Date().toISOString(), ...opts } = {}) {
  if (!candidate || !inRange(candidate.lat, candidate.lon)) throw new OnlineError('input', FRIENDLY.input);
  const cached = readCache(candidate.id);
  if (cached && !fresh) return { ...cached, stale: false, fromCache: true };
  try {
    const { places, dropped } = await nearby(candidate.lat, candidate.lon, opts);
    const result = { id: candidate.id, label: candidate.label, lat: candidate.lat, lon: candidate.lon, places, dropped, at: now() };
    writeCache(candidate.id, result);
    return { ...result, stale: false, fromCache: false };
  } catch (e) {
    if (cached && (e.code === 'offline' || e.code === 'timeout' || e.code === 'http')) return { ...cached, stale: true, fromCache: true };
    throw e;
  }
}

export const coordsText = (lat, lon) => (Number.isFinite(lat) && Number.isFinite(lon) ? `${lat.toFixed(5)}, ${lon.toFixed(5)}` : '');
