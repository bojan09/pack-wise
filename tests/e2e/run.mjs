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
  rewrite: (path, body) => (path === '/sw.js' && swVersionOverride ? body.toString().replace("'packwise-v1.0.0'", `'${swVersionOverride}'`) : undefined),
});
const browser = await chromium.launch();

const results = [];
async function test(name, fn, { sw = false, viewport = { width: 390, height: 844 }, ctxOptions = {} } = {}) {
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

async function createTrip(page, { dest = 'Rome, Italy', type = 'City', start = '2026-12-12', end = '2026-12-20', bags = [] } = {}) {
  await page.goto(`${BASE}#/trips/new`);
  await page.click(`label.tile:has-text("${type}")`);
  await page.fill('input[name=destination]', dest);
  if (start) await page.fill('input[name=start]', start);
  if (end) await page.fill('input[name=end]', end);
  for (const b of bags) await page.click(`label.tile:has-text("${b}")`);
  await page.click('button:has-text("Generate Packing List")');
  await page.waitForSelector('h1:has-text("' + dest + '")');
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
  await page.click('button:has-text("Generate Packing List")');
  await page.waitForSelector('.form-errors .field-error');
  assert.ok(page.url().endsWith('#/trips/new'));
  await page.fill('input[name=destination]', 'Oslo');
  await page.fill('input[name=start]', '2026-12-20');
  await page.fill('input[name=end]', '2026-12-10');
  await page.click('button:has-text("Generate Packing List")');
  await page.waitForSelector('text=on or after the departure');
  await page.fill('input[name=end]', '2026-12-22');
  await page.click('label.tile:has-text("Winter")');
  await page.click('label.tile:has-text("Checked")');
  await page.click('button:has-text("Generate Packing List")');
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
  assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent-strong').trim()), '#C4573F');
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
  await page.goto(`${BASE}#/settings`);
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
  await page.goto(`${BASE}#/settings`);
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
    const bad = await page.evaluate(() => {
      const issues = [];
      for (const el of document.querySelectorAll('#view button, #view a[href], .nav a')) {
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
  for (const r of ['/', '/trips', '/trips/new', `/trip/${id}`, `/trip/${id}/tasks`, `/trip/${id}/summary`, `/trip/${id}/edit`, '/settings']) await check(r);
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

// ------------------------------------------------------------- responsive
const viewports = [[360, 640], [390, 844], [768, 1024], [1024, 768], [1440, 900]];
for (const [w, h] of viewports) {
  await test(`responsive ${w}x${h}: no horizontal overflow on any screen`, async ({ page }) => {
    await skipWelcome(page);
    await createTrip(page);
    await createTrip(page, { dest: 'Chamonix', type: 'Winter', start: '2027-01-10', end: '2027-01-15' });
    const st = await tripState(page);
    const id = st.trips[0].id;
    const routes = [['dashboard', '/'], ['trips', '/trips'], ['create', '/trips/new'], ['checklist', `/trip/${id}`], ['tasks', `/trip/${id}/tasks`], ['summary', `/trip/${id}/summary`], ['settings', '/settings'], ['welcome', '/welcome']];
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
  assert.deepEqual(keys, ['packwise-v1.0.0']);
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
  assert.deepEqual(await page.evaluate(() => caches.keys()).then((k) => k.sort()), ['packwise-v1.0.0', 'packwise-v9.9.9-test']);
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
    if (urls.length) offenders.push(`${f}: external URL ${urls[0]}`);
  }
  assert.deepEqual(offenders, []);
});

await browser.close();
server.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} e2e checks passed${failed.length ? `, ${failed.length} FAILED` : ''}`);
process.exit(failed.length ? 1 : 0);
