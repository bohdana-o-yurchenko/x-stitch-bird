import { describe, expect, it } from "vitest";
import { brushCells, floodRegion, halfPointsBetween, lineCells, rectCells, snapHalf } from "./geometry";

describe("cell geometry", () => {
  it("draws straight lines cell by cell, both ends included, in any direction", () => {
    expect(lineCells({ x: 0, y: 0 }, { x: 3, y: 0 })).toEqual([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }]);
    expect(lineCells({ x: 2, y: 2 }, { x: 0, y: 0 })).toEqual([{ x: 2, y: 2 }, { x: 1, y: 1 }, { x: 0, y: 0 }]);
    expect(lineCells({ x: 1, y: 1 }, { x: 1, y: 1 })).toEqual([{ x: 1, y: 1 }]);
    // a shallow line never skips a column
    expect(lineCells({ x: 0, y: 0 }, { x: 6, y: 2 }).map((c) => c.x)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("makes rectangles, outlined or filled, whichever corners are given", () => {
    expect(rectCells({ x: 2, y: 2 }, { x: 0, y: 0 }, true)).toHaveLength(9);
    const outline = rectCells({ x: 0, y: 0 }, { x: 2, y: 2 }, false);
    expect(outline).toHaveLength(8);
    expect(outline).not.toContainEqual({ x: 1, y: 1 });
  });

  it("centres the brush like the original app and clips it to the chart", () => {
    const size = { w: 5, h: 5 };
    expect(brushCells(2, 2, 1, size)).toEqual([{ x: 2, y: 2 }]);
    // even sizes extend right and down
    expect(brushCells(2, 2, 2, size)).toEqual([{ x: 2, y: 2 }, { x: 3, y: 2 }, { x: 2, y: 3 }, { x: 3, y: 3 }]);
    expect(brushCells(0, 0, 3, size)).toEqual([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }]);
    expect(brushCells(4, 4, 3, size)).toHaveLength(4);
  });

  it("flood-fills the 4-connected region only", () => {
    // . # .
    // # # .
    // . . #   (the diagonal cell is not connected)
    const cells = [0, 1, 0, 1, 1, 0, 0, 0, 1];
    expect(floodRegion(1, { w: 3, h: 3 }, (i) => cells[i] === 1).sort()).toEqual([1, 3, 4]);
    expect(floodRegion(0, { w: 3, h: 3 }, (i) => cells[i] === 1)).toEqual([]);
    expect(floodRegion(0, { w: 3, h: 3 }, () => true)).toHaveLength(9);
  });

  it("snaps to half-grid points inside the chart", () => {
    const size = { w: 10, h: 10 };
    expect(snapHalf({ x: 1.2, y: 1.3 }, size)).toEqual({ x: 1, y: 1.5 });
    expect(snapHalf({ x: -3, y: 99 }, size)).toEqual({ x: 0, y: 10 });
  });

  it("lists the half-grid points passed while dragging, each once", () => {
    expect(halfPointsBetween({ x: 0, y: 0 }, { x: 1.5, y: 0 })).toEqual([{ x: 0.5, y: 0 }, { x: 1, y: 0 }, { x: 1.5, y: 0 }]);
    expect(halfPointsBetween({ x: 1, y: 1 }, { x: 1, y: 1 })).toEqual([{ x: 1, y: 1 }]);
  });
});
