import { brandCode } from "../../catalog/catalog";
import { hexToRgb, luma } from "../../color/colorMath";
import { resolveColor } from "../../pattern/resolve";
import type { KeyEntry, KeyIndex, Pattern } from "../../pattern/types";
import { SYMBOL_FONT, SYMBOL_GLYPHS } from "../../symbols/symbolFont";
import { APP_URL_EN, drawFooter, drawGrid, drawRulers, PAGE, type Tile } from "./pdfLayout";
import { PdfPage, PdfWriter, textWidth } from "./pdfWriter";

/*
 * A PDF chart that Pattern Keeper can import (SPEC §15.10). Pattern Keeper tracks full crosses only and reads
 * them as text: one glyph of an embedded font per cell, on a vector grid, with a ruled thread table. So the file holds
 * only that: the chart with the stitches it can track, as symbols, their thread list, and a page of notes. The chart
 * with everything on it is the separate PDF chart to print (chartPdf.ts).
 * The text is Latin only (an embedded cut of DM Sans): the wording here is English whatever the interface language.
 */

/** What Pattern Keeper can't track, by kind. */
export type PkIssueKind = "half" | "partial" | "blend" | "combo" | "bead" | "back" | "knot";

export interface PkReport {
  /** Key entries drawn in the Pattern Keeper chart, with their full-cross counts. */
  supported: Map<KeyIndex, number>;
  /** Stitches, beads, lines and knots left out of it, by kind (only kinds that occur). */
  issues: { kind: PkIssueKind; count: number }[];
}

/** A full cross in one floss (any strands), or in a blend of exactly two flosses, one strand each. */
function trackable(p: Pattern, e: KeyEntry): true | PkIssueKind {
  if (e.t === "combo") return "combo";
  if (e.t !== "thread") return "half";
  if ((e.st ?? "full") !== "full") return "half";
  const blend = p.blends[e.src];
  if (!blend) return true;
  return blend.parts.length === 2 && blend.parts.every((part) => part.n === 1) ? true : "blend";
}

export function checkPatternKeeper(p: Pattern): PkReport {
  const supported = new Map<KeyIndex, number>(), left = new Map<PkIssueKind, number>();
  const bump = (kind: PkIssueKind, n = 1) => n && left.set(kind, (left.get(kind) ?? 0) + n);
  const verdicts = p.key.map((e) => (e ? trackable(p, e) : null));
  for (const k of p.layers.stitches) {
    const v = k ? verdicts[k] : null;
    if (v === true) supported.set(k, (supported.get(k) ?? 0) + 1);
    else if (v) bump(v);
  }
  let partials = 0;
  for (const list of p.layers.partials.values()) partials += list.length;
  bump("partial", partials);
  bump("bead", p.layers.beads.reduce((n, k) => n + (k ? 1 : 0), 0));
  bump("back", p.layers.segments.length);
  // a bead on a grid point is a bead (or floss + bead), not a knot
  for (const kn of p.layers.knots) {
    const t = p.key[kn.k]?.t;
    bump(t === "combo" ? "combo" : t === "bead" ? "bead" : "knot");
  }
  const order: PkIssueKind[] = ["half", "partial", "blend", "combo", "bead", "back", "knot"];
  return { supported, issues: order.flatMap((kind) => (left.has(kind) ? [{ kind, count: left.get(kind)! }] : [])) };
}

const ISSUE_TEXT: Record<PkIssueKind, string> = {
  half: "half crosses",
  partial: "quarter, three-quarter and petite stitches",
  blend: "crosses in blends other than two flosses with one strand each",
  combo: "floss + bead stitches",
  bead: "beads",
  back: "backstitch lines",
  knot: "French knots",
};

/**
 * The font glyph for each entry of the Pattern Keeper chart. The chart must be text in the symbol font, so a
 * hand-drawn symbol (which has no glyph) is shown with a standard symbol no other entry of the chart uses.
 */
function chartGlyphs(p: Pattern, report: PkReport): { glyphs: Map<KeyIndex, number>; replaced: number } {
  const glyphs = new Map<KeyIndex, number>(), taken = new Set<number>(), without: KeyIndex[] = [];
  for (const k of report.supported.keys()) {
    const g = SYMBOL_GLYPHS[p.key[k]!.sym]?.[0];
    if (g === undefined) without.push(k);
    else {
      glyphs.set(k, g);
      taken.add(g);
    }
  }
  const spare = Object.values(SYMBOL_GLYPHS).map(([g]) => g).filter((g) => !taken.has(g));
  without.forEach((k, i) => spare[i] !== undefined && glyphs.set(k, spare[i]!));
  return { glyphs, replaced: without.length };
}

