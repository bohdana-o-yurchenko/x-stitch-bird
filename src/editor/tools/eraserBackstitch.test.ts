import { describe, expect, it } from "vitest";
import { addEntry } from "@/core/pattern/keyEntries";
import { ALL_SYMBOLS } from "@/core/symbols/symbols";
import { at, point, testEditor } from "../../../tests/support/editorHarness";

describe("eraser dragged across the chart", () => {
  it("clears every cell on the way, even when the pointer jumps over some, in one undo step", () => {
    const { ed, red, drag } = testEditor(10, 3);
    ed.doc.layers.stitches.fill(red);
    ed.setTool("eraser");
    drag([1, 1], [6, 1]);
    expect([...ed.doc.layers.stitches.slice(10, 20)]).toEqual([red, 0, 0, 0, 0, 0, 0, red, red, red]);
    expect(ed.doc.layers.stitches.slice(0, 10).every((v) => v === red)).toBe(true);
    ed.history.undo();
    expect(ed.doc.layers.stitches.every((v) => v === red)).toBe(true);
  });

  it("takes beads with the cells, and leaves what is outside the drag", () => {
    const { ed, red, drag, entry } = testEditor(6, 3);
    const bead = entry({ t: "bead", src: "bead:00557" });
    ed.setActiveEntry(red);
    ed.doc.layers.stitches[7] = red;
    ed.doc.layers.beads[9] = bead;
    ed.doc.layers.stitches[17] = red;
    ed.setTool("eraser");
    drag([1, 1], [3, 1]);
    expect(ed.doc.layers.stitches[7]).toBe(0);
    expect(ed.doc.layers.beads[9]).toBe(0);
    expect(ed.doc.layers.stitches[17]).toBe(red);
  });

  it("a partial stitch goes by the corner under the pointer: the other corner's stays", () => {
    const { ed, red } = testEditor(4, 4);
    ed.doc.layers.partials.set(5, [{ kind: "quarter", corner: 0, k: red }, { kind: "quarter", corner: 2, k: red }]);
    ed.setTool("eraser");
    ed.tools.down(at(1, 1, { grid: { x: 1.1, y: 1.1 } }));
    ed.tools.up(at(1, 1, { grid: { x: 1.1, y: 1.1 } }));
    expect(ed.doc.layers.partials.get(5)).toEqual([{ kind: "quarter", corner: 2, k: red }]);
  });

  it("a press on empty chart changes nothing and leaves no undo step", () => {
    const { ed, drag } = testEditor(5, 5);
    ed.setTool("eraser");
    const before = ed.state.docRevision;
    drag([2, 2]);
    expect(ed.state.canUndo).toBe(false);
    expect(ed.state.docRevision).toBeGreaterThanOrEqual(before);
  });

  it("Esc in the middle of a drag keeps what was erased so far as one undoable step and stops erasing", () => {
    const { ed, red } = testEditor(8, 1);
    ed.doc.layers.stitches.fill(red);
    ed.setTool("eraser");
    ed.tools.down(at(1, 0));
    ed.tools.move(at(3, 0));
    ed.tools.cancel();
    ed.tools.move(at(6, 0));
    expect([...ed.doc.layers.stitches]).toEqual([red, 0, 0, 0, red, red, red, red]);
    ed.history.undo();
    expect(ed.doc.layers.stitches.every((v) => v === red)).toBe(true);
  });
});

