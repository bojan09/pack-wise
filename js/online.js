// Optional live place lookup for destinations the built-in guide does not cover.
//
// Sources (free, no key, CORS-enabled): Wikidata (place search + coordinates, CC0) and the English Wikipedia
// (articles near a point + their one-line descriptions, CC0 short descriptions). Nothing is fetched unless the user
// taps "Search online"; only the typed place name and, afterwards, that place's coordinates are sent. Results are
// cached on the device so they work offline and survive a failed refresh.
//
// Honesty rules: no prices, opening hours or admission are ever inferred (admission is always "check"); a result
// without a recognisable attraction type is dropped, not guessed; everything shown says where it came from.
//
// Network access goes through `getJson` only, which refuses any host outside ONLINE_HOSTS.

export const ONLINE_HOSTS = ['www.wikidata.org', 'en.wikipedia.org'];
const WIKIDATA = 'https://www.wikidata.org/w/api.php';
const WIKIPEDIA = 'https://en.wikipedia.org/w/api.php';
/** Plain pages for the attribution line (opened by the user, never fetched). */
export const SOURCE_PAGES = { wikidata: 'https://www.wikidata.org/', wikipedia: 'https://en.wikipedia.org/' };
export const TIMEOUT_MS = 12000;
export const RADIUS_M = 10000; // the Wikipedia geosearch maximum
const CACHE_KEY = 'packwise.online.v1';
const CACHE_MAX = 10; // destinations kept for offline use (about 10 KB each)

