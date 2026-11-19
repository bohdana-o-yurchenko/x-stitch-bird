import { createPattern } from "../pattern/createPattern";
import { keyFor } from "../pattern/keyEntries";
import type { Corner, KeyEntry, KeyIndex, PartialKindId, Pattern, Rect } from "../pattern/types";
import { ALL_SYMBOLS } from "../symbols/symbols";
import type { CheckItem, CheckSuite, CheckKind, Words } from "./types";

/** A test chart's sample: what it is, and how to put it on the chart with its area's top-left cell at (x, y). */
export interface SampleDef {
  id: string;
  group: string;
  tags: string[];
  what: Words;
  how?: Words;
  absent?: true;
  /** Null: a check of the whole file, nothing on the chart. */
  put: ((x: number, y: number) => void) | null;
}

/**
 * Builds a test chart: key entries made as they are needed (one per kind, colour, stitch and strands), stitches put
 * by cell, and the stitch layers sized once the chart's size is known.
 */
export class Painter {
  readonly p: Pattern;
  private cells: [number, number, "stitches" | "beads", KeyIndex][] = [];
  private parts: [number, number, PartialKindId, Corner, KeyIndex][] = [];

  constructor(name: string) {
    this.p = createPattern(1, 1, name);
  }

  k = (e: Omit<KeyEntry, "sym"> & { sym?: string }): KeyIndex => keyFor(this.p, e, ALL_SYMBOLS);
  thread = (src: string, n: number | null = 2, st: KeyEntry["st"] = "full") => this.k({ t: "thread", src, n: src.startsWith("blend:") ? null : n, st });
  combo = (src: string, st: KeyEntry["st"] = "full") => this.k({ t: "combo", src, n: 2, st });
  bead = (src: string, st?: "point") => this.k({ t: "bead", src, ...(st && { st }) });
  back = (src: string, n: number | null = 1, more: Partial<KeyEntry> = {}) => this.k({ t: "back", src, n: src.startsWith("blend:") ? null : n, ...more });
  knot = (src: string, n: number | null = 2, wraps?: number) => this.k({ t: "knot", src, n: src.startsWith("blend:") ? null : n, ...(wraps && { wraps }) });

  cell = (x: number, y: number, v: KeyIndex) => void this.cells.push([x, y, "stitches", v]);
  beadAt = (x: number, y: number, v: KeyIndex) => void this.cells.push([x, y, "beads", v]);
  part = (x: number, y: number, kind: PartialKindId, c: Corner, v: KeyIndex) => void this.parts.push([x, y, kind, c, v]);
  line = (x1: number, y1: number, x2: number, y2: number, v: KeyIndex) => void this.p.layers.segments.push({ x1, y1, x2, y2, k: v });
  point = (x: number, y: number, v: KeyIndex) => void this.p.layers.knots.push({ x, y, k: v });
  row = (x: number, y: number, n: number, v: KeyIndex) => {
    for (let i = 0; i < n; i++) this.cell(x + i, y, v);
  };
  block = (x: number, y: number, w: number, h: number, v: KeyIndex) => {
    for (let j = 0; j < h; j++) this.row(x, y + j, w, v);
  };
  /** One partial stitch of a kind in each corner, in four cells side by side: TL, TR, BR, BL. */
  corners = (x: number, y: number, kind: PartialKindId, v: KeyIndex) => ([0, 1, 2, 3] as Corner[]).forEach((c) => this.part(x + c, y, kind, c, v));

  /** Sizes the chart and puts the cells and partial stitches in. */
  finish(w: number, h: number): Pattern {
    const p = this.p;
    p.w = w;
    p.h = h;
    p.layers.stitches = new Uint16Array(w * h);
    p.layers.beads = new Uint16Array(w * h);
    for (const [x, y, layer, v] of this.cells) p.layers[layer][y * w + x] = v;
    for (const [x, y, kind, corner, v] of this.parts) {
      const i = y * w + x;
      p.layers.partials.set(i, [...(p.layers.partials.get(i) ?? []), { kind, corner, k: v }]);
    }
    return p;
  }
}

/** Seven-segment digits, 1 cell wide and 2 high, as backstitch: segments [x1, y1, x2, y2] in the digit's box. */
const SEG = { a: [0, 0, 1, 0], b: [1, 0, 1, 1], c: [1, 1, 1, 2], d: [0, 2, 1, 2], e: [0, 1, 0, 2], f: [0, 0, 0, 1], g: [0, 1, 1, 1] } as const;
const SEGMENTS = ["abcdef", "bc", "abged", "abgcd", "fgbc", "afgcd", "afgedc", "abc", "abcdefg", "abcdfg"];

/** A number in backstitch, its top-left corner at (x, y): digits 1 cell wide, 2 high, 1.5 apart. */
export function backstitchNumber(pt: Painter, n: number, x: number, y: number, k: KeyIndex) {
  [...String(n)].forEach((d, j) => {
    for (const seg of SEGMENTS[Number(d)]!) {
      const [x1, y1, x2, y2] = SEG[seg as keyof typeof SEG];
      pt.line(x + j * 1.5 + x1, y + y1, x + j * 1.5 + x2, y + y2, k);
    }
  });
}

/** 3 × 5 cell digits, for files that carry crosses only (Pattern Keeper). */
const PIXELS = ["111101101101111", "010110010010111", "111001111100111", "111001111001111", "101101111001001", "111100111001111", "111100111101111", "111001001001001", "111101111101111", "111101111001111"];

/** A number in whole crosses, its top-left cell at (x, y): digits 3 cells wide, 5 high, a column apart. */
export function crossNumber(pt: Painter, n: number, x: number, y: number, k: KeyIndex) {
  [...String(n)].forEach((d, j) => {
    [...PIXELS[Number(d)]!].forEach((on, i) => on === "1" && pt.cell(x + j * 4 + (i % 3), y + Math.floor(i / 3), k));
  });
}

/**
 * Lays samples out in boxes, `perRow` to a row: each box its number (`number`, `labelW` cells wide), then the
 * sample's area. Checks of the whole file go last, numbered on. The chart is as big as its boxes, less the gap after
 * the last column and row.
 */
export function layOut(kind: CheckKind, pt: Painter, defs: SampleDef[], o: { label: KeyIndex; perRow: number; labelW: number; areaW: number; areaH: number; gapX: number; gapY: number; number: (n: number, x: number, y: number) => void }): CheckSuite {
  const slotW = o.labelW + o.areaW + o.gapX, slotH = o.areaH + o.gapY;
  const placed = defs.filter((d) => d.put), whole = defs.filter((d) => !d.put);
  const items: CheckItem[] = placed.map((d, i) => {
    const sx = (i % o.perRow) * slotW, sy = Math.floor(i / o.perRow) * slotH;
    o.number(i + 1, sx, sy);
    d.put!(sx + o.labelW, sy);
    return item(d, { x: sx, y: sy, w: o.labelW + o.areaW, h: o.areaH });
  });
  for (const d of whole) items.push(item(d, null));
  const rows = Math.ceil(placed.length / o.perRow);
  return { kind, pattern: pt.finish(o.perRow * slotW - o.gapX, rows * slotH - o.gapY), items, label: o.label };
}

const item = (d: SampleDef, area: Rect | null): CheckItem => ({ id: d.id, group: d.group, tags: d.tags, what: d.what, ...(d.how && { how: d.how }), area, ...(d.absent && { absent: true }) });
