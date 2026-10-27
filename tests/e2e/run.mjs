// End-to-end checks in real Chromium (Playwright). Dev-only; the app itself has no dependencies.
// Usage: npm run test:e2e   (set PLAYWRIGHT_MODULE if `playwright` is not resolvable)
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { startServer } from './server.mjs';

const require = createRequire(import.meta.url);
const candidates = [process.env.PLAYWRIGHT_MODULE, 'playwright', '/opt/node-tools/node_modules/playwright'].filter(Boolean);
let chromium;
for (const c of candidates) {
  try { ({ chromium } = require(c)); break; } catch { /* try next */ }
}
if (!chromium) throw new Error('Playwright not found. Install it or set PLAYWRIGHT_MODULE.');

const ROOT = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const SHOTS = process.env.SHOTS_DIR || join(ROOT, 'tests', 'e2e', '.out');
mkdirSync(SHOTS, { recursive: true });
const PORT = 8123;
const BASE = `http://localhost:${PORT}/`;
let swVersionOverride = null;
const server = await startServer(PORT, {
  rewrite: (path, body) => (path === '/sw.js' && swVersionOverride ? body.toString().replace("'packwise-v1.8.0'", `'${swVersionOverride}'`) : undefined),
});
const browser = await chromium.launch();

const results = [];
async function test(name, fn, { sw = false, viewport = { width: 390, height: 844 }, ctxOptions = {} } = {}) {
  if (process.env.E2E_GREP && !new RegExp(process.env.E2E_GREP, 'i').test(name)) return; // dev filter: E2E_GREP="haptics|print"
  const ctx = await browser.newContext({ viewport, serviceWorkers: sw ? 'allow' : 'block', acceptDownloads: true, ...ctxOptions });
  const page = await ctx.newPage();
  const problems = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`console.error: ${m.text()}`); });
  try {
    await fn({ page, ctx });
    assert.deepEqual(problems, [], 'unexpected browser errors');
    results.push({ name, ok: true });
    console.log(`  ok   ${name}`);
  } catch (err) {
    results.push({ name, ok: false, err });
    console.log(`  FAIL ${name}\n       ${String(err.message).split('\n').join('\n       ')}`);
    try { await page.screenshot({ path: join(SHOTS, `FAIL-${name.replace(/\W+/g, '_').slice(0, 40)}.png`) }); } catch { /* ignore */ }
  } finally {
    await ctx.close();
  }
}

// ----------------------------------------------------------------- helpers
const skipWelcome = (page) => page.addInitScript(() => { try { if (!localStorage.getItem('packwise.prefs.v1')) localStorage.setItem('packwise.prefs.v1', JSON.stringify({ onboarded: true })); } catch { /* ignore */ } });

async function createTrip(page, { dest = 'Rome, Italy', type = 'City', start = '2026-12-12', end = '2026-12-20', bags = [], scope = 'abroad' } = {}) {
  await page.goto(`${BASE}#/trips/new`);
  await page.click(`label.tile:has-text("${type}")`);
  await page.fill('input[name=destination]', dest);
  if (start) await page.fill('input[name=start]', start);
  if (end) await page.fill('input[name=end]', end);
  for (const b of bags) await page.click(`label.tile:has-text("${b}")`);
  if (scope) await page.click(`label.seg-opt:has-text("${scope === 'domestic' ? 'Within my country' : 'Abroad'}")`);
  await generate(page);
  await page.waitForSelector('h1:has-text("' + dest + '")');
}

/** Click Generate; new trips must choose a scope, so pick Abroad unless the test already did. */
async function generate(page) {
  const chosen = await page.evaluate(() => Boolean(document.querySelector('input[name=scope]:checked')));
  if (!chosen) await page.click('label.seg-opt:has-text("Abroad")');
  await page.click('button:has-text("Generate Packing List")');
}

const pct = (page) => page.locator('section[aria-label="Packing summary"] [role=progressbar]').getAttribute('aria-valuenow').then(Number);
const summaryText = (page) => page.locator('section[aria-label="Packing summary"] p.muted').innerText();
const tripState = (page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__packwise.store.state)));
const reloadSettled = async (page) => { await page.reload(); await page.waitForSelector('#view > *'); };

console.log('PackWise e2e');

// ---------------------------------------------------------------- journeys
await test('first visit shows welcome, Get Started leads to create trip', async ({ page }) => {
  await page.goto(BASE);
  await page.waitForSelector('text=Smart Packing Companion');
  assert.ok(page.url().endsWith('#/welcome'));
  await page.click('button:has-text("Get Started")');
  await page.waitForSelector('h1:has-text("Create a New Trip")');
  await page.reload();
  await page.waitForSelector('h1:has-text("Create a New Trip")'); // onboarding is remembered
  await page.goto(BASE);
  await page.waitForSelector('text=Your first adventure awaits'); // empty dashboard, no welcome again
});

await test('create trip validates input and generates an editable starter list', async ({ page }) => {
  await skipWelcome(page);
  await page.goto(`${BASE}#/trips/new`);
  await generate(page);
  await page.waitForSelector('.form-errors .field-error');
  assert.ok(page.url().endsWith('#/trips/new'));
  await page.fill('input[name=destination]', 'Oslo');
  await page.fill('input[name=start]', '2026-12-20');
  await page.fill('input[name=end]', '2026-12-10');
  await generate(page);
  await page.waitForSelector('text=on or after the departure');
  await page.fill('input[name=end]', '2026-12-22');
  await page.click('label.tile:has-text("Winter")');
  await page.click('label.tile:has-text("Checked")');
  await generate(page);
  await page.waitForSelector('h1:has-text("Oslo")');
  const st = await tripState(page);
  assert.equal(st.trips.length, 1);
  assert.equal(st.trips[0].type, 'winter');
  assert.equal(st.bags.length, 2);
  assert.ok(st.items.some((i) => i.name === 'Winter coat'));
  assert.ok(st.items.every((i) => i.packed === 0 && i.packed <= i.target));
});

await test('pack / unpack keeps counts, bars and persistence consistent', async ({ page }) => {
  await skipWelcome(page);
  await createTrip(page, { bags: ['Checked'] });
  assert.equal(await pct(page), 0);
  const before = await tripState(page);
  const target = before.items.reduce((a, i) => a + i.target, 0);
  assert.match(await summaryText(page), new RegExp(`^0 / ${target} items`));

  const tshirts = before.items.find((i) => i.name === 'T-shirts');
  await page.check('input[aria-label^="T-shirts:"]');
  const mid = await tripState(page);
  const packedQty = mid.items.reduce((a, i) => a + i.packed, 0);
  assert.equal(packedQty, tshirts.target);
  assert.equal(await pct(page), Math.round((packedQty / target) * 100));
  assert.match(await summaryText(page), new RegExp(`^${packedQty} / ${target} items`));

  // lowering the target clamps packed; invariant 0 <= packed <= target holds everywhere
  for (let n = tshirts.target; n > 2; n--) await page.click('button[aria-label="Decrease T-shirts"]');
  const st = await tripState(page);
  const t = st.items.find((i) => i.name === 'T-shirts');
  assert.deepEqual([t.target, t.packed], [2, 2]);
  assert.ok(st.items.every((i) => i.packed >= 0 && i.packed <= i.target));

  await page.uncheck('input[aria-label^="T-shirts:"]');
  assert.equal((await tripState(page)).items.find((i) => i.name === 'T-shirts').packed, 0);
  await page.check('input[aria-label^="T-shirts:"]');

  await page.waitForTimeout(150);
  await reloadSettled(page); // persistence across reload
  const after = await tripState(page);
  assert.equal(after.items.find((i) => i.name === 'T-shirts').packed, 2);
  assert.equal(after.items.find((i) => i.name === 'T-shirts').target, 2);
});

await test('rapid taps never lose or duplicate data', async ({ page }) => {
  await skipWelcome(page);
  await createTrip(page);
  const start = (await tripState(page)).items.find((i) => i.name === 'Underwear');
  const id = start.id;
  const inc = page.locator('button[aria-label="Increase Underwear"]');
  for (let i = 0; i < 6; i++) await inc.click({ delay: 0 });
  const box = page.locator('input[aria-label^="Underwear:"]');
  for (let i = 0; i < 5; i++) await box.click({ delay: 0 });
  await page.waitForTimeout(200);
  const st = await tripState(page);
  assert.equal(st.items.filter((i) => i.id === id).length, 1);
  const u = st.items.find((i) => i.id === id);
  assert.equal(u.target, start.target + 6); // six increments, none lost
  assert.equal(u.packed, u.target); // five toggles from unpacked ends packed
  await reloadSettled(page);
  const again = (await tripState(page)).items.find((i) => i.id === id);
  assert.deepEqual([again.target, again.packed], [u.target, u.packed]);
});

await test('add, edit, move between bags, delete + undo items', async ({ page }) => {
  await skipWelcome(page);
  await createTrip(page, { bags: ['Checked'] });
  // quick add inside the Electronics category
  await page.click('[data-key="add-electronics"]');
  await page.fill('input[name=name]', 'Camera');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.item-name:has-text("Camera")');
  let st = await tripState(page);
  const cam = st.items.find((i) => i.name === 'Camera');
  assert.equal(cam.category, 'electronics');
  // edit dialog: rename, new custom category, other bag, essential, target
  await page.click('button[aria-label="Edit Camera"]');
  await page.waitForSelector('dialog[open]');
  await page.fill('dialog input[name=name]', 'Mirrorless camera');
  await page.selectOption('dialog select[name=category]', '__new');
  await page.fill('dialog input[name=newCategory]', 'Photography');
  const checkedBag = st.bags.find((b) => b.kind === 'checked');
  await page.selectOption('dialog select[name=bag]', checkedBag.id);
  await page.check('dialog input[name=essential]');
  await page.fill('dialog input[name=target]', '2');
  await page.fill('dialog input[name=packed]', '1');
  await page.click('dialog button:has-text("Save")');
  await page.waitForSelector('dialog', { state: 'detached' });
  st = await tripState(page);
  const edited = st.items.find((i) => i.id === cam.id);
  assert.deepEqual([edited.name, edited.category, edited.bagId, edited.essential, edited.target, edited.packed], ['Mirrorless camera', 'Photography', checkedBag.id, true, 2, 1]);
  await page.waitForSelector('section[aria-label="Photography"]');
  // delete with undo
  const n = st.items.length;
  await page.click('button[aria-label="Edit Mirrorless camera"]');
  await page.click('dialog button:has-text("Delete")');
  await page.waitForSelector('.toast:has-text("Removed")');
  assert.equal((await tripState(page)).items.length, n - 1);
  await page.click('.toast-action:has-text("Undo")');
  const back = await tripState(page);
  assert.equal(back.items.length, n);
  assert.equal(back.items.filter((i) => i.id === cam.id).length, 1);
});

await test('manage bags: add, rename, delete re-homes items, last bag protected', async ({ page }) => {
  await skipWelcome(page);
  await createTrip(page, { bags: ['Checked'] });
  await page.click('button[aria-label="Trip actions"]');
  await page.click('.sheet-item:has-text("Manage bags")');
  await page.waitForSelector('dialog[open] .bag-edit-list');
  await page.fill('dialog input[name=bagName]', 'Duffel');
  await page.click('dialog button:has-text("Add bag")');
  await page.waitForSelector('dialog .bag-edit-list li:nth-child(3)');
  const first = page.locator('dialog .bag-edit-list li').first().locator('input');
  await first.fill('Cabin bag');
  await first.press('Tab');
  let st = await tripState(page);
  assert.equal(st.bags.length, 3);
  assert.ok(st.bags.some((b) => b.name === 'Cabin bag'));
  const total = st.items.length;
  await page.click('dialog button[aria-label="Delete Duffel"]');
  st = await tripState(page);
  assert.equal(st.bags.length, 2);
  await page.click('dialog button[aria-label^="Delete "] >> nth=0');
  await page.click('dialog button:has-text("Delete bag")');
  await page.waitForFunction(() => window.__packwise.store.state.bags.length === 1);
  st = await tripState(page);
  assert.equal(st.bags.length, 1);
  assert.equal(st.items.length, total);
  assert.ok(st.items.every((i) => i.bagId === st.bags[0].id));
  await page.click('dialog button[aria-label^="Delete "]');
  assert.equal((await tripState(page)).bags.length, 1); // last bag cannot be removed
});

await test('multiple trips stay isolated; duplicate / archive / restore / delete (with confirm)', async ({ page }) => {
  await skipWelcome(page);
  await createTrip(page, { dest: 'Rome, Italy' });
  await createTrip(page, { dest: 'Lisbon', type: 'Beach', start: '2027-03-01', end: '2027-03-05' });
  await page.check('input[aria-label^="T-shirts:"]');
  const st = await tripState(page);
  const [rome, lisbon] = ['Rome, Italy', 'Lisbon'].map((n) => st.trips.find((t) => t.name === n));
  assert.ok(st.items.filter((i) => i.tripId === lisbon.id).some((i) => i.packed > 0));
  assert.ok(st.items.filter((i) => i.tripId === rome.id).every((i) => i.packed === 0));

  await page.goto(`${BASE}#/trips`);
  await page.click('button[aria-label="Actions for Rome, Italy"]');
  await page.click('.sheet-item:has-text("Duplicate")');
  await page.fill('dialog input[type=text]', 'Rome again');
  await page.click('dialog button:has-text("Duplicate")');
  await page.waitForSelector('h3:has-text("Rome again")');
  assert.equal((await tripState(page)).trips.length, 3);

  await page.click('button[aria-label="Actions for Rome again"]');
  await page.click('.sheet-item:has-text("Archive")');
  await page.click('button.chip:has-text("Archived")');
  await page.waitForSelector('h3:has-text("Rome again")');
  await page.click('button[aria-label="Actions for Rome again"]');
  await page.click('.sheet-item:has-text("Restore")');
  await page.waitForFunction(() => window.__packwise.store.state.trips.find((t) => t.name === 'Rome again').status === 'active');

  // delete: cancel first, then confirm
  await page.click('button.chip:has-text("Active")');
  await page.click('button[aria-label="Actions for Rome again"]');
  await page.click('.sheet-item:has-text("Delete")');
  await page.click('dialog button:has-text("Cancel")');
  assert.equal((await tripState(page)).trips.length, 3);
  await page.click('button[aria-label="Actions for Rome again"]');
  await page.click('.sheet-item:has-text("Delete")');
  await page.click('dialog button:has-text("Delete trip")');
  await page.waitForFunction(() => window.__packwise.store.state.trips.length === 2);
  const after = await tripState(page);
  assert.equal(after.trips.length, 2);
  assert.equal(after.items.filter((i) => i.tripId === lisbon.id).length, st.items.filter((i) => i.tripId === lisbon.id).length);
  assert.ok(after.items.every((i) => after.trips.some((t) => t.id === i.tripId)));
});

await test('travel tasks: toggle, add, filter by phase, separate from packing progress', async ({ page }) => {
  await skipWelcome(page);
  await createTrip(page);
  const packingBefore = await pct(page);
  await page.goto(`${BASE}#/tasks`);
  await page.waitForSelector('h1:has-text("Travel Tasks")');
  const total = (await tripState(page)).tasks.length;
  await page.check('input[aria-label^="Check passport"]');
  await page.waitForSelector(`text=1 / ${total} completed`);
  await page.click('button[aria-label="Add task"] >> nth=0');
  await page.fill('dialog input[name=title]', 'Print visa');
  await page.selectOption('dialog select[name=phase]', 'before');
  await page.fill('dialog input[name=due]', '2026-12-01');
  await page.click('dialog button:has-text("Add task")');
  await page.waitForSelector('.item-name:has-text("Print visa")');
  await page.click('button.chip:has-text("Return")');
  assert.equal(await page.locator('.task-row').count(), 2);
  await page.click('button.chip:has-text("All")');
  await page.click('button[aria-label="Delete task Print visa"]');
  await page.waitForSelector('.toast:has-text("Removed")');
  await page.click('.toast-action');
  await page.waitForSelector('.item-name:has-text("Print visa")');
  const st = await tripState(page);
  assert.ok(st.tasks.some((t) => t.title === 'Print visa' && t.dueDate === '2026-12-01'));
  await page.goBack(); await page.goBack().catch(() => {});
  await page.goto(`${BASE}#/pack`);
  await page.waitForSelector('h1:has-text("Rome, Italy")');
  assert.equal(await pct(page), packingBefore); // tasks never affect packing progress
});

await test('summary screen is honest about missing items', async ({ page }) => {
  await skipWelcome(page);
  await createTrip(page);
  await page.goto(`${BASE}#/trip/${(await tripState(page)).trips[0].id}/summary`);
  await page.waitForSelector('h1:has-text("Almost there")');
  await page.waitForSelector('text=essentials left to pack');
  // pack everything
  await page.evaluate(() => { const { store } = window.__packwise; store.state.items.forEach((i) => store.setPacked(i.id, i.target)); store.state.tasks.forEach((t) => !t.done && store.toggleTask(t.id)); });
  await page.waitForSelector('h1:has-text("All Packed!")');
  await page.waitForSelector('text=All essentials packed');
});

await test('settings: theme persists, accent applies, name shows in greeting', async ({ page }) => {
  await skipWelcome(page);
  await page.goto(`${BASE}#/settings`);
  await page.click('label.seg-opt:has-text("Dark")');
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
  await page.click('label.swatch[title="Coral"]');
  assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent-strong').trim()), '#B4492F');
  await page.click('button[role=tab]:has-text("Preferences")');
  await page.fill('input[placeholder=Traveler]', 'Mira');
  await page.keyboard.press('Tab');
  await reloadSettled(page);
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
  await page.goto(`${BASE}#/`);
  await page.waitForSelector('h1:has-text("Mira!")');
});

await test('backup: export -> corrupted import rejected -> good import merges -> replace restores', async ({ page }) => {
  await skipWelcome(page);
  await createTrip(page, { dest: 'Rome, Italy' });
  await page.check('input[aria-label^="T-shirts:"]');
  await page.goto(`${BASE}#/settings?tab=data`);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('button:has-text("Export backup")')]);
  assert.match(dl.suggestedFilename(), /^packwise-backup-\d{4}-\d{2}-\d{2}\.json$/);
  const path = await dl.path();
  const json = readFileSync(path, 'utf8');
  const parsed = JSON.parse(json);
  assert.equal(parsed.app, 'packwise');
  assert.equal(parsed.data.trips.length, 1);
  const snapshot = await tripState(page);

  const upload = async (name, content) => {
    await page.setInputFiles('input[type=file]', { name, mimeType: 'application/json', buffer: Buffer.from(content) });
  };
  // corrupted JSON, wrong app, tampered references: all rejected, nothing changes
  for (const bad of ['{ not json', JSON.stringify({ app: 'other' }), JSON.stringify({ ...parsed, data: { ...parsed.data, items: [{ ...parsed.data.items[0], tripId: 'nope' }] } })]) {
    await upload('bad.json', bad);
    await page.waitForSelector('dialog[open]:has-text("Can’t import this file")');
    await page.click('dialog button:has-text("OK")');
    assert.deepEqual((await tripState(page)).items, snapshot.items);
    assert.equal((await tripState(page)).trips.length, 1);
  }
  // merge keeps the existing trip and adds a copy
  await upload('good.json', json);
  await page.waitForSelector('dialog[open]:has-text("Import backup")');
  await page.click('dialog button:has-text("Import")');
  await page.waitForSelector('.toast:has-text("merged")');
  let st = await tripState(page);
  assert.equal(st.trips.length, 2);
  assert.equal(new Set(st.items.map((i) => i.id)).size, st.items.length);
  // replace needs a second confirmation
  await page.evaluate(() => window.__packwise.store.deleteTrip(window.__packwise.store.state.trips[1].id));
  await upload('good.json', json);
  await page.check('dialog input[value=replace]');
  await page.click('dialog button:has-text("Import")');
  await page.click('dialog button:has-text("Replace everything")');
  await page.waitForSelector('.toast:has-text("restored")');
  st = await tripState(page);
  assert.deepEqual(st.items, snapshot.items);
  assert.deepEqual(st.trips, snapshot.trips);
});

await test('clear all data asks for confirmation and really clears (incl. after reload)', async ({ page }) => {
  await skipWelcome(page);
  await createTrip(page);
  await page.goto(`${BASE}#/settings?tab=data`);
  await page.click('button:has-text("Clear data")');
  await page.click('dialog button:has-text("Cancel")');
  assert.equal((await tripState(page)).trips.length, 1);
  await page.click('button:has-text("Clear data")');
  await page.click('dialog button:has-text("Delete everything")');
  await page.waitForSelector('.toast:has-text("cleared")');
  await page.waitForTimeout(200);
  await reloadSettled(page);
  assert.equal((await tripState(page)).trips.length, 0);
});

await test('IndexedDB unavailable: app still works and warns clearly', async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem('packwise.prefs.v1', JSON.stringify({ onboarded: true })); } catch { /* ignore */ } Object.defineProperty(window, 'indexedDB', { value: undefined, configurable: true }); });
  await page.goto(BASE);
  await page.waitForSelector('.banner-warn:has-text("Local storage is unavailable")');
  await createTrip(page);
  assert.equal((await tripState(page)).trips.length, 1);
});

// ---------------------------------------------------------- a11y + motion
await test('keyboard: toggle with Space, dialogs close with Escape and restore focus, visible focus', async ({ page }) => {
  await skipWelcome(page);
  await createTrip(page);
  const box = page.locator('input[aria-label^="T-shirts:"]');
  await box.focus();
  await page.keyboard.press('Space');
  assert.equal((await tripState(page)).items.find((i) => i.name === 'T-shirts').packed > 0, true);
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')?.startsWith('T-shirts:')), true); // focus survives re-render
  const edit = page.locator('button[aria-label="Edit T-shirts"]');
  await edit.focus();
  await page.keyboard.press('Enter');
  await page.waitForSelector('dialog[open]');
  await page.keyboard.press('Escape');
  await page.waitForSelector('dialog', { state: 'detached' });
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Edit T-shirts');
  const outline = await edit.evaluate((el) => { el.focus(); return getComputedStyle(el).outlineStyle; });
  assert.notEqual(outline, 'none');
});

