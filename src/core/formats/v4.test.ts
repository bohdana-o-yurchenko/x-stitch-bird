import { describe, expect, it } from "vitest";
import { translateEn } from "../../../tests/support/fixtures";
import { chartTotals, computeUsage } from "../calculator/usage";
import { classicSkeins } from "../calculator/classicSkeins";
import { formatLabel, keyLabelData } from "../labels/keyLabel";
import { createPattern } from "../pattern/createPattern";
import { addEntry } from "../pattern/keyEntries";
import { ALL_SYMBOLS } from "../symbols/symbols";
import { parsePattern } from "./json/parse";
import { serializePattern } from "./json/serialize";
import { exportOxs } from "./oxs/exportOxs";
import { importOxs } from "./oxs/importOxs";

/** A pattern using everything v4 adds on top of the single-file app. */
function richPattern() {
  const p = createPattern(6, 4, "Rich & <new>");
  p.meta = { designer: "A. Designer", copyright: "2026", instructions: "Start centre" };
  p.grid = { x0: 5, y0: 1, label: 5, fromCentre: false };
  p.customs["custom:a"] = { id: "custom:a", kind: "thread", brand: "Anchor", code: "403", name: "Black", hex: "#111111" };
  const cross = addEntry(p, { t: "thread", src: "dmc:310", n: 2, st: "full" }, ALL_SYMBOLS);
  const anchor = addEntry(p, { t: "thread", src: "custom:a", n: 1, st: "halfb" }, ALL_SYMBOLS);
  const knot = addEntry(p, { t: "knot", src: "dmc:321", n: 2, wraps: 2 }, ALL_SYMBOLS);
  p.layers.stitches[0] = cross;
  p.layers.stitches[1] = anchor;
  p.layers.partials.set(2, [{ kind: "threeQuarter", corner: 0, k: cross }, { kind: "threeQuarter", corner: 2, k: anchor }]);
  p.layers.partials.set(3, [{ kind: "quarter", corner: 1, k: cross }, { kind: "petite", corner: 3, k: anchor }]);
  p.layers.knots.push({ x: 1.5, y: 1, k: knot });
  p.layers.ambiguous.add(7);
  return { p, cross, anchor, knot };
}

describe("JSON v4", () => {
  it("round-trips meta, numbering, partial stitches, knots, marks and custom colours", () => {
    const { p } = richPattern();
    const doc = JSON.parse(JSON.stringify(serializePattern(p)));
    expect(doc).toMatchObject({ v: 4, meta: p.meta, grid: p.grid, amb: [7], knots: [[1.5, 1, 3]] });
    expect(serializePattern(parsePattern(doc, ALL_SYMBOLS).pattern)).toEqual(serializePattern(p));
  });

  it("omits v4 fields that are empty, so plain charts look like v3", () => {
    expect(Object.keys(serializePattern(createPattern(5, 5)))).not.toContain("meta");
  });

  it("migrates v1 key entries", () => {
    const v1 = { app: "stitchwork", w: 2, h: 1, pal: [{ id: "dmc:310", sym: "●" }, { id: "bead:00557", sym: "■" }], s: "1,0", b: "0,2", strands: 3 };
    const { pattern } = parsePattern(v1, ALL_SYMBOLS);
    expect(pattern.key.slice(1)).toEqual([{ t: "thread", src: "dmc:310", n: 3, st: "full", sym: "●" }, { t: "bead", src: "bead:00557", sym: "■" }]);
  });

  it("rejects files that are not Stitchwork patterns", () => {
    expect(() => parsePattern({ app: "other" }, ALL_SYMBOLS)).toThrow();
  });
});

describe("OXS with fractional stitches, knots and pattern info", () => {
  it("survives export and import", () => {
    const { p } = richPattern();
    const xml = exportOxs(p);
    expect(xml).toContain('author="A. Designer"');
    expect(xml).toContain('charttitle="Rich &amp; &lt;new&gt;"');
    const { pattern: back, report } = importOxs(xml, ALL_SYMBOLS);
    expect(report.simplified).toBe(0);
    expect(back.meta).toMatchObject({ designer: "A. Designer", copyright: "2026" });
    expect([...back.layers.partials.values()].flat().map((s) => `${s.kind}@${s.corner}`).sort()).toEqual(["petite@3", "quarter@1", "threeQuarter@0", "threeQuarter@2"]);
    expect(back.layers.knots).toEqual([{ x: 1.5, y: 1, k: expect.any(Number) }]);
    expect(back.layers.ambiguous.size).toBe(0);
    expect(Object.values(back.customs).map((c) => c.code)).toEqual(["403"]);
  });

  it("simplifies stitches it cannot represent and reads bead, tent and blend items", () => {
    const xml = `<chart><properties chartwidth="3" chartheight="1" stitchesperinch="16"/>
      <palette><palette_item index="0" number="cloth" color="EEEEEE"/>
        <palette_item index="1" number="DMC 310" name="Black" color="000000" strands="2"/>
        <palette_item index="2" number="00557+310" color="000000"><blend number="00557" strands="1"/><blend number="310" strands="2"/></palette_item>
        <palette_item index="3" number="x" color="ABCDEF"><blend number="3713" strands="1"/><blend number="blanc" strands="1"/></palette_item>
      </palette>
      <partstitches><partstitch x="0" y="0" palindex1="1" palindex2="0" direction="5"/></partstitches>
      <ornaments_inc_knots_and_beads><object x1="1" y1="0" palindex="2" objecttype="tent" direction="1"/><object x1="2" y1="0" palindex="3" objecttype="lazydaisy"/></ornaments_inc_knots_and_beads>
      <backstitches><backstitch x1="0" y1="0" x2="1" y2="1" palindex="1" objecttype="curve"/></backstitches></chart>`;
    const { pattern, report } = importOxs(xml, ALL_SYMBOLS);
    expect(report.simplified).toBe(3);
    expect(pattern.count).toBe(16);
    expect(pattern.fabric).toBe("#EEEEEE");
    expect(pattern.key.slice(1).map((e) => e!.t)).toEqual(["thread", "combo"]);
    expect(Object.values(pattern.blends)[0]!.parts.map((q) => q.id)).toEqual(["dmc:3713", "dmc:White"]);
  });
});

describe("totals and labels with the new stitch kinds", () => {
  it("counts partials and knots and buys thread for them", () => {
    const { p } = richPattern();
    const usage = computeUsage(p);
    expect(chartTotals(p, usage)).toMatchObject({ full: 1, half: 1, quarter: 1, threeQuarter: 2, petite: 1, knots: 1 });
    const lines = classicSkeins.calculate({ pattern: p, usage, settings: {} }).lines;
    expect(lines.map((l) => l.item.code)).toEqual(["310", "321", "403"]);
  });

  it("labels knots with their wraps", () => {
    const { p, knot } = richPattern();
    expect(formatLabel(keyLabelData(p, p.key[knot]!), translateEn)).toEqual({ title: "DMC 321", sub: "Red · 2 strands · French knot, 2 wraps" });
  });
});
