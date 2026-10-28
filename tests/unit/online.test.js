import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ONLINE_HOSTS, OnlineError, apiUrl, classify, clearCache, coordsOf, coordsText, findPlaces, friendlyError, getJson, lookup, nearby, readCache, writeCache } from '../../js/online.js';

const ok = (body) => ({ ok: true, status: 200, json: async () => body });
const makeLocalStorage = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m }; };

/** A fake Wikidata + Wikipedia. `log` records every URL requested. */
const fakeWeb = (log = []) => async (url) => {
  log.push(url);
  const u = new URL(url);
  const p = u.searchParams;
  if (u.hostname === 'www.wikidata.org') {
    if (p.get('action') === 'wbsearchentities') {
      return ok({ search: [{ id: 'Q1', label: 'Veles', description: 'city in North Macedonia' }, { id: 'Q2', label: 'Veles', description: 'village in Bulgaria' }, { id: 'bad<id>', label: 'x' }] });
    }
    if (p.get('action') === 'wbgetclaims') {
      return p.get('entity') === 'Q9' ? ok({ claims: {} }) : ok({ claims: { P625: [{ mainsnak: { datavalue: { value: { latitude: 41.7156, longitude: 21.7756 } } } }] } });
    }
  }
  if (u.hostname === 'en.wikipedia.org') {
    if (p.get('list') === 'geosearch') {
      return ok({ query: { geosearch: [
        { pageid: 10, title: 'Church of St. Panteleimon', lat: 41.71, lon: 21.77, dist: 300 },
        { pageid: 11, title: 'Veles Clock Tower', lat: 41.72, lon: 21.78, dist: 120 },
        { pageid: 12, title: 'Some Village', lat: 41.8, lon: 21.8, dist: 900 },
        { pageid: 13, title: 'Mystery', lat: 41.7, lon: 21.7, dist: 50 },
        { pageid: 14, title: 'Vardar', lat: 41.71, lon: 21.76, dist: 700 },
        { lat: 1, lon: 1, title: 'no id' },
      ] } });
    }
    if (p.get('prop') === 'description') {
      const d = { 10: 'Orthodox church in Veles', 11: 'Clock tower in Veles, North Macedonia', 12: 'Village in North Macedonia', 14: 'River in North Macedonia' };
      return ok({ query: { pages: p.get('pageids').split('|').map((id) => ({ pageid: Number(id), title: 't', ...(d[id] ? { description: d[id] } : {}) })) } });
    }
  }
  throw new Error(`unexpected ${url}`);
};

test('requests only go to the two allowed hosts, over https, with no cookies or referrer', async () => {
  const seen = [];
  const f = async (url, init) => { seen.push([url, init]); return ok({ search: [] }); };
  await getJson(apiUrl('https://www.wikidata.org/w/api.php', { action: 'x' }), { fetchImpl: f });
  assert.deepEqual([seen[0][1].credentials, seen[0][1].referrerPolicy, seen[0][1].method, seen[0][1].redirect], ['omit', 'no-referrer', 'GET', 'error']);
  for (const bad of ['https://evil.example/api', 'http://www.wikidata.org/w/api.php', 'https://www.wikidata.org.evil.example/', 'https://en.wikipedia.org@evil.example/', 'javascript:alert(1)', 'not a url']) {
    await assert.rejects(getJson(bad, { fetchImpl: f }), (e) => e.code === 'blocked', bad);
  }
  assert.equal(seen.length, 1, 'refused URLs never reached fetch');
  assert.deepEqual(ONLINE_HOSTS, ['www.wikidata.org', 'en.wikipedia.org']);
});

test('apiUrl encodes user input safely and always asks for CORS-friendly JSON', () => {
  const u = new URL(apiUrl('https://www.wikidata.org/w/api.php', { search: 'a&b=c#d é' }));
  assert.equal(u.searchParams.get('search'), 'a&b=c#d é');
  assert.equal(u.search.includes('&b=c'), false, 'the ampersand is encoded, not a new parameter');
  assert.deepEqual([u.searchParams.get('origin'), u.searchParams.get('format'), u.searchParams.get('formatversion')], ['*', 'json', '2']);
});

test('findPlaces: ambiguity is returned, bad ids dropped, input validated', async () => {
  const log = [];
  const r = await findPlaces('  Veles  ', { fetchImpl: fakeWeb(log) });
  assert.deepEqual(r, [{ qid: 'Q1', label: 'Veles', description: 'city in North Macedonia' }, { qid: 'Q2', label: 'Veles', description: 'village in Bulgaria' }]);
  assert.equal(new URL(log[0]).searchParams.get('search'), 'Veles');
  for (const q of ['', ' ', 'a', null, undefined]) await assert.rejects(findPlaces(q, { fetchImpl: fakeWeb() }), (e) => e.code === 'input');
  const long = await (async () => { const l = []; await findPlaces('x'.repeat(500), { fetchImpl: fakeWeb(l) }); return new URL(l[0]).searchParams.get('search'); })();
  assert.equal(long.length, 80);
  await assert.rejects(findPlaces('Veles', { fetchImpl: async () => ok({ nope: 1 }) }), (e) => e.code === 'format');
  await assert.rejects(findPlaces('Veles', { fetchImpl: async () => ok({ error: { code: 'x' } }) }), (e) => e.code === 'format');
});

