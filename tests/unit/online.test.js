import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NOMINATIM, ONLINE_HOSTS, OVERPASS_ENDPOINTS, OnlineError, clearCache, coordsText, describe, findPlaces, friendlyError, getJson, kindOf, lookup, nearby, overpassQuery, parseElements, readCache, recallCandidates, rememberCandidates, withParams, writeCache } from '../../js/online.js';

const ok = (body) => ({ ok: true, status: 200, json: async () => body });
const makeLocalStorage = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };

const NOMINATIM_BODY = [
  { place_id: 1, osm_type: 'relation', osm_id: 1234, lat: '41.7156', lon: '21.7756', name: 'Veles', display_name: 'Veles, Municipality of Veles, North Macedonia', type: 'administrative', place_rank: 16 },
  { place_id: 2, osm_type: 'node', osm_id: 99, lat: '42.5', lon: '25.1', name: 'Veles', display_name: 'Veles, Obshtina X, Bulgaria', type: 'village', place_rank: 19 },
  { place_id: 3, osm_type: 'relation', osm_id: 5, lat: '41.6', lon: '21.7', name: 'North Macedonia', display_name: 'North Macedonia', type: 'administrative', place_rank: 4 },
  { place_id: 4, osm_type: 'bogus', osm_id: 1, lat: '1', lon: '1', name: 'x' },
  { place_id: 5, osm_type: 'node', osm_id: 7, lat: 'NaN', lon: '1', name: 'bad coords' },
];
const ELEMENTS = [
  { type: 'node', id: 11, lat: 41.72, lon: 21.78, tags: { name: 'Clock Tower', tourism: 'attraction', attraction: 'clock_tower', fee: 'no', wheelchair: 'yes', website: 'https://example.org/tower', wikidata: 'Q1' } },
  { type: 'way', id: 12, center: { lat: 41.71, lon: 21.77 }, tags: { name: 'City Museum', 'name:en': 'Veles City Museum', tourism: 'museum', fee: 'yes', opening_hours: 'Tu-Su 09:00-17:00', description: 'Local history' } },
  { type: 'node', id: 13, lat: 41.711, lon: 21.771, tags: { name: 'St. Panteleimon', amenity: 'place_of_worship', religion: 'christian', wikidata: 'Q2' } },
  { type: 'way', id: 14, center: { lat: 41.71, lon: 21.77 }, tags: { name: 'City Museum', tourism: 'museum' } },
  { type: 'relation', id: 15, center: { lat: 41.7, lon: 21.7 }, tags: { name: 'Babuna waterfall', waterway: 'waterfall' } },
  { type: 'node', id: 16, lat: 41.7, lon: 21.7, tags: { name: 'A shop', shop: 'bakery' } },
  { type: 'node', id: 17, lat: 41.7, lon: 21.7, tags: { tourism: 'museum' } },
  { type: 'node', id: 18, lat: 99, lon: 21.7, tags: { name: 'Off the map', tourism: 'museum' } },
  { id: 19, tags: { name: 'No type', tourism: 'museum' } },
];

/** A fake Nominatim + Overpass. `log` records every request. */
const fakeWeb = (log = [], { overpass = ELEMENTS } = {}) => async (url, init = {}) => {
  log.push({ url, init });
  const u = new URL(url);
  if (u.hostname === 'nominatim.openstreetmap.org') return ok(NOMINATIM_BODY);
  if (u.hostname === 'overpass-api.de' || u.hostname === 'overpass.kumi.systems') return ok({ elements: overpass });
  throw new Error(`unexpected ${url}`);
};

test('requests only go to the allowed OpenStreetMap hosts, over https, as plain GETs without cookies', async () => {
  const seen = [];
  const f = async (url, init) => { seen.push([url, init]); return ok([]); };
  await getJson(withParams(NOMINATIM, { q: 'x' }), { fetchImpl: f });
  await getJson(withParams(OVERPASS_ENDPOINTS[0], { data: 'x' }), { fetchImpl: f });
  assert.deepEqual(seen.map((s) => [s[1].method, s[1].credentials, s[1].redirect]), [['GET', 'omit', 'error'], ['GET', 'omit', 'error']]);
  assert.equal(seen[0][1].referrerPolicy, 'origin', 'Nominatim asks for an identifying referrer: the site origin only');
  assert.equal(seen[1][1].referrerPolicy, 'no-referrer');
  for (const bad of ['https://evil.example/api', 'http://nominatim.openstreetmap.org/search', 'https://nominatim.openstreetmap.org.evil.example/', 'https://overpass-api.de@evil.example/', 'https://en.wikipedia.org/w/api.php', 'javascript:alert(1)', 'not a url']) {
    await assert.rejects(getJson(bad, { fetchImpl: f }), (e) => e.code === 'blocked', bad);
  }
  assert.equal(seen.length, 2, 'refused URLs never reached fetch');
  assert.deepEqual(ONLINE_HOSTS, ['nominatim.openstreetmap.org', 'overpass-api.de', 'overpass.kumi.systems']);
  assert.ok(OVERPASS_ENDPOINTS.every((e) => ONLINE_HOSTS.includes(new URL(e).hostname)));
});

