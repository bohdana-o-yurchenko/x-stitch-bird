import { describe, expect, it } from "vitest";
import { boundsOfCells, boundsOfPoints, inBounds, pointInBounds, pointInMask, segmentDistance, unionRect } from "./maskGeometry";

describe("mask geometry", () => {
  const size = { w: 3, h: 3 };
  // only the centre cell is selected
  const mask = Uint8Array.from([0, 0, 0, 0, 1, 0, 0, 0, 0]);

  it("counts points inside a masked cell and on its outline", () => {
    expect(pointInMask(1.5, 1.5, mask, size)).toBe(true); // centre
    expect(pointInMask(1, 1, mask, size)).toBe(true); // its corner
    expect(pointInMask(2, 1.5, mask, size)).toBe(true); // its edge
    expect(pointInMask(0.5, 0.5, mask, size)).toBe(false);
    expect(pointInMask(0, 0, mask, size)).toBe(false);
    expect(pointInMask(3, 3, mask, size)).toBe(false);
  });

  it("tells cells from grid points at the chart's edge", () => {
    expect(inBounds(2, 2, size)).toBe(true);
    expect(inBounds(3, 0, size)).toBe(false);
    expect(pointInBounds(3, 3, size)).toBe(true); // the far corner is a valid point
    expect(pointInBounds(3.5, 0, size)).toBe(false);
  });

  it("finds the rectangle around cells and around half-grid points", () => {
    expect(boundsOfCells([4, 8], 3)).toEqual({ x: 1, y: 1, w: 2, h: 2 });
    expect(boundsOfCells([], 3)).toBeNull();
    // a line from (0.5, 1) to (2, 1) touches cells 0..1 across and row 1
    expect(boundsOfPoints([[0.5, 1], [2, 1]])).toEqual({ x: 0, y: 1, w: 2, h: 1 });
    expect(boundsOfPoints([[1, 1]])).toEqual({ x: 1, y: 1, w: 1, h: 1 });
    expect(boundsOfPoints([])).toBeNull();
  });

  it("joins rectangles, treating null as empty", () => {
    const a = { x: 0, y: 0, w: 2, h: 2 }, b = { x: 3, y: 1, w: 1, h: 4 };
    expect(unionRect(a, b)).toEqual({ x: 0, y: 0, w: 4, h: 5 });
    expect(unionRect(null, b)).toBe(b);
    expect(unionRect(a, null)).toBe(a);
    expect(unionRect(null, null)).toBeNull();
  });

  it("measures the distance to a segment, not to its endless line", () => {
    expect(segmentDistance(1, 1, 0, 0, 2, 0)).toBe(1);
    expect(segmentDistance(5, 0, 0, 0, 2, 0)).toBe(3); // past the end
    expect(segmentDistance(3, 4, 0, 0, 0, 0)).toBe(5); // a zero-length segment
  });
});
