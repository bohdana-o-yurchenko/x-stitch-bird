import { beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import { blobToDataUrl, imageId } from "../blobs";
import type { RefWindowData, Snapshot } from "../ports";

/*
 * Stored data the user can't get back (SPEC §9.6, §11.4): reference windows, versions, images behind the chart and
 * the pictures themselves. Old records must still read, and nothing a record uses may ever be collected.
 */
function fakeStorage() {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k), data };
}

let storage: ReturnType<typeof fakeStorage>;
let refs: typeof import("./indexedDbRepositories");
let images: typeof import("./indexedDbImages");
let idb: typeof import("./indexedDb");

async function fresh(factory = new IDBFactory()) {
  vi.stubGlobal("indexedDB", factory);
  vi.stubGlobal("IDBKeyRange", IDBKeyRange);
  vi.resetModules();
  refs = await import("./indexedDbRepositories");
  images = await import("./indexedDbImages");
  idb = await import("./indexedDb");
}

beforeEach(async () => {
  vi.useRealTimers();
  storage = fakeStorage();
  vi.stubGlobal("localStorage", storage);
  await fresh();
});

const png = (n: number) => new Blob([new Uint8Array([137, 80, 78, 71, n, n + 1, n + 2])], { type: "image/png" });
const rect = { x: 0, y: 0, w: 4, h: 3 };
const window1 = (image: string, marks: string | null = null): RefWindowData => ({ image, marks, x: 10, y: 20, w: 300, h: 200 }) as unknown as RefWindowData;
const snap = (projectId: string, time: number): Snapshot => ({ projectId, time, reason: "manual", w: 5, h: 5, thumb: "", doc: {} }) as unknown as Snapshot;

describe("pictures in the image store", () => {
  it("stores a picture once, by what it contains, and gives it back", async () => {
    const a = await images.indexedDbImageRepository.put(png(1));
    expect(a).toBe(await imageId(png(1)));
    expect(await images.indexedDbImageRepository.put(png(1))).toBe(a);
    expect(await images.indexedDbImageRepository.put(png(2))).not.toBe(a);
    const back = await images.indexedDbImageRepository.get(a);
    expect(back && new Uint8Array(await back.arrayBuffer())).toEqual(new Uint8Array(await png(1).arrayBuffer()));
    expect(await images.indexedDbImageRepository.get("img:missing")).toBeNull();
  });

  it("data URLs from older storage move in; ids and nothing pass through", async () => {
    const url = await blobToDataUrl(png(3));
    const id = await images.storeIfDataUrl(url);
    expect(id).toBe(await imageId(png(3)));
    expect(await images.storeIfDataUrl(id)).toBe(id);
    expect(await images.storeIfDataUrl("")).toBeNull();
    expect(await images.storeIfDataUrl(null)).toBeNull();
    expect(await images.storeIfDataUrl(5)).toBeNull();
  });
});

