import { describe, expect, it } from "vitest";
import { checkPatternKeeper } from "../formats/pdf/patternKeeper";
import { ALL_SYMBOLS } from "../symbols/symbols";
import { CHICKADEE, DEMO_KREINIK, demoPattern } from "./demo";
import { groupsIn } from "./groups";
import { resolveColor } from "./resolve";

describe("the demo pattern (SPEC §15.53)", () => {
  const demo = demoPattern(ALL_SYMBOLS);
  const entries = demo.key.slice(1).map((e) => e!);

  it("shows every kind of entry, each with its own symbol", () => {
    expect(new Set(entries.map((e) => e.t))).toEqual(new Set(["thread", "combo", "bead", "back"]));
    expect(entries.some((e) => e.src.startsWith("blend:"))).toBe(true);
    expect(entries.some((e) => e.t === "thread" && e.st === "half")).toBe(true);
    expect(new Set(entries.map((e) => e.sym)).size).toBe(entries.length);
    expect(checkPatternKeeper(demo).issues.map((i) => i.kind)).toEqual(["half", "combo", "bead", "back"]);
    expect(groupsIn(demo)).toEqual(["crosses", "backstitch", "beads"]);
  });

  it("every entry is used and every colour resolves — the Kreinik gold too", () => {
    const used = new Set([...demo.layers.stitches, ...demo.layers.beads, ...demo.layers.segments.map((s) => s.k)]);
    entries.forEach((e, i) => {
      expect(used.has(i + 1)).toBe(true);
      expect(resolveColor(demo, e.src)).toBeDefined();
    });
    expect(entries.find((e) => e.src === DEMO_KREINIK.id)?.t).toBe("back");
  });

  it("the chickadee's rows are one width, and it sits whole inside the 60 × 60 frame", () => {
    expect(new Set(CHICKADEE.map((r) => r.length)).size).toBe(1);
    expect([demo.w, demo.h]).toEqual([60, 60]);
    const eye = demo.key.findIndex((e) => e?.t === "combo");
    expect(demo.layers.stitches.filter((k) => k === eye)).toHaveLength(5); // the eye and the frame's four corners
  });
});