describe("backstitch lines", () => {
  function withBackstitch() {
    const t = testEditor(10, 10);
    const back = addEntry(t.ed.doc, { t: "back", src: "dmc:310", n: 1 }, ALL_SYMBOLS);
    t.ed.changed({ keys: true });
    t.ed.setActiveEntry(back);
    return { ...t, back };
  }
  const click = (ed: ReturnType<typeof testEditor>["ed"], x: number, y: number) => {
    ed.tools.down(point(x, y));
    ed.tools.up(point(x, y));
  };

  it("clicks make a chain: each click after the first adds a line from the last point", () => {
    const { ed, back } = withBackstitch();
    click(ed, 0, 0);
    click(ed, 3, 0);
    click(ed, 3, 2);
    expect(ed.doc.layers.segments).toEqual([{ x1: 0, y1: 0, x2: 3, y2: 0, k: back }, { x1: 3, y1: 0, x2: 3, y2: 2, k: back }]);
    expect(ed.state.overlay.chain?.last).toEqual({ x: 3, y: 2 });
  });

  it("dragging from one point to another adds one line", () => {
    const { ed, back } = withBackstitch();
    ed.tools.down(point(1, 1));
    ed.tools.move(point(2, 1));
    ed.tools.up(point(4, 3));
    expect(ed.doc.layers.segments).toEqual([{ x1: 1, y1: 1, x2: 4, y2: 3, k: back }]);
  });

  it("points snap to the half grid, and stay inside the chart", () => {
    const { ed } = withBackstitch();
    click(ed, 0.2, 0.3);
    click(ed, 2.8, 0.74);
    click(ed, 99, -5);
    const pts = ed.doc.layers.segments.map((s) => [s.x1, s.y1, s.x2, s.y2]);
    expect(pts[0]).toEqual([0, 0.5, 3, 0.5]);
    expect(pts.flat().every((v) => v >= 0 && v <= 10 && (v * 2) % 1 === 0)).toBe(true);
  });

  it("a click on the point the chain is at adds nothing", () => {
    const { ed } = withBackstitch();
    click(ed, 2, 2);
    click(ed, 2, 2);
    expect(ed.doc.layers.segments).toHaveLength(0);
  });

  it("Esc ends the chain: the next click starts a new one", () => {
    const { ed } = withBackstitch();
    click(ed, 0, 0);
    click(ed, 2, 0);
    ed.tools.cancel();
    expect(ed.state.overlay.chain).toBeNull();
    click(ed, 5, 5);
    expect(ed.doc.layers.segments).toHaveLength(1);
  });

  it("each line can be undone, and redone", () => {
    const { ed } = withBackstitch();
    click(ed, 0, 0);
    click(ed, 3, 0);
    click(ed, 3, 3);
    ed.history.undo();
    expect(ed.doc.layers.segments).toHaveLength(1);
    ed.history.undo();
    expect(ed.doc.layers.segments).toHaveLength(0);
    ed.history.redo();
    expect(ed.doc.layers.segments).toHaveLength(1);
  });

  it("a click off the chart starts or adds nothing, rather than a line clamped onto the edge", () => {
    const { ed } = withBackstitch();
    click(ed, -3, 4);
    expect(ed.state.overlay.chain).toBeNull();
    click(ed, 2, 2);
    click(ed, 14, 2);
    // a drag from the chain's end released off the chart
    ed.tools.down(point(2, 2));
    ed.tools.up(point(2, -6));
    expect(ed.doc.layers.segments).toEqual([]);
    expect(ed.state.overlay.chain?.last).toEqual({ x: 2, y: 2 });
    // right on the edge it still counts
    click(ed, 10.2, 2);
    expect(ed.doc.layers.segments).toEqual([expect.objectContaining({ x1: 2, y1: 2, x2: 10, y2: 2 })]);
  });

  it("drawing with a mirror also draws the mirrored line", () => {
    const { ed } = withBackstitch();
    ed.store.setState({ mirror: "vertical" });
    click(ed, 1, 2);
    click(ed, 3, 2);
    expect(ed.doc.layers.segments).toHaveLength(2);
    expect(ed.doc.layers.segments.map((s) => [s.x1, s.x2].sort((a, b) => a - b))).toContainEqual([7, 9]);
  });
});

describe("eraser on a bead between cells or a knot (like the picker)", () => {
  function withPointBead() {
    const t = testEditor(6, 6);
    const bead = t.entry({ t: "bead", src: "bead:00557", st: "point" });
    t.ed.doc.layers.stitches.fill(t.red);
    t.ed.doc.layers.knots.push({ x: 2, y: 2, k: bead });
    t.ed.store.setState({ viewport: { zoom: 20, offX: 0, offY: 0 } });
    t.ed.setTool("eraser");
    return { ...t, bead };
  }

  it("highlights the bead on hover, not the cell under it, and hides the cell cursor", () => {
    const { ed, bead } = withPointBead();
    ed.tools.move(point(2.1, 1.9));
    expect(ed.state.overlay.eraseKnots).toEqual([{ x: 2, y: 2, k: bead }]);
    expect(ed.state.overlay.hover).toBeNull();
    ed.tools.move(at(4, 4));
    expect(ed.state.overlay.eraseKnots).toBeNull();
    expect(ed.state.overlay.hover).not.toBeNull();
  });

  it("erases only the bead: the crosses in the cells around it stay", () => {
    const { ed, red } = withPointBead();
    ed.tools.down(point(2.1, 1.9));
    ed.tools.move(point(2.4, 1.9));
    ed.tools.up(point(2.4, 1.9));
    expect(ed.doc.layers.knots).toEqual([]);
    expect(ed.doc.layers.stitches.every((v) => v === red)).toBe(true);
    ed.history.undo();
    expect(ed.doc.layers.knots).toHaveLength(1);
  });

  it("a press away from the bead still clears the cell", () => {
    const { ed } = withPointBead();
    ed.tools.down(at(4, 4));
    ed.tools.up(at(4, 4));
    expect(ed.doc.layers.stitches[4 * 6 + 4]).toBe(0);
    expect(ed.doc.layers.knots).toHaveLength(1);
  });
});

describe("beads between cells and knots off the chart", () => {
  it("a click off the chart places nothing; a drag out stops at the last point on the chart", () => {
    const { ed, entry } = testEditor(6, 6);
    const bead = entry({ t: "bead", src: "bead:00557", st: "point" });
    ed.tools.move(point(-2, 3));
    expect(ed.state.overlay.knotPreview).toBeNull();
    ed.tools.down(point(-2, 3));
    ed.tools.up(point(-2, 3));
    ed.tools.down(point(3, 9));
    ed.tools.up(point(3, 9));
    expect(ed.doc.layers.knots).toEqual([]);
    ed.tools.down(point(5, 3));
    ed.tools.move(point(6, 3));
    ed.tools.move(point(9, 3));
    ed.tools.up(point(9, 3));
    expect(ed.doc.layers.knots).toEqual([{ x: 5, y: 3, k: bead }, { x: 5.5, y: 3, k: bead }, { x: 6, y: 3, k: bead }]);
  });
});