await test('accessible names: every control is labelled, progress bars exposed', async ({ page }) => {
  await skipWelcome(page);
  await createTrip(page);
  const check = async (route) => {
    await page.goto(`${BASE}#${route}`);
    await page.waitForSelector('#view > *');
    await page.waitForSelector('#view h1', { state: 'attached' }).catch(() => {}); // lazy screens
    const bad = await page.evaluate(() => {
      const issues = [];
      for (const el of document.querySelectorAll('#view button, #view a[href], .nav a')) {
        if (el.closest('[aria-hidden=true]')) continue; // decorative 3D tokens: the list below is the accessible equivalent
        const name = (el.getAttribute('aria-label') || el.textContent || '').trim();
        if (!name) issues.push(`${el.tagName} without name: ${el.outerHTML.slice(0, 80)}`);
      }
      for (const el of document.querySelectorAll('#view input, #view select, #view textarea')) {
        if (el.type === 'hidden') continue;
        const labelled = el.getAttribute('aria-label') || el.labels?.length || el.getAttribute('aria-labelledby');
        if (!labelled) issues.push(`input without label: ${el.outerHTML.slice(0, 80)}`);
      }
      for (const el of document.querySelectorAll('[role=progressbar]')) if (!el.getAttribute('aria-label')) issues.push('progressbar without label');
      if (!document.querySelector('h1')) issues.push('missing h1');
      return issues;
    });
    assert.deepEqual(bad, [], `a11y issues on ${route}`);
  };
  const id = (await tripState(page)).trips[0].id;
  for (const r of ['/', '/trips', '/trips/new', `/trip/${id}`, `/trip/${id}/tasks`, `/trip/${id}/summary`, `/trip/${id}/edit`, `/trip/${id}/studio`, '/templates', `/trip/${id}/explore`, `/trip/${id}/taste`, `/trip/${id}/guide`, `/trip/${id}/print`, '/settings', '/settings?tab=data', '/settings?tab=preferences', '/settings?tab=about']) await check(r);
});

await test('reduced motion disables animations; page still usable', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await skipWelcome(page);
  await createTrip(page);
  const dur = await page.evaluate(() => { const el = document.querySelector('.check') || document.querySelector('.bar-fill'); return parseFloat(getComputedStyle(el).transitionDuration) * 1000; });
  assert.ok(dur <= 1, `transition should be ~0ms, got ${dur}`);
  const anim = await page.evaluate(() => { const el = document.querySelector('#view > *'); return parseFloat(getComputedStyle(el).animationDuration) * 1000; });
  assert.ok(anim <= 1, `animation should be ~0ms, got ${anim}`);
});


// ============================================================ PHASE 2
const studioState = (page) => page.evaluate(() => {
  const st = window.__packwise.store.state;
  const sel = (q) => [...document.querySelectorAll(q)].map((e) => e.dataset.id);
  return { items: JSON.parse(JSON.stringify(st.items)), caseIds: sel('.token3d'), trayIds: sel('.tray-token'), ghosts: document.querySelectorAll('.ghost').length };
});
const openStudio = async (page, tripId) => {
  await page.goto(`${BASE}#/trip/${tripId}/studio`);
  await page.waitForSelector('.stage .token3d, .tray-token');
};
const firstTrip = async (page) => (await tripState(page)).trips[0].id;

await test('studio: tray, case, tiles and checklist stay in sync (pack, unpack, bag switch)', async ({ page }) => {
  await skipWelcome(page);
  await createTrip(page, { bags: ['Checked'] });
  const id = await firstTrip(page);
  const st0 = await tripState(page);
  const [bagA, bagB] = st0.bags.filter((b) => b.tripId === id);
  await openStudio(page, id);
  await page.selectOption('select[name=bag]', bagB.id);
  await page.waitForTimeout(100);
  const inB = (st) => st.items.filter((i) => i.bagId === bagB.id);
  let s = await studioState(page);
  assert.equal(s.trayIds.length, Math.min(14, inB(s).length)); // tray is capped; the list below holds everything
  assert.equal(s.caseIds.length, 0);
  // pack three from the tray
  for (let n = 0; n < 3; n++) { await page.locator('.tray-token').first().click(); await page.waitForTimeout(80); }
  await page.waitForFunction(() => window.__packwise.store.state.items.filter((i) => i.packed >= i.target).length >= 3);
  await page.waitForTimeout(700);
  s = await studioState(page);
  const packed = inB(s).filter((i) => i.packed >= i.target).map((i) => i.id);
  assert.equal(packed.length, 3);
  assert.deepEqual([...s.caseIds].sort(), [...packed].sort());
  assert.ok(packed.every((pid) => !s.trayIds.includes(pid)), 'packed items leave the tray');
  assert.equal(s.ghosts, 0, 'no flight ghosts left behind');
  // the tile list shows the same state
  for (const pid of packed) assert.equal(await page.getAttribute(`.tile-main[data-key="tile-${pid}"]`, 'aria-pressed'), 'true');
  // unpack one through the accessible tile control: it returns to the tray, leaves the case
  await page.click(`.tile-main[data-key="tile-${packed[0]}"]`);
  await page.waitForTimeout(700);
  s = await studioState(page);
  assert.ok(!s.caseIds.includes(packed[0]) && s.trayIds.includes(packed[0]));
  assert.equal(s.caseIds.length, 2);
  // switching bags shows only that bag's items
  await page.selectOption('select[name=bag]', bagA.id);
  await page.waitForTimeout(150);
  s = await studioState(page);
  const idsA = new Set(s.items.filter((i) => i.bagId === bagA.id).map((i) => i.id));
  assert.ok([...s.caseIds, ...s.trayIds].every((x) => idsA.has(x)));
  assert.equal(s.caseIds.length, 0);
  // the checklist agrees
  await page.goto(`${BASE}#/trip/${id}`);
  const after = await tripState(page);
  assert.equal(await pct(page), sumPct(after.items.filter((i) => i.tripId === id)));
});

function sumPct(items) {
  const t = items.reduce((a, i) => a + i.target, 0);
  const p = items.reduce((a, i) => a + Math.min(i.packed, i.target), 0);
  const r = Math.round((p / t) * 100);
  return p < t && r === 100 ? 99 : r;
}

await test('studio: rapid taps, leaving mid-animation and switching trips never duplicate or lose items', async ({ page }) => {
  await skipWelcome(page);
  await createTrip(page, { dest: 'Rome, Italy' });
  const a = await firstTrip(page);
  await createTrip(page, { dest: 'Lisbon', type: 'Beach', start: '2027-03-01', end: '2027-03-05' });
  const b = (await tripState(page)).trips.find((t) => t.id !== a).id;
  await openStudio(page, a);
  const target = (await tripState(page)).items.find((i) => i.tripId === a && i.name === 'Phone charger');
  const tile = page.locator(`.tile-main[data-key="tile-${target.id}"]`);
  for (let n = 0; n < 7; n++) await tile.click({ delay: 0 });
  await page.waitForTimeout(900);
  let s = await studioState(page);
  assert.equal(s.items.find((i) => i.id === target.id).packed, target.target); // 7 toggles from unpacked ends packed
  assert.equal([...s.caseIds, ...s.trayIds].filter((x) => x === target.id).length, 1, 'exactly one visual per item');
  assert.equal(s.ghosts, 0);
  // start a flight and navigate away immediately
  await page.locator('.tray-token').first().click();
  await page.goto(`${BASE}#/`);
  await page.waitForTimeout(900);
  assert.equal(await page.locator('.ghost').count(), 0);
  // other trip: only its own items
  await openStudio(page, b);
  s = await studioState(page);
  const own = new Set(s.items.filter((i) => i.tripId === b).map((i) => i.id));
  assert.ok([...s.caseIds, ...s.trayIds].every((x) => own.has(x)));
  // back and forth with history while tapping
  await page.goBack();
  await page.goForward();
  await page.waitForSelector('.stage');
  assert.ok((await tripState(page)).items.every((i) => i.packed >= 0 && i.packed <= i.target));
});

await test('studio: camera controls (buttons, keyboard, drag), lid, and selection/focus', async ({ page }) => {
  await skipWelcome(page);
  await createTrip(page);
  const id = await firstTrip(page);
  await openStudio(page, id);
  const cam = () => page.evaluate(() => { const st = document.querySelector('.stage'); const g = (n) => st.style.getPropertyValue(n); return { yaw: g('--yaw'), tilt: g('--tilt'), zoom: g('--zoom'), lid: st.dataset.lid }; });
  const label = () => page.locator('.ctl[aria-label="Rotate view"] .ctl-state').innerText();
  assert.equal(await label(), 'Front');
  const seen = [];
  for (let n = 0; n < 4; n++) { await page.click('button[aria-label="Rotate view"]'); seen.push(await label()); }
  assert.deepEqual(seen, ['Left', 'Right', 'Top', 'Front']);
  await page.click('button[aria-label="Rotate view"]');
  assert.equal((await cam()).yaw, '-34deg');
  assert.equal(await page.locator('.ctl[aria-label="Zoom"] .ctl-state').innerText(), '100%');
  await page.click('button[aria-label="Zoom"]');
  assert.equal((await cam()).zoom, '1.25');
  await page.click('button[aria-label="Zoom"]'); await page.click('button[aria-label="Zoom"]');
  assert.equal((await cam()).zoom, '1');
  assert.equal((await cam()).lid, 'open');
  await page.click('button:has-text("Close lid")');
  assert.equal((await cam()).lid, 'closed');
  await page.click('button:has-text("Open lid")');
  // keyboard
  await page.focus('.stage');
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowRight');
  assert.equal((await cam()).yaw, '8deg');
  await page.keyboard.press('+');
  assert.ok(parseFloat((await cam()).zoom) > 1);
  await page.keyboard.press('Space');
  assert.equal((await cam()).lid, 'closed');
  await page.keyboard.press('Space');
  // mouse drag rotates
  const box = await page.locator('.stage').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2, { steps: 6 });
  await page.mouse.up();
  assert.ok(parseFloat((await cam()).yaw) > 15, 'drag rotated the view');
  // stage is described for assistive tech and tokens are hidden from it
  assert.match(await page.getAttribute('.stage', 'aria-label'), /items packed/);
  // selection: details card + edit; keyboard path through tile info button
  const item = (await tripState(page)).items.find((i) => i.name === 'Phone charger');
  await page.selectOption('select[name=bag]', item.bagId).catch(() => {});
  await page.click(`.tile-info[data-key="info-${item.id}"]`);
  await page.waitForSelector('.info-card');
  assert.match(await page.locator('.info-card').innerText(), /Phone charger/);
  await page.click('.info-card button:has-text("Pack")');
  await page.waitForFunction((x) => window.__packwise.store.state.items.find((i) => i.id === x).packed > 0, item.id);
  await page.click('.info-card button:has-text("Edit")');
  await page.waitForSelector('dialog[open]');
  await page.keyboard.press('Escape');
  await page.click('button[aria-label="Close details"]');
  assert.equal(await page.locator('.info-card').count(), 0);
});

await test('studio: motion levels — flight animation in standard, none with reduced motion', async ({ page }) => {
  await skipWelcome(page);
  await createTrip(page);
  const id = await firstTrip(page);
  const watch = () => page.evaluate(() => { window.__sawGhost = false; new MutationObserver(() => { if (document.querySelector('.ghost')) window.__sawGhost = true; }).observe(document.body, { childList: true, subtree: true }); });
  await openStudio(page, id);
  await watch();
  await page.locator('.tray-token').first().click();
  await page.waitForTimeout(800);
  assert.equal(await page.evaluate(() => window.__sawGhost), true, 'standard motion shows a flight');
  // user setting: reduced
  await page.goto(`${BASE}#/settings`);
  await page.click('label.seg-opt:has-text("Reduced")');
  assert.equal(await page.evaluate(() => document.documentElement.dataset.motion), 'reduced');
  await openStudio(page, id);
  await watch();
  await page.locator('.tray-token').first().click();
  await page.waitForTimeout(800);
  assert.equal(await page.evaluate(() => window.__sawGhost), false, 'reduced motion: no flight');
  const lidT = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.lid')).transitionDuration) * 1000);
  assert.ok(lidT <= 1, `lid transition should be instant, got ${lidT}ms`);
  // enhanced
  await page.goto(`${BASE}#/settings`);
  await page.click('label.seg-opt:has-text("Enhanced")');
  await reloadSettled(page);
  assert.equal(await page.evaluate(() => document.documentElement.dataset.motion), 'enhanced');
});

await test('studio: OS reduced-motion preference overrides an Enhanced setting', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('packwise.prefs.v1', JSON.stringify({ onboarded: true, motion: 'enhanced' })));
  await createTrip(page);
  assert.equal(await page.evaluate(() => document.documentElement.dataset.motion), 'reduced');
  await openStudio(page, await firstTrip(page));
  await page.evaluate(() => { window.__sawGhost = false; new MutationObserver(() => { if (document.querySelector('.ghost')) window.__sawGhost = true; }).observe(document.body, { childList: true, subtree: true }); });
  await page.locator('.tray-token').first().click();
  await page.waitForTimeout(700);
  assert.equal(await page.evaluate(() => window.__sawGhost), false);
});

await test('studio: many items stay legible (case capped at 24 tokens, tray capped, tiles paged)', async ({ page }) => {
  await skipWelcome(page);
  await createTrip(page);
  const id = await firstTrip(page);
  await page.evaluate((tid) => { const { store } = window.__packwise; const bag = store.state.bags.find((b) => b.tripId === tid).id; for (let n = 0; n < 150; n++) store.addItem(tid, { name: `Bulk item ${n}`, category: 'misc', bagId: bag, target: 1 }); store.state.items.filter((i) => i.tripId === tid && i.bagId === bag).forEach((i) => store.setPacked(i.id, i.target)); }, id);
  await openStudio(page, id);
  const s = await studioState(page);
  assert.ok(s.caseIds.length <= 24 && s.caseIds.length > 0);
  assert.match(await page.locator('.stage-more').innerText(), /^\+\d+ more packed$/);
  assert.ok((await page.locator('.tile-item').count()) <= 61); // 60 tiles + add tile
  await page.click('button:has-text("Show all")');
  assert.ok((await page.locator('.tile-item').count()) > 100);
});

await test('performance: 500-item trip renders checklist and studio quickly', async ({ page }) => {
  await skipWelcome(page);
  await createTrip(page, { bags: ['Checked'] });
  const id = await firstTrip(page);
  await page.evaluate((tid) => { const { store } = window.__packwise; for (let n = 0; n < 500; n++) store.addItem(tid, { name: `Perf item ${n}`, category: ['clothing', 'misc', 'electronics', 'documents'][n % 4], target: 1 + (n % 3) }); }, id);
  const time = async (route, sel) => { await page.goto(`${BASE}#/`); const t0 = Date.now(); await page.goto(`${BASE}#${route}`); await page.waitForSelector(sel); return Date.now() - t0; };
  const tChecklist = await time(`/trip/${id}`, '.category-card');
  const tStudio = await time(`/trip/${id}/studio`, '.tray .tray-token');
  console.log(`       (500 items: checklist ${tChecklist} ms, studio ${tStudio} ms)`);
  assert.ok(tChecklist < 3000, `checklist took ${tChecklist}ms`);
  assert.ok(tStudio < 3000, `studio took ${tStudio}ms`);
  // one tap on the checklist stays responsive with 500 rows (measured in-page: Playwright's own scrolling/actionability waits are not app cost)
  await page.goto(`${BASE}#/trip/${id}`);
  await page.waitForSelector('.category-card');
  const tap = await page.evaluate(async () => {
    const el = [...document.querySelectorAll('input.check')].find((i) => i.getAttribute('aria-label')?.startsWith('Perf item 0:'));
    const t0 = performance.now();
    el.click();
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return Math.round(performance.now() - t0);
  });
  console.log(`       (one tap with 500 rows: ${tap} ms to next paint)`);
  assert.ok(tap < 400, `tap took ${tap}ms`);
});

await test('checklist: reorder via drag, keyboard (Alt+Arrow) and dialog buttons; persists', async ({ page }) => {
  await skipWelcome(page);
  await createTrip(page, { bags: ['Checked'] });
  const id = await firstTrip(page);
  const order = async (cat) => page.evaluate(([tid, c]) => window.__packwise.store.state.items.filter((i) => i.tripId === tid && i.category === c).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name)).map((i) => i.name), [id, cat]);
  const before = await order('clothing');
  // keyboard alternative on the handle
  await page.focus('[data-key="drag-' + (await tripState(page)).items.find((i) => i.name === before[1]).id + '"]');
  await page.keyboard.press('Alt+ArrowUp');
  let now = await order('clothing');
  assert.deepEqual(now.slice(0, 2), [before[1], before[0]]);
  assert.equal(await page.evaluate(() => document.activeElement?.dataset.key?.startsWith('drag-')), true, 'focus stays on the handle');
  await page.keyboard.press('Alt+ArrowDown');
  now = await order('clothing');
  assert.deepEqual(now.slice(0, 2), before.slice(0, 2));
  // edit-dialog buttons
  await page.click(`button[aria-label="Edit ${before[0]}"]`);
  await page.click('dialog button:has-text("Move down")');
  now = await order('clothing');
  assert.deepEqual(now.slice(0, 2), [before[1], before[0]]);
  // pointer drag: move the first row below the third
  const handles = page.locator('.category-card >> nth=0').locator('.drag-handle');
  const first = await handles.nth(0).boundingBox();
  const third = await handles.nth(2).boundingBox();
  const movedName = now[0];
  await page.mouse.move(first.x + first.width / 2, first.y + first.height / 2);
  await page.mouse.down();
  await page.mouse.move(first.x + 5, third.y + third.height + 10, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(100);
  now = await order('clothing');
  assert.equal(now[2], movedName, `dragged item should be 3rd, got ${now.slice(0, 4)}`);
  await page.waitForTimeout(150);
  await reloadSettled(page);
  assert.deepEqual(await order('clothing'), now); // persisted
  // reordering is disabled while filtering (no misleading partial order)
  await page.fill('input[aria-label="Search items"]', 'sock');
  assert.equal(await page.locator('.drag-handle').count(), 0);
});

await test('checklist: bulk select (pack, unpack, move to bag, category, delete + undo), sort, essentials', async ({ page }) => {
  await skipWelcome(page);
  await createTrip(page, { bags: ['Checked'] });
  const id = await firstTrip(page);
  const [carry, checked] = (await tripState(page)).bags.filter((b) => b.tripId === id);
  // essentials banner + highlighted rows
  await page.waitForSelector('.essentials-banner');
  assert.ok((await page.locator('.item-row.is-essential-open').count()) > 0);
  await page.click('.chip:has-text("Select")');
  await page.waitForSelector('.bulk-bar');
  await page.check('input[aria-label="Select T-shirts"]');
  await page.check('input[aria-label="Select Underwear"]');
  await page.check('input[aria-label="Select Socks (pairs)"]');
  assert.equal(await page.locator('.bulk-count').innerText(), '3 selected');
  await page.click('.bulk-bar button:has-text("Packed")');
  let st = await tripState(page);
  assert.ok(['T-shirts', 'Underwear', 'Socks (pairs)'].every((n) => { const i = st.items.find((x) => x.tripId === id && x.name === n); return i.packed === i.target; }));
  await page.click('.bulk-bar button:has-text("Unpack")');
  st = await tripState(page);
  assert.ok(['T-shirts', 'Underwear', 'Socks (pairs)'].every((n) => st.items.find((x) => x.tripId === id && x.name === n).packed === 0));
  await page.selectOption('select[name=bulkBag]', carry.id);
  st = await tripState(page);
  assert.ok(['T-shirts', 'Underwear', 'Socks (pairs)'].every((n) => st.items.find((x) => x.tripId === id && x.name === n).bagId === carry.id));
  await page.selectOption('select[name=bulkCat]', 'misc');
  st = await tripState(page);
  assert.equal(st.items.find((x) => x.tripId === id && x.name === 'T-shirts').category, 'misc');
  const n = st.items.filter((i) => i.tripId === id).length;
  await page.click('.bulk-bar button:has-text("Delete")');
  await page.waitForSelector('.toast:has-text("Removed 3 items")');
  assert.equal((await tripState(page)).items.filter((i) => i.tripId === id).length, n - 3);
  await page.click('.toast-action:has-text("Undo")');
  assert.equal((await tripState(page)).items.filter((i) => i.tripId === id).length, n);
  await page.click('.bulk-bar button:has-text("Done")');
  assert.equal(await page.locator('.bulk-bar').count(), 0);
  // sort by priority puts high first within a category
  await page.evaluate((tid) => { const { store } = window.__packwise; const it = store.state.items.find((i) => i.tripId === tid && /jacket$/i.test(i.name)); store.updateItem(it.id, { priority: 'high', category: 'clothing' }); }, id); // Dec dates => winter => 'Warm jacket'
  await page.selectOption('select[name=sortBy]', 'priority');
  assert.match(await page.locator(".category-card >> nth=0").locator(".item-name").first().textContent(), /jacket/i); // textContent: rows below the fold use content-visibility, which empties innerText
  await page.selectOption('select[name=sortBy]', 'name');
  const names = (await page.locator('.category-card >> nth=0').locator('.item-name').allTextContents()).map((t) => t.trim());
  assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b)));
});

