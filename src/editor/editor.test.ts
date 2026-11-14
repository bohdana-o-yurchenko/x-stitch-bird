import { beforeEach, describe, expect, it } from "vitest";
import { createPattern } from "@/core/pattern/createPattern";
import { addEntry } from "@/core/pattern/keyEntries";
import { ALL_SYMBOLS } from "@/core/symbols/symbols";
import type { Persistence, Snapshot } from "@/persistence/ports";
import { loadPattern } from "./actions/pattern";
import { Editor } from "./createEditor";
import type { ToolPointer } from "./tools/types";

function memoryPersistence(snaps: Snapshot[]): Persistence {
  return {
    patterns: { list: async () => [], load: async () => null, save: async () => ({ ok: true }), remove: async () => {} },
    references: { load: async () => [], save: async () => ({ ok: true }) },
    draft: { load: () => null, save: () => {} },
    snapshots: { add: async (s) => void snaps.push(s), list: async () => [], get: async () => null, removeMany: async () => {} },
  };
}

const at = (x: number, y: number, o: Partial<ToolPointer> = {}): ToolPointer => ({ sx: 0, sy: 0, grid: { x: x + 0.5, y: y + 0.5 }, cell: { x, y }, button: 0, shift: false, alt: false, ...o });
const key = (k: string, o: Partial<{ shift: boolean; ctrl: boolean; repeat: boolean; inField: boolean }> = {}) => ({
  key: k, shiftKey: !!o.shift, ctrlKey: !!o.ctrl, metaKey: false, altKey: k === "Alt", repeat: o.repeat, inField: o.inField, preventDefault() {},
});

let ed: Editor, snaps: Snapshot[], red: number;

beforeEach(() => {
  snaps = [];
  ed = new Editor(memoryPersistence(snaps), false);
  ed.store.setState({ symbols: [...ALL_SYMBOLS] });
  const p = createPattern(10, 10);
  red = addEntry(p, { t: "thread", src: "dmc:321", n: 2, st: "full" }, ALL_SYMBOLS);
  loadPattern(ed, p);
});

describe("drawing and history", () => {
  it("records a pencil stroke as one undo step and drops empty strokes", () => {
    ed.tools.down(at(1, 1));
    ed.tools.move(at(4, 1));
    ed.tools.up(at(4, 1));
    expect([...ed.doc.layers.stitches.slice(11, 15)]).toEqual([red, red, red, red]);
    ed.tools.down(at(1, 1));
    ed.tools.up(at(1, 1));
    ed.history.undo();
    expect(ed.doc.layers.stitches.some(Boolean)).toBe(false);
    expect(ed.state.canUndo).toBe(false);
    ed.history.redo();
    expect(ed.doc.layers.stitches[12]).toBe(red);
  });

  it("undoes a resize including the size, and a key deletion including its stitches", async () => {
    ed.doc.layers.stitches[0] = red;
    await ed.commands.run("pattern.resize", { w: 20, h: 6, anchor: "topLeft" });
    expect([ed.doc.w, ed.doc.h]).toEqual([20, 6]);
    await ed.commands.run("key.delete", red);
    expect(ed.doc.key[red]).toBeNull();
    ed.history.undo();
    ed.history.undo();
    expect([ed.doc.w, ed.doc.h, ed.doc.layers.stitches[0]]).toEqual([10, 10, red]);
    expect(snaps.map((s) => s.reason)).toEqual(["resize", "deleteKey"]);
  });

  it("uses the backstitch behaviour for backstitch entries", () => {
    const back = addEntry(ed.doc, { t: "back", src: "dmc:310", n: 1 }, ALL_SYMBOLS);
    ed.changed({ keys: true });
    ed.setActiveEntry(back);
    ed.tools.down(at(0, 0, { grid: { x: 0, y: 0 } }));
    ed.tools.up(at(0, 0, { grid: { x: 0, y: 0 } }));
    ed.tools.down(at(3, 0, { grid: { x: 3, y: 0 } }));
    ed.tools.up(at(3, 0, { grid: { x: 3, y: 0 } }));
    expect(ed.doc.layers.segments).toEqual([{ x1: 0, y1: 0, x2: 3, y2: 0, k: back }]);
    ed.shortcuts.keyDown(key("Escape"));
    expect(ed.state.overlay.chain).toBeNull();
  });
});

