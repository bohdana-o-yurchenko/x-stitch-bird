import { calculator } from "../../calculator/registry";
import { chartLines } from "../../layers/registry";
import { computeUsage, entryCount, partialCount } from "../../calculator/usage";
import { brandCode } from "../../catalog/catalog";
import { shade } from "../../color/colorMath";
import type { EntryKindId, KeyIndex } from "../../pattern/types";
import { formatLabel, labelData, type Translate } from "../../labels/keyLabel";
import { buildPalette, type Palette, type PaletteSlot } from "../../pattern/palette";
import { resolveColor } from "../../pattern/resolve";
import type { Pattern } from "../../pattern/types";
import { partialAnchor, partialKind } from "../../stitches/partialKinds";
import { cutOutColour } from "../../symbols/customSymbol";
import { DEFAULT_LINE_INK, LINE_INKS } from "../../symbols/lineInks";
import { shapeSymbol } from "../../symbols/shapes";
import { SYMBOL_FONT, SYMBOL_GLYPHS } from "../../symbols/symbolFont";
import type { PdfFonts } from "./patternKeeper";
import { drawFooter, drawGrid, drawHeader, drawRulers, fitText, PAGE, type PageBox, type Tile } from "./pdfLayout";
import { attachPattern } from "./patternAttachment";
import { PdfPage, PdfWriter, textWidth, type Raster, type Ref } from "./pdfWriter";
import { PdfCanvas, type CanvasLike } from "./pdfCanvas";
import { SYMBOL_INKS, symbolColours, type SymbolColour } from "./symbolColours";
import { svgPathToPdf } from "./svgPath";
import { MM, pageBox, PLAIN_PRINT, type CellSize, type ChartSpec, type Crosses, type Lines, type PrintOptions } from "./printOptions";

/*
 * The PDF chart to print and read (SPEC §15.10b, §15.10c): a cover with a page map, the instructions, the materials,
 * then the charts the Print dialog lists — each in its own colouring of the crosses (black and white; contrast:
 * black symbols with red / green / blue where many different symbols mix, symbolColours.ts; muted colours; real
 * colours) and of the backstitch and knots (hidden, black, bright, thread colours), in its own cell size, each
 * followed by its own key if wanted. Neighbouring pages repeat a few rows or columns, shaded grey on both pages, so
 * the pages can be lined up. Everything is vector: symbols from the embedded symbol font (hand-drawn ones as paths),
 * colours, lines. The text is in the interface language (`t`, the `chartPdf.*` messages; key labels as in the app),
 * in DM Sans with Onest for Cyrillic. Every page but the cover has the name, designer and © at the top and its page
 * number at the bottom.
 *
 * The pages are planned first (cheap: what each is, how many), then drawn — all of them for the file, a few at a
 * time with a pause between so the page stays responsive; or just one for a preview (`only`).
 */


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
  /** Backstitch line styles; without it lines are solid. */
  lineStyle?: LineStyleDraw;
  /** What goes in and how (the Print dialog); without it, the charts as before the settings. */
  print?: PrintOptions;
  /** Only this page (from 1) — for a preview: the others are counted, not drawn. */
  only?: number;
  /** After each page made: for a progress bar. */
  onProgress?: (done: number, total: number) => void;
  /** Stops making the file (throws an AbortError). */
  signal?: AbortSignal;
}

/** Colours the charts use beyond the threads' own: symbol inks on contrast charts, bright lines and knots. */
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

/** The cell of "auto": 40 across an A4 page in portrait. */
const AUTO_CELL = (PAGE.w - PAGE.left - PAGE.right) / COLS;

/**
 * The chart cut into pages: `cell` in mm or "auto" (about 40 across, bigger for small charts); `reserve` points kept
 * free under the grid (the key of the page).
 */
export function chartLayout(p: Pattern, overlap = OVERLAP, o: { box?: PageBox; cell?: CellSize; reserve?: number } = {}): ChartLayout {
  const box = o.box ?? PAGE, usableW = box.w - box.left - box.right;
  let cols: number, cell: number;
  if (!o.cell || o.cell === "auto") {
    cols = Math.min(p.w, Math.floor(usableW / AUTO_CELL + 1e-6));
    cell = Math.min(MAX_CELL, usableW / cols);
  } else {
    cell = o.cell * MM;
    cols = Math.min(p.w, Math.max(1, Math.floor(usableW / cell + 1e-6)));
  }
  // at least a few rows, whatever the key under the grid needs
  const usableH = Math.max(cell * 6, box.h - box.top - box.bottom - (o.reserve ?? 0));
  const rows = Math.min(p.h, Math.max(1, Math.floor(usableH / cell)));
  overlap = Math.max(0, Math.min(overlap, cols - 1, rows - 1));
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
    const d = svgPathToPdf(part.d, at);
    const paint = (colour: string) =>
      part.paint === "stroke" ? page.path(d, { stroke: colour, width: (part.w ?? (2.2 * box) / 24) * k, cap: part.cap ?? "round", join: part.join ?? "round" }) : page.path(d, { fill: colour, evenOdd: part.rule === "evenodd" });
    if (!part.holes) {
      paint(ink);
      continue;
    }
    page.save();
    for (const hole of part.holes) page.clipOutside(svgPathToPdf(hole, at));
    paint(ink);
    page.restore();
    // a cut-out is white paper where it crosses the shape, as on screen
    for (const hole of part.holes) {
      page.save();
      page.clipInside(svgPathToPdf(hole, at));
      paint(cutOutColour(ink));
      page.restore();
    }
  }
}