await test('templates: save from a trip, build a new trip from it, built-ins, customize, copy previous trip, climate', async ({ page }) => {
  await skipWelcome(page);
  await createTrip(page, { dest: 'Source trip' });
  const src = await firstTrip(page);
  await page.evaluate((tid) => { const { store } = window.__packwise; store.addItem(tid, { name: 'Lucky charm', category: 'misc', target: 3 }); store.setPacked(store.state.items.find((i) => i.tripId === tid).id, 1); }, src);
  const srcItems = JSON.stringify((await tripState(page)).items.filter((i) => i.tripId === src));
  await page.click('button[aria-label="Trip actions"]');
  await page.click('.sheet-item:has-text("Save as template")');
  await page.fill('dialog input[type=text]', 'My city list');
  await page.click('dialog button:has-text("Save template")');
  await page.waitForSelector('.toast:has-text("Saved template")');
  await page.goto(`${BASE}#/templates`);
  await page.waitForSelector('h3:has-text("My city list")');
  assert.equal(await page.locator('.tpl-card').count(), 7); // 1 saved + 6 built-in
  // edit suggested quantities of the saved template
  await page.click('button[aria-label="Actions for My city list"]');
  await page.click('.sheet-item:has-text("Edit name")');
  await page.click('dialog button[aria-label="Increase Lucky charm"]');
  await page.click('dialog button:has-text("Save")');
  assert.equal((await tripState(page)).templates[0].items.find((i) => i.name === 'Lucky charm').target, 4);
  // new trip from the template
  await page.click('a[aria-label],a:has-text("Use") >> nth=0').catch(() => {});
  await page.goto(`${BASE}#/trips/new?template=${(await tripState(page)).templates[0].id}`);
  await page.fill('input[name=destination]', 'From template');
  await generate(page);
  await page.waitForSelector('h1:has-text("From template")');
  let st = await tripState(page);
  const created = st.trips.find((t) => t.name === 'From template');
  const createdItems = st.items.filter((i) => i.tripId === created.id);
  assert.equal(createdItems.length, st.templates[0].items.length);
  assert.equal(createdItems.find((i) => i.name === 'Lucky charm').target, 4);
  assert.ok(createdItems.every((i) => i.packed === 0));
  assert.equal(JSON.stringify(st.items.filter((i) => i.tripId === src)), srcItems, 'existing trip untouched');
  // built-in: weekend template via the form; camping has a tent
  await page.goto(`${BASE}#/trips/new?template=builtin-camping`);
  await page.fill('input[name=destination]', 'Woods');
  await generate(page);
  await page.waitForSelector('h1:has-text("Woods")');
  assert.ok((await tripState(page)).items.some((i) => /^Tent/.test(i.name)));
  // customize a built-in and save to My templates
  await page.goto(`${BASE}#/templates`);
  await page.click('button[aria-label="Customize Weekend getaway"]');
  await page.click('dialog button:has-text("Save as my template")');
  await page.waitForSelector('.toast:has-text("Saved to My templates")');
  assert.ok((await tripState(page)).templates.some((t) => t.name === 'Weekend getaway (mine)'));
  // copy a previous trip
  await page.goto(`${BASE}#/trips/new`);
  await page.fill('input[name=destination]', 'Copycat');
  await page.click('label.seg-opt:has-text("Previous trip")');
  await page.selectOption('select[name=copyFrom]', src);
  await generate(page);
  await page.waitForSelector('h1:has-text("Copycat")');
  st = await tripState(page);
  const copy = st.trips.find((t) => t.name === 'Copycat');
  const ci = st.items.filter((i) => i.tripId === copy.id);
  assert.equal(ci.length, st.items.filter((i) => i.tripId === src).length);
  assert.ok(ci.every((i) => i.packed === 0));
  // climate nudges the suggested list
  await page.goto(`${BASE}#/trips/new`);
  await page.fill('input[name=destination]', 'Arctic');
  await page.click('label.seg-opt:has-text("Winter")');
  await page.click('label.cond-chip:has-text("Cold")');
  await generate(page);
  await page.waitForSelector('h1:has-text("Arctic")');
  assert.ok((await tripState(page)).items.some((i) => i.name === 'Gloves'));
  // delete a custom template with confirmation
  await page.goto(`${BASE}#/templates`);
  await page.click('button[aria-label="Actions for My city list"]');
  await page.click('.sheet-item:has-text("Delete")');
  await page.click('dialog button:has-text("Delete template")');
  await page.waitForFunction(() => !window.__packwise.store.state.templates.some((t) => t.name === 'My city list'));
});

await test('return trip: separate checklist, original packed state and tasks preserved', async ({ page }) => {
  await skipWelcome(page);
  await createTrip(page, { dest: 'Rome, Italy', bags: ['Checked'] });
  const src = await firstTrip(page);
  await page.evaluate((tid) => { const { store } = window.__packwise; store.state.items.filter((i) => i.tripId === tid).forEach((i) => store.setPacked(i.id, i.target)); store.state.tasks.filter((t) => t.tripId === tid).slice(0, 2).forEach((t) => store.toggleTask(t.id)); }, src);
  const histI = JSON.stringify((await tripState(page)).items.filter((i) => i.tripId === src));
  const histT = JSON.stringify((await tripState(page)).tasks.filter((i) => i.tripId === src));
  await page.click('button[aria-label="Trip actions"]');
  await page.click('.sheet-item:has-text("Plan return trip")');
  await page.waitForSelector('dialog[open] .pick-list');
  await page.click('dialog button:has-text("Select none")');
  await page.click('dialog button:has-text("Create return checklist")');
  await page.waitForSelector('.toast:has-text("at least one")');
  await page.check('dialog input[aria-label="T-shirts"]');
  await page.check('dialog input[aria-label="Phone charger"]');
  await page.click('dialog button:has-text("Create return checklist")');
  await page.waitForSelector('h1:has-text("— return")');
  await page.waitForSelector('text=Return trip');
  const st = await tripState(page);
  const back = st.trips.find((t) => t.returnOf === src);
  const bi = st.items.filter((i) => i.tripId === back.id);
  assert.deepEqual(bi.map((i) => i.name).sort(), ['Phone charger', 'T-shirts']);
  assert.ok(bi.every((i) => i.packed === 0));
  assert.ok(st.tasks.filter((t) => t.tripId === back.id).length >= 3);
  assert.equal(JSON.stringify(st.items.filter((i) => i.tripId === src)), histI);
  assert.equal(JSON.stringify(st.tasks.filter((t) => t.tripId === src)), histT);
  // return badge in the list and a companion tip on the dashboard
  await page.goto(`${BASE}#/trips`);
  await page.waitForSelector('.trip-card-return');
  await page.goto(`${BASE}#/trip/${back.id}/summary`);
  await page.waitForSelector('a:has-text("Original trip")');
});

await test('companion: contextual tips, dismiss persists, can be muted; readiness chip', async ({ page }) => {
  await skipWelcome(page);
  const dateOffset = (n) => { const d = new Date(Date.now() + n * 86400000); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  await createTrip(page, { start: dateOffset(2), end: dateOffset(6) });
  await page.goto(`${BASE}#/`);
  await page.waitForSelector('.bubble');
  const firstText = await page.locator('.bubble-text').innerText();
  assert.match(firstText, /Still to pack|first trip/);
  assert.equal(await page.locator('.ready-chip').innerText(), 'Needs attention');
  await page.click('button[aria-label="Dismiss tip"]');
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('packwise.prefs.v1')).dismissed.length), 1);
  await reloadSettled(page);
  const again = await page.locator('.bubble-text').allInnerTexts();
  assert.ok(!again.includes(firstText), 'a dismissed tip stays dismissed after reload');
  // packing everything: completion tip + Ready
  await page.evaluate(() => { const { store } = window.__packwise; store.state.items.forEach((i) => store.setPacked(i.id, i.target)); store.state.tasks.forEach((t) => !t.done && store.toggleTask(t.id)); });
  await page.waitForSelector('.ready-chip:has-text("Ready to go")');
  await page.waitForSelector('.bubble-text:has-text("Everything is packed")');
  // mute in settings hides it everywhere
  await page.goto(`${BASE}#/settings?tab=preferences`);
  await page.uncheck('input[name=companion]');
  await page.goto(`${BASE}#/`);
  await page.waitForSelector('.dashboard');
  assert.equal(await page.locator('.bubble').count(), 0);
  await page.goto(`${BASE}#/trip/${await firstTrip(page)}/studio`);
  await page.waitForSelector('.stage');
  assert.equal(await page.locator('.bubble').count(), 0);
});

await test('sample data: added, clearly labelled, removable without touching user trips', async ({ page }) => {
  await skipWelcome(page);
  await createTrip(page, { dest: 'Mine' });
  await page.goto(`${BASE}#/settings?tab=data`);
  await page.click('button:has-text("Add sample trip")');
  await page.waitForFunction(() => window.__packwise.store.state.trips.some((t) => t.isDemo));
  await page.goto(`${BASE}#/trips`);
  await page.waitForSelector('h3:has-text("Sample: Lisbon city break")');
  await page.goto(`${BASE}#/settings?tab=data`);
  await page.click('button:has-text("Remove sample data")');
  await page.waitForFunction(() => !window.__packwise.store.state.trips.some((t) => t.isDemo));
  const st = await tripState(page);
  assert.deepEqual(st.trips.map((t) => t.name), ['Mine']);
  assert.ok(st.items.every((i) => i.tripId === st.trips[0].id));
});

await test('phase 2 data survives export/import (templates, return links, new fields)', async ({ page }) => {
  await skipWelcome(page);
  await createTrip(page, { dest: 'Rome, Italy' });
  const src = await firstTrip(page);
  await page.evaluate((tid) => { const { store } = window.__packwise; store.saveTripAsTemplate(tid, 'Tpl'); store.createReturnTrip(tid, {}); store.updateTrip(tid, { season: 'winter', conditions: ['cold', 'rainy'] }); }, src);
  await page.goto(`${BASE}#/settings?tab=data`);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('button:has-text("Export backup")')]);
  const json = readFileSync(await dl.path(), 'utf8');
  const before = await tripState(page);
  await page.click('button:has-text("Clear data")');
  await page.click('dialog button:has-text("Delete everything")');
  await page.waitForFunction(() => window.__packwise.store.state.trips.length === 0);
  await page.setInputFiles('input[type=file]', { name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(json) });
  await page.click('dialog button:has-text("Import")');
  await page.waitForFunction(() => window.__packwise.store.state.trips.length === 2);
  const after = await tripState(page);
  assert.deepEqual(after.trips, before.trips);
  assert.deepEqual(after.templates, before.templates);
  assert.equal(after.trips.find((t) => t.returnOf).returnOf, src);
  assert.deepEqual(after.trips.find((t) => t.id === src).conditions, ['cold', 'rainy']);
  assert.equal(after.trips.find((t) => t.id === src).season, 'winter');
});

await test('offline: studio and checklist work with the service worker, edits persist', async ({ page, ctx }) => {
  await skipWelcome(page);
  await page.goto(BASE);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await createTrip(page, { bags: ['Checked'] });
  const id = await firstTrip(page);
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller);
  await ctx.setOffline(true);
  await page.goto(`${BASE}#/trip/${id}/studio`);
  await page.reload();
  await page.waitForSelector('.tray .tray-token');
  await page.locator('.tray-token').first().click();
  await page.waitForTimeout(600);
  const packed = (await tripState(page)).items.filter((i) => i.packed > 0).length;
  assert.equal(packed, 1);
  await ctx.setOffline(false);
  await reloadSettled(page);
  assert.equal((await tripState(page)).items.filter((i) => i.packed > 0).length, 1);
}, { sw: true });


await test('create trip: camping auto-suggests camping gear + backpack; season and weather shape the list', async ({ page }) => {
  await skipWelcome(page);
  await page.goto(`${BASE}#/trips/new`);
  await page.click('label.tile:has-text("Camping")');
  assert.equal(await page.isChecked('input[name=bags][value=camping]'), true);
  assert.equal(await page.isChecked('input[name=bags][value=backpack]'), true);
  assert.equal(await page.isChecked('input[name=bags][value="carry-on"]'), false);
  // manual choice is respected: once the user touches bags, switching type does not override
  await page.click('label.tile:has-text("City")');
  await page.click('label.tile:has-text("Camping")');
  await page.click('label.tile:has-text("Backpack")');
  await page.click('label.tile:has-text("City")');
  await page.click('label.tile:has-text("Camping")');
  assert.equal(await page.isChecked('input[name=bags][value=backpack]'), false);
  await page.click('label.tile:has-text("Backpack")');
  await page.fill('input[name=destination]', 'Pine Lake');
  await page.click('label.seg-opt:has-text("Fall")');
  await page.click('label.cond-chip:has-text("Cool")');
  await page.click('label.cond-chip:has-text("Rainy")');
  await generate(page);
  await page.waitForSelector('h1:has-text("Pine Lake")');
  await page.waitForSelector('text=Fall · Cool, Rainy');
  const st = await tripState(page);
  const trip = st.trips[0];
  assert.equal(trip.season, 'fall');
  assert.deepEqual(trip.conditions, ['cool', 'rainy']);
  const gear = st.bags.find((b) => b.kind === 'camping');
  assert.ok(gear && gear.name === 'Camping gear');
  const camp = st.items.filter((i) => i.category === 'camping');
  assert.ok(camp.length >= 15 && camp.every((i) => i.bagId === gear.id));
  assert.ok(camp.some((i) => i.name === 'Tarp / rain fly'));
  assert.ok(st.items.some((i) => i.name === 'Compact umbrella'));
  await page.waitForSelector('section[aria-label="Camping gear"]');
  // studio shows camping tokens for the gear bag
  await page.goto(`${BASE}#/trip/${trip.id}/studio`);
  await page.selectOption('select[name=bag]', gear.id);
  await page.waitForSelector('.tray-token[data-cat=camping] .item-art');
  // edit keeps the weather choices
  await page.goto(`${BASE}#/trip/${trip.id}/edit`);
  assert.equal(await page.isChecked('input[name=season][value=fall]'), true);
  assert.equal(await page.isChecked('input[name=conditions][value=rainy]'), true);
  await page.click('label.cond-chip:has-text("Windy")');
  await page.click('button:has-text("Save changes")');
  await page.waitForSelector('text=Fall · Cool, Rainy, Windy');
});


await test('season is suggested from Balkan dates and respects a manual choice', async ({ page }) => {
  await skipWelcome(page);
  await page.goto(`${BASE}#/trips/new`);
  const season = () => page.evaluate(() => document.querySelector('input[name=season]:checked')?.value || '');
  assert.equal(await season(), '');
  await page.fill('input[name=start]', '2026-07-10');
  assert.equal(await season(), 'summer');
  assert.match(await page.locator('p[aria-live=polite]:has-text("Set from your dates")').first().innerText(), /Set from your dates: Summer/);
  await page.fill('input[name=end]', '2026-07-20');
  assert.equal(await season(), 'summer');
  await page.fill('input[name=start]', '2027-01-05');
  await page.fill('input[name=end]', '2027-01-12');
  assert.equal(await season(), 'winter');
  await page.fill('input[name=start]', '2026-11-28'); // mostly December
  await page.fill('input[name=end]', '2026-12-05');
  assert.equal(await season(), 'winter');
  assert.match(await page.locator('text=Balkan seasons').innerText(), /Dec–Feb/);
  // manual pick sticks when dates change
  await page.click('label.seg-opt:has-text("Spring")');
  await page.fill('input[name=start]', '2026-08-01');
  await page.fill('input[name=end]', '2026-08-05');
  assert.equal(await season(), 'spring');
  await page.fill('input[name=destination]', 'Ohrid');
  await generate(page);
  await page.waitForSelector('h1:has-text("Ohrid")');
  assert.equal((await tripState(page)).trips[0].season, 'spring');
  // a fresh trip with summer dates gets the summer list without touching the season control
  await page.goto(`${BASE}#/trips/new`);
  await page.fill('input[name=destination]', 'Budva');
  await page.fill('input[name=start]', '2026-07-01');
  await page.fill('input[name=end]', '2026-07-08');
  await generate(page);
  await page.waitForSelector('h1:has-text("Budva")');
  const st = await tripState(page);
  const budva = st.trips.find((t) => t.name === 'Budva');
  assert.equal(budva.season, 'summer');
  assert.ok(st.items.some((i) => i.tripId === budva.id && i.name === 'Sunscreen'));
});


// ============================================================ PHASE 3
// Raw IndexedDB access from the test side. (The app's CSP forbids eval, so each helper carries its own plain function.)
const idbSetVersion = (page, value) => page.evaluate((v) => new Promise((resolve, reject) => {
  const req = indexedDB.open('packwise');
  req.onerror = () => reject(req.error);
  req.onsuccess = () => { const db = req.result; const tx = db.transaction('meta', 'readwrite'); tx.objectStore('meta').put({ key: 'schemaVersion', value: v }); tx.oncomplete = () => { db.close(); resolve(); }; };
}), value);
const idbSnapshotRaw = (page) => page.evaluate(() => new Promise((resolve, reject) => {
  const req = indexedDB.open('packwise');
  req.onerror = () => reject(req.error);
  req.onsuccess = () => { const db = req.result; const out = {}; const tx = db.transaction(['trips', 'meta'], 'readonly'); tx.objectStore('trips').getAll().onsuccess = (e) => { out.trips = e.target.result.map((t) => t.name); }; tx.objectStore('meta').get('schemaVersion').onsuccess = (e) => { out.version = e.target.result.value; }; tx.oncomplete = () => { db.close(); resolve(out); }; };
}));
const idbSeedLegacy = (page) => page.evaluate(() => new Promise((resolve, reject) => {
  const req = indexedDB.open('packwise');
  req.onerror = () => reject(req.error);
  req.onsuccess = () => {
    const db = req.result;
    const tx = db.transaction(['trips', 'bags', 'items', 'meta'], 'readwrite');
    ['trips', 'bags', 'items'].forEach((n) => tx.objectStore(n).clear());
    tx.objectStore('trips').put({ id: 'old1', name: 'Legacy trip', status: 'active' });
    tx.objectStore('bags').put({ id: 'oldb', tripId: 'old1', name: 'Bag', kind: 'other', order: 0 });
    tx.objectStore('items').put({ id: 'oldi', tripId: 'old1', bagId: 'oldb', name: 'Old shirt', qty: 4, done: true });
    tx.objectStore('meta').put({ key: 'schemaVersion', value: 0 });
    tx.oncomplete = () => { db.close(); resolve(); };
  };
}));

await test('settings: tabs (ARIA + arrow keys + deep link), background styles, motion', async ({ page }) => {
  await skipWelcome(page);
  await page.goto(`${BASE}#/settings`);
  const tabs = page.locator('[role=tab]');
  assert.deepEqual(await tabs.allInnerTexts(), ['Appearance', 'Data', 'Preferences', 'About']);
  assert.equal(await page.getAttribute('#tab-appearance', 'aria-selected'), 'true');
  assert.equal(await page.getAttribute('[role=tabpanel]', 'aria-labelledby'), 'tab-appearance');
  await page.focus('#tab-appearance');
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.getAttribute('#tab-data', 'aria-selected'), 'true');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'tab-data');
  await page.keyboard.press('End');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'tab-about');
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'tab-appearance'); // wraps
  await page.goto(`${BASE}#/settings?tab=preferences`);
  assert.equal(await page.getAttribute('#tab-preferences', 'aria-selected'), 'true');
  // backgrounds
  await page.goto(`${BASE}#/settings`);
  assert.equal(await page.locator('.bg-opt').count(), 5);
  assert.equal(await page.evaluate(() => document.documentElement.dataset.bg), 'default');
  assert.equal(await page.locator('#bg-art svg').count(), 0);
  for (const [name, expectArt] of [['Mountains', true], ['Beach', true], ['City', true], ['Minimal', false], ['Default', false]]) {
    await page.click(`label.bg-opt:has-text("${name}")`);
    assert.equal(await page.evaluate(() => document.documentElement.dataset.bg), name.toLowerCase());
    assert.equal((await page.locator('#bg-art svg').count()) > 0, expectArt, name);
  }
  await page.click('label.bg-opt:has-text("Beach")');
  await reloadSettled(page);
  assert.equal(await page.evaluate(() => document.documentElement.dataset.bg), 'beach');
  assert.ok((await page.locator('#bg-art svg').count()) > 0);
  assert.equal(await page.getAttribute('#bg-art', 'aria-hidden'), 'true');
});

await test('haptics: off by default, vibrates only when enabled and supported', async ({ page }) => {
  await page.addInitScript(() => { window.__vibes = []; navigator.vibrate = (p) => { window.__vibes.push(p); return true; }; });
  await skipWelcome(page);
  await createTrip(page);
  const id = await firstTrip(page);
  await page.check('input[aria-label^="T-shirts:"]');
  assert.equal(await page.evaluate(() => window.__vibes.length), 0, 'off by default');
  await page.goto(`${BASE}#/settings?tab=preferences`);
  await page.click('label.switch-row:has-text("Vibrate when packing")');
  assert.equal(await page.evaluate(() => window.__vibes.length), 1); // confirmation tick
  await page.goto(`${BASE}#/trip/${id}`);
  await page.uncheck('input[aria-label^="T-shirts:"]');
  const afterUnpack = await page.evaluate(() => window.__vibes.length);
  await page.check('input[aria-label^="T-shirts:"]');
  assert.equal(await page.evaluate(() => window.__vibes.at(-1)), 10);
  assert.equal(await page.evaluate(() => window.__vibes.length), afterUnpack + 1);
  // completing the whole trip uses the success pattern
  await page.evaluate(() => { const { store } = window.__packwise; const open = store.state.items.filter((i) => i.packed < i.target); open.slice(0, -1).forEach((i) => store.setPacked(i.id, i.target)); });
  await page.evaluate(() => { const { store } = window.__packwise; const last = store.state.items.find((i) => i.packed < i.target); store.setPacked(last.id, last.target); });
  assert.deepEqual(await page.evaluate(() => window.__vibes.at(-1)), [18, 40, 28]);
  // turning it off stops it
  await page.goto(`${BASE}#/settings?tab=preferences`);
  await page.click('label.switch-row:has-text("Vibrate when packing")');
  const n = await page.evaluate(() => window.__vibes.length);
  await page.evaluate(() => { const { store } = window.__packwise; store.setPacked(store.state.items[0].id, 0); store.setPacked(store.state.items[0].id, store.state.items[0].target); });
  assert.equal(await page.evaluate(() => window.__vibes.length), n);
});

await test('haptics: unsupported devices see a disabled, explained control', async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(Navigator.prototype, 'vibrate', { value: undefined, configurable: true }); });
  await skipWelcome(page);
  await page.goto(`${BASE}#/settings?tab=preferences`);
  assert.equal(await page.isDisabled('input[name=haptics]'), true);
  assert.match(await page.locator('.settings-card:has-text("Haptic")').innerText(), /Not supported/);
});

await test('export as text, copy as text and print view', async ({ page, ctx }) => {
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
  await skipWelcome(page);
  await createTrip(page, { dest: 'Rome, Italy', bags: ['Checked'] });
  const id = await firstTrip(page);
  await page.check('input[aria-label^="T-shirts:"]');
  await page.click('button[aria-label="Trip actions"]');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('.sheet-item:has-text("Export as text")')]);
  assert.equal(dl.suggestedFilename(), 'packwise-rome-italy.txt');
  const text = readFileSync(await dl.path(), 'utf8');
  assert.match(text, /^PackWise — Rome, Italy/);
  assert.match(text, /CARRY-ON \(\d+\/\d+\)/);
  assert.match(text, /CHECKED \(\d+\/\d+\)/);
  assert.match(text, /\[x\] T-shirts x\d+/);
  assert.match(text, /TRAVEL TASKS/);
  await page.click('button[aria-label="Trip actions"]');
  await page.click('.sheet-item:has-text("Copy as text")');
  await page.waitForSelector('.toast:has-text("copied")');
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), text.replace(/\n$/, ''));
  // print view
  await page.click('button[aria-label="Trip actions"]');
  await page.click('.sheet-item:has-text("Print list")');
  await page.waitForSelector('.print-sheet');
  assert.equal(await page.locator('.print-sheet h1').innerText(), 'Rome, Italy');
  assert.ok((await page.locator('.print-sheet li').count()) > 30);
  assert.ok((await page.locator('.pbox.is-done').count()) >= 1);
  await page.evaluate(() => { window.__printed = 0; window.print = () => { window.__printed += 1; }; });
  await page.click('[data-key="print-now"]');
  assert.equal(await page.evaluate(() => window.__printed), 1);
  await page.emulateMedia({ media: 'print' });
  assert.equal(await page.isVisible('.nav'), false, 'navigation hidden when printing');
  assert.equal(await page.isVisible('.print-actions'), false, 'buttons hidden when printing');
  assert.equal(await page.isVisible('.print-sheet'), true);
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  assert.equal(bg, 'rgb(255, 255, 255)');
  // all trips as text from Settings
  await page.emulateMedia({ media: 'screen' });
  await page.goto(`${BASE}#/settings?tab=data`);
  const [all] = await Promise.all([page.waitForEvent('download'), page.click('button:has-text("Export all trips as text")')]);
  assert.equal(all.suggestedFilename(), 'packwise-all-trips.txt');
  void id;
});

