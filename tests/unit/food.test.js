import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FOOD } from '../../js/data/food.js';
import { CATALOG } from '../../js/data/catalog.js';
import { ALLERGEN_LABEL, availableDietFilters, filterFood, foodForCountries, groupFood, maybeSuitable } from '../../js/taste.js';
import { tasteMessage } from '../../js/companion.js';
import { createStore } from '../../js/store.js';
import { createMemoryAdapter } from '../../js/storage/memory.js';
import { tripEntries } from '../../js/selectors.js';

const ALLOWED_KEYS = ['id', 'name', 'means', 'category', 'countries', 'what', 'culture', 'ingredients', 'vegetarian', 'vegan', 'allergens', 'found'].sort();
const cats = FOOD.categories.map((c) => c.id);
const codes = CATALOG.countries.map((c) => c.id);

test('food catalog integrity', () => {
  assert.ok(FOOD.items.length >= 30);
  assert.equal(new Set(FOOD.items.map((i) => i.id)).size, FOOD.items.length, 'unique ids');
  for (const i of FOOD.items) {
    assert.match(i.id, /^[a-z0-9][a-z0-9-]*$/, i.id);
    assert.deepEqual(Object.keys(i).sort().filter((k) => k !== 'means'), ALLOWED_KEYS.filter((k) => k !== 'means'), `fields of ${i.id}`);
    assert.ok(cats.includes(i.category), i.id);
    assert.ok(i.countries.length && i.countries.every((c) => codes.includes(c)), `countries of ${i.id}`);
    for (const k of ['vegetarian', 'vegan']) assert.ok([true, false, 'varies'].includes(i[k]), `${k} of ${i.id}`);
    assert.ok(!(i.vegan === true && i.vegetarian !== true), `vegan implies vegetarian: ${i.id}`);
    assert.ok(i.allergens.every((a) => ALLERGEN_LABEL[a]), `allergens of ${i.id}`);
    assert.ok(i.found.every((f) => FOOD.found.includes(f)), `found of ${i.id}`);
    assert.ok(i.what.length > 20 && i.culture.length > 10);
  }
});

