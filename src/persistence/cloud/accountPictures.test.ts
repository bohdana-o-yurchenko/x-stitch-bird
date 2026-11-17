import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UnderlayData } from "@/core/underlay/underlay";
import { imageId } from "../blobs";
import type { ImageRepository, RefWindowData } from "../ports";
import { account } from "./accountPatterns";
import { accountPictures, mergePictures } from "./accountPictures";

const win = (id: string, image: string, marks: string | null = null) => ({ id, name: id, image, marks }) as RefWindowData;

/** This browser: windows, underlays and pictures in memory. */
function browser() {
  const refs = new Map<string, RefWindowData[]>(), underlays = new Map<string, UnderlayData | null>(), images = new Map<string, Blob>();
  const repo: ImageRepository = {
    put: async (b) => {
      const id = await imageId(b);
      images.set(id, b);
      return id;
    },
    get: async (id) => images.get(id) ?? null,
    collectGarbage: async () => {},
  };
  const local = {
    references: { load: async (id: string) => refs.get(id) ?? [], save: async (id: string, r: RefWindowData[]) => (refs.set(id, r), { ok: true as const }) },
    underlays: { load: async (id: string) => underlays.get(id) ?? null, save: async (id: string, u: UnderlayData | null) => (underlays.set(id, u), { ok: true as const }) },
    images: repo,
  };
  return { refs, underlays, images, local };
}

/** The account: its records per pattern, its pictures, and the storage the browser uploads to. */
function account_(patterns: string[]) {
  const records = new Map(patterns.map((id) => [id, { refs: [] as RefWindowData[], underlay: null as unknown, rev: 0 }]));
  const pictures = new Map<string, Blob>(), uploaded = new Map<string, Blob>();
  const uploads: string[] = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
    if (url.startsWith("https://storage/")) {
      const id = decodeURIComponent(url.slice("https://storage/".length));
      if (method === "GET") return new Response(pictures.get(id) ?? null);
      uploaded.set(id, (init.body as FormData).get("file") as Blob);
      return new Response(null, { status: 204 });
    }
    const pic = url.match(/^\/api\/pictures\/(.+)$/);
    if (pic) {
      const id = decodeURIComponent(pic[1]!);
      if (method === "POST") return reply({ method: "POST", url: `https://storage/${encodeURIComponent(id)}`, fields: { key: id } });
      if (method === "PUT") {
        if (!uploaded.has(id)) return reply({}, 409);
        pictures.set(id, uploaded.get(id)!);
        uploads.push(id);
        return new Response(null, { status: 204 });
      }
      return pictures.has(id) ? reply({ url: `https://storage/${encodeURIComponent(id)}` }) : reply({}, 404);
    }
    const rec = url.match(/^\/api\/patterns\/(.+)\/pictures$/);
    const r = rec && records.get(decodeURIComponent(rec[1]!));
    if (!r) return reply({}, 404);
    if (method === "GET") return reply(r);
    const body = JSON.parse(init.body as string) as { refs: RefWindowData[]; underlay: unknown; base: number };
    if (body.base !== r.rev) return reply({ current: r }, 409);
    const used = body.refs.flatMap((w) => [w.image, w.marks]).filter((x): x is string => !!x);
    const missing = used.filter((id) => !pictures.has(id));
    if (missing.length) return reply({ missing }, 409);
    Object.assign(r, { refs: body.refs, underlay: body.underlay, rev: r.rev + 1 });
    return reply({ rev: r.rev });
  });
  return { records, pictures, uploads };
}

const photo = (text: string) => new Blob([text], { type: "image/jpeg" });

beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) });
  account.signedIn = true;
});

afterEach(() => {
  vi.unstubAllGlobals();
  account.signedIn = false;
});

