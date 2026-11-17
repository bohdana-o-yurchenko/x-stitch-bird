import { describe, expect, it } from "vitest";
import { parsePattern } from "../formats/json/parse";
import { serializePattern } from "../formats/json/serialize";
import { ALL_SYMBOLS } from "../symbols/symbols";
import { createPattern } from "./createPattern";
import { canRemoveBrand, patternBrands, usedThreadBrands } from "./brands";
import { addEntry } from "./keyEntries";

const kreinik = { id: "custom:k1", kind: "thread" as const, brand: "Kreinik", code: "032", name: "Pearl", hex: "#EEEEEE" };

describe("a pattern's thread brands (SPEC §15.28)", () => {
  it("a pattern that never chose is DMC; a brand the key uses always shows — in a blend or floss + bead too", () => {
    const p = createPattern(5, 5);
    expect(patternBrands(p)).toEqual(["DMC"]);
    p.customs[kreinik.id] = kreinik;
    p.blends["blend:x"] = { parts: [{ id: "dmc:310", n: 1 }, { id: kreinik.id, n: 1 }] };
    addEntry(p, { t: "thread", src: "blend:x", n: null, st: "full" }, ALL_SYMBOLS);
    expect([...usedThreadBrands(p)].sort()).toEqual(["DMC", "Kreinik"]);
    expect(patternBrands(p)).toEqual(["DMC", "Kreinik"]);
  });

  it("a brand leaves only while no entry uses it, and never the last one", () => {
    const p = createPattern(5, 5);
    p.brands = ["DMC", "Anchor"];
    expect([canRemoveBrand(p, "Anchor"), canRemoveBrand(p, "DMC")]).toEqual([true, true]);
    addEntry(p, { t: "thread", src: "dmc:310", n: 2, st: "full" }, ALL_SYMBOLS);
    expect(canRemoveBrand(p, "DMC")).toBe(false);
    p.brands = ["DMC"];
    p.key = [null];
    expect(canRemoveBrand(p, "DMC")).toBe(false);
  });

  it("is kept in the file only when it says more than DMC", () => {
    const p = createPattern(5, 5);
    expect(serializePattern(p).brands).toBeUndefined();
    p.brands = ["DMC", "Kreinik"];
    const back = parsePattern(JSON.parse(JSON.stringify(serializePattern(p))), ALL_SYMBOLS).pattern;
    expect(back.brands).toEqual(["DMC", "Kreinik"]);
    // junk in a hand-edited file is dropped
    expect(parsePattern({ ...serializePattern(p), brands: ["DMC", "", 3, "DMC"] }, ALL_SYMBOLS).pattern.brands).toEqual(["DMC"]);
  });
});
