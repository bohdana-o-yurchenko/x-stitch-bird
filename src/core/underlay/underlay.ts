import type { Point, Rect, Size } from "../pattern/types";

/** A reference image placed on the chart (SPEC §15.15). `crop` is in image pixels, `rect` in grid units. */
export interface UnderlayData {
  src: string;
  imageW: number;
  imageH: number;
  crop: Rect;
  rect: Rect;
  opacity: number;
  /** true: drawn under the stitches and untouchable; false: edit mode. */
  behind: boolean;
  visible: boolean;
  tool: "move" | "crop";
}

export type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "inside";

const MIN = 1;

/** The visible part scaled to fit the chart, aspect kept, centred. */
export function fitToChart(crop: Rect, chart: Size): Rect {
  const s = Math.min(chart.w / crop.w, chart.h / crop.h);
  const w = crop.w * s, h = crop.h * s;
  return { x: (chart.w - w) / 2, y: (chart.h - h) / 2, w, h };
}

export function newUnderlay(src: string, imageW: number, imageH: number, chart: Size): UnderlayData {
  const crop = { x: 0, y: 0, w: imageW, h: imageH };
  return { src, imageW, imageH, crop, rect: fitToChart(crop, chart), opacity: 0.5, behind: false, visible: true, tool: "move" };
}

