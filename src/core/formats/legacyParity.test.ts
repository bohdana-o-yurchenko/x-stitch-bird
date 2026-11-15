import { describe, expect, it } from "vitest";
import { fixtureJson, fixtureText, translateEn } from "../../../tests/support/fixtures";
import { DMC } from "../catalog/catalog";
import { classicSkeins } from "../calculator/classicSkeins";
import { computeUsage } from "../calculator/usage";
import { findBlends } from "../imageToPattern/findBlends";
import { formatLabel, keyLabelData } from "../labels/keyLabel";
import { LINE_STYLES, symbolText } from "../symbols/lineStyles";
import { ALL_SYMBOLS } from "../symbols/symbols";
import { exportCsv } from "./csv/exportCsv";
import { parsePattern } from "./json/parse";
import { serializePattern } from "./json/serialize";
import { exportOxs } from "./oxs/exportOxs";
import { importOxs } from "./oxs/importOxs";

// Golden outputs recorded from the single-file app (index.html) — tests/fixtures/legacy.
const load1 = () => parsePattern(fixtureJson("1.json"), ALL_SYMBOLS).pattern;

/** OXS import invents random blend/combo/custom ids; rename them by first appearance. */
function normaliseIds(doc: object) {
  const text = JSON.stringify({ ...doc, id: "P" });
  const seen = new Map<string, string>();
  return JSON.parse(text.replace(/(blend|combo|custom):[a-z0-9]+/g, (m, kind) => {
    if (!seen.has(m)) seen.set(m, `${kind}:${seen.size}`);
    return seen.get(m)!;
  }));
}

/**
 * The intended differences: backstitch entries get line styles instead of characters, in key order, and chart
 * symbols are now vector shapes and plain characters (SPEC §2.5), so other symbols are compared separately.
 */
function withLineStyles<T extends object>(doc: T): T {
  let n = 0;
  const d = doc as { pal?: ({ t?: string; sym: string } | null)[] };
  return { ...doc, pal: d.pal?.map((e) => (e?.t === "back" ? { ...e, sym: LINE_STYLES[n++]! } : e && { ...e, sym: "*" })) };
}

/** Today's symbols in a saved pattern: hidden for comparison, after checking each is a known, unique one. */
function anySymbols<T extends object>(doc: T): T {
  const d = doc as { pal?: ({ t?: string; sym: string } | null)[] };
  const syms = (d.pal ?? []).filter((e) => e && e.t !== "back").map((e) => e!.sym);
  expect(syms.every((x) => ALL_SYMBOLS.includes(x))).toBe(true);
  expect(new Set(syms).size).toBe(syms.length);
  return { ...doc, pal: d.pal?.map((e) => (e && e.t !== "back" ? { ...e, sym: "*" } : e)) };
}

/** CSV with the symbol column of stitch rows blanked (backstitch rows keep theirs). */
const csvNoSymbols = (csv: string) => csv.replace(/^"[^"]*",(?!.*backstitch)/gm, '"",');

describe("parity with the single-file app", () => {
  it("re-saves a v3 file unchanged apart from the version", () => {
    expect(anySymbols(serializePattern(load1()))).toEqual(withLineStyles({ ...fixtureJson<object>("legacy/serialize1json.json"), v: 4 }));
  });

  it("exports the same OXS", () => {
    expect(exportOxs(load1())).toBe(fixtureText("legacy/oxsFrom1json.oxs"));
  });

  it("imports OXS into the same pattern", () => {
    const { pattern, report } = importOxs(fixtureText("1.oxs"), ALL_SYMBOLS);
    expect(report.simplified).toBe(0);
    expect(normaliseIds(anySymbols(serializePattern(pattern)))).toEqual(normaliseIds(withLineStyles({ ...fixtureJson<object>("legacy/serialize1oxs.json"), v: 4 })));
  });

  it("round-trips its own OXS export like the old app", () => {
    const { pattern } = importOxs(exportOxs(load1()), ALL_SYMBOLS);
    expect(normaliseIds(anySymbols(serializePattern(pattern)))).toEqual(normaliseIds(withLineStyles({ ...fixtureJson<object>("legacy/serializeOxsRoundtrip.json"), v: 4 })));
  });

  it("computes the same shopping list", () => {
    const p = load1();
    const list = classicSkeins.calculate({ pattern: p, usage: computeUsage(p), settings: {} });
    const legacy = fixtureJson<{ threads: { id: string; skeins: number }[]; beads: { id: string; n: number }[] }>("legacy/shopping1json.json");
    expect(list.lines.filter((l) => l.kind === "thread").map((l) => ({ id: l.item.id, skeins: l.quantity }))).toEqual(legacy.threads);
    expect(list.lines.filter((l) => l.kind === "bead").map((l) => ({ id: l.item.id, n: l.quantity }))).toEqual(legacy.beads);
  });

  it("labels key entries the same way", () => {
    const p = load1();
    const labels = p.key.map((e) => (e ? formatLabel(keyLabelData(p, e), translateEn) : null));
    expect(labels).toEqual(fixtureJson("legacy/labels1json.json"));
  });

  it("writes the same CSV, with singular units fixed", () => {
    const p = load1();
    const csv = exportCsv(p, classicSkeins.calculate({ pattern: p, usage: computeUsage(p), settings: {} }), translateEn);
    const legacy = fixtureText("legacy/csvFrom1json.csv").replace(/"1 skeins"/g, '"1 skein"').replace(/"1 beads"/g, '"1 bead"')
      .replace('"●","DMC 310","Black · 1 strand · backstitch"', `"${symbolText(LINE_STYLES[0]!)}","DMC 310","Black · 1 strand · backstitch"`)
      .replace('"■","DMC 310","Black · 2 strands · backstitch"', `"${symbolText(LINE_STYLES[1]!)}","DMC 310","Black · 2 strands · backstitch"`);
    // the one addition: a last line naming the app
    expect(csvNoSymbols(csv)).toBe(csvNoSymbols(legacy) + '\n\n"Generated by пташечка · https://x-stitch-bird.vercel.app/en"');
  });

  it("suggests the same blends", () => {
    expect(findBlends("#3A8F8F", DMC).map((s) => ({ a: s.a.code, b: s.b.code, d: +s.deltaE.toFixed(4) }))).toEqual(fixtureJson("legacy/findBlendsTeal.json"));
  });
});