describe("pictures in the account", () => {
  it("a change goes up: the photo and its marks first, as they came, then the window", async () => {
    const b = browser(), server = account_(["p"]);
    const sync = accountPictures(b.local);
    const img = await b.local.images.put(photo("a big photo")), marks = await b.local.images.put(new Blob(["marks"], { type: "image/png" }));
    await sync.references.save("p", [win("w1", img, marks)]);
    await sync.settle();
    expect(server.uploads.sort()).toEqual([img, marks].sort());
    expect(await server.pictures.get(img)!.text()).toBe("a big photo");
    expect(server.records.get("p")).toMatchObject({ rev: 1, refs: [{ id: "w1", image: img, marks }] });
  });

  it("a pattern only in this browser: nothing is uploaded, and it stays marked to go later", async () => {
    const b = browser(), server = account_([]);
    const sync = accountPictures(b.local);
    await sync.references.save("here", [win("w1", await b.local.images.put(photo("x")))]);
    await sync.settle();
    expect(server.uploads).toEqual([]);
    expect(JSON.parse(localStorage.getItem("stitchwork.pictureSync")!).here.dirty).toBeGreaterThan(0);
  });

  it("signed out, changes wait; signing in sends them", async () => {
    account.signedIn = false;
    const b = browser(), server = account_(["p"]);
    const sync = accountPictures(b.local);
    await sync.references.save("p", [win("w1", await b.local.images.put(photo("x")))]);
    await sync.settle();
    expect(server.records.get("p")!.rev).toBe(0);
    account.signedIn = true;
    await sync.catchUp();
    expect(server.records.get("p")!.rev).toBe(1);
  });

  it("opening on another device brings the windows and their pictures, checked against their ids", async () => {
    const first = browser(), server = account_(["p"]);
    const one = accountPictures(first.local);
    const img = await first.local.images.put(photo("chart scan"));
    await one.references.save("p", [win("w1", img)]);
    await one.settle();
    localStorage.clear?.();
    localStorage.removeItem("stitchwork.pictureSync");
    const second = browser();
    const two = accountPictures(second.local);
    expect(await two.references.load("p")).toMatchObject([{ id: "w1", image: img }]);
    expect(await second.images.get(img)!.text()).toBe("chart scan");
  });

  it("changes made here over an older revision are merged: windows from both devices stay", async () => {
    const b = browser(), server = account_(["p"]);
    const theirImg = await b.local.images.put(photo("theirs"));
    server.pictures.set(theirImg, photo("theirs"));
    Object.assign(server.records.get("p")!, { refs: [win("theirs", theirImg)], rev: 3 });
    b.images.delete(theirImg);
    // windows here from before, never sent: they count as changes
    const mine = await b.local.images.put(photo("mine"));
    b.refs.set("p", [win("mine", mine)]);
    const sync = accountPictures(b.local);
    const changed: string[] = [];
    sync.onChange((id) => changed.push(id));
    sync.push("p");
    await sync.settle();
    expect(server.records.get("p")!.refs.map((w) => w.id)).toEqual(["mine", "theirs"]);
    expect(b.refs.get("p")!.map((w) => w.id)).toEqual(["mine", "theirs"]);
    expect(await b.images.get(theirImg)!.text()).toBe("theirs");
    expect(changed).toEqual(["p"]);
  });

  it("unsent changes here are never replaced by the account's", async () => {
    const b = browser(), server = account_(["p"]);
    const img = await b.local.images.put(photo("x"));
    server.pictures.set(img, photo("x"));
    Object.assign(server.records.get("p")!, { refs: [win("old", img)], rev: 5 });
    vi.stubGlobal("fetch", async () => {
      throw new Error("offline");
    });
    const sync = accountPictures(b.local);
    await sync.references.save("p", [win("new", img)]);
    expect((await sync.references.load("p")).map((w) => w.id)).toEqual(["new"]);
  });

  it("signing out: windows leave this browser only where the account surely has them", async () => {
    const b = browser(), server = account_(["synced", "pending"]);
    const sync = accountPictures(b.local);
    const img = await b.local.images.put(photo("x"));
    await sync.references.save("synced", [win("w", img)]);
    await sync.settle();
    vi.stubGlobal("fetch", async () => {
      throw new Error("offline");
    });
    await sync.references.save("pending", [win("w", img)]);
    await sync.settle();
    await sync.forget(["synced", "pending"]);
    expect(b.refs.get("synced")).toEqual([]);
    expect(b.refs.get("pending")).toHaveLength(1);
    void server;
  });
});

describe("merging", () => {
  it("keeps this browser's version of a window both have, and adds the account's others", () => {
    const m = mergePictures({ refs: [win("a", "img:1", "img:m2")], underlay: null }, { refs: [win("a", "img:1", "img:m1"), win("b", "img:2")], underlay: { image: "img:u" } as UnderlayData, rev: 2 });
    expect(m.refs.map((w) => [w.id, w.marks])).toEqual([["a", "img:m2"], ["b", null]]);
    expect(m.underlay?.image).toBe("img:u");
  });
});
