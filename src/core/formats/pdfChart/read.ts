import { libraryColor } from "../../catalog/catalog";
import { createPattern, MAX_SIZE } from "../../pattern/createPattern";
import { addEntry } from "../../pattern/keyEntries";
import type { KeyIndex, Pattern } from "../../pattern/types";
import { centre, type PdfContent, type Word } from "./content";
import { findGrids, type MarkId, type PageGrid } from "./grids";
import { brandWord, threadOf, type KeyThread } from "./key";

/*
 * Another app's PDF chart → a pattern (SPEC §15.47). Grids found on every page are placed in the whole chart by the
 * numbers along their edges; each symbol is matched with its row in the key (the same character, or the same
 * stamped picture, followed by a brand and number). What can't be settled is said, for the user to settle: grids
 * that don't add up, faded cells, symbols or lines without a thread.
 */

export interface ChartSymbol {
  id: MarkId;
  /** Cells it fills. */
  count: number;
  /** The key row's text, when the symbol was found in the key. */
  keyText: string | null;
  /** What the key row names; null: not found or not known — to be set up by hand. */
  thread: KeyThread | null;
  /** The colour cells with this symbol are filled with, when the chart fills them (a hint for setting it up). */
  fill: string | null;
}

export interface ChartLineStyle {
  ink: string;
  width: number;
  count: number;
  /** The thread it is, when the key and the colour tell; null: to be set up by hand. */
  thread: string | null;
}

export interface ChartRead {
  name: string;
  w: number;
  h: number;
  /** Every grid found, placed or not; `use: false` — left out (by the reader or the user). */
  grids: (PageGrid & { use: boolean })[];
  symbols: ChartSymbol[];
  /** Per cell of the whole chart: index into `symbols`, or -1. */
  cells: Int32Array;
  /** Per cell: shown faded somewhere. */
  faded: Uint8Array;
  lines: { x1: number; y1: number; x2: number; y2: number; style: number }[];
  lineStyles: ChartLineStyle[];
  /** The size the PDF states ("125 x 125 stitches"), when it does. */
  stated: { w: number; h: number } | null;
  /** Fabric count it states ("Aida 14", "14 count"). */
  count: number | null;
  issues: {
    /** Cells two grids show differently. */
    conflicts: number;
    /** Grids without numbers along their edges, beside others: where they go isn't known. */
    unplaced: number;
    /** Half and quarter stitch symbols left out. */
    partials: number;
  };
}

const allWords = (c: PdfContent) => c.pages.flatMap((p, n) => p.words.map((w) => ({ ...w, page: n })));

/** "125 x 125 stitches", "89w X 119h Stitches". */
function statedSize(text: string): { w: number; h: number } | null {
  const m = /(\d{1,3})\s*w?\s*[x×X]\s*(\d{1,3})\s*h?\s*(stitch|стіб|стеж|кл)/i.exec(text);
  return m ? { w: Number(m[1]), h: Number(m[2]) } : null;
}
function fabricCount(text: string): number | null {
  const m = /\b(?:aida|evenweave|linen)\s*(\d{1,2})\b|\b(\d{1,2})\s*(?:count|ct)\b/i.exec(text);
  const n = m ? Number(m[1] ?? m[2]) : NaN;
  return n >= 6 && n <= 40 ? n : null;
}

/** The PDF's own title, else the biggest line on its first page. */
function nameOf(c: PdfContent): string {
  const title = c.title.trim().replace(/\.(xsd|pat|oxs|pdf|xbird|chart)$/i, "");
  if (title) return title;
  const first = c.pages[0]?.words ?? [];
  const big = Math.max(0, ...first.map((w) => w.h));
  const line = first.filter((w) => w.h > big * 0.9).sort((a, b) => a.y - b.y || a.x - b.x);
  return line.filter((w) => Math.abs(w.y - line[0]!.y) < big * 0.5).map((w) => w.text).join(" ").slice(0, 80) || "Pattern from PDF";
}

/**
 * Key rows: a symbol drawn outside the grids, alone, followed on its line by a thread. Per symbol, its row's text and
 * thread; also rows naming a thread without a symbol (backstitch lists).
 */
