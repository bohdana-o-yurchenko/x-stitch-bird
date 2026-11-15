import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ALL_SYMBOLS } from "@/core/symbols/symbols";
import { checkPatternKeeper } from "@/core/formats/pdf/patternKeeper";
import { at, testEditor } from "../../../tests/support/editorHarness";
import { demoPattern } from "./pattern";

let t: ReturnType<typeof testEditor>;
beforeEach(() => {
  vi.useFakeTimers();
  t = testEditor(6, 4);
});
afterEach(() => vi.useRealTimers());

describe("whole-chart transforms (SPEC §15.3)", () => {
  it("rotates the chart, swaps its size and undoes in one step, with a snapshot taken first", async () => {
    const { ed, red, stitch, snaps } = t;
    ed.doc.layers.stitches[0] = red; // top-left
    ed.selection.all();
    await ed.commands.run("transform.apply", "rot90cw");
    expect([ed.doc.w, ed.doc.h]).toEqual([4, 6]);
    expect(stitch(3, 0)).toBe(red); // now top-right
    expect(ed.state.selection).toBeNull();
    expect(snaps.map((s) => s.reason)).toEqual(["transform"]);
    ed.history.undo();
    expect([ed.doc.w, ed.doc.h, stitch(0, 0)]).toEqual([6, 4, red]);
  });

  it("a flipped half cross gets a twin entry of the opposite direction, and says so", async () => {
    const { ed, entry, lastToast } = t;
    const half = entry({ t: "thread", src: "dmc:321", n: 2, st: "half" });
    ed.doc.layers.stitches[0] = half;
    const before = ed.doc.key.length;
    await ed.commands.run("transform.apply", "flipH");
    expect(ed.doc.key).toHaveLength(before + 1);
    expect(ed.doc.key[ed.doc.layers.stitches[5]!]).toMatchObject({ st: "halfb", src: "dmc:321" });
    expect(lastToast()).toBe("toasts.newTwins");
  });

  it("crops to the stitches with a margin, or says there is nothing to crop", async () => {
    const { ed, red, lastToast } = t;
    await ed.commands.run("transform.crop");
    expect(lastToast()).toBe("toasts.nothingToCrop");
    expect([ed.doc.w, ed.doc.h]).toEqual([6, 4]);
    ed.doc.layers.stitches[3 * 6 + 5] = red; // bottom-right corner
    await ed.commands.run("transform.crop");
    // a margin of 2 where the chart has room for it; the chart never grows
    expect([ed.doc.w, ed.doc.h]).toEqual([3, 3]);
    expect(ed.doc.layers.stitches[2 * 3 + 2]).toBe(red);
  });

  it("extends the canvas and mirrors from the centre", async () => {
    const { ed, red, stitch } = t;
    ed.doc.layers.stitches[0] = red;
    await ed.commands.run("transform.extend", { top: 1, right: 0, bottom: 0, left: 2 });
    expect([ed.doc.w, ed.doc.h, stitch(2, 1)]).toEqual([8, 5, red]);
    await ed.commands.run("transform.mirror", "leftToRight");
    expect(stitch(5, 1)).toBe(red);
    expect(stitch(2, 1)).toBe(red);
  });
});

describe("ambiguous marks (SPEC §15.5)", () => {
  it("A toggles the mark on the hovered cell without touching stitches; marks are visited in order and cleared together", async () => {
    const { ed } = t;
    await ed.commands.run("ambiguous.toggleAtHover"); // no hovered cell yet
    expect(ed.doc.layers.ambiguous.size).toBe(0);
    for (const [x, y] of [[4, 2], [1, 0]] as const) {
      ed.tools.move(at(x, y));
      await ed.commands.run("ambiguous.toggleAtHover");
    }
    expect([...ed.doc.layers.ambiguous].sort((a, b) => a - b)).toEqual([1, 16]);
    expect(ed.doc.layers.stitches.some(Boolean)).toBe(false);
    ed.viewport.setSize(400, 300);
    await ed.commands.run("ambiguous.next");
    const first = ed.state.flash?.cell;
    await ed.commands.run("ambiguous.next");
    expect(new Set([first, ed.state.flash?.cell])).toEqual(new Set([1, 16]));
    ed.tools.move(at(1, 0));
    await ed.commands.run("ambiguous.toggleAtHover");
    expect([...ed.doc.layers.ambiguous]).toEqual([16]);
    await ed.commands.run("ambiguous.clearAll");
    expect(ed.doc.layers.ambiguous.size).toBe(0);
    ed.history.undo();
    expect(ed.doc.layers.ambiguous.size).toBe(1);
  });
});

