import { forEachChangedCell } from "@/core/layers/cellDiff";
import { chartLines } from "@/core/layers/registry";
import type { Knot, PartialStitch, Pattern, Rect, Segment } from "@/core/pattern/types";

/** Cells per side of the square tiles the chart is redrawn in after an edit. */
export const TILE = 16;
/** More changed tiles than this: one full redraw is cheaper than many small ones. */
const MAX_TILES = 400;

/**
 * Remembers what the cached chart image shows and tells, for the pattern as it is now, which parts of it changed:
 * tiles of `TILE`×`TILE` cells (in cells, clipped to the chart), or `"all"`. It compares the layers themselves, so
 * it catches every change however it was made — nothing has to report what it touched.
 */
export class ContentTracker {
  private pattern: Pattern | null = null;
  private stitches = new Uint16Array(0);
  private beads = new Uint16Array(0);
  private partials = new Map<number, PartialStitch[]>();
  private segments = new Float64Array(0);
  private knots = new Float64Array(0);

  /** The cache now shows `p` exactly (after a full redraw). */
  reset(p: Pattern) {
    this.pattern = p;
    this.stitches = Uint16Array.from(p.layers.stitches);
    this.beads = Uint16Array.from(p.layers.beads);
    this.partials = copyPartials(p.layers.partials);
    this.segments = flatSegments(chartLines(p));
    this.knots = flatKnots(p.layers.knots);
  }

  /** What changed since the last `reset` or `changes`, and from now on `p` is what the cache shows. */
  changes(p: Pattern): Rect[] | "all" {
    if (p !== this.pattern || p.layers.stitches.length !== this.stitches.length || p.layers.beads.length !== this.beads.length) {
      this.reset(p);
      return "all";
    }
    const tiles = new Set<number>(), cols = Math.ceil(p.w / TILE);
    const cell = (x: number, y: number) => {
      if (x >= 0 && y >= 0 && x < p.w && y < p.h) tiles.add(((y / TILE) | 0) * cols + ((x / TILE) | 0));
    };
    const area = (x0: number, y0: number, x1: number, y1: number) => {
      for (let y = Math.floor(y0 / TILE) * TILE; y <= y1; y += TILE) for (let x = Math.floor(x0 / TILE) * TILE; x <= x1; x += TILE) cell(Math.max(0, x), Math.max(0, y));
    };

    for (const [now, was] of [[p.layers.stitches, this.stitches], [p.layers.beads, this.beads]] as const) {
      forEachChangedCell(now, was, (i) => cell(i % p.w, (i / p.w) | 0));
      was.set(now);
    }

    const partials = p.layers.partials;
    for (const [i, list] of partials) if (!samePartials(list, this.partials.get(i))) cell(i % p.w, (i / p.w) | 0);
    for (const i of this.partials.keys()) if (!partials.has(i)) cell(i % p.w, (i / p.w) | 0);
    this.partials = copyPartials(partials);

    // a line (backstitch, a stamp's) or a knot reaches a little past its points: the cells around them too
    const segments = flatSegments(chartLines(p));
    for (const s of changedItems(this.segments, segments, 5)) area(Math.min(s[0]!, s[2]!) - 1, Math.min(s[1]!, s[3]!) - 1, Math.max(s[0]!, s[2]!), Math.max(s[1]!, s[3]!));
    this.segments = segments;
    const knots = flatKnots(p.layers.knots);
    for (const o of changedItems(this.knots, knots, 3)) area(o[0]! - 1, o[1]! - 1, o[0]!, o[1]!);
    this.knots = knots;

    if (tiles.size > MAX_TILES) return "all";
    return [...tiles].map((t) => {
      const x = (t % cols) * TILE, y = ((t / cols) | 0) * TILE;
      return { x, y, w: Math.min(TILE, p.w - x), h: Math.min(TILE, p.h - y) };
    });
  }
}

const samePartials = (a: PartialStitch[], b: PartialStitch[] | undefined) =>
  !!b && a.length === b.length && a.every((s, i) => s.kind === b[i]!.kind && s.corner === b[i]!.corner && s.k === b[i]!.k);

const copyPartials = (m: Map<number, PartialStitch[]>) => new Map([...m].map(([i, list]) => [i, list.map((s) => ({ ...s }))]));

const flatSegments = (list: Segment[]) => {
  const out = new Float64Array(list.length * 5);
  list.forEach((s, i) => out.set([s.x1, s.y1, s.x2, s.y2, s.k], i * 5));
  return out;
};

const flatKnots = (list: Knot[]) => {
  const out = new Float64Array(list.length * 3);
  list.forEach((o, i) => out.set([o.x, o.y, o.k], i * 3));
  return out;
};

/** Items (runs of `n` numbers) in one list and not the other, counting repeats; empty when the lists are equal. */
function changedItems(was: Float64Array, now: Float64Array, n: number): number[][] {
  if (was.length === now.length) {
    let same = true;
    for (let i = 0; i < now.length && same; i++) same = was[i] === now[i];
    if (same) return [];
  }
  const counts = new Map<string, { item: number[]; count: number }>();
  const add = (list: Float64Array, d: number) => {
    for (let i = 0; i < list.length; i += n) {
      const item = Array.from(list.subarray(i, i + n)), key = item.join(",");
      const e = counts.get(key) ?? counts.set(key, { item, count: 0 }).get(key)!;
      e.count += d;
    }
  };
  add(was, -1);
  add(now, 1);
  return [...counts.values()].filter((e) => e.count).map((e) => e.item);
}
