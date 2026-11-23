import type { ChartGroup } from "@/core/pattern/groups";
import { hexToRgb, luma, shade } from "@/core/color/colorMath";
import type { BeadShape } from "@/core/catalog/beadShapes";
import type { PaletteSlot } from "@/core/pattern/palette";
import type { PartialStitch } from "@/core/pattern/types";
import { partialAnchor, partialKind } from "@/core/stitches/partialKinds";
import { shapeSymbol } from "@/core/symbols/shapes";
import { font, type CanvasTheme } from "../theme";
import { drawShape } from "./symbolArt";
import { strokeLineStyle } from "./lineStyles";

export type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface CellStyle {
  theme: CanvasTheme;
  showColour: boolean;
  showSymbol: boolean;
  /** Crosses drawn as embroidered thread (the stitched preview), not as flat colour. */
  stitched?: boolean;
  /** Symbol-only views: the ink of each entry's symbol where it isn't the theme's dark ink (the printed chart's red, green, blue). */
  symbolInks?: ReadonlyMap<PaletteSlot, string>;
  /** Kinds of stitches not drawn (SPEC §15.16). */
  hidden?: ReadonlySet<ChartGroup>;
}

/** The ink of an entry's symbol when the symbol is drawn without its colour. */
export const darkInk = (s: PaletteSlot, style: CellStyle) => style.symbolInks?.get(s) ?? style.theme.symbols.darkInk;

/** A chart symbol: a vector shape (`sym:…`) or a character in the app's font, about `z * scale` px tall. */
export function drawSymbol(g: Ctx, cx: number, cy: number, z: number, ch: string, color: string, scale: number, theme: CanvasTheme, halo = false) {
  const shape = shapeSymbol(ch);
  if (shape) {
    const size = Math.max(6, z * scale) * theme.symbols.shapeSize;
    return drawShape(g, shape, cx, cy, size, color, halo ? { color: theme.symbols.halo, width: Math.max(1, z * 0.06) } : null);
  }
  g.font = font(theme, 600, Math.max(6, Math.floor(z * scale)));
  g.textAlign = "center";
  g.textBaseline = "middle";
  const y = cy + z * 0.03;
  if (halo) {
    g.lineWidth = Math.max(2, z * 0.12);
    g.strokeStyle = theme.symbols.halo;
    g.lineJoin = "round";
    g.strokeText(ch, cx, y);
  }
  g.fillStyle = color;
  g.fillText(ch, cx, y);
}

export function beadPath(g: Ctx, cx: number, cy: number, z: number, sh: BeadShape) {
  g.beginPath();
  if (sh.bugle) {
    const L = (z * sh.bugle) / 2, t = z * 0.2;
    g.moveTo(cx - L + t, cy - t);
    g.lineTo(cx + L - t, cy - t);
    g.arc(cx + L - t, cy, t, -Math.PI / 2, Math.PI / 2);
    g.lineTo(cx - L + t, cy + t);
    g.arc(cx - L + t, cy, t, Math.PI / 2, Math.PI * 1.5);
    g.closePath();
  } else g.arc(cx, cy, z * (sh.r ?? 0.4), 0, Math.PI * 2);
}

export function drawBeadShape(g: Ctx, px: number, py: number, z: number, hex: string, sh: BeadShape, { theme, showColour }: CellStyle) {
  const cx = px + z / 2, cy = py + z / 2, r = sh.bugle ? (z * sh.bugle) / 2 : z * (sh.r ?? 0.4);
  beadPath(g, cx, cy, z, sh);
  if (showColour) {
    const gr = g.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.1, cx, cy, r);
    gr.addColorStop(0, theme.bead.highlight);
    gr.addColorStop(0.35, hex);
    gr.addColorStop(1, shade(hex, theme.bead.shade));
    g.fillStyle = gr;
  } else g.fillStyle = "#fff";
  g.fill();
  g.lineWidth = Math.max(1, z / 14);
  g.strokeStyle = theme.bead.outline;
  g.stroke();
  if (z >= 6 && !sh.bugle) {
    g.beginPath();
    g.arc(cx, cy, r * 0.28, 0, Math.PI * 2);
    g.fillStyle = showColour ? theme.bead.hole : theme.bead.holeSymbols;
    g.fill();
  }
}

