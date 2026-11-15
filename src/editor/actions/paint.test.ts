import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { at, point, testEditor } from "../../../tests/support/editorHarness";

let t: ReturnType<typeof testEditor>;
beforeEach(() => {
  vi.useFakeTimers();
  t = testEditor();
});
afterEach(() => vi.useRealTimers());

describe("painting rules (SPEC §6.2)", () => {
  it("never paints over a stitch unless override is on", () => {
    const { ed, red, entry, drag, stitch } = t;
    drag([0, 0], [2, 0]);
    const blue = entry({ t: "thread", src: "dmc:797", n: 2, st: "full" });
    drag([1, 0], [3, 0]);
    expect([stitch(1, 0), stitch(2, 0), stitch(3, 0)]).toEqual([red, red, blue]);
    ed.store.setState({ override: true });
    drag([1, 0]);
    expect(stitch(1, 0)).toBe(blue);
  });

  it("a bead sits on a stitch; floss + bead takes an empty cell and replaces a loose bead under override", () => {
    const { ed, red, entry, drag, stitch } = t;
    drag([0, 0]);
    const bead = entry({ t: "bead", src: "bead:00557" });
    drag([0, 0], [1, 0]);
    expect([stitch(0, 0), ed.doc.layers.beads[0], ed.doc.layers.beads[1]]).toEqual([red, bead, bead]);
    ed.doc.combos["combo:a"] = { thread: "dmc:310", bead: "bead:02011" };
    const combo = entry({ t: "combo", src: "combo:a", n: 2, st: "full" });
    drag([1, 0], [2, 0]);
    expect([stitch(1, 0), stitch(2, 0)]).toEqual([0, combo]); // cell 1 holds a bead
    ed.store.setState({ override: true });
    drag([1, 0]);
    expect([stitch(1, 0), ed.doc.layers.beads[1]]).toEqual([combo, 0]);
  });

  it("paints with a bigger brush", () => {
    const { ed, drag } = t;
    ed.store.setState({ brush: 3 });
    drag([5, 5]);
    expect(ed.doc.layers.stitches.filter(Boolean)).toHaveLength(9);
  });

  it("filling replaces the entry under the pointer only where they touch", () => {
    const { ed, red, entry, stitch } = t;
    ed.doc.layers.stitches.set([red, red, 0, red]);
    const blue = entry({ t: "thread", src: "dmc:797", n: 2, st: "full" });
    ed.setTool("fill");
    ed.tools.down(at(0, 0)); // on red without override: occupied, nothing happens
    expect(stitch(0, 0)).toBe(red);
    ed.store.setState({ override: true });
    ed.tools.down(at(0, 0));
    expect([stitch(0, 0), stitch(1, 0), stitch(3, 0)]).toEqual([blue, blue, red]);
    ed.tools.down(at(0, 0)); // already that entry: no new undo step
    ed.history.undo();
    expect(stitch(0, 0)).toBe(red);
  });
});

describe("eraser and picker", () => {
  it("erases the cells under the brush: stitches, beads and partial stitches", () => {
    const { ed, red, entry, drag, stitch } = t;
    drag([0, 0], [1, 0]);
    entry({ t: "bead", src: "bead:00557" });
    drag([0, 0]);
    ed.doc.layers.partials.set(2, [{ kind: "quarter", corner: 0, k: red }]);
    ed.setTool("eraser");
    ed.store.setState({ brush: 2 });
    drag([0, 0]);
    expect([stitch(0, 0), stitch(1, 0), ed.doc.layers.beads[0]]).toEqual([0, 0, 0]);
    expect(ed.doc.layers.partials.size).toBe(1); // cell 2 is outside the 2×2 brush
  });

  it("picks knots and lines before beads, beads before the stitch under them", () => {
    const { ed, red, entry, lastToast } = t;
    ed.doc.layers.stitches[0] = red;
    const bead = entry({ t: "bead", src: "bead:00557" });
    ed.doc.layers.beads[0] = bead;
    const knot = entry({ t: "knot", src: "dmc:310", n: 2 });
    ed.doc.layers.knots.push({ x: 0.5, y: 0.5, k: knot });
    ed.setActiveEntry(red);
    ed.setTool("picker");
    ed.tools.down(point(0.5, 0.5));
    expect([ed.state.activeEntry, lastToast()]).toEqual([knot, "toasts.picked"]);
    ed.doc.layers.knots.length = 0;
    ed.setTool("picker");
    ed.tools.down(point(0.5, 0.5));
    expect(ed.state.activeEntry).toBe(bead);
    ed.setTool("picker");
    ed.tools.down(point(5.5, 5.5));
    expect(lastToast()).toBe("toasts.nothingToPick");
    expect(ed.state.activeEntry).toBe(bead);
  });

  it("mirrored knots land on the mirrored half-grid points; an existing knot is replaced only under override", () => {
    const { ed, entry } = t;
    const a = entry({ t: "knot", src: "dmc:310", n: 2 });
    ed.store.setState({ mirror: "vertical" });
    ed.tools.down(point(1, 1));
    ed.tools.up(point(1, 1));
    expect(ed.doc.layers.knots.map((k) => [k.x, k.y]).sort()).toEqual([[1, 1], [9, 1]]);
    ed.store.setState({ mirror: "off" });
    const b = entry({ t: "knot", src: "dmc:321", n: 2 });
    ed.tools.down(point(1, 1));
    ed.tools.up(point(1, 1));
    expect(ed.doc.layers.knots.find((k) => k.x === 1)?.k).toBe(a);
    ed.store.setState({ override: true });
    ed.tools.down(point(1, 1));
    ed.tools.up(point(1, 1));
    expect(ed.doc.layers.knots.find((k) => k.x === 1)?.k).toBe(b);
    expect(ed.doc.layers.knots).toHaveLength(2);
  });
});