export class OnlineError extends Error {
  /** @param {'offline'|'timeout'|'http'|'format'|'blocked'|'input'} code */
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const FRIENDLY = {
  offline: 'No connection. Saved results still work; try again when you are online.',
  timeout: 'The lookup took too long. Try again in a moment.',
  http: 'The lookup service is busy or unavailable right now. Try again later.',
  format: 'The lookup service sent something unexpected, so nothing was shown. Try again later.',
  blocked: 'That address is not allowed.',
  input: 'Type a place name of at least two letters.',
};
export const friendlyError = (e) => FRIENDLY[e?.code] || FRIENDLY.http;

// ------------------------------------------------------------------ network
export function apiUrl(base, params) {
  const u = new URL(base);
  for (const [k, v] of Object.entries({ format: 'json', formatversion: '2', origin: '*', ...params })) u.searchParams.set(k, String(v));
  return u.toString();
}

/** GET JSON from an allowed host only, with a timeout, no cookies and no referrer. */
export async function getJson(url, { fetchImpl = globalThis.fetch, timeoutMs = TIMEOUT_MS } = {}) {
  let host;
  try {
    const u = new URL(url);
    host = u.protocol === 'https:' ? u.hostname : '';
  } catch { host = ''; }
  if (!ONLINE_HOSTS.includes(host)) throw new OnlineError('blocked', FRIENDLY.blocked);
  const ctl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : null;
  try {
    const res = await fetchImpl(url, { method: 'GET', credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error', signal: ctl?.signal, headers: { accept: 'application/json' } });
    if (!res.ok) throw new OnlineError('http', FRIENDLY.http);
    let body;
    try { body = await res.json(); } catch { throw new OnlineError('format', FRIENDLY.format); }
    if (!body || typeof body !== 'object' || body.error) throw new OnlineError('format', FRIENDLY.format);
    return body;
  } catch (e) {
    if (e instanceof OnlineError) throw e;
    if (e?.name === 'AbortError') throw new OnlineError('timeout', FRIENDLY.timeout);
    throw new OnlineError('offline', FRIENDLY.offline); // fetch rejects with a TypeError when there is no connection
  } finally {
    if (timer) clearTimeout(timer);
  }
}

const cleanQuery = (q) => String(q ?? '').replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
const str = (v, n) => (typeof v === 'string' ? v.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n) : '');

// ------------------------------------------------------------------- search
/**
 * Candidate places for a typed name. Ambiguity is shown, never guessed: "Split" returns every Split with its
 * description so the user picks the right one.
 * @returns {Promise<{qid: string, label: string, description: string}[]>}
 */
export async function findPlaces(query, opts = {}) {
  const q = cleanQuery(query);
  if (q.length < 2) throw new OnlineError('input', FRIENDLY.input);
  const body = await getJson(apiUrl(WIKIDATA, { action: 'wbsearchentities', search: q, language: 'en', uselang: 'en', type: 'item', limit: 8 }), opts);
  if (!Array.isArray(body.search)) throw new OnlineError('format', FRIENDLY.format);
  return body.search
    .filter((s) => s && /^Q\d{1,12}$/.test(s.id || ''))
    .map((s) => ({ qid: s.id, label: str(s.label || s.match?.text, 80) || s.id, description: str(s.description, 120) }))
    .slice(0, 8);
}

/** Coordinates (Wikidata P625) of an item, or null when it has none. */
export async function coordsOf(qid, opts = {}) {
  if (!/^Q\d{1,12}$/.test(qid)) throw new OnlineError('input', FRIENDLY.input);
  const body = await getJson(apiUrl(WIKIDATA, { action: 'wbgetclaims', entity: qid, property: 'P625' }), opts);
  if (!body.claims || typeof body.claims !== 'object') throw new OnlineError('format', FRIENDLY.format); // the API always returns a claims object, empty when there are none
  const v = body.claims.P625?.[0]?.mainsnak?.datavalue?.value;
  const lat = Number(v?.latitude);
  const lon = Number(v?.longitude);
  return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : null;
}

// ---------------------------------------------------------- classification
const EXCLUDE = /\b(village|municipality|settlement|suburb|neighbou?rhood|district|county|region|province|railway|station|airport|school|university|college|hospital|company|politician|footballer|player|singer|actor|actress|born|disambiguation|census|population|hamlet|commune|motorway|highway|road|bus|metro|football club|stadium)\b/i;

/** Ordered: the first matching kind wins. Kinds are the same ids the built-in guide uses. */
const KIND_RULES = [
  ['museum', /\b(museum|gallery|exhibition)\b/i],
  ['religious', /\b(church|cathedral|monastery|mosque|synagogue|temple|chapel|basilica|abbey|shrine|convent)\b/i],
  ['viewpoint', /\b(viewpoint|lookout|observation|belvedere)\b/i],
  ['nature', /\b(mountain|peak|waterfall|cave|gorge|canyon|national park|nature reserve|forest|river|hill|valley|trail|glacier|volcano|cliff)\b/i],
  ['water', /\b(beach|lake|reservoir|harbou?r|bay|waterfront|promenade|coast|island|lagoon)\b/i],
  ['park', /\b(park|garden|gardens|botanical|zoo)\b/i],
  ['street', /\b(square|street|market|bazaar|boulevard|plaza|avenue|pedestrian)\b/i],
  ['history', /\b(castle|fortress|fort|citadel|palace|tower|ruins?|archaeological|monument|memorial|statue|bridge|old town|heritage|historic|historical|gate|wall|mansion|theatre|theater|library|clock|landmark|obelisk|arch|aqueduct|tomb|mausoleum)\b/i],
];

/** The built-in guide kind for a one-line Wikipedia description, or null when it is not clearly an attraction. */
export function classify(description) {
  const d = String(description ?? '');
  if (!d || EXCLUDE.test(d)) return null;
  for (const [kind, re] of KIND_RULES) if (re.test(d)) return kind;
  return null;
}

// ------------------------------------------------------------------ nearby
/**
 * Attractions within ~10 km of a point, nearest first. Two kinds of request: one geosearch for article titles and
 * coordinates, then the short descriptions in batches of 50 (the API limit), which decide whether each is an
 * attraction and of what kind.
 * @returns {Promise<{places: object[], dropped: number}>}
 */
export async function nearby(lat, lon, opts = {}) {
  if (!(Math.abs(lat) <= 90 && Math.abs(lon) <= 180)) throw new OnlineError('input', FRIENDLY.input);
  const geo = await getJson(apiUrl(WIKIPEDIA, { action: 'query', list: 'geosearch', gscoord: `${lat}|${lon}`, gsradius: RADIUS_M, gslimit: 100 }), opts);
  const hits = geo.query?.geosearch;
  if (!Array.isArray(hits)) throw new OnlineError('format', FRIENDLY.format);
  const base = hits.filter((h) => Number.isInteger(h?.pageid) && h.pageid > 0 && typeof h.title === 'string' && Number.isFinite(h.lat) && Number.isFinite(h.lon));
  const desc = new Map();
  for (let i = 0; i < base.length; i += 50) {
    const ids = base.slice(i, i + 50).map((h) => h.pageid).join('|');
    const body = await getJson(apiUrl(WIKIPEDIA, { action: 'query', prop: 'description', pageids: ids }), opts);
    for (const p of body.query?.pages || []) if (p && typeof p.description === 'string') desc.set(p.pageid, p.description);
  }
  const places = [];
  for (const h of base) {
    const description = str(desc.get(h.pageid), 120);
    const kind = classify(description);
    if (!kind) continue;
    places.push({ wp: h.pageid, name: str(h.title, 80), desc: description, kind, lat: h.lat, lon: h.lon, dist: Number.isFinite(h.dist) ? Math.round(h.dist) : null });
  }
  places.sort((a, b) => (a.dist ?? 1e9) - (b.dist ?? 1e9));
  return { places: places.slice(0, 60), dropped: base.length - places.length };
}

// -------------------------------------------------------------------- cache
const storage = () => { try { return globalThis.localStorage || null; } catch { return null; } };

export function readCache(qid) {
  try {
    const raw = JSON.parse(storage()?.getItem(CACHE_KEY) || 'null');
    const hit = raw?.v === 1 ? raw.items?.[qid] : null;
    return hit && Array.isArray(hit.places) ? hit : null;
  } catch { return null; }
}

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

export function writeCache(qid, value) {
  const blob = readBlob();
  blob.items[qid] = value;
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
 * Places around one chosen candidate. Live when possible; if the network fails and an earlier result exists, that
 * is returned and marked `stale` so the UI can say so. `fresh: true` forces a refresh attempt.
 * @returns {Promise<{qid: string, label: string, lat: number|null, lon: number|null, places: object[], dropped: number, at: string, stale: boolean, fromCache: boolean}>}
 */
export async function lookup(candidate, { fresh = false, now = () => new Date().toISOString(), ...opts } = {}) {
  const cached = readCache(candidate.qid);
  if (cached && !fresh) return { ...cached, stale: false, fromCache: true };
  try {
    const c = await coordsOf(candidate.qid, opts);
    if (!c) return { qid: candidate.qid, label: candidate.label, lat: null, lon: null, places: [], dropped: 0, at: now(), stale: false, fromCache: false };
    const { places, dropped } = await nearby(c.lat, c.lon, opts);
    const result = { qid: candidate.qid, label: candidate.label, lat: c.lat, lon: c.lon, places, dropped, at: now() };
    writeCache(candidate.qid, result);
    return { ...result, stale: false, fromCache: false };
  } catch (e) {
    if (cached && (e.code === 'offline' || e.code === 'timeout' || e.code === 'http')) return { ...cached, stale: true, fromCache: true };
    throw e;
  }
}

export const coordsText = (lat, lon) => (Number.isFinite(lat) && Number.isFinite(lon) ? `${lat.toFixed(5)}, ${lon.toFixed(5)}` : '');
