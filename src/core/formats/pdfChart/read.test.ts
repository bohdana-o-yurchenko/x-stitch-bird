import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { contentOf, FADED_FROM, FONTS, OTHER_H, OTHER_W, otherAppChart, otherCell } from "../../../../tests/support/otherAppChart";
import { translateEn } from "../../../../tests/support/fixtures";
import { ORGANIZER } from "../../pattern/brands";
import { createPattern } from "../../pattern/createPattern";
import { addEntry } from "../../pattern/keyEntries";
import { ALL_SYMBOLS } from "../../symbols/symbols";
import { chartPdf } from "../pdf/chartPdf";
import { checkPatternKeeper, patternKeeperPdf } from "../pdf/patternKeeper";
import { threadOf } from "./key";
import { paletteId, parsePaletteId } from "./palette";
import { chartComplete, chartToPattern, linedUpPages, readChart } from "./read";

describe("a key row's thread", () => {
  it.each([
    ["2  DMC  223  Shell Pink-LT", ["dmc:223"]],
    ["DMC 310 Black 204", ["dmc:310"]],
    ["DMC BLANC White", ["dmc:White"]],
    // a number the catalogue doesn't have: the name settles it
    ["2 DMC 1 White", ["dmc:White"]],
    ["ANC 403", ["anchor:403"]],
    ["Anchor 403 Black", ["anchor:403"]],
    ["DMC310", ["dmc:310"]],
    ["DMC 310 + DMC 3865 blended", ["dmc:310", "dmc:3865"]],
  ])("%s", (text, ids) => expect(threadOf(text)).toEqual({ kind: "thread", ids }));

  it("beads by their brand; a number alone under a brand heading; unknown brands not guessed", () => {
    expect(threadOf("Mill Hill 00557 Gold")).toEqual({ kind: "bead", ids: ["bead:00557"] });
    expect(threadOf("MH 557")).toEqual({ kind: "bead", ids: ["bead:00557"] });
    expect(threadOf("3 310 Black", "DMC")).toEqual({ kind: "thread", ids: ["dmc:310"] });
    expect(threadOf("Kreinik 032 Pearl")).toBeNull();
    expect(threadOf("Page 5 90048 Vera")).toBeNull();
  });
});

