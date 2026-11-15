import { computeUsage, entryCount, partialCount } from "../../calculator/usage";
import { hexToRgb, luma, shade } from "../../color/colorMath";
import { labelData } from "../../labels/keyLabel";
import { buildPalette, type Palette, type PaletteSlot } from "../../pattern/palette";
import { resolveColor } from "../../pattern/resolve";
import type { Pattern } from "../../pattern/types";
import { partialAnchor, partialKind } from "../../stitches/partialKinds";
import { shapeSymbol } from "../../symbols/shapes";
import { SYMBOL_FONT, SYMBOL_GLYPHS } from "../../symbols/symbolFont";
import type { PdfFonts } from "./patternKeeper";
import { drawGrid, drawRulers, englishLabel, PAGE, type Tile } from "./pdfLayout";
import { PdfPage, PdfWriter, textWidth } from "./pdfWriter";
import { svgPathToPdf } from "./svgPath";

/*
 * The PDF chart to print and read (SPEC §15.10b): a cover with a page map, then the chart three times — symbols
 * only; symbols on their colours; colours with backstitch, knots and symbols — and the full key. A4 portrait, about
 * 40 stitches across; neighbouring pages repeat a few rows or columns, shaded grey on both pages, so the pages can
 * be lined up. Everything is vector: symbols from the embedded symbol font (hand-drawn ones as paths), colours,
 * lines. The text is Latin only, in English.
 */

export type ChartView = "symbols" | "symbolsColour" | "full";

const VIEW_TITLE: Record<ChartView, string> = { symbols: "Symbol chart", symbolsColour: "Symbols on colour", full: "Colour chart with backstitch" };

/** Stitches across a page, the biggest cell, and how many rows / columns neighbouring pages share. */
const COLS = 40, MAX_CELL = 18, OVERLAP = 2;
const INK = "#1D1A16", SHARED_BG = "#E2E2E2", SHARED_TINT = "#7A7A7A";

export interface ChartPdfOptions {
  fonts: PdfFonts;
  /** Rows / columns repeated on neighbouring pages (default 2). */
  overlap?: number;
}

export interface ChartLayout {
  cell: number;
  overlap: number;
  /** Where each column / row of pages starts. */
  xs: number[];
  ys: number[];
  tiles: (Tile & { col: number; row: number })[];
}

/** First cells of the pages along one side: each page repeats the last `overlap` cells of the one before. */
function starts(n: number, per: number, overlap: number): number[] {
  if (n <= per) return [0];
  const out: number[] = [];
  for (let s = 0; ; s += per - overlap) {
    out.push(s);
    if (s + per >= n) return out;
  }
}

export function chartLayout(p: Pattern, overlap = OVERLAP): ChartLayout {
  const usableW = PAGE.w - PAGE.left - PAGE.right, usableH = PAGE.h - PAGE.top - PAGE.bottom;
  const cols = Math.min(p.w, COLS), cell = Math.min(MAX_CELL, usableW / cols), rows = Math.min(p.h, Math.floor(usableH / cell));
  const xs = starts(p.w, cols, overlap), ys = starts(p.h, rows, overlap);
  const tiles = ys.flatMap((y, row) => xs.map((x, col) => ({ x, y, w: Math.min(cols, p.w - x), h: Math.min(rows, p.h - y), col, row, n: 0 })));
  tiles.forEach((t, i) => (t.n = i + 1));
  return { cell, overlap, xs, ys, tiles };
}

/** The strips of a page that its neighbours repeat, in chart cells: left, right, top, bottom where there is a neighbour. */
export function sharedStrips(l: ChartLayout, t: ChartLayout["tiles"][number]) {
  const out: { x: number; y: number; w: number; h: number }[] = [];
  if (t.col > 0) out.push({ x: t.x, y: t.y, w: l.overlap, h: t.h });
  if (t.col < l.xs.length - 1) out.push({ x: l.xs[t.col + 1]!, y: t.y, w: t.x + t.w - l.xs[t.col + 1]!, h: t.h });
  if (t.row > 0) out.push({ x: t.x, y: t.y, w: t.w, h: l.overlap });
  if (t.row < l.ys.length - 1) out.push({ x: t.x, y: l.ys[t.row + 1]!, w: t.w, h: t.y + t.h - l.ys[t.row + 1]! });
  return out;
}

/** 1 strand is 1×, 2 strands add 1, each further strand half the previous addition (as on screen). */
const strandFactor = (n: number) => 1 + (1 - 0.5 ** (Math.max(1, n) - 1)) / 0.5;
/** Very light floss is darkened for lines, so white backstitch still shows on light fabric. */
const lineColour = (hex: string) => (luma(hexToRgb(hex)) > 215 ? shade(hex, -0.45) : hex);

