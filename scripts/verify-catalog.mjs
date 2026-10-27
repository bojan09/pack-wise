// Dev-only helper: cross-checks the editorial catalog against Wikipedia / Wikidata and prints a REPORT.
// It never edits the catalog. A human reads the report, fixes names and decides what to keep.
//
//   node scripts/verify-catalog.mjs [--coords] [--out report.json]
//
// Needs outbound access to en.wikipedia.org (and www.wikidata.org with --coords). The app itself never
// runs this and never contacts these hosts. Coordinates found here are CANDIDATES for review, not facts.
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const UA = 'PackWise-catalog-check/1.0 (offline PWA; dev script)';
const WIKI = 'https://en.wikipedia.org/w/api.php';
const DATA = 'https://www.wikidata.org/w/api.php';

const getJson = async (fetchImpl, url) => {
  const res = await fetchImpl(url, { headers: { 'user-agent': UA, accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
};

/** Best Wikipedia article for a place, or null. opensearch returns [query, titles[], descriptions[], urls[]]. */
export async function findArticle(fetchImpl, place, dest) {
  const q = new URLSearchParams({ action: 'opensearch', format: 'json', limit: '1', search: `${place.name} ${dest.name}` });
  const [, titles = [], , urls = []] = await getJson(fetchImpl, `${WIKI}?${q}`);
  return titles.length ? { title: titles[0], url: urls[0] || '' } : null;
}

/** Candidate coordinates (Wikidata P625) for an enwiki title, or null. */
export async function findCoords(fetchImpl, title) {
  const q = new URLSearchParams({ action: 'wbgetentities', format: 'json', sites: 'enwiki', titles: title, props: 'claims' });
  const data = await getJson(fetchImpl, `${DATA}?${q}`);
  const entity = Object.values(data.entities || {})[0];
  const v = entity?.claims?.P625?.[0]?.mainsnak?.datavalue?.value;
  return v && Number.isFinite(v.latitude) && Number.isFinite(v.longitude) ? { lat: v.latitude, lon: v.longitude } : null;
}

/** Words the place name and the article title share, as a crude sanity check (0..1). */
export function nameOverlap(a, b) {
  const words = (s) => new Set(String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/).filter((w) => w.length > 2));
  const A = words(a);
  const B = words(b);
  if (!A.size) return 0;
  return [...A].filter((w) => B.has(w)).length / A.size;
}

/** @returns {Promise<{checked:number, noArticle:object[], weakMatch:object[], withCoords:object[], errors:object[]}>} */
export async function verify(catalog, { fetchImpl = fetch, coords = false, delayMs = 150, log = () => {} } = {}) {
  const report = { checked: 0, noArticle: [], weakMatch: [], withCoords: [], errors: [] };
  for (const dest of catalog.destinations) {
    for (const place of dest.places) {
      const ref = `${dest.id}/${place.id}`;
      report.checked += 1;
      try {
        const hit = await findArticle(fetchImpl, place, dest);
        if (!hit) report.noArticle.push({ ref, name: place.name });
        else {
          const overlap = nameOverlap(place.name, hit.title);
          if (overlap < 0.5) report.weakMatch.push({ ref, name: place.name, article: hit.title, overlap: Math.round(overlap * 100) / 100 });
          if (coords) {
            const c = await findCoords(fetchImpl, hit.title);
            if (c) report.withCoords.push({ ref, article: hit.title, ...c });
          }
        }
      } catch (e) {
        report.errors.push({ ref, error: String(e.message || e) });
      }
      log(`${ref}`);
      if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  return report;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const { CATALOG } = await import('../js/data/catalog.js');
  const args = process.argv.slice(2);
  const out = args.includes('--out') ? args[args.indexOf('--out') + 1] : '';
  const report = await verify(CATALOG, { coords: args.includes('--coords'), log: (m) => process.stderr.write(`\r${m}                    `) });
  const text = JSON.stringify(report, null, 2);
  if (out) writeFileSync(out, text); else console.log(text);
  console.error(`\n${report.checked} places · ${report.noArticle.length} without an article · ${report.weakMatch.length} weak matches · ${report.errors.length} errors`);
  process.exitCode = report.errors.length ? 2 : 0;
}
