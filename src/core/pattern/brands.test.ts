import { describe, expect, it } from "vitest";
import { parsePattern } from "../formats/json/parse";
import { serializePattern } from "../formats/json/serialize";
import { ALL_SYMBOLS } from "../symbols/symbols";
import { createPattern } from "./createPattern";
import { brandCode } from "../catalog/catalog";
import { resolveColor } from "./resolve";
import { canRemoveBeadBrand, canRemoveBrand, nextOrganizerCode, organizerCodeTaken, patternBeadBrands, patternBrands, ORGANIZER, usedThreadBrands } from "./brands";
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

const mine = (id: string, kind: "thread" | "bead", code: string) => ({ id, kind, brand: ORGANIZER, code, name: "", hex: "#7A9CC6" });

describe("the numbered organizer (SPEC §15.52)", () => {
  it.each([
    ["thread", canRemoveBrand, patternBrands],
    ["bead", canRemoveBeadBrand, patternBeadBrands],
  ] as const)("a %s organizer with colours in it is the only source: brands don't join it, and it can't leave", (kind, canRemove, brandsOf) => {
    const p = createPattern(5, 5);
    p.customs["custom:1"] = mine("custom:1", kind, "1");
    // brands that were chosen before don't show beside it, used on the chart or not
    if (kind === "thread") p.brands = ["DMC", "Anchor"];
    else p.beadBrands = ["Mill Hill", "Preciosa"];
    expect(brandsOf(p)).toEqual([ORGANIZER]);
    expect(canRemove(p, ORGANIZER)).toBe(false);
  });

  it("chosen, it replaces brands even before it has numbers; brands chosen with it are dropped", async () => {
    const { applyMaterials, materials, materialsOf, NEW_MATERIALS } = await import("./brands");
    const p = createPattern(5, 5);
    applyMaterials(p, { ...NEW_MATERIALS, brands: ["DMC", ORGANIZER], beadBrands: [ORGANIZER, "Preciosa"] });
    expect([p.brands, p.beadBrands, p.onlyBrand, p.onlyBeadBrand]).toEqual([[ORGANIZER], [ORGANIZER], true, true]);
    expect(materials(p)).toMatchObject({ threads: { brands: [ORGANIZER], single: true }, beads: { brands: [ORGANIZER], single: true } });
    // and back to brands: nothing of the organizer's is left in the way
    applyMaterials(p, { ...materialsOf(p), brands: ["DMC"], onlyBrand: false });
    expect(materials(p).threads).toEqual({ brands: ["DMC"], single: false });
    // floss and beads choose apart
    expect(materials(p).beads.brands).toEqual([ORGANIZER]);
  });

  it("shows as the bare number: no brand in the key's label, no name", () => {
    const p = createPattern(5, 5);
    p.customs["custom:1"] = mine("custom:1", "thread", "7");
    p.customs["custom:2"] = mine("custom:2", "bead", "12");
    const [thread, bead] = [resolveColor(p, "custom:1"), resolveColor(p, "custom:2")];
    expect([brandCode(thread), brandCode(bead)]).toEqual(["7", "Bead 12"]);
    expect([thread?.name, bead?.name]).toEqual(["", ""]);
    // a brand of one's own still reads "Brand code"
    expect(brandCode({ ...thread!, brand: "Kreinik" })).toBe("Kreinik 7");
  });

  it("its colours are numbered 1, 2, 3 … per kind, and a number is taken once (letters' case and spaces aside)", async () => {
    const { materials, applyMaterials, NEW_MATERIALS } = await import("./brands");
    const p = createPattern(5, 5);
    expect(nextOrganizerCode(p, "thread")).toBe("1");
    p.customs["custom:1"] = mine("custom:1", "thread", "1");
    p.customs["custom:3"] = mine("custom:3", "thread", "3");
    p.customs["custom:k"] = { ...mine("custom:k", "thread", "2"), brand: "Kreinik" };
    expect([nextOrganizerCode(p, "thread"), nextOrganizerCode(p, "bead")]).toEqual(["2", "1"]);
    p.customs["custom:a"] = mine("custom:a", "thread", "A 1");
    expect([organizerCodeTaken(p, "thread", " a 1 "), organizerCodeTaken(p, "thread", "a 1", "custom:a"), organizerCodeTaken(p, "bead", "1")]).toEqual([true, false, false]);
    // the only brand: the key form offers nothing but the palette
    applyMaterials(p, { ...NEW_MATERIALS, brands: [ORGANIZER], onlyBrand: true });
    expect(materials(p).threads).toEqual({ brands: [ORGANIZER], single: true });
  });

  it("is kept in the file, as a brand like any other, with its colours", () => {
    const p = createPattern(5, 5);
    p.brands = [ORGANIZER];
    p.onlyBrand = true;
    p.customs["custom:1"] = mine("custom:1", "thread", "1");
    addEntry(p, { t: "thread", src: "custom:1", n: 2, st: "full" }, ALL_SYMBOLS);
    const back = parsePattern(JSON.parse(JSON.stringify(serializePattern(p))), ALL_SYMBOLS).pattern;
    expect([back.brands, back.onlyBrand, back.customs["custom:1"]]).toEqual([[ORGANIZER], true, p.customs["custom:1"]]);
  });
});

describe("threads & beads of a pattern (SPEC §15.31)", () => {
  it("one brand ticked as 'only' means a single brand — until the key uses another", async () => {
    const { applyMaterials, materials, NEW_MATERIALS } = await import("./brands");
    const p = createPattern(5, 5);
    // a pattern that never chose: several brands, beads on with every built-in bead brand
    expect(materials(p)).toMatchObject({ threads: { brands: ["DMC"], single: false }, beads: { on: true, brands: ["Mill Hill", "Preciosa"], single: false } });
    // a new pattern starts with every brand there is (SPEC §15.39)
    expect(NEW_MATERIALS).toMatchObject({ brands: ["DMC", "Anchor", "Madeira", "Dimensions"], onlyBrand: false, beadBrands: ["Mill Hill", "Preciosa"], noBeads: false });
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
