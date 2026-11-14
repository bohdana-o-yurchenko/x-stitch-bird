import type { Corner, Size } from "../pattern/types";

export type TransformId = "flipH" | "flipV" | "rot90cw" | "rot90ccw" | "rot180";

/**
 * A whole-chart flip or rotation (SPEC §15.3). Cells are integer (x, y) in 0..w-1; points are half-grid
 * coordinates in 0..w. `size` is the size *before* the transform.
 */
export interface CellTransform {
  id: TransformId;
  newSize(size: Size): Size;
  cell(x: number, y: number, size: Size): [number, number];
  point(x: number, y: number, size: Size): [number, number];
  corner(c: Corner): Corner;
  /** Flips and quarter turns swap ╱ and ╲; a half turn keeps them. */
  swapsDiagonal: boolean;
}

const same = (s: Size) => s;
const swapped = (s: Size) => ({ w: s.h, h: s.w });

export const TRANSFORMS: Record<TransformId, CellTransform> = {
  flipH: {
    id: "flipH", newSize: same, swapsDiagonal: true,
    cell: (x, y, { w }) => [w - 1 - x, y],
    point: (x, y, { w }) => [w - x, y],
    corner: (c) => (c ^ 1) as Corner,
  },
  flipV: {
    id: "flipV", newSize: same, swapsDiagonal: true,
    cell: (x, y, { h }) => [x, h - 1 - y],
    point: (x, y, { h }) => [x, h - y],
    corner: (c) => (3 - c) as Corner,
  },
  rot90cw: {
    id: "rot90cw", newSize: swapped, swapsDiagonal: true,
    cell: (x, y, { h }) => [h - 1 - y, x],
    point: (x, y, { h }) => [h - y, x],
    corner: (c) => ((c + 1) % 4) as Corner,
  },
  rot90ccw: {
    id: "rot90ccw", newSize: swapped, swapsDiagonal: true,
    cell: (x, y, { w }) => [y, w - 1 - x],
    point: (x, y, { w }) => [y, w - x],
    corner: (c) => ((c + 3) % 4) as Corner,
  },
  rot180: {
    id: "rot180", newSize: same, swapsDiagonal: false,
    cell: (x, y, { w, h }) => [w - 1 - x, h - 1 - y],
    point: (x, y, { w, h }) => [w - x, h - y],
    corner: (c) => ((c + 2) % 4) as Corner,
  },
};

/** Maps every cell index of a w×h grid to its index after the transform. */
export function cellIndexMap(t: CellTransform, size: Size): Uint32Array {
  const out = new Uint32Array(size.w * size.h);
  const nw = t.newSize(size).w;
  for (let y = 0; y < size.h; y++)
    for (let x = 0; x < size.w; x++) {
      const [nx, ny] = t.cell(x, y, size);
      out[y * size.w + x] = ny * nw + nx;
    }
  return out;
}