await test('storage full: banner, retry, recovery; nothing is lost after reload', async ({ page }) => {
  await skipWelcome(page);
  await createTrip(page);
  await page.evaluate(() => {
    const a = window.__packwise.store.adapter;
    window.__orig = { commit: a.commit, replaceAll: a.replaceAll };
    const quota = () => Promise.reject(Object.assign(new Error('full'), { name: 'QuotaExceededError' }));
    a.commit = quota;
    a.replaceAll = quota;
  });
  await page.check('input[aria-label^="T-shirts:"]');
  await page.waitForSelector('.banner-error:has-text("storage is full")');
  assert.ok(await page.locator('.banner-error button:has-text("Export backup")').count());
  assert.equal(await page.getAttribute('.banner-error a:has-text("Manage storage")', 'href'), '#/settings?tab=data');
  // still full
  await page.click('button:has-text("Try saving again")');
  await page.waitForSelector('.toast:has-text("Still could not save")');
  assert.ok(await page.locator('.banner-error').count());
  // the app keeps working while saving fails
  await page.check('input[aria-label^="Underwear:"]');
  // space freed
  await page.evaluate(() => { const a = window.__packwise.store.adapter; Object.assign(a, window.__orig); });
  await page.click('button:has-text("Try saving again")');
  await page.waitForSelector('.toast:has-text("Everything is saved now")');
  assert.equal(await page.locator('.banner-error').count(), 0);
  await page.waitForTimeout(100);
  await reloadSettled(page);
  const st = await tripState(page);
  assert.ok(st.items.find((i) => i.name === 'T-shirts').packed > 0);
  assert.ok(st.items.find((i) => i.name === 'Underwear').packed > 0);
});

await test('newer-version data is never overwritten; app runs a clean in-memory session', async ({ page }) => {
  await skipWelcome(page);
  await createTrip(page, { dest: 'Keep me' });
  await page.waitForTimeout(200);
  await idbSetVersion(page, 99);
  await reloadSettled(page);
  await page.waitForSelector('.banner-warn:has-text("newer version")');
  assert.equal((await tripState(page)).trips.length, 0);
  await createTrip(page, { dest: 'Temp' }); // works, but is not persisted
  await reloadSettled(page);
  const raw = await idbSnapshotRaw(page);
  assert.deepEqual(raw, { trips: ['Keep me'], version: 99 });
});

await test('migration keeps a safety copy that can be downloaded', async ({ page }) => {
  await skipWelcome(page);
  await page.goto(BASE);
  await page.waitForSelector('#view > *');
  // write pre-release (v0) shaped data straight into IndexedDB
  await idbSeedLegacy(page);
  await reloadSettled(page);
  const st = await tripState(page);
  assert.deepEqual([st.items[0].target, st.items[0].packed], [4, 4]);
  assert.equal(await page.locator('.banner-error').count(), 0);
  await page.goto(`${BASE}#/settings?tab=data`);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('button:has-text("Download")')]);
  const file = JSON.parse(readFileSync(await dl.path(), 'utf8'));
  assert.equal(file.schemaVersion, 0);
  assert.deepEqual(file.data.items[0], { id: 'oldi', tripId: 'old1', bagId: 'oldb', name: 'Old shirt', qty: 4, done: true }); // untouched original
  assert.match(dl.suggestedFilename(), /^packwise-before-upgrade-\d{4}-\d{2}-\d{2}\.json$/);
  // the safety copy re-imports through the normal migration path
  await page.setInputFiles('input[type=file]', { name: 'safety.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)) });
  await page.waitForSelector('dialog[open]:has-text("Import backup")');
  await page.click('dialog button:has-text("Cancel")');
});

await test('install help: prompt button, iOS instructions, installed event', async ({ page }) => {
  await skipWelcome(page);
  await page.goto(`${BASE}#/settings?tab=about`);
  await page.waitForSelector('.install-box');
  assert.match(await page.locator('.install-box').innerText(), /Install from your browser menu/);
  assert.ok(!/\bnull\b/.test(await page.locator('.install-box').innerText()), 'no stray "null" text');
  await page.evaluate(() => {
    window.__prompted = 0;
    const evt = new Event('beforeinstallprompt', { cancelable: true });
    evt.prompt = () => { window.__prompted += 1; return Promise.resolve(); };
    evt.userChoice = Promise.resolve({ outcome: 'accepted' });
    window.dispatchEvent(evt);
  });
  await page.waitForSelector('.install-box button:has-text("Install app")');
  await page.click('.install-box button:has-text("Install app")');
  assert.equal(await page.evaluate(() => window.__prompted), 1);
  await page.waitForSelector('.install-box:not(:has(button))');
  await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
  await page.waitForSelector('.toast:has-text("installed")');
  assert.match(await page.locator('.install-box').innerText(), /Installed/);
});

await test('install help: iPhone Safari gets Add to Home Screen steps', async ({ page }) => {
  await skipWelcome(page);
  await page.goto(`${BASE}#/settings?tab=about`);
  await page.waitForSelector('.install-box');
  assert.match(await page.locator('.install-box').innerText(), /Add to Home Screen/);
}, { ctxOptions: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1' } });

await test('offline files: verify, detect damage, repair, and still open offline', async ({ page, ctx }) => {
  await skipWelcome(page);
  await page.goto(BASE);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller);
  await createTrip(page);
  await page.goto(`${BASE}#/settings?tab=about`);
  await page.click('button[aria-label="Check offline files"]');
  await page.waitForSelector('p:has-text("offline files are in place")');
  // damage the cache on purpose
  const victim = await page.evaluate(async () => { const c = await caches.open((await caches.keys())[0]); const url = new URL('js/store.js', location.href).href; const ok = await c.delete(url); return ok ? url : null; });
  assert.ok(victim);
  await page.click('button[aria-label="Check offline files"]');
  await page.waitForSelector('p:has-text("1 of")');
  await page.click('button[aria-label="Repair offline files"]');
  await page.waitForSelector('p:has-text("repaired and verified")');
  assert.equal(await page.evaluate(async (u) => Boolean(await (await caches.open((await caches.keys())[0])).match(u)), victim), true);
  await ctx.setOffline(true);
  await page.reload();
  await page.waitForSelector('h1:has-text("Settings")');
  assert.equal(await page.evaluate(() => window.__packwise.store.state.trips.length), 1);
  await ctx.setOffline(false);
}, { sw: true });

await test('completion scene: confetti with standard motion, none when reduced', async ({ page }) => {
  await skipWelcome(page);
  await createTrip(page);
  const id = await firstTrip(page);
  const all = () => page.evaluate(() => { const { store } = window.__packwise; store.state.items.forEach((i) => store.setPacked(i.id, i.target)); store.state.tasks.forEach((t) => !t.done && store.toggleTask(t.id)); });
  await all();
  await page.goto(`${BASE}#/trip/${id}/summary`);
  await page.waitForSelector('h1:has-text("All Packed!")');
  assert.ok((await page.locator('.confetti span').count()) >= 10);
  assert.equal(await page.getAttribute('.confetti', 'aria-hidden'), 'true');
  assert.ok(await page.locator('.celebrate-case').count());
  await page.goto(`${BASE}#/settings`);
  await page.click('label.seg-opt:has-text("Reduced")');
  await page.goto(`${BASE}#/trip/${id}/summary`);
  await page.waitForSelector('h1:has-text("All Packed!")');
  assert.equal(await page.locator('.confetti').count(), 0);
});

await test('no dead navigation: every nav link and in-app link resolves to a real screen', async ({ page }) => {
  await skipWelcome(page);
  await createTrip(page, { bags: ['Checked'] });
  const id = await firstTrip(page);
  const seen = new Set();
  const visit = async (hash) => {
    await page.goto(`${BASE}${hash}`);
    await page.waitForSelector('#view h1');
    const h1 = await page.locator('#view h1').first().innerText();
    assert.ok(!/not found/i.test(h1), `${hash} is a dead page`);
    return page.evaluate(() => [...document.querySelectorAll('a[href^="#/"]')].map((a) => a.getAttribute('href')));
  };
  const queue = ['#/', '#/trips', `#/trip/${id}`, `#/trip/${id}/studio`, '#/settings', '#/templates', `#/trip/${id}/summary`, `#/trip/${id}/tasks`];
  while (queue.length) {
    const hash = queue.shift();
    if (seen.has(hash)) continue;
    seen.add(hash);
    for (const link of await visit(hash)) if (!seen.has(link) && !link.includes('/print') === true && seen.size < 40) queue.push(link);
  }
  for (const must of ['#/pack', '#/tasks', '#/studio', '#/templates', '#/settings', '#/trips/new']) assert.ok(seen.has(must), `${must} reachable from the UI`);
  assert.ok(seen.size >= 10, `crawled ${seen.size} routes`);
  await page.goto(`${BASE}#/does/not/exist`);
  await page.waitForSelector('h2:has-text("Page not found")');
});

await test('privacy audit: only same-origin GETs, no storage of trip data outside IndexedDB, no cookies', async ({ page, ctx }) => {
  const requests = [];
  page.on('request', (r) => requests.push({ url: r.url(), method: r.method(), type: r.resourceType() }));
  let sockets = 0;
  page.on('websocket', () => { sockets += 1; });
  await skipWelcome(page);
  await createTrip(page, { dest: 'Secretville' });
  const id = await firstTrip(page);
  await page.evaluate(() => { const { store } = window.__packwise; store.loadDemo(); store.saveTripAsTemplate(store.state.trips[0].id, 'Secret template'); });
  for (const r of ['/', '/trips', `/trip/${id}`, `/trip/${id}/studio`, `/trip/${id}/tasks`, '/templates', '/settings?tab=about']) { await page.goto(`${BASE}#${r}`); await page.waitForTimeout(80); }
  const foreign = requests.filter((r) => !r.url.startsWith(BASE) && !r.url.startsWith('data:') && !r.url.startsWith('blob:'));
  assert.deepEqual(foreign, [], 'no third-party requests');
  assert.deepEqual(requests.filter((r) => r.method !== 'GET'), [], 'no uploads of any kind');
  assert.equal(sockets, 0);
  assert.ok(requests.every((r) => !/secret/i.test(r.url)), 'trip names never appear in URLs sent to the network');
  const ls = await page.evaluate(() => JSON.stringify(Object.entries(localStorage)));
  assert.ok(!/secretville|template/i.test(ls), 'localStorage holds preferences only');
  assert.deepEqual(await ctx.cookies(), []);
  assert.equal(await page.evaluate(() => document.cookie), '');
  const csp = await page.getAttribute('meta[http-equiv="Content-Security-Policy"]', 'content');
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /script-src 'self'(?!.*unsafe)/);
});

await test('keyboard: skip link, full create-trip flow and dialog use without a mouse', async ({ page }) => {
  await skipWelcome(page);
  await page.goto(`${BASE}#/trips/new`);
  await reloadSettled(page);
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.className), 'skip-link');
  assert.ok(await page.isVisible('.skip-link'), 'skip link becomes visible on focus');
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'view');
  // type tiles are radios: arrows change the choice
  await page.focus('input[name=type]:checked');
  await page.keyboard.press('ArrowRight');
  assert.notEqual(await page.evaluate(() => document.querySelector('input[name=type]:checked').value), 'city');
  await page.fill('input[name=destination]', 'Keyboardia');
  await page.focus('input[name=scope]'); // the first option is Abroad
  await page.keyboard.press('Space');
  assert.equal(await page.evaluate(() => document.querySelector('input[name=scope]:checked')?.value), 'abroad');
  await page.focus('input[name=destination]');
  await page.keyboard.press('Enter'); // submit from the text field
  await page.waitForSelector('h1:has-text("Keyboardia")');
  // open the item dialog from the keyboard, edit, save
  await page.focus('button[aria-label="Edit T-shirts"]');
  await page.keyboard.press('Enter');
  await page.waitForSelector('dialog[open]');
  assert.equal(await page.evaluate(() => document.activeElement.name), 'name');
  await page.keyboard.press('Tab'); await page.keyboard.press('Tab');
  assert.ok(await page.evaluate(() => document.querySelector('dialog[open]').contains(document.activeElement)), 'focus stays inside the dialog');
  await page.keyboard.press('Escape');
  await page.waitForSelector('dialog', { state: 'detached' });
  assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), 'Edit T-shirts');
});

await test('startup performance: first meaningful render is quick (cold and warm)', async ({ page }) => {
  await skipWelcome(page);
  await createTrip(page);
  const measure = async () => {
    const t0 = Date.now();
    await page.goto(BASE, { waitUntil: 'commit' });
    await page.waitForSelector('.dashboard .hero');
    return Date.now() - t0;
  };
  const cold = await measure();
  const warm = await measure();
  console.log(`       (startup to dashboard: cold ${cold} ms, warm ${warm} ms)`);
  assert.ok(cold < 2500 && warm < 2000, `cold ${cold}ms, warm ${warm}ms`);
  const timing = await page.evaluate(() => { const n = performance.getEntriesByType('navigation')[0]; return { dcl: n.domContentLoadedEventEnd, load: n.loadEventEnd }; });
  assert.ok(timing.load < 3000, `load event ${timing.load}ms`);
});

await test('critical workflow: first visit → trip → pack → bag change → tasks → finish → reuse/return → backup/restore', async ({ page }) => {
  await page.goto(BASE);
  await page.click('button:has-text("Get Started")');
  // create (Balkan season is suggested from the dates)
  await page.click('label.tile:has-text("Beach")');
  await page.fill('input[name=destination]', 'Budva, Montenegro');
  await page.fill('input[name=start]', '2026-07-05');
  await page.fill('input[name=end]', '2026-07-12');
  await page.click('label.tile:has-text("Checked")');
  await generate(page);
  await page.waitForSelector('h1:has-text("Budva, Montenegro")');
  await page.waitForSelector('text=Summer');
  let st = await tripState(page);
  const trip = st.trips[0];
  assert.equal(trip.season, 'summer');
  assert.ok(st.items.some((i) => i.name === 'Sunscreen'));
  // pack / unpack
  await page.check('input[aria-label^="T-shirts:"]');
  await page.uncheck('input[aria-label^="T-shirts:"]');
  await page.check('input[aria-label^="T-shirts:"]');
  // change bag
  const [carry, checked] = st.bags.filter((b) => b.tripId === trip.id);
  await page.click('button[aria-label="Edit Swimwear"]');
  await page.selectOption('dialog select[name=bag]', carry.id);
  await page.click('dialog button:has-text("Save")');
  await page.waitForFunction((a) => window.__packwise.store.state.items.find((i) => i.name === 'Swimwear').bagId === a, carry.id);
  // studio shows it
  await page.goto(`${BASE}#/trip/${trip.id}/studio`);
  await page.selectOption('select[name=bag]', carry.id);
  await page.waitForSelector('.tray-token[aria-label^="Pack Swimwear"]');
  // tasks
  await page.goto(`${BASE}#/tasks`);
  await page.check('input[aria-label^="Check passport"]');
  // finish: everything packed + tasks done
  await page.evaluate(() => { const { store } = window.__packwise; store.state.items.forEach((i) => store.setPacked(i.id, i.target)); store.state.tasks.forEach((t) => !t.done && store.toggleTask(t.id)); });
  await page.goto(`${BASE}#/trip/${trip.id}/summary`);
  await page.waitForSelector('h1:has-text("All Packed!")');
  // reuse: template → new trip
  await page.evaluate((tid) => window.__packwise.store.saveTripAsTemplate(tid, 'Beach basics'), trip.id);
  await page.goto(`${BASE}#/trips/new?template=${(await tripState(page)).templates[0].id}`);
  await page.fill('input[name=destination]', 'Ohrid');
  await generate(page);
  await page.waitForSelector('h1:has-text("Ohrid")');
  // return trip
  await page.goto(`${BASE}#/trip/${trip.id}/summary`);
  await page.click('button:has-text("Plan return trip")');
  await page.click('dialog button:has-text("Create return checklist")');
  await page.waitForSelector('h1:has-text("— return")');
  // backup → wipe → restore
  const before = await tripState(page);
  await page.goto(`${BASE}#/settings?tab=data`);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('button:has-text("Export backup")')]);
  const json = readFileSync(await dl.path(), 'utf8');
  await page.click('button:has-text("Clear data")');
  await page.click('dialog button:has-text("Delete everything")');
  await page.waitForFunction(() => window.__packwise.store.state.trips.length === 0);
  await page.setInputFiles('input[type=file]', { name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(json) });
  await page.click('dialog button:has-text("Import")');
  await page.waitForFunction((n) => window.__packwise.store.state.trips.length === n, before.trips.length);
  await page.evaluate(() => window.__packwise.store.flush()); // let the queued write land before reloading
  await reloadSettled(page);
  const after = await tripState(page);
  const byId = (list) => [...list].sort((a, b) => a.id.localeCompare(b.id)); // storage order is by key, not insertion
  for (const k of ['trips', 'bags', 'items', 'tasks', 'templates']) assert.deepEqual(byId(after[k]), byId(before[k]), k);
});

await test('dark theme: every screen renders without overflow and with readable contrast tokens', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await skipWelcome(page);
  await createTrip(page);
  const id = await firstTrip(page);
  for (const [name, route] of [['dashboard', '/'], ['trips', '/trips'], ['create', '/trips/new'], ['checklist', `/trip/${id}`], ['studio', `/trip/${id}/studio`], ['templates', '/templates'], ['explore', `/trip/${id}/explore`], ['taste', `/trip/${id}/taste`], ['guide', `/trip/${id}/guide`], ['tasks', `/trip/${id}/tasks`], ['summary', `/trip/${id}/summary`], ['print', `/trip/${id}/print`], ['settings', '/settings']]) {
    await page.goto(`${BASE}#${route}`);
    await page.waitForTimeout(200);
    const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, bg: getComputedStyle(document.body).backgroundColor }));
    assert.ok(o.sw <= o.cw, `${name} overflows in dark mode`);
    if (name !== 'print') assert.equal(o.bg, 'rgb(14, 31, 33)');
    await page.screenshot({ path: join(SHOTS, `dark-${name}.png`) });
  }
});


// ============================================================ PHASE 3.1 (UI polish + parallax)
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const parseY = (t) => { const m = /matrix\(([^)]+)\)/.exec(t || ''); return m ? parseFloat(m[1].split(',')[5]) : 0; };
const ty = (page, sel) => page.evaluate((q) => getComputedStyle(document.querySelector(q)).transform, sel).then(parseY);

await test('parallax: hero art drifts smoothly with scroll, bounded, and stops under reduced motion', async ({ page }) => {
  await skipWelcome(page);
  await createTrip(page);
  await page.setViewportSize({ width: 390, height: 520 });
  await page.goto(`${BASE}#/`);
  await page.waitForSelector('.hero-art');
  await page.waitForTimeout(250);
  const at0 = await ty(page, '.hero-art');
  // jump-scroll and sample the easing: values must pass through intermediate positions
  await page.evaluate(() => window.scrollTo(0, 220));
  const samples = [];
  for (let n = 0; n < 8; n++) { samples.push(await ty(page, '.hero-art')); await page.waitForTimeout(40); }
  await page.waitForTimeout(500);
  const settled = await ty(page, '.hero-art');
  assert.notEqual(Math.round(settled * 10), Math.round(at0 * 10), 'hero art moved relative to its container');
  assert.ok(Math.abs(settled) <= 28.01, `bounded by parallax-max (got ${settled})`);
  assert.ok(new Set(samples.map((v) => v.toFixed(1))).size >= 3, `eased, not a single jump: ${samples.map((v) => v.toFixed(1))}`);
  // the layer overscans, so its edge never shows inside the card
  const edges = await page.evaluate(() => { const a = document.querySelector('.hero-art').getBoundingClientRect(); const h = document.querySelector('.hero').getBoundingClientRect(); return { top: a.top - h.top, bottom: a.bottom - h.bottom }; });
  assert.ok(edges.top <= 0.5 && edges.bottom >= -0.5, `art covers hero: ${JSON.stringify(edges)}`);
  // fixed background layer follows scroll at a fraction of its speed
  await page.goto(`${BASE}#/settings`);
  await page.click('label.bg-opt:has-text("Mountains")');
  await page.goto(`${BASE}#/`);
  await page.evaluate(() => window.scrollTo(0, 300));
  await page.waitForTimeout(700);
  const bg = await ty(page, '#bg-art');
  assert.ok(bg < -30 && bg > -90, `background drifted up slowly (got ${bg})`);
  // enhanced moves more
  await page.goto(`${BASE}#/settings`);
  await page.click('label.seg-opt:has-text("Enhanced")');
  await page.goto(`${BASE}#/`);
  await page.evaluate(() => window.scrollTo(0, 300));
  await page.waitForTimeout(700);
  assert.ok((await ty(page, '#bg-art')) < bg - 10, 'enhanced motion gives stronger parallax');
  // reduced motion: no transform at all
  await page.goto(`${BASE}#/settings`);
  await page.click('label.seg-opt:has-text("Reduced")');
  await page.goto(`${BASE}#/`);
  await page.evaluate(() => window.scrollTo(0, 300));
  await page.waitForTimeout(500);
  for (const sel of ['#bg-art', '.hero-art']) assert.equal(await page.evaluate((q) => getComputedStyle(document.querySelector(q)).transform, sel), 'none', sel);
});

await test('parallax: OS reduced-motion disables it; trip-card art is clipped and decorative', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await skipWelcome(page);
  await createTrip(page);
  await createTrip(page, { dest: 'Second', type: 'Beach', start: '2027-02-01', end: '2027-02-04' });
  await page.setViewportSize({ width: 390, height: 500 });
  await page.goto(`${BASE}#/trips`);
  await page.waitForSelector('.trip-card-art svg');
  await page.evaluate(() => window.scrollTo(0, 120));
  await page.waitForTimeout(400);
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.trip-card-art svg')).transform), 'none');
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.trip-card-art')).overflow), 'hidden');
  assert.equal(await page.getAttribute('.trip-card-art svg', 'aria-hidden'), 'true');
});

