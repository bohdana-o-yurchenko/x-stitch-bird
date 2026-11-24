import { LAYERS } from "@/core/layers/registry";
import { pointGroup, stitchGroup } from "@/core/pattern/groups";
import { shade } from "@/core/color/colorMath";
import { isMajorLine, majorOffset } from "@/core/grid/numbering";
import type { Palette } from "@/core/pattern/palette";
import type { Pattern, Rect } from "@/core/pattern/types";
import { drawBackstitch, drawBeadCell, drawKnot, drawPartial, drawStitchCell, type CellStyle, type Ctx } from "./primitives/cells";
import type { CanvasTheme } from "./theme";
import { drawCellBitmap, pixel } from "./cellBitmap";

export type ChartView = "color" | "both" | "symbols";

/** Where the chart sits: cell (0,0) top-left at (ox, oy), `z` px per cell, cells x0..x1 × y0..y1 visible. */
export interface ChartFrame {
  z: number;
  ox: number;
  oy: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export const viewStyle = (view: ChartView, theme: CanvasTheme): CellStyle => ({ theme, showColour: view !== "symbols", showSymbol: view !== "color" });

export const fullFrame = (p: Pattern, z: number, ox: number, oy: number): ChartFrame => ({ z, ox, oy, x0: 0, y0: 0, x1: p.w, y1: p.h });

/** A chart underlay image and where it goes (SPEC §15.15). */
export interface UnderlayView {
  image: CanvasImageSource;
  crop: Rect;
  rect: Rect;
  opacity: number;
  /** Clockwise turn in degrees around the middle of `rect`. */
  rotation: number;
}

/** Sets up `g` so that drawing at grid-scaled coordinates (rect.x * z …) lands turned around the image's middle. */
export function turnAround(g: Ctx, u: UnderlayView, f: ChartFrame) {
  if (!u.rotation) return;
  const cx = f.ox + (u.rect.x + u.rect.w / 2) * f.z, cy = f.oy + (u.rect.y + u.rect.h / 2) * f.z;
  g.translate(cx, cy);
  g.rotate((u.rotation * Math.PI) / 180);
  g.translate(-cx, -cy);
}

/** The underlay at its opacity; `clip` keeps it inside the chart (behind mode). */
export function drawUnderlay(g: Ctx, p: Pattern, u: UnderlayView, f: ChartFrame, clip: boolean) {
  const { z, ox, oy } = f;
  g.save();
  if (clip) {
    g.beginPath();
    g.rect(ox, oy, p.w * z, p.h * z);
    g.clip();
  }
  g.globalAlpha = u.opacity;
  turnAround(g, u, f);
  g.drawImage(u.image, u.crop.x, u.crop.y, u.crop.w, u.crop.h, ox + u.rect.x * z, oy + u.rect.y * z, u.rect.w * z, u.rect.h * z);
  g.restore();
}

/** Stands in for the bead layer while beads are hidden: no cell has one. */
const NO_CELLS: { readonly [i: number]: number } = {};

/** Fabric, (underlay,) crosses, partial stitches and beads — everything below the grid. */
export function drawCells(g: Ctx, p: Pattern, palette: Palette, f: ChartFrame, style: CellStyle, withFabric = true, underlay?: UnderlayView) {
  const { z, ox, oy } = f, { stitches, partials } = p.layers, hidden = style.hidden;
  // a hidden kind is drawn as if it weren't there: crosses show their symbols with the beads hidden
  const beads = hidden?.has("beads") ? NO_CELLS : p.layers.beads;
  if (withFabric) {
    g.fillStyle = style.showColour ? p.fabric : "#FFFFFF";
    g.fillRect(ox, oy, p.w * z, p.h * z);
    if (style.stitched) fabricHoles(g, p, f);
  }
  if (underlay) drawUnderlay(g, p, underlay, f, true);
  const shown = palette.map((s) => !!s && !hidden?.has(stitchGroup(s)));
  // flat full crosses in one bitmap; each cell on its own only for what the bitmap can't show
  const flat = style.showColour && !style.stitched;
  const flatPixel = palette.map((s, k) => (flat && s && shown[k] && s.st === "full" ? pixel(s.hex) : 0));
  const symOk = style.showSymbol && z >= style.theme.symbols.minZoom;
  const bitmap = flatPixel.some(Boolean) && drawCellBitmap(g, f.x0, f.y0, f.x1 - f.x0, f.y1 - f.y0, ox, oy, z, (x, y) => flatPixel[stitches[y * p.w + x] ?? 0] ?? 0);
  const filled = bitmap ? { ...style, skipFill: true } : style;
  const plain = { ...filled, showSymbol: false };
  const own = (k: number) => !bitmap || !flatPixel[k] || symOk || palette[k]!.t === "combo";
  const needs = palette.map((s, k) => shown[k]! && own(k));
  for (let y = f.y0; y < f.y1; y++)
    for (let x = f.x0; x < f.x1; x++) {
      const i = y * p.w + x, k = stitches[i] ?? 0;
      if (needs[k]) drawStitchCell(g, ox + x * z, oy + y * z, z, palette[k]!, style.showSymbol && !beads[i] ? filled : plain);
    }
  if (!hidden?.has("partials"))
    for (const [i, list] of partials) {
      const x = i % p.w, y = (i / p.w) | 0;
      if (x < f.x0 || x >= f.x1 || y < f.y0 || y >= f.y1) continue;
      for (const ps of list) {
        const s = palette[ps.k];
        if (s) drawPartial(g, ox + x * z, oy + y * z, z, ps, s, style);
      }
    }
  if (!hidden?.has("beads"))
    for (let y = f.y0; y < f.y1; y++)
      for (let x = f.x0; x < f.x1; x++) {
        const s = palette[beads[y * p.w + x] ?? 0];
        if (s) drawBeadCell(g, ox + x * z, oy + y * z, z, s, style);
      }
}

/** The stitched preview's fabric: a faint hole at every cell corner, as in Aida. */
function fabricHoles(g: Ctx, p: Pattern, f: ChartFrame) {
  const { z, ox, oy } = f, r = Math.max(0.6, z * 0.07);
  g.fillStyle = shade(p.fabric, -0.22);
  g.beginPath();
  for (let y = f.y0; y <= f.y1; y++)
    for (let x = f.x0; x <= f.x1; x++) {
      g.moveTo(ox + x * z + r, oy + y * z);
      g.arc(ox + x * z, oy + y * z, r, 0, Math.PI * 2);
    }
  g.fill();
}

/** Thin grid (when zoomed in enough), bold lines every 10 aligned with the numbering, and the border. */
export function drawGrid(g: Ctx, p: Pattern, f: ChartFrame, theme: CanvasTheme, symbolsView: boolean, minor = theme.grid.minor) {
  const { z, ox, oy } = f, size = { w: p.w, h: p.h };
  const mx = majorOffset(p.grid, "x", size), my = majorOffset(p.grid, "y", size);
  const top = oy + f.y0 * z, bottom = oy + f.y1 * z, left = ox + f.x0 * z, right = ox + f.x1 * z;
  if (z >= theme.grid.minMinorZoom) {
    g.strokeStyle = symbolsView ? theme.grid.minorSymbols : minor;
    g.lineWidth = 1;
    g.beginPath();
    for (let x = f.x0; x <= f.x1; x++) if (!isMajorLine(x, mx)) { const px = Math.round(ox + x * z) + 0.5; g.moveTo(px, top); g.lineTo(px, bottom); }
    for (let y = f.y0; y <= f.y1; y++) if (!isMajorLine(y, my)) { const py = Math.round(oy + y * z) + 0.5; g.moveTo(left, py); g.lineTo(right, py); }
    g.stroke();
  }
  g.strokeStyle = theme.grid.major;
  g.lineWidth = z >= theme.grid.minMinorZoom ? 1.5 : 1;
  g.beginPath();
  for (let x = f.x0; x <= f.x1; x++) if (isMajorLine(x, mx)) { const px = Math.round(ox + x * z) + 0.5; g.moveTo(px, top); g.lineTo(px, bottom); }
  for (let y = f.y0; y <= f.y1; y++) if (isMajorLine(y, my)) { const py = Math.round(oy + y * z) + 0.5; g.moveTo(left, py); g.lineTo(right, py); }
  g.stroke();
  g.strokeStyle = theme.grid.border;
  g.strokeRect(ox + 0.5, oy + 0.5, p.w * z, p.h * z);
}

/** Backstitch and French knots — drawn above the grid so they read clearly. Only those near the frame's cells. */
export function drawLines(g: Ctx, p: Pattern, palette: Palette, f: ChartFrame, style: CellStyle, alpha = 1) {
  const { z, ox, oy } = f, hidden = style.hidden;
  const x0 = f.x0 - 1, y0 = f.y0 - 1, x1 = f.x1 + 1, y1 = f.y1 + 1;
  // every layer that is lines (backstitch, stamps), in registry order
  for (const l of LAYERS) {
    if (!l.lines || (l.group && hidden?.has(l.group))) continue;
    for (const s of l.lines(l.get(p.layers), p)) {
      if (Math.max(s.x1, s.x2) < x0 || Math.min(s.x1, s.x2) > x1 || Math.max(s.y1, s.y2) < y0 || Math.min(s.y1, s.y2) > y1) continue;
      const slot = palette[s.k];
      if (slot) drawBackstitch(g, ox + s.x1 * z, oy + s.y1 * z, ox + s.x2 * z, oy + s.y2 * z, z, slot, style, alpha);
    }
  }
  for (const k of p.layers.knots) {
    if (k.x < x0 || k.x > x1 || k.y < y0 || k.y > y1) continue;
    const slot = palette[k.k];
    if (slot && !hidden?.has(pointGroup(slot))) drawKnot(g, ox + k.x * z, oy + k.y * z, z, slot, style, alpha);
  }
}
