import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fixtureJson } from "../../../../tests/support/fixtures";
import { createPattern } from "../../pattern/createPattern";
import { addEntry } from "../../pattern/keyEntries";
import { ALL_SYMBOLS } from "../../symbols/symbols";
import { SYMBOL_FONT, SYMBOL_GLYPHS } from "../../symbols/symbolFont";
import { parsePattern } from "../json/parse";
import { checkPatternKeeper, patternKeeperPdf } from "./patternKeeper";
import { latin } from "./pdfWriter";

const font = new Uint8Array(readFileSync(new URL("../../../../public/fonts/ptashechka-symbols.ttf", import.meta.url)));
const text = (pdf: Uint8Array) => Buffer.from(pdf).toString("latin1");

/** Every object offset in the cross-reference table points at that object. */
function checkXref(pdf: Uint8Array) {
  const s = text(pdf), start = Number(s.match(/startxref\n(\d+)\n%%EOF/)![1]);
  expect(s.slice(start, start + 4)).toBe("xref");
  const rows = s.slice(start).split("\n").slice(2).filter((l) => / n $/.test(l));
  rows.forEach((row, i) => expect(s.slice(Number(row.slice(0, 10))).startsWith(`${i + 1} 0 obj`)).toBe(true));
  return rows.length;
}

describe("Pattern Keeper PDF", () => {
  it("has a glyph for every chart symbol", () => {
    for (const sym of ALL_SYMBOLS) expect(SYMBOL_GLYPHS[sym], sym).toBeDefined();
    const ids = Object.values(SYMBOL_GLYPHS).map(([gid]) => gid), codes = Object.values(SYMBOL_GLYPHS).map(([, code]) => code);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(codes).size).toBe(codes.length);
    expect(Math.max(...ids)).toBeLessThan(SYMBOL_FONT.glyphs);
    // real characters, not private-use codes (Pattern Keeper refuses those)
    expect(codes.every((c) => c > 0x20 && (c < 0xe000 || c > 0xf8ff))).toBe(true);
  });

  it("tracks full crosses in one floss or a 1+1 blend, and reports the rest", () => {
    const p = createPattern(10, 10);
    p.blends["blend:a"] = { parts: [{ id: "dmc:310", n: 1 }, { id: "dmc:321", n: 1 }] };
    p.blends["blend:b"] = { parts: [{ id: "dmc:310", n: 2 }, { id: "dmc:321", n: 1 }] };
    const solid = addEntry(p, { t: "thread", src: "dmc:310", n: 3, st: "full" }, ALL_SYMBOLS);
    const blend = addEntry(p, { t: "thread", src: "blend:a", n: null, st: "full" }, ALL_SYMBOLS);
    const heavy = addEntry(p, { t: "thread", src: "blend:b", n: null, st: "full" }, ALL_SYMBOLS);
    const half = addEntry(p, { t: "thread", src: "dmc:321", n: 2, st: "half" }, ALL_SYMBOLS);
    const back = addEntry(p, { t: "back", src: "dmc:310", n: 1 }, ALL_SYMBOLS);
    p.layers.stitches.set([solid, solid, blend, heavy, half, half, half]);
    p.layers.segments.push({ x1: 0, y1: 0, x2: 1, y2: 1, k: back });
    const r = checkPatternKeeper(p);
    expect([...r.supported]).toEqual([[solid, 2], [blend, 1]]);
    expect(r.issues).toEqual([{ kind: "half", count: 3 }, { kind: "blend", count: 1 }, { kind: "back", count: 1 }]);
  });

  it("writes a valid file: symbol chart, key, then the full chart when something is left out", async () => {
    const { pattern } = parsePattern(fixtureJson("1.json"), ALL_SYMBOLS);
    const report = checkPatternKeeper(pattern);
    expect(report.issues.map((i) => i.kind)).toEqual(["combo", "back"]);
    const pdf = await patternKeeperPdf(pattern, report, {
      font,
      fullChart: (r) => ({ w: r.w, h: r.h, rgb: new Uint8Array(r.w * r.h * 3).fill(230) }),
      keyIcon: () => ({ w: 1, h: 1, rgb: new Uint8Array(3) }),
    });
    if (process.env.PK_PDF_OUT) writeFileSync(process.env.PK_PDF_OUT, pdf);
    const s = text(pdf);
    expect(s.startsWith("%PDF-1.7")).toBe(true);
    expect(checkXref(pdf)).toBeGreaterThan(10);
    // 72×72 cells: 2 chart pages + key, then 2 full pages + full key
    expect(s.match(/\/Type \/Page /g)).toHaveLength(6);
    expect(s).toContain("/Subtype /Type0");
    expect(s).toContain("/FontFile2");
    // without the full-chart callback only the Pattern Keeper part is written
    const short = await patternKeeperPdf(pattern, report, { font });
    expect(text(short).match(/\/Type \/Page /g)).toHaveLength(3);
  });

  it("keeps text Latin: Cyrillic is transliterated", () => {
    expect(latin("Пташечка — Їжак")).toBe("Ptashechka — Izhak");
  });
});
