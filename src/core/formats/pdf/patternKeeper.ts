import { brandCode } from "../../catalog/catalog";
import { computeUsage, entryCount, partialCount } from "../../calculator/usage";
import { isMajorLine, majorOffset, rulerLabels } from "../../grid/numbering";
import { labelData, type LabelData } from "../../labels/keyLabel";
import { resolveColor } from "../../pattern/resolve";
import type { KeyEntry, KeyIndex, Pattern, Rect } from "../../pattern/types";
import { SYMBOL_FONT, SYMBOL_GLYPHS } from "../../symbols/symbolFont";
import { PdfPage, PdfWriter, type Raster } from "./pdfWriter";

/*
 * A PDF chart that Pattern Keeper can import (SPEC §15.10). Pattern Keeper tracks full crosses only and reads
 * them as text: one glyph of an embedded font per cell, on a vector grid, with a text key. So the file holds
 *   1. the chart with only the stitches it can track, as symbols, their thread list, and a page of notes;
 *   2. when the pattern has anything else, the full chart as pictures, with its own key.
 * The text is Latin only (built-in Helvetica): the wording here is English whatever the interface language.
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
  bump("knot", p.layers.knots.length);
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

const STITCH_TEXT = { full: "full cross", half: "half cross /", halfb: "half cross \\" } as const;

/** The key label in English (the interface's own labels may be Cyrillic). */
function englishLabel(d: LabelData): { title: string; sub: string } {
  const strands = d.strands ? `${d.strands} strand${d.strands === 1 ? "" : "s"}` : null;
  const stitch = d.stitch ? STITCH_TEXT[d.stitch] : null;
  const parts: (string | null)[] = [d.name];
  if (d.kind === "bead") parts.push(d.series ? `bead (${d.series})` : "bead");
  else if (d.kind === "combo") parts.splice(0, 1, strands, stitch, `with ${d.beadName ?? "?"} bead`);
  else if (d.kind === "back") parts.push(d.blend ? null : strands, "backstitch");
  else if (d.kind === "knot") parts.push(d.blend ? null : strands, d.wraps ? `French knot, ${d.wraps} wrap${d.wraps === 1 ? "" : "s"}` : "French knot");
  else parts.push(d.blend ? null : strands, stitch);
  return { title: d.blend ? `Blend ${d.title}` : d.title, sub: parts.filter(Boolean).join(" · ") };
}

export interface PkPdfOptions {
  /** The symbol font file (public/fonts/ptashechka-symbols.ttf). */
  font: Uint8Array;
  /** Picture of the full chart for these cells, symbols view with grid; needed when the report has issues. */
  fullChart?: (cells: Rect) => Raster;
  /** Picture of a key entry's icon, for the full chart's key. */
  keyIcon?: (k: KeyIndex) => Raster | null;
}

// A4 portrait, in points
const PAGE = { w: 595.28, h: 841.89, left: 42, right: 26, top: 58, bottom: 34 };
const MAX_COLS = 60, MAX_CELL = 14;

interface Tile extends Rect {
  n: number;
}

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
  const size = { w: p.w, h: p.h }, ox = PAGE.left, oy = PAGE.top;
  page.text("bold", 10, ox, 24, p.name || "Pattern");
  page.text("regular", 8, ox, 36, `${heading} · page ${t.n} of ${count} · columns ${t.x + 1}-${t.x + t.w}, rows ${t.y + 1}-${t.y + t.h} of ${p.w} x ${p.h}`, "left", 0.35);
  for (const l of rulerLabels(p.grid, "x", size, 10)) if (l.at >= t.x && l.at <= t.x + t.w) page.text("regular", 7, ox + (l.at - t.x) * cell, oy - 4, String(l.text), "centre", 0.3);
  for (const l of rulerLabels(p.grid, "y", size, 10)) if (l.at >= t.y && l.at <= t.y + t.h) page.text("regular", 7, ox - 4, oy + (l.at - t.y) * cell + 2.5, String(l.text), "right", 0.3);
  return { ox, oy };
}