describe("collecting pictures nothing uses", () => {
  const HOUR = 60 * 60_000;

  it("removes an old picture no record mentions, keeps every one a record uses, and keeps new ones whose record may be on its way", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(0);
    const inWindow = await images.indexedDbImageRepository.put(png(10));
    const inMarks = await images.indexedDbImageRepository.put(png(11));
    const inUnderlay = await images.indexedDbImageRepository.put(png(12));
    const inSource = await images.indexedDbImageRepository.put(png(13));
    const orphan = await images.indexedDbImageRepository.put(png(14));
    vi.setSystemTime(2 * HOUR);
    const fresh1 = await images.indexedDbImageRepository.put(png(15));

    await refs.indexedDbReferenceRepository.save("p1", [window1(inWindow, inMarks)]);
    await refs.indexedDbUnderlayRepository.save("p1", { image: inUnderlay, imageW: 100, imageH: 80, crop: { x: 0, y: 0, w: 100, h: 80 }, rect, opacity: 0.5, behind: false, visible: true, tool: "move", straighten: { source: inSource, sourceW: 100, sourceH: 80, corners: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }], cols: 4, rows: 3, at: { x: 0, y: 0 } } });

    await images.indexedDbImageRepository.collectGarbage();
    for (const id of [inWindow, inMarks, inUnderlay, inSource, fresh1]) expect(await images.indexedDbImageRepository.get(id), id).not.toBeNull();
    expect(await images.indexedDbImageRepository.get(orphan)).toBeNull();
  });

  it("a picture just under the grace period stays, one just over goes", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(0);
    const a = await images.indexedDbImageRepository.put(png(20));
    vi.setSystemTime(HOUR - 1);
    await images.indexedDbImageRepository.collectGarbage();
    expect(await images.indexedDbImageRepository.get(a)).not.toBeNull();
    vi.setSystemTime(HOUR + 1);
    await images.indexedDbImageRepository.collectGarbage();
    expect(await images.indexedDbImageRepository.get(a)).toBeNull();
  });

  it("a picture used by only one of two patterns stays until that one goes too", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(0);
    const shared = await images.indexedDbImageRepository.put(png(30));
    await refs.indexedDbReferenceRepository.save("a", [window1(shared)]);
    await refs.indexedDbReferenceRepository.save("b", [window1(shared)]);
    vi.setSystemTime(5 * HOUR);
    await refs.indexedDbReferenceRepository.save("a", []);
    await images.indexedDbImageRepository.collectGarbage();
    expect(await images.indexedDbImageRepository.get(shared)).not.toBeNull();
    await refs.indexedDbReferenceRepository.save("b", []);
    await images.indexedDbImageRepository.collectGarbage();
    expect(await images.indexedDbImageRepository.get(shared)).toBeNull();
  });
});

describe("reference windows", () => {
  it("saves and loads per pattern; an empty list clears the record", async () => {
    const id = await images.indexedDbImageRepository.put(png(40));
    expect(await refs.indexedDbReferenceRepository.save("p1", [window1(id)])).toEqual({ ok: true });
    expect(await refs.indexedDbReferenceRepository.load("p1")).toEqual([window1(id)]);
    expect(await refs.indexedDbReferenceRepository.load("p2")).toEqual([]);
    await refs.indexedDbReferenceRepository.save("p1", []);
    expect(await refs.indexedDbReferenceRepository.load("p1")).toEqual([]);
  });

  it("old windows kept as data URLs (`src`) move into the image store, once, and are saved that way", async () => {
    const url = await blobToDataUrl(png(41)), marks = await blobToDataUrl(png(42));
    await idb.run("refs", "readwrite", (s) => s.put([{ src: url, marks, x: 1, y: 2, w: 3, h: 4 }], "old"));
    const [w] = await refs.indexedDbReferenceRepository.load("old");
    expect(w!.image).toBe(await imageId(png(41)));
    expect(w!.marks).toBe(await imageId(png(42)));
    expect((w as unknown as { src?: string }).src).toBeUndefined();
    // stored in the new form now
    const stored = await idb.run<RefWindowData[]>("refs", "readonly", (s) => s.get("old"));
    expect(JSON.stringify(stored)).not.toContain("data:");
    expect(await images.indexedDbImageRepository.get(await imageId(png(41)))).not.toBeNull();
  });

  it("the very old localStorage copy is read once and removed", async () => {
    const url = await blobToDataUrl(png(43));
    storage.setItem("stitchwork.refs.legacy", JSON.stringify([{ src: url, x: 1, y: 2, w: 3, h: 4 }]));
    const loaded = await refs.indexedDbReferenceRepository.load("legacy");
    expect(loaded).toHaveLength(1);
    expect(storage.data.has("stitchwork.refs.legacy")).toBe(false);
    expect(await refs.indexedDbReferenceRepository.load("legacy")).toEqual(loaded);
  });

  it("a window without a picture is dropped, and unreadable old data gives none", async () => {
    await idb.run("refs", "readwrite", (s) => s.put([null, { x: 1, y: 2, w: 3, h: 4 }], "bad"));
    expect(await refs.indexedDbReferenceRepository.load("bad")).toEqual([]);
    storage.setItem("stitchwork.refs.junk", "{not json");
    expect(await refs.indexedDbReferenceRepository.load("junk")).toEqual([]);
  });
});

