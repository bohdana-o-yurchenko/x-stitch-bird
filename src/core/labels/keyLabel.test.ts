import { describe, expect, it } from "vitest";
import { translateEn } from "../../../tests/support/fixtures";
import { brandCode, byHue, byNumber, DMC, libraryColor, matchesQuery } from "../catalog/catalog";
import { customColor } from "../pattern/resolve";
import { createPattern } from "../pattern/createPattern";
import type { KeyEntry } from "../pattern/types";
import { formatLabel, keyLabelData } from "./keyLabel";

const p = createPattern(2, 2);
p.blends["blend:a"] = { parts: [{ id: "dmc:310", n: 1 }, { id: "dmc:321", n: 2 }] };
p.combos["combo:a"] = { thread: "dmc:310", bead: "bead:00557" };
p.customs["custom:x"] = { id: "custom:x", kind: "thread", brand: "Anchor", code: "403", name: "Night", hex: "#000000" };
const label = (e: Omit<KeyEntry, "sym">) => formatLabel(keyLabelData(p, { ...e, sym: "A" }), translateEn);

describe("key labels (SPEC §3.4)", () => {
  it("names every kind of entry", () => {
    expect(label({ t: "thread", src: "dmc:310", n: 2, st: "full" })).toEqual({ title: "DMC 310", sub: "Black · 2 strands · full cross" });
    expect(label({ t: "thread", src: "dmc:310", n: 1, st: "halfb" }).sub).toBe("Black · 1 strand · half cross ╲");
    expect(label({ t: "thread", src: "blend:a", n: null, st: "full" })).toEqual({ title: "Blend 310+321", sub: "1× DMC 310 + 2× DMC 321 · full cross" });
    expect(label({ t: "back", src: "dmc:310", n: 1 }).sub).toBe("Black · 1 strand · backstitch");
    expect(label({ t: "knot", src: "dmc:310", n: 2 }).sub).toBe("Black · 2 strands · French knot");
    expect(label({ t: "bead", src: "bead:00557" })).toEqual({ title: "MH 00557", sub: "Old Gold · bead (Glass Seed)" });
    expect(label({ t: "combo", src: "combo:a", n: 2, st: "half" })).toEqual({ title: "DMC 310 + MH 00557", sub: "2 strands · half cross ╱ · with Old Gold bead" });
    expect(label({ t: "thread", src: "custom:x", n: 2, st: "full" }).title).toBe("Anchor 403");
  });

  it("shows “?” for a colour that no longer exists", () => {
    expect(label({ t: "thread", src: "dmc:nope", n: 2, st: "full" })).toEqual({ title: "?", sub: "? · 2 strands" });
  });
});

describe("thread and bead catalogue", () => {
  it("prints brand and code the way stitchers write them", () => {
    expect(brandCode(libraryColor("dmc:310"))).toBe("DMC 310");
    expect(brandCode(libraryColor("bead:00557"))).toBe("MH 00557");
    expect(brandCode(customColor({ id: "custom:1", kind: "thread", brand: "", code: "77", name: "x", hex: "#111111" }))).toBe("77");
    expect(brandCode(undefined)).toBe("?");
  });

  it("searches by code prefix, name, a bead's DMC equivalent and series", () => {
    const black = libraryColor("dmc:310")!, bead = libraryColor("bead:00557")!;
    expect(matchesQuery(black, "")).toBe(true);
    expect(matchesQuery(black, "31")).toBe(true);
    expect(matchesQuery(black, "10")).toBe(false); // prefix, not substring
    expect(matchesQuery(black, " BLA ")).toBe(true);
    expect(matchesQuery(bead, `dmc ${bead.dmc}`)).toBe(true);
    expect(matchesQuery(bead, "glass seed")).toBe(true);
    expect(matchesQuery(bead, "zzz")).toBe(false);
  });

  it("sorts DMC first by number, or everything by hue", () => {
    const custom = customColor({ id: "custom:1", kind: "thread", brand: "Anchor", code: "1", name: "x", hex: "#ff0000" });
    expect([custom, DMC[1]!, DMC[0]!].sort(byNumber)).toEqual([DMC[0], DMC[1], custom]);
    const sorted = [...DMC.slice(0, 20)].sort(byHue);
    expect(sorted.every((e, i) => !i || sorted[i - 1]!.hue <= e.hue)).toBe(true);
  });
});
