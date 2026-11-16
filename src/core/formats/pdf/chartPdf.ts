import { computeUsage, entryCount, partialCount } from "../../calculator/usage";
import { shade } from "../../color/colorMath";
import type { EntryKindId, KeyIndex } from "../../pattern/types";
import { formatLabel, labelData, type Translate } from "../../labels/keyLabel";
import { buildPalette, type Palette, type PaletteSlot } from "../../pattern/palette";
import { resolveColor } from "../../pattern/resolve";
import type { Pattern } from "../../pattern/types";
import { partialAnchor, partialKind } from "../../stitches/partialKinds";
import { DEFAULT_LINE_INK, LINE_INKS } from "../../symbols/lineInks";
import { shapeSymbol } from "../../symbols/shapes";
import { SYMBOL_FONT, SYMBOL_GLYPHS } from "../../symbols/symbolFont";
import type { PdfFonts } from "./patternKeeper";
import { drawFooter, drawGrid, drawRulers, PAGE, type Tile } from "./pdfLayout";
import { PdfPage, PdfWriter, textWidth } from "./pdfWriter";
import { PdfCanvas, type CanvasLike } from "./pdfCanvas";
import { SYMBOL_INKS, symbolColours, type SymbolColour } from "./symbolColours";
import { svgPathToPdf } from "./svgPath";

/*
 * The PDF chart to print and read (SPEC §15.10b): a cover with a page map; the symbol chart (black symbols, with
 * red / green / blue where many different symbols are mixed — symbolColours.ts) and its own key; the symbols on
 * their colours; a colour chart in pale colours where backstitch and knots stand out in bright colours, thick, in
 * their line styles; and the full key. A4 portrait, about 40 stitches across; neighbouring pages repeat a few rows
 * or columns, shaded grey on both pages, so the pages can be lined up. Everything is vector: symbols from the
 * embedded symbol font (hand-drawn ones as paths), colours, lines. The text is in the interface language (`t`, the
 * `chartPdf.*` messages; key labels as in the app), in DM Sans with Onest for Cyrillic.
 */

export type ChartView = "symbols" | "symbolsColour" | "full";


/** Stitches across a page, the biggest cell, and how many rows / columns neighbouring pages share. */
const COLS = 40, MAX_CELL = 18, OVERLAP = 2;
const INK = "#1D1A16", SHARED_BG = "#E2E2E2", SHARED_TINT = "#7A7A7A";
/** On the colour chart with backstitch: cells this much paler (towards white), symbols in grey. */
const PALE = 0.74, PALE_INK = "#77726B";
/** Knots on that chart: bright, readable on pale colours, one per entry in key order (backstitch: its own colour). */
export const LINE_COLOURS = [...LINE_INKS.slice(1).map((c) => c.hex), "#00897B", "#D81B9C", "#8D5524", "#0091EA", "#B71C1C"];

/** Draws a backstitch line in its line style — the screen's own drawing (render/primitives/lineStyles), passed in. */
export type LineStyleDraw = (g: CanvasLike, x1: number, y1: number, x2: number, y2: number, width: number, unit: number, sym: string) => void;

export interface ChartPdfOptions {
  fonts: PdfFonts;
  /** The interface's translations: page texts are `chartPdf.*`, key labels as in the app. */
  t: Translate;
  /** Rows / columns repeated on neighbouring pages (default 2). */
  overlap?: number;
  /** Backstitch line styles; without it lines are solid. */
  lineStyle?: LineStyleDraw;
}

/** Colours the chart pages use beyond the threads' own: symbol inks on the symbol chart, lines and knots on the last. */
interface Accents {
  symbol: Map<KeyIndex, SymbolColour>;
  line: Map<KeyIndex, string>;
}

