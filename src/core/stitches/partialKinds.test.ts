import { describe, expect, it } from "vitest";
import type { Corner } from "../pattern/types";
import { nearestCorner, PARTIAL_KINDS, partialAnchor, partialKind } from "./partialKinds";

const corners: Corner[] = [0, 1, 2, 3];
const bits = (n: number) => n.toString(2).split("").filter((b) => b === "1").length;

describe("fractional stitches", () => {
  it("picks the corner nearest to the pointer", () => {
    expect(nearestCorner(0.1, 0.1)).toBe(0);
    expect(nearestCorner(0.9, 0.1)).toBe(1);
    expect(nearestCorner(0.9, 0.9)).toBe(2);
    expect(nearestCorner(0.1, 0.9)).toBe(3);
  });

  it("gives quarters and petites a quarter of the cell, three-quarters half of it", () => {
    for (const c of corners) {
      expect(bits(partialKind("quarter").slots(c))).toBe(2);
      expect(bits(partialKind("petite").slots(c))).toBe(2);
      expect(bits(partialKind("threeQuarter").slots(c))).toBe(4);
    }
  });

  it("lets four quarters share a cell, and opposite three-quarters too", () => {
    const q = partialKind("quarter"), tq = partialKind("threeQuarter");
    expect(corners.reduce<number>((m, c) => m | q.slots(c), 0)).toBe(0xff);
    expect(q.slots(0) & q.slots(1)).toBe(0);
    expect(tq.slots(0) & tq.slots(2)).toBe(0); // opposite corners: the two halves of the cell
    expect(tq.slots(0) & tq.slots(1)).not.toBe(0); // neighbours overlap
    expect(tq.slots(0) & q.slots(0)).not.toBe(0);
  });

  it("outlines each stitch at its own corner, inside the cell", () => {
    const first: Record<number, [number, number]> = { 0: [0, 0], 1: [1, 0], 2: [1, 1], 3: [0, 1] };
    for (const kind of PARTIAL_KINDS)
      for (const c of corners) {
        const poly = kind.polygon(c);
        expect(poly[0]).toEqual(first[c]);
        expect(poly.every(([x, y]) => x >= 0 && x <= 1 && y >= 0 && y <= 1)).toBe(true);
        const [ax, ay] = partialAnchor(kind.id, c);
        // the symbol sits in the stitch's own quadrant
        expect([ax < 0.5, ay < 0.5]).toEqual([first[c]![0] === 0, first[c]![1] === 0]);
      }
    expect(partialKind("petite").polygon(0)).toHaveLength(4);
  });

  it("falls back to a quarter for an unknown kind", () => {
    expect(partialKind("nonsense" as never).id).toBe("quarter");
  });
});
