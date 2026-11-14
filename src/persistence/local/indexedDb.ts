/**
 * The "stitchwork" IndexedDB database: v1 had "refs"; v2 adds "snaps" (SPEC §15.7); v3 adds "underlays" (§15.15);
 * v4 adds "images" (pictures as Blobs, referred to by id).
 */
export const DB_NAME = "stitchwork";
const DB_VERSION = 4;
const STORES = ["refs", "snaps", "underlays", "images"] as const;
export type StoreName = (typeof STORES)[number];

let opening: Promise<IDBDatabase> | null = null;

export function openDb(): Promise<IDBDatabase> {
  opening ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of STORES) if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      opening = null;
      reject(req.error);
    };
  });
  return opening;
}

/** Run one request in a transaction and resolve when the transaction completes. */
export async function run<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => { readonly result: unknown } | void): Promise<T | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(req ? (req.result as T) : undefined);
    tx.onerror = tx.onabort = () => reject(tx.error);
  });
}
