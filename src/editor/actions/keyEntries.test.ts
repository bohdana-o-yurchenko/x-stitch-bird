import { beforeEach, describe, expect, it } from "vitest";
import { createPattern } from "@/core/pattern/createPattern";
import { ORGANIZER } from "@/core/pattern/brands";
import { addEntry, freeLineInks, fullLineStyles } from "@/core/pattern/keyEntries";
import { ALL_SYMBOLS } from "@/core/symbols/symbols";
import { memoryPersistence } from "../../../tests/support/memoryPersistence";
import { Editor } from "../createEditor";
import { loadPattern } from "./pattern";
import { commitEntry, deleteEntry, draftFor, draftSymbol, draftForDuplicate, duplicateOf, resolveDraftSource, type KeyDraft } from "./keyEntries";

/** The key-entry rules behind the add/edit form (SPEC §8). */
let ed: Editor, red: number;

beforeEach(() => {
  ed = new Editor(memoryPersistence(), false);
  ed.store.setState({ symbols: [...ALL_SYMBOLS] });
  const p = createPattern(10, 10);
  red = addEntry(p, { t: "thread", src: "dmc:321", n: 2, st: "full" }, ALL_SYMBOLS);
  loadPattern(ed, p);
});

const draft = (patch: Partial<KeyDraft> = {}, edit?: number): KeyDraft => ({ ...draftFor(ed, edit), ...patch });

describe("adding an entry", () => {
  it("adds it with the next free symbol, makes it active and remembers the strands", () => {
    const i = commitEntry(ed, draft({ thread: "dmc:310", n: 3 }));
    expect(i).toBe(2);
    expect(ed.doc.key[2]).toEqual({ t: "thread", src: "dmc:310", n: 3, st: "full", sym: ALL_SYMBOLS[1] });
    expect(ed.state.activeEntry).toBe(2);
    expect(ed.doc.strands).toBe(3);
    ed.history.undo();
    expect(ed.doc.key[2]).toBeUndefined();
  });

  it("takes a symbol another entry has and gives that entry a free one", () => {
    const taken = ed.doc.key[red]!.sym;
    const i = commitEntry(ed, draft({ thread: "dmc:310", sym: taken }))!;
    expect(ed.doc.key[i]!.sym).toBe(taken);
    expect(ed.doc.key[red]!.sym).not.toBe(taken);
  });

  it("finds an identical entry for the add-anyway warning", () => {
    expect(duplicateOf(ed, draft({ thread: "dmc:321", n: 2 }))).toBe(red);
    expect(duplicateOf(ed, draft({ thread: "dmc:321", n: 1 }))).toBe(0);
  });
});

describe("duplicating an entry", () => {
  it("copies every entry kind's settings and picks an unused symbol in its family", () => {
    ed.doc.blends["blend:copy"] = { parts: [{ id: "dmc:310", n: 2 }, { id: "dmc:413", n: 1 }] };
    ed.doc.combos["combo:copy"] = { thread: "dmc:310", bead: "bead:00557" };
    const sources = [
      addEntry(ed.doc, { t: "thread", src: "dmc:666", n: 3, st: "half" }, ALL_SYMBOLS),
      addEntry(ed.doc, { t: "thread", src: "blend:copy", n: null, st: "halfb" }, ALL_SYMBOLS),
      addEntry(ed.doc, { t: "combo", src: "combo:copy", n: 2, st: "point" }, ALL_SYMBOLS),
      addEntry(ed.doc, { t: "bead", src: "bead:00557", st: "point" }, ALL_SYMBOLS),
      addEntry(ed.doc, { t: "back", src: "dmc:310", n: 1, ink: "#FF0000" }, ALL_SYMBOLS),
      addEntry(ed.doc, { t: "knot", src: "dmc:310", n: 1, wraps: 3 }, ALL_SYMBOLS),
    ];

    for (const index of sources) {
      const original = draftFor(ed, index);
      const duplicate = draftForDuplicate(ed, index);
      expect(duplicate).toEqual({ ...original, sym: expect.any(String) });
      expect(duplicate.sym).not.toBe(original.sym);
      expect(ed.doc.key.slice(1).some((entry) => entry?.sym === duplicate.sym)).toBe(false);
      expect(ed.doc.key[index]!.sym).toBe(original.sym);
    }
  });

  it("opens the add form for an existing entry and ignores missing entries", async () => {
    await ed.commands.run("key.duplicate", red);
    expect(ed.state.keyForm).toMatchObject({ duplicate: red });
    expect(ed.state.keyForm?.edit).toBeUndefined();
    ed.closeKeyForm();
    await ed.commands.run("key.duplicate", 99);
    expect(ed.state.keyForm).toBeNull();
  });
});