const pale = (hex: string) => shade(hex, PALE);
/** Line width on the backstitch chart: thick, and thicker with more strands. */
const boldWidth = (cell: number, strands: number) => cell * (0.16 + 0.05 * Math.min(4, Math.max(1, strands)));
/** The line style's pattern unit grows with the line, so dashes, waves and ornaments stay readable on a thick line. */
const styleUnit = (cell: number, width: number) => Math.max(cell * 0.12, width * 0.85);

function strokeLines(page: PdfPage, lines: { x1: number; y1: number; x2: number; y2: number; colour: string; width: number; unit: number; sym: string }[], draw?: LineStyleDraw) {
  if (!lines.length) return;
  const g = new PdfCanvas(page);
  for (const l of lines) {
    g.strokeStyle = l.colour;
    if (draw) draw(g, l.x1, l.y1, l.x2, l.y2, l.width, l.unit, l.sym);
    else {
      g.save();
      g.lineWidth = l.width;
      g.lineCap = "round";
      g.beginPath();
      g.moveTo(l.x1, l.y1);
      g.lineTo(l.x2, l.y2);
      g.stroke();
      g.restore();
    }
  }
  g.end();
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

function drawChartPage(page: PdfPage, p: Pattern, palette: Palette, l: ChartLayout, t: ChartLayout["tiles"][number], view: ChartView, accents: Accents, draw?: LineStyleDraw) {
  const { cell } = l, ox = PAGE.left, oy = PAGE.top, colour = view !== "symbols", bold = view === "full";
  const { stitches, beads, partials, segments, knots } = p.layers;
  const X = (x: number) => ox + (x - t.x) * cell, Y = (y: number) => oy + (y - t.y) * cell;
  const inTile = (x: number, y: number) => x >= t.x && y >= t.y && x < t.x + t.w && y < t.y + t.h;
  const shared = sharedStrips(l, t).map((r) => [X(r.x), Y(r.y), r.w * cell, r.h * cell] as const);
  const symbols = new Symbols();
  /** Cell colours: the thread's, or pale on the backstitch chart so the lines stand out. */
  const fill = (hex: string) => (bold ? pale(hex) : hex);
  /** Symbol ink: red / green / blue / black on the symbol chart, the colour's own ink on colour, grey under lines. */
  const ink = (k: KeyIndex, s: PaletteSlot, own = s.ink) => (bold ? PALE_INK : colour ? own : SYMBOL_INKS[accents.symbol.get(k) ?? "black"]);

  // background: the fabric (colour) or white with the shared cells grey (symbols)
  if (colour) page.rects([[ox, oy, t.w * cell, t.h * cell]], fill(p.fabric));
  else page.rects(shared, SHARED_BG);

  // crosses, half crosses, floss + bead
  const fills = new Map<string, [number, number, number, number][]>(), halfLines: [number, number, number, number][] = [];
  for (let y = t.y; y < t.y + t.h; y++)
    for (let x = t.x; x < t.x + t.w; x++) {
      const i = y * p.w + x, k = stitches[i] ?? 0, s = palette[k];
      if (!s || s.st === "point") continue;
      const px = X(x), py = Y(y), hex = fill(s.hex);
      if (s.st === "full") {
        if (colour) (fills.get(hex) ?? fills.set(hex, []).get(hex)!).push([px, py, cell, cell]);
      } else if (colour) {
        page.polygon(halfBand(s.st).map(([u, v]) => [px + u * cell, py + v * cell]), { fill: hex });
        // the symbol of a half cross sits half on the floss, half on the fabric: dark ink on a small white disc
        if (!beads[i] && !bold) page.circle(px + cell / 2, py + cell / 2, cell * 0.3, { fill: "#FFFFFF" });
      } else halfLines.push(s.st === "half" ? [px, py + cell, px + cell, py] : [px, py, px + cell, py + cell]);
      if (s.t === "combo" && s.bead) page.circle(px + cell * 0.8, py + cell * 0.8, cell * 0.14, colour ? { fill: fill(s.bead.hex), stroke: "#555555", width: 0.3 } : { stroke: "#777777", width: 0.4 });
      // a bead on top shows its own symbol instead
      if (!beads[i]) symbols.add(s.sym, px + cell / 2, py + cell / 2, s.st === "full" ? cell : cell * 0.75, s.st === "full" ? ink(k, s) : ink(k, s, INK));
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
      page.polygon(partialKind(ps.kind).polygon(ps.corner).map(([u, v]) => [X(x) + u * cell, Y(y) + v * cell]), colour ? { fill: fill(s.hex) } : { fill: "#EBEBEB", stroke: "#9A9A9A", width: 0.3 });
      const [ax, ay] = partialAnchor(ps.kind, ps.corner);
      symbols.add(s.sym, X(x) + ax * cell, Y(y) + ay * cell, cell * 0.5, ink(ps.k, s));
    }
  }

  // beads
  for (let y = t.y; y < t.y + t.h; y++)
    for (let x = t.x; x < t.x + t.w; x++) {
      const k = beads[y * p.w + x] ?? 0, s = palette[k];
      if (!s) continue;
      const cx = X(x) + cell / 2, cy = Y(y) + cell / 2, r = cell * Math.min(0.45, s.bead?.shape.r ?? 0.4);
      page.circle(cx, cy, r, colour ? { fill: fill(s.bead?.hex ?? s.hex), stroke: "#555555", width: 0.4 } : { fill: "#FFFFFF", stroke: "#777777", width: 0.5 });
      symbols.add(s.sym, cx, cy, cell * 0.72, ink(k, s, s.bead?.ink ?? s.ink));
    }

  // beads sewn on grid points: on every chart, like the beads in cells
  for (const kn of knots) {
    const s = palette[kn.k];
    if (!s || (s.t !== "combo" && s.t !== "bead") || kn.x < t.x || kn.y < t.y || kn.x > t.x + t.w || kn.y > t.y + t.h) continue;
    page.circle(X(kn.x), Y(kn.y), cell * 0.3, colour ? { fill: fill(s.bead?.hex ?? s.hex), stroke: "#555555", width: 0.4 } : { fill: "#FFFFFF", stroke: "#777777", width: 0.5 });
    symbols.add(s.sym, X(kn.x), Y(kn.y), cell * 0.55, ink(kn.k, s, s.bead?.ink ?? s.ink));
  }

  // the shared cells, tinted over the colours so the symbols on them stay crisp
  if (colour && shared.length) {
    page.save();
    page.opacity(bold ? 0.22 : 0.3);
    page.rects(shared, SHARED_TINT);
    page.restore();
  }
  drawGrid(page, p, t, cell, ox, oy);
  symbols.draw(page);

  // backstitch and knots, on top: bright, thick, in their line styles
  if (bold) {
    page.save();
    page.clipRect(ox, oy, t.w * cell, t.h * cell);
    const lines = segments.flatMap((sg) => {
      const s = palette[sg.k];
      if (!s || Math.max(sg.x1, sg.x2) < t.x || Math.min(sg.x1, sg.x2) > t.x + t.w || Math.max(sg.y1, sg.y2) < t.y || Math.min(sg.y1, sg.y2) > t.y + t.h) return [];
      const width = boldWidth(cell, s.n);
      return [{ x1: X(sg.x1), y1: Y(sg.y1), x2: X(sg.x2), y2: Y(sg.y2), colour: accents.line.get(sg.k) ?? INK, width, unit: styleUnit(cell, width), sym: s.sym }];
    });
    strokeLines(page, lines, draw);
    for (const kn of knots) {
      const s = palette[kn.k];
      if (s && s.t === "knot" && kn.x >= t.x && kn.y >= t.y && kn.x <= t.x + t.w && kn.y <= t.y + t.h) page.circle(X(kn.x), Y(kn.y), cell * 0.26, { fill: accents.line.get(kn.k) ?? s.hex, stroke: INK, width: 0.7 });
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

interface KeyRow {
  k: KeyIndex;
  t: EntryKindId;
  count: number;
  title: string;
  sub: string;
}

const KEY_ROW = 22, KEY_TOP = 92, KEY_PER_PAGE = Math.floor((PAGE.h - KEY_TOP - PAGE.bottom) / KEY_ROW);
const keyPageCount = (rows: number) => Math.max(1, Math.ceil(rows / KEY_PER_PAGE));

/** Key pages: each row an icon (drawn by `icon` in a 16 pt square), brand and number, details, count. */
/** One line of text broken into lines of at most `max` points. */
function wrap(text: string, size: number, max: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (line && textWidth(next, size) > max) {
      out.push(line);
      line = word;
    } else line = next;
  }
  return line ? [...out, line] : out;
}

async function addKey(pdf: PdfWriter, p: Pattern, tr: Translate, title: string, note: string, rows: KeyRow[], icon: (page: PdfPage, symbols: Symbols, r: KeyRow, x: number, y: number, size: number) => void) {
  const name = p.name || "Pattern", pages = keyPageCount(rows.length);
  for (let n = 0; n < pages; n++) {
    const page = new PdfPage(PAGE.w, PAGE.h), L = PAGE.left, R = PAGE.w - PAGE.right, S = 16, symbols = new Symbols();
    page.text("bold", 10, L, 24, fit(name, 10, 400, "bold"));
    page.text("regular", 8, L, 36, `${title} · ${tr("chartPdf.pageOf", { n: n + 1, total: pages })}`, "left", 0.35);
    wrap(note, 9, R - L).slice(0, 2).forEach((line, i) => page.text("regular", 9, L, 56 + i * 12, line, "left", 0.3));
    page.lines([[L, KEY_TOP - 10, R, KEY_TOP - 10]], 0.6);
    rows.slice(n * KEY_PER_PAGE, (n + 1) * KEY_PER_PAGE).forEach((r, i) => {
      const y = KEY_TOP + i * KEY_ROW, base = y + 11.5;
      icon(page, symbols, r, L, y, S);
      page.rect(L, y, S, S, { stroke: 0.45, width: 0.4 });
      page.text("bold", 9.5, L + 26, base, fit(r.title, 9.5, 150, "bold"));
      page.text("regular", 9, L + 182, base, fit(r.sub, 9, R - L - 182 - 80), "left", 0.2);
      page.text("regular", 9, R, base, tr(`chartPdf.unit.${r.t}`, { count: r.count }), "right");
      page.lines([[L, y + KEY_ROW - 3, R, y + KEY_ROW - 3]], 0.3, 0.8);
    });
    symbols.draw(page);
    drawFooter(page, tr("chartPdf.footer", { app: "{app}", url: "{url}" }), tr("app.url"));
    await pdf.addPage(page);
  }
}

/** Accent colours: symbol inks for the symbol chart; one bright colour per backstitch, then per knot, entry. */
function accentsFor(p: Pattern): Accents {
  const line = new Map<KeyIndex, string>();
  let n = 0;
  // backstitch in the colour chosen in the key (black unless set); knots each in a vibrant colour of their own
  p.key.forEach((e, k) => e?.t === "back" && line.set(k, e.ink ?? DEFAULT_LINE_INK));
  p.key.forEach((e, k) => e?.t === "knot" && line.set(k, LINE_COLOURS[n++ % LINE_COLOURS.length]!));
  return { symbol: symbolColours(p), line };
}

export async function chartPdf(p: Pattern, o: ChartPdfOptions): Promise<Uint8Array> {
  const pdf = new PdfWriter();
  await pdf.embedTextFonts(o.fonts);
  await pdf.embedSymbolFont(SYMBOL_FONT.name, o.fonts.symbols, Object.values(SYMBOL_GLYPHS));
  const palette = buildPalette(p), l = chartLayout(p, o.overlap), name = p.name || "Pattern", accents = accentsFor(p), tr = o.t;
  const view = (v: ChartView) => tr(`chartPdf.views.${v}`), footer = tr("chartPdf.footer", { app: "{app}", url: "{url}" }), url = tr("app.url");
  const pagesPerView = l.tiles.length;
  const usage = computeUsage(p).perEntry;
  const rows: KeyRow[] = p.key.flatMap((e, k) => {
    const u = usage.get(k), count = entryCount(u) + partialCount(u);
    return e && k && count ? [{ k, t: e.t, count, ...formatLabel(labelData(e, resolveColor(p, e.src)), tr) }] : [];
  });
  // the symbol chart shows what fills cells; its key lists just those
  const symbolRows = rows.filter((r) => r.t === "thread" || r.t === "combo" || r.t === "bead");
  const symbolKeyPages = keyPageCount(symbolRows.length), keyPages = keyPageCount(rows.length);
  const sections = [
    { title: view("symbols"), pages: pagesPerView },
    { title: tr("chartPdf.symbolKey"), pages: symbolKeyPages },
    { title: view("symbolsColour"), pages: pagesPerView },
    { title: view("full"), pages: pagesPerView },
    { title: tr("chartPdf.key"), pages: keyPages },
  ];

  // cover: what the pattern is, what is in the file, how the pages fit together
  {
    const page = new PdfPage(PAGE.w, PAGE.h), L = PAGE.left;
    page.text("bold", 20, L, 70, fit(name, 20, PAGE.w - L - PAGE.right, "bold"));
    let y = 92;
    for (const line of [p.meta.designer && tr("chartPdf.designedBy", { name: p.meta.designer }), p.meta.copyright && `© ${p.meta.copyright}`].filter(Boolean) as string[]) {
      page.text("regular", 10, L, y, line, "left", 0.3);
      y += 14;
    }
    // numbers, so each language writes them its own way (10.9 / 10,9)
    const count = Math.floor(p.count) || 14, cm = (n: number) => Math.round((n / count) * 25.4) / 10, inch = (n: number) => Math.round((n / count) * 10) / 10;
    page.text("regular", 10, L, (y += 10), tr("chartPdf.size", { w: p.w, h: p.h, count, cmW: cm(p.w), cmH: cm(p.h), inW: inch(p.w), inH: inch(p.h) }));
    y += 26;
    page.text("bold", 11, L, y, tr("chartPdf.inFile"));
    let at = 2;
    for (const sec of sections) {
      page.text("regular", 10, L + 8, (y += 16), sec.title);
      page.text("regular", 10, L + 250, y, sec.pages > 1 ? tr("chartPdf.pageRange", { from: at, to: at + sec.pages - 1 }) : tr("chartPdf.pageOne", { n: at }), "left", 0.35);
      at += sec.pages;
    }
    y += 30;
    page.text("bold", 11, L, y, tr("chartPdf.howTitle"));
    for (const line of wrap(tr("chartPdf.howText", { count: pagesPerView, overlap: l.overlap }), 9, PAGE.w - L - PAGE.right)) page.text("regular", 9, L, (y += 13), line, "left", 0.25);
    drawPageMap(page, p, l, null, L, y + 16, PAGE.w - L - PAGE.right, PAGE.h - y - 16 - 60, true);
    drawFooter(page, footer, url);
    await pdf.addPage(page);
  }

  const chartPages = async (v: ChartView) => {
    for (const t of l.tiles) {
      const page = new PdfPage(PAGE.w, PAGE.h);
      page.text("bold", 10, PAGE.left, 24, fit(name, 10, 330, "bold"));
      page.text("regular", 8, PAGE.left, 36, `${view(v)} · ${tr("chartPdf.pageOf", { n: t.n, total: pagesPerView })} · ${tr("chartPdf.cells", { x1: t.x + 1, x2: t.x + t.w, y1: t.y + 1, y2: t.y + t.h, w: p.w, h: p.h })}`, "left", 0.35);
      if (l.tiles.length > 1) drawPageMap(page, p, l, t.n, PAGE.w - PAGE.right - 70, 10, 70, 34, false);
      drawRulers(page, p, t, l.cell, PAGE.left, PAGE.top);
      drawChartPage(page, p, palette, l, t, v, accents, o.lineStyle);
      drawFooter(page, footer, url);
      await pdf.addPage(page);
    }
  };

  // 1. the symbol chart and its own key: the symbols in the inks the chart uses
  await chartPages("symbols");
  await addKey(pdf, p, tr, tr("chartPdf.symbolKey"), tr("chartPdf.symbolKeyNote"), symbolRows, (page, symbols, r, x, y, S) => {
    const s = palette[r.k]!, inkFor = SYMBOL_INKS[accents.symbol.get(r.k) ?? "black"], cx = x + S / 2, cy = y + S / 2;
    page.rect(x, y, S, S, { fill: "#FFFFFF" });
    if (r.t === "bead" || s.st === "point") page.circle(cx, cy, S * 0.42, { fill: "#FFFFFF", stroke: "#777777", width: 0.5 });
    else if (s.st !== "full") page.lines([s.st === "half" ? [x, y + S, x + S, y] : [x, y, x + S, y + S]], 0.6, 0.6);
    symbols.add(s.sym, cx, cy, r.t === "bead" || s.st === "point" ? S * 0.72 : s.st === "full" ? S : S * 0.75, inkFor);
  });

  // 2 and 3: on colour, and pale colour with the lines
  await chartPages("symbolsColour");
  await chartPages("full");

  // the full key: thread colours; backstitch and knots in the bright colours and line styles of the last chart
  await addKey(pdf, p, tr, tr("chartPdf.key"), tr("chartPdf.keyNote", { count: Math.floor(p.count) || 14, w: p.w, h: p.h }), rows, (page, symbols, r, x, y, S) => {
    const s = palette[r.k]!, cx = x + S / 2, cy = y + S / 2;
    if (r.t === "back") {
      page.rect(x, y, S, S, { fill: "#FFFFFF" });
      const width = boldWidth(S, s.n) * 0.6;
      strokeLines(page, [{ x1: x + 2, y1: y + S - 2, x2: x + S - 2, y2: y + 2, colour: accents.line.get(r.k) ?? INK, width, unit: styleUnit(S * 0.8, width), sym: s.sym }], o.lineStyle);
    } else if (r.t === "knot") {
      page.rect(x, y, S, S, { fill: "#FFFFFF" });
      page.circle(cx, cy, S * 0.27, { fill: accents.line.get(r.k) ?? s.hex, stroke: INK, width: 0.6 });
    } else if (r.t === "bead" || s.st === "point") {
      // a bead, in a cell or on a grid point
      page.rect(x, y, S, S, { fill: p.fabric });
      page.circle(cx, cy, S * 0.42, { fill: s.bead?.hex ?? s.hex, stroke: "#555555", width: 0.4 });
      symbols.add(s.sym, cx, cy, S * 0.72, s.bead?.ink ?? s.ink);
    } else {
      if (s.st === "full") page.rect(x, y, S, S, { fill: s.hex });
      else {
        page.rect(x, y, S, S, { fill: p.fabric });
        page.polygon(halfBand(s.st).map(([u, v]) => [x + u * S, y + v * S]), { fill: s.hex });
        page.circle(cx, cy, S * 0.3, { fill: "#FFFFFF" });
      }
      symbols.add(s.sym, cx, cy, s.st === "full" ? S : S * 0.75, s.st === "full" ? s.ink : INK);
    }
  });
  return pdf.build({ title: name, producer: "ptashechka" });
}
