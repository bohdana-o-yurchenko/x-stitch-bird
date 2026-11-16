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
});