function readKey(c: PdfContent, grids: PageGrid[], ids: Set<MarkId>) {
  const found = new Map<MarkId, { text: string; thread: KeyThread | null }>();
  const loose: KeyThread[] = [];
  c.pages.forEach((page, n) => {
    const inGrid = (x: number, y: number) => grids.some((g) => g.page === n && x >= g.x0 && y >= g.y0 && x <= g.x0 + g.cols * g.pitch && y <= g.y0 + g.rows * g.pitch);
    // symbols as they appear in the key: characters standing alone, or stamped pictures
    const marks: { id: MarkId; x: number; y: number; h: number }[] = [];
    for (const w of page.words) {
      const id = `g:${w.text}`;
      if (w.upright && w.glyphs.length === 1 && ids.has(id) && !inGrid(...(Object.values(centre(w)) as [number, number]))) marks.push({ id, ...centre(w), h: w.h });
    }
    page.stamps.forEach((s) => {
      const id = `s:${s.key}`, at = centre(s);
      if (ids.has(id) && !inGrid(at.x, at.y)) marks.push({ id, ...at, h: s.h });
    });
    const words = page.words.filter((w) => w.upright);
    const rowOf = (x: number, y: number, h: number, until: number) =>
      words.filter((w) => Math.abs(centre(w).y - y) < Math.max(h, w.h) * 0.6 && w.x > x && w.x < until).sort((a, b) => a.x - b.x);
    // a brand as a column heading: rows below it may give the number alone
    const headings = words.flatMap((w) => (brandWord(w.text) ? [w] : []));
    const brandAbove = (row: Word[]) => headings.find((hd) => row.some((w) => w.y > hd.y && w.x < hd.x + hd.w && w.x + w.w > hd.x && !brandWord(w.text)))?.text;
    for (const m of marks) {
      if (found.get(m.id)?.thread) continue;
      const next = Math.min(page.w + 1, ...marks.filter((o) => o !== m && Math.abs(o.y - m.y) < m.h * 0.6 && o.x > m.x).map((o) => o.x));
      const row = rowOf(m.x, m.y, m.h, next);
      const text = row.map((w) => w.text).join(" ");
      const thread = threadOf(text, brandAbove(row));
      if (thread || !found.has(m.id)) found.set(m.id, { text, thread });
    }
    // lines naming a thread with no symbol before them
    const lines = new Map<number, Word[]>();
    for (const w of words) {
      const k = Math.round(centre(w).y / 3);
      (lines.get(k) ?? lines.set(k, []).get(k)!).push(w);
    }
    for (const row of lines.values()) {
      row.sort((a, b) => a.x - b.x);
      const y = centre(row[0]!).y;
      if (marks.some((m) => Math.abs(m.y - y) < m.h * 0.6) || inGrid(row[0]!.x, y)) continue;
      const t = threadOf(row.map((w) => w.text).join(" "), brandAbove(row));
      if (t?.kind === "thread") loose.push(t);
    }
  });
  return { found, loose };
}

const rgb = (hex: string) => {
  const n = parseInt(hex.replace("#", "").slice(0, 6), 16);
  return [n >> 16, (n >> 8) & 255, n & 255] as const;
};
const distance = (a: string, b: string) => {
  const [r1, g1, b1] = rgb(a), [r2, g2, b2] = rgb(b);
  return Math.hypot(r1 - r2, g1 - g2, b1 - b2);
};

