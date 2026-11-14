import { describe, expect, it } from "vitest";
import { createPattern } from "../pattern/createPattern";
import { addEntry } from "../pattern/keyEntries";
import { snapshotsToDelete } from "../snapshots/retention";
import { ALL_SYMBOLS } from "../symbols/symbols";
import { CHECKS } from "./registry";
import { optionDefaults } from "./types";

const run = (id: string, p: ReturnType<typeof createPattern>) => {
  const c = CHECKS.find((x) => x.id === id)!;
  return c.run(p, optionDefaults(c));
};

describe("chart checks", () => {
  const p = createPattern(10, 12);
  const red = addEntry(p, { t: "thread", src: "dmc:321", n: 2, st: "full" }, ALL_SYMBOLS);
  const black = addEntry(p, { t: "thread", src: "dmc:310", n: 2, st: "full" }, ALL_SYMBOLS);
  addEntry(p, { t: "thread", src: "dmc:321", n: 2, st: "full" }, ALL_SYMBOLS);
  // symmetric red frame around a vertical axis, with one planted error and one stray stitch
  for (let y = 0; y < 12; y++) for (const x of [0, 1, 8, 9]) p.layers.stitches[y * 10 + x] = red;
  p.layers.stitches[2 * 10 + 9] = black;
  p.layers.stitches[3 * 10 + 5] = black;

  it("finds the stray stitch but not the frame", () => {
    expect(run("isolated", p).map((f) => f.cell)).toEqual([2 * 10 + 9, 3 * 10 + 5]);
  });

  it("reports broken mirror pairs, fixing from the better-supported side", () => {
    const fixes = run("nearSymmetry", p).map((f) => f.suggestion?.[0]);
    expect(fixes).toContainEqual({ to: 29, from: 20 });
    expect(fixes).toContainEqual({ to: 35, from: 34 });
  });

  it("flags unused, rare and duplicate entries", () => {
    expect(run("unusedEntries", p).map((f) => f.entry)).toEqual([3]);
    expect(run("rareEntries", p).map((f) => f.entry)).toEqual([black]);
    expect(run("duplicateEntries", p).map((f) => f.entry)).toEqual([3]);
  });
});

describe("snapshot retention", () => {
  const H = 3_600_000, now = 100 * 24 * H;
  it("keeps the latest ten, then hourly, then daily, and drops older ones", () => {
    const times = [...Array.from({ length: 12 }, (_, i) => now - i * 60_000), now - 3 * H, now - 3 * H + 60_000, now - 3 * 24 * H, now - 30 * 24 * H];
    expect(snapshotsToDelete(times, now).sort()).toEqual([now - 11 * 60_000, now - 3 * H, now - 30 * 24 * H].sort());
  });

  it("never keeps more than the maximum", () => {
    const times = Array.from({ length: 80 }, (_, i) => now - i * 2 * H);
    expect(times.length - snapshotsToDelete(times, now).length).toBeLessThanOrEqual(50);
  });
});