test('food honesty rules: no venues, prices, alcohol, pronunciations, rankings', () => {
  const text = JSON.stringify(FOOD.items);
  assert.doesNotMatch(text, /[€$£]\s?\d|\d\s?(eur|usd|bam|rsd|hrk|mkd|lek|lev|bgn)\b/i, 'prices');
  assert.doesNotMatch(text, /\b(wine|beer|rakija|rakia|raki|brandy|vodka|whisk|liqueur|spirit|alcohol|cocktail|pivo|vino|šljivovica|slivovitz)\b/i, 'alcohol');
  assert.doesNotMatch(text, /\b(pronounced|pronunciation|IPA)\b/i, 'pronunciation');
  assert.doesNotMatch(text, /\b(best|number one|#1|top[- ]rated|most famous in the world)\b/i, 'rankings');
  assert.doesNotMatch(text, /\b(restaurant|cafe|café) (called|named)|\bopen (daily|until)\b|\bopens? at\b/i, 'venues/hours');
});

test('every catalog country has food; each category is non-empty for most countries', () => {
  for (const c of codes) assert.ok(foodForCountries([c]).length >= 5, c);
  for (const cat of cats) assert.ok(FOOD.items.some((i) => i.category === cat));
  assert.ok(FOOD.items.filter((i) => i.category === 'drink').every((i) => i.found.length));
});

test('foodForCountries scopes to the country and unions multi-country trips', () => {
  const rs = foodForCountries(['RS']).map((i) => i.id);
  assert.ok(rs.includes('cevapi') && rs.includes('prebranac'));
  assert.ok(!rs.includes('tave-kosi') && !rs.includes('potica'));
  const both = foodForCountries(['RS', 'AL']).map((i) => i.id);
  assert.ok(both.includes('tave-kosi') && both.includes('cevapi'));
  assert.deepEqual(foodForCountries(['XX']), []);
});

test('diet filters keep only definite matches and report the ask-first rest', () => {
  const items = foodForCountries(['BA']);
  const veg = filterFood(items, { diet: 'vegetarian' });
  assert.ok(veg.length && veg.every((i) => i.vegetarian === true));
  assert.ok(!veg.some((i) => i.id === 'burek'), 'burek only varies');
  assert.ok(maybeSuitable(items, { diet: 'vegetarian' }) >= 1);
  const vegan = filterFood(items, { diet: 'vegan' });
  assert.ok(vegan.every((i) => i.vegan === true) && vegan.length < veg.length);
});

test('allergen filter hides listed allergens; category and saved filters work', () => {
  const items = foodForCountries(['HR']);
  const noGluten = filterFood(items, { avoid: ['gluten'] });
  assert.ok(noGluten.every((i) => !i.allergens.includes('gluten')) && noGluten.length < items.length);
  assert.ok(filterFood(items, { category: 'dessert' }).every((i) => i.category === 'dessert'));
  assert.deepEqual(filterFood(items, { saved: true }, new Set(['fritule'])).map((i) => i.id), ['fritule']);
  assert.deepEqual(filterFood(items, {}).length, items.length);
});

test('controls that change nothing are not offered', () => {
  const only = FOOD.items.filter((i) => i.vegetarian === true);
  assert.deepEqual(availableDietFilters(only).diets.includes('vegetarian'), false);
  const mixed = availableDietFilters(foodForCountries(['SI']));
  assert.ok(mixed.diets.includes('vegetarian'));
  assert.ok(mixed.allergens.every((a) => ALLERGEN_LABEL[a]));
});

test('groupFood follows category order and drops empty groups', () => {
  const g = groupFood(foodForCountries(['AL']));
  assert.deepEqual(g.map((x) => x.id), cats.filter((c) => foodForCountries(['AL']).some((i) => i.category === c)));
});

test('taste companion message: honest when uncovered, dismissible, mentions saved', () => {
  assert.match(tasteMessage({ status: 'none', asked: 'Paris' }).text, /don’t have a built-in food guide/);
  const intro = tasteMessage({ status: 'covered', countryLabel: 'Serbia' });
  assert.match(intro.text, /Serbia/);
  assert.equal(tasteMessage({ status: 'covered', countryLabel: 'Serbia', dismissed: [intro.id] }), null);
  assert.match(tasteMessage({ status: 'covered', countryLabel: 'Serbia', saved: 2 }).text, /2 on your Must-Try/);
});

test('must-try list: save, tried and note persist; clearing everything removes the record', async () => {
  const store = createStore(createMemoryAdapter());
  await store.init();
  const t = store.createTrip({ name: 'Belgrade', destination: 'Belgrade', type: 'city' }, { bagKinds: ['carry-on'] });
  assert.equal(store.setSaved(t.id, 'food', 'cevapi', true), true);
  store.setTried(t.id, 'food', 'cevapi', true);
  store.setNote(t.id, 'food', 'cevapi', '  with kajmak  ');
  const [e] = tripEntries(store.state, t.id, 'food');
  assert.deepEqual([e.saved, e.tried, e.note], [true, true, 'with kajmak']);
  store.setSaved(t.id, 'food', 'cevapi', false); // keeps the user's own tried/note
  assert.equal(tripEntries(store.state, t.id, 'food').length, 1);
  store.setTried(t.id, 'food', 'cevapi', false);
  store.setNote(t.id, 'food', 'cevapi', '');
  assert.equal(tripEntries(store.state, t.id, 'food').length, 0);
  assert.equal(store.setTried('nope', 'food', 'cevapi', true), null);
  assert.equal(store.setNote(t.id, 'food', 'Bad Ref!', 'x'), null);
  assert.equal(tripEntries(store.state, t.id, 'place').length, 0, 'places untouched');
});