/** The font files: chart symbols (`SYMBOL_FONT.url`) and the text font (`TEXT_FONTS.*.url`). All are embedded. */
export interface PdfFonts {
  symbols: Uint8Array;
  regular: Uint8Array;
  bold: Uint8Array;
  /** Cyrillic letters (Onest), used where DM Sans has none. */
  cyrRegular: Uint8Array;
  cyrBold: Uint8Array;
}

export interface PkPdfOptions {
  fonts: PdfFonts;
}

const MAX_COLS = 60, MAX_CELL = 14;

/** Splits the chart into pages of whole cells; tall pages end on a multiple of 10 rows. */
function tiles(p: Pattern): { cell: number; list: Tile[] } {
  const usableW = PAGE.w - PAGE.left - PAGE.right, usableH = PAGE.h - PAGE.top - PAGE.bottom;
  const cols = Math.min(p.w, MAX_COLS), cell = Math.min(MAX_CELL, usableW / cols);
  let rows = Math.floor(usableH / cell);
  if (p.h > rows) rows -= rows % 10;
  const list: Tile[] = [];
  for (let y = 0; y < p.h; y += rows) for (let x = 0; x < p.w; x += cols) list.push({ x, y, w: Math.min(cols, p.w - x), h: Math.min(rows, p.h - y), n: list.length + 1 });
  return { cell, list };
}

/** Title, column and row numbers around one chart page; returns where the grid starts. */
function frame(page: PdfPage, p: Pattern, t: Tile, cell: number, heading: string, count: number) {
  const ox = PAGE.left, oy = PAGE.top;
  page.text("bold", 10, ox, 24, p.name || "Pattern");
  page.text("regular", 8, ox, 36, `${heading} · page ${t.n} of ${count} · columns ${t.x + 1}-${t.x + t.w}, rows ${t.y + 1}-${t.y + t.h} of ${p.w} x ${p.h}`, "left", 0.35);
  drawRulers(page, p, t, cell, ox, oy);
  return { ox, oy };
}