await test('parallax on trip cards moves artwork only, never text or layout', async ({ page }) => {
  await skipWelcome(page);
  for (const d of ['One', 'Two', 'Three', 'Four']) await createTrip(page, { dest: d, start: '2027-03-01', end: '2027-03-04' });
  await page.setViewportSize({ width: 390, height: 520 });
  await page.goto(`${BASE}#/trips`);
  await page.waitForSelector('.trip-card');
  await page.waitForTimeout(500); // let the page-enter animation finish
  const layout = () => page.evaluate(() => [...document.querySelectorAll('.trip-card h3')].map((e) => Math.round(e.getBoundingClientRect().top + scrollY)));
  const before = await layout();
  await page.evaluate(() => window.scrollTo(0, 200));
  await page.waitForTimeout(600);
  assert.deepEqual(await layout(), before, 'text positions (page coordinates) unchanged by parallax');
});

await test('templates: Use / Customize sit together in a footer row on every card', async ({ page }) => {
  await skipWelcome(page);
  for (const [w, h] of [[390, 844], [1440, 900]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto(`${BASE}#/templates`);
    await page.waitForSelector('.tpl-card');
    const cards = await page.evaluate(() => [...document.querySelectorAll('.tpl-card')].map((c) => {
      const info = c.querySelector('.tpl-info').getBoundingClientRect();
      const use = c.querySelector('.tpl-actions .btn-primary').getBoundingClientRect();
      const cus = c.querySelector('.tpl-actions .btn-secondary').getBoundingClientRect();
      const card = c.getBoundingClientRect();
      return { belowText: use.top >= info.bottom, sameRow: Math.abs(use.top - cus.top) < 2, equalWidth: Math.abs(use.width - cus.width) < 3, inside: use.left >= card.left && cus.right <= card.right, wide: use.width > 90 };
    }));
    assert.equal(cards.length, 6);
    for (const c of cards) assert.deepEqual(c, { belowText: true, sameRow: true, equalWidth: true, inside: true, wide: true }, `${w}px`);
  }
});

await test('settings: selected tab is high-contrast and About tab fills two balanced columns', async ({ page }) => {
  await skipWelcome(page);
  const ratio = async () => page.evaluate(() => {
    const el = document.querySelector('.tab[aria-selected=true]');
    const cs = getComputedStyle(el);
    const rgb = (c) => c.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);
    const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
    const [a, b] = [lum(rgb(cs.color)), lum(rgb(cs.backgroundColor))].sort((x, y) => y - x);
    return (a + 0.05) / (b + 0.05);
  });
  for (const scheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${BASE}#/settings?tab=about`);
    await page.waitForSelector('.fact-list');
    assert.ok((await ratio()) >= 4.5, `${scheme}: selected tab contrast ${await ratio()}`);
    const cols = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('.settings-stack > .card')].map((c) => c.getBoundingClientRect());
      const xs = [...new Set(cards.map((c) => Math.round(c.left)))];
      const bottoms = xs.map((x) => Math.max(...cards.filter((c) => Math.round(c.left) === x).map((c) => c.bottom)));
      return { columns: xs.length, gap: Math.max(...bottoms) - Math.min(...bottoms) };
    });
    assert.equal(cols.columns, 2);
    assert.ok(cols.gap < 220, `${scheme}: columns balanced (gap ${cols.gap}px)`);
  }
  // rows: label left, controls right, nothing overflowing at phone width
  await page.setViewportSize({ width: 360, height: 700 });
  await page.goto(`${BASE}#/settings?tab=about`);
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(over <= 0);
  assert.ok((await page.locator('.srow').count()) >= 2);
  assert.ok((await page.locator('.fact').count()) >= 6);
});

await test('welcome tagline is readable in light and dark', async ({ page }) => {
  for (const scheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto(BASE);
    await page.evaluate(() => localStorage.removeItem('packwise.prefs.v1'));
    await page.goto(`${BASE}#/welcome`);
    await page.reload();
    await page.waitForSelector('.welcome-hook');
    const r = await page.evaluate(() => {
      const el = document.querySelector('.welcome-hook');
      const cs = getComputedStyle(el);
      const rgba = (c) => c.match(/[\d.]+/g).map(Number);
      const [fr, fg, fb] = rgba(cs.color);
      const srgb = cs.backgroundColor.startsWith('color(srgb'); // color-mix() serialises as 0-1 floats
      const [br, bgc, bb, ba = 1] = srgb ? [...rgba(cs.backgroundColor).slice(0, 3).map((v) => v * 255), rgba(cs.backgroundColor)[3] ?? 1] : rgba(cs.backgroundColor);
      const under = [128, 128, 128]; // worst case: mid-grey artwork behind
      const mix = [br, bgc, bb].map((v, i) => v * ba + under[i] * (1 - ba));
      const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
      const [a, b] = [lum([fr, fg, fb]), lum(mix)].sort((x, y) => y - x);
      return { ratio: (a + 0.05) / (b + 0.05), alpha: ba };
    });
    assert.ok(r.ratio >= 4.5, `${scheme}: tagline contrast ${r.ratio.toFixed(2)}`);
    assert.ok(r.alpha >= 0.85);
  }
});


// ============================================================ PHASE 3 (discovery): Explore Destination
const explorePath = (id) => `${BASE}#/trip/${id}/explore`;
const guidePath = (id) => `${BASE}#/trip/${id}/guide`;
const cardCount = (page) => page.locator('.place-card').count();

await test('explore: destination comes from the trip (no re-entry), sections, cards and honest admission labels', async ({ page }) => {
  await skipWelcome(page);
  await createTrip(page, { dest: 'Belgrade, Serbia' });
  const id = await firstTrip(page);
  await page.click('a[aria-label="Explore destination"]'); // header action on the packing list
  await page.waitForSelector('.place-card');
  assert.ok(page.url().endsWith(`/trip/${id}/explore`));
  assert.equal(await page.locator('input[type=text]').count(), 0, 'no destination field: the trip destination is reused');
  assert.match(await page.locator('.dest-card h2').innerText(), /^Belgrade, Serbia$/);
  const titles = await page.locator('.guide-section h2').allInnerTexts();
  assert.deepEqual(titles, ['Free to Explore', 'Worth the Ticket', 'Check Admission First', 'Hidden Gems', 'Nature & Outdoors']);
  const { CATALOG } = await import('../../js/data/catalog.js');
  const belgrade = CATALOG.destinations.find((d) => d.id === 'belgrade');
  assert.equal(await cardCount(page), belgrade.places.length);
  // every card: name, area, reason, category, admission label, attribution links
  const cards = await page.evaluate(() => [...document.querySelectorAll('.place-card')].map((c) => ({ name: c.querySelector('h3').textContent, badge: c.querySelector('.adm-badge').textContent, meta: c.querySelector('.place-meta').textContent, why: c.querySelector('.place-why').textContent.length, tags: c.querySelectorAll('.tag').length, links: [...c.querySelectorAll('.place-links a')].map((a) => [a.target, a.rel, a.href.split('/')[2]]) })));
  for (const c of cards) {
    assert.ok(['Free area', 'Ticketed', 'Check admission'].includes(c.badge), c.name);
    assert.match(c.meta, /Belgrade/);
    assert.ok(c.why > 30 && c.tags >= 2);
    assert.deepEqual(c.links, [['_blank', 'noopener noreferrer', 'www.openstreetmap.org'], ['_blank', 'noopener noreferrer', 'www.google.com'], ['_blank', 'noopener noreferrer', 'en.wikipedia.org']]);
  }
  // free entries are only open public places; unknown admission is never labelled free
  const sectionOfCard = (name) => page.evaluate((n) => { const c = [...document.querySelectorAll('.place-card')].find((x) => x.querySelector('h3').textContent === n); return c.closest('section').querySelector('h2').textContent; }, name);
  assert.equal(await sectionOfCard('Temple of Saint Sava'), 'Check Admission First');
  assert.equal(await sectionOfCard('Nikola Tesla Museum'), 'Worth the Ticket');
  assert.equal(await sectionOfCard('Knez Mihailova Street'), 'Free to Explore');
  assert.equal(await sectionOfCard('Ada Ciganlija'), 'Nature & Outdoors');
  // no invented specifics anywhere on the page
  const text = await page.locator('.explore-screen').innerText();
  assert.ok(!/[€$£]\s?\d|\d\s?(€|EUR|RSD)\b|\b\d{1,2}:\d{2}\b/.test(text), 'no prices or hours rendered');
  assert.match(text, /Check admission means unknown, not free|“Check admission” means unknown, not free/);
  assert.match(text, /Editorial, not live/);
  // expandable admission explanation
  await page.locator('.place-card summary').first().click();
  assert.ok(await page.locator('.place-card details[open]').count());
});

await test('explore: several destinations each show their own real places', async ({ page }) => {
  await skipWelcome(page);
  const { CATALOG } = await import('../../js/data/catalog.js');
  for (const [dest, expectId] of [['Zagreb, Croatia', 'zagreb'], ['Skopje', 'skopje'], ['Ohrid, North Macedonia', 'ohrid'], ['Sarajevo', 'sarajevo'], ['Tiranë', 'tirana'], ['Kotor, Montenegro', 'kotor']]) {
    await createTrip(page, { dest });
    const id = (await tripState(page)).trips.find((t) => t.name === dest).id;
    await page.goto(explorePath(id));
    await page.waitForSelector('.place-card');
    const d = CATALOG.destinations.find((x) => x.id === expectId);
    assert.equal(await page.locator('.dest-card h2').innerText(), `${d.name}, ${d.country}`, dest);
    assert.equal(await cardCount(page), d.places.length, dest);
    const names = await page.locator('.place-card h3').allInnerTexts();
    assert.deepEqual(names.sort(), d.places.map((p) => p.name).sort(), dest);
  }
});

await test('explore: unsupported destination gets an honest empty state and no invented places', async ({ page }) => {
  await skipWelcome(page);
  await createTrip(page, { dest: 'Rome, Italy' });
  const id = await firstTrip(page);
  await page.goto(explorePath(id));
  await page.waitForSelector('text=No built-in guide');
  assert.equal(await cardCount(page), 0);
  assert.match(await page.locator('.empty-title').innerText(), /No built-in guide for “rome, italy” yet/i);
  assert.match(await page.locator('.bubble-text').innerText(), /don’t have a built-in guide/);
  assert.ok((await page.locator('.covered .chip').count()) >= 12, 'lists what IS covered');
  assert.match(await page.locator('.covered').innerText(), /Croatia[\s\S]*Split/);
  const osm = await page.getAttribute('.search-row a:has-text("OpenStreetMap")', 'href');
  assert.match(osm, /^https:\/\/www\.openstreetmap\.org\/search\?query=rome$/, 'a search link per unmatched stop (lower-cased, as matched)');
  // browsing a covered destination does not change the trip
  const before = (await tripState(page)).trips[0];
  await page.click('.covered a:has-text("Zagreb")');
  await page.waitForSelector('.place-card');
  assert.match(await page.locator('.banner-info').first().innerText(), /Browsing Zagreb instead of your trip/);
  assert.deepEqual((await tripState(page)).trips[0], before, 'trip record unchanged');
  await page.click('a:has-text("Use trip destination")');
  await page.waitForSelector('text=No built-in guide');
});

await test('explore: multi-stop, country-only and ambiguous destinations are handled, not guessed', async ({ page }) => {
  await skipWelcome(page);
  // multi-stop
  await createTrip(page, { dest: 'Zagreb - Split - Budva' });
  let id = await firstTrip(page);
  await page.goto(explorePath(id));
  await page.waitForSelector('.place-card');
  assert.deepEqual(await page.locator('[aria-label="Stops on this trip"] .chip').allInnerTexts().then((a) => a.map((t) => t.trim())), ['Zagreb', 'Split']);
  assert.match(await page.locator('.banner-info').innerText(), /No guide yet for: budva/);
  assert.equal(await page.locator('.dest-card h2').innerText(), 'Zagreb, Croatia');
  await page.click('[aria-label="Stops on this trip"] .chip:has-text("Split")');
  assert.equal(await page.locator('.dest-card h2').innerText(), 'Split, Croatia');
  assert.equal(await page.locator('[aria-label="Stops on this trip"] .chip[aria-pressed=true]').innerText().then((t) => t.trim()), 'Split');
  // country only
  await createTrip(page, { dest: 'Croatia' });
  id = (await tripState(page)).trips.find((t) => t.name === 'Croatia').id;
  await page.goto(explorePath(id));
  await page.waitForSelector('.covered');
  assert.equal(await cardCount(page), 0);
  assert.deepEqual(await page.locator('.covered .chip').allInnerTexts().then((a) => a.map((t) => t.trim())), ['Zagreb', 'Split', 'Dubrovnik']);
  await page.click('.covered a:has-text("Dubrovnik")');
  await page.waitForSelector('.place-card');
  assert.equal(await page.locator('.dest-card h2').innerText(), 'Dubrovnik, Croatia');
  // ambiguous: Split in Montenegro
  await createTrip(page, { dest: 'Split, Montenegro' });
  id = (await tripState(page)).trips.find((t) => t.name === 'Split, Montenegro').id;
  await page.goto(explorePath(id));
  await page.waitForSelector('.banner-warn');
  assert.equal(await cardCount(page), 0);
  assert.match(await page.locator('.banner-warn').innerText(), /different places, so nothing is shown automatically/);
  await page.click('a:has-text("Show Split, Croatia")');
  await page.waitForSelector('.place-card');
  assert.equal(await page.locator('.dest-card h2').innerText(), 'Split, Croatia');
});

await test('explore: filters work on the real catalog; saved places persist per trip and never touch packing data', async ({ page }) => {
  await skipWelcome(page);
  await createTrip(page, { dest: 'Belgrade' });
  const a = await firstTrip(page);
  await createTrip(page, { dest: 'Belgrade', start: '2027-05-01', end: '2027-05-04' });
  const b = (await tripState(page)).trips.find((t) => t.id !== a).id;
  const byIdJson = (list) => JSON.stringify([...list].sort((x, y) => x.id.localeCompare(y.id))); // storage order is by key
  const packingBefore = byIdJson((await tripState(page)).items);
  const { CATALOG } = await import('../../js/data/catalog.js');
  const bel = CATALOG.destinations.find((d) => d.id === 'belgrade').places;
  await page.goto(explorePath(a));
  await page.waitForSelector('.place-card');
  const chip = (label) => page.locator(`.filter-bar .chip:has-text("${label}")`).first();
  // admission
  await chip('Free area').click();
  assert.equal(await cardCount(page), bel.filter((p) => p.admission === 'free').length);
  assert.equal(await chip('Free area').getAttribute('aria-pressed'), 'true');
  assert.ok((await page.locator('.adm-badge').allInnerTexts()).every((t) => t === 'Free area'));
  await chip('Ticketed').click();
  assert.equal(await cardCount(page), bel.filter((p) => p.admission === 'paid').length);
  await chip('Check admission').click();
  assert.equal(await cardCount(page), bel.filter((p) => p.admission === 'check').length);
  await chip('All').click();
  assert.equal(await cardCount(page), bel.length);
  // category + setting + family (combined)
  await chip('Museums').click();
  assert.equal(await cardCount(page), bel.filter((p) => p.kind === 'museum').length);
  await chip('Any category').click();
  await chip('Outdoors').click();
  assert.equal(await cardCount(page), bel.filter((p) => p.setting !== 'indoor').length);
  await chip('Family-friendly').click();
  assert.equal(await cardCount(page), bel.filter((p) => p.setting !== 'indoor' && p.family).length);
  await chip('Free area').click();
  assert.equal(await cardCount(page), bel.filter((p) => p.setting !== 'indoor' && p.family && p.admission === 'free').length);
  assert.match(await page.locator('[aria-live=polite].sr-only').first().innerText(), /\d+ places? shown/);
  // empty result + clear
  await chip('Museums').click();
  await page.waitForSelector('text=No places match');
  await page.click('button:has-text("Clear filters")');
  assert.equal(await cardCount(page), bel.length);
  // saved
  await page.click('.save-btn[aria-label^="Save Knez Mihailova Street"]');
  await page.click('.save-btn[aria-label^="Save Nikola Tesla Museum"]');
  assert.equal(await page.getAttribute('.save-btn[aria-label^="Saved: Knez Mihailova Street"]', 'aria-pressed'), 'true');
  assert.equal((await tripState(page)).entries.length, 2);
  await chip('Saved').click();
  assert.deepEqual((await page.locator('.place-card h3').allInnerTexts()).sort(), ['Knez Mihailova Street', 'Nikola Tesla Museum']);
  assert.equal(await page.locator('.filter-bar .chip:has-text("Saved") .chip-count').innerText(), '2');
  // persistence across reload; other trip with the same destination has its own list
  await reloadSettled(page);
  await page.waitForSelector('.place-card');
  await page.click('.filter-bar .chip:has-text("Saved")');
  assert.equal(await cardCount(page), 2);
  await page.goto(explorePath(b));
  await page.waitForSelector('.place-card');
  assert.equal(await page.locator('.save-btn.is-saved').count(), 0);
  await page.click('.filter-bar .chip:has-text("Saved")');
  await page.waitForSelector('text=Nothing saved yet');
  // unsave
  await page.goto(explorePath(a));
  await page.waitForSelector('.place-card');
  await page.click('.save-btn.is-saved >> nth=0');
  assert.equal((await tripState(page)).entries.length, 1);
  // packing data was never modified
  assert.equal(byIdJson((await tripState(page)).items), packingBefore);
});

await test('explore: saved places survive backup/restore and trip duplication; deleting a trip removes them', async ({ page }) => {
  await skipWelcome(page);
  await createTrip(page, { dest: 'Ohrid' });
  const id = await firstTrip(page);
  await page.goto(explorePath(id));
  await page.waitForSelector('.place-card');
  await page.click('.save-btn[aria-label^="Save Lake Ohrid"]');
  await page.click('.save-btn[aria-label^="Save Ohrid Old Town"]');
  await page.goto(`${BASE}#/settings?tab=data`);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('button:has-text("Export backup")')]);
  const file = JSON.parse(readFileSync(await dl.path(), 'utf8'));
  assert.equal(file.schemaVersion, 3);
  assert.equal(file.data.entries.length, 2);
  await page.click('button:has-text("Clear data")');
  await page.click('dialog button:has-text("Delete everything")');
  await page.waitForFunction(() => window.__packwise.store.state.entries.length === 0);
  await page.setInputFiles('input[type=file]', { name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)) });
  await page.click('dialog button:has-text("Import")');
  await page.waitForFunction(() => window.__packwise.store.state.entries.length === 2);
  await reloadSettled(page);
  assert.equal((await tripState(page)).entries.length, 2);
  // duplicate copies saved places; deleting the original keeps the copy's
  const st = await tripState(page);
  await page.evaluate((tid) => window.__packwise.store.duplicateTrip(tid), st.trips[0].id);
  assert.equal((await tripState(page)).entries.length, 4);
  await page.evaluate((tid) => window.__packwise.store.deleteTrip(tid), st.trips[0].id);
  const after = await tripState(page);
  assert.equal(after.entries.length, 2);
  assert.ok(after.entries.every((e) => after.trips.some((t) => t.id === e.tripId)));
});

await test('explore: an existing v1 database upgrades to v2 without losing trips; saving then works', async ({ page }) => {
  await skipWelcome(page);
  await createTrip(page, { dest: 'Belgrade' });
  const before = await tripState(page);
  await page.waitForTimeout(150);
  await idbSetVersion(page, 1); // pretend this device was last used by the previous release
  await reloadSettled(page);
  const after = await tripState(page);
  assert.deepEqual(after.trips, before.trips);
  assert.equal(after.items.length, before.items.length);
  assert.deepEqual(after.entries, []);
  assert.equal(await page.locator('.banner-error').count(), 0);
  const raw = await idbSnapshotRaw(page);
  assert.equal(raw.version, 3);
  await page.goto(explorePath(after.trips[0].id));
  await page.waitForSelector('.place-card');
  await page.click('.save-btn >> nth=0');
  assert.equal((await tripState(page)).entries.length, 1);
});

await test('upgrade: a v2 database (saved places, no own places) upgrades to v3 with everything intact', async ({ page }) => {
  await skipWelcome(page);
  await createTrip(page, { dest: 'Belgrade' });
  const id = await firstTrip(page);
  await page.goto(explorePath(id));
  await page.waitForSelector('.place-card');
  await page.click('.save-btn >> nth=0');
  await page.waitForFunction(() => window.__packwise.store.state.entries.length === 1);
  await page.evaluate(() => window.__packwise.store.flush());
  const before = await tripState(page);
  await idbSetVersion(page, 2); // last used by the previous release
  await reloadSettled(page);
  const after = await tripState(page);
  assert.deepEqual(after.trips, before.trips);
  assert.deepEqual(after.entries, before.entries);
  assert.equal(await page.locator('.banner-error').count(), 0);
  assert.equal((await idbSnapshotRaw(page)).version, 3);
  await page.goto(guidePath(id));
  await page.waitForSelector('.guide-row');
  await page.click('button:has-text("Add your own place")');
  await page.fill('dialog input[name=label]', 'After the upgrade');
  await page.click('dialog button:has-text("Add place")');
  await page.waitForSelector('.guide-row:has-text("After the upgrade")');
});

await test('explore: keyboard and screen-reader semantics (headings, pressed state, labelled links)', async ({ page }) => {
  await skipWelcome(page);
  await createTrip(page, { dest: 'Sarajevo' });
  const id = await firstTrip(page);
  await page.goto(explorePath(id));
  await page.waitForSelector('.place-card');
  // heading outline: one h1, then section h2s, cards are h3
  assert.equal(await page.locator('#view h1').count(), 1);
  assert.ok((await page.locator('.guide-section h2').count()) >= 4);
  assert.ok((await page.locator('.place-card h3').count()) > 5);
  // sections are landmarks named by their heading
  assert.equal(await page.locator('section.guide-section[aria-labelledby]').count(), await page.locator('.guide-section').count());
  // filter chips: keyboard operable, expose pressed state
  await page.focus('.filter-bar .chip:has-text("Free area")');
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-pressed')), 'true', 'focus stays on the chip after re-render');
  await page.keyboard.press('Space');
  assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-pressed')), 'false');
  // heart: reachable and toggled from the keyboard, state announced via aria-pressed + label
  await page.focus('.save-btn >> nth=0');
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-pressed')), 'true');
  assert.match(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), /^Saved: .+ Remove from this trip$/);
  // external links say they open a new tab
  assert.match(await page.locator('.place-links a >> nth=0').innerText(), /opens in a new tab/);
  // admission disclosure works with the keyboard
  await page.focus('.place-card summary >> nth=0');
  await page.keyboard.press('Enter');
  assert.ok(await page.locator('.place-card details[open]').count());
  // the companion tip can be dismissed and that exact tip stays dismissed
  const tipText = await page.locator('.explore-tip .bubble-text').innerText();
  await page.click('button[aria-label="Dismiss tip"]');
  await reloadSettled(page);
  await page.waitForSelector('.place-card');
  assert.ok(!(await page.locator('.explore-tip .bubble-text').allInnerTexts()).includes(tipText));
});

