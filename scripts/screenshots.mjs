// Regenerates docs/screenshots/*.png with realistic demo data (dev only; needs Playwright).
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from '../tests/e2e/server.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const out = resolve(fileURLToPath(new URL('../docs/screenshots', import.meta.url)));
mkdirSync(out, { recursive: true });
const server = await startServer(8125);
const base = 'http://localhost:8125/';
const browser = await chromium.launch();

async function seed(page) {
  await page.addInitScript(() => localStorage.setItem('packwise.prefs.v1', JSON.stringify({ onboarded: true, name: 'Alex' })));
  await page.goto(base);
  const make = async (dest, type, s, e, bags) => {
    await page.goto(`${base}#/trips/new`);
    await page.click(`label.tile:has-text("${type}")`);
    await page.fill('input[name=destination]', dest);
    await page.fill('input[name=start]', s);
    await page.fill('input[name=end]', e);
    for (const b of bags) await page.click(`label.tile:has-text("${b}")`);
    await page.click('label.seg-opt:has-text("Abroad")'); // new trips must say where they go
    await page.click('button:has-text("Generate Packing List")');
    await page.waitForSelector(`h1:has-text("${dest}")`);
  };
  const soon = (n) => { const d = new Date(Date.now() + n * 86400000); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  await make('Barcelona', 'City', soon(60), soon(64), []);
  await make('Algarve', 'Beach', soon(40), soon(47), ['Checked']);
  await make('Belgrade, Serbia', 'City', soon(90), soon(94), []); // covered by the Explore / Taste guides
  await page.evaluate(() => { const { store } = window.__packwise; const t = store.state.trips.find((x) => x.name === 'Belgrade, Serbia'); ['kalemegdan-park-fortress', 'nikola-tesla-museum', 'temple-of-saint-sava'].forEach((r) => store.setSaved(t.id, 'place', `belgrade/${r}`, true)); store.setSaved(t.id, 'food', 'cevapi', true); store.planEntry(t.id, 'place', 'belgrade/kalemegdan-park-fortress', 1); });
  await make('Italy Adventure', 'City', soon(7), soon(15), ['Checked']);
  await page.evaluate(() => {
    const { store } = window.__packwise;
    const trip = store.state.trips.find((t) => t.name === 'Italy Adventure');
    const items = store.state.items.filter((i) => i.tripId === trip.id);
    items.forEach((i, n) => { if (n % 3 !== 2) store.setPacked(i.id, i.target); });
    store.state.tasks.filter((t) => t.tripId === trip.id).slice(0, 4).forEach((t) => store.toggleTask(t.id));
  });
  await page.waitForTimeout(6500); // let toasts expire
  return page.evaluate(() => Object.fromEntries([['id', 'Italy Adventure'], ['guide', 'Belgrade, Serbia']].map(([k, n]) => [k, window.__packwise.store.state.trips.find((t) => t.name === n).id])));
}

for (const [label, viewport, shots] of [
  ['390x844', { width: 390, height: 844 }, ['welcome', 'dashboard', 'create', 'checklist', 'studio', 'explore', 'taste', 'guide', 'templates', 'tasks', 'summary', 'settings']],
  ['1440x900', { width: 1440, height: 900 }, ['dashboard', 'checklist', 'studio', 'explore', 'taste', 'templates', 'trips', 'settings']],
]) {
  const ctx = await browser.newContext({ viewport, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const { id, guide } = await seed(page);
  const routes = { welcome: '/welcome', dashboard: '/', create: '/trips/new', checklist: `/trip/${id}`, tasks: `/trip/${id}/tasks`, summary: `/trip/${id}/summary`, settings: '/settings', trips: '/trips', studio: `/trip/${id}/studio`, templates: '/templates', explore: `/trip/${guide}/explore`, taste: `/trip/${guide}/taste`, guide: `/trip/${guide}/guide` };
  for (const name of shots) {
    await page.goto(`${base}#${routes[name]}`);
    await page.waitForTimeout(500);
    if (name === 'studio') {
      const second = await page.$$eval('select[name=bag] option', (o) => o[1]?.value);
      if (second) await page.selectOption('select[name=bag]', second);
      await page.waitForTimeout(700);
    }
    await page.screenshot({ path: join(out, `${label}-${name}.png`) });
  }
  await ctx.close();
}
await browser.close();
server.close();
console.log('screenshots written to', out);
