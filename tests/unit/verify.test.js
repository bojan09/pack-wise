import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findArticle, findCoords, nameOverlap, verify } from '../../scripts/verify-catalog.mjs';

const json = (body, ok = true, status = 200) => ({ ok, status, json: async () => body });
const catalog = { destinations: [{ id: 'd', name: 'Belgrade', places: [{ id: 'a', name: 'Kalemegdan Fortress' }, { id: 'b', name: 'Made Up Place' }, { id: 'c', name: 'Skadarlija' }, { id: 'e', name: 'Broken' }] }] };

test('nameOverlap compares shared words, ignoring case and accents', () => {
  assert.equal(nameOverlap('Kalemegdan Fortress', 'Belgrade Fortress'), 0.5);
  assert.equal(nameOverlap('Škadarlija', 'Skadarlija'), 1);
  assert.equal(nameOverlap('', 'x'), 0);
});

test('findArticle / findCoords parse the API shapes and tolerate empty results', async () => {
  const f = async (url) => (url.includes('opensearch') ? json(['q', ['Belgrade Fortress'], [''], ['https://en.wikipedia.org/wiki/Belgrade_Fortress']]) : json({ entities: { Q1: { claims: { P625: [{ mainsnak: { datavalue: { value: { latitude: 44.82, longitude: 20.45 } } } }] } } } }));
  assert.deepEqual(await findArticle(f, { name: 'x' }, { name: 'y' }), { title: 'Belgrade Fortress', url: 'https://en.wikipedia.org/wiki/Belgrade_Fortress' });
  assert.deepEqual(await findCoords(f, 'Belgrade Fortress'), { lat: 44.82, lon: 20.45 });
  assert.equal(await findArticle(async () => json(['q', [], [], []]), { name: 'x' }, { name: 'y' }), null);
  assert.equal(await findCoords(async () => json({ entities: { '-1': { missing: '' } } }), 'x'), null);
  await assert.rejects(findArticle(async () => json({}, false, 429), { name: 'x' }, { name: 'y' }), /HTTP 429/);
});

test('verify reports missing articles, weak matches, candidate coordinates and errors, and never edits anything', async () => {
  const before = JSON.stringify(catalog);
  const f = async (url) => {
    const u = decodeURIComponent(url);
    if (u.includes('opensearch')) {
      if (u.includes('Kalemegdan')) return json(['q', ['Belgrade Zoo'], [''], ['u1']]);
      if (u.includes('Skadarlija')) return json(['q', ['Skadarlija'], [''], ['u2']]);
      if (u.includes('Broken')) return json({}, false, 500);
      return json(['q', [], [], []]);
    }
    return json({ entities: { Q: { claims: { P625: [{ mainsnak: { datavalue: { value: { latitude: 1, longitude: 2 } } } }] } } } });
  };
  const r = await verify(catalog, { fetchImpl: f, coords: true, delayMs: 0 });
  assert.equal(r.checked, 4);
  assert.deepEqual(r.noArticle.map((x) => x.ref), ['d/b']);
  assert.deepEqual(r.weakMatch.map((x) => x.ref), ['d/a']);
  assert.deepEqual(r.withCoords.map((x) => x.ref), ['d/a', 'd/c']);
  assert.deepEqual(r.errors.map((x) => x.ref), ['d/e']);
  assert.equal(JSON.stringify(catalog), before);
});
