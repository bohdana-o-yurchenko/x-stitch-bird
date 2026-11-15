import { rulerLabels } from "@/core/grid/numbering";
import type { Palette } from "@/core/pattern/palette";
import type { KeyIndex, PartialStitch, Pattern, Point, Rect, Segment } from "@/core/pattern/types";
import type { MirrorMode } from "@/core/transform/mirror";
import { drawCells, drawGrid, drawLines, drawUnderlay, turnAround, viewStyle, type ChartFrame, type ChartView, type UnderlayView } from "./chart";
import { drawBackstitch, drawBeadCell, drawKnot, drawPartial, drawStitchCell } from "./primitives/cells";
import { font, type CanvasTheme } from "./theme";

export interface Viewport {
  zoom: number;
  offX: number;
  offY: number;
}

/** Everything the screen shows, prepared by the editor. Drawing never reads editor state directly. */
export interface ChartScene {
  pattern: Pattern;
  palette: Palette;
  view: ChartView;
  viewport: Viewport;
  mirror: MirrorMode;
  /** Hover square: cell and brush size; null hides it. */
  hover: { x: number; y: number; size: number } | null;
  preview: { cells: number[]; key: KeyIndex } | null;
  partialPreview: { cell: number; stitch: PartialStitch } | null;
  knotPreview: { point: Point; key: KeyIndex } | null;
  chain: { last: Point; hover: Point | null; key: KeyIndex } | null;
  hoverPoint: Point | null;
  selection: { mask: Uint8Array; bounds: Rect } | null;
  floating: { pattern: Pattern; palette: Palette; at: Point } | null;
  marquee: Rect | null;
  eraseHighlight: Segment[] | null;
  flash: { cell: number; until: number } | null;
  /** Behind: drawn under the stitches. Editing: drawn on top with handles. */
  underlay: (UnderlayView & { editing: boolean }) | null;
  /** Zoomed-in edit frame for the underlay, in canvas px (SPEC §15.15). */
  underlayFrame: Rect | null;
  /** The frame's side ("n", "e", …) or corner ("ne", …) to highlight. */
  underlayHot: string | null;
  /** ↺ ↻ buttons for the underlay, in canvas px. */
  underlayButtons: { x: number; y: number; dir: -1 | 1 }[];
  /** Only this entry at full strength, the rest faded (stitch highlighting). */
  highlight: KeyIndex | null;
  /** Chart checks: every finding's cells (thin outline), the current one's cells (a ring). */
  checks: { all: number[][]; current: number[] | null } | null;
  /** Symbol matching: the block (outlined; `chosen` once read) and its proposals, drawn faintly. */
  match: { block: Rect; chosen: boolean; ghosts: Pattern | null } | null;
}

export const RULER_SIZE = 26;

