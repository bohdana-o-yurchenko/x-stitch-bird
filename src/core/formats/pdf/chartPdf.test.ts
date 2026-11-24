import { readFileSync, writeFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { fixtureJson, translateEn, translateUk } from "../../../../tests/support/fixtures";
import { createPattern } from "../../pattern/createPattern";
import { addEntry } from "../../pattern/keyEntries";
import { ALL_SYMBOLS } from "../../symbols/symbols";
import { parsePattern } from "../json/parse";
import { chartLayout, chartPdf, hasLines, instructionBlocks, patternPicture, planChartPdf, sharedStrips } from "./chartPdf";
import { buildPalette } from "../../pattern/palette";
import { applyPreset, chart, DEFAULT_PRINT, normalizePrint, pageBox, PLAIN_PRINT, presetOf, PRESETS, stitchesAcross, type ChartSpec, type PrintOptions } from "./printOptions";
import { SYMBOL_INKS } from "./symbolColours";
import { rgb } from "./pdfWriter";
import { svgPathToPdf } from "./svgPath";
import { CYR_GLYPHS, TEXT_GLYPHS } from "./textFonts";

const file = (name: string) => new Uint8Array(readFileSync(new URL(`../../../../public/fonts/${name}.ttf`, import.meta.url)));
const fonts = { symbols: file("ptashechka-symbols"), regular: file("ptashechka-text-regular"), bold: file("ptashechka-text-bold"), cyrRegular: file("ptashechka-text-cyr-regular"), cyrBold: file("ptashechka-text-cyr-bold") };
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

/** The text a content stream shows, glyph ids turned back into characters (Latin and Cyrillic text fonts). */
function readText(stream: string): string {
  const back = (map: Readonly<Record<number, number>>) => new Map(Object.entries(map).map(([code, gid]) => [gid, String.fromCodePoint(Number(code))]));
  const fonts: Record<string, Map<number, string>> = { F1: back(TEXT_GLYPHS), F2: back(TEXT_GLYPHS), F4: back(CYR_GLYPHS), F5: back(CYR_GLYPHS) };
  return stream.split("BT").map((obj) => {
    let font = "", out = "";
    for (const m of obj.matchAll(/\/(F\d) [\d.]+ Tf|<([0-9a-f]+)> Tj/g)) {
      if (m[1]) font = m[1];
      else if (fonts[font]) for (let i = 0; i < m[2]!.length; i += 4) out += fonts[font]!.get(parseInt(m[2]!.slice(i, i + 4), 16)) ?? "";
    }
    return out;
  }).join("\n");
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
  it("as before the settings: a cover, the symbol chart and its key, the colour chart, the muted chart with backstitch and its key", async () => {
    const { pattern } = parsePattern(fixtureJson("1.json"), ALL_SYMBOLS);
    // one backstitch with its own line colour; the others black (the default)
    const back = pattern.layers.segments[0]!.k;
    pattern.key[back] = { ...pattern.key[back]!, ink: "#2E9E44" };
    const pdf = await chartPdf(pattern, { fonts, t: translateEn });
    if (process.env.CHART_PDF_OUT) writeFileSync(process.env.CHART_PDF_OUT, pdf);
    const s = latin1(pdf), tiles = chartLayout(pattern).tiles.length;
    expect(s.startsWith("%PDF-1.7")).toBe(true);
    expect(s.match(/\/Type \/Page /g)).toHaveLength(1 + tiles + 1 + 2 * tiles + 1);
    // all vector: no pictures
    expect(s).not.toContain("/Subtype /Image");
    // the shared cells are tinted with a see-through grey on the colour pages
    expect(s).toContain("/GA30 << /ca 0.3");
    const streams = contents(pdf).join("\n"), shown = readText(streams);
    for (const title of ["Symbol chart · page 1 of", "Key · Symbol chart · page 1 of", "Colour chart · page 1 of", "Muted colour chart · backstitch in bright colours · page 1 of", "Key · Muted colour chart · backstitch in bright colours · page 1 of", "Generated by \nпташечка\n · \nhttps://www.x-stitch-bird.app/en"]) expect(shown, title).toContain(title);
    // backstitch is drawn thick in the colour chosen in the key, not in its thread colour
    expect(back).toBeGreaterThan(0);
    expect(streams).toContain(`${rgb("#2E9E44")} RG`);
    // the footer's address is a link on every page
    expect(s.match(/\/URI \(https:\/\/www\.x-stitch-bird\.app\/en\)/g)).toHaveLength(1 + tiles + 1 + 2 * tiles + 1);
  });

  it("speaks Ukrainian when the interface does: titles, the key's labels and counts, the footer", async () => {
    const { pattern } = parsePattern(fixtureJson("1.json"), ALL_SYMBOLS);
    const shown = readText(contents(await chartPdf(pattern, { fonts, t: translateUk, print: DEFAULT_PRINT })).join("\n"));
    for (const text of ["Символьна схема · сторінка 1 з", "Ключ · Символьна схема", "Кольорова схема · сторінка 1 з", "Схема в приглушених кольорах · бекстіч яскравими кольорами", "Зміст", "13,1 × 13,1 см", "Як скласти сторінки схеми", "2 нитки · повний хрестик", "125 хрестиків", "Створено в застосунку \nпташечка\n · \nhttps://www.x-stitch-bird.app/uk"])
      expect(shown, text).toContain(text);
    expect(shown).not.toContain("?");
  });

  it("draws hand-drawn symbols as paths, with their cut-outs as clipping", async () => {
    const p = createPattern(3, 1, "Drawn");
    const k = addEntry(p, { t: "thread", src: "dmc:310", n: 2, st: "full", sym: "draw:O00cc;!P22aa" }, ALL_SYMBOLS);
    p.layers.stitches.set([k, k]);
    const streams = contents(await chartPdf(p, { fonts, t: translateEn })).join("\n");
    // a hole: everything outside the star is the clip, then the circle is filled
    expect(streams).toMatch(/re [^\n]* W\* n/);
    expect(streams).toMatch(/ c [^\n]* f/);
  });
});

