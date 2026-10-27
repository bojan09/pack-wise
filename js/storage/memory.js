// In-memory storage adapter: used by unit tests and as a last-resort fallback when
// IndexedDB is unavailable (e.g. some private-browsing modes). Same interface as idb.js.
import { SCHEMA_VERSION } from '../models.js';

export const STORE_NAMES = ['trips', 'bags', 'items', 'tasks', 'templates', 'entries'];

export function createMemoryAdapter({ schemaVersion = SCHEMA_VERSION, seed = {} } = {}) {
  const db = Object.fromEntries(STORE_NAMES.map((s) => [s, new Map()]));
  for (const s of STORE_NAMES) for (const rec of seed[s] || []) db[s].set(rec.id, structuredClone(rec));
  let version = schemaVersion;
  let safety = null;
  const adapter = {
    kind: 'memory',
    failNext: null, // tests set this to an Error to simulate write failures
    async load() {
      const snap = { schemaVersion: version };
      for (const s of STORE_NAMES) snap[s] = [...db[s].values()].map((r) => structuredClone(r));
      return snap;
    },
    async commit({ put = {}, remove = {} }) {
      if (adapter.failNext) {
        const err = adapter.failNext;
        adapter.failNext = null;
        throw err;
      }
      for (const [s, recs] of Object.entries(put)) for (const r of recs) db[s].set(r.id, structuredClone(r));
      for (const [s, idList] of Object.entries(remove)) for (const id of idList) db[s].delete(id);
    },
    async replaceAll(snap) {
      if (adapter.failNext) {
        const err = adapter.failNext;
        adapter.failNext = null;
        throw err;
      }
      for (const s of STORE_NAMES) {
        db[s].clear();
        for (const r of snap[s] || []) db[s].set(r.id, structuredClone(r));
      }
      version = SCHEMA_VERSION;
    },
    async saveSafetyCopy(copy) {
      safety = structuredClone(copy);
    },
    async loadSafetyCopy() {
      return safety ? structuredClone(safety) : null;
    },
    async clear() {
      for (const s of STORE_NAMES) db[s].clear();
    },
  };
  return adapter;
}
