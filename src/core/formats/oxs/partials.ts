import type { Corner } from "../../pattern/types";

/*
 * Quarter and petite stitches in OXS are <object>s on the half grid: x1/y1 is the top-left of the quarter of the
 * cell they cover (Ursa's format, as used by Cross Stitch Pro and readers such as Хрестики and Ruta Stitch).
 */

/** Where a corner's quarter of the cell starts, in cells: corners 0 TL, 1 TR, 2 BR, 3 BL. */
export const cornerOffset = (c: Corner) => ({ dx: c === 1 || c === 2 ? 0.5 : 0, dy: c >= 2 ? 0.5 : 0 });

/** The corner whose quarter starts at this half-grid point (the fractional parts of x1/y1). */
export const cornerAt = (fx: number, fy: number): Corner => {
  const right = fx - Math.floor(fx) >= 0.25, bottom = fy - Math.floor(fy) >= 0.25;
  return (bottom ? (right ? 2 : 3) : right ? 1 : 0) as Corner;
};
