import { cellIndexMap } from "../transform/cellTransform";
import type { Layers } from "../pattern/types";
import { boundsOfCells, inBounds } from "./maskGeometry";
import type { LayerHandler } from "./types";

/**
 * Cells a mapper flagged as unclear (SPEC §15.5). Never exported, never counted, never picked,
 * never erased by painting tools; it only moves with the chart.
 */
export const ambiguousLayer: LayerHandler<Set<number>> = {
  id: "ambiguous",
  fileField: "amb",
  exported: false,
  pickPriority: Infinity,
  get: (l: Layers) => l.ambiguous,
  set: (l: Layers, v: Set<number>) => void (l.ambiguous = v),
  create: () => new Set(),
  clone: (v) => new Set(v),
  equals: (a, b) => a.size === b.size && [...a].every((i) => b.has(i)),
  isEmpty: (v) => v.size === 0,
  resize(v, from, to, off) {
    const out = new Set<number>();
    for (const i of v) {
      const x = (i % from.w) + off.x, y = ((i / from.w) | 0) + off.y;
      if (inBounds(x, y, to)) out.add(y * to.w + x);
    }
    return out;
  },
  transform(v, t, size) {
    const map = cellIndexMap(t, size);
    return new Set([...v].map((i) => map[i] ?? 0));
  },
  extract(v, mask, size, b) {
    const out = new Set<number>();
    for (const i of v) if (mask[i]) out.add((((i / size.w) | 0) - b.y) * b.w + (i % size.w) - b.x);
    return out;
  },
  insert(v, piece, ps, at, size) {
    for (const pi of piece) {
      const x = (pi % ps.w) + at.x, y = ((pi / ps.w) | 0) + at.y;
      if (inBounds(x, y, size)) v.add(y * size.w + x);
    }
  },
  clearMask(v, mask) {
    for (const i of [...v]) if (mask[i]) v.delete(i);
  },
  erase: () => false,
  pickAt: () => 0,
  remapKeys: () => {},
  usage: () => {},
  bounds: (v, size) => boundsOfCells(v, size.w),
  serialize: (v) => [...v].sort((a, b) => a - b),
  parse: (raw, size) =>
    new Set(Array.isArray(raw) ? raw.filter((i): i is number => Number.isInteger(i) && i >= 0 && i < size.w * size.h) : []),
};
