import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { at, point, testEditor } from "../../../tests/support/editorHarness";

let t: ReturnType<typeof testEditor>;
beforeEach(() => {
  vi.useFakeTimers(); // toasts remove themselves with a timer
  t = testEditor();
});
afterEach(() => vi.useRealTimers());

describe("shape tools (SPEC §6.2)", () => {
  it("previews a line while dragging and paints it on release, as one undo step", () => {
    const { ed, drag, stitch, red } = t;
    ed.setTool("line");
    ed.tools.down(at(0, 0));
    ed.tools.move(at(3, 3));
    expect(ed.state.overlay.preview).toEqual({ cells: [0, 11, 22, 33], key: red });
    expect(ed.doc.layers.stitches.some(Boolean)).toBe(false);
    ed.tools.up(at(3, 3));
    expect(ed.state.overlay.preview).toBeNull();
    expect([stitch(0, 0), stitch(1, 1), stitch(2, 2), stitch(3, 3)]).toEqual([red, red, red, red]);
    ed.history.undo();
    expect(ed.doc.layers.stitches.some(Boolean)).toBe(false);
    drag([0, 0], [2, 0]);
    ed.history.undo();
    expect(stitch(1, 0)).toBe(0);
  });

  it("draws rectangle outlines and filled rectangles, clipped to the chart", () => {
    const { ed, drag, stitch, red } = t;
    ed.setTool("rect");
    drag([1, 1], [3, 3]);
    expect([stitch(1, 1), stitch(3, 3), stitch(2, 1), stitch(2, 2)]).toEqual([red, red, red, 0]);
    ed.setTool("filledRect");
    drag([8, 8], [12, 12]);
    expect(ed.doc.layers.stitches.slice(88).filter(Boolean)).toHaveLength(2 + 2);
    expect(stitch(9, 9)).toBe(red);
  });

  it("leaves occupied cells out of the preview unless override is on", () => {
    const { ed, red } = t;
    ed.doc.layers.stitches[1] = red;
    ed.setTool("line");
    ed.tools.down(at(0, 0));
    ed.tools.move(at(2, 0));
    expect(ed.state.overlay.preview?.cells).toEqual([0, 2]);
    ed.store.setState({ override: true });
    ed.tools.move(at(2, 0));
    expect(ed.state.overlay.preview?.cells).toEqual([0, 1, 2]);
    ed.tools.cancel();
    expect(ed.state.overlay.preview).toBeNull();
  });

  it("asks for a key entry first", () => {
    const { ed, lastToast } = t;
    ed.setActiveEntry(0);
    ed.setTool("rect");
    ed.tools.down(at(0, 0));
    ed.tools.up(at(2, 2));
    expect(ed.doc.layers.stitches.some(Boolean)).toBe(false);
    expect(lastToast()).toBe("toasts.needKey");
  });
});

describe("fill", () => {
  it("fills the empty region under the pointer and stops at stitches", () => {
    const { ed, red, entry, stitch } = t;
    // a red wall down column 2
    for (let y = 0; y < 10; y++) ed.doc.layers.stitches[y * 10 + 2] = red;
    const blue = entry({ t: "thread", src: "dmc:797", n: 2, st: "full" });
    ed.setTool("fill");
    ed.tools.down(at(0, 0));
    expect([stitch(0, 0), stitch(1, 9), stitch(2, 5), stitch(3, 0)]).toEqual([blue, blue, red, 0]);
    ed.history.undo();
    expect(stitch(0, 0)).toBe(0);
  });

  it("does nothing outside the chart and explains that lines and knots can't be filled", () => {
    const { ed, entry, lastToast } = t;
    ed.setTool("fill");
    ed.tools.down(at(-1, 0));
    expect(ed.state.canUndo).toBe(false);
    entry({ t: "back", src: "dmc:310", n: 1 });
    ed.tools.down(at(0, 0));
    expect(lastToast()).toBe("toasts.fillBackstitch");
    expect(ed.doc.layers.stitches.some(Boolean)).toBe(false);
  });
});