describe("blends", () => {
  const blend = (slots: KeyDraft["slots"]) => draft({ mode: "blend", slots });

  it("creates a blend once and reuses it for the same threads in any order", () => {
    const a = commitEntry(ed, blend([{ id: "dmc:310", n: 1 }, { id: "dmc:413", n: 1 }]))!;
    const src = ed.doc.key[a]!.src;
    expect(ed.doc.blends[src]!.parts).toEqual([{ id: "dmc:310", n: 1 }, { id: "dmc:413", n: 1 }]);
    expect(ed.doc.key[a]!.n).toBeNull();
    expect(resolveDraftSource(ed, blend([{ id: "dmc:413", n: 1 }, { id: "dmc:310", n: 1 }]), false)).toBe(src);
    expect(resolveDraftSource(ed, blend([{ id: "dmc:413", n: 2 }, { id: "dmc:310", n: 1 }]), false)).toBe("blend:new");
  });

  it("refuses a blend with an empty or repeated thread", () => {
    expect(commitEntry(ed, blend([{ id: "dmc:310", n: 1 }, { id: null, n: 1 }]))).toBeNull();
    expect(commitEntry(ed, blend([{ id: "dmc:310", n: 1 }, { id: "dmc:310", n: 1 }]))).toBeNull();
    expect(Object.keys(ed.doc.blends)).toEqual([]);
  });
});

describe("editing an entry", () => {
  it("keeps its index and swaps symbols with the entry that had the new one", () => {
    const other = commitEntry(ed, draft({ thread: "dmc:310" }))!;
    const [mine, theirs] = [ed.doc.key[red]!.sym, ed.doc.key[other]!.sym];
    expect(commitEntry(ed, draft({ thread: "dmc:666", sym: theirs }, red), red)).toBe(red);
    expect(ed.doc.key[red]).toMatchObject({ src: "dmc:666", sym: theirs });
    expect(ed.doc.key[other]!.sym).toBe(mine);
  });

  it("won't move an entry that is on the chart to another layer, but will when it's unused", () => {
    ed.doc.layers.stitches[0] = red;
    expect(commitEntry(ed, draft({ t: "back", n: 1 }, red), red)).toBeNull();
    expect(ed.doc.key[red]!.t).toBe("thread");
    ed.doc.layers.stitches[0] = 0;
    expect(commitEntry(ed, draft({ t: "back", n: 1, sym: "solid" }, red), red)).toBe(red);
    expect(ed.doc.key[red]!.t).toBe("back");
  });

  it("turning cross stitches into floss + bead removes the separate beads under them", () => {
    const bead = addEntry(ed.doc, { t: "bead", src: "bead:00557" }, ALL_SYMBOLS);
    ed.doc.layers.stitches[0] = red;
    ed.doc.layers.beads[0] = bead;
    commitEntry(ed, draft({ t: "combo", thread: "dmc:321", bead: "bead:02011" }, red), red);
    expect(ed.doc.layers.beads[0]).toBe(0);
    expect(ed.doc.combos[ed.doc.key[red]!.src]).toEqual({ thread: "dmc:321", bead: "bead:02011" });
  });
});

