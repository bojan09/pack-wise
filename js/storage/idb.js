// IndexedDB storage adapter. Browser-local only; nothing leaves the device.
import { SCHEMA_VERSION } from '../models.js';
import { STORE_NAMES } from './memory.js';

const DB_NAME = 'packwise';
const DB_VERSION = 1; // IndexedDB structure version (distinct from the data SCHEMA_VERSION)

function openDb() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) {
      reject(new Error('IndexedDB is not available'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of STORE_NAMES) {
        if (db.objectStoreNames.contains(name)) continue;
        const store = db.createObjectStore(name, { keyPath: 'id' });
        if (name !== 'trips' && name !== 'templates') store.createIndex('tripId', 'tripId');
      }
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Database is blocked by another tab'));
  });
}

function transact(db, names, mode, work) {
  return new Promise((resolve, reject) => {
    let result;
    const tx = db.transaction(names, mode);
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
    result = work(tx);
  });
}

const requestToPromise = (req) =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

export async function createIdbAdapter() {
  const db = await openDb();
  db.onversionchange = () => db.close();

  return {
    kind: 'indexeddb',

    async load() {
      const names = [...STORE_NAMES, 'meta'];
      const reads = await transact(db, names, 'readonly', (tx) =>
        Object.fromEntries(names.map((n) => [n, requestToPromise(tx.objectStore(n).getAll())])),
      );
      const snap = {};
      for (const n of STORE_NAMES) snap[n] = await reads[n];
      const meta = await reads.meta;
      const stored = meta.find((m) => m.key === 'schemaVersion')?.value;
      const empty = STORE_NAMES.every((n) => snap[n].length === 0);
      snap.schemaVersion = Number.isInteger(stored) ? stored : empty ? SCHEMA_VERSION : 0;
      return snap;
    },

    /** Atomic multi-store write: all puts and removes land together or not at all. */
    async commit({ put = {}, remove = {} }) {
      const names = [...new Set([...Object.keys(put), ...Object.keys(remove)])].filter((n) => STORE_NAMES.includes(n));
      if (!names.length) return;
      await transact(db, [...names, 'meta'], 'readwrite', (tx) => {
        for (const [s, recs] of Object.entries(put)) for (const r of recs) tx.objectStore(s).put(r);
        for (const [s, ids] of Object.entries(remove)) for (const id of ids) tx.objectStore(s).delete(id);
        tx.objectStore('meta').put({ key: 'schemaVersion', value: SCHEMA_VERSION });
      });
    },

    async replaceAll(snap) {
      await transact(db, [...STORE_NAMES, 'meta'], 'readwrite', (tx) => {
        for (const s of STORE_NAMES) {
          const store = tx.objectStore(s);
          store.clear();
          for (const r of snap[s] || []) store.put(r);
        }
        tx.objectStore('meta').put({ key: 'schemaVersion', value: SCHEMA_VERSION });
      });
    },

    async saveSafetyCopy(copy) {
      await transact(db, ['meta'], 'readwrite', (tx) => {
        tx.objectStore('meta').put({ key: 'safetyCopy', value: copy });
      });
    },

    async loadSafetyCopy() {
      const rows = await transact(db, ['meta'], 'readonly', (tx) => requestToPromise(tx.objectStore('meta').get('safetyCopy')));
      return rows?.value ?? null;
    },

    async clear() {
      await transact(db, [...STORE_NAMES, 'meta'], 'readwrite', (tx) => {
        for (const s of STORE_NAMES) tx.objectStore(s).clear();
        tx.objectStore('meta').put({ key: 'schemaVersion', value: SCHEMA_VERSION });
      });
    },
  };
}

/** Translate low-level storage failures into messages a traveler can act on. */
export function describeStorageError(err) {
  const name = err?.name || '';
  if (name === 'QuotaExceededError') {
    return 'Your device storage is full, so your latest change could not be saved. Export a backup and free up space.';
  }
  if (name === 'InvalidStateError' || name === 'SecurityError') {
    return 'Your browser is blocking local storage (private mode?). Changes will not be kept after you close the app.';
  }
  return 'Your latest change could not be saved. Export a backup to be safe.';
}