export class ChartRenderer {
  private g: CanvasRenderingContext2D;
  private width = 0;
  private height = 0;
  private dpr = 1;
  private frameRequested = false;
  private ants = 0;
  private tickTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private canvas: HTMLCanvasElement, private theme: CanvasTheme, private getScene: () => ChartScene) {
    this.g = canvas.getContext("2d")!;
  }

  resize(width: number, height: number, dpr: number) {
    this.width = width;
    this.height = height;
    this.dpr = dpr;
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.draw();
  }

  setTheme(theme: CanvasTheme) {
    this.theme = theme;
    this.request();
  }

  /** Coalesces redraws into one animation frame. */
  request() {
    if (this.frameRequested) return;
    this.frameRequested = true;
    requestAnimationFrame(() => {
      this.frameRequested = false;
      this.draw();
    });
  }

  private frame(s: ChartScene): ChartFrame {
    const { zoom: z, offX, offY } = s.viewport, R = this.theme.rulers.size, p = s.pattern;
    const ox = offX + R, oy = offY + R;
    return {
      z, ox, oy,
      x0: Math.max(0, Math.floor(-offX / z)), y0: Math.max(0, Math.floor(-offY / z)),
      x1: Math.min(p.w, Math.ceil((this.width - ox) / z)), y1: Math.min(p.h, Math.ceil((this.height - oy) / z)),
    };
  }

  draw() {
    const s = this.getScene(), g = this.g, t = this.theme, p = s.pattern;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.fillStyle = t.stageBackground;
    g.fillRect(0, 0, this.width, this.height);
    const f = this.frame(s), style = viewStyle(s.view, t), { z, ox, oy } = f;

    const behind = s.underlay && !s.underlay.editing ? s.underlay : undefined;
    const hl = s.highlight && s.palette[s.highlight] ? s.highlight : null;
    // highlighting: everything else is drawn faded, then the highlighted entry on top at full strength
    const others = hl ? s.palette.map((slot, k) => (k === hl ? undefined : slot)) : s.palette;
    const only = hl ? s.palette.map((slot, k) => (k === hl ? slot : undefined)) : null;
    if (hl) {
      drawCells(g, p, [], f, style, true, behind);
      g.globalAlpha = t.highlight.dimAlpha;
      drawCells(g, p, others, f, style, false);
      g.globalAlpha = 1;
      drawCells(g, p, only!, f, style, false);
    } else drawCells(g, p, s.palette, f, style, true, behind);
    if (s.preview) {
      g.globalAlpha = t.preview.alpha;
      const slot = s.palette[s.preview.key];
      if (slot)
        for (const i of s.preview.cells) {
          const px = ox + (i % p.w) * z, py = oy + ((i / p.w) | 0) * z, ps = { ...style, showColour: true, showSymbol: false };
          if (slot.t === "bead") drawBeadCell(g, px, py, z, slot, ps);
          else drawStitchCell(g, px, py, z, slot, ps);
        }
      g.globalAlpha = 1;
    }
    if (s.partialPreview) {
      const slot = s.palette[s.partialPreview.stitch.k], i = s.partialPreview.cell;
      g.globalAlpha = t.preview.alpha;
      if (slot) drawPartial(g, ox + (i % p.w) * z, oy + ((i / p.w) | 0) * z, z, s.partialPreview.stitch, slot, { ...style, showColour: true });
      g.globalAlpha = 1;
    }
    drawGrid(g, p, f, t, s.view === "symbols");
    if (hl) {
      drawLines(g, p, others, f, style, t.highlight.dimAlpha);
      drawLines(g, p, only!, f, style);
    } else drawLines(g, p, s.palette, f, style);
    if (s.underlay?.editing) this.drawUnderlayEditor(s.underlay, p, f);
    if (s.underlayFrame) this.drawEditFrame(s.underlayFrame, s.underlayHot);
    for (const b of s.underlayButtons) this.drawRotateButton(b.x, b.y, b.dir);
    this.drawOverlays(s, f);
    this.drawRulers(s, f);
    const flashing = !!s.flash && s.flash.until > Date.now();
    if (s.selection || s.floating || flashing) this.tick(flashing ? 40 : 120);
  }

  /** One pending animation timer at most (marching ants, go-to flash). */
  private tick(ms: number) {
    if (this.tickTimer) return;
    this.tickTimer = setTimeout(() => {
      this.tickTimer = null;
      this.ants = (this.ants + 1) % 64;
      this.request();
    }, ms);
  }

  private drawOverlays(s: ChartScene, f: ChartFrame) {
    const g = this.g, t = this.theme, p = s.pattern, { z, ox, oy } = f;
    const cellRect = (i: number) => [ox + (i % p.w) * z, oy + ((i / p.w) | 0) * z] as const;

    if (z >= t.ambiguous.minZoom && p.layers.ambiguous.size) {
      g.fillStyle = t.accent;
      for (const i of p.layers.ambiguous) {
        const [px, py] = cellRect(i), c = z * t.ambiguous.corner;
        g.beginPath();
        g.moveTo(px + z - c, py);
        g.lineTo(px + z, py);
        g.lineTo(px + z, py + c);
        g.closePath();
        g.fill();
      }
    }
    if (s.eraseHighlight) {
      g.save();
      g.lineCap = "round";
      g.strokeStyle = t.eraser.highlight;
      g.lineWidth = Math.max(t.eraser.minWidth, z * t.eraser.width);
      g.beginPath();
      for (const seg of s.eraseHighlight) {
        g.moveTo(ox + seg.x1 * z, oy + seg.y1 * z);
        g.lineTo(ox + seg.x2 * z, oy + seg.y2 * z);
      }
      g.stroke();
      g.restore();
    }
    if (s.chain && s.chain.hover) {
      const slot = s.palette[s.chain.key];
      if (slot) drawBackstitch(g, ox + s.chain.last.x * z, oy + s.chain.last.y * z, ox + s.chain.hover.x * z, oy + s.chain.hover.y * z, z, slot, viewStyle("both", t), t.preview.alpha);
    }
    if (s.knotPreview) {
      const slot = s.palette[s.knotPreview.key];
      if (slot) drawKnot(g, ox + s.knotPreview.point.x * z, oy + s.knotPreview.point.y * z, z, slot, viewStyle(s.view, t), t.preview.alpha);
    }
    if (s.hoverPoint) {
      g.fillStyle = t.accent;
      g.beginPath();
      g.arc(ox + s.hoverPoint.x * z, oy + s.hoverPoint.y * z, Math.max(3, z * 0.12), 0, Math.PI * 2);
      g.fill();
    }
    if (s.chain) {
      g.strokeStyle = t.accent;
      g.lineWidth = 1.5;
      g.beginPath();
      g.arc(ox + s.chain.last.x * z, oy + s.chain.last.y * z, Math.max(4, z * 0.18), 0, Math.PI * 2);
      g.stroke();
    }
    if (s.mirror !== "off") {
      g.save();
      g.setLineDash([6, 4]);
      g.strokeStyle = t.accent;
      g.lineWidth = 2;
      g.beginPath();
      if (s.mirror !== "horizontal") { g.moveTo(ox + (p.w * z) / 2, oy); g.lineTo(ox + (p.w * z) / 2, oy + p.h * z); }
      if (s.mirror !== "vertical") { g.moveTo(ox, oy + (p.h * z) / 2); g.lineTo(ox + p.w * z, oy + (p.h * z) / 2); }
      g.stroke();
      g.restore();
    }
    if (s.selection) this.marchingAnts(s.selection.mask, p.w, p.h, ox, oy, z);
    if (s.floating) {
      const fp = s.floating.pattern, fo = { z, ox: ox + s.floating.at.x * z, oy: oy + s.floating.at.y * z, x0: 0, y0: 0, x1: fp.w, y1: fp.h };
      g.globalAlpha = t.selection.floatingAlpha;
      drawCells(g, fp, s.floating.palette, fo, viewStyle(s.view, t), false);
      drawLines(g, fp, s.floating.palette, fo, viewStyle(s.view, t));
      g.globalAlpha = 1;
      const mask = new Uint8Array(fp.w * fp.h).fill(1);
      this.marchingAnts(mask, fp.w, fp.h, fo.ox, fo.oy, z);
    }
    if (s.marquee) {
      g.save();
      g.setLineDash(t.selection.dash);
      g.strokeStyle = t.selection.ants[0];
      g.strokeRect(ox + s.marquee.x * z + 0.5, oy + s.marquee.y * z + 0.5, s.marquee.w * z, s.marquee.h * z);
      g.restore();
    }
    if (s.checks) this.drawFindings(s.checks, p, f);
    if (s.match) this.drawMatch(s.match, s, f);
    if (s.flash && s.flash.until > Date.now()) {
      const [px, py] = cellRect(s.flash.cell), a = (s.flash.until - Date.now()) / t.flash.durationMs;
      g.fillStyle = `rgba(181,69,47,${0.55 * Math.max(0, Math.min(1, a))})`;
      g.fillRect(px, py, z, z);
    }
    if (s.hover && s.hover.x >= 0 && s.hover.y >= 0 && s.hover.x < p.w && s.hover.y < p.h) {
      const o = Math.floor((s.hover.size - 1) / 2);
      g.strokeStyle = t.accent;
      g.lineWidth = 2;
      g.strokeRect(ox + (s.hover.x - o) * z + 1, oy + (s.hover.y - o) * z + 1, s.hover.size * z - 2, s.hover.size * z - 2);
    }
  }

  /** Symbol matching: the block between heavy lines, and the proposals at half strength. */
  private drawMatch(m: NonNullable<ChartScene["match"]>, s: ChartScene, f: ChartFrame) {
    const g = this.g, t = this.theme, { z, ox, oy } = f, b = m.block;
    if (m.ghosts) {
      const fo = { z, ox: ox + b.x * z, oy: oy + b.y * z, x0: 0, y0: 0, x1: b.w, y1: b.h };
      g.globalAlpha = 0.5;
      drawCells(g, m.ghosts, s.palette, fo, viewStyle(s.view, t), false);
      g.globalAlpha = 1;
    }
    g.save();
    if (!m.chosen) g.setLineDash([6, 4]);
    g.lineWidth = 3;
    g.strokeStyle = "rgba(255,255,255,0.9)";
    g.strokeRect(ox + b.x * z, oy + b.y * z, b.w * z, b.h * z);
    g.lineWidth = 2;
    g.strokeStyle = t.accent;
    g.strokeRect(ox + b.x * z, oy + b.y * z, b.w * z, b.h * z);
    g.restore();
  }

  /** Chart checks: a thin box around every finding, and a ring around the one being looked at. */
  private drawFindings(c: NonNullable<ChartScene["checks"]>, p: Pattern, f: ChartFrame) {
    const g = this.g, t = this.theme, { z, ox, oy } = f;
    const box = (cells: number[]) => {
      const xs = cells.map((i) => i % p.w), ys = cells.map((i) => (i / p.w) | 0);
      const x0 = Math.min(...xs), y0 = Math.min(...ys);
      return { x: ox + x0 * z, y: oy + y0 * z, w: (Math.max(...xs) - x0 + 1) * z, h: (Math.max(...ys) - y0 + 1) * z };
    };
    g.save();
    g.strokeStyle = t.accent;
    g.lineWidth = Math.max(1, Math.min(2, z / 8));
    g.globalAlpha = 0.75;
    for (const cells of c.all) for (const i of cells) {
      const b = box([i]);
      g.strokeRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2);
    }
    if (c.current) {
      g.globalAlpha = 1;
      const b = box(c.current), r = Math.max(b.w, b.h) / 2 + Math.max(6, z * 0.6);
      g.lineWidth = 3;
      g.strokeStyle = "rgba(255,255,255,0.9)";
      g.beginPath();
      g.arc(b.x + b.w / 2, b.y + b.h / 2, r, 0, Math.PI * 2);
      g.stroke();
      g.lineWidth = 2;
      g.strokeStyle = t.accent;
      g.stroke();
    }
    g.restore();
  }

  /** Edit mode: the image above the stitches, its outline and 8 handles. */
  /** A round ↺ / ↻ button (curved arrow) for turning the underlay a little. */
  private drawRotateButton(x: number, y: number, dir: -1 | 1) {
    const g = this.g, t = this.theme, r = t.underlayFrame.rotate;
    g.save();
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fillStyle = "#fff";
    g.fill();
    g.lineWidth = 1.5;
    g.strokeStyle = t.accent;
    g.stroke();
    // a clockwise arc with its arrow head; mirrored for ↺
    g.translate(x, y);
    g.scale(dir, 1);
    const a0 = -Math.PI * 0.85, a1 = Math.PI * 0.35, rr = r * 0.5;
    g.beginPath();
    g.arc(0, 0, rr, a0, a1);
    g.lineWidth = 1.6;
    g.stroke();
    const ex = Math.cos(a1) * rr, ey = Math.sin(a1) * rr, tang = a1 + Math.PI / 2;
    g.beginPath();
    g.moveTo(ex + Math.cos(tang) * 3.2, ey + Math.sin(tang) * 3.2);
    g.lineTo(ex + Math.cos(tang + 2.4) * 3.6, ey + Math.sin(tang + 2.4) * 3.6);
    g.lineTo(ex + Math.cos(tang - 2.4) * 3.6, ey + Math.sin(tang - 2.4) * 3.6);
    g.closePath();
    g.fillStyle = t.accent;
    g.fill();
    g.restore();
  }

  /**
   * A dashed outline with 8 handles, transparent inside so the photo under it stays visible. `hot`: the side or
   * corner a press would take — its side(s) are drawn solid and thick, so it's clear the frame will stretch.
   */
  private drawEditFrame(r: Rect, hot: string | null) {
    const g = this.g, t = this.theme, H = t.underlayFrame.handle;
    g.save();
    g.lineWidth = 3;
    g.strokeStyle = "rgba(255,255,255,0.85)";
    g.strokeRect(r.x, r.y, r.w, r.h);
    g.setLineDash([7, 5]);
    g.lineWidth = 1.5;
    g.strokeStyle = t.accent;
    g.strokeRect(r.x, r.y, r.w, r.h);
    g.setLineDash([]);
    if (hot) {
      const sides: Record<string, [number, number, number, number]> = { n: [r.x, r.y, r.x + r.w, r.y], s: [r.x, r.y + r.h, r.x + r.w, r.y + r.h], w: [r.x, r.y, r.x, r.y + r.h], e: [r.x + r.w, r.y, r.x + r.w, r.y + r.h] };
      g.lineCap = "round";
      for (const [width, colour] of [[7, "rgba(255,255,255,0.9)"], [4, t.accent]] as const) {
        g.lineWidth = width;
        g.strokeStyle = colour;
        g.beginPath();
        for (const side of hot) {
          const [x1, y1, x2, y2] = sides[side]!;
          g.moveTo(x1, y1);
          g.lineTo(x2, y2);
        }
        g.stroke();
      }
      g.lineWidth = 1;
    }
    for (const [hx, hy] of [[0, 0], [0.5, 0], [1, 0], [1, 0.5], [1, 1], [0.5, 1], [0, 1], [0, 0.5]] as const) {
      const x = r.x + hx * r.w - H / 2, y = r.y + hy * r.h - H / 2;
      g.fillStyle = t.accent;
      g.fillRect(x, y, H, H);
      g.strokeStyle = "#fff";
      g.strokeRect(x + 0.5, y + 0.5, H - 1, H - 1);
    }
    g.restore();
  }

  private drawUnderlayEditor(u: UnderlayView, p: Pattern, f: ChartFrame) {
    const g = this.g, t = this.theme, { z, ox, oy } = f;
    drawUnderlay(g, p, u, f, false);
    const x = ox + u.rect.x * z, y = oy + u.rect.y * z, w = u.rect.w * z, h = u.rect.h * z;
    g.save();
    turnAround(g, u, f);
    g.setLineDash(t.selection.dash);
    g.lineWidth = 1.5;
    g.strokeStyle = t.accent;
    g.strokeRect(x + 0.5, y + 0.5, w, h);
    g.setLineDash([]);
    g.fillStyle = "#fff";
    for (const [hx, hy] of [[0, 0], [0.5, 0], [1, 0], [1, 0.5], [1, 1], [0.5, 1], [0, 1], [0, 0.5]] as const) {
      g.fillRect(x + hx * w - 4, y + hy * h - 4, 8, 8);
      g.strokeRect(x + hx * w - 4 + 0.5, y + hy * h - 4 + 0.5, 8, 8);
    }
    g.restore();
  }

  /** Dashed outline around masked cells, animated. */
  private marchingAnts(mask: Uint8Array, w: number, h: number, ox: number, oy: number, z: number) {
    const g = this.g, t = this.theme;
    g.beginPath();
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        if (!mask[y * w + x]) continue;
        const px = ox + x * z, py = oy + y * z;
        if (y === 0 || !mask[(y - 1) * w + x]) { g.moveTo(px, py); g.lineTo(px + z, py); }
        if (y === h - 1 || !mask[(y + 1) * w + x]) { g.moveTo(px, py + z); g.lineTo(px + z, py + z); }
        if (x === 0 || !mask[y * w + x - 1]) { g.moveTo(px, py); g.lineTo(px, py + z); }
        if (x === w - 1 || !mask[y * w + x + 1]) { g.moveTo(px + z, py); g.lineTo(px + z, py + z); }
      }
    g.save();
    g.lineWidth = 1.5;
    g.setLineDash(t.selection.dash);
    g.strokeStyle = t.selection.ants[1];
    g.lineDashOffset = 0;
    g.stroke();
    g.strokeStyle = t.selection.ants[0];
    g.lineDashOffset = -this.ants;
    g.stroke();
    g.restore();
  }

  private drawRulers(s: ChartScene, f: ChartFrame) {
    const g = this.g, t = this.theme, R = t.rulers.size, p = s.pattern, { z, ox, oy } = f;
    g.fillStyle = t.rulers.background;
    g.fillRect(0, 0, this.width, R);
    g.fillRect(0, 0, R, this.height);
    g.fillStyle = t.rulers.text;
    g.font = font(t, 500, 10.5);
    g.textBaseline = "middle";
    g.textAlign = "center";
    const base = p.grid.label;
    const step = z >= 4 ? base : z >= 2 ? base * 2 : base * 5;
    const size = { w: p.w, h: p.h };
    for (const l of rulerLabels(p.grid, "x", size, step)) {
      const px = ox + l.at * z;
      if (px < R - 2 || px > this.width) continue;
      g.fillText(String(l.text), px, R / 2);
      g.fillRect(px, R - 5, 1, 5);
    }
    for (const l of rulerLabels(p.grid, "y", size, step)) {
      const py = oy + l.at * z;
      if (py < R - 2 || py > this.height) continue;
      g.save();
      g.translate(R / 2, py);
      g.rotate(-Math.PI / 2);
      g.fillText(String(l.text), 0, 0);
      g.restore();
      g.fillRect(R - 5, py, 5, 1);
    }
    g.fillStyle = t.accent;
    const cx = ox + (p.w * z) / 2, cy = oy + (p.h * z) / 2;
    if (cx > R) { g.beginPath(); g.moveTo(cx - 5, R - 8); g.lineTo(cx + 5, R - 8); g.lineTo(cx, R - 1); g.fill(); }
    if (cy > R) { g.beginPath(); g.moveTo(R - 8, cy - 5); g.lineTo(R - 8, cy + 5); g.lineTo(R - 1, cy); g.fill(); }
    g.fillStyle = t.rulers.background;
    g.fillRect(0, 0, R, R);
    g.strokeStyle = t.rulers.line;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(0, R + 0.5);
    g.lineTo(this.width, R + 0.5);
    g.moveTo(R + 0.5, 0);
    g.lineTo(R + 0.5, this.height);
    g.stroke();
  }
}
