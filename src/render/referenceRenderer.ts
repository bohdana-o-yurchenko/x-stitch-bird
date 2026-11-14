import type { Pattern, Point } from "@/core/pattern/types";
import type { CanvasTheme } from "./theme";

export interface RefView {
  s: number;
  tx: number;
  ty: number;
}

export interface RefScene {
  image: CanvasImageSource & { width: number; height: number };
  marks: CanvasImageSource;
  view: RefView;
  pattern: Pattern;
  grid: boolean;
  showStitched: boolean;
  hoverCell: Point | null;
}

/** A reference photo with marker layer, stitch-grid overlay and "already stitched" shading (SPEC §11.3). */
export function drawReference(g: CanvasRenderingContext2D, width: number, height: number, s: RefScene, theme: CanvasTheme) {
  g.fillStyle = theme.stageBackground;
  g.fillRect(0, 0, width, height);
  const { view: v, image, pattern: p } = s;
  g.save();
  g.translate(v.tx, v.ty);
  g.scale(v.s, v.s);
  g.imageSmoothingEnabled = v.s < 3;
  g.drawImage(image, 0, 0);
  const cw = image.width / p.w, ch = image.height / p.h;
  if (s.showStitched) {
    g.fillStyle = "rgba(181,69,47,.38)";
    g.beginPath();
    for (let y = 0; y < p.h; y++)
      for (let x = 0; x < p.w; x++) {
        const i = y * p.w + x;
        if (p.layers.stitches[i] || p.layers.beads[i] || p.layers.partials.has(i)) g.rect(x * cw, y * ch, cw, ch);
      }
    g.fill();
  }
  g.globalAlpha = 0.5;
  g.drawImage(s.marks, 0, 0);
  g.globalAlpha = 1;
  if (s.grid) {
    if (cw * v.s >= 4) {
      g.strokeStyle = "rgba(0,0,0,.28)";
      g.lineWidth = 1 / v.s;
      g.beginPath();
      for (let x = 1; x < p.w; x++) if (x % 10) { g.moveTo(x * cw, 0); g.lineTo(x * cw, image.height); }
      for (let y = 1; y < p.h; y++) if (y % 10) { g.moveTo(0, y * ch); g.lineTo(image.width, y * ch); }
      g.stroke();
    }
    g.strokeStyle = "rgba(20,10,0,.75)";
    g.lineWidth = 1.6 / v.s;
    g.beginPath();
    for (let x = 0; x <= p.w; x += 10) { g.moveTo(x * cw, 0); g.lineTo(x * cw, image.height); }
    for (let y = 0; y <= p.h; y += 10) { g.moveTo(0, y * ch); g.lineTo(image.width, y * ch); }
    g.stroke();
    g.strokeRect(0, 0, image.width, image.height);
    const h = s.hoverCell;
    if (h && h.x >= 0 && h.y >= 0 && h.x < p.w && h.y < p.h) {
      g.strokeStyle = theme.accent;
      g.lineWidth = 2.5 / v.s;
      g.strokeRect(h.x * cw, h.y * ch, cw, ch);
      g.lineWidth = 1 / v.s;
      g.setLineDash([4 / v.s, 4 / v.s]);
      g.beginPath();
      g.moveTo((h.x + 0.5) * cw, 0); g.lineTo((h.x + 0.5) * cw, h.y * ch);
      g.moveTo((h.x + 0.5) * cw, (h.y + 1) * ch); g.lineTo((h.x + 0.5) * cw, image.height);
      g.moveTo(0, (h.y + 0.5) * ch); g.lineTo(h.x * cw, (h.y + 0.5) * ch);
      g.moveTo((h.x + 1) * cw, (h.y + 0.5) * ch); g.lineTo(image.width, (h.y + 0.5) * ch);
      g.stroke();
      g.setLineDash([]);
    }
  }
  g.restore();
}
