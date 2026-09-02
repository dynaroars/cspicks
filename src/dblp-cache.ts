// A small IndexedDB store for DBLP profile lookups.
//
// DBLP rate-limits hard, so each profile costs two serialized requests and
// roughly three seconds. A coauthor list changes on the order of months, so
// keeping it across reloads is worth far more than keeping it fresh to the
// minute. Every operation degrades to a miss rather than throwing: private
// browsing, disabled storage, and Node (where the test suite imports this
// module) all leave `indexedDB` unusable, and none of them should break a
// lookup that can simply go to the network.

const DB_NAME = 'cspicks';
const STORE = 'dblp-coauthors';
const DB_VERSION = 1;
const TTL_MS = 30 * 24 * 60 * 60 * 1000;

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  const idb = globalThis.indexedDB;
  if (!idb) return (dbPromise = Promise.resolve(null));

  dbPromise = new Promise<IDBDatabase | null>(resolve => {
    let request;
    try {
      request = idb.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  }).catch(() => null);

  return dbPromise;
}

function transact<T>(db: IDBDatabase, mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T> | null): Promise<T | null> {
  return new Promise<T | null>(resolve => {
    let store;
    try {
      store = db.transaction(STORE, mode).objectStore(STORE);
    } catch {
      resolve(null);
      return;
    }
    const request = run(store);
    if (!request) {
      resolve(null);
      return;
    }
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => resolve(null);
  });
}

/** Cached value for `key`, or null when absent, expired, or unavailable. */
export async function readCached<T>(key: string): Promise<T | null> {
  const db = await openDb();
  if (!db) return null;
  const entry = await transact<{ value: T, storedAt: number }>(db, 'readonly', store => store.get(key));
  if (!entry || typeof entry.storedAt !== 'number') return null;
  if (Date.now() - entry.storedAt > TTL_MS) {
    // Expired entries are dropped on read; there is no separate sweep.
    await transact(db, 'readwrite', store => store.delete(key));
    return null;
  }
  return entry.value ?? null;
}

export async function writeCached(key: string, value: unknown) {
  const db = await openDb();
  if (!db) return;
  await transact(db, 'readwrite', store => store.put({ value, storedAt: Date.now() }, key));
}