/** A cell of the stitch layer: full or half cross, plus the bead of a floss + bead combo (SPEC §5). */
export function drawStitchCell(g: Ctx, px: number, py: number, z: number, s: PaletteSlot, style: CellStyle) {
  const { theme, showColour, showSymbol } = style;
  if (style.stitched) drawThreadLegs(g, px, py, z, s.hex, s.st === "full" ? ["up", "down"] : [s.st === "half" ? "up" : "down"]);
  else if (s.st === "full") {
    if (showColour) {
      g.fillStyle = s.hex;
      g.fillRect(px, py, z, z);
    }
  } else {
    g.save();
    g.beginPath();
    g.rect(px, py, z, z);
    g.clip();
    g.strokeStyle = showColour ? s.hex : theme.halfStitch.symbolColor;
    g.lineWidth = Math.max(1.2, z * (showColour ? theme.halfStitch.colorWidth : theme.halfStitch.symbolWidth));
    g.lineCap = "butt";
    g.beginPath();
    if (s.st === "half") {
      g.moveTo(px - 1, py + z + 1);
      g.lineTo(px + z + 1, py - 1);
    } else {
      g.moveTo(px - 1, py - 1);
      g.lineTo(px + z + 1, py + z + 1);
    }
    g.stroke();
    g.restore();
  }
  const symOk = showSymbol && z >= theme.symbols.minZoom;
  // floss + bead: the bead is drawn only when no symbol is shown; with a symbol it looks like a plain cross stitch
  if (s.t === "combo" && s.bead && !symOk) {
    const sh = s.bead.shape;
    drawBeadShape(g, px, py, z, s.bead.hex, sh.bugle ? sh : { ...sh, r: (sh.r ?? 0.4) * theme.bead.comboScale }, style);
    return;
  }
  if (!symOk) return;
  if (s.st === "full") drawSymbol(g, px + z / 2, py + z / 2, z, s.sym, showColour ? s.ink : darkInk(s, style), theme.symbols.scale.full, theme);
  else drawSymbol(g, px + z / 2, py + z / 2, z, s.sym, darkInk(s, style), theme.symbols.scale.half, theme, true);
}

/**
 * Legs of a cross as embroidered (the stitched preview). Each leg is as wide as it takes for a full cross to cover
 * ~95% of the cell (0.39 of the cell each side of the diagonal), cut at the cell's edges; two strands with their
 * twist; shaded round across like a thread. The legs catch the light differently: the top one (drawn last) is
 * brighter and casts a soft shadow on the one below. `up` = ╱, `down` = ╲.
 */
export function drawThreadLegs(g: Ctx, px: number, py: number, z: number, hex: string, legs: ("up" | "down")[]) {
  const hw = (0.39 / Math.SQRT2) * z, L = z * Math.SQRT2;
  g.save();
  g.beginPath();
  g.rect(px, py, z, z);
  g.clip();
  g.translate(px + z / 2, py + z / 2);
  legs.forEach((leg, i) => {
    // a half cross lies on the fabric with nothing over it: lit like a top leg
    const lit = legs.length === 1 || i > 0, base = shade(hex, lit ? 0.05 : -0.14);
    g.save();
    g.rotate(leg === "up" ? -Math.PI / 4 : Math.PI / 4);
    if (i > 0) {
      g.fillStyle = "rgba(0,0,0,.2)";
      g.fillRect(-L / 2, -hw - z * 0.05, L, 2 * hw + z * 0.1);
    }
    const round = g.createLinearGradient(0, -hw, 0, hw);
    round.addColorStop(0, shade(base, -0.32));
    round.addColorStop(0.28, lit ? shade(base, 0.2) : shade(base, 0.06));
    round.addColorStop(0.6, base);
    round.addColorStop(1, shade(base, -0.38));
    g.fillStyle = round;
    g.fillRect(-L / 2, -hw, L, 2 * hw);
    if (z >= 8) {
      // floss: two strands, each twisted — fine slanted marks with a glint beside them, and a groove between
      const step = Math.max(2.5, hw * 0.5), dark = shade(base, -0.5), light = shade(base, 0.45);
      g.lineWidth = Math.max(0.5, z * 0.022);
      for (const [v0, v1] of [[-hw, 0], [0, hw]] as const)
        for (let u = -L / 2 - step; u < L / 2 + step; u += step) {
          const slant = (v1 - v0) * 0.9;
          g.strokeStyle = dark;
          g.globalAlpha = 0.22;
          g.beginPath();
          g.moveTo(u, v0);
          g.lineTo(u + slant, v1);
          g.stroke();
          g.strokeStyle = light;
          g.globalAlpha = lit ? 0.2 : 0.1;
          g.beginPath();
          g.moveTo(u + step * 0.4, v0);
          g.lineTo(u + step * 0.4 + slant, v1);
          g.stroke();
        }
      g.globalAlpha = 0.3;
      g.strokeStyle = dark;
      g.beginPath();
      g.moveTo(-L / 2, 0);
      g.lineTo(L / 2, 0);
      g.stroke();
      g.globalAlpha = 1;
    }
    g.restore();
  });
  g.restore();
}

export function drawBeadCell(g: Ctx, px: number, py: number, z: number, s: PaletteSlot, style: CellStyle) {
  if (!s.bead) return;
  drawBeadShape(g, px, py, z, s.bead.hex, s.bead.shape, style);
  if (style.showSymbol && z >= style.theme.symbols.minZoom)
    drawSymbol(g, px + z / 2, py + z / 2, z, s.sym, style.showColour ? s.bead.ink : darkInk(s, style), style.theme.symbols.scale.bead, style.theme);
}