test('findPlaces: ambiguity is returned with region and country, regions are flagged, junk dropped, input validated', async () => {
  const log = [];
  const r = await findPlaces('  Veles  ', { fetchImpl: fakeWeb(log) });
  assert.deepEqual(r.map((c) => [c.id, c.label, c.description, c.large]), [['r1234', 'Veles', 'Municipality of Veles, North Macedonia', false], ['n99', 'Veles', 'Obshtina X, Bulgaria', false], ['r5', 'North Macedonia', 'administrative', true]]);
  assert.deepEqual([r[0].lat, r[0].lon], [41.7156, 21.7756]);
  const sent = new URL(log[0].url).searchParams;
  assert.deepEqual([sent.get('q'), sent.get('format'), sent.get('limit'), sent.get('accept-language')], ['Veles', 'jsonv2', '8', 'en']);
  for (const q of ['', ' ', 'a', null, undefined]) await assert.rejects(findPlaces(q, { fetchImpl: fakeWeb() }), (e) => e.code === 'input');
  const l = []; await findPlaces('x'.repeat(500), { fetchImpl: fakeWeb(l) });
  assert.equal(new URL(l[0].url).searchParams.get('q').length, 80);
  const l2 = []; await findPlaces('a&b=c#d', { fetchImpl: fakeWeb(l2) });
  assert.equal(new URL(l2[0].url).searchParams.get('q'), 'a&b=c#d', 'user input stays one encoded parameter');
  await assert.rejects(findPlaces('Veles', { fetchImpl: async () => ok({ nope: 1 }) }), (e) => e.code === 'format');
});

test('kindOf maps OpenStreetMap tags to the guide kinds, and ignores everything else', () => {
  const cases = [[{ tourism: 'museum' }, 'museum'], [{ tourism: 'gallery' }, 'museum'], [{ amenity: 'place_of_worship' }, 'religious'], [{ historic: 'monastery' }, 'religious'], [{ tourism: 'viewpoint' }, 'viewpoint'], [{ waterway: 'waterfall' }, 'nature'], [{ natural: 'peak' }, 'nature'], [{ leisure: 'nature_reserve' }, 'nature'], [{ natural: 'beach' }, 'water'], [{ leisure: 'park' }, 'park'], [{ tourism: 'zoo' }, 'park'], [{ historic: 'castle' }, 'history'], [{ tourism: 'attraction' }, 'history']];
  for (const [t, k] of cases) assert.equal(kindOf(t), k, JSON.stringify(t));
  for (const t of [{}, { shop: 'bakery' }, { amenity: 'cafe' }, { historic: 'wayside_shrine' }, { tourism: 'hotel' }]) assert.equal(kindOf(t), null, JSON.stringify(t));
});

test('describe uses the mapper’s own description, else the tagged type, and never invents', () => {
  assert.equal(describe({ description: 'Local history', tourism: 'museum' }), 'Local history');
  assert.equal(describe({ tourism: 'attraction', attraction: 'clock_tower' }), 'Clock tower');
  assert.equal(describe({ historic: 'castle' }), 'Castle');
  assert.equal(describe({ amenity: 'place_of_worship', religion: 'christian' }), 'Place of worship (christian)');
  assert.equal(describe({ waterway: 'waterfall' }), 'Waterfall');
  assert.equal(describe({ natural: 'peak' }), 'Peak');
  assert.equal(describe({}), '');
});

