import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_WAYPOINTS, ROUTE_MAX_KM, alongTrack, bearing, compass, corridorKm, distanceKm, kmText, onTheWay, pathPoints, travelMode } from '../../js/route.js';
import { OVERPASS_ENDPOINTS, alongTheWay, clearCache, corridorQuery, readCache, routeKey, routeLookup } from '../../js/online.js';
import { appleDirectionsUrl, googleDirectionsUrl, osmDirectionsUrl } from '../../js/guide.js';
import { normalizeTrip } from '../../js/models.js';
import { migrate } from '../../js/migrations.js';

const SKOPJE = { name: 'Skopje', lat: 41.9981, lon: 21.4254, osm: 'r1' };
const THESS = { name: 'Thessaloniki', lat: 40.6401, lon: 22.9444, osm: 'r2' };
const MID = pathPoints(SKOPJE, THESS, 100, 3)[1];

test('distance, bearing and compass on a known pair', () => {
  const d = distanceKm(SKOPJE, THESS);
  assert.ok(d > 190 && d < 205, `Skopje–Thessaloniki ≈ 197 km, got ${d}`);
  assert.equal(distanceKm(SKOPJE, SKOPJE), 0);
  assert.equal(compass(bearing(SKOPJE, THESS)), 'south-east');
  assert.equal(compass(0), 'north');
  assert.equal(compass(359), 'north');
  assert.equal(compass(-90), 'west');
  assert.equal(kmText(196.6), '197 km');
  assert.equal(kmText(8.44), '8.4 km');
  assert.equal(kmText(1500), '1,500 km');
});

test('pathPoints: both ends kept, evenly spaced, capped', () => {
  const pts = pathPoints(SKOPJE, THESS, 50);
  assert.equal(pts.length, 5); // 197 km / 50 → 4 steps
  assert.deepEqual([pts[0].lat, pts[0].lon].map((x) => x.toFixed(4)), ['41.9981', '21.4254']);
  assert.deepEqual([pts.at(-1).lat, pts.at(-1).lon].map((x) => x.toFixed(4)), ['40.6401', '22.9444']);
  const steps = pts.slice(1).map((p, i) => distanceKm(pts[i], p));
  assert.ok(Math.max(...steps) - Math.min(...steps) < 0.5, 'even spacing');
  assert.equal(pathPoints({ lat: 0, lon: 0 }, { lat: 0, lon: 100 }, 50, 25).length, 25);
  assert.equal(pathPoints(SKOPJE, SKOPJE).length, 1);
});

test('alongTrack: on the line, beside it, and behind the start', () => {
  const on = alongTrack(SKOPJE, THESS, MID);
  assert.ok(Math.abs(on.alongKm - distanceKm(SKOPJE, THESS) / 2) < 1 && on.offKm < 0.1);
  const beside = alongTrack(SKOPJE, THESS, { lat: MID.lat + 0.1, lon: MID.lon + 0.1 }); // north-east of the line
  assert.ok(beside.offKm > 5 && beside.offKm < 20);
  const behind = alongTrack(SKOPJE, THESS, { lat: 42.3, lon: 21.0 });
  assert.ok(behind.alongKm < 0);
});

test('onTheWay keeps places near the line, between the ends, in travel order; nearest to the line wins a cap', () => {
  const p = (name, lat, lon) => ({ name, lat, lon });
  const places = [
    p('Far beside', MID.lat + 0.4, MID.lon + 0.4),
    p('Late on line', ...(() => { const q = pathPoints(SKOPJE, THESS, 50)[3]; return [q.lat, q.lon]; })()),
    p('Middle', MID.lat, MID.lon),
    p('At the start', SKOPJE.lat + 0.01, SKOPJE.lon + 0.01),
    p('Beyond the end', 40.3, 23.3),
    p('Behind', 42.3, 21.0),
    { name: 'no coords' },
  ];
  const out = onTheWay(places, SKOPJE, THESS);
  assert.deepEqual(out.map((x) => x.name), ['Middle', 'Late on line']);
  assert.ok(out[0].alongKm < out[1].alongKm);
  assert.equal(typeof out[0].offKm, 'number');
  assert.deepEqual(onTheWay([p('Slightly beside', MID.lat + 0.02, MID.lon + 0.02), p('Middle', MID.lat, MID.lon)], SKOPJE, THESS, { max: 1 }).map((x) => x.name), ['Middle']);
  assert.deepEqual(onTheWay(places, null, THESS), []);
  assert.equal(corridorKm(50), 3);
  assert.equal(corridorKm(200), 5);
  assert.equal(corridorKm(900), 8);
  assert.equal(travelMode('train'), 'transit');
  assert.equal(travelMode('bus'), 'transit');
  assert.equal(travelMode('flight'), 'driving');
  assert.equal(travelMode(''), 'driving');
});

