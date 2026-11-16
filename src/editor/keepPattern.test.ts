import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { testEditor } from "../../tests/support/editorHarness";

const blank = { name: "Next", w: 5, h: 5, count: 14, keepKey: false };

/** This browser's storage: just what the rule writes. */
const store = new Map<string, string>();
vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), clear: () => store.clear() });

let t: ReturnType<typeof testEditor>;
let removed: string[];
beforeEach(async () => {
  localStorage.clear();
  t = testEditor(6, 4);
  removed = [];
  t.ed.persistence.patterns.remove = async (id) => void removed.push(id);
  await t.ed.keep.init();
});
afterEach(() => localStorage.clear());

const edit = () => {
  t.ed.doc.layers.stitches[0] = t.red;
  t.ed.changed();
};

describe("signed out: one working pattern (SPEC §15.25)", () => {
  it("asks before a new pattern replaces one with work in it; Replace takes the old one out of this browser", async () => {
    const { ed } = t, first = ed.doc.id;
    edit();
    await ed.commands.run("file.create", blank);
    expect(ed.state.dialog).toMatchObject({ type: "keepPattern", then: { command: "file.create" } });
    expect(ed.doc.id).toBe(first);
    // "Replace it"
    await ed.commands.run("file.create", blank, true);
    expect(ed.doc.name).toBe("Next");
    expect(removed).toEqual([first]);
  });

  it("an untouched pattern is replaced without asking — and still leaves this browser", async () => {
    const { ed } = t, first = ed.doc.id;
    await ed.commands.run("file.create", blank);
    expect(ed.state.dialog).toBeNull();
    expect(ed.doc.name).toBe("Next");
    expect(removed).toEqual([first]);
  });

  it("never asks or removes signed in, or for patterns saved here before the rule or already in the account", async () => {
    const { ed } = t;
    edit();
    ed.setAccount({ id: "u1", email: "a@b.c" });
    await ed.commands.run("file.create", blank);
    expect([ed.state.dialog, removed]).toEqual([null, []]);
    ed.setAccount(null);
    // kept: in this browser before the rule, or it reached the account
    ed.keep.keep(ed.doc.id);
    edit();
    await ed.commands.run("file.create", blank);
    expect([ed.state.dialog, removed]).toEqual([null, []]);
  });

  it("the first start with the rule keeps every pattern already saved here", async () => {
    localStorage.clear();
    t.ed.persistence.patterns.list = async () => [{ id: "old-1", name: "Old", w: 5, h: 5, updatedAt: 1 }];
    await t.ed.keep.init();
    expect(JSON.parse(localStorage.getItem("stitchwork.keptPatterns")!)).toEqual(["old-1"]);
  });

  it("a pattern restored on the next visit counts as work only if it was edited before", async () => {
    const { ed } = t;
    // never edited (the demo, say): the next visit replaces it without asking
    ed.keep.restored();
    await ed.commands.run("file.create", blank);
    expect(ed.state.dialog).toBeNull();
    // edited, then the page reloads: still work
    edit();
    ed.keep.opening();
    ed.store.setState({ docRevision: ed.state.docRevision + 1 });
    ed.keep.restored();
    await ed.commands.run("file.create", blank);
    expect(ed.state.dialog).toMatchObject({ type: "keepPattern" });
  });
});
