/** The "stitchwork" IndexedDB database: v1 had "refs"; v2 adds "snaps" (SPEC §15.7). */
export const DB_NAME = "stitchwork";
const DB_VERSION = 2;

let opening: Promise<IDBDatabase> | null = null;

export function openDb(): Promise<IDBDatabase> {
  opening ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("refs")) db.createObjectStore("refs");
      if (!db.objectStoreNames.contains("snaps")) db.createObjectStore("snaps");
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
export async function run<T>(store: "refs" | "snaps", mode: IDBTransactionMode, fn: (s: IDBObjectStore) => { readonly result: unknown } | void): Promise<T | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(req ? (req.result as T) : undefined);
    tx.onerror = tx.onabort = () => reject(tx.error);
  });
}
