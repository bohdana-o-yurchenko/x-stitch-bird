import { describe, expect, it } from "vitest";
import { createPattern } from "@/core/pattern/createPattern";
import { ContentTracker, TILE } from "./contentTracker";

function setup(w = 40, h = 40) {
  const p = createPattern(w, h);
  const t = new ContentTracker();
  t.reset(p);
  return { p, t };
}

describe("what changed on the chart since it was last drawn", () => {
  it("nothing, when nothing changed", () => {
    const { p, t } = setup();
    expect(t.changes(p)).toEqual([]);
  });

  it("a new pattern, or one of another size, is drawn all again", () => {
    const { t } = setup();
    expect(t.changes(createPattern(40, 40))).toBe("all");
  });

  it("a painted cell: its tile only, and only once", () => {
    const { p, t } = setup();
    p.layers.stitches[17 * 40 + 20] = 3;
    expect(t.changes(p)).toEqual([{ x: TILE, y: TILE, w: TILE, h: TILE }]);
    expect(t.changes(p)).toEqual([]);
  });

  it("tiles at the edge are cut to the chart", () => {
    const { p, t } = setup();
    p.layers.beads[39 * 40 + 39] = 2;
    expect(t.changes(p)).toEqual([{ x: 32, y: 32, w: 8, h: 8 }]);
  });

  it("mirrored painting far apart: two small tiles, not everything between", () => {
    const { p, t } = setup();
    p.layers.stitches[0] = 1;
    p.layers.stitches[39 * 40 + 39] = 1;
    expect(t.changes(p)).toHaveLength(2);
  });

  it("partial stitches added, changed or taken away", () => {
    const { p, t } = setup();
    p.layers.partials.set(5, [{ kind: "quarter", corner: 0, k: 1 }]);
    expect(t.changes(p)).toEqual([{ x: 0, y: 0, w: TILE, h: TILE }]);
    // changed in place still counts
    p.layers.partials.get(5)![0]!.k = 2;
    expect(t.changes(p)).toHaveLength(1);
    p.layers.partials.delete(5);
    expect(t.changes(p)).toHaveLength(1);
    expect(t.changes(p)).toEqual([]);
  });

  it("a backstitch line: the tiles it crosses and the cells beside it", () => {
    const { p, t } = setup();
    p.layers.segments.push({ x1: 15, y1: 2, x2: 17, y2: 2, k: 1 });
    const tiles = t.changes(p) as { x: number; y: number }[];
    expect(tiles.map((r) => [r.x, r.y]).sort()).toEqual([[0, 0], [16, 0]]);
  });

  it("an erased line counts, and so does a knot replaced at the same place", () => {
    const { p, t } = setup();
    p.layers.segments.push({ x1: 30, y1: 30, x2: 31, y2: 31, k: 1 });
    p.layers.knots.push({ x: 5, y: 5, k: 1 });
    t.changes(p);
    p.layers.segments = p.layers.segments.filter(() => false);
    expect(t.changes(p)).not.toEqual([]);
    p.layers.knots.splice(0, 1, { x: 5, y: 5, k: 2 });
    expect(t.changes(p)).not.toEqual([]);
    expect(t.changes(p)).toEqual([]);
  });

  it("the same lines in another order change nothing", () => {
    const { p, t } = setup();
    const a = { x1: 1, y1: 1, x2: 2, y2: 2, k: 1 }, b = { x1: 3, y1: 3, x2: 4, y2: 4, k: 1 };
    p.layers.segments.push(a, b);
    t.changes(p);
    p.layers.segments = [b, a];
    expect(t.changes(p)).toEqual([]);
  });

  it("changes all over a big chart: one full redraw", () => {
    const { p, t } = setup(1000, 1000);
    p.layers.stitches.fill(1);
    expect(t.changes(p)).toBe("all");
  });
});