describe("backstitch symbols: line style and line colour together (SPEC §2.5)", () => {
  const back = (patch: Partial<KeyDraft> = {}, edit?: number) => draft({ t: "back", n: 1, thread: "dmc:310", ...patch }, edit);

  it("lets two lines of different colours share a style, and gives a new line the first style free in its colour", () => {
    const black = commitEntry(ed, back({ sym: "line:solid" }))!;
    const red2 = commitEntry(ed, back({ thread: "dmc:321", sym: "line:solid", ink: "#E6194B" }))!;
    expect(ed.doc.key[black]!.sym).toBe("line:solid");
    expect(ed.doc.key[red2]).toMatchObject({ sym: "line:solid", ink: "#E6194B" });
    const blue = addEntry(ed.doc, { t: "back", src: "dmc:797", n: 1, ink: "#3A5BD9" }, ALL_SYMBOLS);
    expect(ed.doc.key[blue]!.sym).toBe("line:solid");
    const black2 = addEntry(ed.doc, { t: "back", src: "dmc:797", n: 1 }, ALL_SYMBOLS);
    expect(ed.doc.key[black2]!.sym).not.toBe("line:solid");
  });

  it("a new line goes through the colours of a style first: solid black, solid red … then dashed black", () => {
    const toBack = () => ({ ...draft(), t: "back" as const, n: 1, ...draftSymbol(ed, draft(), "back") });
    expect(toBack()).toMatchObject({ sym: "line:solid", ink: "#1D1A16" });
    commitEntry(ed, toBack());
    expect(toBack()).toMatchObject({ sym: "line:solid", ink: "#E6194B" });
    expect(fullLineStyles(ed.doc)).toEqual([]);
    for (let i = 0; i < 5; i++) commitEntry(ed, toBack());
    expect(new Set(ed.doc.key.filter((e) => e?.t === "back").map((e) => e!.ink ?? "#1D1A16")).size).toBe(6);
    // solid has every preset colour now: it is dimmed, and the next line is dashed black
    expect(fullLineStyles(ed.doc)).toEqual(["line:solid"]);
    expect(toBack()).toMatchObject({ sym: "line:dashed", ink: "#1D1A16" });
    expect(freeLineInks(ed.doc, "line:dashed")).toHaveLength(6);
  });

  it("still won't let two lines show the same style in the same colour: the other one gets a free style", () => {
    const first = commitEntry(ed, back({ sym: "line:solid", ink: "#E6194B" }))!;
    const second = commitEntry(ed, back({ thread: "dmc:321", sym: "line:solid", ink: "#E6194B" }))!;
    expect(ed.doc.key[second]!.sym).toBe("line:solid");
    expect(ed.doc.key[first]!.sym).not.toBe("line:solid");
  });

  it("an edit that changes the colour to one whose line has the style swaps styles only when needed", () => {
    const black = commitEntry(ed, back({ sym: "line:solid" }))!;
    const red2 = commitEntry(ed, back({ thread: "dmc:321", sym: "line:dashed", ink: "#E6194B" }))!;
    // the black line turns red and takes "dashed": the red line gets the black one's old "solid"
    commitEntry(ed, back({ sym: "line:dashed", ink: "#E6194B" }, black), black);
    expect(ed.doc.key[black]).toMatchObject({ sym: "line:dashed", ink: "#E6194B" });
    expect(ed.doc.key[red2]!.sym).toBe("line:solid");
  });
});

describe("deleting an entry", () => {
  it("always asks first, used on the chart or not, and says how often it's used", async () => {
    await ed.commands.run("key.requestDelete", red);
    expect(ed.state.dialog).toEqual({ type: "deleteEntry", index: red, count: 0 });
    ed.closeDialog();
    ed.doc.layers.stitches[0] = ed.doc.layers.stitches[1] = red;
    await ed.commands.run("key.requestDelete", red);
    expect(ed.state.dialog).toEqual({ type: "deleteEntry", index: red, count: 2 });
    expect(ed.doc.key[red]).not.toBeNull();
  });

  it("removes everything drawn with it in one undo step", () => {
    ed.doc.layers.stitches[3] = red;
    ed.setActiveEntry(red);
    deleteEntry(ed, red);
    expect([ed.doc.key[red], ed.doc.layers.stitches[3], ed.state.activeEntry]).toEqual([null, 0, 0]);
    ed.history.undo();
    expect([ed.doc.key[red]?.src, ed.doc.layers.stitches[3]]).toEqual(["dmc:321", red]);
  });
});

describe("default materials", () => {
  const withBrands = (brands: string[]) => {
    const p = createPattern(10, 10);
    p.brands = brands;
    loadPattern(ed, p);
  };

  it("defaults to a thread of the pattern's own brand when it has no DMC", () => {
    withBrands(["Anchor"]);
    const d = draftFor(ed);
    expect(d.thread.startsWith("anchor:")).toBe(true);
    expect(d.slots[0]!.id).toBe(d.thread);
    expect(d.slots[1]!.id?.startsWith("anchor:")).toBe(true);
    expect(d.slots[1]!.id).not.toBe(d.thread);
  });

  it("in a project with only its own palette: its first colour, and nothing while the palette is empty", () => {
    const p = createPattern(10, 10);
    p.brands = [ORGANIZER];
    p.beadBrands = [ORGANIZER];
    loadPattern(ed, p);
    expect(draftFor(ed)).toMatchObject({ thread: "", bead: "", slots: [{ id: null }, { id: null }] });
    p.customs["custom:1"] = { id: "custom:1", kind: "thread", brand: ORGANIZER, code: "1", name: "", hex: "#336699" };
    expect(draftFor(ed).thread).toBe("custom:1");
  });

  it("prefers a black thread", () => {
    withBrands(["DMC"]);
    expect(draftFor(ed).thread).toBe("dmc:310");
  });
});
