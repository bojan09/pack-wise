// Renders the PNG icon set from assets/icons/icon.svg using the Playwright browser (dev only).
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'icons');
const svg = readFileSync(join(dir, 'icon.svg'), 'utf8');

// Maskable icons need the artwork inside the central safe zone on a full-bleed background.
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3CC6B5"/><stop offset="1" stop-color="#157A74"/></linearGradient></defs>
  <rect width="512" height="512" fill="url(#g)"/>
  <g transform="translate(256 256) scale(0.72) translate(-256 -256)">
    <rect x="146" y="206" width="220" height="168" rx="30" fill="#F8F5EF"/>
    <path d="M212 206v-26a14 14 0 0 1 14-14h60a14 14 0 0 1 14 14v26" fill="none" stroke="#F8F5EF" stroke-width="22" stroke-linecap="round"/>
    <rect x="146" y="268" width="220" height="22" fill="#E7B66C"/>
    <path d="M214 322l24 24 52-60" fill="none" stroke="#157A74" stroke-width="22" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="378" cy="150" r="24" fill="#F28A72"/>
  </g></svg>`;

// iOS applies its own mask, so the home-screen icon is full-bleed too.
const jobs = [
  ['icon-192.png', svg, 192, true],
  ['icon-512.png', svg, 512, true],
  ['maskable-192.png', maskable, 192, false],
  ['maskable-512.png', maskable, 512, false],
  ['apple-touch-icon.png', maskable, 180, false],
];

const browser = await chromium.launch();
for (const [file, markup, size, transparent] of jobs) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${markup}`);
  const buf = await page.screenshot({ omitBackground: transparent, type: 'png' });
  writeFileSync(join(dir, file), buf);
  await page.close();
  console.log('wrote', file);
}
await browser.close();