/** Collects the symbols of a page, so each colour and size is one text object; hand-drawn ones are drawn as paths. */
class Symbols {
  private groups = new Map<string, { size: number; ink: string; cells: { x: number; y: number; glyph: number }[] }>();
  private drawn: { sym: string; cx: number; cy: number; size: number; ink: string }[] = [];

  /** A symbol whose glyph fills a `size` square centred on (cx, cy). */
  add(sym: string, cx: number, cy: number, size: number, ink: string) {
    const glyph = SYMBOL_GLYPHS[sym]?.[0];
    if (glyph === undefined) return void this.drawn.push({ sym, cx, cy, size, ink });
    const key = `${size}|${ink}`;
    if (!this.groups.has(key)) this.groups.set(key, { size, ink, cells: [] });
    this.groups.get(key)!.cells.push({ x: cx - size / 2, y: cy - size / 2, glyph });
  }

  draw(page: PdfPage) {
    for (const g of this.groups.values()) page.glyphs(g.size, g.cells, g.ink);
    for (const d of this.drawn) drawShapeSymbol(page, d.sym, d.cx, d.cy, d.size, d.ink);
  }
}

/** A hand-drawn symbol as vector paths, sized like a glyph of the symbol font (the shape fills 82% of the square). */
function drawShapeSymbol(page: PdfPage, sym: string, cx: number, cy: number, size: number, ink: string) {
  const shape = shapeSymbol(sym);
  if (!shape) return;
  const box = shape.box ?? 24, span = size * 0.82, k = span / box, x0 = cx - span / 2, y0 = cy - span / 2;
  const at = (x: number, y: number) => page.place(x0 + x * k, y0 + y * k);
  for (const part of shape.parts) {
    if (part.holes) {
      page.save();
      for (const hole of part.holes) page.clipOutside(svgPathToPdf(hole, at));
    }
    const d = svgPathToPdf(part.d, at);
    if (part.paint === "stroke") page.path(d, { stroke: ink, width: (part.w ?? (2.2 * box) / 24) * k, cap: part.cap ?? "round", join: part.join ?? "round" });
    else page.path(d, { fill: ink, evenOdd: part.rule === "evenodd" });
    if (part.holes) page.restore();
  }
}

/** Half-cross band in a unit cell: ╱ from bottom-left to top-right, ╲ from top-left to bottom-right. */
function halfBand(dir: "half" | "halfb", d = 0.24): [number, number][] {
  return dir === "half"
    ? [[1 - d, 0], [1, 0], [1, d], [d, 1], [0, 1], [0, 1 - d]]
    : [[0, 0], [d, 0], [1, 1 - d], [1, 1], [1 - d, 1], [0, d]];
}

