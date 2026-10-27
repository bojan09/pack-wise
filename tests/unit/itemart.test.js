import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ART, artFor, hasArt } from '../../js/ui/itemart.js';
import { generatePackingList } from '../../js/templates.js';
import { CATEGORY_PRESETS, categoryKey } from '../../js/models.js';

const css = readFileSync(new URL('../../css/tokens.css', import.meta.url), 'utf8');

const allTemplateItems = () => {
  const seen = new Map();
  for (const type of ['beach', 'city', 'business', 'camping', 'winter', 'custom']) {
    for (const scope of ['', 'domestic']) {
      for (const conditions of [[], ['hot'], ['warm'], ['cold'], ['rainy'], ['snowy'], ['cold', 'rainy', 'snowy', 'hot']]) {
        for (const season of ['', 'summer', 'winter']) {
          for (const travelers of [1, 3]) {
            for (const bagKinds of [['carry-on'], ['backpack'], ['checked', 'carry-on']]) {
              for (const i of generatePackingList({ type, days: 6, travelers, bagKinds, conditions, season, scope })) seen.set(i.name, i);
            }
          }
        }
      }
    }
  }
  for (const i of generatePackingList({ type: 'camping', style: 'camping', days: 4, conditions: ['cold', 'snowy', 'rainy', 'hot', 'warm'] })) seen.set(i.name, i);
  return [...seen.values()];
};

test('every item the app generates has its own illustration (not just a category glyph)', () => {
  const missing = allTemplateItems().filter((i) => !hasArt(i.name)).map((i) => `${i.category}: ${i.name}`);
  assert.deepEqual(missing, []);
});

test('illustrations are well-formed and only use classes the stylesheet defines', () => {
  const kinds = { p: 2, r: 6, c: 4, e: 5, l: 5 };
  const classes = new Set();
  for (const [re, shapes] of ART) {
    assert.ok(re instanceof RegExp);
    assert.ok(shapes.length >= 2 && shapes.length <= 12, `${re} shape count`);
    for (const [kind, ...a] of shapes) {
      assert.ok(kinds[kind], `${re}: unknown shape ${kind}`);
      assert.equal(a.length, kinds[kind], `${re}: ${kind} arity`);
      classes.add(a[a.length - 1]);
      for (const n of a.slice(0, -1)) assert.ok(typeof n === 'number' || (kind === 'p' && typeof n === 'string'), `${re}: bad value`);
    }
  }
  for (const c of classes) assert.match(css, new RegExp(`\\.item-art \\.a-${c} \\{`), `class a-${c} has a rule`);
});

test('different kinds of item get different pictures; the same kind shares one', () => {
  const shapesOf = (n, c = 'misc') => JSON.stringify(artFor(n, c));
  const names = ['T-shirts', 'Underwear', 'Pants / jeans', 'Socks (pairs)', 'Toothbrush & toothpaste', 'Shampoo & soap', 'Deodorant', 'Medications', 'Phone charger', 'Travel adapter', 'Headphones', 'ID / Passport', 'Tickets / booking confirmations', 'Wallet, cards & some cash', 'Keys', 'First-aid kit', 'Sunscreen', 'Umbrella', 'Sunglasses', 'Tent (with poles & pegs)', 'Sleeping bag', 'Camping stove & fuel', 'Laptop', 'Power bank'];
  assert.equal(new Set(names.map((n) => shapesOf(n))).size, names.length, 'no two of these share art');
  assert.equal(shapesOf('Laptop'), shapesOf('Laptop')); // deterministic
  assert.notEqual(shapesOf('Laptop'), shapesOf('Laptop charger'), 'a laptop is not its charger');
  assert.notEqual(shapesOf('ID / Passport'), shapesOf('First-aid kit'), '“aid” must not match “ID”');
});

test('unknown custom items fall back to a per-category glyph, and each category glyph differs', () => {
  const glyphs = CATEGORY_PRESETS.map((c) => JSON.stringify(artFor('zzz unknown thing', c.id)));
  assert.equal(new Set(glyphs).size, CATEGORY_PRESETS.length);
  assert.equal(hasArt('zzz unknown thing'), false);
  assert.equal(JSON.stringify(artFor('zzz', 'my-custom-category')), JSON.stringify(artFor('zzz', 'misc')));
});

test('every packing category has its own color, in both themes', () => {
  const cats = [...CATEGORY_PRESETS.map((c) => c.id), 'misc'];
  const colors = CATEGORY_PRESETS.map((c) => css.match(new RegExp(`\\[data-cat='${c.id}'\\] \\{ --cat: (#[0-9a-f]{6});`))?.[1]);
  assert.ok(colors.every(Boolean), 'each preset category defines --cat');
  assert.equal(new Set(colors).size, CATEGORY_PRESETS.length, 'all different');
  assert.equal(categoryKey('clothing'), 'clothing');
  assert.equal(categoryKey('anything-else'), 'misc');
  assert.ok(cats.length >= 7);
  assert.match(css, /:root\[data-theme='dark'\] \[data-cat\]/);
  assert.match(css, /prefers-color-scheme: dark\) \{\s*:root:not\(\[data-theme='light'\]\) \[data-cat\]/);
});

test('category colors keep chip text readable (>= 4.5:1) in both themes', () => {
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const mix = (a, b, pa) => a.map((v, i) => v * pa + b[i] * (1 - pa)); // color-mix(in srgb, a pa%, b)
  const lum = (rgb) => { const c = rgb.map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const white = [255, 255, 255];
  for (const c of CATEGORY_PRESETS.concat([{ id: 'misc' }])) {
    const m = css.match(new RegExp(`\\[data-cat='${c.id}'\\] \\{ --cat: (#[0-9a-f]{6}); --cat-strong: (#[0-9a-f]{6});`));
    const [cat, strong] = [hex(m[1]), hex(m[2])];
    const lightSoft = mix(cat, white, 0.16);                    // surface #ffffff
    const darkSoft = mix(cat, hex('#162b2e'), 0.26);
    const darkInk = mix(cat, white, 0.62);
    assert.ok(ratio(strong, lightSoft) >= 4.5, `${c.id}: light chip text ${ratio(strong, lightSoft).toFixed(2)}`);
    assert.ok(ratio(darkInk, darkSoft) >= 4.5, `${c.id}: dark chip text ${ratio(darkInk, darkSoft).toFixed(2)}`);
    assert.ok(ratio(white, strong) >= 4.5, `${c.id}: active chip ${ratio(white, strong).toFixed(2)}`);
  }
});
