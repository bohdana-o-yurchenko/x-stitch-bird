import { describe, expect, it } from "vitest";
import { classicSkeins } from "../calculator/classicSkeins";
import { chartTotals, computeUsage } from "../calculator/usage";
import { parsePattern } from "../formats/json/parse";
import { serializePattern } from "../formats/json/serialize";
import { checkPatternKeeper } from "../formats/pdf/patternKeeper";
import { createPattern } from "../pattern/createPattern";
import { addEntry, cleanEntry, entryLayer } from "../pattern/keyEntries";
import { ALL_SYMBOLS } from "../symbols/symbols";
import { entryPlacement, isPointBead } from "./registry";

/** A pattern with one floss + bead sewn on grid points (3 of them) and one in a cell, as a half cross. */
function sample() {
  const p = createPattern(6, 6);
  p.combos["combo:a"] = { thread: "dmc:310", bead: "bead:00557" };
  const point = addEntry(p, { t: "combo", src: "combo:a", n: 1, st: "point" }, ALL_SYMBOLS);
  const cell = addEntry(p, { t: "combo", src: "combo:a", n: 1, st: "half" }, ALL_SYMBOLS);
  p.layers.knots.push({ x: 1, y: 1, k: point }, { x: 2, y: 1.5, k: point }, { x: 3, y: 3, k: point });
  p.layers.stitches[0] = cell;
  return { p, point, cell };
}

describe("floss + bead on a grid point (like a French knot)", () => {
  it("is placed and stored like a knot; other kinds and stitches stay in their cells", () => {
    const { p, point, cell } = sample();
    expect([isPointBead(p.key[point]!), entryPlacement(p.key[point]!), entryLayer(p.key[point]!)]).toEqual([true, "point", "knots"]);
    expect([entryPlacement(p.key[cell]!), entryLayer(p.key[cell]!)]).toEqual(["cell", "stitches"]);
    // only floss + bead may sit on a point: a cross stitch falls back to a full cross
    expect(cleanEntry({ t: "thread", src: "dmc:310", n: 2, st: "point" }, "A").st).toBe("full");
    const back = parsePattern(serializePattern(p), ALL_SYMBOLS).pattern;
    expect(back.key[point]!.st).toBe("point");
    expect(back.layers.knots.map((k) => k.k)).toEqual([point, point, point]);
  });

  it("counts as beads (not knots), with a little floss to tack each one on", () => {
    const { p } = sample();
    const usage = computeUsage(p), totals = chartTotals(p, usage);
    expect([totals.beads, totals.knots, totals.half]).toEqual([4, 0, 1]);
    const lines = classicSkeins.calculate({ pattern: p, usage, settings: {} }).lines;
    expect(lines.find((l) => l.item.id === "bead:00557")?.quantity).toBe(4);
    expect(lines.some((l) => l.item.id === "dmc:310")).toBe(true);
    // Pattern Keeper: a combo, not a knot
    expect(checkPatternKeeper(p).issues).toEqual([{ kind: "combo", count: 4 }]);
  });

  it("works for a plain bead too: in its cell by default, or between cells", () => {
    const p = createPattern(6, 6);
    const inCell = addEntry(p, { t: "bead", src: "bead:00557" }, ALL_SYMBOLS);
    const between = addEntry(p, { t: "bead", src: "bead:02011", st: "point" }, ALL_SYMBOLS);
    expect([p.key[inCell]!.st, p.key[between]!.st]).toEqual([undefined, "point"]);
    expect([entryLayer(p.key[inCell]!), entryLayer(p.key[between]!)]).toEqual(["beads", "knots"]);
    p.layers.beads[0] = inCell;
    p.layers.knots.push({ x: 2, y: 2, k: between }, { x: 3, y: 2, k: between });
    const usage = computeUsage(p);
    expect([chartTotals(p, usage).beads, chartTotals(p, usage).knots]).toEqual([3, 0]);
    expect(classicSkeins.calculate({ pattern: p, usage, settings: {} }).lines.map((l) => [l.item.id, l.quantity])).toEqual([["bead:00557", 1], ["bead:02011", 2]]);
    expect(checkPatternKeeper(p).issues).toEqual([{ kind: "bead", count: 3 }]);
    expect(parsePattern(serializePattern(p), ALL_SYMBOLS).pattern.key[between]!.st).toBe("point");
  });
});
