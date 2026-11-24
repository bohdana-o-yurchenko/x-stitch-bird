import { hexToRgb } from "@/core/color/colorMath";
import type { Ctx } from "./primitives/cells";

type Scratch = { canvas: OffscreenCanvas | HTMLCanvasElement; g: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D };
let scratch: Scratch | null | undefined;

/** A canvas to build bitmaps on; null where there is none (unit tests in Node), and drawing falls back to cells. */
function scratchCanvas(w: number, h: number): Scratch | null {
  if (scratch === undefined) {
    const canvas = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(1, 1) : typeof document !== "undefined" ? document.createElement("canvas") : null;
    const g = canvas?.getContext("2d") as Scratch["g"] | null | undefined;
    scratch = canvas && g ? { canvas, g } : null;
  }
  if (!scratch) return null;
  if (scratch.canvas.width < w || scratch.canvas.height < h) {
    scratch.canvas.width = Math.max(scratch.canvas.width, w);
    scratch.canvas.height = Math.max(scratch.canvas.height, h);
  }
  return scratch;
}

/** For tests: forget the scratch canvas, so the next bitmap looks for one again. */
export const resetScratch = () => void (scratch = undefined);

/** `#rrggbb` → one opaque pixel as the canvas stores it (RGBA bytes, read as a little-endian 32-bit number). */
export function pixel(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
}

/**
 * Flat colour for a block of cells in one go: one pixel per cell, scaled up without smoothing to `z` px a cell.
 * `colourAt(x, y)` gives the cell's pixel (see `pixel`) or 0 to leave it out. Returns false when it can't (no canvas
 * to build on), and the caller draws the cells one by one.
 */
export function drawCellBitmap(g: Ctx, x0: number, y0: number, w: number, h: number, ox: number, oy: number, z: number, colourAt: (x: number, y: number) => number): boolean {
  if (w <= 0 || h <= 0) return true;
  const s = scratchCanvas(w, h);
  if (!s) return false;
  const img = s.g.createImageData(w, h), px = new Uint32Array(img.data.buffer);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px[y * w + x] = colourAt(x0 + x, y0 + y);
  s.g.putImageData(img, 0, 0);
  const smooth = g.imageSmoothingEnabled;
  g.imageSmoothingEnabled = false;
  g.drawImage(s.canvas, 0, 0, w, h, ox + x0 * z, oy + y0 * z, w * z, h * z);
  g.imageSmoothingEnabled = smooth;
  return true;
}