test('overpassQuery contains only sanitised numbers and fixed tag filters', () => {
  const q = overpassQuery(41.71563, 21.77561, 6000);
  assert.match(q, /^\[out:json\]\[timeout:25\];\(/);
  assert.ok(q.includes('(around:6000,41.71563,21.77561)'));
  assert.ok(q.endsWith(');out center tags 300;'));
  assert.ok(overpassQuery(1, 2, 99999999).includes('around:15000,'), 'radius is capped');
  assert.ok(overpassQuery(1, 2, 1).includes('around:500,'), 'and floored');
  assert.doesNotMatch(overpassQuery('1;drop', '2" or "1', 5000), /drop|"\s*or/, 'non-numeric input cannot reach the query');
});

test('parseElements keeps named attractions, copies fee / hours / access / website verbatim, dedupes, ranks notable first', () => {
  const { places, dropped } = parseElements(ELEMENTS, 41.7156, 21.7756);
  assert.deepEqual(places.map((p) => p.osm).sort(), ['n11', 'n13', 'r15', 'w12']);
  assert.ok(places.every((p, i) => i === 0 || places[i - 1].dist <= p.dist), 'nearest first')
  const byId = Object.fromEntries(places.map((p) => [p.osm, p]));
  assert.deepEqual([byId.n11.fee, byId.n11.wheelchair, byId.n11.site, byId.n11.desc, byId.n11.kind], ['no', 'yes', 'https://example.org/tower', 'Clock tower', 'history']);
  assert.deepEqual([byId.w12.fee, byId.w12.hours, byId.w12.name, byId.w12.desc], ['yes', 'Tu-Su 09:00-17:00', 'Veles City Museum', 'Local history']);
  assert.deepEqual([byId.n13.kind, byId.n13.fee, byId.n13.hours], ['religious', '', ''], 'untagged fee and hours stay empty, never guessed');
  assert.equal(byId.r15.kind, 'nature');
  assert.ok(!places.some((p) => p.osm === 'w14'), 'the same museum mapped twice appears once');
  assert.equal(dropped, 4, 'shop, unnamed, off-map and untyped element');
  assert.ok(places.every((p) => !('notable' in p) && Number.isInteger(p.dist)));
  assert.throws(() => parseElements({}, 1, 1), (e) => e.code === 'format');
  const hostile = parseElements([{ type: 'node', id: 1, lat: 1, lon: 1, tags: { name: '<img src=x onerror=1>', tourism: 'museum', website: 'javascript:alert(1)', fee: 'maybe', wheelchair: 'sometimes', opening_hours: 'x'.repeat(500) } }], 1, 1).places[0];
  assert.deepEqual([hostile.site, hostile.fee, hostile.wheelchair, hostile.hours.length], ['', '', '', 120], 'unsafe or unknown values are dropped');
  assert.equal(hostile.name, '<img src=x onerror=1>', 'markup stays inert text (the UI only uses textContent)');
});

test('parseElements caps the list at 60, keeping notable places', () => {
  const many = Array.from({ length: 150 }, (_, i) => ({ type: 'node', id: i + 1, lat: 1 + i / 10000, lon: 1, tags: { name: `P${i}`, tourism: 'attraction', ...(i >= 140 ? { wikidata: 'Q1' } : {}) } }));
  const { places, dropped } = parseElements(many, 1, 1);
  assert.equal(places.length, 60);
  assert.ok([140, 141, 149].every((i) => places.some((p) => p.name === `P${i}`)), 'notable ones survive the cut');
  assert.equal(dropped, 90);
});

test('nearby: asks Overpass once, falls back to the mirror when the first is busy, never on garbage', async () => {
  const log = [];
  const r = await nearby(41.7156, 21.7756, { fetchImpl: fakeWeb(log) });
  assert.equal(log.length, 1);
  assert.equal(new URL(log[0].url).hostname, 'overpass-api.de');
  assert.ok(new URL(log[0].url).searchParams.get('data').includes('around:6000,41.71560,21.77560'));
  assert.ok(r.places.length >= 3);
  const mirrorLog = [];
  const busy = async (url, init) => { mirrorLog.push(new URL(url).hostname); return new URL(url).hostname === 'overpass-api.de' ? { ok: false, status: 429, json: async () => ({}) } : fakeWeb()(url, init); };
  const viaMirror = await nearby(41.7156, 21.7756, { fetchImpl: busy });
  assert.deepEqual(mirrorLog, ['overpass-api.de', 'overpass.kumi.systems']);
  assert.ok(viaMirror.places.length >= 3);
  const bothDown = async () => ({ ok: false, status: 504, json: async () => ({}) });
  await assert.rejects(nearby(1, 1, { fetchImpl: bothDown }), (e) => e.code === 'http');
  const garbage = []; await assert.rejects(nearby(1, 1, { fetchImpl: async (u) => { garbage.push(u); return ok({ elements: 'nope' }); } }), (e) => e.code === 'format');
  assert.equal(garbage.length, 1, 'a malformed answer is not retried');
  await assert.rejects(nearby(95, 0, { fetchImpl: fakeWeb() }), (e) => e.code === 'input');
  const timedOut = async () => ok({ remark: 'runtime error: Query timed out in "query" at line 3', elements: undefined });
  await assert.rejects(nearby(1, 1, { fetchImpl: timedOut }), (e) => e.code === 'http');
});

test('network failures become clear, typed errors', async () => {
  const offline = async () => { throw new TypeError('Failed to fetch'); };
  await assert.rejects(findPlaces('Veles', { fetchImpl: offline }), (e) => e instanceof OnlineError && e.code === 'offline' && /No connection/.test(friendlyError(e)));
  const abort = async (_u, init) => new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
  await assert.rejects(getJson(withParams(NOMINATIM, { q: 'x' }), { fetchImpl: abort, timeoutMs: 20 }), (e) => e.code === 'timeout');
  await assert.rejects(findPlaces('Veles', { fetchImpl: async () => ({ ok: false, status: 429, json: async () => ({}) }) }), (e) => e.code === 'http');
  await assert.rejects(findPlaces('Veles', { fetchImpl: async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('bad'); } }) }), (e) => e.code === 'format');
  assert.match(friendlyError(new Error('mystery')), /busy or unavailable/);
});