test('coordsOf: parses P625, null when missing, rejects bad ids', async () => {
  assert.deepEqual(await coordsOf('Q1', { fetchImpl: fakeWeb() }), { lat: 41.7156, lon: 21.7756 });
  assert.equal(await coordsOf('Q9', { fetchImpl: fakeWeb() }), null);
  await assert.rejects(coordsOf('Q1; DROP', { fetchImpl: fakeWeb() }), (e) => e.code === 'input');
  const weird = async () => ok({ claims: { P625: [{ mainsnak: { datavalue: { value: { latitude: 999, longitude: 'x' } } } }] } });
  assert.equal(await coordsOf('Q1', { fetchImpl: weird }), null, 'out-of-range coordinates are refused');
});

test('classify keeps clear attractions only and maps them to the guide kinds', () => {
  const cases = { 'Orthodox church in Veles': 'religious', 'National museum in Skopje': 'museum', 'River in North Macedonia': 'nature', 'Waterfall in Serbia': 'nature', 'Public park in Belgrade': 'park', 'Medieval fortress': 'history', 'Pedestrian street in Belgrade': 'street', 'Beach in Montenegro': 'water', 'Viewpoint above the city': 'viewpoint', 'Mosque in Sarajevo': 'religious' };
  for (const [d, k] of Object.entries(cases)) assert.equal(classify(d), k, d);
  for (const d of ['Village in North Macedonia', 'Municipality in Serbia', 'Railway station in Belgrade', 'Footballer', 'Politician born in Skopje', 'Company', 'Disambiguation page', '', null, undefined, 'Something vague']) assert.equal(classify(d), null, String(d));
  assert.equal(classify('Church museum'), 'museum', 'first matching rule wins');
});

test('nearby: batches descriptions, drops what is not an attraction, sorts by distance, counts what was dropped', async () => {
  const log = [];
  const { places, dropped } = await nearby(41.7156, 21.7756, { fetchImpl: fakeWeb(log) });
  assert.deepEqual(places.map((p) => [p.wp, p.kind]), [[11, 'history'], [10, 'religious'], [14, 'nature']]);
  assert.equal(dropped, 2, 'the village and the page with no description');
  assert.deepEqual(places[0], { wp: 11, name: 't'.length ? 'Veles Clock Tower' : '', desc: 'Clock tower in Veles, North Macedonia', kind: 'history', lat: 41.72, lon: 21.78, dist: 120 });
  const geo = new URL(log[0]).searchParams;
  assert.deepEqual([geo.get('list'), geo.get('gscoord'), geo.get('gsradius'), geo.get('gslimit')], ['geosearch', '41.7156|21.7756', '10000', '100']);
  assert.equal(log.length, 2, 'one geosearch + one description batch');
  await assert.rejects(nearby(95, 0, { fetchImpl: fakeWeb() }), (e) => e.code === 'input');
  await assert.rejects(nearby(1, 1, { fetchImpl: async () => ok({ query: {} }) }), (e) => e.code === 'format');
});

test('nearby batches description requests in groups of 50', async () => {
  const log = [];
  const many = Array.from({ length: 100 }, (_, i) => ({ pageid: i + 1, title: `T${i}`, lat: 1, lon: 1, dist: i }));
  const f = async (url) => { log.push(url); const p = new URL(url).searchParams; return p.get('list') ? ok({ query: { geosearch: many } }) : ok({ query: { pages: p.get('pageids').split('|').map((id) => ({ pageid: +id, description: 'Museum in X' })) } }); };
  const { places } = await nearby(1, 1, { fetchImpl: f });
  assert.equal(log.length, 3);
  assert.ok(log.slice(1).every((u) => new URL(u).searchParams.get('pageids').split('|').length === 50));
  assert.equal(places.length, 60, 'capped');
});

