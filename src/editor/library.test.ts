import { afterEach, describe, expect, it, vi } from "vitest";
import { serializePattern } from "@/core/formats/json/serialize";
import { createPattern } from "@/core/pattern/createPattern";
import { account } from "@/persistence";
import { memoryPersistence } from "../../tests/support/memoryPersistence";
import { testEditor } from "../../tests/support/editorHarness";
import { createLibrary, forgetAccountHere } from "./library";

const store = new Map<string, string>();
vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) });
  account.signedIn = false;
  store.clear();
});

describe("the patterns page's library (SPEC §15.26)", () => {
  it("moves this browser's patterns into the account, and keeps them here for good", async () => {
    const docs = new Map([["a", createPattern(5, 5, "A")], ["b", createPattern(5, 5, "B")]].map(([id, p]) => [id as string, serializePattern({ ...(p as ReturnType<typeof createPattern>), id: id as string })]));
    const persistence = memoryPersistence();
    persistence.patterns.load = async (id) => docs.get(id) ?? null;
    const put: string[] = [];
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      if (init?.method === "PUT" && !url.endsWith("/preview")) put.push(decodeURIComponent(url.split("/").pop()!));
      return new Response(null, { status: 200 });
    });
    const lib = createLibrary(persistence);
    lib.setSignedIn(true);
    const steps: number[] = [];
    expect(await lib.moveToAccount(["a", "b", "gone"], (n) => steps.push(n))).toBe(2);
    expect(put).toEqual(["a", "b"]);
    expect(steps).toEqual([1, 2]);
    expect(JSON.parse(store.get("stitchwork.keptPatterns")!)).toEqual(["a", "b"]);
  });

  it("uses the account's preview when there is one; nothing to show for an account pattern without one", async () => {
    const lib = createLibrary(memoryPersistence());
    expect(await lib.previewUrl({ id: "x", name: "X", w: 5, h: 5, updatedAt: 1, where: "both", hasPreview: true })).toBe("/api/patterns/x/preview");
    expect(await lib.previewUrl({ id: "y", name: "Y", w: 5, h: 5, updatedAt: 1, where: "account", hasPreview: false })).toBeNull();
  });

  it("signing out: the account's patterns leave this browser, the draft too when it's one of them", async () => {
    const persistence = memoryPersistence();
    let cleared = false;
    persistence.patterns.trimCache = async ({ all }) => (all ? ["a", "b"] : []);
    persistence.draft = { load: async () => serializePattern({ ...createPattern(5, 5, "A"), id: "a" }), save: () => {}, clear: async () => void (cleared = true) };
    expect(await forgetAccountHere(persistence)).toEqual(["a", "b"]);
    expect(cleared).toBe(true);
  });

  it("the editor shows the demo instead when the open pattern was the account's; otherwise it stays", async () => {
    const { ed } = testEditor(5, 5);
    const open = ed.doc.id;
    ed.persistence.patterns.trimCache = async () => ["elsewhere"];
    await ed.prepareSignOut();
    expect(ed.doc.id).toBe(open);
    ed.persistence.patterns.trimCache = async () => [open];
    await ed.prepareSignOut();
    expect(ed.doc.id).not.toBe(open);
    expect(ed.doc.w).toBe(60);
  });
});
