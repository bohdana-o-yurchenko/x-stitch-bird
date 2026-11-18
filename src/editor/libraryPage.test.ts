import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { serializePattern, type PatternFile } from "@/core/formats/json/serialize";
import { createPattern } from "@/core/pattern/createPattern";
import { addEntry } from "@/core/pattern/keyEntries";
import { ALL_SYMBOLS } from "@/core/symbols/symbols";
import { account } from "@/persistence";
import type { PatternSummary, Persistence, RefWindowData, Snapshot } from "@/persistence/ports";
import { memoryPersistence } from "../../tests/support/memoryPersistence";

const downloaded = vi.hoisted(() => ({ calls: [] as [string, string | Blob][] }));
vi.mock("@/platform/files", async (orig) => ({ ...(await orig<typeof import("@/platform/files")>()), downloadFile: (n: string, d: string | Blob) => void downloaded.calls.push([n, d]) }));

const { createLibrary } = await import("./library");

/*
 * The My patterns page's actions on one pattern (SPEC §15.37, §15.38): each must act on the right pattern, keep what
 * the user has (photos, versions) and never leave an account's pattern behind in this browser after deleting it.
 */
interface World {
  files: Map<string, PatternFile>;
  where: Map<string, PatternSummary["where"]>;
  refs: Map<string, RefWindowData[]>;
  under: Map<string, unknown>;
  blobs: Map<string, Blob>;
  snaps: Snapshot[];
  draft: PatternFile | null;
  cleared: number;
  p: Persistence;
}

function world(): World {
  const w = { files: new Map(), where: new Map(), refs: new Map(), under: new Map(), blobs: new Map(), snaps: [] as Snapshot[], draft: null as PatternFile | null, cleared: 0 } as World;
  const base = memoryPersistence(w.snaps);
  w.p = {
    ...base,
    patterns: {
      list: async () => [...w.files.values()].map((d) => ({ id: d.id, name: d.name, w: d.w, h: d.h, updatedAt: 1, where: w.where.get(d.id) ?? "browser" })),
      load: async (id) => w.files.get(id) ?? null,
      save: async (d) => (w.files.set(d.id, d), { ok: true }),
      remove: async (id) => void w.files.delete(id),
    },
    references: { load: async (id) => w.refs.get(id) ?? [], save: async (id, r) => (w.refs.set(id, r), { ok: true }) },
    underlays: { load: async (id) => (w.under.get(id) as never) ?? null, save: async (id, u) => (u ? w.under.set(id, u) : w.under.delete(id), { ok: true }) },
    draft: { load: async () => w.draft, save: (d) => void (w.draft = d), clear: async () => void (w.cleared++, (w.draft = null)) },
    images: { put: async () => `img:${w.blobs.size}`, get: async (id) => w.blobs.get(id) ?? null, collectGarbage: async () => {} },
  };
  return w;
}

const add = (w: World, name: string, where: PatternSummary["where"] = "browser") => {
  const p = createPattern(5, 5, name);
  const k = addEntry(p, { t: "thread", src: "dmc:310", n: 2, st: "full" }, ALL_SYMBOLS);
  p.layers.stitches[0] = k;
  const doc = serializePattern(p);
  w.files.set(doc.id, doc);
  w.where.set(doc.id, where);
  return { doc, summary: { id: doc.id, name, w: 5, h: 5, updatedAt: 1, where } as PatternSummary };
};
const ref = (id: string, image: string, marks: string | null = null): RefWindowData => ({ id, name: `Photo ${id}`, image, x: 0, y: 0, w: 300, h: 200, min: false, op: 1, view: null, tool: "pan", color: "#000", size: 4, grid: false, showSt: false, marks });

beforeEach(() => {
  downloaded.calls = [];
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {} });
});
afterEach(() => {
  vi.unstubAllGlobals();
  account.signedIn = false;
});

describe("deleting the account, here", () => {
  it("only after the account says it is deleted: the account's patterns leave this browser, the ones only here stay", async () => {
    const w = world();
    const mine = add(w, "Only here");
    add(w, "In account", "account");
    add(w, "Both", "both");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 204 })));
    const lib = createLibrary(w.p);
    expect(await lib.deleteAccount("me@example.com")).toBe(true);
    expect([...w.files.keys()]).toEqual([mine.doc.id]);
    expect(JSON.parse((vi.mocked(fetch).mock.calls[0]![1] as RequestInit).body as string)).toEqual({ email: "me@example.com" });
  });

  it("when the account isn't deleted (wrong email, offline), nothing is touched here", async () => {
    const w = world();
    add(w, "In account", "account");
    add(w, "Only here");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "x" }), { status: 400 })));
    expect(await createLibrary(w.p).deleteAccount("wrong@example.com")).toBe(false);
    expect(w.files.size).toBe(2);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    expect(await createLibrary(w.p).deleteAccount("me@example.com")).toBe(false);
    expect(w.files.size).toBe(2);
  });

  it("the draft goes with it when it is an account's pattern, and stays when it is only here", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 204 })));
    const w = world();
    const theirs = add(w, "In account", "account");
    w.draft = theirs.doc;
    await createLibrary(w.p).deleteAccount("a@b.c");
    expect(w.cleared).toBe(1);
    const w2 = world();
    w2.draft = add(w2, "Only here").doc;
    await createLibrary(w2.p).deleteAccount("a@b.c");
    expect(w2.cleared).toBe(0);
  });

  it("signing in state is dropped after the account is gone", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 204 })));
    account.signedIn = true;
    await createLibrary(world().p).deleteAccount("a@b.c");
    expect(account.signedIn).toBe(false);
  });
});