describe("French knots (SPEC §15.14)", () => {
  it("places knots on the half grid, one per half unit while dragging, as one undo step", () => {
    const { ed, entry } = t;
    const knot = entry({ t: "knot", src: "dmc:321", n: 2, wraps: 2 });
    ed.tools.move(point(1.2, 1.3));
    expect(ed.state.overlay.knotPreview).toEqual({ point: { x: 1, y: 1.5 }, key: knot });
    ed.tools.down(point(1.2, 1.3));
    ed.tools.move(point(2.1, 1.5));
    ed.tools.up(point(2.1, 1.5));
    expect(ed.doc.layers.knots).toEqual([{ x: 1, y: 1.5, k: knot }, { x: 1.5, y: 1.5, k: knot }, { x: 2, y: 1.5, k: knot }]);
    ed.history.undo();
    expect(ed.doc.layers.knots).toEqual([]);
    ed.tools.cancel();
    expect(ed.state.overlay.knotPreview).toBeNull();
  });
});

describe("partial stitches (SPEC §15.13)", () => {
  it("uses the corner nearest the pointer and keeps it while dragging", () => {
    const { ed, red } = t;
    ed.setTool("partial");
    ed.tools.move(at(0, 0, { grid: { x: 0.8, y: 0.2 } }));
    expect(ed.state.overlay.partialPreview).toEqual({ cell: 0, stitch: { kind: "quarter", corner: 1, k: red } });
    ed.tools.down(at(0, 0, { grid: { x: 0.8, y: 0.2 } }));
    ed.tools.move(at(1, 0, { grid: { x: 1.1, y: 0.9 } }));
    ed.tools.up(at(1, 0));
    expect(ed.doc.layers.partials.get(0)).toEqual([{ kind: "quarter", corner: 1, k: red }]);
    expect(ed.doc.layers.partials.get(1)).toEqual([{ kind: "quarter", corner: 1, k: red }]);
    ed.history.undo();
    expect(ed.doc.layers.partials.size).toBe(0);
  });

  it("needs a cross-stitch entry", () => {
    const { ed, entry, lastToast } = t;
    entry({ t: "bead", src: "bead:00557" });
    ed.setTool("partial");
    ed.tools.move(at(0, 0));
    expect(ed.state.overlay.partialPreview).toBeNull();
    ed.tools.down(at(0, 0));
    expect(lastToast()).toBe("toasts.partialNeedsCross");
    expect(ed.doc.layers.partials.size).toBe(0);
  });

  it("paints two petite stitches in a cell during a horizontal drag", () => {
    const { ed, red } = t;
    ed.store.setState({ partialKind: "petite" });
    ed.setTool("partial");
    ed.tools.down(at(0, 0, { grid: { x: 0.1, y: 0.25 } }));
    ed.tools.move(at(0, 0, { grid: { x: 0.9, y: 0.25 } }));
    ed.tools.up(at(0, 0));
    expect(ed.doc.layers.partials.get(0)).toEqual([
      { kind: "petite", corner: 0, k: red },
      { kind: "petite", corner: 1, k: red },
    ]);
    ed.history.undo();
    expect(ed.doc.layers.partials.size).toBe(0);
  });

  it("samples petite quadrants across fast horizontal and vertical drags without duplicates", () => {
    const { ed, red } = t;
    ed.store.setState({ partialKind: "petite", override: true });
    ed.setTool("partial");
    ed.tools.down(at(0, 0, { grid: { x: 0.25, y: 0.25 } }));
    ed.tools.move(at(3, 0, { grid: { x: 3.75, y: 0.25 } }));
    ed.tools.move(at(3, 0, { grid: { x: 3.75, y: 0.25 } }));
    ed.tools.up(at(3, 0));
    for (let x = 0; x <= 3; x++) {
      expect(ed.doc.layers.partials.get(x), `horizontal cell ${x}`).toEqual([
        { kind: "petite", corner: 0, k: red },
        { kind: "petite", corner: 1, k: red },
      ]);
    }
    ed.history.undo();
    expect(ed.doc.layers.partials.size).toBe(0);

    ed.tools.down(at(0, 0, { grid: { x: 0.25, y: 0.25 } }));
    ed.tools.move(at(0, 3, { grid: { x: 0.25, y: 3.75 } }));
    ed.tools.up(at(0, 3));
    for (let y = 0; y <= 3; y++) {
      expect(ed.doc.layers.partials.get(y * ed.doc.w)).toEqual([
        { kind: "petite", corner: 0, k: red },
        { kind: "petite", corner: 3, k: red },
      ]);
    }
  });

  it("keeps three-quarter drags on the original corner per cell", () => {
    const { ed, red } = t;
    ed.store.setState({ partialKind: "threeQuarter" });
    ed.setTool("partial");
    ed.tools.down(at(0, 0, { grid: { x: 0.1, y: 0.1 } }));
    ed.tools.move(at(1, 0, { grid: { x: 1.9, y: 0.9 } }));
    ed.tools.up(at(1, 0));
    expect(ed.doc.layers.partials.get(0)).toEqual([{ kind: "threeQuarter", corner: 0, k: red }]);
    expect(ed.doc.layers.partials.get(1)).toEqual([{ kind: "threeQuarter", corner: 0, k: red }]);
  });
});

