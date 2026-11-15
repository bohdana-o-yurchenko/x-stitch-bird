import type { ShapeSymbol } from "@/core/symbols/shapes";
import type { Ctx } from "./cells";

const paths = new Map<string, Path2D>();
const path = (d: string) => {
  let p = paths.get(d);
  if (!p) paths.set(d, (p = new Path2D(d)));
  return p;
};

/** A vector chart symbol `size` px wide centred on (cx, cy); `halo` = a light outline so it reads on any colour. */
export function drawShape(g: Ctx, shape: ShapeSymbol, cx: number, cy: number, size: number, color: string, halo: { color: string; width: number } | null) {
  const k = size / 24, line = Math.max(2.2, 1.1 / k);
  g.save();
  g.translate(cx - size / 2, cy - size / 2);
  g.scale(k, k);
  g.lineJoin = "round";
  g.lineCap = "round";
  if (halo) {
    g.strokeStyle = halo.color;
    g.lineWidth = line + (2 * halo.width) / k;
    for (const part of shape.parts) g.stroke(path(part.d));
  }
  g.fillStyle = g.strokeStyle = color;
  g.lineWidth = line;
  for (const part of shape.parts) {
    const p = path(part.d);
    if (part.paint === "stroke") g.stroke(p);
    else if (!part.clip) g.fill(p);
    else {
      g.save();
      g.beginPath();
      if (part.clip === "left") g.rect(0, 0, 12, 24);
      else g.rect(0, 0, 24, 12);
      g.clip();
      g.fill(p);
      g.restore();
    }
  }
  g.restore();
}
