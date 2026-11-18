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

describe("threads & beads of a pattern (SPEC §15.31)", () => {
  it("one brand ticked as 'only' means a single brand — until the key uses another", async () => {
    const { applyMaterials, materials, NEW_MATERIALS } = await import("./brands");
    const p = createPattern(5, 5);
    // a pattern that never chose: several brands, beads on with every built-in bead brand
    expect(materials(p)).toMatchObject({ threads: { brands: ["DMC"], single: false }, beads: { on: true, brands: ["Mill Hill", "Preciosa"], single: false } });
    // a new pattern starts with every brand there is (SPEC §15.39)
    expect(NEW_MATERIALS).toMatchObject({ brands: ["DMC", "Anchor", "Madeira"], onlyBrand: false, beadBrands: ["Mill Hill", "Preciosa"], noBeads: false });
    applyMaterials(p, { ...NEW_MATERIALS, brands: ["DMC"], onlyBrand: true });
    expect(materials(p).threads.single).toBe(true);
    p.customs[kreinik.id] = kreinik;
    addEntry(p, { t: "thread", src: kreinik.id, n: 1, st: "full" }, ALL_SYMBOLS);
    expect(materials(p).threads).toEqual({ brands: ["DMC", "Kreinik"], single: false });
  });

  it("beads off: only while the key has none; kept in the file", async () => {
    const { applyMaterials, materials, materialsOf } = await import("./brands");
    const p = createPattern(5, 5);
    applyMaterials(p, { ...materialsOf(p), noBeads: true, beadBrands: ["Preciosa"], onlyBeadBrand: true });
    expect(materials(p).beads.on).toBe(false);
    const back = parsePattern(JSON.parse(JSON.stringify(serializePattern(p))), ALL_SYMBOLS).pattern;
    expect([back.noBeads, back.beadBrands, back.onlyBeadBrand]).toEqual([true, ["Preciosa"], true]);
    addEntry(p, { t: "bead", src: "bead:00557" }, ALL_SYMBOLS);
    expect(materials(p).beads).toMatchObject({ on: true, brands: ["Preciosa", "Mill Hill"], single: false });
    applyMaterials(p, { ...materialsOf(p), noBeads: true });
    expect(p.noBeads).toBeUndefined();
  });
});