describe("PDF chart to print: settings (Print dialog)", () => {
  const fixture = () => parsePattern(fixtureJson("1.json"), ALL_SYMBOLS).pattern;
  const pageCount = (pdf: Uint8Array) => latin1(pdf).match(/\/Type \/Page /g)!.length;
  /** The text of each page, in order (the streams with a page number "n / total"). */
  const pageTexts = (pdf: Uint8Array) => contents(pdf).map(readText).filter((t) => /\d+ \/ \d+/.test(t));
  const only = (...charts: ChartSpec[]): PrintOptions => ({ ...PLAIN_PRINT, cover: false, contents: false, instructions: false, materials: false, charts });

  it("lays the chart out for the paper and the cell size chosen", () => {
    const p = createPattern(100, 130);
    expect(chartLayout(p, 2, { cell: 8 }).cell).toBeCloseTo(8 * (72 / 25.4));
    // bigger cells, more pages; landscape is wider; extra small, fewer
    expect(chartLayout(p, 2, { cell: 8 }).tiles.length).toBeGreaterThan(chartLayout(p).tiles.length);
    expect(chartLayout(p, 2, { cell: 2.5 }).tiles.length).toBeLessThan(chartLayout(p).tiles.length);
    const wide = chartLayout(p, 2, { box: pageBox({ paper: "a4", landscape: true }), cell: 4.6 });
    expect(wide.tiles[0]!.w).toBeGreaterThan(chartLayout(p, 2, { cell: 4.6 }).tiles[0]!.w);
    expect(pageBox({ paper: "letter", landscape: false })).toMatchObject({ w: 612, h: 792 });
    // no shared rows: the pages meet edge to edge
    expect(chartLayout(p, 0).xs).toEqual([0, 40, 80]);
    // room kept under the grid for the key of the page: fewer rows
    expect(chartLayout(p, 2, { reserve: 100 }).tiles[0]!.h).toBeLessThan(chartLayout(p).tiles[0]!.h);
    expect(stitchesAcross({ paper: "a4", landscape: false }, "auto")).toBe(40);
    expect(stitchesAcross({ paper: "a4", landscape: false }, 8)).toBe(23);
  });

  it("knows its presets, keeps the paper when one is picked, and reads back stored settings safely", () => {
    expect(presetOf(DEFAULT_PRINT)).toBe("full");
    expect(presetOf({ ...PRESETS.bw, paper: "letter", landscape: true })).toBe("bw");
    expect(presetOf({ ...PRESETS.me, charts: [{ ...PRESETS.me.charts[0]!, cell: 8 }] })).toBe("custom");
    // black and white: the crosses alone, then with the backstitch
    expect(PRESETS.bw.charts.map((c) => [c.crosses, c.lines])).toEqual([["bw", "hidden"], ["bw", "bw"]]);
    expect(applyPreset({ paper: "letter", landscape: false }, "large")).toMatchObject({ paper: "letter", charts: [{ cell: 8, crosses: "bw" }] });
    const stored = normalizePrint({ charts: [{ crosses: "real", lines: "neon", cell: 7, overlap: 3 }], materials: false, paper: "a3" });
    expect(stored).toEqual({ ...DEFAULT_PRINT, materials: false, charts: [chart("real", "hidden", { overlap: 3 })] });
    // the settings of before the chart list: the default
    expect(normalizePrint({ symbols: true, cell: 6, paper: "letter" })).toEqual({ ...DEFAULT_PRINT, paper: "letter" });
    expect(normalizePrint("junk")).toEqual(DEFAULT_PRINT);
  });

  it("plans the pages without drawing them: the count, and each chart's pages and key", () => {
    const p = fixture(), tiles = chartLayout(p).tiles.length;
    const plan = planChartPdf(p, { t: translateEn, print: only(chart("bw", "hidden", { pageKey: false }), chart("bw", "bw", { pageKey: false, key: false })) });
    expect(plan.charts).toEqual([
      { title: "Black and white chart", chartPages: tiles, keyPages: 1 },
      { title: "Black and white chart · black backstitch", chartPages: tiles, keyPages: 0 },
    ]);
    expect(plan.total).toBe(2 * tiles + 1);
  });

  it("puts in only the charts listed, each with its key, and numbers every page of the file", async () => {
    const p = fixture(), tiles = chartLayout(p).tiles.length;
    const pdf = await chartPdf(p, { fonts, t: translateEn, print: only(chart("contrast", "hidden", { pageKey: false })) });
    expect(pageCount(pdf)).toBe(tiles + 1);
    const shown = readText(contents(pdf).join("\n"));
    expect(shown).toContain(`1 / ${tiles + 1}`);
    expect(shown).toContain("Key · Symbol chart · page 1 of 1");
    expect(shown).not.toContain("Colour chart");
    expect(shown).not.toContain("Contents");
  });

  it("makes one page for a preview: the same page, counted in the whole file", async () => {
    const p = fixture(), plan = planChartPdf(p, { t: translateEn, print: DEFAULT_PRINT });
    const pdf = await chartPdf(p, { fonts, t: translateEn, print: DEFAULT_PRINT, only: 3 });
    expect(pageCount(pdf)).toBe(1);
    expect(pageTexts(pdf)[0]).toContain(`3 / ${plan.total}`);
    // no pattern attached to a preview
    expect(latin1(pdf)).not.toContain("/EmbeddedFile");
  });

  it("stops when cancelled, and says how far it got", async () => {
    const p = fixture(), controller = new AbortController(), seen: number[] = [];
    const making = chartPdf(p, { fonts, t: translateEn, print: DEFAULT_PRINT, signal: controller.signal, onProgress: (done) => (seen.push(done), done === 2 && controller.abort()) });
    await expect(making).rejects.toThrow("cancelled");
    expect(seen).toEqual([1, 2]);
  });

  it("has a cover: the name, designer and ©, the pattern's picture, its size; then the contents", async () => {
    const p = fixture();
    p.name = "Robin";
    p.meta = { ...p.meta, designer: "Olena Bird", copyright: "2026 Olena Bird" };
    const pdf = await chartPdf(p, { fonts, t: translateEn, print: DEFAULT_PRINT });
    const [cover, contents] = pageTexts(pdf);
    for (const text of ["Robin", "Designed by Olena Bird", "© 2026 Olena Bird", "72 × 72 stitches"]) expect(cover).toContain(text);
    // the one picture in the file: the pattern, a block of pixels per cell
    expect(latin1(pdf).match(/\/Subtype \/Image/g)).toHaveLength(1);
    expect(contents).toContain("Contents");
    expect(contents).toContain("Symbol chart");
    expect(contents).not.toContain("Cover");
    // no cover: no picture
    expect(latin1(await chartPdf(p, { fonts, t: translateEn, print: { ...DEFAULT_PRINT, cover: false } }))).not.toContain("/Subtype /Image");
  });

  it("draws the pattern's picture: the bead's colour, else the stitch's, else the fabric; small patterns enlarged", () => {
    const p = createPattern(2, 1);
    p.fabric = "#FFFFFF";
    const k = addEntry(p, { t: "thread", src: "dmc:310", n: 2, st: "full" }, ALL_SYMBOLS);
    p.layers.stitches[0] = k;
    const pic = patternPicture(p, buildPalette(p));
    expect(pic.scale).toBe(16);
    expect([pic.w, pic.h]).toEqual([32, 16]);
    expect([...pic.rgb.slice(0, 3)]).toEqual([0, 0, 0]);
    expect([...pic.rgb.slice(16 * 3, 16 * 3 + 3)]).toEqual([255, 255, 255]);
  });

  it("has the name, designer and © at the top of every page", async () => {
    const p = fixture();
    p.name = "Robin";
    p.meta = { ...p.meta, designer: "Olena Bird", copyright: "2026 Olena Bird" };
    const pdf = await chartPdf(p, { fonts, t: translateEn, print: DEFAULT_PRINT });
    const pages = pageTexts(pdf);
    expect(pages).toHaveLength(pageCount(pdf));
    // the cover has them its own way; every other page in the header
    for (const page of pages.slice(1)) expect(page).toContain(" · Olena Bird · © 2026 Olena Bird");
    expect(pages[1]).toContain("Contents");
  });

  it("prints the instructions after the cover: headings, paragraphs and bullets", async () => {
    expect(instructionBlocks("# Start\nCentre first.\n\n\n- 2 strands\n• 1 for backstitch\n\n")).toEqual([
      { kind: "h", text: "Start" }, { kind: "p", text: "Centre first." }, { kind: "gap" }, { kind: "b", text: "2 strands" }, { kind: "b", text: "1 for backstitch" },
    ]);
    const p = fixture();
    p.meta = { ...p.meta, instructions: "# Before you start\nFind the centre of the fabric.\n- Use 2 strands for cross stitch\n" + "Long text. ".repeat(900) };
    const pdf = await chartPdf(p, { fonts, t: translateEn, print: { ...DEFAULT_PRINT, materials: false } });
    const shown = pageTexts(pdf);
    // cover, contents, then the instructions
    expect(shown[2]).toContain("Before you start");
    expect(shown[2]).toContain("Use 2 strands for cross stitch");
    // long: on two pages, both in the contents
    expect(shown[3]).toContain("Instructions · page 2 of");
    expect(shown[1]).toMatch(/Instructions\s*\n?pages 3–4/);
    expect(pageCount(pdf)).toBe(pageCount(await chartPdf(p, { fonts, t: translateEn, print: { ...DEFAULT_PRINT, materials: false, instructions: false } })) + 2);
  });

  it("prints the materials: the fabric to cut and what to buy", async () => {
    const pdf = await chartPdf(fixture(), { fonts, t: translateEn, print: { ...only(), materials: true } });
    const [page] = pageTexts(pdf);
    expect(page).toContain("Materials");
    expect(page).toContain("cut at least");
    expect(page).toMatch(/\d+ skeins?/);
  });

  it("adds under each chart page the entries it uses", async () => {
    const p = createPattern(80, 10, "Two halves");
    const a = addEntry(p, { t: "thread", src: "dmc:310", n: 2, st: "full", sym: "A" }, ALL_SYMBOLS), b = addEntry(p, { t: "thread", src: "dmc:666", n: 2, st: "full", sym: "B" }, ALL_SYMBOLS);
    for (let y = 0; y < 10; y++) for (let x = 0; x < 80; x++) p.layers.stitches[y * 80 + x] = x < 40 ? a : b;
    const pdf = await chartPdf(p, { fonts, t: translateEn, print: only(chart("contrast", "hidden", { key: false })) });
    const [left, right] = pageTexts(pdf);
    expect(left).toContain("DMC 310");
    expect(left).not.toContain("DMC 666");
    expect(right).toContain("DMC 666");
  });

  it("colours the crosses and the lines each chart's own way", async () => {
    const p = fixture(), back = p.layers.segments[0]!.k;
    p.key[back] = { ...p.key[back]!, ink: "#2E9E44" };
    const streams = async (...charts: ChartSpec[]) => contents(await chartPdf(p, { fonts, t: translateEn, print: only(...charts) })).join("\n");
    // bright lines: the key's line colour; black and white: none of it, no coloured symbols
    expect(await streams(chart("muted", "contrast"))).toContain(`${rgb("#2E9E44")} RG`);
    const bw = await streams(chart("bw", "bw"));
    expect(bw).not.toContain(`${rgb("#2E9E44")} RG`);
    for (const ink of [SYMBOL_INKS.red, SYMBOL_INKS.green, SYMBOL_INKS.blue]) expect(bw).not.toContain(`${rgb(ink)} rg`);
    // hidden lines: not drawn at all
    expect(await streams(chart("real", "hidden"))).not.toContain(`${rgb("#2E9E44")} RG`);
    // real colours: the fabric shows; black and white: it doesn't
    p.fabric = "#C8A26B";
    expect(await streams(chart("real", "hidden"))).toContain(`${rgb("#C8A26B")} rg`);
    expect(await streams(chart("bw", "hidden"))).not.toContain(`${rgb("#C8A26B")} rg`);
    if (process.env.PRINT_PDF_OUT) {
      p.name = "Robin in the snow";
      p.meta = { ...p.meta, designer: "Olena Bird", copyright: "2026 Olena Bird", instructions: "# Before you start\nFind the centre of the fabric and start from there.\n\n- Use 2 strands for cross stitch\n- 1 strand for backstitch" };
      writeFileSync(process.env.PRINT_PDF_OUT, await chartPdf(p, { fonts, t: translateEn, print: { ...DEFAULT_PRINT, charts: [chart("bw", "bw"), chart("real", "contrast")] } }));
    }
  });

  it("knows when the pattern has backstitch or knots to show or hide", () => {
    const p = createPattern(4, 4);
    expect(hasLines(p)).toBe(false);
    expect(hasLines(fixture())).toBe(true);
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

describe("canvas calls to PDF", () => {
  it("writes the line-style drawing calls as PDF operators, in top-left coordinates", async () => {
    const { PdfCanvas } = await import("./pdfCanvas");
    const { PdfPage } = await import("./pdfWriter");
    const page = new PdfPage(100, 200), g = new PdfCanvas(page);
    g.save();
    g.lineWidth = 2;
    g.strokeStyle = "#ff0000";
    g.setLineDash([3, 1.5]);
    g.translate(10, 20);
    g.rotate(Math.PI / 2);
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(5, 0);
    g.stroke();
    g.beginPath();
    g.arc(0, 0, 2, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = g.strokeStyle;
    g.fillRect(1, 1, 2, 2);
    g.restore();
    g.end();
    const ops = page.ops.join("\n");
    expect(ops.startsWith("q 1 0 0 -1 0 200 cm")).toBe(true); // y flipped once
    expect(ops).toContain("1 0 0 RG");
    expect(ops).toContain("[3 1.5] 0 d");
    expect(ops).toContain("1 0 0 1 10 20 cm");
    expect(ops).toContain("0 1 -1 0 0 0 cm");
    expect(ops).toContain("0 0 m 5 0 l S");
    expect(ops.match(/ c(?= |$)/gm)).toHaveLength(4); // a full circle: four quarter curves
    expect(ops).toContain("1 0 0 rg");
    expect(ops).toContain("1 1 2 2 re f");
    expect(ops.trim().endsWith("Q")).toBe(true);
    expect(g.strokeStyle).toBe("#000000"); // restore() brings back the colour from before save(), as on a canvas
  });
});