function drawChartPage(page: PdfPage, p: Pattern, palette: Palette, l: ChartLayout, t: ChartLayout["tiles"][number], view: ChartView) {
  const { cell } = l, ox = PAGE.left, oy = PAGE.top, colour = view !== "symbols";
  const { stitches, beads, partials, segments, knots } = p.layers;
  const X = (x: number) => ox + (x - t.x) * cell, Y = (y: number) => oy + (y - t.y) * cell;
  const inTile = (x: number, y: number) => x >= t.x && y >= t.y && x < t.x + t.w && y < t.y + t.h;
  const shared = sharedStrips(l, t).map((r) => [X(r.x), Y(r.y), r.w * cell, r.h * cell] as const);
  const symbols = new Symbols();
  const ink = (s: PaletteSlot) => (colour ? s.ink : INK);

  // background: the fabric (colour) or white with the shared cells grey (symbols)
  if (colour) page.rects([[ox, oy, t.w * cell, t.h * cell]], p.fabric);
  else page.rects(shared, SHARED_BG);

  // crosses, half crosses, floss + bead
  const fills = new Map<string, [number, number, number, number][]>(), halfLines: [number, number, number, number][] = [];
  for (let y = t.y; y < t.y + t.h; y++)
    for (let x = t.x; x < t.x + t.w; x++) {
      const i = y * p.w + x, s = palette[stitches[i] ?? 0];
      if (!s) continue;
      const px = X(x), py = Y(y);
      if (s.st === "full") {
        if (colour) (fills.get(s.hex) ?? fills.set(s.hex, []).get(s.hex)!).push([px, py, cell, cell]);
      } else if (colour) {
        page.polygon(halfBand(s.st).map(([u, v]) => [px + u * cell, py + v * cell]), { fill: s.hex });
        // the symbol of a half cross sits half on the floss, half on the fabric: dark ink on a small white disc
        if (!beads[i]) page.circle(px + cell / 2, py + cell / 2, cell * 0.3, { fill: "#FFFFFF" });
      } else halfLines.push(s.st === "half" ? [px, py + cell, px + cell, py] : [px, py, px + cell, py + cell]);
      if (s.t === "combo" && s.bead) page.circle(px + cell * 0.8, py + cell * 0.8, cell * 0.14, colour ? { fill: s.bead.hex, stroke: "#555555", width: 0.3 } : { stroke: "#777777", width: 0.4 });
      // a bead on top shows its own symbol instead
      if (!beads[i]) symbols.add(s.sym, px + cell / 2, py + cell / 2, s.st === "full" ? cell : cell * 0.75, s.st === "full" ? ink(s) : INK);
    }
  for (const [hex, boxes] of fills) page.rects(boxes, hex);
  page.lines(halfLines, 0.7, 0.6);

  // quarter, three-quarter and petite stitches
  for (const [i, list] of partials) {
    const x = i % p.w, y = (i / p.w) | 0;
    if (!inTile(x, y)) continue;
    for (const ps of list) {
      const s = palette[ps.k];
      if (!s) continue;
      page.polygon(partialKind(ps.kind).polygon(ps.corner).map(([u, v]) => [X(x) + u * cell, Y(y) + v * cell]), colour ? { fill: s.hex } : { fill: "#EBEBEB", stroke: "#9A9A9A", width: 0.3 });
      const [ax, ay] = partialAnchor(ps.kind, ps.corner);
      symbols.add(s.sym, X(x) + ax * cell, Y(y) + ay * cell, cell * 0.5, ink(s));
    }
  }

  // beads
  for (let y = t.y; y < t.y + t.h; y++)
    for (let x = t.x; x < t.x + t.w; x++) {
      const s = palette[beads[y * p.w + x] ?? 0];
      if (!s) continue;
      const cx = X(x) + cell / 2, cy = Y(y) + cell / 2, r = cell * Math.min(0.45, s.bead?.shape.r ?? 0.4);
      page.circle(cx, cy, r, colour ? { fill: s.bead?.hex ?? s.hex, stroke: "#555555", width: 0.4 } : { fill: "#FFFFFF", stroke: "#777777", width: 0.5 });
      symbols.add(s.sym, cx, cy, cell * 0.72, colour ? (s.bead?.ink ?? s.ink) : INK);
    }

  // the shared cells, tinted over the colours so the symbols on them stay crisp
  if (colour && shared.length) {
    page.save();
    page.opacity(0.3);
    page.rects(shared, SHARED_TINT);
    page.restore();
  }
  drawGrid(page, p, t, cell, ox, oy);
  symbols.draw(page);

  // backstitch and knots, on top
  if (view === "full") {
    page.save();
    page.clipRect(ox, oy, t.w * cell, t.h * cell);
    for (const sg of segments) {
      const s = palette[sg.k];
      if (!s || Math.max(sg.x1, sg.x2) < t.x || Math.min(sg.x1, sg.x2) > t.x + t.w || Math.max(sg.y1, sg.y2) < t.y || Math.min(sg.y1, sg.y2) > t.y + t.h) continue;
      page.polygon([[X(sg.x1), Y(sg.y1)], [X(sg.x2), Y(sg.y2)]], { stroke: lineColour(s.hex), width: Math.max(0.8, cell * 0.105) * strandFactor(s.n), cap: "round" });
    }
    for (const kn of knots) {
      const s = palette[kn.k];
      if (s && kn.x >= t.x && kn.y >= t.y && kn.x <= t.x + t.w && kn.y <= t.y + t.h) page.circle(X(kn.x), Y(kn.y), cell * 0.2, { fill: s.hex, stroke: "#333333", width: 0.4 });
    }
    page.restore();
  }

  // centre marks under and right of the grid
  const cx = p.w / 2, cy = p.h / 2, bottom = Y(t.y + t.h), right = X(t.x + t.w);
  if (cx >= t.x && cx <= t.x + t.w) page.polygon([[X(cx), bottom + 2], [X(cx) - 4, bottom + 8], [X(cx) + 4, bottom + 8]], { fill: "#B5452F" });
  if (cy >= t.y && cy <= t.y + t.h) page.polygon([[right + 2, Y(cy)], [right + 8, Y(cy) - 4], [right + 8, Y(cy) + 4]], { fill: "#B5452F" });
}