describe("images behind the chart", () => {
  const under = (image: string, source?: string) => ({
    image, imageW: 100, imageH: 80, crop: { x: 0, y: 0, w: 100, h: 80 }, rect, opacity: 0.5, behind: true, visible: true, tool: "move" as const,
    ...(source && { straighten: { source, sourceW: 100, sourceH: 80, corners: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }] as never, cols: 4, rows: 3, at: { x: 0, y: 0 } } }),
  });

  it("saves, loads and clears", async () => {
    const id = await images.indexedDbImageRepository.put(png(50));
    await refs.indexedDbUnderlayRepository.save("p1", under(id));
    expect(await refs.indexedDbUnderlayRepository.load("p1")).toMatchObject({ image: id, behind: true });
    await refs.indexedDbUnderlayRepository.save("p1", null);
    expect(await refs.indexedDbUnderlayRepository.load("p1")).toBeNull();
  });

  it("one stored with data URLs (picture and straighten source) moves into the image store", async () => {
    const a = await blobToDataUrl(png(51)), b = await blobToDataUrl(png(52));
    await idb.run("underlays", "readwrite", (s) => s.put(under(a, b), "old"));
    const u = await refs.indexedDbUnderlayRepository.load("old");
    expect(u!.image).toBe(await imageId(png(51)));
    expect(u!.straighten!.source).toBe(await imageId(png(52)));
    expect(JSON.stringify(await idb.run("underlays", "readonly", (s) => s.get("old")))).not.toContain("data:");
  });

  it("a damaged record reads as none instead of breaking the pattern", async () => {
    await idb.run("underlays", "readwrite", (s) => s.put({ image: 5 }, "bad"));
    expect(await refs.indexedDbUnderlayRepository.load("bad")).toBeNull();
  });
});

describe("versions", () => {
  it("lists a pattern's, newest first, without their files, and gets one in full", async () => {
    await refs.indexedDbSnapshotRepository.add(snap("a", 1));
    await refs.indexedDbSnapshotRepository.add(snap("a", 3));
    await refs.indexedDbSnapshotRepository.add(snap("a", 2));
    await refs.indexedDbSnapshotRepository.add(snap("b", 9));
    const list = await refs.indexedDbSnapshotRepository.list("a");
    expect(list.map((s) => s.time)).toEqual([3, 2, 1]);
    expect(list[0]).not.toHaveProperty("doc");
    expect((await refs.indexedDbSnapshotRepository.get("a", 2))?.time).toBe(2);
    expect(await refs.indexedDbSnapshotRepository.get("a", 99)).toBeNull();
  });

  it("removes only the ones named", async () => {
    for (const t of [1, 2, 3]) await refs.indexedDbSnapshotRepository.add(snap("a", t));
    await refs.indexedDbSnapshotRepository.add(snap("b", 2));
    await refs.indexedDbSnapshotRepository.removeMany([]);
    await refs.indexedDbSnapshotRepository.removeMany([["a", 2], ["a", 3]]);
    expect((await refs.indexedDbSnapshotRepository.list("a")).map((s) => s.time)).toEqual([1]);
    expect((await refs.indexedDbSnapshotRepository.list("b")).map((s) => s.time)).toEqual([2]);
  });
});

describe("opening a database made by an older version", () => {
  it("keeps what version 1 held (reference windows) and adds the stores since", async () => {
    const factory = new IDBFactory();
    await new Promise<void>((done, fail) => {
      const req = factory.open("stitchwork", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("refs");
      req.onsuccess = () => {
        const tx = req.result.transaction("refs", "readwrite");
        tx.objectStore("refs").put([{ image: "img:keep", marks: null, x: 1, y: 2, w: 3, h: 4 }], "p1");
        tx.oncomplete = () => (req.result.close(), done());
        tx.onerror = () => fail(tx.error);
      };
    });
    await fresh(factory);
    expect(await refs.indexedDbReferenceRepository.load("p1")).toEqual([{ image: "img:keep", marks: null, x: 1, y: 2, w: 3, h: 4 }]);
    const db = await idb.openDb();
    expect([...db.objectStoreNames].sort()).toEqual(["drafts", "images", "patternMeta", "patterns", "refs", "snaps", "underlays"]);
    expect(db.version).toBe(5);
  });
});