describe("another app's PDF chart (SPEC §15.47)", () => {
  it("stamped symbols over two pages placed by their numbers, matched with the key; a bead; the backstitch by its colour", async () => {
    const pdf = await otherAppChart();
    // the browser test's file (tests/fixtures/other-app-chart.pdf) is this one: OTHER_PDF_OUT=… writes it
    if (process.env.OTHER_PDF_OUT) writeFileSync(process.env.OTHER_PDF_OUT, pdf);
    const r = readChart(await contentOf(pdf));
    expect({ name: r.name, w: r.w, h: r.h, stated: r.stated, count: r.count, issues: r.issues }).toEqual({ name: "Snowy Owl", w: OTHER_W, h: OTHER_H, stated: { w: 30, h: 20 }, count: 16, issues: { conflicts: 0, unplaced: 0, partials: 0 } });
    expect(r.grids.map((g) => g.at)).toEqual([{ col: 0, row: 0 }, { col: 14, row: 0 }]);
    expect(r.symbols.map((s) => s.thread).sort((a, b) => a!.ids[0]!.localeCompare(b!.ids[0]!))).toEqual([{ kind: "bead", ids: ["bead:00557"] }, { kind: "thread", ids: ["dmc:310"] }, { kind: "thread", ids: ["dmc:3865"] }]);
    expect(r.lineStyles).toMatchObject([{ ink: "#c72b3b", thread: "dmc:321", count: 2, listed: true, sample: { page: 2 } }]);
    expect(chartComplete(r)).toBe(true);

    const p = chartToPattern(r, ALL_SYMBOLS);
    expect({ w: p.w, h: p.h, name: p.name, count: p.count }).toEqual({ w: 30, h: 20, name: "Snowy Owl", count: 16 });
    const what = (x: number, y: number) => {
      const i = y * p.w + x, b = p.layers.beads[i], s = p.layers.stitches[i];
      return b ? p.key[b]!.src : s ? p.key[s]!.src : null;
    };
    for (let y = 0; y < OTHER_H; y++) for (let x = 0; x < OTHER_W; x++) expect(what(x, y), `${x},${y}`).toBe([null, "dmc:310", "dmc:3865", "bead:00557"][otherCell(x, y)]);
    expect(p.layers.segments.map(({ x1, y1, x2, y2 }) => [x1, y1, x2, y2])).toEqual([[2, 2, 6, 2], [6, 2, 6, 5]]);
    expect(p.key[p.layers.segments[0]!.k]).toMatchObject({ t: "back", src: "dmc:321" });
  });

  /** Whole crosses of DMC threads, a blend among them; every cell different from its neighbours. */
  function ownPattern() {
    const p = createPattern(50, 45, "Свій візерунок");
    p.blends["blend:a"] = { parts: [{ id: "dmc:310", n: 1 }, { id: "dmc:White", n: 1 }] };
    const k = ["dmc:310", "dmc:321", "dmc:3865", "dmc:798", "blend:a"].map((src) => addEntry(p, { t: "thread", src, n: src.startsWith("blend") ? null : 2, st: "full" }, ALL_SYMBOLS));
    for (let i = 0; i < p.w * p.h; i++) if ((i * 7) % 11) p.layers.stitches[i] = k[(i * 3 + Math.floor(i / p.w)) % k.length]!;
    return p;
  }

  it.each([
    ["the PDF chart to print", (p: ReturnType<typeof ownPattern>) => chartPdf(p, { fonts: FONTS, t: translateEn })],
    ["the PDF for Pattern Keeper", (p: ReturnType<typeof ownPattern>) => patternKeeperPdf(p, checkPatternKeeper(p), { fonts: FONTS })],
  ])("this app's own %s, read as any other PDF (one made before PDFs carried the pattern): the same crosses", async (_, make) => {
    const p = ownPattern();
    const r = readChart(await contentOf(await make(p)));
    expect([r.w, r.h, r.issues.conflicts, r.issues.unplaced]).toEqual([p.w, p.h, 0, 0]);
    expect(chartComplete(r)).toBe(true);
    const q = chartToPattern(r, ALL_SYMBOLS);
    const src = (pat: typeof p, i: number) => (pat.layers.stitches[i] ? pat.key[pat.layers.stitches[i]!]!.src : null);
    const blend = (pat: typeof p, s: string | null) => (s?.startsWith("blend:") ? pat.blends[s]!.parts.map((x) => x.id).sort().join("+") : s);
    for (let i = 0; i < p.w * p.h; i++) expect(blend(q, src(q, i)), String(i)).toBe(blend(p, src(p, i)));
  });

  it("what the steps settle (SPEC §15.48): a size other than stated, cells only shown faded, a thread not read; where each symbol is drawn", async () => {
    const pdf = await otherAppChart({ messy: true });
    // the browser test's file (tests/fixtures/other-app-chart-messy.pdf): OTHER_MESSY_PDF_OUT=… writes it
    if (process.env.OTHER_MESSY_PDF_OUT) writeFileSync(process.env.OTHER_MESSY_PDF_OUT, pdf);
    const r = readChart(await contentOf(pdf));
    expect([r.w, r.h, r.stated]).toEqual([30, 20, { w: 31, h: 20 }]);
    let faded = 0;
    r.cells.forEach((v, i) => {
      if (v >= 0 && r.faded[i]) {
        faded++;
        expect(i % r.w).toBeGreaterThanOrEqual(FADED_FROM);
      }
    });
    expect(faded).toBe([...Array(OTHER_H * 2)].filter((_, i) => otherCell(FADED_FROM + (i % 2), Math.floor(i / 2))).length);
    const white = r.symbols.find((x) => !x.thread)!;
    expect(white.keyText).toBe("Kreinik 032 Pearl");
    // its picture is in the key, on the last page
    expect(white.sample).toMatchObject({ page: 2 });
    expect(chartComplete(r)).toBe(false);
    const p = chartToPattern(r, ALL_SYMBOLS, { fadedEmpty: true });
    expect([...p.layers.stitches].slice(0, 30).every((k, x) => !k || x < FADED_FROM)).toBe(true);
  });

  it("a blend as Pattern Maker lists it — a row per thread, the symbol between them: both threads, not a backstitch thread", async () => {
    const r = readChart(await contentOf(await otherAppChart({ blend: true })));
    const white = r.symbols.find((s) => s.thread?.ids.includes("dmc:3865"))!;
    expect(white.thread).toEqual({ kind: "thread", ids: ["dmc:3865", "dmc:762"] });
    expect(white.keyText).toBe("1 DMC 3865 Winter White + 1 DMC 762 Pearl Gray-VY LT");
    // the backstitch list still names one thread only
    expect(r.lineStyles).toMatchObject([{ thread: "dmc:321", listed: true }]);
    const p = chartToPattern(r, ALL_SYMBOLS);
    const k = p.key.findIndex((e) => e?.src.startsWith("blend:"));
    expect(p.blends[p.key[k]!.src]!.parts).toEqual([{ id: "dmc:3865", n: 1 }, { id: "dmc:762", n: 1 }]);
    expect(p.layers.stitches.filter((v) => v === k).length).toBe(white.count);
  });

  it("a symbol and a line named by a number and a colour become the project palette's colours (SPEC §15.52): one per number", async () => {
    const r = readChart(await contentOf(await otherAppChart()));
    const mine = { kind: "thread" as const, ids: [paletteId({ kind: "thread", code: "7", hex: "#336699" })] };
    const thread = r.symbols.find((s) => s.thread?.ids[0] === "dmc:310")!;
    const p = chartToPattern({ ...r, symbols: r.symbols.map((s) => (s === thread ? { ...s, thread: mine } : s)), lineStyles: r.lineStyles.map((s) => ({ ...s, thread: mine.ids[0]! })) }, ALL_SYMBOLS);
    expect(Object.values(p.customs)).toMatchObject([{ kind: "thread", brand: ORGANIZER, code: "7", name: "", hex: "#336699" }]);
    const id = Object.keys(p.customs)[0]!;
    expect(p.key.filter((e) => e?.src === id).map((e) => e!.t).sort()).toEqual(["back", "thread"]);
    expect(p.layers.stitches.filter((k) => k && p.key[k]!.src === id).length).toBe(thread.count);
  });

  it("a palette id carries its kind, colour and number — a number may hold colons", () => {
    expect(parsePaletteId(paletteId({ kind: "bead", code: "A:1", hex: "#abcdef" }))).toEqual({ kind: "bead", code: "A:1", hex: "#ABCDEF" });
    expect(parsePaletteId("dmc:310")).toBeNull();
  });

  it("the grids chosen make the chart; each chart page's place behind it, lined up cell for cell", async () => {
    const c = await contentOf(await otherAppChart());
    const r = readChart(c);
    const left = readChart(c, { use: [true, false] });
    expect([left.w, left.h]).toEqual([16, 20]);
    const places = linedUpPages(r, c.pages, 1000);
    const k = 1000 / 842;
    expect(places.get(0)).toEqual({ imageW: Math.round(595 * k), imageH: 1000, crop: { x: 60 * k, y: 80 * k, w: 16 * 12 * k, h: 20 * 12 * k }, rect: { x: 0, y: 0, w: 16, h: 20 } });
    expect(places.get(1)!.rect).toEqual({ x: 14, y: 0, w: 16, h: 20 });
    expect(places.has(2)).toBe(false);
  });

  it("a page with no chart on it: nothing read", async () => {
    const r = readChart({ title: "", pages: [{ w: 595, h: 842, glyphs: [], stamps: [], segments: [], rects: [], words: [] }] });
    expect([r.symbols.length, r.grids.length]).toEqual([0, 0]);
  });
});

