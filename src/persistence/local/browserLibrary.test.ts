import { beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import { createPattern } from "@/core/pattern/createPattern";
import { serializePattern, type PatternFile } from "@/core/formats/json/serialize";
import { addEntry } from "@/core/pattern/keyEntries";
import { ALL_SYMBOLS } from "@/core/symbols/symbols";
import { blobToDataUrl, dataUrlToBlob, imageId, isDataUrl } from "../blobs";

/** The browser's localStorage, in memory; `limit` makes bigger writes fail like a full disk. */
function fakeStorage() {
  const data = new Map<string, string>();
  const storage = {
    limit: Infinity,
    getItem: (k: string) => data.get(k) ?? null,
    setItem(k: string, v: string) {
      if (v.length > storage.limit) throw new DOMException("full", "QuotaExceededError");
      data.set(k, v);
    },
    removeItem: (k: string) => void data.delete(k),
    data,
  };
  return storage;
}

let storage: ReturnType<typeof fakeStorage>;
let lib: typeof import("./browserLibrary");
const doc = (name: string) => serializePattern(createPattern(5, 4, name));
/** A big, busy pattern: 300 × 300 of 20 colours in no order — far too big for the fake localStorage. */
function bigDoc(name: string) {
  const p = createPattern(300, 300, name);
  for (let i = 0; i < 20; i++) addEntry(p, { t: "thread", src: `dmc:${150 + i}`, n: 2, st: "full" }, ALL_SYMBOLS);
  let s = 3;
  for (let i = 0; i < p.w * p.h; i++) p.layers.stitches[i] = 1 + ((s = (s * 16807) % 2147483647) % 20);
  return serializePattern(p);
}

beforeEach(async () => {
  storage = fakeStorage();
  vi.stubGlobal("localStorage", storage);
  // a fresh, empty IndexedDB, and the modules that keep it open
  vi.stubGlobal("indexedDB", new IDBFactory());
  vi.stubGlobal("IDBKeyRange", IDBKeyRange);
  vi.resetModules();
  lib = await import("./browserLibrary");
});

describe("saved patterns in IndexedDB (SPEC §9.1)", () => {
  it("saves, lists newest first (without loading the patterns), loads and removes", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const a = doc("First"), b = doc("Second");
    vi.setSystemTime(1_000);
    expect(await lib.indexedDbPatternRepository.save(a)).toEqual({ ok: true });
    vi.setSystemTime(2_000);
    await lib.indexedDbPatternRepository.save({ ...b, meta: { designer: "A. Designer" } });
    vi.useRealTimers();
    expect(await lib.indexedDbPatternRepository.list()).toEqual([
      { id: b.id, name: "Second", w: 5, h: 4, updatedAt: 2_000, designer: "A. Designer" },
      { id: a.id, name: "First", w: 5, h: 4, updatedAt: 1_000 },
    ]);
    expect(await lib.indexedDbPatternRepository.load(a.id)).toEqual(a);
    expect(await lib.indexedDbPatternRepository.load("nope")).toBeNull();
    await lib.indexedDbPatternRepository.remove(a.id);
    expect((await lib.indexedDbPatternRepository.list()).map((p) => p.name)).toEqual(["Second"]);
    // nothing in localStorage: no ~5 MB limit
    expect(storage.data.has("stitchwork.library")).toBe(false);
  });

  it("moves patterns saved by earlier versions in once, keeping the old copy as a backup (a deleted one leaves it)", async () => {
    const old = doc("From before"), gone = doc("Deleted later");
    const entry = (d: PatternFile, updated: number) => ({ name: d.name, updated, w: d.w, h: d.h, data: JSON.stringify(d) });
    storage.data.set("stitchwork.library", JSON.stringify({ [old.id]: entry(old, 500), [gone.id]: entry(gone, 400) }));
    expect((await lib.indexedDbPatternRepository.list()).map((p) => [p.name, p.updatedAt])).toEqual([["From before", 500], ["Deleted later", 400]]);
    expect(await lib.indexedDbPatternRepository.load(old.id)).toEqual(old);
    // the old copy is untouched, and the move isn't repeated
    expect(Object.keys(JSON.parse(storage.data.get("stitchwork.library")!))).toEqual([old.id, gone.id]);
    expect(storage.data.has("stitchwork.libraryMoved")).toBe(true);
    await lib.indexedDbPatternRepository.remove(gone.id);
    expect(Object.keys(JSON.parse(storage.data.get("stitchwork.library")!))).toEqual([old.id]);
    expect((await lib.indexedDbPatternRepository.list()).map((p) => p.name)).toEqual(["From before"]);
  });

  it("keeps a pattern far bigger than localStorage could hold", async () => {
    storage.limit = 50_000;
    const big = bigDoc("Big");
    expect(JSON.stringify(big).length).toBeGreaterThan(storage.limit);
    expect(await lib.indexedDbPatternRepository.save(big)).toEqual({ ok: true });
    expect((await lib.indexedDbPatternRepository.load(big.id))?.w).toBe(300);
  });
});

describe("the working draft", () => {
  it("is kept between visits; one too big for localStorage lives in IndexedDB only", async () => {
    expect(await lib.indexedDbDraftStore.load()).toBeNull();
    const d = doc("Draft");
    lib.indexedDbDraftStore.save(d);
    await new Promise((r) => setTimeout(r, 20));
    expect(await lib.indexedDbDraftStore.load()).toEqual(d);
    expect(storage.data.has("stitchwork.current")).toBe(true);
    storage.limit = 50_000;
    const big = bigDoc("Big draft");
    lib.indexedDbDraftStore.save(big);
    await new Promise((r) => setTimeout(r, 20));
    // the small stale copy is gone, so the big one is what comes back
    expect(storage.data.has("stitchwork.current")).toBe(false);
    expect((await lib.indexedDbDraftStore.load())?.name).toBe("Big draft");
  });

  it("reads a draft written by an earlier version, and prefers whichever copy is newer", async () => {
    const before = doc("Draft from before");
    storage.data.set("stitchwork.current", JSON.stringify(before));
    expect(await lib.indexedDbDraftStore.load()).toEqual(before);
    lib.indexedDbDraftStore.save(doc("Newer"));
    await new Promise((r) => setTimeout(r, 20));
    expect((await lib.indexedDbDraftStore.load())?.name).toBe("Newer");
    storage.data.set("stitchwork.current", "{not json");
    expect((await lib.indexedDbDraftStore.load())?.name).toBe("Newer");
  });
});

describe("pictures as data URLs and blobs", () => {
  it("converts both ways and names a picture by its content", async () => {
    const url = "data:image/png;base64,iVBORw0KGgo=";
    const blob = dataUrlToBlob(url);
    expect([blob.type, blob.size]).toEqual(["image/png", 8]);
    expect(await blobToDataUrl(blob)).toBe(url);
    expect(await imageId(blob)).toBe(await imageId(dataUrlToBlob(url)));
    expect(await imageId(blob)).toMatch(/^img:[0-9a-f]{32}$/);
    expect(await imageId(new Blob(["other"]))).not.toBe(await imageId(blob));
  });

  it("reads plain (not base64) data URLs and tells data URLs from ids", async () => {
    const blob = dataUrlToBlob("data:text/plain,hello%20there");
    expect(await blob.text()).toBe("hello there");
    expect(await blobToDataUrl(new Blob(["x"]))).toBe("data:application/octet-stream;base64,eA==");
    expect([isDataUrl("data:image/png;base64,AA"), isDataUrl("img:abc"), isDataUrl(null)]).toEqual([true, false, false]);
  });
});