describe("deleting, renaming and copying a pattern", () => {
  it("deleting the pattern last worked on also clears the draft, another doesn't", async () => {
    const w = world();
    const a = add(w, "A"), b = add(w, "B");
    w.draft = a.doc;
    const lib = createLibrary(w.p);
    await lib.remove(b.doc.id);
    expect(w.cleared).toBe(0);
    await lib.remove(a.doc.id);
    expect(w.cleared).toBe(1);
    expect(w.files.size).toBe(0);
  });

  it("renaming: a blank name does nothing; otherwise the saved file and the draft both carry it", async () => {
    const w = world();
    const a = add(w, "A");
    w.draft = a.doc;
    const lib = createLibrary(w.p);
    expect(await lib.rename(a.summary, "   ")).toBe(false);
    expect(await lib.rename(a.summary, "  New name ")).toBe(true);
    expect(w.files.get(a.doc.id)!.name).toBe("New name");
    expect(w.draft!.name).toBe("New name");
    expect(await lib.rename({ ...a.summary, id: "gone" }, "X")).toBe(false);
  });

  it("the draft (the newest state) wins over the saved file when both exist", async () => {
    const w = world();
    const a = add(w, "A");
    w.draft = { ...a.doc, name: "Newest" };
    const lib = createLibrary(w.p);
    expect((await lib.duplicate(a.summary, "Newest (copy)"))).not.toBeNull();
    const copy = [...w.files.values()].find((d) => d.name === "Newest (copy)")!;
    expect(copy.s).toEqual(a.doc.s);
  });

  it("a copy is a new pattern with its photos shared and no versions; the original is untouched", async () => {
    const w = world();
    const a = add(w, "A");
    w.refs.set(a.doc.id, [ref("r1", "img:1", "img:2")]);
    w.snaps.push({ projectId: a.doc.id, time: 1, reason: "timer", w: 5, h: 5, data: "{}", thumb: null });
    const lib = createLibrary(w.p);
    const r = await lib.duplicate(a.summary, "A (copy)");
    expect(r).toEqual({ id: expect.any(String) });
    expect(r!.id).not.toBe(a.doc.id);
    expect(w.files.get(r!.id)).toMatchObject({ name: "A (copy)", w: 5 });
    expect(w.refs.get(r!.id)).toEqual(w.refs.get(a.doc.id));
    expect(w.snaps.filter((s) => s.projectId === r!.id)).toHaveLength(0);
    expect(w.files.get(a.doc.id)!.name).toBe("A");
    expect(await lib.duplicate({ ...a.summary, id: "gone" }, "x")).toBeNull();
  });

  it("a copy the account had no room for is reported, and is still made here", async () => {
    const w = world();
    const a = add(w, "A");
    w.p.patterns.save = async (d) => (w.files.set(d.id, d), { ok: true, limit: 20 });
    expect(await createLibrary(w.p).duplicate(a.summary, "A (copy)")).toEqual({ id: expect.any(String), limit: 20 });
  });
});

describe("photos of a pattern", () => {
  const under = (image: string, source?: string) => ({ image, imageW: 10, imageH: 10, crop: { x: 0, y: 0, w: 10, h: 10 }, rect: { x: 0, y: 0, w: 5, h: 5 }, opacity: 0.5, behind: true, visible: true, tool: "move", ...(source && { straighten: { source } }) });

  beforeEach(() => {
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:x" }));
  });

  it("lists windows and the image behind the chart with their sizes, each picture counted once", async () => {
    const w = world();
    const a = add(w, "A");
    w.blobs.set("img:1", new Blob([new Uint8Array(100)]));
    w.blobs.set("img:2", new Blob([new Uint8Array(30)]));
    w.blobs.set("img:3", new Blob([new Uint8Array(500)]));
    w.refs.set(a.doc.id, [ref("r1", "img:1", "img:2"), ref("r2", "img:1")]);
    w.under.set(a.doc.id, under("img:3", "img:3"));
    const list = await createLibrary(w.p).photos(a.summary);
    expect(list.map((p) => [p.key, p.kind, p.bytes])).toEqual([["r1", "window", 130], ["r2", "window", 100], ["underlay", "underlay", 500]]);
  });

  it("takes the named photos off and leaves the rest", async () => {
    const w = world();
    const a = add(w, "A");
    w.refs.set(a.doc.id, [ref("r1", "img:1"), ref("r2", "img:2")]);
    w.under.set(a.doc.id, under("img:3"));
    const lib = createLibrary(w.p);
    await lib.removePhotos(a.summary, ["r1"]);
    expect(w.refs.get(a.doc.id)!.map((r) => r.id)).toEqual(["r2"]);
    expect(w.under.has(a.doc.id)).toBe(true);
    await lib.removePhotos(a.summary, ["underlay", "r2"]);
    expect(w.refs.get(a.doc.id)).toEqual([]);
    expect(w.under.has(a.doc.id)).toBe(false);
  });
});