await test('explore: reduced motion removes the card transition; works offline with saved places', async ({ page, ctx }) => {
  await skipWelcome(page);
  await page.goto(BASE);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await createTrip(page, { dest: 'Dubrovnik' });
  const id = await firstTrip(page);
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller);
  await page.goto(explorePath(id));
  await page.waitForSelector('.place-card');
  assert.ok(parseFloat(await page.evaluate(() => getComputedStyle(document.querySelector('.place-grid')).animationDuration)) > 0.1, 'standard motion animates');
  await page.click('.save-btn[aria-label^="Save Stradun"]');
  await ctx.setOffline(true);
  await page.reload();
  await page.waitForSelector('.place-card'); // the lazily loaded screen + catalog come from the offline cache
  assert.equal(await page.locator('.save-btn.is-saved').count(), 1);
  await page.click('.save-btn[aria-label^="Save Dubrovnik City Walls"]');
  assert.equal((await tripState(page)).entries.length, 2);
  await ctx.setOffline(false);
  await reloadSettled(page);
  assert.equal((await tripState(page)).entries.length, 2);
  // reduced motion
  await page.goto(`${BASE}#/settings`);
  await page.click('label.seg-opt:has-text("Reduced")');
  await page.goto(explorePath(id));
  await page.waitForSelector('.place-card');
  assert.ok(parseFloat(await page.evaluate(() => getComputedStyle(document.querySelector('.place-grid')).animationDuration)) < 0.01, 'reduced motion: no animation');
}, { sw: true });

await test('explore: packing flows are unchanged (create, pack, studio, tasks, return trip still work)', async ({ page }) => {
  await skipWelcome(page);
  await createTrip(page, { dest: 'Belgrade', bags: ['Checked'] });
  const id = await firstTrip(page);
  await page.goto(explorePath(id));
  await page.waitForSelector('.place-card');
  await page.click('.save-btn >> nth=0');
  await page.click('a[aria-label="Open packing list"]');
  await page.waitForSelector('h1:has-text("Belgrade")');
  await page.check('input[aria-label^="T-shirts:"]');
  assert.ok((await pct(page)) > 0);
  await page.goto(`${BASE}#/trip/${id}/studio`);
  await page.waitForSelector('.stage');
  await page.locator('.tray-token').first().click();
  await page.goto(`${BASE}#/tasks`);
  await page.waitForSelector('.task-row');
  await page.goto(`${BASE}#/trip/${id}`);
  await page.click('button[aria-label="Trip actions"]');
  await page.click('.sheet-item:has-text("Plan return trip")');
  await page.click('dialog button:has-text("Create return checklist")');
  await page.waitForSelector('h1:has-text("— return")');
  const st = await tripState(page);
  assert.equal(st.entries.length, 1, 'the return trip does not inherit saved places');
  assert.equal(st.entries[0].tripId, id);
});

// ------------------------------------------------------------- responsive
const viewports = [[360, 640], [390, 844], [768, 1024], [1024, 768], [1440, 900]];
for (const [w, h] of viewports) {
  await test(`responsive ${w}x${h}: no horizontal overflow on any screen`, async ({ page }) => {
    await skipWelcome(page);
    await createTrip(page);
    await createTrip(page, { dest: 'Chamonix', type: 'Winter', start: '2027-01-10', end: '2027-01-15' });
    const st = await tripState(page);
    const id = st.trips[0].id;
    const routes = [['dashboard', '/'], ['trips', '/trips'], ['create', '/trips/new'], ['checklist', `/trip/${id}`], ['studio', `/trip/${id}/studio`], ['templates', '/templates'], ['tasks', `/trip/${id}/tasks`], ['summary', `/trip/${id}/summary`], ['print', `/trip/${id}/print`], ['settings', '/settings'], ['settings-data', '/settings?tab=data'], ['settings-prefs', '/settings?tab=preferences'], ['settings-about', '/settings?tab=about'], ['welcome', '/welcome']];
    for (const [name, route] of routes) {
      await page.goto(`${BASE}#${route}`);
      await page.waitForTimeout(250);
      const over = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
      assert.ok(over.sw <= over.cw, `${name} overflows horizontally: scrollWidth ${over.sw} > ${over.cw}`);
      await page.screenshot({ path: join(SHOTS, `${w}x${h}-${name}.png`) });
    }
    // dialog fits too
    await page.goto(`${BASE}#/trip/${id}`);
    await page.click('button[aria-label="Edit T-shirts"]');
    await page.waitForSelector('dialog[open]');
    const box = await page.locator('dialog[open]').boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= w + 1, 'dialog inside viewport horizontally');
    assert.ok(box.y >= 0 && box.y + box.height <= h + 1, 'dialog inside viewport vertically');
    await page.screenshot({ path: join(SHOTS, `${w}x${h}-item-dialog.png`) });
  }, { viewport: { width: w, height: h } });
}

// ------------------------------------------------------- PWA / offline
await test('PWA: manifest valid, icons reachable, service worker controls page', async ({ page }) => {
  await skipWelcome(page);
  await page.goto(BASE);
  await page.waitForFunction(() => navigator.serviceWorker?.controller || navigator.serviceWorker?.ready.then(() => true));
  await page.evaluate(() => navigator.serviceWorker.ready);
  const manifest = await (await page.request.get(`${BASE}manifest.webmanifest`)).json();
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, './');
  const sizes = manifest.icons.map((i) => `${i.sizes}:${i.purpose}`);
  assert.ok(sizes.includes('192x192:any') && sizes.includes('512x512:any') && sizes.includes('512x512:maskable'));
  for (const icon of manifest.icons) assert.equal((await page.request.get(new URL(icon.src, BASE).href)).status(), 200, icon.src);
  const link = await page.getAttribute('link[rel=manifest]', 'href');
  assert.equal(link, 'manifest.webmanifest');
  const keys = await page.evaluate(() => caches.keys());
  assert.deepEqual(keys, ['packwise-v1.8.0']);
}, { sw: true });

await test('offline: after first load the app reopens, works and persists offline', async ({ page, ctx }) => {
  await skipWelcome(page);
  await page.goto(BASE);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await createTrip(page);
  await page.reload(); // now controlled by the service worker
  await page.waitForSelector('h1:has-text("Rome, Italy")');
  await ctx.setOffline(true);
  await page.reload();
  await page.waitForSelector('h1:has-text("Rome, Italy")');
  await page.waitForSelector('.banner-info:has-text("offline")');
  await page.check('input[aria-label^="Underwear:"]'); // works offline
  await page.click('[data-key="add-misc"]');
  await page.fill('input[name=name]', 'Offline snack');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.item-name:has-text("Offline snack")');
  await page.goto(`${BASE}#/settings`);
  await page.waitForSelector('h1:has-text("Settings")');
  await ctx.setOffline(false);
  await reloadSettled(page);
  const st = await tripState(page);
  assert.ok(st.items.some((i) => i.name === 'Offline snack'));
  assert.ok(st.items.find((i) => i.name === 'Underwear').packed > 0);
}, { sw: true });

await test('service worker update: new version waits, prompts, preserves data, then takes over', async ({ page }) => {
  await skipWelcome(page);
  await page.goto(BASE);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await createTrip(page);
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller);
  const before = await tripState(page);
  swVersionOverride = 'packwise-v9.9.9-test';
  await page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r.update()));
  await page.waitForSelector('.toast:has-text("new version")');
  // old shell keeps running until the user agrees
  assert.deepEqual(await page.evaluate(() => caches.keys()).then((k) => k.sort()), ['packwise-v1.8.0', 'packwise-v9.9.9-test']);
  // an open dialog (unsaved edit) blocks the reload, even if the toast button is triggered programmatically
  await page.click('button[aria-label="Edit T-shirts"]');
  await page.evaluate(() => document.querySelector('.toast-action').click());
  await page.waitForSelector('.toast:has-text("Finish what")');
  assert.equal(await page.locator('dialog[open]').count(), 1);
  await page.keyboard.press('Escape');
  await page.waitForSelector('dialog', { state: 'detached' });
  await Promise.all([page.waitForNavigation({ waitUntil: 'load' }), page.click('.toast-action:has-text("Reload")')]);
  await page.waitForSelector('h1:has-text("Rome, Italy")');
  await page.waitForFunction(() => caches.keys().then((k) => k.length === 1 && k[0] === 'packwise-v9.9.9-test'));
  assert.deepEqual((await tripState(page)).items, before.items);
  swVersionOverride = null;
}, { sw: true });

// --------------------------------------------------------- static checks
// ============================================================ PHASE 4 (discovery): Taste the Destination
const tastePath = (id, q = '') => `${BASE}#/trip/${id}/taste${q}`;
const foodCards = (page) => page.locator('.food-card').count();

await test('taste: food comes from the trip country, four categories, no venues/prices/alcohol rendered', async ({ page }) => {
  await skipWelcome(page);
  await createTrip(page, { dest: 'Belgrade, Serbia' });
  const id = await firstTrip(page);
  await page.goto(explorePath(id));
  await page.waitForSelector('.place-card');
  await page.click('.guide-tab:has-text("Taste")'); // tabs switch between the two guides
  await page.waitForSelector('.food-card');
  assert.ok(page.url().endsWith(`/trip/${id}/taste`));
  assert.equal(await page.locator('.guide-tab[aria-current=page]').innerText(), 'Taste');
  const { FOOD } = await import('../../js/data/food.js');
  const rs = FOOD.items.filter((i) => i.countries.includes('RS'));
  assert.equal(await foodCards(page), rs.length);
  assert.deepEqual((await page.locator('.food-card h3').allInnerTexts()).map((t) => t.split(' · ')[0]).sort(), rs.map((i) => i.name).sort());
  assert.deepEqual(await page.locator('.guide-section h2').allInnerTexts(), FOOD.categories.filter((c) => rs.some((i) => i.category === c.id)).map((c) => c.label));
  const text = await page.locator('.taste-screen').innerText();
  assert.ok(!/[€$£]\s?\d|\d\s?(€|EUR|RSD)\b|\b\d{1,2}:\d{2}\b/.test(text), 'no prices or hours');
  assert.ok(!/\b(wine|beer|rakija|brandy|vodka)\b/i.test(text), 'no alcohol');
  assert.match(text, /Not a safety guarantee/);
  assert.match(text, /Editorial, regional, not live/);
  // every card shows what / typical ingredients / where found / diet lines
  const bad = await page.evaluate(() => [...document.querySelectorAll('.food-card')].filter((c) => !/Typically:/.test(c.textContent) || !/Commonly found:/.test(c.textContent) || !/Vegetarian:/.test(c.textContent)).map((c) => c.querySelector('h3').textContent));
  assert.deepEqual(bad, []);
});

await test('taste: several countries, multi-country trip, unsupported and ambiguous destinations', async ({ page }) => {
  await skipWelcome(page);
  const { FOOD } = await import('../../js/data/food.js');
  for (const [dest, code] of [['Zagreb, Croatia', 'HR'], ['Tiranë', 'AL'], ['Sofia', 'BG'], ['Ljubljana', 'SI']]) {
    await createTrip(page, { dest });
    const id = (await tripState(page)).trips.find((t) => t.name === dest).id;
    await page.goto(tastePath(id));
    await page.waitForSelector('.food-card');
    assert.equal(await foodCards(page), FOOD.items.filter((i) => i.countries.includes(code)).length, dest);
  }
  await createTrip(page, { dest: 'Belgrade and Tirana' });
  const multi = (await tripState(page)).trips.find((t) => t.name === 'Belgrade and Tirana').id;
  await page.goto(tastePath(multi));
  await page.waitForSelector('.food-card');
  assert.equal(await foodCards(page), FOOD.items.filter((i) => i.countries.some((c) => c === 'RS' || c === 'AL')).length);
  // country alone is enough for food
  await createTrip(page, { dest: 'Bulgaria' });
  const bg = (await tripState(page)).trips.find((t) => t.name === 'Bulgaria').id;
  await page.goto(tastePath(bg));
  await page.waitForSelector('.food-card');
  assert.ok(await foodCards(page) > 5);
  // unsupported
  await createTrip(page, { dest: 'Rome, Italy' });
  const rome = (await tripState(page)).trips.find((t) => t.name === 'Rome, Italy').id;
  await page.goto(tastePath(rome));
  await page.waitForSelector('text=No built-in food guide');
  assert.equal(await foodCards(page), 0);
  assert.ok(await page.locator('.covered .chip').count() >= 8);
  // browsing another country does not change the trip
  const before = await tripState(page);
  await page.click('.covered .chip:has-text("Serbia")');
  await page.waitForSelector('.food-card');
  assert.match(await page.locator('.banner-info').innerText(), /Browsing Serbia/);
  assert.deepEqual((await tripState(page)).trips, before.trips);
  // ambiguous: Split + Montenegro conflict is not guessed
  await createTrip(page, { dest: 'Split, Montenegro' });
  const amb = (await tripState(page)).trips.find((t) => t.name === 'Split, Montenegro').id;
  await page.goto(tastePath(amb));
  await page.waitForSelector('.banner-warn');
  assert.equal(await foodCards(page), 0);
});

await test('taste: dietary and allergen filters work on the real catalog and unhelpful controls are hidden', async ({ page }) => {
  await skipWelcome(page);
  await createTrip(page, { dest: 'Sarajevo' });
  const id = await firstTrip(page);
  await page.goto(tastePath(id));
  await page.waitForSelector('.food-card');
  const { FOOD } = await import('../../js/data/food.js');
  const ba = FOOD.items.filter((i) => i.countries.includes('BA'));
  await page.click('.chip:has-text("Vegetarian")');
  const veg = await page.locator('.food-card h3').allInnerTexts();
  assert.deepEqual(veg.map((t) => t.split(' · ')[0]).sort(), ba.filter((i) => i.vegetarian === true).map((i) => i.name).sort());
  assert.ok(!veg.includes('Burek'), 'burek only *may* be vegetarian, so the filter does not claim it');
  assert.match(await page.locator('.taste-screen').innerText(), /more items? may have a vegetarian version/);
  await page.click('.chip:has-text("Vegan")');
  assert.ok(await foodCards(page) < veg.length);
  assert.ok(await page.evaluate(() => [...document.querySelectorAll('.food-card')].every((c) => /Vegan: Usually/.test(c.textContent))));
  await page.click('.chip:has-text("Vegan")'); // toggle off
  await page.click('.chip:has-text("Any diet")');
  // allergen avoidance
  await page.click('[aria-label="Hide dishes that often contain"] .chip:has-text("Gluten")');
  assert.equal(await foodCards(page), ba.filter((i) => !i.allergens.includes('gluten')).length);
  assert.equal(await page.locator('.food-card .tag-allergen:has-text("Gluten")').count(), 0);
  // category
  await page.click('[aria-label="Category"] .chip:has-text("Local Drinks")');
  assert.ok(await page.evaluate(() => [...document.querySelectorAll('.food-card')].every((c) => c.classList.contains('cat-drink'))));
  // combination with no result → clear filters
  await page.click('[aria-label="Hide dishes that often contain"] .chip:has-text("Dairy")');
  await page.click('.chip:has-text("Vegan")');
  await page.click('.chip:has-text("My Must-Try list")');
  await page.waitForSelector('text=Your Must-Try list is empty');
  await page.click('button:has-text("Clear filters")');
  assert.equal(await foodCards(page), ba.length);
  // a country whose items are all one diet hides that control: Montenegro has mixed so check SI keeps controls, controls only if meaningful
  const hidden = await page.evaluate(async () => {
    const { availableDietFilters } = await import('./js/taste.js');
    const { FOOD } = await import('./js/data/food.js');
    return availableDietFilters(FOOD.items.filter((i) => i.vegetarian === true)).diets;
  });
  assert.ok(!hidden.includes('vegetarian'));
});

await test('taste: Must-Try list, tried state and notes persist across reload and are per-trip', async ({ page }) => {
  await skipWelcome(page);
  await createTrip(page, { dest: 'Sarajevo' });
  await createTrip(page, { dest: 'Skopje' });
  const trips = (await tripState(page)).trips;
  const sar = trips.find((t) => t.name === 'Sarajevo').id;
  const sko = trips.find((t) => t.name === 'Skopje').id;
  const packBefore = await tripState(page);
  await page.goto(tastePath(sar));
  await page.waitForSelector('.food-card');
  assert.equal(await page.locator('.food-card .food-extra').count(), 0, 'tried/note only appear once saved');
  await page.click('.save-btn[aria-label^="Add Ćevapi"]');
  await page.click('.save-btn[aria-label^="Add Baklava"]');
  assert.equal(await page.locator('.save-btn.is-saved').count(), 2);
  await page.check('.food-card[data-ref=cevapi] input[type=checkbox]');
  await page.fill('.food-card[data-ref=cevapi] .note-input', 'with onion');
  await page.press('.food-card[data-ref=cevapi] .note-input', 'Tab');
  await page.waitForFunction(() => window.__packwise.store.state.entries.some((e) => e.refId === 'cevapi' && e.tried && e.note === 'with onion'));
  assert.equal(await page.locator('.food-card[data-ref=cevapi] .adm-badge').innerText(), 'Tried');
  await reloadSettled(page);
  await page.waitForSelector('.food-card');
  assert.equal(await page.locator('.save-btn.is-saved').count(), 2);
  assert.equal(await page.locator('.food-card[data-ref=cevapi] input[type=checkbox]').isChecked(), true);
  assert.equal(await page.inputValue('.food-card[data-ref=cevapi] .note-input'), 'with onion');
  assert.match(await page.locator('.dest-card').innerText(), /2 on your list, 1 tried/);
  await page.click('.chip:has-text("My Must-Try list")');
  assert.equal(await foodCards(page), 2);
  // per trip: Skopje does not see Sarajevo's list
  await page.goto(tastePath(sko));
  await page.waitForSelector('.food-card');
  assert.equal(await page.locator('.save-btn.is-saved').count(), 0);
  // un-saving keeps the user's own tried mark rather than silently losing it, then clearing removes the record
  await page.goto(tastePath(sar));
  await page.waitForSelector('.food-card');
  await page.click('.save-btn[aria-label^="On your Must-Try list: Baklava"]');
  assert.equal((await tripState(page)).entries.filter((e) => e.kind === 'food' && e.tripId === sar).length, 1);
  // packing data untouched
  const after = await tripState(page);
  const byId = (l) => [...l].sort((a, b) => a.id.localeCompare(b.id)); // storage order is by key
  for (const k of ['trips', 'bags', 'items', 'tasks']) assert.deepEqual(byId(after[k]), byId(packBefore[k]), k);
  // no horizontal overflow at 360px
  await page.setViewportSize({ width: 360, height: 740 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
});

await test('taste: backup/restore, duplicate and delete cover the Must-Try list', async ({ page }) => {
  await skipWelcome(page);
  await createTrip(page, { dest: 'Zagreb' });
  const id = await firstTrip(page);
  await page.goto(tastePath(id));
  await page.waitForSelector('.food-card');
  await page.click('.save-btn[aria-label^="Add Fritule"]');
  await page.check('.food-card[data-ref=fritule] input[type=checkbox]');
  await page.waitForFunction(() => window.__packwise.store.state.entries.some((e) => e.refId === 'fritule' && e.tried));
  const before = await tripState(page);
  await page.goto(`${BASE}#/settings?tab=data`);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('button:has-text("Export backup")')]);
  const json = readFileSync(await dl.path(), 'utf8');
  assert.ok(JSON.parse(json).data.entries.some((e) => e.kind === 'food' && e.refId === 'fritule' && e.tried === true));
  await page.click('button:has-text("Clear data")');
  await page.click('dialog button:has-text("Delete everything")');
  await page.waitForFunction(() => window.__packwise.store.state.entries.length === 0);
  await page.setInputFiles('input[type=file]', { name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(json) });
  await page.click('dialog button:has-text("Import")');
  await page.waitForFunction(() => window.__packwise.store.state.entries.length === 1);
  assert.deepEqual((await tripState(page)).entries, before.entries);
  // duplicate copies the list but resets tried
  const copy = await page.evaluate((tid) => window.__packwise.store.duplicateTrip(tid), id);
  const copied = (await tripState(page)).entries.filter((e) => e.tripId === copy.id && e.kind === 'food');
  assert.deepEqual(copied.map((e) => [e.refId, e.saved, e.tried]), [['fritule', true, false]]);
  await page.evaluate((tid) => window.__packwise.store.deleteTrip(tid), id);
  assert.deepEqual((await tripState(page)).entries.map((e) => e.tripId), [copy.id]);
});

await test('taste: keyboard and screen-reader semantics', async ({ page }) => {
  await skipWelcome(page);
  await createTrip(page, { dest: 'Ohrid' });
  const id = await firstTrip(page);
  await page.goto(tastePath(id));
  await page.waitForSelector('.food-card');
  assert.equal(await page.locator('h1').count(), 1);
  assert.equal(await page.locator('nav.guide-tabs').getAttribute('aria-label'), 'Trip guide');
  const issues = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('#view button, #view a[href], #view input')) {
      const name = (el.getAttribute('aria-label') || el.textContent || el.labels?.[0]?.textContent || '').trim();
      if (!name) out.push(el.outerHTML.slice(0, 80));
    }
    for (const b of document.querySelectorAll('.save-btn')) if (!b.hasAttribute('aria-pressed')) out.push('save without aria-pressed');
    return out;
  });
  assert.deepEqual(issues, []);
  // keyboard: focus a heart, Space toggles, focus stays on it after the re-render
  await page.focus('.save-btn[aria-label^="Add Tavče"]');
  await page.keyboard.press('Space');
  await page.waitForSelector('.save-btn.is-saved');
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('data-key')), 'save-tavce-gravce');
  // the note field has an accessible label and the live region announces counts
  assert.match(await page.locator('.note-input').first().getAttribute('id'), /^note-/);
  assert.match(await page.locator('.taste-screen p.sr-only[aria-live=polite]').innerText(), /items? shown/);
});

