import { describe, expect, it } from "vitest";
import { BEAD_SERIES, BEADS, libraryColor, matchesQuery } from "./catalog";
import { beadShape } from "./beadShapes";

const bead = (code: string) => libraryColor(`bead:${code}`)!;

describe("Mill Hill catalog", () => {
  it("has every series, Treasures included, and no code twice", () => {
    expect(BEAD_SERIES).toEqual(["Glass Seed", "Crayon Seed", "Petite Glass", "Antique Glass", "Frosted Glass", "Magnifica", "Size 8", "Size 6", "Pebble", "Small Bugle", "Medium Bugle", "Large Bugle", "Glass Treasures", "Crystal Treasures", "Metal Treasures"]);
    expect(new Set(BEADS.map((b) => b.id)).size).toBe(BEADS.length);
    expect(BEADS.filter((b) => b.series?.endsWith("Treasures"))).toHaveLength(269);
  });

  it("knows how many beads come in a package: per series, with the inventory's exceptions", () => {
    // the glass bead inventory: seed and petite 500, antique 250, larger beads fewer
    expect([bead("00557"), bead("40557"), bead("03002"), bead("62014"), bead("02058")].map((b) => b.pack)).toEqual([500, 500, 250, 500, 500]);
    expect([bead("10001"), bead("18002"), bead("16002"), bead("05002")].map((b) => b.pack)).toEqual([400, 275, 100, 30]);
    expect([bead("70020"), bead("80020"), bead("90020")].map((b) => b.pack)).toEqual([135, 75, 40]);
    // Glass Seed marked "+" (250) and "≈" (about 450)
    expect([bead("00221").pack, bead("02033").pack]).toEqual([250, 450]);
    // Treasures: pieces per package, each its own
    expect([bead("12005").pack, bead("12159").pack, bead("13001").pack, bead("15001").pack]).toEqual([1, 2, 3, 4]);
    expect(BEADS.every((b) => (b.pack ?? 0) >= 1)).toBe(true);
  });

  it("colours a Treasure from its photo, with no made-up DMC equivalent; glass beads keep theirs", () => {
    const heart = bead("13042");
    expect(heart.name).toMatch(/^Small Heart Siam/);
    expect(heart.series).toBe("Crystal Treasures");
    expect(heart.dmc).toBeUndefined();
    expect(heart.hex).not.toBe("#B0B0B0");
    expect(bead("00557").dmc).toBe("676");
    // in the 2015 conversion chart
    expect([bead("02101").dmc, bead("02062").dmc, bead("42101").dmc]).toEqual(["327", "666", "327"]);
    expect(matchesQuery(heart, "treasures")).toBe(true);
    expect(beadShape(heart.series).r).toBeGreaterThan(0.4);
  });
});
