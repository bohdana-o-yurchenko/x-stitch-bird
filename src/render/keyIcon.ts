import type { PaletteSlot } from "@/core/pattern/palette";
import { viewStyle, type ChartView } from "./chart";
import { drawBackstitch, drawBeadCell, drawKnot, drawStitchCell, drawSymbol, type Ctx } from "./primitives/cells";
import type { CanvasTheme } from "./theme";

/** Small sample of a key entry: a stitch, bead, backstitch line or knot with its symbol. */
export function drawKeyIcon(g: Ctx, slot: PaletteSlot, size: number, view: ChartView, theme: CanvasTheme, fabric: string) {
  const style = viewStyle(view === "color" ? "both" : view, theme);
  g.fillStyle = style.showColour ? fabric : "#fff";
  g.fillRect(0, 0, size, size);
  if (slot.t === "bead") drawBeadCell(g, 0, 0, size, slot, style);
  else if (slot.t === "back") {
    drawBackstitch(g, size * 0.15, size * 0.85, size * 0.85, size * 0.15, size * 0.9, slot, style);
    g.globalAlpha = 0.9;
    drawSymbol(g, size * 0.75, size * 0.25, size * 0.5, slot.sym, theme.symbols.darkInk, 0.7, theme, true);
    g.globalAlpha = 1;
  } else if (slot.t === "knot") {
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