test('directions links carry only coordinates and the mode; Google takes up to 9 stops', () => {
  const g = new URL(googleDirectionsUrl(SKOPJE, THESS, 'transit'));
  assert.equal(g.host, 'www.google.com');
  assert.equal(g.searchParams.get('origin'), '41.99810,21.42540');
  assert.equal(g.searchParams.get('destination'), '40.64010,22.94440');
  assert.equal(g.searchParams.get('travelmode'), 'transit');
  assert.equal(g.searchParams.get('waypoints'), null);
  const stops = Array.from({ length: 12 }, (_, i) => ({ lat: 41 + i / 100, lon: 22 }));
  assert.equal(new URL(googleDirectionsUrl(SKOPJE, THESS, 'driving', stops)).searchParams.get('waypoints').split('|').length, MAX_WAYPOINTS);
  const a = new URL(appleDirectionsUrl(SKOPJE, THESS));
  assert.deepEqual([a.host, a.searchParams.get('saddr'), a.searchParams.get('daddr'), a.searchParams.get('dirflg')], ['maps.apple.com', '41.99810,21.42540', '40.64010,22.94440', 'd']);
  assert.equal(new URL(appleDirectionsUrl(SKOPJE, THESS, 'transit')).searchParams.get('dirflg'), 'r');
  const o = new URL(osmDirectionsUrl(SKOPJE, THESS));
  assert.deepEqual([o.host, o.searchParams.get('route')], ['www.openstreetmap.org', '41.99810,21.42540;40.64010,22.94440']);
});

test('corridorQuery: numbers only, notable places only, radius clamped', () => {
  const q = corridorQuery(pathPoints(SKOPJE, THESS, 50), 5000);
  assert.match(q, /\(around:5000,41\.9981,21\.4254,/);
  assert.match(q, /40\.6401,22\.9444\)/);
  for (const line of q.split(';').filter((l) => l.startsWith('nwr'))) assert.match(line, /\["wikidata"\]/);
  assert.match(corridorQuery([{ lat: 1, lon: 2 }], 99999), /around:10000,/);
  assert.match(corridorQuery([{ lat: 1, lon: 2 }], 1), /around:1000,/);
  assert.ok(ROUTE_MAX_KM >= 1000);
});

test('trip origin is validated like the destination place; schema 6 data migrates as is', () => {
  const t = normalizeTrip({ id: 't1', name: 'Trip', origin: { name: 'Skopje', label: 'Skopje, North Macedonia', lat: 41.9981, lon: 21.4254, cc: 'MK', osm: 'r1' } });
  assert.equal(t.origin.name, 'Skopje');
  assert.equal(normalizeTrip({ id: 't1', name: 'Trip', origin: { name: 'x', lat: 200, lon: 0 } }).origin, null);
  assert.equal(normalizeTrip({ id: 't1', name: 'Trip' }).origin, null);
  const m = migrate({ trips: [{ id: 't1', name: 'Old' }] }, 6);
  assert.equal(m.data.trips[0].name, 'Old');
});

const store = () => { const m = new Map(); globalThis.localStorage = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const ok = (body) => ({ ok: true, status: 200, json: async () => body });
const el = (id, lat, lon, tags) => ({ type: 'node', id, lat, lon, tags: { wikidata: `Q${id}`, ...tags } });

test('alongTheWay: one Overpass request, attractions on the line only, travel order', async () => {
  const log = [];
  const elements = [
    el(1, MID.lat, MID.lon, { name: 'Middle Castle', historic: 'castle' }),
    el(2, SKOPJE.lat, SKOPJE.lon + 0.01, { name: 'Start Fortress', historic: 'fort' }),
    el(3, MID.lat + 1, MID.lon, { name: 'Far Museum', tourism: 'museum' }),
    el(4, MID.lat, MID.lon, { name: 'A bakery', shop: 'bakery' }),
  ];
  const fetchImpl = async (url) => { log.push(url); return ok({ elements }); };
  const r = await alongTheWay(SKOPJE, THESS, { fetchImpl });
  assert.equal(log.length, 1);
  assert.equal(new URL(log[0]).host, 'overpass-api.de');
  assert.deepEqual(r.places.map((p) => p.name), ['Middle Castle']);
  assert.equal(r.radiusKm, 5);
  assert.ok(r.places[0].alongKm > 90 && r.places[0].alongKm < 110);
  await assert.rejects(alongTheWay(null, THESS, { fetchImpl }), (e) => e.code === 'input');
});

test('routeLookup: cached per route, stale copy when offline, mirror when busy', async () => {
  store();
  clearCache();
  const elements = [el(1, MID.lat, MID.lon, { name: 'Middle Castle', historic: 'castle' })];
  let calls = 0;
  const live = async (url) => { calls += 1; return ok({ elements }); };
  const first = await routeLookup(SKOPJE, THESS, { fetchImpl: live, now: () => '2026-10-28T10:00:00Z' });
  assert.equal(first.fromCache, false);
  assert.equal(first.label, 'Skopje → Thessaloniki');
  assert.ok(readCache(routeKey(SKOPJE, THESS)));
  const again = await routeLookup(SKOPJE, THESS, { fetchImpl: live });
  assert.equal(again.fromCache, true);
  assert.equal(calls, 1);
  const offline = async () => { throw new TypeError('Failed to fetch'); };
  const stale = await routeLookup(SKOPJE, THESS, { fetchImpl: offline, fresh: true });
  assert.equal(stale.stale, true);
  assert.equal(stale.places[0].name, 'Middle Castle');
  await assert.rejects(routeLookup(THESS, SKOPJE, { fetchImpl: offline }), (e) => e.code === 'offline');
  const hosts = [];
  const busy = async (url) => { hosts.push(new URL(url).host); return hosts.length === 1 ? { ok: false, status: 429, json: async () => ({}) } : ok({ elements }); };
  const viaMirror = await routeLookup(THESS, SKOPJE, { fetchImpl: busy });
  assert.deepEqual(hosts, OVERPASS_ENDPOINTS.map((u) => new URL(u).host));
  assert.equal(viaMirror.places.length, 1);
});