export function readChart(c: PdfContent): ChartRead {
  const grids = c.pages.flatMap((p, n) => findGrids(p, n)).map((g) => ({ ...g, use: true }));
  const text = allWords(c).map((w) => w.text).join(" ");
  const issues = { conflicts: 0, unplaced: 0, partials: grids.reduce((n, g) => n + g.small, 0) };

  // placing: by the numbers; a single grid without them is the chart
  const placed = grids.filter((g) => g.at);
  if (!placed.length && grids.length) {
    const biggest = grids.reduce((a, b) => (b.cols * b.rows > a.cols * a.rows ? b : a));
    biggest.at = { col: 0, row: 0 };
    for (const g of grids) if (g !== biggest) g.use = false;
  }
  for (const g of grids) if (!g.at && g.use) {
    g.use = false;
    issues.unplaced++;
  }
  const used = grids.filter((g) => g.use && g.at);
  let minCol = Math.min(...used.map((g) => g.at!.col)), minRow = Math.min(...used.map((g) => g.at!.row));
  let w = Math.max(1, ...used.map((g) => g.at!.col - minCol + g.cols)), h = Math.max(1, ...used.map((g) => g.at!.row - minRow + g.rows));
  // the size the PDF states, when the grids' frames take in an empty row or column more and every symbol still fits
  const stated = statedSize(text);
  if (stated && used.length) {
    const fit = (size: number, wanted: number, min: number, key: (g: PageGrid, i: number) => number) => {
      if (wanted >= size || size - wanted > 3) return null;
      let lo = Infinity, hi = -Infinity;
      for (const g of used) g.cells.forEach((id, i) => {
        if (!id) return;
        const v = key(g, i) - min;
        lo = Math.min(lo, v);
        hi = Math.max(hi, v);
      });
      // the window nearest the numbering's own start that holds every symbol
      const from = Math.max(0, hi - wanted + 1), to = Math.min(lo, size - wanted);
      return from <= to ? Math.max(from, Math.min(0, to)) : null;
    };
    const sx = fit(w, stated.w, minCol, (g, i) => g.at!.col + (i % g.cols)), sy = fit(h, stated.h, minRow, (g, i) => g.at!.row + Math.floor(i / g.cols));
    if (sx !== null) [minCol, w] = [minCol + sx, stated.w];
    if (sy !== null) [minRow, h] = [minRow + sy, stated.h];
  }
  w = Math.min(MAX_SIZE, w);
  h = Math.min(MAX_SIZE, h);

  const ids = new Map<MarkId, number>(), symbols: ChartSymbol[] = [];
  const cells = new Int32Array(w * h).fill(-1), faded = new Uint8Array(w * h);
  const fills = new Map<MarkId, Map<string, number>>();
  for (const g of used) {
    const ox = g.at!.col - minCol, oy = g.at!.row - minRow;
    g.cells.forEach((id, i) => {
      if (!id) return;
      const x = ox + (i % g.cols), y = oy + Math.floor(i / g.cols);
      if (x < 0 || y < 0 || x >= w || y >= h) return;
      let s = ids.get(id);
      if (s === undefined) {
        ids.set(id, (s = symbols.length));
        symbols.push({ id, count: 0, keyText: null, thread: null, fill: null });
      }
      const at = y * w + x;
      // a faded cell gives way to the same cell shown in full on another page
      if (cells[at]! >= 0 && cells[at] !== s && !g.faded[i] && !faded[at]) issues.conflicts++;
      if (cells[at]! < 0 || (faded[at] && !g.faded[i])) {
        cells[at] = s;
        faded[at] = g.faded[i] ? 1 : 0;
      }
      const fill = g.fills[i];
      if (fill) {
        const f = fills.get(id) ?? fills.set(id, new Map()).get(id)!;
        f.set(fill, (f.get(fill) ?? 0) + 1);
      }
    });
  }
  for (const v of cells) if (v >= 0) symbols[v]!.count++;
  for (const s of symbols) {
    const f = fills.get(s.id);
    if (f) s.fill = [...f].sort((a, b) => b[1] - a[1])[0]![0];
  }

  // the key
  const { found, loose } = readKey(c, grids, new Set(ids.keys()));
  for (const s of symbols) {
    const k = found.get(s.id);
    if (k) Object.assign(s, { keyText: k.text, thread: k.thread });
  }

  // backstitch: one style per ink and width; its thread by colour among the key's threads, else to be set up
  const lineStyles: ChartLineStyle[] = [], lines: ChartRead["lines"] = [];
  const seen = new Set<string>();
  for (const g of used) {
    const ox = g.at!.col - minCol, oy = g.at!.row - minRow;
    for (const l of g.lines) {
      const seg = { x1: l.x1 + ox, y1: l.y1 + oy, x2: l.x2 + ox, y2: l.y2 + oy };
      if (Math.min(seg.x1, seg.x2) < 0 || Math.min(seg.y1, seg.y2) < 0 || Math.max(seg.x1, seg.x2) > w || Math.max(seg.y1, seg.y2) > h) continue;
      const key = [Math.min(seg.x1, seg.x2), Math.min(seg.y1, seg.y2), Math.max(seg.x1, seg.x2), Math.max(seg.y1, seg.y2)].join(",");
      if (seen.has(key)) continue;
      seen.add(key);
      let style = lineStyles.findIndex((s) => s.ink === l.ink && Math.abs(s.width - l.width) < 0.3);
      if (style < 0) style = lineStyles.push({ ink: l.ink, width: l.width, count: 0, thread: null }) - 1;
      lineStyles[style]!.count++;
      lines.push({ ...seg, style });
    }
  }
  const candidates = [...loose, ...symbols.flatMap((s) => (s.thread?.kind === "thread" && s.thread.ids.length === 1 ? [s.thread] : []))];
  for (const s of lineStyles) {
    // only one thread listed for lines: that one
    if (loose.length === 1) {
      s.thread = loose[0]!.ids[0]!;
      continue;
    }
    let best: { id: string; d: number } | null = null;
    for (const t of candidates) {
      const hex = libraryColor(t.ids[0]!)?.hex;
      const d = hex ? distance(hex, s.ink) : Infinity;
      if (!best || d < best.d) best = { id: t.ids[0]!, d };
    }
    // printed in its own colour (not plain black or grey, as many charts print every line)
    const grey = (() => { const [r, g, b] = rgb(s.ink); return Math.max(r, g, b) - Math.min(r, g, b) < 16; })();
    if (best && best.d < 40 && !grey) s.thread = best.id;
  }

  return { name: nameOf(c), w, h, grids, symbols, cells, faded, lines, lineStyles, stated, count: fabricCount(text), issues };
}

