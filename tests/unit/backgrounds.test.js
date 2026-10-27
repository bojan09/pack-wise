import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DARK_BACKGROUNDS, LIGHT_BACKGROUNDS, loadPrefsFrom } from '../../js/prefs.js';

const css = readFileSync(new URL('../../css/tokens.css', import.meta.url), 'utf8');
const lum = (hex) => { const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const vars = (attr, id) => { const m = css.match(new RegExp(`:root\\[data-theme='[a-z]+'\\]\\[${attr}='${id}'\\] \\{ ([^}]*) \\}`)); return m ? Object.fromEntries([...m[1].matchAll(/--([a-z0-9-]+): (#[0-9a-f]{6})/g)].map((x) => [x[1], x[2]])) : null; };

test('every non-default background has CSS for BOTH explicit and system themes, and a matching swatch', () => {
  for (const [attr, list] of [['data-bgl', LIGHT_BACKGROUNDS], ['data-bgd', DARK_BACKGROUNDS]]) {
    assert.equal(list[0].id, 'default');
    assert.ok(list.length >= 5, 'a real choice');
    for (const b of list.slice(1)) {
      const v = vars(attr, b.id);
      assert.ok(v, `${attr} ${b.id} explicit-theme rule`);
      assert.equal(v.bg, b.swatch, `${b.id} swatch shows the real color`);
      assert.match(css, new RegExp(`@media \\(prefers-color-scheme: ${attr === 'data-bgl' ? 'light' : 'dark'}\\) \\{ :root:not\\(\\[data-theme\\]\\)\\[${attr}='${b.id}'\\]`), `${b.id} system-theme rule`);
    }
  }
});

test('text and muted text stay readable on every background variant', () => {
  const light = { text: '#17363a', muted: '#5a6f6e', surface: '#ffffff' };
  const dark = { text: '#f1eee7', muted: '#a5b9b6' };
  for (const b of LIGHT_BACKGROUNDS.slice(1)) {
    const v = vars('data-bgl', b.id);
    for (const k of ['bg', 'bg-sky', 'surface-2', 'surface-3']) {
      assert.ok(ratio(light.text, v[k]) >= 7, `${b.id} text on ${k}`);
      assert.ok(ratio(light.muted, v[k]) >= 4.5, `${b.id} muted on ${k} = ${ratio(light.muted, v[k]).toFixed(2)}`);
    }
  }
  for (const b of DARK_BACKGROUNDS.slice(1)) {
    const v = vars('data-bgd', b.id);
    for (const k of ['bg', 'bg-sky', 'surface', 'surface-2', 'surface-3']) {
      assert.ok(ratio(dark.text, v[k]) >= 7, `${b.id} text on ${k}`);
      assert.ok(ratio(dark.muted, v[k]) >= 4.5, `${b.id} muted on ${k} = ${ratio(dark.muted, v[k]).toFixed(2)}`);
    }
  }
});

test('stored background choices are validated', () => {
  assert.deepEqual([loadPrefsFrom({ bgLight: 'sage', bgDark: 'forest' }).bgLight, loadPrefsFrom({ bgLight: 'sage', bgDark: 'forest' }).bgDark], ['sage', 'forest']);
  const bad = loadPrefsFrom({ bgLight: 'forest', bgDark: 'sage' }); // each mode only accepts its own list
  assert.deepEqual([bad.bgLight, bad.bgDark], ['default', 'default']);
  assert.equal(loadPrefsFrom({ bgLight: '<x>' }).bgLight, 'default');
});
