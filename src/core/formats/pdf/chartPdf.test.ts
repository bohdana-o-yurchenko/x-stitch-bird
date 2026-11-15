import { readFileSync, writeFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { fixtureJson } from "../../../../tests/support/fixtures";
import { createPattern } from "../../pattern/createPattern";
import { addEntry } from "../../pattern/keyEntries";
import { ALL_SYMBOLS } from "../../symbols/symbols";
import { parsePattern } from "../json/parse";
import { chartLayout, chartPdf, sharedStrips } from "./chartPdf";
import { svgPathToPdf } from "./svgPath";
import { TEXT_GLYPHS } from "./textFonts";

const file = (name: string) => new Uint8Array(readFileSync(new URL(`../../../../public/fonts/${name}.ttf`, import.meta.url)));
const fonts = { symbols: file("ptashechka-symbols"), regular: file("ptashechka-text-regular"), bold: file("ptashechka-text-bold") };
const latin1 = (pdf: Uint8Array) => Buffer.from(pdf).toString("latin1");

/** Every content stream of the file, unpacked. */
function contents(pdf: Uint8Array): string[] {
  const s = latin1(pdf), out: string[] = [];
  for (const m of s.matchAll(/<<\s+(\/Filter \/FlateDecode \/Length (\d+)) >>\nstream\n/g)) {
    const start = m.index! + m[0].length, data = Buffer.from(s.slice(start, start + Number(m[2])), "latin1");
    out.push(inflateSync(data).toString("latin1"));
  }
  return out;
}

describe("PDF chart to print: pages", () => {
  it("cuts the chart into pages about 40 cells wide that share 2 rows or columns with their neighbours", () => {
    const l = chartLayout(createPattern(100, 130));
    expect(l.xs).toEqual([0, 38, 76]);
    expect(l.ys.length).toBeGreaterThan(1);
    expect(l.ys[1]! - l.ys[0]!).toBe(l.tiles[0]!.h - 2);
    // every cell is on some page; the last page along each side ends at the chart's edge
    const last = l.tiles[l.tiles.length - 1]!;
    expect([last.x + last.w, last.y + last.h]).toEqual([100, 130]);
    expect(l.cell).toBeCloseTo((595.28 - 42 - 26) / 40);
  });

  it("marks the shared strips on the sides that have a neighbour", () => {
    const l = chartLayout(createPattern(100, 40));
    expect(l.ys).toEqual([0]);
    const [first, middle, last] = l.tiles;
    expect(sharedStrips(l, first!)).toEqual([{ x: 38, y: 0, w: 2, h: 40 }]);
    expect(sharedStrips(l, middle!)).toEqual([{ x: 38, y: 0, w: 2, h: 40 }, { x: 76, y: 0, w: 2, h: 40 }]);
    expect(sharedStrips(l, last!)).toEqual([{ x: 76, y: 0, w: 2, h: 40 }]);
  });

  it("keeps a small chart on one page, with bigger cells", () => {
    const l = chartLayout(createPattern(20, 20));
    expect(l.tiles).toHaveLength(1);
    expect(l.cell).toBe(18);
    expect(sharedStrips(l, l.tiles[0]!)).toEqual([]);
  });
});

describe("PDF chart to print: the file", () => {
  it("has a cover, the chart three times (symbols, on colour, with backstitch) and the key", async () => {
    const { pattern } = parsePattern(fixtureJson("1.json"), ALL_SYMBOLS);
    const pdf = await chartPdf(pattern, { fonts });
    if (process.env.CHART_PDF_OUT) writeFileSync(process.env.CHART_PDF_OUT, pdf);
    const s = latin1(pdf), tiles = chartLayout(pattern).tiles.length;
    expect(s.startsWith("%PDF-1.7")).toBe(true);
    expect(s.match(/\/Type \/Page /g)).toHaveLength(1 + 3 * tiles + 1);
    // all vector: no pictures
    expect(s).not.toContain("/Subtype /Image");
    // the shared cells are tinted with a see-through grey on the colour pages
    expect(s).toContain("/GA30 << /ca 0.3");
    // section titles, written in the text font's glyph ids
    const streams = contents(pdf).join("\n"), hex = (t: string) => [...t].map((ch) => TEXT_GLYPHS[ch.codePointAt(0)!]!.toString(16).padStart(4, "0")).join("");
    for (const title of ["Symbol chart · page 1 of", "Symbols on colour · page 1 of", "Colour chart with backstitch · page 1 of", "Key · page 1 of"]) expect(streams, title).toContain(hex(title));
  });

  it("draws hand-drawn symbols as paths, with their cut-outs as clipping", async () => {
    const p = createPattern(3, 1, "Drawn");
    const k = addEntry(p, { t: "thread", src: "dmc:310", n: 2, st: "full", sym: "draw:O00cc;!P22aa" }, ALL_SYMBOLS);
    p.layers.stitches.set([k, k]);
    const streams = contents(await chartPdf(p, { fonts })).join("\n");
    // a hole: everything outside the star is the clip, then the circle is filled
    expect(streams).toMatch(/re [^\n]* W\* n/);
    expect(streams).toMatch(/ c [^\n]* f/);
  });
});

describe("SVG path to PDF", () => {
  const flip = (x: number, y: number): [number, number] => [x, 100 - y];

  it("turns lines and closes into m l h, flipping y", () => {
    expect(svgPathToPdf("M2 2H12V12H2Z", flip)).toBe("2 98 m 12 98 l 12 88 l 2 88 l h");
    expect(svgPathToPdf("M0 0L10 0 10 10", flip)).toBe("0 100 m 10 100 l 10 90 l");
    expect(svgPathToPdf("m1 1l2 0", flip)).toBe("1 99 m 3 99 l");
  });

  it("turns arcs into Bézier curves that end where the arc ends", () => {
    const d = svgPathToPdf("M10 5A5 5 0 1 1 0 5A5 5 0 1 1 10 5Z", (x, y) => [x, y]);
    const curves = d.split(" c").length - 1;
    expect(curves).toBeGreaterThanOrEqual(4);
    expect(d).toMatch(/ 0 5 c /);
    expect(d.endsWith("10 5 c h")).toBe(true);
  });

  it("stops at anything malformed instead of writing broken operators", () => {
    expect(svgPathToPdf("M0 0L5", flip)).toBe("0 100 m");
    expect(svgPathToPdf("X1 2", flip)).toBe("");
  });
});