/** Other people's charts, on this computer only (tests/fixtures/private, not in the repository). */
const privateFile = (name: string) => new URL(`../../../../tests/fixtures/private/${name}`, import.meta.url);
describe("real charts from other apps (only where the files are)", () => {
  const pm = privateFile("pattern-maker-vera-mouse.pdf"), fc = privateFile("flosscross-stardew-winter.pdf"), lt = privateFile("pattern-maker-low-tide.pdf");

  it.skipIf(!existsSync(pm))("Pattern Maker: 89 × 119 over four pages, every symbol's DMC thread; its black backstitch left to set up", async () => {
    const r = readChart(await contentOf(new Uint8Array(readFileSync(pm))));
    expect([r.w, r.h, r.count]).toEqual([89, 119, 10]);
    expect(r.grids.map((g) => g.at)).toEqual([{ col: 0, row: 0 }, { col: 44, row: 0 }, { col: 0, row: 59 }, { col: 44, row: 59 }]);
    expect(r.issues).toEqual({ conflicts: 0, unplaced: 0, partials: 0 });
    expect(r.symbols).toHaveLength(22);
    expect(r.symbols.every((s) => s.thread)).toBe(true);
    // the app's own totals (its page 6): 2761 crosses of white
    expect(r.symbols.find((s) => s.thread!.ids[0] === "dmc:White")!.count).toBe(2761);
    // looked up in its list, "Floss Used for Back Stitches" (page 5)
    expect(r.lineStyles).toMatchObject([{ thread: null, listed: true, sample: { page: 4 } }]);
  }, 60_000);

  it.skipIf(!existsSync(lt))("Pattern Maker blends: the symbol between two rows is both threads (13 blends in Low Tide)", async () => {
    const r = readChart(await contentOf(new Uint8Array(readFileSync(lt))));
    expect([r.w, r.h]).toEqual([140, 140]);
    expect(r.symbols.every((s) => s.thread)).toBe(true);
    const blends = Object.fromEntries(r.symbols.filter((s) => s.thread!.ids.length > 1).map((s) => [s.id, s.thread!.ids.join("+")]));
    expect(blends).toEqual({
      "g:w": "dmc:772+dmc:3053", "g:0": "dmc:745+dmc:676", "g:»": "dmc:453+dmc:452", 'g:"': "dmc:415+dmc:762", "g:€": "dmc:453+dmc:White",
      "g:f": "dmc:522+dmc:415", "g:t": "dmc:524+dmc:762", "g:^": "dmc:452+dmc:3790", "g:G": "dmc:729+dmc:452", "g:=": "dmc:453+dmc:676",
      "g:l": "dmc:729+dmc:676", "g:>": "dmc:746+dmc:745", "g:T": "dmc:928+dmc:775",
    });
    // single threads stay single: the rows next to a blend aren't taken in
    expect(r.symbols.find((s) => s.id === "g:.")!.thread!.ids).toEqual(["dmc:White"]);
  }, 60_000);

  it.skipIf(!existsSync(fc))("FlossCross: symbols as pictures, 125 × 125, every one matched with its key row", async () => {
    const r = readChart(await contentOf(new Uint8Array(readFileSync(fc))));
    expect([r.w, r.h, r.name]).toEqual([125, 125, "Stardew Sampler Winter"]);
    expect(r.issues).toEqual({ conflicts: 0, unplaced: 0, partials: 0 });
    expect(r.symbols).toHaveLength(35);
    expect(chartComplete(r)).toBe(true);
    expect(r.symbols.find((s) => s.thread!.ids[0] === "dmc:310")!.count).toBe(204);
  }, 60_000);
});