test('network failures become clear, typed errors', async () => {
  const offline = async () => { throw new TypeError('Failed to fetch'); };
  await assert.rejects(findPlaces('Veles', { fetchImpl: offline }), (e) => e instanceof OnlineError && e.code === 'offline' && /No connection/.test(friendlyError(e)));
  const abort = async (_u, init) => new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
  await assert.rejects(getJson('https://en.wikipedia.org/w/api.php', { fetchImpl: abort, timeoutMs: 20 }), (e) => e.code === 'timeout');
  await assert.rejects(findPlaces('Veles', { fetchImpl: async () => ({ ok: false, status: 429, json: async () => ({}) }) }), (e) => e.code === 'http');
  await assert.rejects(findPlaces('Veles', { fetchImpl: async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('bad'); } }) }), (e) => e.code === 'format');
  assert.match(friendlyError(new Error('mystery')), /busy or unavailable/);
});

test('lookup: live result is cached; a later failure falls back to the cache and says so; fresh refreshes', async () => {
  globalThis.localStorage = makeLocalStorage();
  try {
    const cand = { qid: 'Q1', label: 'Veles' };
    const live = await lookup(cand, { fetchImpl: fakeWeb(), now: () => '2026-10-28T10:00:00Z' });
    assert.deepEqual([live.fromCache, live.stale, live.places.length, live.lat], [false, false, 3, 41.7156]);
    const cached = await lookup(cand, { fetchImpl: async () => { throw new Error('must not be called'); } });
    assert.deepEqual([cached.fromCache, cached.stale, cached.at], [true, false, '2026-10-28T10:00:00Z']);
    const offline = async () => { throw new TypeError('x'); };
    const stale = await lookup(cand, { fresh: true, fetchImpl: offline });
    assert.deepEqual([stale.fromCache, stale.stale, stale.places.length], [true, true, 3], 'refresh failed offline: old data, flagged');
    await assert.rejects(lookup({ qid: 'Q5', label: 'Nowhere' }, { fetchImpl: offline }), (e) => e.code === 'offline', 'no cache, no network: an error, not an empty list');
    await assert.rejects(lookup(cand, { fresh: true, fetchImpl: async () => ({ ok: true, json: async () => ({ nope: 1 }) }) }), (e) => e.code === 'format', 'garbage is never papered over with stale data');
    const none = await lookup({ qid: 'Q9', label: 'Atlantis' }, { fetchImpl: fakeWeb(), now: () => 'x' });
    assert.deepEqual([none.lat, none.places.length], [null, 0], 'a place without coordinates returns no places');
  } finally { delete globalThis.localStorage; }
});

test('cache keeps the 10 newest destinations, tolerates corrupt or missing storage', () => {
  globalThis.localStorage = makeLocalStorage();
  try {
    for (let i = 1; i <= 14; i += 1) writeCache(`Q${i}`, { places: [], at: `2026-10-${String(10 + i).padStart(2, '0')}T00:00:00Z`, label: 'x' });
    assert.equal(readCache('Q1'), null);
    assert.ok(readCache('Q14') && readCache('Q5'));
    assert.equal(Object.keys(JSON.parse(globalThis.localStorage.getItem('packwise.online.v1')).items).length, 10);
    globalThis.localStorage.setItem('packwise.online.v1', '{not json');
    assert.equal(readCache('Q14'), null);
    writeCache('Q1', { places: [], at: 'x', label: 'y' }); // recovers
    assert.ok(readCache('Q1'));
    clearCache();
    assert.equal(readCache('Q1'), null);
  } finally { delete globalThis.localStorage; }
  assert.equal(readCache('Q1'), null, 'no storage at all');
  assert.doesNotThrow(() => writeCache('Q1', { places: [], at: 'x' }));
});

test('coordsText formats and refuses junk', () => {
  assert.equal(coordsText(41.71563, 21.77561), '41.71563, 21.77561');
  assert.equal(coordsText(NaN, 1), '');
});

import { recallCandidates, rememberCandidates } from '../../js/online.js';

test('an earlier search can be recalled offline; recall ignores case and spacing; empty results are not kept', () => {
  globalThis.localStorage = makeLocalStorage();
  try {
    assert.equal(recallCandidates('Veles'), null);
    rememberCandidates('  Veles ', [{ qid: 'Q1', label: 'Veles', description: 'city' }]);
    assert.deepEqual(recallCandidates('veles'), [{ qid: 'Q1', label: 'Veles', description: 'city' }]);
    rememberCandidates('Nowhere', []);
    assert.equal(recallCandidates('Nowhere'), null);
    writeCache('Q1', { places: [], at: '2026-10-28', label: 'x' }); // writing results keeps the remembered searches
    assert.ok(recallCandidates('Veles'));
    for (let i = 0; i < 30; i += 1) rememberCandidates(`city ${i}`, [{ qid: `Q${i}`, label: 'x', description: '' }], `2026-10-${String(i % 28 + 1).padStart(2, '0')}`);
    assert.ok(Object.keys(JSON.parse(globalThis.localStorage.getItem('packwise.online.v1')).q).length <= 20);
  } finally { delete globalThis.localStorage; }
});
