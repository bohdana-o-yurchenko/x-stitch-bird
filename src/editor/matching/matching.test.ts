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

describe("symbol matching in the editor (SPEC §15.11)", () => {
  it("Shift+F picks the block under the pointer; Accept fills the sure cells in one undo step and ends the mode", async () => {
    const { ed, red } = t;
    const blue = t.entry({ t: "thread", src: "dmc:797", n: 2, st: "full" });
    await ed.commands.run("match.toggle");
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
    expect(ed.state.match).toBeNull();
    expect([...ed.doc.layers.stitches.slice(0, 6)]).toEqual([red, blue, red, red, blue, 0]);
    await ed.commands.run("history.undo");
    expect([...ed.doc.layers.stitches.slice(0, 6)]).toEqual([red, blue, 0, 0, 0, 0]);
  });

  it("Decline and Esc leave the chart as it was; the examples are learned either way and saved with the pattern", async () => {
    const { ed } = t;
    const blue = t.entry({ t: "thread", src: "dmc:797", n: 2, st: "full" });
    await ed.commands.run("match.toggle");
    reviewBlock(ed, block, photo(blue));
    await ed.commands.run("match.decline");
    expect(ed.state.match).toBeNull();
    expect(ed.doc.layers.stitches[2]).toBe(0);
    expect(Object.keys(ed.doc.samples ?? {})).toEqual(["thread|dmc:321|full", "thread|dmc:797|full"]);
    // a block with nothing stitched still finds symbols, from what earlier blocks taught
    ed.doc.layers.stitches.fill(0);
    await ed.commands.run("match.toggle");
    reviewBlock(ed, block, new Map([[2, printed(ring, 0, 1, 8)]]));
    expect(ed.state.match?.phase === "review" && ed.state.match.proposals).toEqual([{ cell: 2, k: blue }]);
    ed.shortcuts.keyDown({ key: "Escape", ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, preventDefault() {} });
    expect(ed.state.match).toBeNull();
  });

  it("explains what's missing: no image, nothing learned yet", async () => {
    const { ed } = t;
    await ed.commands.run("match.toggle");
    reviewBlock(ed, block, new Map([[2, printed(cross)]]));
    expect(t.lastToast()).toBe("toasts.matchNoExamples");
    expect(ed.state.match?.phase).toBe("pick");
    await ed.commands.run("match.toggle");
    ed.store.setState({ underlay: null, underlayImage: null });
    await ed.commands.run("match.toggle");
    expect(ed.state.match).toBeNull();
    expect(t.lastToast()).toBe("toasts.matchNeedsUnderlay");
  });
});