/** Builds the PDF. Check the pattern with `checkPatternKeeper` first and pass the report in. */
export async function patternKeeperPdf(p: Pattern, report: PkReport, o: PkPdfOptions): Promise<Uint8Array> {
  const pdf = new PdfWriter();
  await pdf.embedTextFonts(o.fonts);
  await pdf.embedSymbolFont(SYMBOL_FONT.name, o.fonts.symbols, Object.values(SYMBOL_GLYPHS));
  const { cell, list } = tiles(p);
  const { glyphs, replaced } = chartGlyphs(p, report);

  // 1. the chart Pattern Keeper reads
  for (const t of list) {
    const page = new PdfPage(PAGE.w, PAGE.h);
    const { ox, oy } = frame(page, p, t, cell, "Chart for Pattern Keeper", list.length);
    drawGrid(page, p, t, cell, ox, oy);
    const cells: { x: number; y: number; glyph: number }[] = [];
    for (let y = t.y; y < t.y + t.h; y++)
      for (let x = t.x; x < t.x + t.w; x++) {
        const k = p.layers.stitches[y * p.w + x]!;
        const glyph = glyphs.get(k);
        if (glyph) cells.push({ x: ox + (x - t.x) * cell, y: oy + (y - t.y) * cell, glyph });
      }
    page.glyphs(cell, cells);
    drawFooter(page, "Generated by {app} · {url}", APP_URL_EN, "Glory to Ukraine");
    await pdf.addPage(page);
  }

  /*
   * Its thread list, laid out like the key of a chart that Pattern Keeper imports with thread numbers (a WinStitch
   * PDF): a ruled table with the headers Number · Name · Strands · Stitches; in the first column a block of the
   * thread's colour with the chart symbol on it; brand and number as two separate words ("DMC", "310").
   */
  const rows = [...report.supported].sort(([a], [b]) => a - b).map(([k, count]) => {
    const e = p.key[k]!, c = resolveColor(p, e.src), threads = c?.parts?.map((q) => q.entry) ?? (c ? [c] : []);
    // "DMC" "310", and for a blend "DMC" "310" "+" "DMC" "321"
    const words = threads.flatMap((t, i) => [...(i ? ["+"] : []), ...brandCode(t).split(" ")]);
    return {
      glyph: glyphs.get(k),
      hex: c?.hex ?? "#cccccc",
      dark: !!c && luma(hexToRgb(c.hex)) < 140,
      words,
      name: threads.map((t) => t.name).join(" + ") || "?",
      strands: c?.parts ? c.parts.map((q) => q.n).join("+") : String(e.n ?? ""),
      count,
    };
  });
  const T = { size: 9, row: 16.9, pad: 4.5, base: 11.5, tab: 30.4, line: 0.75 };
  /** Where each word of the Number cell starts: the number at a fixed tab after a short brand, like WinStitch. */
  const wordsAt = (words: string[]) => {
    let x = 0;
    return words.map((w, i) => {
      if (i === 1) x = Math.max(x, T.tab);
      const at = x;
      x += textWidth(w, T.size) + 4;
      return { w, at, end: at + textWidth(w, T.size) };
    });
  };
  const left = PAGE.left, right = PAGE.w - PAGE.right;
  const numberW = Math.max(96, ...rows.map((r) => (wordsAt(r.words).pop()?.end ?? 0) + 2 * T.pad));
  const col = { number: left + 90, name: left + 90 + numberW, strands: right - 112, stitches: right - 56 };
  const KEY_Y = 60, perPage = Math.floor((PAGE.h - KEY_Y - PAGE.bottom) / T.row) - 1;
  const keyPages = Math.max(1, Math.ceil(rows.length / perPage));
  for (let n = 0; n < keyPages; n++) {
    const page = new PdfPage(PAGE.w, PAGE.h);
    page.text("bold", 10, PAGE.left, 24, p.name || "Pattern");
    page.text("regular", 8, PAGE.left, 36, `Thread list for Pattern Keeper · page ${n + 1} of ${keyPages}`, "left", 0.35);
    const part = rows.slice(n * perPage, (n + 1) * perPage), bottom = KEY_Y + (part.length + 1) * T.row;
    part.forEach((r, i) => page.rect(left + 0.5, KEY_Y + (i + 1) * T.row + 0.5, 90 - 1, T.row - 1, { fill: r.hex }));
    // the table's rules: outline, a line under every row, a line between columns
    page.rect(left, KEY_Y, right - left, bottom - KEY_Y, { stroke: 0, width: T.line });
    page.lines(part.map((_, i) => [left, KEY_Y + (i + 1) * T.row, right, KEY_Y + (i + 1) * T.row]), T.line);
    page.lines(Object.values(col).map((x) => [x, KEY_Y, x, bottom]), T.line);
    page.text("bold", T.size, col.number + T.pad, KEY_Y + T.base, "Number");
    page.text("bold", T.size, col.name + T.pad, KEY_Y + T.base, "Name");
    page.text("bold", T.size, col.strands + T.pad, KEY_Y + T.base, "Strands");
    page.text("bold", T.size, col.stitches + T.pad, KEY_Y + T.base, "Stitches");
    part.forEach((r, i) => {
      const y = KEY_Y + (i + 1) * T.row, base = y + T.base;
      for (const { w, at } of wordsAt(r.words)) page.text("regular", T.size, col.number + T.pad + at, base, w);
      page.text("regular", T.size, col.name + T.pad, base, r.name);
      page.text("regular", T.size, col.stitches - 1.5, base, r.strands, "right");
      page.text("regular", T.size, right - 1.5, base, String(r.count), "right");
    });
    // the symbol in the middle of its colour block, white on dark colours
    const SYM = 10, symbol = (r: (typeof rows)[number], i: number) => (r.glyph ? [{ x: left + 45 - SYM / 2, y: KEY_Y + (i + 1) * T.row + T.base + 1 - SYM, glyph: r.glyph }] : []);
    page.glyphs(SYM, part.flatMap((r, i) => (r.dark ? [] : symbol(r, i))), 0);
    page.glyphs(SYM, part.flatMap((r, i) => (r.dark ? symbol(r, i) : [])), 1);
    drawFooter(page, "Generated by {app} · {url}", APP_URL_EN, "Glory to Ukraine");
    await pdf.addPage(page);
  }

  // what the chart leaves out or shows differently: plain lines on their own page, away from the thread list
  if (report.issues.length || replaced) {
    const page = new PdfPage(PAGE.w, PAGE.h);
    page.text("bold", 10, PAGE.left, 24, p.name || "Pattern");
    page.text("regular", 8, PAGE.left, 36, "About this chart", "left", 0.35);
    let y = 48;
    if (replaced) {
      page.text("bold", 9, PAGE.left, (y += 14), "Hand-drawn symbols");
      page.text("regular", 9, PAGE.left, (y += 14), `${replaced} hand-drawn symbol${replaced === 1 ? " is" : "s are"} shown with standard symbols in the Pattern Keeper chart and its thread list.`);
      y += 14;
    }
    if (report.issues.length) {
      page.text("bold", 9, PAGE.left, (y += 14), "Not in the Pattern Keeper chart (it tracks full crosses only)");
      for (const issue of report.issues) page.text("regular", 9, PAGE.left, (y += 14), `${issue.count} ${ISSUE_TEXT[issue.kind]}`);
      page.text("regular", 9, PAGE.left, y + 28, "For a chart with everything on it, export the PDF chart to print (Export > PDF chart to print).");
    }
    drawFooter(page, "Generated by {app} · {url}", APP_URL_EN, "Glory to Ukraine");
    await pdf.addPage(page);
  }

  return pdf.build({ title: p.name || "Pattern", producer: "ptashechka" });
}
