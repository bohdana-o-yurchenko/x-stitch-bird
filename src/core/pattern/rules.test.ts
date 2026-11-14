import { describe, expect, it } from "vitest";
import { floodRegion, halfPointsBetween, lineCells, snapHalf } from "../geometry/geometry";
import { cellLabel, isMajorLine, majorOffset, parseCellRef, rulerLabels } from "../grid/numbering";
import { ALL_SYMBOLS } from "../symbols/symbols";
import { createPattern } from "./createPattern";
import { addEntry, findSameKey } from "./keyEntries";
import { canPlacePartial, clearForPartial, isOccupied } from "./occupancy";

describe("occupancy (override off)", () => {
  const p = createPattern(3, 1);
  const cross = addEntry(p, { t: "thread", src: "dmc:310", n: 2, st: "full" }, ALL_SYMBOLS);
  const half = addEntry(p, { t: "thread", src: "dmc:310", n: 2, st: "half" }, ALL_SYMBOLS);
  const bead = addEntry(p, { t: "bead", src: "bead:00557" }, ALL_SYMBOLS);
  p.combos["combo:c"] = { thread: "dmc:310", bead: "bead:00557" };
  const combo = addEntry(p, { t: "combo", src: "combo:c", n: 2, st: "full" }, ALL_SYMBOLS);
  p.layers.stitches.set([cross, combo, 0]);
  p.layers.partials.set(2, [{ kind: "quarter", corner: 0, k: cross }]);

  it.each([
    ["a bead may sit on a plain stitch", 0, bead, false],
    ["but not on floss + bead", 1, bead, true],
    ["floss + bead needs an empty cell", 0, combo, true],
    ["a full cross can't cover a quarter", 2, cross, true],
    ["a half cross can share with a quarter", 2, half, false],
  ] as const)("%s", (_name, cell, entry, occupied) => {
    expect(isOccupied(p, cell, p.key[entry]!)).toBe(occupied);
  });

  it("fits two three-quarters along one diagonal, not a third quarter in their corners", () => {
    const q = createPattern(1, 1);
    q.layers.partials.set(0, [{ kind: "threeQuarter", corner: 0, k: 1 }]);
    expect(canPlacePartial(q, 0, "threeQuarter", 2)).toBe(true);
    expect(canPlacePartial(q, 0, "threeQuarter", 1)).toBe(false);
    expect(canPlacePartial(q, 0, "quarter", 2)).toBe(true);
    clearForPartial(q, 0, "threeQuarter", 1);
    expect(q.layers.partials.has(0)).toBe(false);
  });

  it("treats entries as duplicates only with the same colour, strands and stitch", () => {
    expect(findSameKey(p, { t: "thread", src: "dmc:310", n: 2, st: "half" })).toBe(half);
    expect(findSameKey(p, { t: "thread", src: "dmc:310", n: 3, st: "half" })).toBe(0);
  });
});

describe("geometry", () => {
  it("draws gap-free lines", () => expect(lineCells({ x: 0, y: 0 }, { x: 3, y: 1 })).toHaveLength(4));
  it("snaps to the half grid inside the chart", () => expect(snapHalf({ x: 2.3, y: -1 }, { w: 2, h: 2 })).toEqual({ x: 2, y: 0 }));
  it("visits each half point once while dragging", () => expect(halfPointsBetween({ x: 0, y: 0 }, { x: 1, y: 0 })).toEqual([{ x: 0.5, y: 0 }, { x: 1, y: 0 }]));
  it("fills 4-connected regions only", () => {
    const grid = [1, 1, 0, 0, 1, 1, 1, 0, 1];
    expect(floodRegion(0, { w: 3, h: 3 }, (i) => grid[i] === 1).sort()).toEqual([0, 1, 4, 5, 8]);
  });
});

describe("grid numbering", () => {
  const size = { w: 30, h: 20 };
  it("matches the classic rulers by default", () => {
    const g = { x0: 1, y0: 1, label: 10 as const, fromCentre: false };
    expect(rulerLabels(g, "x", size, 10).map((l) => [l.at, l.text])).toEqual([[0, 0], [10, 10], [20, 20], [30, 30]]);
    expect(isMajorLine(10, majorOffset(g, "x", size))).toBe(true);
  });

  it("aligns major lines with a custom first column", () => {
    const g = { x0: 5, y0: 1, label: 10 as const, fromCentre: false };
    expect(cellLabel(g, "x", 0, size)).toBe(5);
    expect(isMajorLine(6, majorOffset(g, "x", size))).toBe(true);
    expect(parseCellRef("12, 3", g, size)).toEqual({ x: 7, y: 2 });
  });

  it("numbers from the centre", () => {
    const g = { x0: 1, y0: 1, label: 10 as const, fromCentre: true };
    expect(cellLabel(g, "x", 15, size)).toBe(0);
    expect(parseCellRef("-15 0", g, size)).toEqual({ x: 0, y: 10 });
    expect(parseCellRef("99, 1", g, size)).toBeNull();
  });
});
