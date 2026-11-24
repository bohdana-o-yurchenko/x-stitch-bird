import { describe, expect, it } from "vitest";
import { changedCells, forEachChangedCell, sameCells } from "./cellDiff";

describe("comparing cell layers", () => {
  it("finds every changed cell, odd and even, including the last of an odd-length layer", () => {
    const a = new Uint16Array(7), b = new Uint16Array(7);
    b[0] = 1;
    b[3] = 2;
    b[6] = 3;
    expect([...changedCells(b, a)]).toEqual([0, 3, 6]);
  });

  it("both cells of a compared pair", () => {
    const a = new Uint16Array(4), b = Uint16Array.from([0, 0, 5, 6]);
    expect([...changedCells(b, a)]).toEqual([2, 3]);
  });

  it("works on views that start at an odd place in their memory", () => {
    const mem = new Uint16Array(9), a = mem.subarray(1), b = new Uint16Array(8);
    a[4] = 9;
    const seen: number[] = [];
    forEachChangedCell(a, b, (i) => seen.push(i));
    expect(seen).toEqual([4]);
  });

  it("same: equal length and values", () => {
    expect(sameCells(Uint16Array.from([1, 2, 3]), Uint16Array.from([1, 2, 3]))).toBe(true);
    expect(sameCells(Uint16Array.from([1, 2, 3]), Uint16Array.from([1, 2, 4]))).toBe(false);
    expect(sameCells(Uint16Array.from([1, 2]), Uint16Array.from([1, 2, 0]))).toBe(false);
  });
});