const CAND = { id: 'r1234', label: 'Veles', description: 'x', lat: 41.7156, lon: 21.7756, large: false };

test('lookup: live result is cached; a later failure falls back to the cache and says so; fresh refreshes', async () => {
  globalThis.localStorage = makeLocalStorage();
  try {
    const live = await lookup(CAND, { fetchImpl: fakeWeb(), now: () => '2026-10-28T10:00:00Z' });
    assert.deepEqual([live.fromCache, live.stale, live.places.length > 0, live.lat], [false, false, true, 41.7156]);
    const cached = await lookup(CAND, { fetchImpl: async () => { throw new Error('must not be called'); } });
    assert.deepEqual([cached.fromCache, cached.stale, cached.at], [true, false, '2026-10-28T10:00:00Z']);
    const offline = async () => { throw new TypeError('x'); };
    const stale = await lookup(CAND, { fresh: true, fetchImpl: offline });
    assert.deepEqual([stale.fromCache, stale.stale, stale.places.length === live.places.length], [true, true, true]);
    await assert.rejects(lookup({ ...CAND, id: 'n5' }, { fetchImpl: offline }), (e) => e.code === 'offline', 'no cache, no network: an error, not an empty list');
    await assert.rejects(lookup(CAND, { fresh: true, fetchImpl: async () => ok({ elements: 'nope' }) }), (e) => e.code === 'format', 'garbage is never papered over with stale data');
    await assert.rejects(lookup({ id: 'x', label: 'x', lat: NaN, lon: 1 }, { fetchImpl: fakeWeb() }), (e) => e.code === 'input');
  } finally { delete globalThis.localStorage; }
});

test('cache keeps the 10 newest destinations and 20 searches, recalls searches offline, tolerates corrupt or missing storage', () => {
  globalThis.localStorage = makeLocalStorage();
  try {
    for (let i = 1; i <= 14; i += 1) writeCache(`n${i}`, { places: [], at: `2026-10-${String(10 + i).padStart(2, '0')}T00:00:00Z`, label: 'x' });
    assert.equal(readCache('n1'), null);
    assert.ok(readCache('n14') && readCache('n5'));
    rememberCandidates('  Veles ', [CAND]);
    assert.deepEqual(recallCandidates('veles'), [CAND]);
    rememberCandidates('Nowhere', []);
    assert.equal(recallCandidates('Nowhere'), null);
    writeCache('n1', { places: [], at: 'z', label: 'y' });
    assert.ok(recallCandidates('Veles'), 'writing results keeps the remembered searches');
    for (let i = 0; i < 30; i += 1) rememberCandidates(`city ${i}`, [CAND], `2026-10-${String((i % 28) + 1).padStart(2, '0')}`);
    assert.ok(Object.keys(JSON.parse(globalThis.localStorage.getItem('packwise.online.v2')).q).length <= 20);
    globalThis.localStorage.setItem('packwise.online.v2', '{not json');
    assert.equal(readCache('n14'), null);
    writeCache('n1', { places: [], at: 'x', label: 'y' });
    assert.ok(readCache('n1'), 'recovers from a corrupt cache');
    clearCache();
    assert.equal(readCache('n1'), null);
  } finally { delete globalThis.localStorage; }
  assert.equal(readCache('n1'), null, 'no storage at all');
  assert.doesNotThrow(() => writeCache('n1', { places: [], at: 'x' }));
});

test('coordsText formats and refuses junk', () => {
  assert.equal(coordsText(41.71563, 21.77561), '41.71563, 21.77561');
  assert.equal(coordsText(NaN, 1), '');
});