/** Half-cross band in a unit cell: ╱ from bottom-left to top-right, ╲ from top-left to bottom-right. */
function halfBand(dir: "half" | "halfb", d = 0.24): [number, number][] {
  return dir === "half"
    ? [[1 - d, 0], [1, 0], [1, d], [d, 1], [0, 1], [0, 1 - d]]
    : [[0, 0], [d, 0], [1, 1 - d], [1, 1], [1 - d, 1], [0, d]];
}

/** How one chart paints: from its colouring of the crosses and lines. Shared by its pages and its keys. */
interface Painter {
  crosses: Crosses;
  lines: Lines;
  /** The cells are coloured (real or muted colours). */
  colour: boolean;
  muted: boolean;
  /** A cell's colour on this chart. */
  fill: (hex: string) => string;
  /** A symbol's ink: `own` is the colour's own ink (white on dark). */
  ink: (k: KeyIndex, s: PaletteSlot, own?: string) => string;
  /** A backstitch line's or a knot's colour. */
  line: (k: KeyIndex, s: PaletteSlot) => string;
  /** Line width for `strands` in a `cell`. */
  width: (cell: number, strands: number) => number;
}

function painter(spec: Pick<ChartSpec, "crosses" | "lines">, accents: () => Accents): Painter {
  const { crosses, lines } = spec, muted = crosses === "muted", colour = muted || crosses === "real";
  return {
    crosses, lines, colour, muted,
    fill: (hex) => (muted ? pale(hex) : hex),
    ink: (k, s, own = s.ink) => (muted ? PALE_INK : colour ? own : crosses === "contrast" ? SYMBOL_INKS[accents().symbol.get(k) ?? "black"] : INK),
    line: (k, s) => (lines === "real" ? s.hex : lines === "contrast" ? (accents().line.get(k) ?? INK) : INK),
    // thick over pale colours; a little thinner over symbols, so they still show
    width: (cell, strands) => boldWidth(cell, strands) * (muted ? 1 : 0.8),
  };
}

const inTileLine = (t: Tile, sg: { x1: number; y1: number; x2: number; y2: number }) =>
  !(Math.max(sg.x1, sg.x2) < t.x || Math.min(sg.x1, sg.x2) > t.x + t.w || Math.max(sg.y1, sg.y2) < t.y || Math.min(sg.y1, sg.y2) > t.y + t.h);
const onTile = (t: Tile, x: number, y: number) => x >= t.x && y >= t.y && x <= t.x + t.w && y <= t.y + t.h;

