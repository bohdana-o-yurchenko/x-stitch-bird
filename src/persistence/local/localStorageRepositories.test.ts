import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPattern } from "@/core/pattern/createPattern";
import { serializePattern } from "@/core/formats/json/serialize";
import { blobToDataUrl, dataUrlToBlob, imageId, isDataUrl } from "../blobs";
import { localDraftStore, localPatternRepository } from "./localStorageRepositories";

/** The browser's localStorage, in memory; `full` makes writes fail like a full disk. */
function fakeStorage() {
  const data = new Map<string, string>();
  const storage = {
    full: false,
    getItem: (k: string) => data.get(k) ?? null,
    setItem(k: string, v: string) {
      if (storage.full) throw new DOMException("full", "QuotaExceededError");
      data.set(k, v);
    },
    removeItem: (k: string) => void data.delete(k),
    data,
  };
  return storage;
}

let storage: ReturnType<typeof fakeStorage>;
const doc = (name: string) => serializePattern(createPattern(5, 4, name));

beforeEach(() => {
  storage = fakeStorage();
  vi.stubGlobal("localStorage", storage);
});

describe("saved patterns in localStorage (SPEC §9.1)", () => {
  it("saves, lists newest first, loads and removes", async () => {
    vi.useFakeTimers();
    const a = doc("First"), b = doc("Second");
    vi.setSystemTime(1_000);
    expect(await localPatternRepository.save(a)).toEqual({ ok: true });
    vi.setSystemTime(2_000);
    await localPatternRepository.save({ ...b, meta: { designer: "A. Designer" } });
    vi.useRealTimers();
    expect(await localPatternRepository.list()).toEqual([
      { id: b.id, name: "Second", w: 5, h: 4, updatedAt: 2_000, designer: "A. Designer" },
      { id: a.id, name: "First", w: 5, h: 4, updatedAt: 1_000, designer: undefined },
    ]);
    expect(await localPatternRepository.load(a.id)).toEqual(a);
    expect(await localPatternRepository.load("nope")).toBeNull();
    await localPatternRepository.remove(a.id);
    expect((await localPatternRepository.list()).map((p) => p.name)).toEqual(["Second"]);
  });

  it("uses the keys of the single-file app, so earlier work shows up", async () => {
    await localPatternRepository.save(doc("Old friend"));
    expect([...storage.data.keys()]).toEqual(["stitchwork.library"]);
    localDraftStore.save(doc("Draft"));
    expect(storage.data.has("stitchwork.current")).toBe(true);
  });

  it("reports a full disk instead of throwing, and survives broken stored data", async () => {
    storage.full = true;
    expect(await localPatternRepository.save(doc("Big"))).toEqual({ ok: false, reason: "quota" });
    await localPatternRepository.remove("anything"); // must not throw
    localDraftStore.save(doc("Draft")); // must not throw
    storage.full = false;
    storage.data.set("stitchwork.library", "{not json");
    storage.data.set("stitchwork.current", "{not json");
    expect(await localPatternRepository.list()).toEqual([]);
    expect(localDraftStore.load()).toBeNull();
  });

  it("keeps the working draft between visits", () => {
    expect(localDraftStore.load()).toBeNull();
    const d = doc("Draft");
    localDraftStore.save(d);
    expect(localDraftStore.load()).toEqual(d);
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