/** Every symbol and line style has its thread: the pattern can be made. */
export const chartComplete = (r: ChartRead) => r.symbols.every((s) => s.thread) && r.lineStyles.every((s) => s.thread);

/**
 * The pattern from what was read: one key entry per symbol (a whole cross, or a bead), one per line style. Faded cells
 * are left empty when `fadedEmpty`. Symbols or lines without a thread are left out.
 */
export function chartToPattern(r: ChartRead, symbols: readonly string[], o: { fadedEmpty?: boolean; strands?: number } = {}): Pattern {
  const p = createPattern(r.w, r.h, r.name);
  if (r.count) p.count = r.count;
  const strands = o.strands ?? p.strands;
  const keys = r.symbols.map((s): KeyIndex | null => {
    const t = s.thread;
    if (!t) return null;
    if (t.kind === "bead") return addEntry(p, { t: "bead", src: t.ids[0]! }, symbols);
    if (t.ids.length === 2) {
      const id = `blend:${t.ids.join("+")}`;
      p.blends[id] = { parts: t.ids.map((part) => ({ id: part, n: 1 })) };
      return addEntry(p, { t: "thread", src: id, n: null, st: "full" }, symbols);
    }
    return addEntry(p, { t: "thread", src: t.ids[0]!, n: strands, st: "full" }, symbols);
  });
  r.cells.forEach((s, i) => {
    const k = s >= 0 ? keys[s] : null;
    if (k == null || (o.fadedEmpty && r.faded[i])) return;
    if (r.symbols[s]!.thread!.kind === "bead") p.layers.beads[i] = k;
    else p.layers.stitches[i] = k;
  });
  const lineKeys = r.lineStyles.map((s) => (s.thread ? addEntry(p, { t: "back", src: s.thread, n: 1 }, symbols) : null));
  for (const l of r.lines) {
    const k = lineKeys[l.style];
    if (k != null) p.layers.segments.push({ x1: l.x1, y1: l.y1, x2: l.x2, y2: l.y2, k });
  }
  return p;
}