function drawChartPage(page: PdfPage, p: Pattern, palette: Palette, l: ChartLayout, t: ChartLayout["tiles"][number], paint: Painter, box: PageBox, draw?: LineStyleDraw) {
  const { cell } = l, ox = box.left, oy = box.top, { colour, muted, fill, ink } = paint;
  const { stitches, beads, partials, knots } = p.layers, segments = chartLines(p);
  const X = (x: number) => ox + (x - t.x) * cell, Y = (y: number) => oy + (y - t.y) * cell;
  const inTile = (x: number, y: number) => x >= t.x && y >= t.y && x < t.x + t.w && y < t.y + t.h;
  const shared = sharedStrips(l, t).map((r) => [X(r.x), Y(r.y), r.w * cell, r.h * cell] as const);
  const symbols = new Symbols();

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
        if (!beads[i] && !muted) page.circle(px + cell / 2, py + cell / 2, cell * 0.3, { fill: "#FFFFFF" });
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
    if (!s || (s.t !== "combo" && s.t !== "bead") || !onTile(t, kn.x, kn.y)) continue;
    page.circle(X(kn.x), Y(kn.y), cell * 0.3, colour ? { fill: fill(s.bead?.hex ?? s.hex), stroke: "#555555", width: 0.4 } : { fill: "#FFFFFF", stroke: "#777777", width: 0.5 });
    symbols.add(s.sym, X(kn.x), Y(kn.y), cell * 0.55, ink(kn.k, s, s.bead?.ink ?? s.ink));
  }

  // the shared cells, tinted over the colours so the symbols on them stay crisp
  if (colour && shared.length) {
    page.save();
    page.opacity(muted ? 0.22 : 0.3);
    page.rects(shared, SHARED_TINT);
    page.restore();
  }
  drawGrid(page, p, t, cell, ox, oy);
  symbols.draw(page);

  // backstitch and knots, on top: thick, in their line styles
  if (paint.lines !== "hidden") {
    page.save();
    page.clipRect(ox, oy, t.w * cell, t.h * cell);
    const lines = segments.flatMap((sg) => {
      const s = palette[sg.k];
      if (!s || !inTileLine(t, sg)) return [];
      const width = paint.width(cell, s.n);
      return [{ x1: X(sg.x1), y1: Y(sg.y1), x2: X(sg.x2), y2: Y(sg.y2), colour: paint.line(sg.k, s), width, unit: styleUnit(cell, width), sym: s.sym }];
    });
    strokeLines(page, lines, draw);
    for (const kn of knots) {
      const s = palette[kn.k];
      if (s && s.t === "knot" && onTile(t, kn.x, kn.y)) page.circle(X(kn.x), Y(kn.y), cell * 0.26, { fill: paint.line(kn.k, s), stroke: INK, width: 0.7 });
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

const fit = fitText;

interface KeyRow {
  k: KeyIndex;
  t: EntryKindId;
  count: number;
  title: string;
  sub: string;
}

const KEY_ROW = 22, KEY_TOP = 92;
const perPage = (box: PageBox, top = KEY_TOP) => Math.floor((box.h - top - box.bottom) / KEY_ROW);
const pagesFor = (rows: number, box: PageBox, top = KEY_TOP) => Math.max(1, Math.ceil(rows / perPage(box, top)));

/** One line of text broken into lines of at most `max` points. */
function wrap(text: string, size: number, max: number, font: "regular" | "bold" = "regular"): string[] {
  const out: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (line && textWidth(next, size, font) > max) {
      out.push(line);
      line = word;
    } else line = next;
  }
  return line ? [...out, line] : out;
}

/** Draws a key row's icon in an `S` square at (x, y). */
type Icon = (page: PdfPage, symbols: Symbols, r: KeyRow, x: number, y: number, S: number) => void;

/** A key row's icon as the chart shows it: the cell (colour, symbol in its ink), the bead, the line, the knot. */
function iconFor(paint: Painter, palette: Palette, fabric: string, draw?: LineStyleDraw): Icon {
  return (page, symbols, r, x, y, S) => {
    const s = palette[r.k]!, cx = x + S / 2, cy = y + S / 2, { colour, fill, ink } = paint;
    if (r.t === "back") {
      page.rect(x, y, S, S, { fill: "#FFFFFF" });
      const width = boldWidth(S, s.n) * 0.6;
      strokeLines(page, [{ x1: x + 2, y1: y + S - 2, x2: x + S - 2, y2: y + 2, colour: paint.line(r.k, s), width, unit: styleUnit(S * 0.8, width), sym: s.sym }], draw);
    } else if (r.t === "knot") {
      page.rect(x, y, S, S, { fill: "#FFFFFF" });
      page.circle(cx, cy, S * 0.27, { fill: paint.line(r.k, s), stroke: INK, width: 0.6 });
    } else if (r.t === "bead" || s.st === "point") {
      // a bead, in a cell or on a grid point
      page.rect(x, y, S, S, { fill: colour ? fill(fabric) : "#FFFFFF" });
      page.circle(cx, cy, S * 0.42, colour ? { fill: fill(s.bead?.hex ?? s.hex), stroke: "#555555", width: 0.4 } : { fill: "#FFFFFF", stroke: "#777777", width: 0.5 });
      symbols.add(s.sym, cx, cy, S * 0.72, ink(r.k, s, s.bead?.ink ?? s.ink));
    } else {
      if (s.st === "full") page.rect(x, y, S, S, { fill: colour ? fill(s.hex) : "#FFFFFF" });
      else if (colour) {
        page.rect(x, y, S, S, { fill: fill(fabric) });
        page.polygon(halfBand(s.st).map(([u, v]) => [x + u * S, y + v * S]), { fill: fill(s.hex) });
        if (!paint.muted) page.circle(cx, cy, S * 0.3, { fill: "#FFFFFF" });
      } else {
        page.rect(x, y, S, S, { fill: "#FFFFFF" });
        page.lines([s.st === "half" ? [x, y + S, x + S, y] : [x, y, x + S, y + S]], 0.6, 0.6);
      }
      symbols.add(s.sym, cx, cy, s.st === "full" ? S : S * 0.75, s.st === "full" ? ink(r.k, s) : ink(r.k, s, INK));
    }
  };
}

/** A key page: rows `from`..`to` of `rows`, each an icon, brand and number, details, count. */
function drawKeyPage(page: PdfPage, box: PageBox, tr: Translate, note: string, rows: KeyRow[], icon: Icon) {
  const L = box.left, R = box.w - box.right, S = 16, symbols = new Symbols();
  wrap(note, 9, R - L).slice(0, 2).forEach((line, i) => page.text("regular", 9, L, 56 + i * 12, line, "left", 0.3));
  page.lines([[L, KEY_TOP - 10, R, KEY_TOP - 10]], 0.6);
  rows.forEach((r, i) => {
    const y = KEY_TOP + i * KEY_ROW, base = y + 11.5;
    icon(page, symbols, r, L, y, S);
    page.rect(L, y, S, S, { stroke: 0.45, width: 0.4 });
    page.text("bold", 9.5, L + 26, base, fit(r.title, 9.5, 150, "bold"));
    page.text("regular", 9, L + 182, base, fit(r.sub, 9, R - L - 182 - 80), "left", 0.2);
    page.text("regular", 9, R, base, tr(`chartPdf.unit.${r.t}`, { count: r.count }), "right");
    page.lines([[L, y + KEY_ROW - 3, R, y + KEY_ROW - 3]], 0.3, 0.8);
  });
  symbols.draw(page);
}

/** The key under each chart page (SPEC §15.10c): the entries the page uses, in rows across it. */
const MINI = { item: 84, row: 13, icon: 9, gap: 16, text: 7.5 };
/** Column width of the page key: the longest label fits ("DMC 718 + MH 02084"), at most half the page. */
const miniItem = (rows: KeyRow[], box: PageBox) =>
  Math.min((box.w - box.left - box.right) / 2, Math.max(MINI.item, ...rows.map((r) => textWidth(r.title, MINI.text) + MINI.icon + 12)));
const miniPerRow = (box: PageBox, item: number) => Math.max(1, Math.floor((box.w - box.left - box.right) / item));
const miniHeight = (count: number, box: PageBox, item: number) => (count ? MINI.gap + Math.ceil(count / miniPerRow(box, item)) * MINI.row : 0);

function drawMiniKey(page: PdfPage, box: PageBox, y: number, rows: KeyRow[], item: number, icon: Icon) {
  const per = miniPerRow(box, item), symbols = new Symbols(), S = MINI.icon;
  rows.forEach((r, i) => {
    const x = box.left + (i % per) * item, top = y + MINI.gap + Math.floor(i / per) * MINI.row;
    icon(page, symbols, r, x, top, S);
    page.rect(x, top, S, S, { stroke: 0.45, width: 0.3 });
    page.text("regular", MINI.text, x + S + 4, top + 7.2, fit(r.title, MINI.text, item - S - 8));
  });
  symbols.draw(page);
}

/** The entries a page of the chart uses: in its cells, its lines and its knots. */
function entriesOn(p: Pattern, t: Tile): Set<KeyIndex> {
  const { stitches, beads, partials, knots } = p.layers, segments = chartLines(p), out = new Set<KeyIndex>();
  for (let y = t.y; y < t.y + t.h; y++)
    for (let x = t.x; x < t.x + t.w; x++) {
      const i = y * p.w + x;
      if (stitches[i]) out.add(stitches[i]!);
      if (beads[i]) out.add(beads[i]!);
    }
  for (const [i, list] of partials) {
    const x = i % p.w, y = (i / p.w) | 0;
    if (x >= t.x && y >= t.y && x < t.x + t.w && y < t.y + t.h) for (const ps of list) out.add(ps.k);
  }
  for (const sg of segments) if (inTileLine(t, sg)) out.add(sg.k);
  for (const kn of knots) if (onTile(t, kn.x, kn.y)) out.add(kn.k);
  return out;
}

/** The pattern has backstitch (stamps too) or French knots — the "lines" a chart can show or hide. */
export function hasLines(p: Pattern): boolean {
  return chartLines(p).length > 0 || p.layers.knots.some((kn) => p.key[kn.k]?.t === "knot");
}

/** A block of the instructions: a heading, a paragraph line, a bullet, or an empty line. */
type Block = { kind: "h" | "p" | "b"; text: string } | { kind: "gap" };

/** The instructions text as blocks (SPEC §15.10c): "# " heading, "- " / "• " / "* " bullet, empty line a gap. */
export function instructionBlocks(text: string): Block[] {
  const out: Block[] = [];
  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim();
    if (!line) {
      if (out.length && out[out.length - 1]!.kind !== "gap") out.push({ kind: "gap" });
    } else if (/^#+\s/.test(line)) out.push({ kind: "h", text: line.replace(/^#+\s+/, "") });
    else if (/^[-•*]\s/.test(line)) out.push({ kind: "b", text: line.slice(2).trim() });
    else out.push({ kind: "p", text: line });
  }
  while (out.length && out[out.length - 1]!.kind === "gap") out.pop();
  return out;
}

/** One line to print on an instructions page. */
interface InstrLine {
  font: "regular" | "bold";
  size: number;
  x: number;
  text: string;
  /** Its baseline. */
  y: number;
  bullet?: boolean;
}

const BODY_TOP = 100, BODY_NEXT_TOP = 66;

/** The instructions laid out into pages of lines. */
function instructionPages(text: string, box: PageBox): InstrLine[][] {
  const L = box.left, W = box.w - box.left - box.right, bottom = box.h - box.bottom - 12, lines: (Omit<InstrLine, "y"> & { dy: number })[] = [];
  for (const b of instructionBlocks(text)) {
    if (b.kind === "gap") {
      lines.push({ font: "regular", size: 10, x: L, text: "", dy: 7 });
      continue;
    }
    if (b.kind === "h") wrap(b.text, 12, W, "bold").forEach((t, i) => lines.push({ font: "bold", size: 12, x: L, text: t, dy: i ? 16 : 22 }));
    else if (b.kind === "b") wrap(b.text, 10, W - 14).forEach((t, i) => lines.push({ font: "regular", size: 10, x: L + 14, text: t, dy: 14, bullet: !i }));
    else wrap(b.text, 10, W).forEach((t) => lines.push({ font: "regular", size: 10, x: L, text: t, dy: 14 }));
  }
  const pages: InstrLine[][] = [[]];
  let y = BODY_TOP;
  for (const { dy, ...line } of lines) {
    if (y + dy > bottom && pages[pages.length - 1]!.length) {
      pages.push([]);
      y = BODY_NEXT_TOP;
    }
    // a page doesn't start with an empty line, nor with the space above a heading
    const cur = pages[pages.length - 1]!;
    if (!cur.length && !line.text) continue;
    y += cur.length ? dy : 12;
    cur.push({ ...line, y });
  }
  return pages[0]!.length ? pages : [];
}

/** Accent colours: symbol inks for contrast charts (worked out only when one is printed); bright lines and knots. */
function accentsFor(p: Pattern): Accents {
  const line = new Map<KeyIndex, string>();
  let n = 0;
  // backstitch in the colour chosen in the key (black unless set); knots each in a vibrant colour of their own
  p.key.forEach((e, k) => e?.t === "back" && line.set(k, e.ink ?? DEFAULT_LINE_INK));
  p.key.forEach((e, k) => e?.t === "knot" && line.set(k, LINE_COLOURS[n++ % LINE_COLOURS.length]!));
  let symbol: Map<KeyIndex, SymbolColour> | null = null;
  return { get symbol() { return (symbol ??= symbolColours(p)); }, line };
}

/** What a page may need made beforehand: the cover's picture, embedded in the file. */
interface DrawContext {
  picture?: Ref;
}

/** One page of the file: its part of the file (for the contents) and how it's drawn. */
interface PlannedPage {
  section: string;
  draw: (page: PdfPage, ctx: DrawContext) => void;
  /** It shows the pattern's picture. */
  picture?: boolean;
}

/** A chart of the file as planned: its title and pages. */
export interface PlannedChart {
  title: string;
  /** Its chart pages, then its key's. */
  chartPages: number;
  keyPages: number;
}

/** The file planned: every page, without drawing any. */
export interface ChartPlan {
  total: number;
  charts: PlannedChart[];
  pages: PlannedPage[];
  box: PageBox;
}

/**
 * The pattern as a picture for the cover (SPEC §15.10c): each cell its colour — the bead's, else the stitch's, else
 * its first partial stitch's, else the fabric — a block of `scale` × `scale` pixels, so a small pattern stays sharp
 * however a viewer smooths pictures.
 */
export function patternPicture(p: Pattern, palette: Palette): Raster & { scale: number } {
  const scale = Math.max(1, Math.min(16, Math.floor(1600 / Math.max(p.w, p.h)))), W = p.w * scale, H = p.h * scale;
  const rgb = new Uint8Array(W * H * 3), { stitches, beads, partials } = p.layers;
  const rgbOf = new Map<string, [number, number, number]>();
  const parse = (hex: string) => rgbOf.get(hex) ?? rgbOf.set(hex, [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) || 0) as [number, number, number]).get(hex)!;
  const fabric = parse(p.fabric);
  for (let y = 0; y < p.h; y++)
    for (let x = 0; x < p.w; x++) {
      const i = y * p.w + x, b = palette[beads[i] ?? 0], s = palette[stitches[i] ?? 0], part = palette[partials.get(i)?.[0]?.k ?? 0];
      const c = b ? parse(b.bead?.hex ?? b.hex) : s && s.st !== "point" ? parse(s.hex) : part ? parse(part.hex) : fabric;
      for (let dy = 0; dy < scale; dy++) {
        let at = ((y * scale + dy) * W + x * scale) * 3;
        for (let dx = 0; dx < scale; dx++, at += 3) rgb.set(c, at);
      }
    }
  return { w: W, h: H, rgb, scale };
}

