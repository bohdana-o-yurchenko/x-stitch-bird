import { shade } from "@/core/color/colorMath";
import { isMajorLine, majorOffset } from "@/core/grid/numbering";
import type { Palette } from "@/core/pattern/palette";
import type { Pattern, Rect } from "@/core/pattern/types";
import { drawBackstitch, drawBeadCell, drawKnot, drawPartial, drawStitchCell, type CellStyle, type Ctx } from "./primitives/cells";
import type { CanvasTheme } from "./theme";

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

/** Fabric, (underlay,) crosses, partial stitches and beads — everything below the grid. */
export function drawCells(g: Ctx, p: Pattern, palette: Palette, f: ChartFrame, style: CellStyle, withFabric = true, underlay?: UnderlayView) {
  const { z, ox, oy } = f, { stitches, beads, partials } = p.layers;
  if (withFabric) {
    g.fillStyle = style.showColour ? p.fabric : "#FFFFFF";
    g.fillRect(ox, oy, p.w * z, p.h * z);
    if (style.stitched) fabricHoles(g, p, f);
  }
  if (underlay) drawUnderlay(g, p, underlay, f, true);
  for (let y = f.y0; y < f.y1; y++)
    for (let x = f.x0; x < f.x1; x++) {
      const i = y * p.w + x, s = palette[stitches[i] ?? 0];
      if (s) drawStitchCell(g, ox + x * z, oy + y * z, z, s, { ...style, showSymbol: style.showSymbol && !beads[i] });
    }
  for (const [i, list] of partials) {
    const x = i % p.w, y = (i / p.w) | 0;
    if (x < f.x0 || x >= f.x1 || y < f.y0 || y >= f.y1) continue;
    for (const ps of list) {
      const s = palette[ps.k];
      if (s) drawPartial(g, ox + x * z, oy + y * z, z, ps, s, style);
    }
  }
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

/** Backstitch and French knots — drawn above the grid so they read clearly. */
export function drawLines(g: Ctx, p: Pattern, palette: Palette, f: ChartFrame, style: CellStyle, alpha = 1) {
  const { z, ox, oy } = f;
  for (const s of p.layers.segments) {
    const slot = palette[s.k];
    if (slot) drawBackstitch(g, ox + s.x1 * z, oy + s.y1 * z, ox + s.x2 * z, oy + s.y2 * z, z, slot, style, alpha);
  }
  for (const k of p.layers.knots) {
    const slot = palette[k.k];
    if (slot) drawKnot(g, ox + k.x * z, oy + k.y * z, z, slot, style, alpha);
  }
}
