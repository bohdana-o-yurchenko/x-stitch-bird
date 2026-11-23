import { describe, expect, it } from "vitest";
import { ALL_SYMBOLS } from "../symbols/symbols";
import { createPattern } from "./createPattern";
import { groupsIn } from "./groups";
import { addEntry } from "./keyEntries";

describe("the kinds of stitches a chart has (SPEC §15.16)", () => {
  it("lists only what is on the chart, in the usual order; floss + bead counts as a bead", () => {
    const p = createPattern(6, 6, "R");
    expect(groupsIn(p)).toEqual([]);
    const cross = addEntry(p, { t: "thread", src: "dmc:310", n: 2, st: "full" }, ALL_SYMBOLS);
    const knot = addEntry(p, { t: "knot", src: "dmc:321", n: 2 }, ALL_SYMBOLS);
    p.layers.knots.push({ x: 1, y: 1, k: knot });
    expect(groupsIn(p)).toEqual(["knots"]);
    p.combos["combo:a"] = { thread: "dmc:321", bead: "bead:00557" };
    const combo = addEntry(p, { t: "combo", src: "combo:a", n: 2, st: "full" }, ALL_SYMBOLS);
    p.layers.stitches[3] = combo;
    expect(groupsIn(p)).toEqual(["knots", "beads"]);
    p.layers.stitches[4] = cross;
    p.layers.partials.set(8, [{ kind: "quarter", corner: 0, k: cross }]);
    p.layers.segments.push({ x1: 0, y1: 0, x2: 1, y2: 0, k: knot });
    expect(groupsIn(p)).toEqual(["crosses", "partials", "backstitch", "knots", "beads"]);
    // an entry no longer in the key doesn't count
    p.layers.partials.set(8, [{ kind: "quarter", corner: 0, k: 99 }]);
    expect(groupsIn(p)).not.toContain("partials");
  });
});