/** The chart's title: its crosses, and its lines when the pattern has any and they're shown. */
export function chartTitle(spec: Pick<ChartSpec, "crosses" | "lines">, tr: Translate, lines = true): string {
  const crosses = tr(`chartPdf.crosses.${spec.crosses}`);
  return lines && spec.lines !== "hidden" ? `${crosses} · ${tr(`chartPdf.lines.${spec.lines}`)}` : crosses;
}

/**
 * Plans the file (SPEC §15.10c): every page with what it is and how to draw it. Cheap — the page count and the
 * cover's contents without drawing a page; a 1000 × 1000 chart plans in well under a second.
 */
export function planChartPdf(p: Pattern, o: Pick<ChartPdfOptions, "t" | "print" | "lineStyle">): ChartPlan {
  const print = o.print ?? PLAIN_PRINT, box = pageBox(print), tr = o.t;
  const palette = buildPalette(p), name = p.name || "Pattern", lined = hasLines(p);
  let accents: Accents | null = null;
  const acc = () => (accents ??= accentsFor(p));
  const byline = [p.meta.designer?.trim(), p.meta.copyright?.trim() && `© ${p.meta.copyright.trim()}`].filter(Boolean).join(" · ");
  const usage = computeUsage(p).perEntry;
  const rows: KeyRow[] = p.key.flatMap((e, k) => {
    const u = usage.get(k), count = entryCount(u) + partialCount(u);
    return e && k && count ? [{ k, t: e.t, count, ...formatLabel(labelData(e, resolveColor(p, e.src)), tr) }] : [];
  });
  const count = Math.floor(p.count) || 14, cm = (n: number) => Math.round((n / count) * 25.4) / 10, inch = (n: number) => Math.round((n / count) * 10) / 10;
  const pages: PlannedPage[] = [], charts: PlannedChart[] = [];
  const head = (page: PdfPage, sub: string, max?: number) => drawHeader(page, box, name, byline, sub, max);

  // instructions, from Pattern info
  const instructions = print.instructions && p.meta.instructions?.trim() ? instructionPages(p.meta.instructions, box) : [];
  instructions.forEach((lines, n) => pages.push({
    section: tr("chartPdf.instructions"),
    draw: (page) => {
      head(page, `${tr("chartPdf.instructions")}${instructions.length > 1 ? ` · ${tr("chartPdf.pageOf", { n: n + 1, total: instructions.length })}` : ""}`);
      if (!n) page.text("bold", 16, box.left, 76, tr("chartPdf.instructions"));
      for (const line of lines) {
        if (line.bullet) page.text("bold", line.size, line.x - 10, line.y, "•");
        if (line.text) page.text(line.font, line.size, line.x, line.y, line.text, "left", line.font === "bold" ? 0 : 0.1);
      }
    },
  }));

  // materials: the fabric, then what to buy (the shopping list)
  if (print.materials) {
    const shop = calculator().calculate({ pattern: p, usage: computeUsage(p), settings: {} });
    const top = BODY_TOP + 46, per = perPage(box, top), n = pagesFor(shop.lines.length, box, top);
    for (let i = 0; i < n; i++) pages.push({
      section: tr("chartPdf.materials"),
      draw: (page) => {
        const L = box.left, R = box.w - box.right;
        head(page, `${tr("chartPdf.materials")}${n > 1 ? ` · ${tr("chartPdf.pageOf", { n: i + 1, total: n })}` : ""}`);
        page.text("bold", 16, L, 76, tr("chartPdf.materials"));
        const margin = 5, cut = (stitches: number) => Math.round(cm(stitches) + 2 * margin);
        page.text("regular", 10, L, BODY_TOP, tr("chartPdf.fabric", { count, cmW: cm(p.w), cmH: cm(p.h), cutW: cut(p.w), cutH: cut(p.h), margin }));
        for (const [j, note] of shop.notes.entries()) for (const [m, line] of wrap(tr(note), 8.5, R - L).slice(0, 2).entries()) page.text("regular", 8.5, L, BODY_TOP + 16 + j * 22 + m * 11, line, "left", 0.35);
        page.lines([[L, top - 10, R, top - 10]], 0.6);
        shop.lines.slice(i * per, (i + 1) * per).forEach((l, r) => {
          const y = top + r * KEY_ROW, base = y + 11.5;
          page.rect(L, y, 16, 16, { fill: l.item.hex, stroke: 0.45, width: 0.4 });
          page.text("bold", 9.5, L + 26, base, fit(brandCode(l.item), 9.5, 150, "bold"));
          page.text("regular", 9, L + 182, base, fit(l.item.name, 9, R - L - 182 - 80), "left", 0.2);
          page.text("regular", 9, R, base, tr(`csv.unit.${l.unit}`, { n: l.quantity }), "right");
          page.lines([[L, y + KEY_ROW - 3, R, y + KEY_ROW - 3]], 0.3, 0.8);
        });
      },
    });
  }

  // the charts, each with its own layout, colouring and key
  const layouts: ChartLayout[] = [];
  for (const spec of print.charts) {
    const paint = painter(spec, acc), icon = iconFor(paint, palette, p.fabric, o.lineStyle);
    const shows = (r: KeyRow) => r.t === "thread" || r.t === "combo" || r.t === "bead" || (paint.lines !== "hidden" && lined);
    const chartRows = rows.filter(shows), title = chartTitle(spec, tr, lined);
    // with a key under each page: room for the most any page needs (found again as the pages change)
    const rowsOn = (t: Tile) => {
      const used = entriesOn(p, t);
      return chartRows.filter((r) => used.has(r.k));
    };
    const item = miniItem(chartRows, box);
    let reserve = 0, l = chartLayout(p, spec.overlap, { box, cell: spec.cell });
    for (let i = 0; spec.pageKey && i < 4; i++) {
      const need = Math.max(0, ...l.tiles.map((t) => miniHeight(rowsOn(t).length, box, item)));
      if (need <= reserve) break;
      reserve = need;
      l = chartLayout(p, spec.overlap, { box, cell: spec.cell, reserve });
    }
    layouts.push(l);
    const R = box.w - box.right, n = l.tiles.length;
    for (const t of l.tiles) pages.push({
      section: title,
      draw: (page) => {
        head(page, `${title} · ${tr("chartPdf.pageOf", { n: t.n, total: n })} · ${tr("chartPdf.cells", { x1: t.x + 1, x2: t.x + t.w, y1: t.y + 1, y2: t.y + t.h, w: p.w, h: p.h })}`, R - box.left - 80);
        if (n > 1) drawPageMap(page, p, l, t.n, R - 70, 10, 70, 34, false);
        drawRulers(page, p, t, l.cell, box.left, box.top);
        drawChartPage(page, p, palette, l, t, paint, box, o.lineStyle);
        if (spec.pageKey) drawMiniKey(page, box, box.top + t.h * l.cell, rowsOn(t), item, icon);
      },
    });
    // its key, straight after it
    let keyPages = 0;
    if (spec.key) {
      const keyTitle = tr("chartPdf.keyFor", { chart: title }), per = perPage(box);
      keyPages = pagesFor(chartRows.length, box);
      const note = [spec.crosses === "contrast" ? tr("chartPdf.symbolKeyNote") : "", tr("chartPdf.keyNote", { count, w: p.w, h: p.h })].filter(Boolean).join(" ");
      for (let i = 0; i < keyPages; i++) pages.push({
        section: keyTitle,
        draw: (page) => {
          head(page, `${keyTitle} · ${tr("chartPdf.pageOf", { n: i + 1, total: keyPages })}`);
          drawKeyPage(page, box, tr, note, chartRows.slice(i * per, (i + 1) * per), icon);
        },
      });
    }
    charts.push({ title, chartPages: n, keyPages });
  }

  // contents, first (the cover goes before it): what is on which page, how the chart pages fit together
  if (print.contents) pages.unshift({
    section: tr("chartPdf.contents"),
    draw: (page) => {
      const L = box.left, W = box.w - L - box.right;
      head(page, tr("chartPdf.contents"));
      page.text("bold", 16, L, 76, tr("chartPdf.contents"));
      let y = 88;
      // each run of pages of one part
      const parts: { title: string; from: number; to: number }[] = [];
      // (drawn once the file is planned: the cover and this page are in the list, not in the contents)
      pages.forEach((pg, i) => {
        const last = parts[parts.length - 1], n = i + 1;
        if (pg.section === tr("chartPdf.cover") || pg.section === tr("chartPdf.contents")) return;
        if (last && last.title === pg.section && last.to === n - 1) last.to = n;
        else parts.push({ title: pg.section, from: n, to: n });
      });
      for (const part of parts.slice(0, 20)) {
        page.text("regular", 10, L + 8, (y += 16), fit(part.title, 10, 300));
        page.text("regular", 10, L + 320, y, part.to > part.from ? tr("chartPdf.pageRange", { from: part.from, to: part.to }) : tr("chartPdf.pageOne", { n: part.from }), "left", 0.35);
      }
      const l = layouts[0];
      if (l) {
        y += 30;
        page.text("bold", 11, L, y, tr("chartPdf.howTitle"));
        const how = l.overlap ? tr("chartPdf.howText", { count: l.tiles.length, overlap: l.overlap }) : tr("chartPdf.howTextNoOverlap", { count: l.tiles.length });
        for (const line of wrap(how, 9, W)) page.text("regular", 9, L, (y += 13), line, "left", 0.25);
        drawPageMap(page, p, l, null, L, y + 16, W, Math.max(60, box.h - y - 16 - 60), true);
      }
    },
  });

  // the cover: the name, designer and ©, the pattern's picture as large as the page allows, its size
  if (print.cover) pages.unshift({
    section: tr("chartPdf.cover"),
    picture: true,
    draw: (page, ctx) => {
      const L = box.left, W = box.w - L - box.right;
      let y = 84;
      for (const line of wrap(name, 26, W, "bold").slice(0, 2)) {
        page.text("bold", 26, L, y, line);
        y += 32;
      }
      for (const line of [p.meta.designer && tr("chartPdf.designedBy", { name: p.meta.designer }), p.meta.copyright && `© ${p.meta.copyright}`].filter(Boolean) as string[]) {
        page.text("regular", 12, L, y, fit(line, 12, W), "left", 0.3);
        y += 17;
      }
      // the picture, centred in what's left above the size line, its cells square
      const top = y + 14, bottom = box.h - box.bottom - 40, k = Math.min(W / p.w, (bottom - top) / p.h);
      const pw = p.w * k, ph = p.h * k, px = L + (W - pw) / 2, py = top + (bottom - top - ph) / 2;
      if (ctx.picture !== undefined) page.image(ctx.picture, px, py, pw, ph);
      // backstitch and knots over it, in their thread colours
      const lines = chartLines(p).flatMap((sg) => {
        const s = palette[sg.k];
        return s ? [{ x1: px + sg.x1 * k, y1: py + sg.y1 * k, x2: px + sg.x2 * k, y2: py + sg.y2 * k, colour: s.hex, width: Math.max(0.3, k * 0.18), unit: k, sym: "" }] : [];
      });
      strokeLines(page, lines);
      for (const kn of p.layers.knots) {
        const s = palette[kn.k];
        if (s?.t === "knot") page.circle(px + kn.x * k, py + kn.y * k, Math.max(0.4, k * 0.25), { fill: s.hex });
      }
      page.rect(px, py, pw, ph, { stroke: 0.6, width: 0.6 });
      page.text("regular", 10, box.w / 2, bottom + 24, tr("chartPdf.size", { w: p.w, h: p.h, count, cmW: cm(p.w), cmH: cm(p.h), inW: inch(p.w), inH: inch(p.h) }), "centre", 0.3);
    },
  });
  return { total: pages.length, charts, pages, box };
}

