import type { ImageRepository } from "../ports";
import { dataUrlToBlob, imageId, isDataUrl } from "../blobs";
import { run } from "./indexedDb";

interface StoredImage {
  blob: Blob;
  created: number;
}

/** Pictures saved within this window are never collected: their record may not be saved yet. */
const GRACE_MS = 60 * 60_000;

export const indexedDbImageRepository: ImageRepository = {
  async put(blob) {
    const id = await imageId(blob);
    const existing = await run<StoredImage>("images", "readonly", (s) => s.get(id));
    if (!existing) await run("images", "readwrite", (s) => s.put({ blob, created: Date.now() } satisfies StoredImage, id));
    return id;
  },
  async get(id) {
    return (await run<StoredImage>("images", "readonly", (s) => s.get(id)).catch(() => undefined))?.blob ?? null;
  },
  async collectGarbage() {
    const used = new Set<string>();
    for (const store of ["refs", "underlays"] as const) {
      const all = (await run<unknown[]>(store, "readonly", (s) => s.getAll())) ?? [];
      collectIds(all, used);
    }
    const keys = ((await run<IDBValidKey[]>("images", "readonly", (s) => s.getAllKeys())) ?? []) as string[];
    const now = Date.now();
    for (const id of keys) {
      if (used.has(id)) continue;
      const img = await run<StoredImage>("images", "readonly", (s) => s.get(id));
      if (img && now - img.created > GRACE_MS) await run("images", "readwrite", (s) => s.delete(id));
    }
  },
};

/** Every image id mentioned anywhere in stored records (strings starting with "img:"). */
function collectIds(v: unknown, into: Set<string>) {
  if (typeof v === "string") {
    if (v.startsWith("img:")) into.add(v);
  } else if (Array.isArray(v)) v.forEach((x) => collectIds(x, into));
  else if (v && typeof v === "object") Object.values(v).forEach((x) => collectIds(x, into));
}

/** A data URL from older storage, moved into the image store; ids and nulls pass through. */
export async function storeIfDataUrl(v: unknown): Promise<string | null> {
  if (isDataUrl(v)) return indexedDbImageRepository.put(dataUrlToBlob(v));
  return typeof v === "string" && v ? v : null;
}
