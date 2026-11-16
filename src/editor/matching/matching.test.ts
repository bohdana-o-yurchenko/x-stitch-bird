import { beforeEach, describe, expect, it } from "vitest";
import type { Patch } from "@/core/matching/match";
import { newUnderlay } from "@/core/underlay/underlay";
import { at, testEditor } from "../../../tests/support/editorHarness";
import { blank, cross, printed, ring } from "../../../tests/support/printedPatch";
import { reviewBlock } from "./matching";

let t: ReturnType<typeof testEditor>;
const block = { x: 0, y: 0, w: 10, h: 10 };

beforeEach(async () => {
  t = testEditor(20, 20);
  // after the pattern's own (empty) underlay has loaded
  await new Promise((r) => setTimeout(r, 0));
  // a photo behind the chart, so the mode can start (the pixels themselves come from the tests)
  t.ed.store.setState({ underlay: { ...newUnderlay("img", 200, 200, t.ed.doc), behind: true }, underlayImage: {} as HTMLImageElement });
});

/** Block 0: a red cross at cell 0 and a blue ring at cell 1 already stitched; crosses, a ring and blanks to find. */
function photo(blue: number): Map<number, Patch> {
  const p = t.ed.doc.layers.stitches;
  p[0] = t.red;
  p[1] = blue;
  return new Map<number, Patch>([
    [0, printed(cross, 0, 0, 2)],
    [1, printed(ring, 0, 0, 3)],
    [2, printed(cross, 1, 0, 4)],
    [3, printed(cross, -1, 1, 5)],
    [4, printed(ring, 1, 1, 6)],
    [5, printed(blank, 0, 0, 7)],
  ]);
}

const esc = { key: "Escape", ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, preventDefault() {} };
const shiftF = { ...esc, key: "F", shiftKey: true };

describe("Autofill, symbol matching in the editor (SPEC §15.11)", () => {
  it("is a tool (Shift+F): the block under the pointer; Accept fills the sure cells in one undo step, then the next block", async () => {
    const { ed, red } = t;
    const blue = t.entry({ t: "thread", src: "dmc:797", n: 2, st: "full" });
    ed.shortcuts.keyDown(shiftF);
    expect(ed.state.tool).toBe("autofill");
    ed.tools.move(at(13, 4));
    expect(ed.state.match).toEqual({ phase: "pick", hover: { x: 10, y: 0, w: 10, h: 10 } });
    reviewBlock(ed, block, photo(blue));
    const m = ed.state.match;
    expect(m?.phase).toBe("review");
    if (m?.phase !== "review") return;
    expect(m.proposals).toEqual([{ cell: 2, k: red }, { cell: 3, k: red }, { cell: 4, k: blue }]);
    // the proposals are only shown until accepted
    expect(m.ghosts.layers.stitches[2]).toBe(red);
    expect(ed.doc.layers.stitches[2]).toBe(0);
    // while reviewing, clicking the chart draws nothing
    ed.tools.down(at(8, 8));
    ed.tools.up(at(8, 8));
    expect(ed.doc.layers.stitches[8 * 20 + 8]).toBe(0);
    await ed.commands.run("match.accept");
    // still Autofill: straight on to the next block
    expect([ed.state.tool, ed.state.match?.phase]).toEqual(["autofill", "pick"]);
    expect([...ed.doc.layers.stitches.slice(0, 6)]).toEqual([red, blue, red, red, blue, 0]);
    await ed.commands.run("history.undo");
    expect([...ed.doc.layers.stitches.slice(0, 6)]).toEqual([red, blue, 0, 0, 0, 0]);
    // another tool ends it
    await ed.commands.run("tool.select", "pencil");
    expect(ed.state.match).toBeNull();
  });

  it("Decline and Esc leave the chart as it was and go on to the next block; the examples are learned either way", async () => {
    const { ed } = t;
    const blue = t.entry({ t: "thread", src: "dmc:797", n: 2, st: "full" });
    await ed.commands.run("tool.select", "autofill");
    reviewBlock(ed, block, photo(blue));
    await ed.commands.run("match.decline");
    expect(ed.state.match).toEqual({ phase: "pick", hover: null });
    expect(ed.doc.layers.stitches[2]).toBe(0);
    expect(Object.keys(ed.doc.samples ?? {})).toEqual(["thread|dmc:321|full", "thread|dmc:797|full"]);
    // a block with nothing stitched still finds symbols, from what earlier blocks taught
    ed.doc.layers.stitches.fill(0);
    reviewBlock(ed, block, new Map([[2, printed(ring, 0, 1, 8)]]));
    expect(ed.state.match?.phase === "review" && ed.state.match.proposals).toEqual([{ cell: 2, k: blue }]);
    ed.shortcuts.keyDown(esc);
    expect([ed.state.tool, ed.state.match?.phase]).toEqual(["autofill", "pick"]);
  });

  it("waits while the image is edited: the block being reviewed is dropped, no tool can be picked, then it goes on", async () => {
    const { ed } = t;
    const blue = t.entry({ t: "thread", src: "dmc:797", n: 2, st: "full" });
    await ed.commands.run("tool.select", "autofill");
    reviewBlock(ed, block, photo(blue));
    ed.underlay.setBehind(false);
    expect(ed.state.match).toEqual({ phase: "pick", hover: null });
    // the pointer edits the image, not the chart; the toolbar is idle
    expect(ed.commands.enabled("tool.select")).toBe(false);
    ed.tools.move(at(13, 4));
    expect(ed.state.match).toEqual({ phase: "pick", hover: null });
    ed.underlay.setBehind(true);
    ed.tools.move(at(13, 4));
    expect([ed.state.tool, ed.state.match?.phase]).toEqual(["autofill", "pick"]);
  });

  it("explains what's missing: no image, nothing learned yet", async () => {
    const { ed } = t;
    await ed.commands.run("tool.select", "autofill");
    reviewBlock(ed, block, new Map([[2, printed(cross)]]));
    expect(t.lastToast()).toBe("toasts.matchNoExamples");
    expect(ed.state.match?.phase).toBe("pick");
    await ed.commands.run("tool.select", "pencil");
    ed.store.setState({ underlay: null, underlayImage: null });
    await ed.commands.run("tool.select", "autofill");
    expect([ed.state.tool, ed.state.match]).toEqual(["pencil", null]);
    expect(t.lastToast()).toBe("toasts.matchNeedsUnderlay");
  });

  it("Alt steps aside for the picker: released without picking, back to Autofill; after picking, on to drawing", async () => {
    const { ed } = t;
    const alt = { ...esc, key: "Alt", altKey: true };
    await ed.commands.run("tool.select", "autofill");
    ed.shortcuts.keyDown(alt);
    expect(ed.state.momentaryTool).toBe("picker");
    ed.shortcuts.keyUp(alt);
    expect(ed.state.tool).toBe("autofill");
    // this time a colour is picked from the chart
    t.ed.doc.layers.stitches[0] = t.red;
    ed.shortcuts.keyDown(alt);
    ed.tools.down(at(0, 0));
    ed.tools.up(at(0, 0));
    ed.shortcuts.keyUp(alt);
    expect([ed.state.tool, ed.state.activeEntry]).toEqual(["pencil", t.red]);
  });

  it("clicking an entry in the key while in Autofill (or the eraser) goes on to drawing with it", async () => {
    const { ed } = t;
    for (const tool of ["autofill", "eraser"] as const) {
      await ed.commands.run("tool.select", tool);
      await ed.commands.run("key.select", t.red);
      expect(ed.state.tool).toBe("pencil");
    }
  });
});