describe("eraser on a backstitch line (SPEC §6.2)", () => {
  beforeEach(() => {
    ed.doc.layers.stitches.fill(red, 0, 30);
    ed.doc.layers.segments.push({ x1: 0, y1: 1, x2: 5, y2: 1, k: red });
    ed.store.setState({ viewport: { zoom: 20, offX: 0, offY: 0 } });
    ed.setTool("eraser");
  });

  it("highlights the line on hover and hides the cell cursor", () => {
    ed.tools.move(at(2, 0, { grid: { x: 2.5, y: 1.1 } }));
    expect(ed.state.overlay.eraseHighlight).toHaveLength(1);
    expect(ed.state.overlay.hover).toBeNull();
    ed.tools.move(at(2, 2, { grid: { x: 2.5, y: 2.5 } }));
    expect(ed.state.overlay.eraseHighlight).toBeNull();
  });

  it("deletes only backstitch when the press starts on the line", () => {
    ed.tools.down(at(2, 0, { grid: { x: 2.5, y: 1.1 } }));
    ed.tools.up(at(2, 0, { grid: { x: 2.5, y: 1.1 } }));
    expect(ed.doc.layers.segments).toHaveLength(0);
    expect(ed.doc.layers.stitches[2]).toBe(red);
    ed.history.undo();
    expect(ed.doc.layers.segments).toHaveLength(1);
  });

  it("erases cells and nearby backstitch when the press starts elsewhere", () => {
    ed.tools.down(at(2, 2, { grid: { x: 2.5, y: 2.5 } }));
    ed.tools.up(at(2, 2, { grid: { x: 2.5, y: 2.5 } }));
    expect(ed.doc.layers.stitches[22]).toBe(0);
    expect(ed.doc.layers.segments).toHaveLength(1);
  });

  it("also hits the mirror image of the line", () => {
    ed.store.setState({ mirror: "vertical" });
    ed.doc.layers.segments = [{ x1: 8, y1: 4, x2: 9, y2: 4, k: red }];
    ed.doc.layers.stitches[41] = red;
    ed.tools.down(at(1, 3, { grid: { x: 1.5, y: 4 } }));
    ed.tools.up(at(1, 3, { grid: { x: 1.5, y: 4 } }));
    expect(ed.doc.layers.segments).toHaveLength(0);
    expect(ed.doc.layers.stitches[41]).toBe(red);
  });
});

describe("shortcuts", () => {
  it("tells R from Shift+R and ignores keys while typing", () => {
    ed.shortcuts.keyDown(key("R", { shift: true }));
    expect(ed.state.tool).toBe("filledRect");
    ed.shortcuts.keyDown(key("r"));
    expect(ed.state.tool).toBe("rect");
    ed.shortcuts.keyDown(key("e", { inField: true }));
    expect(ed.state.tool).toBe("rect");
  });

  it("holding Alt picks; releasing returns to the pencil after picking while erasing", () => {
    ed.doc.layers.stitches[0] = red;
    ed.setTool("eraser");
    ed.store.setState({ activeEntry: 0 });
    ed.shortcuts.keyDown(key("Alt"));
    ed.shortcuts.keyDown(key("Alt", { repeat: true }));
    ed.tools.down(at(0, 0));
    expect(ed.state.activeEntry).toBe(red);
    expect(ed.state.tool).toBe("eraser");
    ed.shortcuts.keyUp(key("Alt"));
    expect(ed.state.tool).toBe("pencil");
  });

  it("Esc cancels a floating move before it deselects", () => {
    ed.doc.layers.stitches[0] = red;
    ed.selection.all();
    ed.shortcuts.keyDown(key("ArrowRight"));
    expect(ed.state.floating).not.toBeNull();
    ed.shortcuts.keyDown(key("Escape"));
    expect(ed.state.floating).toBeNull();
    expect(ed.doc.layers.stitches[0]).toBe(red);
    ed.selection.all();
    ed.shortcuts.keyDown(key("Escape"));
    expect(ed.state.selection).toBeNull();
  });
});

describe("selection", () => {
  it("flips, replaces keys in and crops to the selection", async () => {
    const half = addEntry(ed.doc, { t: "thread", src: "dmc:321", n: 2, st: "half" }, ALL_SYMBOLS);
    ed.changed({ keys: true });
    ed.doc.layers.stitches.set([half, red], 11);
    ed.selection.selectRect({ x: 1, y: 1, w: 2, h: 1 }, false);
    await ed.commands.run("selection.flipH");
    expect(ed.doc.key[ed.doc.layers.stitches[12]!]).toMatchObject({ st: "halfb" });
    expect(ed.doc.layers.stitches[11]).toBe(red);
    await ed.commands.run("selection.replaceKey", { from: red, to: half });
    expect(ed.doc.layers.stitches[11]).toBe(half);
    ed.selection.selectSame({ x: 1, y: 1 }, true, false);
    await ed.commands.run("selection.crop");
    expect([ed.doc.w, ed.doc.h]).toEqual([1, 1]);
  });

  it("moves the selection as one undo step and pastes into another pattern", () => {
    ed.doc.layers.stitches[0] = red;
    ed.selection.selectRect({ x: 0, y: 0, w: 1, h: 1 }, false);
    ed.selection.nudge(2, 1);
    ed.selection.commitFloating();
    expect(ed.doc.layers.stitches[12]).toBe(red);
    expect(ed.doc.layers.stitches[0]).toBe(0);
    ed.selection.copy();
    ed.history.undo();
    expect(ed.doc.layers.stitches[0]).toBe(red);

    loadPattern(ed, createPattern(5, 5));
    ed.store.setState({ hoverCell: { x: 1, y: 1 } });
    ed.selection.paste();
    ed.selection.commitFloating();
    const k = ed.doc.layers.stitches[6]!;
    expect(ed.doc.key[k]).toMatchObject({ src: "dmc:321", st: "full" });
  });
});
