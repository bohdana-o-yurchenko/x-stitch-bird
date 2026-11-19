import { describe, expect, it } from "vitest";
import { FONTS } from "../../../tests/support/otherAppChart";
import { translateEn } from "../../../tests/support/fixtures";
import en from "../../../messages/en.json";
import uk from "../../../messages/uk.json";
import { chartLayout, chartPdf } from "../formats/pdf/chartPdf";
import { checkPatternKeeper, patternKeeperPdf } from "../formats/pdf/patternKeeper";
import type { Pattern, Rect } from "../pattern/types";
import { SUITES, allGroups, allTags } from "./suites";
import { summarize } from "./summary";
import type { CheckItem, Marks } from "./types";

/** Anything of the pattern's, other than the numbers, inside a box (lines and points by both ends / the point). */
function somethingIn(p: Pattern, a: Rect, label: number): boolean {
  const inside = (x: number, y: number) => x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h;
  for (let y = a.y; y < a.y + a.h; y++)
    for (let x = a.x; x < a.x + a.w; x++) {
      const i = y * p.w + x, s = p.layers.stitches[i];
      if ((s && s !== label) || p.layers.beads[i] || p.layers.partials.has(i)) return true;
    }
  return p.layers.segments.some((s) => s.k !== label && inside(s.x1, s.y1) && inside(s.x2, s.y2)) || p.layers.knots.some((k) => inside(k.x, k.y));
}

describe("the test charts (SPEC §15.51)", () => {
  it.each(Object.keys(SUITES) as (keyof typeof SUITES)[])("%s: ids unique, every sample on the chart in its own box, texts in both languages", (kind) => {
    const s = SUITES[kind]();
    expect(new Set(s.items.map((i) => i.id)).size).toBe(s.items.length);
    for (const i of s.items) {
      expect(i.what.en && i.what.uk, i.id).toBeTruthy();
      expect(i.tags.length, i.id).toBeGreaterThan(0);
      if (!i.area) continue;
      expect(i.area.x + i.area.w <= s.pattern.w && i.area.y + i.area.h <= s.pattern.h, i.id).toBe(true);
      expect(somethingIn(s.pattern, i.area, s.label), i.id).toBe(true);
    }
    // boxes don't overlap; checks of the whole file come last
    const boxes = s.items.flatMap((i) => (i.area ? [i.area] : []));
    for (const a of boxes) for (const b of boxes) if (a !== b) expect(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y).toBe(true);
    expect(s.items.findIndex((i) => !i.area) === -1 || s.items.slice(s.items.findIndex((i) => !i.area)).every((i) => !i.area)).toBe(true);
  });

  it("every tag and group has its words in both languages", () => {
    for (const m of [en, uk] as unknown as Record<string, Record<string, Record<string, string>>>[]) {
      for (const tag of allTags()) expect(m.readerCheck!.tags![tag], tag).toBeTruthy();
      for (const g of allGroups()) expect(m.readerCheck!.groups![g], g).toBeTruthy();
    }
  });

  it("OXS: samples keep their numbers (stored marks and docs/IMPORT-PARITY.md refer to them)", () => {
    const ids = SUITES.oxs().items.map((i) => i.id);
    expect(ids).toHaveLength(72);
    expect([ids[25], ids[27], ids[28], ids[40], ids[41], ids[63], ids[67], ids[71]]).toEqual(["beadPetite", "beadSize6", "beadPebble", "quarter", "petite", "knot", "knotWraps", "pointComboEdge"]);
  });

  it("Pattern Keeper: what should be missing is what its PDF leaves out; two pages across", async () => {
    const s = SUITES.pk();
    const report = checkPatternKeeper(s.pattern);
    expect(report.issues.map((i) => i.kind).sort()).toEqual(["back", "bead", "blend", "combo", "half", "knot", "partial"]);
    expect(s.items.filter((i) => i.absent).map((i) => i.id)).toEqual(["blend21", "blend3", "half", "partials", "beads", "combo", "backstitch", "knots"]);
    expect(s.pattern.w).toBeGreaterThan(60);
    const pdf = await patternKeeperPdf(s.pattern, report, { fonts: FONTS });
    expect(pdf.length).toBeGreaterThan(1000);
  });

  it("the PDF chart: two pages across and two down; it is made", async () => {
    const s = SUITES.pdf();
    expect([chartLayout(s.pattern).xs.length, chartLayout(s.pattern).ys.length]).toEqual([2, 2]);
    const pdf = await chartPdf(s.pattern, { fonts: FONTS, t: translateEn });
    expect(pdf.length).toBeGreaterThan(1000);
  });
});

describe("the results in a few lines", () => {
  const item = (id: string, ...tags: string[]): CheckItem => ({ id, group: "g", tags, what: { en: id, uk: id }, area: null });
  const items = [item("a", "dmc"), item("b", "dmc", "strands"), item("own1", "ownBead"), item("own2", "ownBead", "combo"), item("c", "combo"), item("s1", "beadSize"), item("s2", "beadSize"), item("s3", "beadSize")];
  const marks = (bad: string[], unmarked: string[] = []): Marks => Object.fromEntries(items.filter((i) => !unmarked.includes(i.id)).map((i) => [i.id, { v: bad.includes(i.id) ? "issue" : "ok" }]));

  it("everything fine: no lines", () => {
    expect(summarize(items, marks([]))).toEqual({ total: 8, ok: 8, issues: 0, left: 0, lines: [] });
  });

  it("issues only with your own beads: said so, not by the floss + bead they're also in", () => {
    expect(summarize(items, marks(["own1", "own2"])).lines).toEqual([{ tag: "ownBead", issues: 2, of: 2 }]);
  });

  it("all of one thing failing first, then the one partly failing", () => {
    const r = summarize(items, marks(["own1", "own2", "s1", "s3"], ["a"]));
    expect(r.lines).toEqual([{ tag: "ownBead", issues: 2, of: 2 }, { tag: "beadSize", issues: 2, of: 3 }]);
    expect([r.ok, r.issues, r.left]).toEqual([3, 4, 1]);
  });
});
