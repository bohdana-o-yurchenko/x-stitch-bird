import { SIDE, type Patch } from "@/core/matching/match";

/** A white cell patch with a dark printed mark drawn by `ink(x, y)`, moved by (dx, dy), with a little noise. */
export function printed(ink: (x: number, y: number) => boolean, dx = 0, dy = 0, seed = 1): Patch {
  const p = new Uint8Array(SIDE * SIDE);
  let r = seed;
  for (let y = 0; y < SIDE; y++)
    for (let x = 0; x < SIDE; x++) {
      r = (r * 16807) % 2147483647;
      p[y * SIDE + x] = Math.max(0, Math.min(255, (ink(x - dx, y - dy) ? 40 : 235) + ((r % 21) - 10)));
    }
  return p;
}
export const cross = (x: number, y: number) => Math.abs(x - y) < 2 || Math.abs(x + y - 19) < 2;
export const ring = (x: number, y: number) => Math.abs(Math.hypot(x - 9.5, y - 9.5) - 5) < 1.4;
export const bar = (x: number, y: number) => y >= 8 && y <= 11 && x >= 3 && x <= 16;
export const blank = () => false;

const nearSegment = (x: number, y: number, x1: number, y1: number, x2: number, y2: number) => {
  const dx = x2 - x1, dy = y2 - y1, t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - x1 - t * dx, y - y1 - t * dy) < 1.1;
};
/** Letters that share a stem: easy to mix up when a cell is a little out of line. */
export const letterT = (x: number, y: number) => nearSegment(x, y, 4, 4.5, 15, 4.5) || nearSegment(x, y, 9.5, 4.5, 9.5, 16);
export const letterY = (x: number, y: number) => nearSegment(x, y, 4, 4, 9.5, 10) || nearSegment(x, y, 15, 4, 9.5, 10) || nearSegment(x, y, 9.5, 10, 9.5, 16);
/** A printed mark with the chart's grid lines on the cell's borders (they move with the cell). */
export const gridded = (ink: (x: number, y: number) => boolean) => (x: number, y: number) =>
  ink(x, y) || Math.abs(x + 0.5) < 0.7 || Math.abs(x - 19.5) < 0.7 || Math.abs(y + 0.5) < 0.7 || Math.abs(y - 19.5) < 0.7;
