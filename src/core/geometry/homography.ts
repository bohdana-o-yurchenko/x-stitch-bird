import type { Point } from "../pattern/types";

/** A 3×3 perspective transform, row-major, with the last entry 1. */
export type Homography = readonly number[];

/** The perspective transform taking the 4 points `from` onto `to` (same order); null if they are degenerate. */
export function homography(from: readonly Point[], to: readonly Point[]): Homography | null {
  // 8 unknowns h0..h7: x' = (h0 x + h1 y + h2) / (h6 x + h7 y + 1), y' likewise with h3..h5
  const m: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = from[i]!, { x: u, y: v } = to[i]!;
    m.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    m.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }
  for (let c = 0; c < 8; c++) {
    let pivot = c;
    for (let r = c + 1; r < 8; r++) if (Math.abs(m[r]![c]!) > Math.abs(m[pivot]![c]!)) pivot = r;
    if (Math.abs(m[pivot]![c]!) < 1e-12) return null;
    [m[c], m[pivot]] = [m[pivot]!, m[c]!];
    for (let r = 0; r < 8; r++) {
      if (r === c) continue;
      const f = m[r]![c]! / m[c]![c]!;
      for (let k = c; k < 9; k++) m[r]![k]! -= f * m[c]![k]!;
    }
  }
  return [...m.map((row, i) => row[8]! / row[i]!), 1];
}

export function project(h: Homography, p: Point): Point {
  const w = h[6]! * p.x + h[7]! * p.y + h[8]!;
  return { x: (h[0]! * p.x + h[1]! * p.y + h[2]!) / w, y: (h[3]! * p.x + h[4]! * p.y + h[5]!) / w };
}

export interface RgbaImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

/**
 * Straightens the area of `src` inside `corners` (top-left, top-right, bottom-right, bottom-left) into a
 * `w`×`h` rectangle with bilinear sampling. Pixels that fall outside the photo come out white.
 */
export function warpQuad(src: RgbaImage, corners: readonly Point[], w: number, h: number): RgbaImage {
  const hm = homography([{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }], corners)!;
  const out = new Uint8ClampedArray(w * h * 4), { width: sw, height: sh, data: sd } = src;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const p = project(hm, { x: x + 0.5, y: y + 0.5 }), fx = p.x - 0.5, fy = p.y - 0.5;
      const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0, o = (y * w + x) * 4;
      if (x0 < -1 || y0 < -1 || x0 >= sw || y0 >= sh) {
        out.fill(255, o, o + 4);
        continue;
      }
      for (let ch = 0; ch < 4; ch++) {
        const at = (xx: number, yy: number) => (xx < 0 || yy < 0 || xx >= sw || yy >= sh ? 255 : sd[(yy * sw + xx) * 4 + ch]!);
        const top = at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx, bottom = at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx;
        out[o + ch] = top * (1 - ty) + bottom * ty;
      }
    }
  return { width: w, height: h, data: out };
}