/** Which part of the chart this page is: every page as a box, this one filled. */
function drawPageMap(page: PdfPage, p: Pattern, l: ChartLayout, current: number | null, x: number, y: number, w: number, h: number, numbers: boolean) {
  const k = Math.min(w / p.w, h / p.h), x0 = x + (w - p.w * k) / 2, y0 = y;
  for (const t of l.tiles) for (const r of sharedStrips(l, t)) page.rects([[x0 + r.x * k, y0 + r.y * k, r.w * k, r.h * k]], SHARED_BG);
  if (current) {
    const t = l.tiles[current - 1]!;
    page.rects([[x0 + t.x * k, y0 + t.y * k, t.w * k, t.h * k]], "#B9B9B9");
  }
  for (const t of l.tiles) page.rect(x0 + t.x * k, y0 + t.y * k, t.w * k, t.h * k, { stroke: 0.35, width: 0.5 });
  page.rect(x0, y0, p.w * k, p.h * k, { stroke: 0, width: 0.8 });
  if (numbers) for (const t of l.tiles) page.text("bold", Math.min(14, Math.max(7, t.h * k * 0.25)), x0 + (t.x + t.w / 2) * k, y0 + (t.y + t.h / 2) * k + 4, String(t.n), "centre", 0.25);
}

const fit = (text: string, size: number, max: number, font: "regular" | "bold" = "regular") => {
  if (textWidth(text, size, font) <= max) return text;
  let t = text;
  while (t.length > 1 && textWidth(`${t}…`, size, font) > max) t = t.slice(0, -1);
  return `${t}…`;
};