/** Quarter, three-quarter or petite stitch: filled shape in colour views, outline + small symbol otherwise. */
export function drawPartial(g: Ctx, px: number, py: number, z: number, ps: PartialStitch, s: PaletteSlot, style: CellStyle) {
  const { theme, showColour, showSymbol } = style;
  const poly = partialKind(ps.kind).polygon(ps.corner);
  g.beginPath();
  poly.forEach(([x, y], i) => (i ? g.lineTo(px + x * z, py + y * z) : g.moveTo(px + x * z, py + y * z)));
  g.closePath();
  g.fillStyle = showColour ? s.hex : theme.partials.symbolsFill;
  g.fill();
  if (!showColour || ps.kind === "threeQuarter") {
    g.lineWidth = 1;
    g.strokeStyle = theme.partials.splitLine;
    g.stroke();
  }
  if (showSymbol && z >= theme.symbols.minZoom) {
    const [ax, ay] = partialAnchor(ps.kind, ps.corner);
    drawSymbol(g, px + ax * z, py + ay * z, z, s.sym, showColour ? s.ink : darkInk(s, style), theme.symbols.scale.partial, theme, !showColour);
  }
}

export function backstitchColour(hex: string, theme: CanvasTheme): string {
  return luma(hexToRgb(hex)) > theme.backstitch.lightThreshold ? shade(hex, theme.backstitch.darken) : hex;
}

/** 1 strand is 1×, 2 strands add `first`, each further strand adds `step` of the previous addition: 2×, 2.5×, 2.75× … */
export const strandFactor = (n: number, first: number, step: number) => 1 + (first * (1 - step ** (Math.max(1, n) - 1))) / (1 - step);

/** Colour view: solid line, thicker with more strands. Symbols view: the entry's line style. Both: styled, coloured and sized. */
export function drawBackstitch(g: Ctx, x1: number, y1: number, x2: number, y2: number, z: number, s: PaletteSlot, style: CellStyle, alpha = 1) {
  const { theme } = style, b = theme.backstitch;
  const w = Math.max(b.minWidth, z * b.width) * (style.showColour ? strandFactor(s.n, b.strandFirst, b.strandStep) : 1);
  g.save();
  g.globalAlpha = alpha;
  // Colour views: the floss; Symbols view: the entry's own line colour (black unless chosen)
  g.strokeStyle = style.showColour ? backstitchColour(s.hex, theme) : (s.lineInk ?? b.symbolsColor);
  strokeLineStyle(g, x1, y1, x2, y2, w, Math.max(2, z * b.patternUnit), style.showSymbol ? s.sym : "line:solid");
  g.restore();
}

/** French knot: a dot with a highlight; symbols view shows a black dot or the entry's symbol. */
/**
 * A floss + bead sewn on a grid point, like a knot: a short tacking stitch in the floss under the bead, the bead
 * centred on the point, its symbol on it when there is room.
 */
export function drawPointBead(g: Ctx, cx: number, cy: number, z: number, s: PaletteSlot, style: CellStyle, alpha = 1) {
  if (!s.bead) return;
  const { theme, showColour, showSymbol } = style;
  g.save();
  g.globalAlpha = alpha;
  // floss + bead shows its tacking stitch; a plain bead is sewn with a thread nobody sees
  if (s.t === "combo") {
    g.strokeStyle = showColour ? s.hex : theme.halfStitch.symbolColor;
    g.lineWidth = Math.max(1, z * 0.08);
    g.lineCap = "round";
    g.beginPath();
    g.moveTo(cx - z * 0.32, cy + z * 0.32);
    g.lineTo(cx + z * 0.32, cy - z * 0.32);
    g.stroke();
  }
  drawBeadShape(g, cx - z / 2, cy - z / 2, z, s.bead.hex, s.bead.shape, style);
  if (showSymbol && z >= theme.symbols.minZoom) drawSymbol(g, cx, cy, z, s.sym, showColour ? s.bead.ink : darkInk(s, style), theme.symbols.scale.bead, theme);
  g.restore();
}

export function drawKnot(g: Ctx, cx: number, cy: number, z: number, s: PaletteSlot, style: CellStyle, alpha = 1) {
  if (s.t === "combo" || s.t === "bead") return drawPointBead(g, cx, cy, z, s, style, alpha);
  const { theme, showColour, showSymbol } = style, r = Math.max(2, z * theme.knots.radius);
  g.save();
  g.globalAlpha = alpha;
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  if (showColour) {
    const gr = g.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r);
    gr.addColorStop(0, theme.bead.highlight);
    gr.addColorStop(0.4, s.hex);
    gr.addColorStop(1, shade(s.hex, -0.3));
    g.fillStyle = gr;
  } else g.fillStyle = s.sym ? "#fff" : theme.knots.symbolsDot;
  g.fill();
  g.lineWidth = Math.max(1, z / 16);
  g.strokeStyle = theme.knots.outline;
  g.stroke();
  if (s.sym && showSymbol && z >= theme.symbols.minZoom * 1.4) drawSymbol(g, cx, cy, z, s.sym, showColour ? s.ink : darkInk(s, style), 0.32, theme);
  g.restore();
}