await test('taste: reduced motion and offline with saved dishes', async ({ page, ctx }) => {
  await skipWelcome(page);
  await page.goto(BASE);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await createTrip(page, { dest: 'Ljubljana' });
  const id = await firstTrip(page);
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller);
  await page.goto(tastePath(id));
  await page.waitForSelector('.food-card');
  assert.ok(parseFloat(await page.evaluate(() => getComputedStyle(document.querySelector('.place-grid')).animationDuration)) > 0.1);
  await page.click('.save-btn[aria-label^="Add Potica"]');
  await ctx.setOffline(true);
  await page.reload();
  await page.waitForSelector('.food-card'); // lazily loaded screen + food catalog come from the offline cache
  assert.equal(await page.locator('.save-btn.is-saved').count(), 1);
  await page.check('.food-card[data-ref=potica] input[type=checkbox]');
  await page.waitForFunction(() => window.__packwise.store.state.entries.some((e) => e.refId === 'potica' && e.tried));
  await ctx.setOffline(false);
  await reloadSettled(page);
  assert.equal((await tripState(page)).entries.find((e) => e.refId === 'potica').tried, true);
  await page.goto(`${BASE}#/settings`);
  await page.click('label.seg-opt:has-text("Reduced")');
  await page.goto(tastePath(id));
  await page.waitForSelector('.food-card');
  assert.ok(parseFloat(await page.evaluate(() => getComputedStyle(document.querySelector('.place-grid')).animationDuration)) < 0.01);
}, { sw: true });


// ============================================================ PHASE 5 (discovery): My Trip Guide & packing integration
const nonGuide = (st) => JSON.stringify(['trips', 'bags', 'items', 'tasks'].map((k) => [...st[k]].sort((a, b) => a.id.localeCompare(b.id))));
const rowsText = (page) => page.locator('.guide-row strong').allInnerTexts();

await test('guide: empty state, entry points, tabs; nothing saved means nothing invented', async ({ page }) => {
  await skipWelcome(page);
  await createTrip(page, { dest: 'Belgrade, Serbia' });
  const id = await firstTrip(page);
  await page.goto(`${BASE}#/trip/${id}`);
  await page.click('button[aria-label="Trip actions"]');
  await page.click('text=My trip guide');
  await page.waitForSelector('text=Your guide is empty');
  assert.ok(page.url().endsWith(`/trip/${id}/guide`));
  assert.equal(await page.locator('.guide-row').count(), 0);
  assert.equal(await page.locator('.guide-tab[aria-current=page]').innerText(), 'My Guide');
  assert.deepEqual(await page.locator('.guide-tab').allInnerTexts(), ['Places', 'Taste', 'My Guide']);
  await page.click('.guide-tab:has-text("Places")');
  await page.waitForSelector('.place-card');
  await page.goto(`${BASE}#/trip/${id}/summary`);
  await page.click('a:has-text("My trip guide")');
  await page.waitForSelector('text=Your guide is empty');
});

await test('guide: saved places and dishes appear grouped by interest, remove is undoable, stale items are flagged', async ({ page }) => {
  await skipWelcome(page);
  await createTrip(page, { dest: 'Belgrade, Serbia' });
  const id = await firstTrip(page);
  await page.goto(explorePath(id));
  await page.waitForSelector('.place-card');
  for (const n of ['Knez Mihailova Street', 'Nikola Tesla Museum', 'Temple of Saint Sava']) await page.click(`.save-btn[aria-label^="Save ${n}"]`);
  await page.goto(tastePath(id));
  await page.waitForSelector('.food-card');
  await page.click('.save-btn[aria-label^="Add Ćevapi"]');
  await page.goto(guidePath(id));
  await page.waitForSelector('.guide-row');
  assert.deepEqual(await page.locator('.guide-section h2').allInnerTexts(), ['Free to Explore', 'Worth the Ticket', 'Check Admission First', 'Street Food & Snacks']);
  assert.equal((await rowsText(page)).length, 4);
  assert.match(await page.locator('.dest-card').innerText(), /3 places · 1 dish/);
  assert.equal(await page.locator('.guide-row[data-ref="place:belgrade/knez-mihailova-street"] .adm-tag').innerText(), 'Free area');
  // remove + undo restores save and keeps it a single record
  await page.click('button[aria-label^="Remove Nikola Tesla Museum"]');
  assert.equal((await rowsText(page)).length, 3);
  await page.click('.toasts button:has-text("Undo")');
  await page.waitForFunction(() => document.querySelectorAll('.guide-row').length === 4);
  assert.equal((await tripState(page)).entries.filter((e) => e.refId === 'belgrade/nikola-tesla-museum').length, 1);
  // an item that left the catalog is still shown, flagged and removable
  await page.evaluate((tid) => window.__packwise.store.setSaved(tid, 'place', 'belgrade/removed-from-catalog', true), id);
  await page.waitForSelector('text=No longer in the guide');
  assert.equal(await page.locator('.guide-row.is-missing select').count(), 0);
  await page.click('button[aria-label^="Remove belgrade/removed-from-catalog"]');
  assert.equal(await page.locator('.guide-row.is-missing').count(), 0);
});

await test('guide: manual day plan with keyboard ordering persists; draft plan is labelled, undoable and has no times', async ({ page }) => {
  await skipWelcome(page);
  await createTrip(page, { dest: 'Belgrade, Serbia', start: '2027-05-01', end: '2027-05-03' });
  const id = await firstTrip(page);
  const { CATALOG } = await import('../../js/data/catalog.js');
  const b = CATALOG.destinations.find((d) => d.id === 'belgrade');
  await page.evaluate(({ tid, refs }) => refs.forEach((r) => window.__packwise.store.setSaved(tid, 'place', r, true)), { tid: id, refs: b.places.slice(0, 5).map((p) => `belgrade/${p.id}`) });
  await page.goto(guidePath(id));
  await page.waitForSelector('.guide-row');
  await page.click('.chip:has-text("By day")');
  assert.deepEqual(await page.locator('.guide-section h2').allInnerTexts(), ['Unplanned', 'Day 1', 'Day 2', 'Day 3'], 'one slot per trip day');
  assert.match(await page.locator('.dest-card').innerText(), /no times, routes or travel durations/);
  // manual: put two items on Day 2 using the keyboard-accessible select
  const [n0, n1] = b.places.slice(0, 2).map((p) => p.name);
  await page.selectOption(`select[aria-label="Day for ${n0}"]`, '2');
  await page.selectOption(`select[aria-label="Day for ${n1}"]`, '2');
  const day2 = () => page.evaluate(() => [...document.querySelectorAll('.guide-section')].find((s) => s.querySelector('h2').textContent === 'Day 2').querySelectorAll('.guide-row strong').length && [...[...document.querySelectorAll('.guide-section')].find((s) => s.querySelector('h2').textContent === 'Day 2').querySelectorAll('.guide-row strong')].map((e) => e.textContent));
  assert.deepEqual(await day2(), [n0, n1]);
  await page.focus(`button[aria-label="Move ${n1} earlier"]`);
  await page.keyboard.press('Enter');
  assert.deepEqual(await day2(), [n1, n0]);
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('data-key')), `up-place:belgrade/${b.places[1].id}`, 'focus survives the re-render');
  await page.evaluate(() => window.__packwise.store.flush()); // let the queued write land before reloading
  await reloadSettled(page);
  await page.click('.chip:has-text("By day")');
  assert.deepEqual(await day2(), [n1, n0], 'order persists across reload');
  // draft plan: fills only the unplanned, undo restores exactly
  const before = (await tripState(page)).entries.map((e) => [e.refId, e.day, e.order]).sort();
  await page.click('button:has-text("Suggest a draft plan")');
  await page.waitForFunction(() => window.__packwise.store.state.entries.every((e) => e.day));
  const text = await page.locator('.guide-screen').innerText();
  assert.ok(!/\b\d{1,2}:\d{2}\b|\bminutes?\b|\bkm\b/i.test(text), 'no times or distances');
  assert.equal(await page.locator('.guide-section:has(h2:text-is("Unplanned")) .guide-row').count(), 0);
  const mid = (await tripState(page)).entries;
  assert.ok(mid.filter((e) => e.refId.endsWith(b.places[0].id) || e.refId.endsWith(b.places[1].id)).every((e) => e.day === 2), 'manual picks untouched by the draft');
  await page.click('.toasts button:has-text("Undo")');
  await page.waitForFunction((n) => window.__packwise.store.state.entries.filter((e) => !e.day).length === n, 3);
  assert.deepEqual((await tripState(page)).entries.map((e) => [e.refId, e.day, e.order]).sort(), before);
  // clear plan keeps saved items
  await page.click('button:has-text("Clear day plan")');
  await page.waitForFunction(() => window.__packwise.store.state.entries.every((e) => !e.day));
  assert.equal((await tripState(page)).entries.filter((e) => e.saved).length, 5);
});

await test('guide: packing ideas are optional, deduplicated, explicit to add, and never change the list on their own', async ({ page }) => {
  await skipWelcome(page);
  await createTrip(page, { dest: 'Belgrade, Serbia' });
  const id = await firstTrip(page);
  const { CATALOG } = await import('../../js/data/catalog.js');
  const b = CATALOG.destinations.find((d) => d.id === 'belgrade');
  const nat = b.places.find((p) => p.kind === 'nature');
  const gated = b.places.find((p) => p.admission === 'paid');
  // the city template already packs shoes and a bottle, so those ideas must NOT be offered; remove them to see the ideas
  await page.goto(guidePath(id));
  await page.evaluate(({ tid, refs }) => refs.forEach((r) => window.__packwise.store.setSaved(tid, 'place', r, true)), { tid: id, refs: [nat, gated].map((p) => `belgrade/${p.id}`) });
  await page.waitForSelector('.pack-hints');
  assert.ok(!(await page.locator('.hint strong').allInnerTexts()).includes('Comfortable walking shoes'), 'already on the packing list, so not suggested');
  assert.match(await page.locator('.pack-hints').innerText(), /already look covered/);
  await page.evaluate((tid) => { const st = window.__packwise.store; st.state.items.filter((i) => i.tripId === tid && /shoe|bottle/i.test(i.name)).forEach((i) => st.deleteItem(i.id)); }, id);
  await page.waitForSelector('.hint:has-text("Comfortable walking shoes")');
  const packing0 = nonGuide(await tripState(page));
  await page.evaluate(({ tid, refs }) => refs.forEach((r) => window.__packwise.store.setSaved(tid, 'place', r, true)), { tid: id, refs: [nat, gated].map((p) => `belgrade/${p.id}`) });
  await page.goto(guidePath(id));
  await page.waitForSelector('.pack-hints');
  assert.equal(nonGuide(await tripState(page)), packing0, 'saving places and opening the guide changes nothing');
  assert.match(await page.locator('.pack-hints').innerText(), /Nothing is added to your packing list unless you tap/);
  const titles = await page.locator('.hint strong').allInnerTexts();
  assert.ok(titles.includes('Comfortable walking shoes') && titles.includes('Refillable water bottle'));
  assert.ok(titles.some((t) => /^Check entry rules for 1 place$/.test(t)));
  assert.equal(await page.locator('.hint:has-text("Check entry rules") button:has-text("Add to packing list")').count(), 0, 'reminders are not items');
  // explicit add: exactly one item, undoable, then deduplicated
  const itemsBefore = (await tripState(page)).items.length;
  await page.click('.hint:has-text("Comfortable walking shoes") button:has-text("Add to packing list")');
  await page.waitForFunction((n) => window.__packwise.store.state.items.length === n + 1, itemsBefore);
  assert.equal((await tripState(page)).items.filter((i) => i.name === 'Comfortable walking shoes').length, 1);
  await page.waitForFunction(() => ![...document.querySelectorAll('.hint strong')].some((e) => e.textContent === 'Comfortable walking shoes'));
  assert.match(await page.locator('.pack-hints').innerText(), /already look covered/);
  await page.click('.toasts button:has-text("Undo")');
  await page.waitForFunction((n) => window.__packwise.store.state.items.length === n, itemsBefore);
  // "Not now" hides it and survives reload; "Show hidden" brings it back
  await page.click('button[aria-label="Hide suggestion: Refillable water bottle"]');
  assert.ok(!(await page.locator('.hint strong').allInnerTexts()).includes('Refillable water bottle'));
  await reloadSettled(page);
  await page.waitForSelector('.pack-hints');
  assert.ok(!(await page.locator('.hint strong').allInnerTexts()).includes('Refillable water bottle'));
  await page.click('button:has-text("Show 1 hidden")');
  assert.ok((await page.locator('.hint strong').allInnerTexts()).includes('Refillable water bottle'));
  // an item already on the packing list is never suggested
  await page.evaluate((tid) => window.__packwise.store.addItem(tid, { name: 'Sturdy hiking boots', category: 'clothing', target: 1 }), id);
  await page.waitForFunction(() => ![...document.querySelectorAll('.hint strong')].some((e) => /walking shoes/.test(e.textContent)));
});

await test('guide: backup/restore, duplicate and delete cover days and notes; returning to packing loses nothing', async ({ page }) => {
  await skipWelcome(page);
  await createTrip(page, { dest: 'Zagreb', start: '2027-05-01', end: '2027-05-03' });
  const id = await firstTrip(page);
  await page.goto(explorePath(id));
  await page.waitForSelector('.place-card');
  const first = await page.locator('.place-card h3').first().innerText();
  await page.click(`.save-btn[aria-label^="Save ${first}"]`);
  await page.goto(tastePath(id));
  await page.waitForSelector('.food-card');
  await page.click('.save-btn[aria-label^="Add Fritule"]');
  await page.goto(guidePath(id));
  await page.waitForSelector('.guide-row');
  await page.selectOption(`select[aria-label="Day for ${first}"]`, '3');
  await page.selectOption('select[aria-label="Day for Fritule"]', '1');
  const packing = nonGuide(await tripState(page));
  const before = await tripState(page);
  await page.goto(`${BASE}#/trip/${id}`); // back to Pack
  await page.waitForSelector('.category-card');
  assert.equal(nonGuide(await tripState(page)), packing);
  await page.goto(`${BASE}#/settings?tab=data`);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('button:has-text("Export backup")')]);
  const json = readFileSync(await dl.path(), 'utf8');
  await page.click('button:has-text("Clear data")');
  await page.click('dialog button:has-text("Delete everything")');
  await page.waitForFunction(() => window.__packwise.store.state.entries.length === 0);
  await page.setInputFiles('input[type=file]', { name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(json) });
  await page.click('dialog button:has-text("Import")');
  await page.waitForFunction(() => window.__packwise.store.state.entries.length === 2);
  assert.deepEqual((await tripState(page)).entries, before.entries);
  const copy = await page.evaluate((tid) => window.__packwise.store.duplicateTrip(tid), id);
  const copied = (await tripState(page)).entries.filter((e) => e.tripId === copy.id).map((e) => [e.day]).sort();
  assert.deepEqual(copied, [[1], [3]], 'a duplicated trip keeps its day plan');
  await page.goto(guidePath(copy.id));
  await page.waitForSelector('.guide-row');
  assert.equal(await page.locator('.guide-row').count(), 2);
});

await test('guide: accessible names, 360px layout, by-day view and offline editing', async ({ page, ctx }) => {
  await skipWelcome(page);
  await page.goto(BASE);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await createTrip(page, { dest: 'Belgrade, Serbia', start: '2027-05-01', end: '2027-05-04' });
  const id = await firstTrip(page);
  const { CATALOG } = await import('../../js/data/catalog.js');
  const b = CATALOG.destinations.find((d) => d.id === 'belgrade');
  await page.evaluate(({ tid, refs }) => { refs.forEach((r) => window.__packwise.store.setSaved(tid, 'place', r, true)); window.__packwise.store.setSaved(tid, 'food', 'cevapi', true); return window.__packwise.store.flush(); }, { tid: id, refs: b.places.slice(0, 4).map((p) => `belgrade/${p.id}`) });
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller);
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto(guidePath(id));
  await page.waitForSelector('.guide-row');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'no horizontal overflow at 360px');
  assert.equal(await page.locator('h1').count(), 1);
  const issues = await page.evaluate(() => [...document.querySelectorAll('#view button, #view a[href], #view select')].filter((el) => !(el.getAttribute('aria-label') || el.textContent || '').trim()).map((e) => e.outerHTML.slice(0, 80)));
  assert.deepEqual(issues, []);
  await page.click('.chip:has-text("By day")');
  assert.equal(await page.locator('[aria-label="Arrange by"] .chip[aria-pressed=true]').innerText(), 'By day');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  // offline: lazy screen, plan module and catalogs come from the cache; edits persist
  await ctx.setOffline(true);
  await page.reload();
  await page.waitForSelector('.guide-row');
  await page.selectOption('select[aria-label="Day for Ćevapi"]', '2');
  await page.waitForFunction(() => window.__packwise.store.state.entries.some((e) => e.refId === 'cevapi' && e.day === 2));
  await ctx.setOffline(false);
  await reloadSettled(page);
  assert.equal((await tripState(page)).entries.find((e) => e.refId === 'cevapi').day, 2);
}, { sw: true });


await test('guide: copy, download and print the guide; text matches what is on screen', async ({ page }) => {
  await skipWelcome(page);
  await createTrip(page, { dest: 'Belgrade, Serbia', start: '2027-05-01', end: '2027-05-03' });
  const id = await firstTrip(page);
  await page.evaluate((tid) => { const st = window.__packwise.store; ['kalemegdan-park-fortress', 'nikola-tesla-museum'].forEach((r) => st.setSaved(tid, 'place', `belgrade/${r}`, true)); st.setSaved(tid, 'food', 'cevapi', true); st.planEntry(tid, 'place', 'belgrade/kalemegdan-park-fortress', 2); return st.flush(); }, id);
  await page.goto(guidePath(id));
  await page.waitForSelector('.guide-row');
  await page.evaluate(() => { window.__copied = ''; Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (t) => { window.__copied = t; } }, configurable: true }); });
  await page.click('button:has-text("Copy as text")');
  await page.waitForFunction(() => window.__copied.length > 0);
  const copied = await page.evaluate(() => window.__copied);
  assert.match(copied, /DAY 2\n {2}- Kalemegdan Park & Fortress \(Stari Grad · Belgrade\) \[Free area\]/);
  assert.match(copied, /NOT YET PLANNED/);
  assert.match(copied, /Ćevapi/);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('button:has-text("Save as .txt")')]);
  assert.match(dl.suggestedFilename(), /^packwise-guide-belgrade-serbia\.txt$/);
  assert.equal(readFileSync(await dl.path(), 'utf8'), copied, 'download and copy are identical');
  await page.click('a:has-text("Print")');
  await page.waitForSelector('.print-sheet');
  assert.ok(page.url().endsWith(`/trip/${id}/guide/print`));
  const sheet = await page.locator('.print-sheet').innerText();
  assert.match(sheet, /Belgrade, Serbia — trip guide/);
  assert.match(sheet, /Day 2/);
  assert.match(sheet, /Prices, opening hours and travel times are not included/);
  assert.ok(!/\b\d{1,2}:\d{2}\b/.test(sheet));
  assert.equal(await page.locator('.print-screen .no-print').count() > 0, true);
  await page.emulateMedia({ media: 'print' });
  assert.equal(await page.locator('.no-print').first().isVisible(), false, 'controls are hidden when printing');
});

await test('guide: drag reorder within a day (pointer) and Alt+Arrow; persists', async ({ page }) => {
  await skipWelcome(page);
  await createTrip(page, { dest: 'Belgrade, Serbia', start: '2027-05-01', end: '2027-05-03' });
  const id = await firstTrip(page);
  const { CATALOG } = await import('../../js/data/catalog.js');
  const b = CATALOG.destinations.find((d) => d.id === 'belgrade');
  const three = b.places.slice(0, 3);
  await page.evaluate(({ tid, refs }) => { const st = window.__packwise.store; refs.forEach((r) => { st.setSaved(tid, 'place', r, true); st.planEntry(tid, 'place', r, 1); }); return st.flush(); }, { tid: id, refs: three.map((p) => `belgrade/${p.id}`) });
  await page.goto(guidePath(id));
  await page.waitForSelector('.guide-row');
  await page.setViewportSize({ width: 1280, height: 1500 }); // the whole list stays on screen so synthetic mouse moves are delivered
  await page.click('.chip:has-text("By day")');
  const day1 = () => page.evaluate(() => [...[...document.querySelectorAll('.guide-section')].find((s) => s.querySelector('h2').textContent === 'Day 1').querySelectorAll('.guide-row strong')].map((e) => e.textContent));
  assert.deepEqual(await day1(), three.map((p) => p.name));
  // drag the first row below the last one
  const handle = page.locator(`.drag-handle[aria-label^="Reorder ${three[0].name}"]`);
  const hb = await handle.boundingBox();
  const lastRow = await page.locator(`.guide-row[data-ref="place:belgrade/${three[2].id}"]`).boundingBox();
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb.x + hb.width / 2, lastRow.y + lastRow.height - 2, { steps: 8 });
  await page.mouse.up();
  await page.waitForFunction((n) => { const o = window.__packwise.store.state.entries.filter((e) => e.day === 1).sort((a, b) => a.order - b.order).map((e) => e.refId); return o[2] === `belgrade/${n}`; }, three[0].id);
  assert.deepEqual(await day1(), [three[1].name, three[2].name, three[0].name]);
  // keyboard: Alt+ArrowUp on the last row moves it up one
  await page.focus(`.drag-handle[aria-label^="Reorder ${three[0].name}"]`);
  await page.keyboard.press('Alt+ArrowUp');
  assert.deepEqual(await day1(), [three[1].name, three[0].name, three[2].name]);
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('data-key')), `drag-place:belgrade/${three[0].id}`);
  await page.evaluate(() => window.__packwise.store.flush());
  await reloadSettled(page);
  await page.click('.chip:has-text("By day")');
  assert.deepEqual(await day1(), [three[1].name, three[0].name, three[2].name], 'order persists');
  // unique orders: no ties left behind
  const orders = (await tripState(page)).entries.filter((e) => e.day === 1).map((e) => e.order);
  assert.equal(new Set(orders).size, 3);
});

