import { isMajorLine, majorOffset, rulerLabels } from "../../grid/numbering";
import type { LabelData } from "../../labels/keyLabel";
import type { Pattern, Rect } from "../../pattern/types";
import type { PdfPage } from "./pdfWriter";

/** What both chart PDFs share (SPEC §15.10): A4 portrait in points, the grid and its numbers, English labels. */
export const PAGE = { w: 595.28, h: 841.89, left: 42, right: 26, top: 58, bottom: 34 };

/** One page's part of the chart, numbered from 1. */
export interface Tile extends Rect {
  n: number;
}

/** Thin lines between cells, heavy ones every 10 following the chart's numbering (§15.2), and a border. */
export function drawGrid(page: PdfPage, p: Pattern, t: Rect, cell: number, ox: number, oy: number) {
  const size = { w: p.w, h: p.h }, mx = majorOffset(p.grid, "x", size), my = majorOffset(p.grid, "y", size);
  const minor: [number, number, number, number][] = [], major: [number, number, number, number][] = [];
  const right = ox + t.w * cell, bottom = oy + t.h * cell;
  for (let i = 0; i <= t.w; i++) (isMajorLine(t.x + i, mx) ? major : minor).push([ox + i * cell, oy, ox + i * cell, bottom]);
  for (let j = 0; j <= t.h; j++) (isMajorLine(t.y + j, my) ? major : minor).push([ox, oy + j * cell, right, oy + j * cell]);
  page.lines(minor, 0.3, 0.55);
  page.lines(major, 0.9, 0);
  page.rect(ox, oy, t.w * cell, t.h * cell, { stroke: 0, width: 1.1 });
}

/** Column numbers above and row numbers left of the grid, every 10 as on the chart's rulers. */
export function drawRulers(page: PdfPage, p: Pattern, t: Rect, cell: number, ox: number, oy: number) {
  const size = { w: p.w, h: p.h };
  for (const l of rulerLabels(p.grid, "x", size, 10)) if (l.at >= t.x && l.at <= t.x + t.w) page.text("regular", 7, ox + (l.at - t.x) * cell, oy - 4, String(l.text), "centre", 0.3);
  for (const l of rulerLabels(p.grid, "y", size, 10)) if (l.at >= t.y && l.at <= t.y + t.h) page.text("regular", 7, ox - 4, oy + (l.at - t.y) * cell + 2.5, String(l.text), "right", 0.3);
}

const STITCH_TEXT = { full: "full cross", half: "half cross /", halfb: "half cross \\" } as const;

/** A key label in English (the interface's own labels may be Cyrillic, and the PDF text is Latin only). */
export function englishLabel(d: LabelData): { title: string; sub: string } {
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