describe("Download .xbird from the list", () => {
  it("holds the pattern, its photo windows and its versions, and is named after the pattern", async () => {
    const w = world();
    const a = add(w, "My bird");
    w.blobs.set("img:1", new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" }));
    w.refs.set(a.doc.id, [ref("r1", "img:1")]);
    w.snaps.push({ projectId: a.doc.id, time: 5, reason: "timer", w: 5, h: 5, data: JSON.stringify(a.doc), thumb: null });
    expect(await createLibrary(w.p).downloadXbird(a.summary)).toBe(true);
    const [name, blob] = downloaded.calls[0]!;
    expect(name).toBe("My-bird.xbird");
    const file = JSON.parse(await (blob as Blob).text()) as PatternFile;
    expect(file).toMatchObject({ app: "stitchwork", id: a.doc.id, xbird: 1 });
    expect(file.refs).toHaveLength(1);
    expect(JSON.stringify(file.refs)).toContain("data:image/png");
    expect(file.versions!.map((v) => v.time)).toEqual([5]);
  });

  it("without versions or photos, the file has none, and a pattern that is gone gives false", async () => {
    const w = world();
    const a = add(w, "Plain");
    const lib = createLibrary(w.p);
    await lib.downloadXbird(a.summary);
    const file = JSON.parse(await (downloaded.calls[0]![1] as Blob).text()) as PatternFile;
    expect(file).not.toHaveProperty("versions");
    expect(file.refs).toEqual([]);
    expect(await lib.downloadXbird({ ...a.summary, id: "gone" })).toBe(false);
  });

  it("signed in, the account's versions this browser hasn't got are in the file too", async () => {
    const w = world();
    const a = add(w, "Plain");
    w.snaps.push({ projectId: a.doc.id, time: 5, reason: "local", w: 5, h: 5, data: JSON.stringify(a.doc), thumb: null });
    account.signedIn = true;
    vi.stubGlobal("fetch", vi.fn(async (url: string) =>
      new Response(JSON.stringify(url.includes("?times=") ? [{ time: 3, reason: "remote", doc: a.doc }] : [{ time: 5, reason: "local" }, { time: 3, reason: "remote" }]), { status: 200 })));
    await createLibrary(w.p).downloadXbird(a.summary);
    const file = JSON.parse(await (downloaded.calls[0]![1] as Blob).text()) as PatternFile;
    expect(file.versions!.map((v) => [v.time, v.reason])).toEqual([[3, "remote"], [5, "local"]]);
  });
});

describe("what the list shows about a pattern", () => {
  it("figures worked out from this browser's copy, with its photos and versions", async () => {
    const w = world();
    const a = add(w, "A");
    w.snaps.push({ projectId: a.doc.id, time: 1, reason: "t", w: 5, h: 5, data: "{}", thumb: null });
    const d = await createLibrary(w.p).details(a.summary);
    expect(d).toMatchObject({ colours: 1, stitches: 1, versions: 1, photos: { count: 0, bytes: 0 } });
    expect(d!.bytes).toBeGreaterThan(100);
  });

  it("a pattern only in the account keeps the account's figures; an unknown one has none", async () => {
    const w = world();
    const a = add(w, "A", "account");
    const theirs = { colours: 9, stitches: 99, beads: 0, backstitch: 0, count: 14, spent: 0, bytes: 1, photos: { count: 2, bytes: 3 }, versions: 4 };
    expect(await createLibrary(w.p).details({ ...a.summary, details: theirs })).toEqual(theirs);
    expect(await createLibrary(w.p).details({ ...a.summary, id: "gone", where: "browser" })).toBeNull();
  });

  it("the pattern last worked on is offered to continue with; a damaged draft is not", async () => {
    const w = world();
    const a = add(w, "Work");
    w.draft = a.doc;
    const lib = createLibrary(w.p);
    expect(await lib.current()).toMatchObject({ id: a.doc.id, name: "Work", w: 5, h: 5 });
    w.draft = { ...a.doc, xbird: 99 } as PatternFile;
    expect(await lib.current()).toBeNull();
    w.draft = null;
    expect(await lib.current()).toBeNull();
  });
});
