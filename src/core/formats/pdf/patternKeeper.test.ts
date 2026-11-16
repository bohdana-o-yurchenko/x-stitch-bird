import { readFileSync, writeFileSync } from "node:fs";
import en from "../../../../messages/en.json";
import { describe, expect, it } from "vitest";
import { fixtureJson } from "../../../../tests/support/fixtures";
import { createPattern } from "../../pattern/createPattern";
import { addEntry } from "../../pattern/keyEntries";
import { ALL_SYMBOLS } from "../../symbols/symbols";
import { SYMBOL_FONT, SYMBOL_GLYPHS } from "../../symbols/symbolFont";
import { parsePattern } from "../json/parse";
import { checkPatternKeeper, patternKeeperPdf } from "./patternKeeper";
import { APP_URL_EN } from "./pdfLayout";

const file = (name: string) => new Uint8Array(readFileSync(new URL(`../../../../public/fonts/${name}.ttf`, import.meta.url)));
const fonts = { symbols: file("ptashechka-symbols"), regular: file("ptashechka-text-regular"), bold: file("ptashechka-text-bold"), cyrRegular: file("ptashechka-text-cyr-regular"), cyrBold: file("ptashechka-text-cyr-bold") };
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

  it("writes a valid file with only what Pattern Keeper reads: symbol chart, thread list, notes", async () => {
    const { pattern } = parsePattern(fixtureJson("1.json"), ALL_SYMBOLS);
    const report = checkPatternKeeper(pattern);
    expect(report.issues.map((i) => i.kind)).toEqual(["combo", "back"]);
    const pdf = await patternKeeperPdf(pattern, report, { fonts });
    if (process.env.PK_PDF_OUT) writeFileSync(process.env.PK_PDF_OUT, pdf);
    const s = text(pdf);
    expect(s.startsWith("%PDF-1.7")).toBe(true);
    expect(checkXref(pdf)).toBeGreaterThan(10);
    // 72×72 cells: 2 chart pages + thread list + notes; no pictures of the full chart any more
    expect(s.match(/\/Type \/Page /g)).toHaveLength(4);
    expect(s).not.toContain("/Subtype /Image");
    // five embedded fonts (text regular and bold, their Cyrillic, symbols) and no built-in ones
    expect(s.match(/\/Subtype \/Type0/g)).toHaveLength(5);
    expect(s.match(/\/FontFile2/g)).toHaveLength(5);
    expect(s).not.toContain("/Subtype /Type1");
    // the same address the English interface uses
    expect(APP_URL_EN).toBe(en.app.url);
    // the footer links to the app, in English like the rest of this file
    expect(s.match(/\/URI \(https:\/\/www\.x-stitch-bird\.app\/en\)/g)).toHaveLength(4);
  });

  it("shows a hand-drawn symbol with a spare standard glyph, since the chart must be text in the symbol font", async () => {
    const p = createPattern(3, 1);
    const drawn = addEntry(p, { t: "thread", src: "dmc:310", n: 2, st: "full", sym: "draw:o22aa" }, ALL_SYMBOLS);
    const plain = addEntry(p, { t: "thread", src: "dmc:321", n: 2, st: "full", sym: ALL_SYMBOLS[0] }, ALL_SYMBOLS);
    p.layers.stitches.set([drawn, plain, drawn]);
    const pdf = await patternKeeperPdf(p, checkPatternKeeper(p), { fonts });
    // chart + thread list + the note about the replaced symbol
    expect(text(pdf).match(/\/Type \/Page /g)).toHaveLength(3);
  });

  it("writes Cyrillic text in the Cyrillic font, letter by letter, and a footer naming the app", async () => {
    const { PdfPage } = await import("./pdfWriter");
    const page = new PdfPage(100, 100);
    page.text("bold", 10, 0, 10, "Black Їжак");
    expect(page.ops[0]).toMatch(/^BT 0 g 1 0 0 1 0 90 Tm \/F2 10 Tf <[0-9a-f]+> Tj \/F5 10 Tf <[0-9a-f]+> Tj ET$/);
    const p = createPattern(2, 1, "Їжачок");
    p.layers.stitches[0] = addEntry(p, { t: "thread", src: "dmc:310", n: 2, st: "full" }, ALL_SYMBOLS);
    const pdf = text(await patternKeeperPdf(p, checkPatternKeeper(p), { fonts }));
    // the title keeps its letters (UTF-16), and the Cyrillic font is embedded
    expect(pdf).toContain("/Title <FEFF0407");
    expect(pdf.match(/\/Subtype \/Type0/g)).toHaveLength(5);
  });
});