describe("pattern settings and new patterns", () => {
  it("renames (never to nothing), sets fabric, numbering and info", async () => {
    const { ed } = t;
    await ed.commands.run("pattern.rename", "  Roses  ");
    expect(ed.doc.name).toBe("Roses");
    await ed.commands.run("pattern.rename", "   ");
    expect(ed.doc.name).toBe("Untitled pattern");
    await ed.commands.run("pattern.setFabric", { count: 18, fabric: "#000000" });
    expect([ed.doc.count, ed.doc.fabric]).toEqual([18, "#000000"]);
    await ed.commands.run("pattern.setGrid", { x0: 5, y0: 1, label: 10, fromCentre: false });
    expect(ed.doc.grid.x0).toBe(5);
    await ed.commands.run("pattern.setInfo", { designer: "A. Designer", notes: "", bogus: "x" });
    expect(ed.doc.meta).toEqual({ designer: "A. Designer" });
  });

  it("a new pattern can keep the key, starts with clean history and takes a snapshot of the old one", async () => {
    const { ed, red, snaps } = t;
    ed.tools.down(at(0, 0));
    ed.tools.up(at(0, 0));
    await ed.commands.run("file.create", { name: "", w: 30, h: 5000, count: 16, keepKey: true });
    expect(ed.doc.name).toBe("Untitled pattern");
    expect(ed.doc.w).toBe(30);
    expect(ed.doc.h).toBeLessThan(5000); // clamped
    expect(ed.doc.count).toBe(16);
    expect(ed.doc.key[red]).toMatchObject({ src: "dmc:321" });
    expect(ed.state.canUndo).toBe(false);
    expect(snaps.map((s) => s.reason)).toEqual(["new"]);
    await ed.commands.run("file.create", { name: "Blank", w: 10, h: 10, count: 14, keepKey: false });
    expect(ed.doc.key.filter(Boolean)).toHaveLength(0);
    expect(ed.state.activeEntry).toBe(0);
  });

  it("the demo pattern shows every kind of entry", () => {
    const demo = demoPattern(ALL_SYMBOLS);
    expect(demo.key.slice(1).map((e) => e!.t)).toEqual(["thread", "thread", "thread", "combo", "thread", "bead", "back", "thread"]);
    expect(new Set(demo.key.slice(1).map((e) => e!.sym)).size).toBe(8);
    expect(checkPatternKeeper(demo).issues.map((i) => i.kind)).toEqual(["half", "combo", "bead", "back"]);
  });
});

describe("commands", () => {
  it("ignores unknown commands and ones that are not available now", async () => {
    const { ed, red } = t;
    await ed.commands.run("nope.nothing");
    expect(ed.commands.enabled("nope.nothing")).toBe(false);
    expect(ed.commands.enabled("history.undo")).toBe(false);
    expect(ed.commands.enabled("selection.clear")).toBe(false);
    ed.doc.layers.stitches[0] = red;
    await ed.commands.run("selection.clear"); // nothing selected: nothing deleted
    expect(ed.doc.layers.stitches[0]).toBe(red);
    await ed.commands.run("selection.all");
    expect(ed.commands.enabled("selection.clear")).toBe(true);
    await ed.commands.run("selection.clear");
    expect(ed.doc.layers.stitches[0]).toBe(0);
    expect(ed.commands.enabled("history.undo")).toBe(true);
    await ed.commands.run("history.undo");
    expect(ed.doc.layers.stitches[0]).toBe(red);
    expect(ed.commands.enabled("history.redo")).toBe(true);
    await ed.commands.run("history.redo");
    expect(ed.doc.layers.stitches[0]).toBe(0);
  });

  it("switches drawing options and says what changed", async () => {
    const { ed, lastToast } = t;
    await ed.commands.run("draw.toggleOverride");
    expect([ed.state.override, lastToast()]).toEqual([true, "toasts.overrideOn"]);
    await ed.commands.run("draw.toggleOverride");
    expect([ed.state.override, lastToast()]).toEqual([false, "toasts.overrideOff"]);
    const modes = [ed.state.mirror];
    for (let n = 0; n < 4; n++) {
      await ed.commands.run("draw.cycleMirror");
      modes.push(ed.state.mirror);
    }
    expect(new Set(modes).size).toBe(4);
    expect(modes[4]).toBe(modes[0]);
    await ed.commands.run("draw.cyclePartialKind");
    expect([ed.state.partialKind, ed.state.tool]).toEqual(["threeQuarter", "partial"]);
    await ed.commands.run("draw.setPartialKind", "petite");
    await ed.commands.run("draw.setBrush", "3");
    expect([ed.state.partialKind, ed.state.brush]).toEqual(["petite", 3]);
  });

  it("opens dialogs and the key form, switches views, picks entries by number", async () => {
    const { ed, red, entry } = t;
    const blue = entry({ t: "thread", src: "dmc:797", n: 2, st: "full" });
    for (const [command, type] of [["file.new", "newPattern"], ["file.open", "open"], ["file.versions", "versions"], ["view.goToCell", "goToCell"], ["pattern.editInfo", "patternInfo"], ["pattern.requestResize", "resize"], ["transform.requestMirror", "mirrorFromCentre"], ["transform.requestExtend", "extendCanvas"], ["selection.requestReplaceKey", "replaceKey"], ["help.changelog", "changelog"]] as const) {
      await ed.commands.run(command);
      expect(ed.state.dialog?.type).toBe(type);
    }
    await ed.commands.run("key.requestDelete", blue);
    expect(ed.state.dialog).toEqual({ type: "deleteEntry", index: blue, count: 0 });
    ed.closeDialog();
    await ed.commands.run("key.requestDelete", 99); // no such entry
    expect(ed.state.dialog).toBeNull();
    await ed.commands.run("key.edit", red);
    expect(ed.state.keyForm?.edit).toBe(red);
    await ed.commands.run("key.add");
    expect(ed.state.keyForm?.edit).toBeUndefined();
    ed.closeKeyForm();
    await ed.commands.run("key.selectNth", 1);
    expect(ed.state.activeEntry).toBe(red);
    await ed.commands.run("key.selectNth", 9);
    expect(ed.state.activeEntry).toBe(red);
    await ed.commands.run("key.select", blue);
    expect(ed.state.activeEntry).toBe(blue);
    await ed.commands.run("view.set", "symbols");
    await ed.commands.run("view.toggleHighlight");
    await ed.commands.run("panel.toggle");
    await ed.commands.run("help.guide");
    expect(ed.state).toMatchObject({ view: "symbols", highlight: true, panelCollapsed: true, guide: "intro" });
    await ed.commands.run("tool.select", "eraser");
    expect(ed.state.tool).toBe("eraser");
  });
});
