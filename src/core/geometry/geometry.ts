import type { Point, Size } from "../pattern/types";

/** Cells on a straight line (Bresenham), both ends included. */
export function lineCells(a: Point, b: Point): Point[] {
  const out: Point[] = [];
  let x0 = a.x, y0 = a.y;
  const dx = Math.abs(b.x - x0), dy = -Math.abs(b.y - y0), sx = x0 < b.x ? 1 : -1, sy = y0 < b.y ? 1 : -1;
  let err = dx + dy;
  for (let n = 0; n < 10000; n++) {
    out.push({ x: x0, y: y0 });
    if (x0 === b.x && y0 === b.y) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
  return out;
}

export function rectCells(a: Point, b: Point, filled: boolean): Point[] {
  const out: Point[] = [];
  const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) if (filled || x === x0 || x === x1 || y === y0 || y === y1) out.push({ x, y });
  return out;
}

/** Square brush of `size` cells centred on (x, y); offset floor((size-1)/2) like the original app. */
export function brushCells(x: number, y: number, size: number, { w, h }: Size): Point[] {
  const out: Point[] = [], o = Math.floor((size - 1) / 2);
  for (let dy = 0; dy < size; dy++)
    for (let dx = 0; dx < size; dx++) {
      const cx = x - o + dx, cy = y - o + dy;
      if (cx >= 0 && cy >= 0 && cx < w && cy < h) out.push({ x: cx, y: cy });
    }
  return out;
}

/** 4-connected region of cells where `same(i)` holds, starting at `start`. */
export function floodRegion(start: number, { w, h }: Size, same: (i: number) => boolean): number[] {
  const out: number[] = [];
  const seen = new Uint8Array(w * h);
  const stack = [start];
  while (stack.length) {
    const i = stack.pop()!;
    if (seen[i] || !same(i)) continue;
    seen[i] = 1;
    out.push(i);
    const x = i % w, y = (i / w) | 0;
    if (x > 0) stack.push(i - 1);
    if (x < w - 1) stack.push(i + 1);
    if (y > 0) stack.push(i - w);
    if (y < h - 1) stack.push(i + w);
  }
  return out;
}

/** Nearest half-grid point, clamped to the chart. */
export const snapHalf = (g: Point, { w, h }: Size): Point => ({
  x: Math.max(0, Math.min(w, Math.round(g.x * 2) / 2)),
  y: Math.max(0, Math.min(h, Math.round(g.y * 2) / 2)),
});

/** Half-grid points passed when moving from a to b (for knot dragging). */
export function halfPointsBetween(a: Point, b: Point): Point[] {
  const steps = Math.max(1, Math.round(Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y)) * 2));
  const out: Point[] = [];
  for (let s = 1; s <= steps; s++) {
    const p = { x: Math.round((a.x + ((b.x - a.x) * s) / steps) * 2) / 2, y: Math.round((a.y + ((b.y - a.y) * s) / steps) * 2) / 2 };
    if (!out.some((o) => o.x === p.x && o.y === p.y)) out.push(p);
  }
  return out;
}