function grid(page: PdfPage, p: Pattern, t: Tile, cell: number, ox: number, oy: number) {
  const size = { w: p.w, h: p.h }, mx = majorOffset(p.grid, "x", size), my = majorOffset(p.grid, "y", size);
  const minor: [number, number, number, number][] = [], major: [number, number, number, number][] = [];
  const right = ox + t.w * cell, bottom = oy + t.h * cell;
  for (let i = 0; i <= t.w; i++) (isMajorLine(t.x + i, mx) ? major : minor).push([ox + i * cell, oy, ox + i * cell, bottom]);
  for (let j = 0; j <= t.h; j++) (isMajorLine(t.y + j, my) ? major : minor).push([ox, oy + j * cell, right, oy + j * cell]);
  page.lines(minor, 0.3, 0.55);
  page.lines(major, 0.9, 0);
  page.rect(ox, oy, t.w * cell, t.h * cell, { stroke: 0, width: 1.1 });
}

const ROW = 19, KEY_TOP = 74, KEY_ROWS = Math.floor((PAGE.h - KEY_TOP - PAGE.bottom) / ROW);

/** Builds the PDF. Check the pattern with `checkPatternKeeper` first and pass the report in. */
export async function patternKeeperPdf(p: Pattern, report: PkReport, o: PkPdfOptions): Promise<Uint8Array> {
  const pdf = new PdfWriter();
  await pdf.embedSymbolFont(SYMBOL_FONT.name, o.font, Object.values(SYMBOL_GLYPHS));
  const { cell, list } = tiles(p);
  const full = report.issues.length > 0 && !!o.fullChart;

  // 1. the chart Pattern Keeper reads
  for (const t of list) {
    const page = new PdfPage(PAGE.w, PAGE.h);
    const { ox, oy } = frame(page, p, t, cell, "Chart for Pattern Keeper", list.length);
    grid(page, p, t, cell, ox, oy);
    const cells: { x: number; y: number; glyph: number }[] = [];
    for (let y = t.y; y < t.y + t.h; y++)
      for (let x = t.x; x < t.x + t.w; x++) {
        const k = p.layers.stitches[y * p.w + x]!;
        const glyph = report.supported.has(k) ? SYMBOL_GLYPHS[p.key[k]!.sym]?.[0] : undefined;
        if (glyph) cells.push({ x: ox + (x - t.x) * cell, y: oy + (y - t.y) * cell, glyph });
      }
    page.glyphs(cell, cells);
    await pdf.addPage(page);
  }

  /*
   * Its key. Pattern Keeper finds the thread list by these exact header names — its own guide for WinStitch says
   * "It is important to use these header names": Number, Name (and Strands) — so there are no other headers and
   * no other columns (stitch counts are on the next page). Each row: the symbol (same font and glyph as on the
   * chart), a colour sample, "DMC 310", the name, the strands, all on one baseline.
   */
  const rows = [...report.supported].sort(([a], [b]) => a - b).map(([k, count]) => {
    const e = p.key[k]!, c = resolveColor(p, e.src), parts = c?.parts;
    return {
      glyph: SYMBOL_GLYPHS[e.sym]?.[0],
      hex: c?.hex ?? "#cccccc",
      number: parts ? parts.map((q) => brandCode(q.entry)).join(" + ") : brandCode(c),
      name: parts ? parts.map((q) => q.entry.name).join(" + ") : (c?.name ?? "?"),
      strands: parts ? parts.map((q) => q.n).join("+") : String(e.n ?? ""),
      count,
    };
  });
  const col = { sym: PAGE.left, swatch: PAGE.left + 22, number: PAGE.left + 46, name: PAGE.left + 200, strands: PAGE.w - PAGE.right - 60 };
  const SYM = 12;
  const keyPages = Math.max(1, Math.ceil(rows.length / KEY_ROWS));
  for (let n = 0; n < keyPages; n++) {
    const page = new PdfPage(PAGE.w, PAGE.h);
    page.text("bold", 10, PAGE.left, 24, p.name || "Pattern");
    page.text("regular", 8, PAGE.left, 36, `Thread list for Pattern Keeper · page ${n + 1} of ${keyPages}`, "left", 0.35);
    page.text("bold", 8, col.number, 60, "Number");
    page.text("bold", 8, col.name, 60, "Name");
    page.text("bold", 8, col.strands, 60, "Strands");
    page.lines([[PAGE.left, 65, PAGE.w - PAGE.right, 65]], 0.6);
    const part = rows.slice(n * KEY_ROWS, (n + 1) * KEY_ROWS);
    part.forEach((r, i) => {
      const y = KEY_TOP + i * ROW, base = y + SYM;
      page.rect(col.sym, y, SYM, SYM, { stroke: 0.4, width: 0.4 });
      page.rect(col.swatch, y, SYM, SYM, { fill: r.hex, stroke: 0.4, width: 0.4 });
      page.text("regular", 10, col.number, base, r.number);
      page.text("regular", 10, col.name, base, r.name);
      page.text("regular", 10, col.strands, base, r.strands);
    });
    page.glyphs(SYM, part.flatMap((r, i) => (r.glyph ? [{ x: col.sym, y: KEY_TOP + i * ROW, glyph: r.glyph }] : [])));
    await pdf.addPage(page);
  }

  // stitch counts and what the chart leaves out: plain lines on their own page, away from the thread list
  const notes: { text: string; bold?: boolean }[] = [{ text: "Stitches per thread", bold: true }, ...rows.map((r) => ({ text: `${r.number}   ${r.name}: ${r.count}` }))];
  if (report.issues.length) {
    notes.push({ text: "" }, { text: "Not in the Pattern Keeper chart (it tracks full crosses only)", bold: true }, ...report.issues.map((issue) => ({ text: `${issue.count} ${ISSUE_TEXT[issue.kind]}` })));
    if (full) notes.push({ text: "" }, { text: "They are on the full chart on the following pages. Import only the pages before this one into Pattern Keeper." });
  }
  const NOTE_ROWS = Math.floor((PAGE.h - 60 - PAGE.bottom) / 14);
  for (let n = 0; n * NOTE_ROWS < notes.length; n++) {
    const page = new PdfPage(PAGE.w, PAGE.h);
    page.text("bold", 10, PAGE.left, 24, p.name || "Pattern");
    page.text("regular", 8, PAGE.left, 36, "About this chart", "left", 0.35);
    notes.slice(n * NOTE_ROWS, (n + 1) * NOTE_ROWS).forEach((line, i) => page.text(line.bold ? "bold" : "regular", 9, PAGE.left, 62 + i * 14, line.text));
    await pdf.addPage(page);
  }

  // 2. the full chart, as pictures
  if (full) {
    for (const t of list) {
      const page = new PdfPage(PAGE.w, PAGE.h);
      const { ox, oy } = frame(page, p, t, cell, "Full chart (not for Pattern Keeper)", list.length);
      page.image(await pdf.image(o.fullChart!(t)), ox, oy, t.w * cell, t.h * cell);
      page.rect(ox, oy, t.w * cell, t.h * cell, { stroke: 0, width: 1.1 });
      await pdf.addPage(page);
    }
    const usage = computeUsage(p).perEntry;
    const all = p.key.flatMap((e, k) => {
      const count = entryCount(usage.get(k)) + partialCount(usage.get(k));
      return e && k && count ? [{ k, count, ...englishLabel(labelData(e, resolveColor(p, e.src))) }] : [];
    });
    const pages = Math.max(1, Math.ceil(all.length / KEY_ROWS));
    for (let n = 0; n < pages; n++) {
      const page = new PdfPage(PAGE.w, PAGE.h);
      page.text("bold", 10, PAGE.left, 24, p.name || "Pattern");
      page.text("regular", 8, PAGE.left, 36, `Full key · page ${n + 1} of ${pages}`, "left", 0.35);
      page.lines([[PAGE.left, 65, PAGE.w - PAGE.right, 65]], 0.6);
      const part = all.slice(n * KEY_ROWS, (n + 1) * KEY_ROWS);
      for (const [i, r] of part.entries()) {
        const y = KEY_TOP + i * ROW, icon = o.keyIcon?.(r.k);
        if (icon) page.image(await pdf.image(icon), PAGE.left, y, 14, 14);
        page.rect(PAGE.left, y, 14, 14, { stroke: 0.4, width: 0.4 });
        page.text("bold", 9.5, PAGE.left + 24, y + 10.5, r.title);
        page.text("regular", 9.5, PAGE.left + 190, y + 10.5, r.sub.length > 64 ? `${r.sub.slice(0, 63)}…` : r.sub);
        page.text("regular", 9.5, PAGE.w - PAGE.right, y + 10.5, String(r.count), "right");
      }
      await pdf.addPage(page);
    }
  }
  return pdf.build({ title: p.name || "Pattern", producer: "ptashechka" });
}
