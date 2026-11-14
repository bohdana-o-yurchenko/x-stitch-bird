import type { Rect, Size } from "../pattern/types";

/** Is a half-grid point inside or on the outline of the masked cells? */
export function pointInMask(x: number, y: number, mask: Uint8Array, { w, h }: Size): boolean {
  const xs = Number.isInteger(x) ? [x - 1, x] : [Math.floor(x)];
  const ys = Number.isInteger(y) ? [y - 1, y] : [Math.floor(y)];
  for (const cy of ys) for (const cx of xs) if (cx >= 0 && cy >= 0 && cx < w && cy < h && mask[cy * w + cx]) return true;
  return false;
}

export const inBounds = (x: number, y: number, { w, h }: Size) => x >= 0 && y >= 0 && x < w && y < h;
export const pointInBounds = (x: number, y: number, { w, h }: Size) => x >= 0 && y >= 0 && x <= w && y <= h;

export function boundsOfCells(cells: Iterable<number>, w: number): Rect | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const i of cells) {
    const x = i % w, y = (i / w) | 0;
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** Cells covering a set of half-grid points. */
export function boundsOfPoints(pts: Iterable<[number, number]>): Rect | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of pts) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  if (minX === Infinity) return null;
  const x = Math.floor(minX), y = Math.floor(minY);
  return { x, y, w: Math.max(x, Math.ceil(maxX) - 1) - x + 1, h: Math.max(y, Math.ceil(maxY) - 1) - y + 1 };
}

export function unionRect(a: Rect | null, b: Rect | null): Rect | null {
  if (!a) return b;
  if (!b) return a;
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

export const segmentDistance = (px: number, py: number, ax: number, ay: number, bx: number, by: number): number => {
  const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
  const t = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
};
