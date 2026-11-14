import { rle, unrle } from "../formats/json/rle";
import { clearPartialsUnder, isOccupied } from "../pattern/occupancy";
import type { Layers } from "../pattern/types";
import { cellIndexMap } from "../transform/cellTransform";
import { inBounds } from "./maskGeometry";
import type { LayerHandler } from "./types";

type Dense = Uint16Array;

/** One key index per cell: the stitch layer (crosses, combos) and the bead layer. */
function denseLayer(id: "stitches" | "beads", pickPriority: number): LayerHandler<Dense> {
  const repointable = id === "stitches";
  return {
    id,
    exported: true,
    pickPriority,
    get: (l: Layers) => l[id],
    set: (l: Layers, v: Dense) => void (l[id] = v),
    create: ({ w, h }) => new Uint16Array(w * h),
    clone: (v) => v.slice(),
    equals: (a, b) => a.length === b.length && a.every((x, i) => x === b[i]),
    isEmpty: (v) => v.every((x) => x === 0),
    resize(v, from, to, off) {
      const out = new Uint16Array(to.w * to.h);
      for (let y = 0; y < from.h; y++)
        for (let x = 0; x < from.w; x++) {
          const nx = x + off.x, ny = y + off.y;
          if (inBounds(nx, ny, to)) out[ny * to.w + nx] = v[y * from.w + x] ?? 0;
        }
      return out;
    },
    transform(v, t, size, ctx) {
      const map = cellIndexMap(t, size);
      const out = new Uint16Array(v.length);
      const swap = repointable && t.swapsDiagonal;
      for (let i = 0; i < v.length; i++) {
        const k = v[i] ?? 0;
        if (k) out[map[i] ?? 0] = swap ? ctx.repoint(k) : k;
      }
      return out;
    },
    extract(v, mask, size, b) {
      const out = new Uint16Array(b.w * b.h);
      for (let y = 0; y < b.h; y++)
        for (let x = 0; x < b.w; x++) {
          const i = (y + b.y) * size.w + x + b.x;
          if (mask[i]) out[y * b.w + x] = v[i] ?? 0;
        }
      return out;
    },
    insert(v, piece, ps, at, size, { pattern, override }) {
      for (let y = 0; y < ps.h; y++)
        for (let x = 0; x < ps.w; x++) {
          const k = piece[y * ps.w + x] ?? 0, tx = x + at.x, ty = y + at.y;
          if (!k || !inBounds(tx, ty, size)) continue;
          const i = ty * size.w + tx, e = pattern.key[k];
          if (!e || (!override && isOccupied(pattern, i, e))) continue;
          v[i] = k;
          if (id === "stitches") {
            if (e.t === "combo") pattern.layers.beads[i] = 0;
            clearPartialsUnder(pattern, i, e);
          }
        }
    },
    clearMask(v, mask) {
      for (let i = 0; i < v.length; i++) if (mask[i]) v[i] = 0;
    },
    erase(v, target) {
      let any = false;
      for (const i of target.cells)
        if (v[i]) {
          v[i] = 0;
          any = true;
        }
      return any;
    },
    pickAt: (v, at, size) => (inBounds(Math.floor(at.x), Math.floor(at.y), size) ? v[Math.floor(at.y) * size.w + Math.floor(at.x)] ?? 0 : 0),
    remapKeys(v, map) {
      for (let i = 0; i < v.length; i++) if (v[i]) v[i] = map(v[i]!);
    },
    usage(v, sink) {
      for (let i = 0; i < v.length; i++) if (v[i]) sink(v[i]!, "cell", 1);
    },
    bounds(v, { w }) {
      let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
      for (let i = 0; i < v.length; i++)
        if (v[i]) {
          const x = i % w, y = (i / w) | 0;
          x0 = Math.min(x0, x);
          y0 = Math.min(y0, y);
          x1 = Math.max(x1, x);
          y1 = Math.max(y1, y);
        }
      return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
    },
    serialize: (v, map) => rle(v.map((k) => (k ? map(k) : 0))),
    parse: (raw, { w, h }) => unrle(typeof raw === "string" ? raw : undefined, w * h),
  };
}

export const stitchesLayer = denseLayer("stitches", 40);
export const beadsLayer = denseLayer("beads", 20);
