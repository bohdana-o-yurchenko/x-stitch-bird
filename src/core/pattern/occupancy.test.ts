import { beforeEach, describe, expect, it } from "vitest";
import { ALL_SYMBOLS } from "../symbols/symbols";
import { createPattern } from "./createPattern";
import { addEntry } from "./keyEntries";
import { canPlacePartial, clearForPartial, clearPartialsUnder, isOccupied } from "./occupancy";
import type { Pattern } from "./types";

let p: Pattern, full: number, half: number, bead: number, combo: number;

beforeEach(() => {
  p = createPattern(4, 4);
  p.combos["combo:a"] = { thread: "dmc:310", bead: "bead:00557" };
  full = addEntry(p, { t: "thread", src: "dmc:310", n: 2, st: "full" }, ALL_SYMBOLS);
  half = addEntry(p, { t: "thread", src: "dmc:321", n: 2, st: "half" }, ALL_SYMBOLS);
  bead = addEntry(p, { t: "bead", src: "bead:00557" }, ALL_SYMBOLS);
  combo = addEntry(p, { t: "combo", src: "combo:a", n: 2, st: "full" }, ALL_SYMBOLS);
});

const entry = (k: number) => p.key[k]!;

describe("what may share a cell (SPEC §6.2)", () => {
  it("lets a bead sit on a plain stitch but not on another bead or on floss + bead", () => {
    p.layers.stitches[0] = full;
    expect(isOccupied(p, 0, entry(bead))).toBe(false);
    p.layers.beads[0] = bead;
    expect(isOccupied(p, 0, entry(bead))).toBe(true);
    p.layers.stitches[1] = combo;
    expect(isOccupied(p, 1, entry(bead))).toBe(true);
  });

  it("gives floss + bead only a completely empty cell", () => {
    expect(isOccupied(p, 0, entry(combo))).toBe(false);
    p.layers.beads[0] = bead;
    expect(isOccupied(p, 0, entry(combo))).toBe(true);
    p.layers.partials.set(1, [{ kind: "quarter", corner: 0, k: full }]);
    expect(isOccupied(p, 1, entry(combo))).toBe(true);
    p.layers.stitches[2] = half;
    expect(isOccupied(p, 2, entry(combo))).toBe(true);
  });

  it("lets a half cross share a cell with quarters, a full cross with nothing", () => {
    p.layers.partials.set(0, [{ kind: "quarter", corner: 0, k: full }]);
    expect(isOccupied(p, 0, entry(half))).toBe(false);
    expect(isOccupied(p, 0, entry(full))).toBe(true);
    p.layers.partials.set(1, [{ kind: "petite", corner: 0, k: full }]);
    expect(isOccupied(p, 1, entry(half))).toBe(true);
  });

  it("places partial stitches only where nothing overlaps", () => {
    expect(canPlacePartial(p, 0, "quarter", 0)).toBe(true);
    p.layers.partials.set(0, [{ kind: "quarter", corner: 0, k: full }]);
    expect(canPlacePartial(p, 0, "quarter", 0)).toBe(false);
    expect(canPlacePartial(p, 0, "quarter", 2)).toBe(true);
    p.layers.stitches[1] = full;
    expect(canPlacePartial(p, 1, "quarter", 0)).toBe(false);
    p.layers.stitches[2] = half;
    expect(canPlacePartial(p, 2, "quarter", 0)).toBe(true);
    expect(canPlacePartial(p, 2, "petite", 0)).toBe(false);
    p.layers.stitches[3] = combo;
    expect(canPlacePartial(p, 3, "quarter", 0)).toBe(false);
  });

  it("override: a new partial clears the full cross and the partials it overlaps, keeps the rest", () => {
    p.layers.stitches[0] = full;
    p.layers.partials.set(0, [{ kind: "quarter", corner: 0, k: full }, { kind: "quarter", corner: 2, k: full }]);
    clearForPartial(p, 0, "quarter", 0);
    expect(p.layers.stitches[0]).toBe(0);
    expect(p.layers.partials.get(0)).toEqual([{ kind: "quarter", corner: 2, k: full }]);
    clearForPartial(p, 0, "threeQuarter", 2);
    expect(p.layers.partials.has(0)).toBe(false);
    // a half cross stays under a quarter
    p.layers.stitches[1] = half;
    clearForPartial(p, 1, "quarter", 0);
    expect(p.layers.stitches[1]).toBe(half);
  });

  it("after painting a stitch, drops the partials it covers: all under a full cross, only petites under a half", () => {
    const list = () => [{ kind: "quarter" as const, corner: 0 as const, k: full }, { kind: "petite" as const, corner: 2 as const, k: full }];
    p.layers.partials.set(0, list());
    clearPartialsUnder(p, 0, entry(half));
    expect(p.layers.partials.get(0)).toEqual([list()[0]]);
    p.layers.partials.set(1, list());
    clearPartialsUnder(p, 1, entry(full));
    expect(p.layers.partials.has(1)).toBe(false);
    clearPartialsUnder(p, 3, entry(full)); // nothing there: no-op
    expect(p.layers.partials.has(3)).toBe(false);
  });
});
