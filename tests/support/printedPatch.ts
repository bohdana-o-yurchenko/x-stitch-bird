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