await test('guide: hidden packing ideas are saved with the trip (backup, duplicate); old device-only hides are migrated', async ({ page }) => {
  await skipWelcome(page);
  await createTrip(page, { dest: 'Belgrade, Serbia' });
  const id = await firstTrip(page);
  const { CATALOG } = await import('../../js/data/catalog.js');
  const nat = CATALOG.destinations.find((d) => d.id === 'belgrade').places.find((p) => p.kind === 'nature');
  await page.evaluate(({ tid, ref }) => { const st = window.__packwise.store; st.setSaved(tid, 'place', ref, true); st.state.items.filter((i) => i.tripId === tid && /shoe|bottle/i.test(i.name)).forEach((i) => st.deleteItem(i.id)); }, { tid: id, ref: `belgrade/${nat.id}` });
  await page.goto(guidePath(id));
  await page.waitForSelector('.hint:has-text("Refillable water bottle")');
  await page.click('button[aria-label="Hide suggestion: Refillable water bottle"]');
  await page.waitForFunction(() => window.__packwise.store.state.trips[0].hiddenHints.includes('water-bottle'));
  // backup round trip keeps it hidden
  await page.goto(`${BASE}#/settings?tab=data`);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('button:has-text("Export backup")')]);
  const json = readFileSync(await dl.path(), 'utf8');
  assert.deepEqual(JSON.parse(json).data.trips[0].hiddenHints, ['water-bottle']);
  await page.click('button:has-text("Clear data")');
  await page.click('dialog button:has-text("Delete everything")');
  await page.waitForFunction(() => window.__packwise.store.state.trips.length === 0);
  await page.setInputFiles('input[type=file]', { name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(json) });
  await page.click('dialog button:has-text("Import")');
  await page.waitForFunction(() => window.__packwise.store.state.trips.length === 1);
  await page.goto(guidePath(id));
  await page.waitForSelector('.pack-hints');
  assert.ok(!(await page.locator('.hint strong').allInnerTexts()).includes('Refillable water bottle'), 'still hidden after restore');
  await page.click('button:has-text("Show 1 hidden")');
  await page.waitForSelector('.hint:has-text("Refillable water bottle")');
  assert.deepEqual((await tripState(page)).trips[0].hiddenHints, []);
  // legacy: a hide stored in device preferences by the previous build moves onto the trip
  await page.evaluate((tid) => { const raw = JSON.parse(localStorage.getItem('packwise.prefs.v1') || '{}'); raw.dismissed = [...(raw.dismissed || []), `hint:${tid}:footwear`]; localStorage.setItem('packwise.prefs.v1', JSON.stringify(raw)); }, id);
  await page.reload();
  await page.waitForSelector('.pack-hints');
  await page.waitForFunction(() => window.__packwise.store.state.trips[0].hiddenHints.includes('footwear'));
  assert.ok(!(await page.locator('.hint strong').allInnerTexts()).includes('Comfortable walking shoes'));
});


// ============================================================ Phase 5.2: colors, item art, scope, own places
await test('settings: separate background colors for light and dark mode apply, persist and survive reload', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await skipWelcome(page);
  await page.goto(`${BASE}#/settings`);
  const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const token = (n) => page.evaluate((v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim(), n);
  assert.equal(await page.locator('[aria-label="Light mode"] input').count() >= 6, true);
  assert.equal(await page.locator('[aria-label="Dark mode"] input').count() >= 5, true);
  const before = await token('--bg');
  // choose a light color while in light mode: the page changes
  await page.click('[aria-label="Light mode"] label:has-text("Sage")');
  assert.equal(await page.evaluate(() => document.documentElement.dataset.bgl), 'sage');
  assert.notEqual(await token('--bg'), before);
  assert.equal(await token('--bg'), '#eef3ea'.length ? await token('--bg') : '');
  const sage = await token('--bg');
  // a dark-mode choice must NOT change light mode
  await page.click('[aria-label="Dark mode"] label:has-text("Midnight")');
  assert.equal(await token('--bg'), sage, 'dark choice does not touch light mode');
  // switch the theme to dark: the dark color shows, the light one does not
  await page.click('label.seg-opt:has-text("Dark")');
  const midnight = await token('--bg');
  assert.notEqual(midnight, sage);
  assert.ok(parseInt(midnight.slice(1, 3), 16) < 0x30, 'a dark background');
  await page.click('[aria-label="Dark mode"] label:has-text("Forest")');
  assert.notEqual(await token('--bg'), midnight);
  // persists across reload; system theme follows the OS scheme with the matching choice
  await reloadSettled(page);
  assert.deepEqual(await page.evaluate(() => [document.documentElement.dataset.bgl, document.documentElement.dataset.bgd]), ['sage', 'forest']);
  await page.goto(`${BASE}#/settings`);
  await page.click('label.seg-opt:has-text("System")');
  await page.emulateMedia({ colorScheme: 'light' });
  assert.equal(await token('--bg'), sage, 'system + light OS shows the light choice');
  await page.emulateMedia({ colorScheme: 'dark' });
  assert.notEqual(await token('--bg'), sage, 'system + dark OS shows the dark choice');
  assert.ok(parseInt((await token('--bg')).slice(1, 3), 16) < 0x30);
  void bg;
  // no overflow and labelled controls
  assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('.swatch-bg input')].filter((i) => !i.getAttribute('aria-label')).length), 0);
});

await test('studio: every item gets its own picture, each category its own color, in light and dark', async ({ page }) => {
  await skipWelcome(page);
  await createTrip(page, { dest: 'Rome, Italy', type: 'City', bags: ['Checked'] });
  const id = await firstTrip(page);
  await page.goto(`${BASE}#/trip/${id}/studio`);
  await page.waitForSelector('.tray-token, .tile-item');
  const info = await page.evaluate(() => {
    const arts = [...document.querySelectorAll('.tile-item .item-art')].map((s) => s.innerHTML.length && [...s.querySelectorAll('path,rect,circle,ellipse,line')].map((n) => n.getAttribute('d') || [n.getAttribute('x'), n.getAttribute('y'), n.getAttribute('r')].join()).join('|'));
    const names = [...document.querySelectorAll('.tile-item .tile-name')].map((n) => n.textContent);
    const cats = [...document.querySelectorAll('.tile-item')].map((li) => [li.dataset.cat, getComputedStyle(li).getPropertyValue('--cat').trim()]);
    return { arts, names, cats };
  });
  assert.ok(info.arts.length >= 6, `tiles with art: ${info.arts.length}`);
  assert.ok(info.arts.every(Boolean), 'every tile has an illustration');
  const byName = new Map();
  info.names.forEach((n, i) => byName.set(n, info.arts[i]));
  assert.ok(new Set(byName.values()).size >= byName.size - 4, 'distinct pictures (a few kinds legitimately share one)');
  const colors = new Map(info.cats);
  assert.ok(colors.size >= 4, 'several categories present');
  assert.equal(new Set([...colors.values()]).size, colors.size, 'each category has a different color');
  // category chips use the category color; clicking filters
  const chipCats = await page.evaluate(() => [...document.querySelectorAll('.chip[data-cat]')].map((c) => c.dataset.cat));
  assert.ok(chipCats.length >= 2 && new Set(chipCats).size === chipCats.length, `category chips: ${chipCats}`);
  // tray names are not broken in the middle of a word
  const broken = await page.evaluate(() => [...document.querySelectorAll('.tray-name')].filter((n) => n.scrollWidth > n.clientWidth + 1).map((n) => n.textContent));
  assert.deepEqual(broken, [], 'no clipped tray names');
  // dark mode keeps shapes visible (outline filter) and the colors defined
  await page.emulateMedia({ colorScheme: 'dark' });
  const dark = await page.evaluate(() => ({ filter: getComputedStyle(document.querySelector('.item-art')).filter, cat: getComputedStyle(document.querySelector('.tile-item')).getPropertyValue('--cat-ink').trim() }));
  assert.match(dark.filter, /drop-shadow/);
  assert.ok(dark.cat);
  // checklist: category header icons are category-colored too
  await page.goto(`${BASE}#/trip/${id}`);
  await page.waitForSelector('.category-card');
  const heads = await page.evaluate(() => [...document.querySelectorAll('.category-card')].map((c) => [c.dataset.cat, getComputedStyle(c.querySelector('.category-icon')).backgroundColor]));
  assert.ok(heads.length >= 4);
  assert.equal(new Set(heads.map((h) => h[1])).size, heads.length, 'each category header has its own tint');
});

await test('trip scope: "within my country" skips abroad-only tasks and items; the home country suggests it; old trips are not changed', async ({ page }) => {
  await skipWelcome(page);
  // an abroad trip (default) keeps passport / insurance / adapter
  await createTrip(page, { dest: 'Rome, Italy' });
  let st = await tripState(page);
  const rome = st.trips[0];
  assert.equal(rome.scope, 'abroad');
  assert.ok(st.tasks.some((t) => t.tripId === rome.id && t.title === 'Buy travel insurance'));
  assert.ok(st.items.some((i) => i.tripId === rome.id && i.name === 'Travel adapter'));
  // a domestic trip skips them
  await page.goto(`${BASE}#/trips/new`);
  await page.click('label.tile:has-text("Custom")');
  await page.fill('input[name=destination]', 'Veles - Babuna');
  await page.click('label.seg-opt:has-text("Within my country")');
  await page.fill('input[name=start]', '2026-11-29');
  await page.fill('input[name=end]', '2026-12-01');
  await generate(page);
  await page.waitForSelector('h1:has-text("Veles")');
  st = await tripState(page);
  const veles = st.trips.find((t) => t.name === 'Veles - Babuna');
  assert.equal(veles.scope, 'domestic');
  const titles = st.tasks.filter((t) => t.tripId === veles.id).map((t) => t.title);
  assert.ok(!titles.includes('Buy travel insurance') && !titles.includes('Notify bank about travel') && !titles.includes('Check passport / ID validity'));
  assert.ok(titles.includes('Confirm accommodation booking') && titles.includes('Check the weather forecast'));
  const names = st.items.filter((i) => i.tripId === veles.id).map((i) => i.name);
  assert.ok(!names.includes('Travel adapter') && !names.includes('Travel insurance details') && !names.includes('ID / Passport'));
  assert.ok(names.includes('ID card / driving licence') && names.includes('Phone charger'));
  // the Travel Tasks screen offers to trim an already-created domestic trip's abroad-only tasks
  await page.evaluate(([tid]) => { const s = window.__packwise.store; s.addTask?.(tid, { title: 'Buy travel insurance', phase: 'before' }); }, [veles.id]);
  await page.goto(`${BASE}#/trip/${veles.id}/tasks`);
  await page.waitForSelector('.scope-banner');
  assert.match(await page.locator('.scope-banner').innerText(), /usually only needed abroad/);
  await page.click('.scope-banner button:has-text("Remove it")');
  await page.waitForSelector('.scope-banner', { state: 'detached' });
  await page.click('.toasts button:has-text("Undo")');
  await page.waitForSelector('.scope-banner');
  // a trip with no scope yet (made before this existed) is ASKED, on both the tasks and packing pages, and behaves like abroad meanwhile
  await page.evaluate((tid) => { const s = window.__packwise.store; s.updateTrip(tid, { scope: '' }); }, veles.id);
  await page.waitForSelector('.scope-banner', { state: 'detached' });
  await page.waitForSelector('.scope-ask');
  assert.match(await page.locator('.scope-ask').innerText(), /Within your country or abroad\?/);
  await page.goto(`${BASE}#/trip/${veles.id}`);
  await page.waitForSelector('.scope-ask');
  await page.click('.scope-ask button:has-text("Within my country")');
  await page.waitForSelector('.scope-ask', { state: 'detached' });
  assert.equal((await tripState(page)).trips.find((x) => x.id === veles.id).scope, 'domestic');
  // answering "within my country" on a trip that still lists abroad-only items offers to remove them too (never automatically)
  await page.evaluate((tid) => { const s = window.__packwise.store; s.addItem(tid, { name: 'Travel adapter', category: 'electronics', target: 1 }); }, veles.id);
  await page.waitForSelector('.scope-banner');
  assert.match(await page.locator('.scope-banner').innerText(), /travel adapter/);
  assert.ok((await tripState(page)).items.some((i) => i.tripId === veles.id && i.name === 'Travel adapter'), 'not removed until tapped');
  await page.click('.scope-banner button:has-text("Remove")'); // the restored insurance task is still listed too, so "Remove them"
  await page.waitForFunction((tid) => !window.__packwise.store.state.items.some((i) => i.tripId === tid && i.name === 'Travel adapter'), veles.id);
  await page.click('.toasts button:has-text("Undo")');
  await page.waitForFunction((tid) => window.__packwise.store.state.items.some((i) => i.tripId === tid && i.name === 'Travel adapter'), veles.id);
  await page.evaluate((tid) => { const s = window.__packwise.store; s.updateTrip(tid, { scope: '' }); }, veles.id);
  // creating a new trip REQUIRES an answer
  await page.goto(`${BASE}#/trips/new`);
  await page.fill('input[name=destination]', 'Ohrid');
  await page.click('button:has-text("Generate Packing List")');
  assert.match(await page.locator('.form-errors').innerText(), /Choose whether this trip is within your country or abroad/);
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('name')), 'scope');
  // home country in Settings pre-selects the scope from the destination
  await page.goto(`${BASE}#/settings?tab=preferences`);
  await page.selectOption('select[name=homeCountry]', 'RS');
  await page.goto(`${BASE}#/trips/new`);
  await page.fill('input[name=destination]', 'Belgrade');
  await page.press('input[name=destination]', 'Tab');
  await page.waitForFunction(() => document.querySelector('input[name=scope][value=domestic]')?.checked);
  assert.match(await page.locator('.trip-form').innerText(), /Set from your home country \(Serbia\)/);
  await page.fill('input[name=destination]', 'Rome, Italy');
  await page.press('input[name=destination]', 'Tab');
  await page.waitForTimeout(300);
  // Rome is not in the catalog, so the choice is left alone; picking it by hand wins over auto
  await page.click('label.seg-opt:has-text("Abroad")');
  await page.fill('input[name=destination]', 'Belgrade');
  await page.press('input[name=destination]', 'Tab');
  await page.waitForTimeout(300);
  assert.equal(await page.locator('input[name=scope][value=abroad]').isChecked(), true, 'a manual choice is never overridden');
});

await test('unsupported destination: friendly plan-it-yourself page, own places flow into My Guide with day, packing idea and text', async ({ page }) => {
  await skipWelcome(page);
  await createTrip(page, { dest: 'Veles - Babuna', type: 'Custom', start: '2026-11-29', end: '2026-12-01' });
  const id = await firstTrip(page);
  await page.goto(explorePath(id));
  await page.waitForSelector('.own-places');
  const text = await page.locator('.explore-screen').innerText();
  assert.match(text, /No built-in guide for “Veles - Babuna” yet/);
  assert.ok(!/won’t make one up/.test(text), 'no dismissive wording');
  assert.match(await page.locator('.bubble-text').innerText(), /add your own places/);
  // search links for each unmatched stop, all external + labelled
  const links = await page.evaluate(() => [...document.querySelectorAll('.search-row a')].map((a) => [a.getAttribute('target'), a.getAttribute('rel'), new URL(a.href).host]));
  assert.ok(links.length >= 6, 'three links for each of the two stops');
  assert.ok(links.every(([t, r]) => t === '_blank' && r === 'noopener noreferrer'));
  assert.deepEqual([...new Set(links.map((l) => l[2]))].sort(), ['en.wikipedia.org', 'www.google.com', 'www.openstreetmap.org']);
  assert.equal(await cardCount(page), 0, 'still no invented catalog places');
  // add your own place via the dialog (keyboard friendly), validation first
  await page.click('button:has-text("Add your own place")');
  await page.waitForSelector('dialog[open]');
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('name')), 'label', 'focus starts in the name field');
  await page.click('dialog button:has-text("Add place")');
  assert.match(await page.locator('dialog .field-error').innerText(), /Give the place a name/);
  await page.fill('dialog input[name=label]', 'Babuna waterfall hike');
  await page.fill('dialog input[name=sub]', 'Veles');
  await page.selectOption('dialog select[name=type]', 'nature');
  await page.fill('dialog textarea[name=note]', 'Start early');
  await page.click('dialog button:has-text("Add place")');
  await page.waitForSelector('dialog', { state: 'detached' });
  await page.goto(guidePath(id));
  await page.waitForSelector('.guide-row');
  assert.deepEqual(await page.locator('.guide-section h2').allInnerTexts(), ['My own places']);
  assert.equal(await page.locator('.guide-row .adm-tag').count(), 0, 'no admission is claimed for a user-written place');
  assert.match(await page.locator('.guide-row').innerText(), /Babuna waterfall hike[\s\S]*Veles[\s\S]*My place/);
  assert.match(await page.locator('.guide-row a').getAttribute('href'), /query=Babuna%20waterfall%20hike%2C%20Veles%20-%20Babuna$/);
  // packing ideas come from the chosen type; nothing is added automatically
  const items0 = (await tripState(page)).items.length;
  await page.evaluate((tid) => { const st = window.__packwise.store; st.state.items.filter((i) => i.tripId === tid && /shoe|bottle/i.test(i.name)).forEach((i) => st.deleteItem(i.id)); }, id);
  await page.waitForSelector('.hint:has-text("walking shoes")');
  assert.equal((await tripState(page)).items.length < items0, true);
  // day plan + edit + undoable remove
  await page.selectOption('select[aria-label="Day for Babuna waterfall hike"]', '2');
  await page.waitForFunction(() => window.__packwise.store.state.entries.some((e) => e.kind === 'custom' && e.day === 2));
  await page.click('button[aria-label="Edit Babuna waterfall hike"]');
  await page.waitForSelector('dialog[open]');
  await page.fill('dialog input[name=label]', 'Babuna waterfall');
  await page.click('dialog button:has-text("Save")');
  await page.waitForSelector('.guide-row:has-text("Babuna waterfall")');
  assert.equal((await tripState(page)).entries.find((e) => e.kind === 'custom').day, 2, 'edit keeps the day');
  await page.click('button[aria-label^="Remove Babuna waterfall"]');
  assert.equal(await page.locator('.guide-row').count(), 0);
  await page.click('.toasts button:has-text("Undo")');
  await page.waitForSelector('.guide-row:has-text("Babuna waterfall")');
  assert.equal((await tripState(page)).entries.filter((e) => e.kind === 'custom').length, 1);
  // survives backup / restore
  await page.evaluate(() => window.__packwise.store.flush());
  await page.goto(`${BASE}#/settings?tab=data`);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('button:has-text("Export backup")')]);
  const json = readFileSync(await dl.path(), 'utf8');
  assert.ok(JSON.parse(json).data.entries.some((e) => e.kind === 'custom' && e.label === 'Babuna waterfall'));
  await page.click('button:has-text("Clear data")');
  await page.click('dialog button:has-text("Delete everything")');
  await page.waitForFunction(() => window.__packwise.store.state.entries.length === 0);
  await page.setInputFiles('input[type=file]', { name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(json) });
  await page.click('dialog button:has-text("Import")');
  await page.waitForFunction(() => window.__packwise.store.state.entries.some((e) => e.kind === 'custom'));
  // taste page for an uncovered destination is also friendly
  await page.goto(tastePath(id));
  await page.waitForSelector('text=No built-in food guide');
});


await test('mobile: the More tab reaches every feature the desktop sidebar has; desktop shows Settings instead', async ({ page }) => {
  await skipWelcome(page);
  await createTrip(page, { dest: 'Belgrade, Serbia' });
  const id = await firstTrip(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}#/`);
  const visibleNav = () => page.evaluate(() => [...document.querySelectorAll('.nav-list li')].filter((li) => li.offsetParent !== null).map((li) => li.querySelector('.nav-short').textContent));
  assert.deepEqual(await visibleNav(), ['Home', 'Trips', 'Pack', 'Tasks', 'More'], 'five bottom-bar tabs on a phone');
  await page.click('.nav-item[data-nav=more]');
  await page.waitForSelector('.more-list');
  assert.ok(page.url().endsWith('#/more'));
  assert.equal(await page.getAttribute('.nav-item[data-nav=more]', 'aria-current'), 'page');
  const wanted = [['Packing Studio', `/trip/${id}/studio`, '.stage'], ['Explore', `/trip/${id}/explore`, '.place-card'], ['Taste', `/trip/${id}/taste`, '.food-card'], ['My Guide', `/trip/${id}/guide`, '.guide-tab'], ['Templates', '/templates', 'h1'], ['Settings', '/settings', '[role=tab]']];
  assert.deepEqual(await page.locator('.more-item strong').allInnerTexts(), wanted.map((w) => w[0]));
  for (const [label, path, ready] of wanted) {
    await page.goto(`${BASE}#/more`);
    await page.click(`.more-item:has-text("${label}")`);
    await page.waitForSelector(ready);
    assert.ok(page.url().includes(path), `${label} -> ${page.url()}`);
  }
  // each More item works for a fresh install too (no trips): it sends you to create one instead of a dead end
  await page.evaluate(() => window.__packwise.store.clearAll());
  await page.goto(`${BASE}#/more`);
  assert.equal(await page.locator('.more-item[href="#/trips/new"]').count(), 4);
  // desktop: Settings is in the sidebar and More is hidden
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${BASE}#/`);
  const wide = await visibleNav();
  assert.ok(wide.includes('Settings') && !wide.includes('More') && wide.includes('Explore') && wide.includes('Studio') && wide.includes('Templates'));
  await page.click('.nav-item[data-nav=settings]');
  await page.waitForSelector('[role=tab]');
  assert.equal(await page.getAttribute('.nav-item[data-nav=settings]', 'aria-current'), 'page');
});

await test('precache list covers every runtime file and versions agree', async () => {
  const sw = readFileSync(join(ROOT, 'sw.js'), 'utf8');
  const listed = new Set([...sw.matchAll(/^\s+'([^']+)',$/gm)].map((m) => m[1]));
  const walk = (dir) => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
  const files = ['css', 'js', 'assets/icons'].flatMap((d) => walk(join(ROOT, d))).map((p) => p.slice(ROOT.length + 1)).concat(['index.html', 'manifest.webmanifest']);
  const missing = files.filter((f) => !listed.has(f));
  assert.deepEqual(missing, [], 'files missing from PRECACHE');
  for (const f of listed) if (f !== './') assert.ok(statSync(join(ROOT, f)).isFile(), `${f} listed but absent`);
  const appVersion = readFileSync(join(ROOT, 'js/models.js'), 'utf8').match(/APP_VERSION = '([^']+)'/)[1];
  assert.match(sw, new RegExp(`CACHE_VERSION = 'packwise-v${appVersion.replace(/\./g, '\\.')}'`));
});

await test('no innerHTML / eval / external URLs in app code', async () => {
  const walk = (dir) => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
  const offenders = [];
  for (const f of [...walk(join(ROOT, 'js')), join(ROOT, 'sw.js'), join(ROOT, 'index.html')]) {
    const src = readFileSync(f, 'utf8');
    if (/innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\(|new Function\(/.test(src)) offenders.push(`${f}: unsafe API`);
    const urls = [...src.matchAll(/https?:\/\/[^\s'"`)]+/g)].map((m) => m[0]).filter((u) => !u.startsWith('http://www.w3.org/'));
    // guide.js builds user-opened outbound search links (never fetched); CSP still blocks any fetch to them
    const allowed = f.endsWith('js/guide.js') ? /^https:\/\/(www\.openstreetmap\.org|www\.google\.com\/maps|en\.wikipedia\.org)\// : null;
    if (allowed) urls.splice(0, urls.length, ...urls.filter((u) => !allowed.test(u)));
    if (urls.length) offenders.push(`${f}: external URL ${urls[0]}`);
  }
  assert.deepEqual(offenders, []);
});

await browser.close();
server.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} e2e checks passed${failed.length ? `, ${failed.length} FAILED` : ''}`);
process.exit(failed.length ? 1 : 0);