/** Which handle (or the inside) is under a point; `tol` is the grab distance in grid units. */
export function handleAt(r: Rect, p: Point, tol: number): Handle | null {
  const near = (a: number, b: number) => Math.abs(a - b) <= tol;
  const inX = p.x >= r.x - tol && p.x <= r.x + r.w + tol, inY = p.y >= r.y - tol && p.y <= r.y + r.h + tol;
  if (!inX || !inY) return null;
  const left = near(p.x, r.x), right = near(p.x, r.x + r.w), top = near(p.y, r.y), bottom = near(p.y, r.y + r.h);
  const midX = near(p.x, r.x + r.w / 2), midY = near(p.y, r.y + r.h / 2);
  if (top && left) return "nw";
  if (top && right) return "ne";
  if (bottom && right) return "se";
  if (bottom && left) return "sw";
  if (top && midX) return "n";
  if (bottom && midX) return "s";
  if (left && midY) return "w";
  if (right && midY) return "e";
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h ? "inside" : null;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Result of dragging `handle` by (dx, dy) grid units from the state `u` had when the drag started.
 * Move & resize: corners keep the aspect ratio unless `free`. Crop: trims the visible part; position and
 * scale of what stays visible do not change, and the crop never passes the image edges.
 */
export function dragUnderlay(u: UnderlayData, handle: Handle, dx: number, dy: number, free: boolean): Pick<UnderlayData, "crop" | "rect"> {
  const { rect: r, crop: c } = u;
  if (handle === "inside") return { crop: c, rect: { ...r, x: r.x + dx, y: r.y + dy } };
  const west = handle.includes("w"), east = handle.includes("e"), north = handle.startsWith("n"), south = handle.startsWith("s");

  if (u.tool === "crop") {
    const sx = r.w / c.w, sy = r.h / c.h;
    let { x: left, y: top } = r, right = r.x + r.w, bottom = r.y + r.h;
    if (west) left = clamp(left + dx, r.x - c.x * sx, right - MIN);
    if (east) right = clamp(right + dx, left + MIN, r.x + (u.imageW - c.x) * sx);
    if (north) top = clamp(top + dy, r.y - c.y * sy, bottom - MIN);
    if (south) bottom = clamp(bottom + dy, top + MIN, r.y + (u.imageH - c.y) * sy);
    const crop = { x: c.x + (left - r.x) / sx, y: c.y + (top - r.y) / sy, w: (right - left) / sx, h: (bottom - top) / sy };
    return { crop, rect: { x: left, y: top, w: right - left, h: bottom - top } };
  }

  let w = r.w + (east ? dx : west ? -dx : 0), h = r.h + (south ? dy : north ? -dy : 0);
  const corner = (west || east) && (north || south);
  if (corner && !free) {
    const aspect = r.h / r.w;
    w = Math.max(MIN, Math.abs(dx) >= Math.abs(dy) ? w : h / aspect);
    h = w * aspect;
    if (h < MIN) { h = MIN; w = h / aspect; }
  }
  w = Math.max(MIN, w);
  h = Math.max(MIN, h);
  return { crop: c, rect: { x: west ? r.x + r.w - w : r.x, y: north ? r.y + r.h - h : r.y, w, h } };
}

/**
 * Width and height grown by (dw, dh) grid units with `anchor` (a grid point, usually the middle of the screen)
 * staying put, so the part being aligned doesn't drift while the far parts move.
 */
export function stretchUnderlay(r: Rect, anchor: Point, dw: number, dh: number): Rect {
  const w = Math.max(MIN, r.w + dw), h = Math.max(MIN, r.h + dh);
  return { x: anchor.x - ((anchor.x - r.x) * w) / r.w, y: anchor.y - ((anchor.y - r.y) * h) / r.h, w, h };
}

/**
 * 3-point grid alignment (SPEC §15.15). `a`, `b`, `c` are where the user clicked the top-left, top-right and
 * bottom-right corners of an `n`×`n` square of the scanned chart's grid (grid units, with the image at `r`).
 * Returns the placement that puts `a` on the nearest chart grid intersection and makes the square exactly `n`
 * cells wide and tall; null when the points aren't right-then-down.
 */
export function alignUnderlay(r: Rect, a: Point, b: Point, c: Point, n: number): Rect | null {
  const u = (p: Point) => (p.x - r.x) / r.w, v = (p: Point) => (p.y - r.y) / r.h;
  // average the two clicks that share a grid line
  const left = u(a), right = (u(b) + u(c)) / 2, top = (v(a) + v(b)) / 2, bottom = v(c);
  if (!(n > 0) || right - left <= 0 || bottom - top <= 0) return null;
  const w = n / (right - left), h = n / (bottom - top);
  const ax = Math.round(a.x), ay = Math.round(a.y);
  return { x: ax - left * w, y: ay - top * h, w, h };
}

/** Size of the clicked square in cells as currently placed — the starting guess for `alignUnderlay`'s `n`. */
export const guessSquareSize = (a: Point, b: Point, c: Point) => Math.max(1, Math.round((Math.abs(b.x - a.x) + Math.abs(c.y - b.y)) / 2));

/** Show the whole image again; the part that was visible stays exactly where it was. */
export function resetCrop(u: UnderlayData): Pick<UnderlayData, "crop" | "rect"> {
  const sx = u.rect.w / u.crop.w, sy = u.rect.h / u.crop.h;
  return {
    crop: { x: 0, y: 0, w: u.imageW, h: u.imageH },
    rect: { x: u.rect.x - u.crop.x * sx, y: u.rect.y - u.crop.y * sy, w: u.imageW * sx, h: u.imageH * sy },
  };
}

/** Validates an underlay read from a file or storage. */
export function cleanUnderlay(raw: unknown): UnderlayData | null {
  const u = raw as Partial<UnderlayData> | null;
  const rect = (v: unknown): v is Rect => !!v && ["x", "y", "w", "h"].every((k) => Number.isFinite((v as Record<string, number>)[k]));
  if (!u || typeof u.src !== "string" || !u.src.startsWith("data:image/") || !rect(u.rect) || !rect(u.crop) || !(Number(u.imageW) > 0) || !(Number(u.imageH) > 0)) return null;
  return {
    src: u.src, imageW: Number(u.imageW), imageH: Number(u.imageH), crop: u.crop, rect: u.rect,
    opacity: clamp(Number(u.opacity) || 0.5, 0.1, 1), behind: !!u.behind, visible: u.visible !== false, tool: u.tool === "crop" ? "crop" : "move",
  };
}