describe("selection tools (SPEC §15.6)", () => {
  it("drags a marquee, adds with Shift, and deselects with a plain click", () => {
    const { ed } = t;
    ed.setTool("select");
    ed.tools.down(at(1, 1));
    ed.tools.move(at(3, 2));
    expect(ed.state.overlay.marquee).toEqual({ x: 1, y: 1, w: 3, h: 2 });
    ed.tools.up(at(3, 2));
    expect(ed.state.overlay.marquee).toBeNull();
    expect(ed.state.selection?.bounds).toEqual({ x: 1, y: 1, w: 3, h: 2 });
    ed.tools.down(at(6, 6, { shift: true }));
    ed.tools.up(at(6, 6, { shift: true }));
    expect(ed.state.selection?.bounds).toEqual({ x: 1, y: 1, w: 6, h: 6 });
    expect(ed.state.selection?.mask.reduce((n, v) => n + v, 0)).toBe(7);
    ed.tools.down(at(8, 8));
    ed.tools.up(at(8, 8));
    expect(ed.state.selection).toBeNull();
  });

  it("dragging inside the selection moves its stitches", () => {
    const { ed, red, stitch } = t;
    ed.doc.layers.stitches[0] = red;
    ed.setTool("select");
    ed.tools.down(at(0, 0));
    ed.tools.up(at(1, 1));
    ed.tools.down(at(0, 0));
    ed.tools.move(at(4, 4));
    ed.tools.up(at(4, 4));
    ed.selection.commitFloating();
    expect([stitch(0, 0), stitch(4, 4)]).toEqual([0, red]);
  });

  it("the magic wand selects the connected stitches of the same entry", () => {
    const { ed, red } = t;
    ed.doc.layers.stitches.set([red, red, 0, red]);
    ed.setTool("magicWand");
    ed.tools.down(at(0, 0));
    expect(ed.state.selection?.bounds).toEqual({ x: 0, y: 0, w: 2, h: 1 });
    ed.tools.down(at(-1, 0)); // outside: ignored
    expect(ed.state.selection?.bounds).toEqual({ x: 0, y: 0, w: 2, h: 1 });
  });
});