/** The pause between pages while making a big file: the page stays responsive, a progress bar moves. */
const pause = () => new Promise<void>((done) => setTimeout(done, 0));

export async function chartPdf(p: Pattern, o: ChartPdfOptions): Promise<Uint8Array> {
  const plan = planChartPdf(p, o), { box } = plan, tr = o.t;
  const footer = tr("chartPdf.footer", { app: "{app}", url: "{url}" }), url = tr("app.url"), glory = tr("app.glory");
  const pdf = new PdfWriter();
  await pdf.embedTextFonts(o.fonts);
  await pdf.embedSymbolFont(SYMBOL_FONT.name, o.fonts.symbols, Object.values(SYMBOL_GLYPHS));
  const wanted = o.only ? [Math.min(Math.max(1, o.only), plan.total)] : plan.pages.map((_, i) => i + 1);
  // the cover's picture, made once when a page to make shows it
  const ctx: DrawContext = {};
  if (wanted.some((n) => plan.pages[n - 1]!.picture)) ctx.picture = await pdf.image(patternPicture(p, buildPalette(p)));
  let done = 0, since = performance.now();
  for (const n of wanted) {
    if (o.signal?.aborted) throw new DOMException("The PDF was cancelled", "AbortError");
    const page = new PdfPage(box.w, box.h);
    plan.pages[n - 1]!.draw(page, ctx);
    drawFooter(page, footer, url, glory, box, `${n} / ${plan.total}`);
    await pdf.addPage(page);
    o.onProgress?.(++done, wanted.length);
    // a pause every ~50 ms of work
    if (performance.now() - since > 50) {
      await pause();
      since = performance.now();
    }
  }
  // the pattern itself, to read back exactly (SPEC §15.46) — not in a one-page preview
  if (!o.only) await attachPattern(pdf, p);
  return pdf.build({ title: p.name || "Pattern", producer: "ptashechka" });
}
