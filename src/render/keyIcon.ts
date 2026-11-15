import { visibleOn } from "@/core/color/colorMath";
import type { PaletteSlot } from "@/core/pattern/palette";
import { viewStyle, type ChartView } from "./chart";
import { drawBackstitch, drawBeadCell, drawKnot, drawStitchCell, drawSymbol, type Ctx } from "./primitives/cells";
import { strokeLineStyle } from "./primitives/lineStyles";
import type { CanvasTheme } from "./theme";

/**
 * Small sample of a key entry: a stitch, bead, backstitch line (in its line style) or knot with its symbol.
 * Stitches are drawn on the fabric colour, unless the floss would vanish on it (white on white): then on a
 * contrasting tile, so a half cross still reads as a half cross. Lines, knots and beads carry their own outlines.
 */
export function drawKeyIcon(g: Ctx, slot: PaletteSlot, size: number, view: ChartView, theme: CanvasTheme, fabric: string) {
  const style = viewStyle(view === "color" ? "both" : view, theme);
  const stitch = slot.t === "thread" || slot.t === "combo";
  g.fillStyle = !style.showColour ? "#fff" : stitch ? visibleOn(fabric, slot.hex, theme.keyIcon) : fabric;
  g.fillRect(0, 0, size, size);
  if (slot.t === "bead") drawBeadCell(g, 0, 0, size, slot, style);
  else if (slot.t === "back") drawBackstitch(g, size * 0.12, size * 0.88, size * 0.88, size * 0.12, size * 0.8, slot, viewStyle(view, theme));
  else if (slot.t === "knot") {
    drawKnot(g, size * 0.5, size * 0.5, size * 1.4, slot, { ...style, showSymbol: false });
    if (slot.sym) drawSymbol(g, size * 0.78, size * 0.22, size * 0.5, slot.sym, theme.symbols.darkInk, 0.7, theme, true);
  } else if (slot.t === "combo" && slot.bead && view === "color") {
    // Colour view draws floss + bead as a bead, so the key adds the symbol to tell entries apart
    drawStitchCell(g, 0, 0, size, slot, { ...style, showSymbol: false });
    drawSymbol(g, size / 2, size / 2, size, slot.sym, slot.bead.ink, theme.symbols.scale.combo, theme);
  } else drawStitchCell(g, 0, 0, size, slot, style);
}

export function keyIconCanvas(slot: PaletteSlot, size: number, view: ChartView, theme: CanvasTheme, fabric: string, dpr = 1): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = Math.round(size * dpr);
  c.style.width = c.style.height = `${size}px`;
  const g = c.getContext("2d")!;
  g.scale(dpr, dpr);
  drawKeyIcon(g, slot, size, view, theme, fabric);
  return c;
}

/** A line style on its own, for the backstitch style picker; `color` is the interface's text colour (light or dark theme). */
export function drawLineStyleSample(g: Ctx, sym: string, w: number, h: number, color: string) {
  g.clearRect(0, 0, w, h);
  g.strokeStyle = color;
  strokeLineStyle(g, h * 0.3, h / 2, w - h * 0.3, h / 2, Math.max(1.5, h * 0.09), Math.max(2, h * 0.075), sym);
}