export async function chartPdf(p: Pattern, o: ChartPdfOptions): Promise<Uint8Array> {
  const pdf = new PdfWriter();
  await pdf.embedTextFonts(o.fonts);
  await pdf.embedSymbolFont(SYMBOL_FONT.name, o.fonts.symbols, Object.values(SYMBOL_GLYPHS));
  const palette = buildPalette(p), l = chartLayout(p, o.overlap), name = p.name || "Pattern";
  const views: ChartView[] = ["symbols", "symbolsColour", "full"];
  const pagesPerView = l.tiles.length;
  const usage = computeUsage(p).perEntry;
  const entries = p.key.flatMap((e, k) => {
    const u = usage.get(k), count = entryCount(u) + partialCount(u);
    return e && k && count ? [{ k, e, count, ...englishLabel(labelData(e, resolveColor(p, e.src))) }] : [];
  });
  const ROW = 22, KEY_TOP = 92, perKeyPage = Math.floor((PAGE.h - KEY_TOP - PAGE.bottom) / ROW);
  const keyPages = Math.max(1, Math.ceil(entries.length / perKeyPage));
  const firstPage = (v: number) => 2 + v * pagesPerView;

  // cover: what the pattern is, what is in the file, how the pages fit together
  {
    const page = new PdfPage(PAGE.w, PAGE.h), L = PAGE.left;
    page.text("bold", 20, L, 70, fit(name, 20, PAGE.w - L - PAGE.right, "bold"));
    let y = 92;
    for (const line of [p.meta.designer && `Designed by ${p.meta.designer}`, p.meta.copyright && `© ${p.meta.copyright}`].filter(Boolean) as string[]) {
      page.text("regular", 10, L, y, line, "left", 0.3);
      y += 14;
    }
    const count = Math.floor(p.count) || 14, cm = (n: number) => ((n / count) * 2.54).toFixed(1), inch = (n: number) => (n / count).toFixed(1);
    page.text("regular", 10, L, (y += 10), `${p.w} x ${p.h} stitches · on ${count} ct: ${cm(p.w)} x ${cm(p.h)} cm (${inch(p.w)} x ${inch(p.h)} in)`);
    y += 26;
    page.text("bold", 11, L, y, "In this file");
    const contents = [
      ...views.map((v, i) => [VIEW_TITLE[v], pagesPerView > 1 ? `pages ${firstPage(i)}-${firstPage(i) + pagesPerView - 1}` : `page ${firstPage(i)}`] as const),
      ["Key", keyPages > 1 ? `pages ${firstPage(3)}-${firstPage(3) + keyPages - 1}` : `page ${firstPage(3)}`] as const,
    ];
    for (const [what, where] of contents) {
      page.text("regular", 10, L + 8, (y += 16), what);
      page.text("regular", 10, L + 230, y, where, "left", 0.35);
    }
    y += 30;
    page.text("bold", 11, L, y, "How the chart pages fit together");
    page.text("regular", 9, L, (y += 15), `Each chart is split into ${pagesPerView} page${pagesPerView === 1 ? "" : "s"}, numbered as below. Grey cells at the edge of a page repeat`, "left", 0.25);
    page.text("regular", 9, L, (y += 12), `the ${l.overlap} row${l.overlap === 1 ? "" : "s"} or column${l.overlap === 1 ? "" : "s"} of the page next to it: lay them over each other to join the pages.`, "left", 0.25);
    drawPageMap(page, p, l, null, L, y + 16, PAGE.w - L - PAGE.right, PAGE.h - y - 16 - 60, true);
    await pdf.addPage(page);
  }

  // the chart, three times
  for (const view of views)
    for (const t of l.tiles) {
      const page = new PdfPage(PAGE.w, PAGE.h);
      page.text("bold", 10, PAGE.left, 24, fit(name, 10, 330, "bold"));
      page.text("regular", 8, PAGE.left, 36, `${VIEW_TITLE[view]} · page ${t.n} of ${pagesPerView} · columns ${t.x + 1}-${t.x + t.w}, rows ${t.y + 1}-${t.y + t.h} of ${p.w} x ${p.h}`, "left", 0.35);
      if (l.tiles.length > 1) drawPageMap(page, p, l, t.n, PAGE.w - PAGE.right - 70, 10, 70, 34, false);
      drawRulers(page, p, t, l.cell, PAGE.left, PAGE.top);
      drawChartPage(page, p, palette, l, t, view);
      await pdf.addPage(page);
    }

  // the full key
  const UNIT = { thread: "stitches", combo: "stitches", bead: "beads", back: "lines", knot: "knots" } as const;
  for (let n = 0; n < keyPages; n++) {
    const page = new PdfPage(PAGE.w, PAGE.h), L = PAGE.left, R = PAGE.w - PAGE.right;
    page.text("bold", 10, L, 24, fit(name, 10, 400, "bold"));
    page.text("regular", 8, L, 36, `Key · page ${n + 1} of ${keyPages}`, "left", 0.35);
    page.text("regular", 9, L, 60, `Fabric: ${Math.floor(p.count) || 14} ct · ${p.w} x ${p.h} stitches`, "left", 0.3);
    page.lines([[L, KEY_TOP - 10, R, KEY_TOP - 10]], 0.6);
    const symbols = new Symbols(), S = 16;
    entries.slice(n * perKeyPage, (n + 1) * perKeyPage).forEach((r, i) => {
      const y = KEY_TOP + i * ROW, s = palette[r.k]!, cx = L + S / 2, cy = y + S / 2;
      if (r.e.t === "back") {
        page.rect(L, y, S, S, { fill: p.fabric });
        page.polygon([[L + 2, y + S - 2], [L + S - 2, y + 2]], { stroke: lineColour(s.hex), width: 1.6 * strandFactor(s.n), cap: "round" });
      } else if (r.e.t === "knot") {
        page.rect(L, y, S, S, { fill: p.fabric });
        page.circle(cx, cy, S * 0.25, { fill: s.hex, stroke: "#333333", width: 0.4 });
      } else if (r.e.t === "bead") {
        page.rect(L, y, S, S, { fill: p.fabric });
        page.circle(cx, cy, S * 0.42, { fill: s.bead?.hex ?? s.hex, stroke: "#555555", width: 0.4 });
        symbols.add(s.sym, cx, cy, S * 0.72, s.bead?.ink ?? s.ink);
      } else {
        if (s.st === "full") page.rect(L, y, S, S, { fill: s.hex });
        else {
          page.rect(L, y, S, S, { fill: p.fabric });
          page.polygon(halfBand(s.st).map(([u, v]) => [L + u * S, y + v * S]), { fill: s.hex });
          page.circle(cx, cy, S * 0.3, { fill: "#FFFFFF" });
        }
        symbols.add(s.sym, cx, cy, s.st === "full" ? S : S * 0.75, s.st === "full" ? s.ink : INK);
      }
      page.rect(L, y, S, S, { stroke: 0.45, width: 0.4 });
      const base = y + 11.5;
      page.text("bold", 9.5, L + 26, base, fit(r.title, 9.5, 150, "bold"));
      page.text("regular", 9, L + 182, base, fit(r.sub, 9, R - L - 182 - 80), "left", 0.2);
      page.text("regular", 9, R, base, `${r.count.toLocaleString("en-US")} ${UNIT[r.e.t]}`, "right");
      page.lines([[L, y + ROW - 3, R, y + ROW - 3]], 0.3, 0.8);
    });
    symbols.draw(page);
    await pdf.addPage(page);
  }

  return pdf.build({ title: name, producer: "ptashechka" });
}
