import { describe, expect, it } from "vitest";
import { ALL_SYMBOLS } from "../symbols/symbols";
import { createPattern } from "./createPattern";
import { addEntry } from "./keyEntries";
import { patternStats } from "./stats";

describe("patternStats: the figures on the patterns list", () => {
  it("an empty pattern has none", () => {
    const p = createPattern(5, 5, "Empty");
    expect(patternStats(p)).toEqual({ colours: 0, stitches: 0, beads: 0, backstitch: 0, count: p.count, spent: 0 });
  });

  it("counts key entries, every kind of cross stitch, beads and backstitch, with the fabric count and time spent", () => {
    const p = createPattern(6, 4, "Rich");
    p.spent = 90_000;
    const cross = addEntry(p, { t: "thread", src: "dmc:310", n: 2, st: "full" }, ALL_SYMBOLS);
    const half = addEntry(p, { t: "thread", src: "dmc:321", n: 2, st: "halfb" }, ALL_SYMBOLS);
    const bead = addEntry(p, { t: "bead", src: "bead:00557" }, ALL_SYMBOLS);
    const line = addEntry(p, { t: "back", src: "dmc:310", n: 1 }, ALL_SYMBOLS);
    p.layers.stitches[0] = cross;
    p.layers.stitches[1] = cross;
    p.layers.stitches[2] = half;
    p.layers.partials.set(3, [{ kind: "quarter", corner: 1, k: cross }, { kind: "petite", corner: 3, k: cross }]);
    p.layers.beads[4] = bead;
    p.layers.segments.push({ x1: 0, y1: 0, x2: 2, y2: 0, k: line });

    const s = patternStats(p);
    expect(s.colours).toBe(4);
    expect(s.stitches).toBe(5);
    expect(s.beads).toBe(1);
    expect(s.backstitch).toBeGreaterThan(0);
    expect(s.spent).toBe(90_000);
    expect(s.count).toBe(p.count);
  });
});