describe("panning and picking", () => {
  it("previews the same topmost item it picks, without a cell square, and clears on leave or tool switch", () => {
    const { ed, red, entry } = t;
    const bead = entry({ t: "bead", src: "bead:02011" });
    const back = entry({ t: "back", src: "dmc:321", n: 1 });
    const knot = entry({ t: "knot", src: "dmc:321", n: 2 });
    ed.doc.layers.stitches[11] = red;
    ed.doc.layers.beads[11] = bead;
    ed.doc.layers.segments.push({ x1: 1, y1: 1.5, x2: 2, y2: 1.5, k: back });
    ed.doc.layers.knots.push({ x: 1.5, y: 1.5, k: knot });
    ed.setTool("picker");
    ed.tools.move(point(1.5, 1.5));
    expect(ed.state.overlay.pickerHighlight).toEqual({ kind: "knot", point: ed.doc.layers.knots[0], key: knot });
    expect(ed.state.overlay.hover).toBeNull();
    ed.tools.down(point(1.5, 1.5));
    expect(ed.state.activeEntry).toBe(knot);
    ed.setTool("picker");
    ed.doc.layers.knots.length = 0;
    ed.tools.move(point(1.6, 1.5));
    expect(ed.state.overlay.pickerHighlight).toEqual({ kind: "segment", segment: ed.doc.layers.segments[0], key: back });
    ed.doc.layers.segments.length = 0;
    ed.tools.move(point(1.5, 1.5));
    expect(ed.state.overlay.pickerHighlight).toEqual({ kind: "bead", cell: 11, key: bead });
    ed.tools.down(point(1.5, 1.5));
    expect(ed.state.activeEntry).toBe(bead);
    ed.setTool("picker");
    ed.doc.layers.beads[11] = 0;
    ed.tools.move(point(1.5, 1.5));
    expect(ed.state.overlay.pickerHighlight).toBeNull();
    expect(ed.state.overlay.hover).toEqual({ x: 1, y: 1, size: 1 });
    ed.tools.leave();
    expect(ed.state.overlay.pickerHighlight).toBeNull();
    ed.doc.layers.stitches[11] = 0;
    ed.tools.move(point(1.5, 1.5));
    expect(ed.state.overlay.hover).toEqual({ x: 1, y: 1, size: 1 });
    ed.doc.layers.beads[11] = 99;
    ed.tools.move(point(1.5, 1.5));
    expect(ed.state.overlay.pickerHighlight).toBeNull();
    ed.doc.layers.beads[11] = bead;
    ed.tools.move(point(1.5, 1.5));
    expect(ed.state.overlay.pickerHighlight?.kind).toBe("bead");
    ed.setTool("pan");
    expect(ed.state.overlay.pickerHighlight).toBeNull();
  });

  it("previews the partial corner selected by the picker, including its fallback corner", () => {
    const { ed, red, entry } = t;
    const blue = entry({ t: "thread", src: "dmc:797", n: 2, st: "full" });
    ed.doc.layers.partials.set(11, [{ kind: "quarter", corner: 0, k: red }, { kind: "petite", corner: 1, k: blue }]);
    ed.setTool("picker");
    ed.tools.move(point(1.8, 1.2));
    expect(ed.state.overlay.pickerHighlight).toEqual({ kind: "partial", cell: 11, stitch: { kind: "petite", corner: 1, k: blue }, key: blue });
    ed.tools.down(point(1.8, 1.2));
    expect(ed.state.activeEntry).toBe(blue);
    ed.setTool("picker");
    ed.tools.move(point(1.8, 1.8));
    expect(ed.state.overlay.pickerHighlight).toEqual({ kind: "partial", cell: 11, stitch: { kind: "quarter", corner: 0, k: red }, key: red });
  });

  it("pans with the Pan tool, and with the middle button whatever the tool", () => {
    const { ed } = t;
    const start = ed.state.viewport;
    ed.setTool("pan");
    ed.tools.down(at(0, 0, { sx: 10, sy: 10 }));
    expect(ed.tools.cursor()).toBe("grabbing");
    ed.tools.move(at(0, 0, { sx: 40, sy: 25 }));
    ed.tools.up(at(0, 0));
    expect(ed.state.viewport).toMatchObject({ offX: start.offX + 30, offY: start.offY + 15 });
    ed.setTool("pencil");
    ed.tools.down(at(0, 0, { button: 1, sx: 0, sy: 0 }));
    ed.tools.move(at(0, 0, { sx: -5, sy: 0 }));
    ed.tools.up(at(0, 0));
    expect(ed.state.viewport.offX).toBe(start.offX + 25);
    expect(ed.doc.layers.stitches.some(Boolean)).toBe(false);
  });

  it("Alt+click picks the entry under the pointer without drawing", () => {
    const { ed, red, entry } = t;
    ed.doc.layers.stitches[0] = red;
    const blue = entry({ t: "thread", src: "dmc:797", n: 2, st: "full" });
    expect(ed.state.activeEntry).toBe(blue);
    ed.tools.down(at(0, 0, { alt: true }));
    ed.tools.up(at(0, 0));
    expect(ed.state.activeEntry).toBe(red);
    expect(ed.state.canUndo).toBe(false);
  });

  it("shows the brush-sized hover square for drawing tools and clears previews when the pointer leaves", () => {
    const { ed } = t;
    ed.store.setState({ brush: 3 });
    ed.tools.move(at(2, 2));
    expect(ed.state.overlay.hover).toEqual({ x: 2, y: 2, size: 3 });
    ed.tools.leave();
    expect(ed.state.overlay.hover).toBeNull();
    expect(ed.state.hoverCell).toBeNull();
  });
});
