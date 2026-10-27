// WCAG contrast audit of the design tokens (light, dark, and every accent preset).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ACCENTS } from '../../js/prefs.js';

const css = readFileSync(new URL('../../css/tokens.css', import.meta.url), 'utf8');

function vars(block) {
  return Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2]]));
}
const light = vars(css.slice(css.indexOf(':root {'), css.indexOf('@media (prefers-color-scheme: dark)')));
const darkStart = css.indexOf(":root[data-theme='dark'] {");
const dark = { ...light, ...vars(css.slice(darkStart, css.indexOf('@media (min-width', darkStart))) };

const lum = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

const PAIRS = [
  ['text', 'bg'], ['text', 'surface'], ['text', 'surface-2'],
  ['muted', 'bg'], ['muted', 'surface'], ['muted', 'surface-2'],
  ['danger', 'surface'], ['danger', 'danger-bg'],
  ['success', 'success-bg'], ['warn', 'warn-bg'],
  ['tone-sand-ink', 'tone-sand'], ['tone-coral-ink', 'tone-coral'], ['tone-teal-ink', 'tone-teal'],
];

for (const [name, t] of [['light', light], ['dark', dark]]) {
  test(`text contrast >= 4.5:1 (${name} theme)`, () => {
    const bad = PAIRS.filter(([fg, bg]) => ratio(t[fg], t[bg]) < 4.5).map(([fg, bg]) => `${fg} on ${bg}: ${ratio(t[fg], t[bg]).toFixed(2)}`);
    assert.deepEqual(bad, []);
  });
}

test('white text on every accent-strong preset is >= 4.5:1', () => {
  const bad = ACCENTS.filter((a) => ratio('#ffffff', a.strong) < 4.5).map((a) => `${a.id}: ${ratio('#ffffff', a.strong).toFixed(2)}`);
  assert.deepEqual(bad, []);
});

test('accent-strong text/links on surfaces are >= 4.5:1 in light theme; bright accent is used in dark theme', () => {
  const bad = ACCENTS.filter((a) => ratio(a.strong, light.surface) < 4.5 || ratio(a.strong, light.bg) < 4.5).map((a) => a.id);
  assert.deepEqual(bad, []);
  const darkBad = ACCENTS.filter((a) => ratio(a.accent, dark.surface) < 4.5).map((a) => `${a.id}: ${ratio(a.accent, dark.surface).toFixed(2)}`);
  assert.deepEqual(darkBad, []);
});

test('non-text UI boundaries (input borders / focus ring) reach 3:1 where they carry meaning', () => {
  assert.ok(ratio(light.focus, light.bg) >= 3, 'focus ring (light)');
  assert.ok(ratio(dark.focus, dark.bg) >= 3, 'focus ring (dark)');
});
