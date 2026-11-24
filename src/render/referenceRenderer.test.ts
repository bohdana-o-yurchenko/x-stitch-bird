import { describe, expect, it } from "vitest";
import { createPattern } from "@/core/pattern/createPattern";
import { fakeCanvas } from "../../tests/support/fakeCanvas";
import { drawReference, type RefScene } from "./referenceRenderer";
import { defaultCanvasTheme as theme } from "./theme";

/** A 200×100 photo of a 20×10 chart: 10 px a cell. */
function setup(o: Partial<RefScene> = {}) {
  const p = createPattern(20, 10), c = fakeCanvas();
  const image = { width: 200, height: 100 } as RefScene["image"];
  const scene: RefScene = { image, marks: {} as CanvasImageSource, view: { s: 1, tx: 0, ty: 0 }, pattern: p, grid: false, showStitched: false, hoverCell: null, ...o };
  return { p, c, scene, draw: () => drawReference(c.g, 300, 200, scene, theme) };
}

describe("a photo window", () => {
  it("clears to the stage, draws the photo and its marks at half strength, where it's been panned and zoomed", () => {
    const t = setup({ view: { s: 2, tx: 5, ty: 7 } });
    t.draw();
    expect(t.c.calls("fillRect")[0]).toEqual([0, 0, 300, 200]);
    expect(t.c.calls("translate")[0]).toEqual([5, 7]);
    expect(t.c.calls("scale")[0]).toEqual([2, 2]);
    expect(t.c.calls("drawImage")).toHaveLength(2);
    expect(t.c.values("globalAlpha")).toEqual([0.5, 1]);
  });

  it("shades the cells already stitched, and only those", () => {
    const t = setup({ showStitched: true });
    t.p.layers.stitches[0] = 1;
    t.p.layers.beads[12] = 1;
    t.p.layers.partials.set(25, []);
    t.draw();
    // cells 0, 12 and 25 of a 20-wide chart: (0,0), (12,0), (5,1)
    expect(t.c.calls("rect")).toEqual([[0, 0, 10, 10], [120, 0, 10, 10], [50, 10, 10, 10]]);
  });

  it("the stitch grid: thin lines only when zoomed in enough to see them, bold ones every 10 always", () => {
    const near = setup({ grid: true, view: { s: 1, tx: 0, ty: 0 } });
    near.draw();
    const far = setup({ grid: true, view: { s: 0.3, tx: 0, ty: 0 } });
    far.draw();
    expect(near.c.calls("stroke")).toHaveLength(2);
    expect(far.c.calls("stroke")).toHaveLength(1);
    expect(far.c.calls("moveTo")).toContainEqual([100, 0]);
  });

  it("the cell under the pointer on the chart: outlined, with guides to the photo's edges", () => {
    const t = setup({ grid: true, hoverCell: { x: 3, y: 2 } });
    t.draw();
    expect(t.c.calls("strokeRect")).toContainEqual([30, 20, 10, 10]);
    expect(t.c.calls("setLineDash")[0]).toEqual([[4, 4]]);
  });

  it("a pointer off the chart outlines nothing", () => {
    const t = setup({ grid: true, hoverCell: { x: 25, y: 2 } });
    t.draw();
    expect(t.c.calls("setLineDash")).toHaveLength(0);
  });
});
