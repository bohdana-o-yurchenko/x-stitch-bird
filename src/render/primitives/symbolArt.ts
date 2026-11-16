import { cutOutColour } from "@/core/symbols/customSymbol";
import type { ShapeSymbol, SymbolPart } from "@/core/symbols/shapes";
import type { Ctx } from "./cells";

const paths = new Map<string, Path2D>();
const outsides = new Map<string, Path2D>();
/** Everything except the inside of `d`: clipping to it cuts a hole. Use with the "evenodd" rule. */
const outside = (d: string) => {
  let p = outsides.get(d);
  if (!p) {
    outsides.set(d, (p = new Path2D()));
    p.rect(-1000, -1000, 3000, 3000);
    p.addPath(path(d));
  }
  return p;
};
const path = (d: string) => {
  let p = paths.get(d);
  if (!p) paths.set(d, (p = new Path2D(d)));
  return p;
};

/** A vector chart symbol `size` px wide centred on (cx, cy); `halo` = a light outline so it reads on any colour. */
export function drawShape(g: Ctx, shape: ShapeSymbol, cx: number, cy: number, size: number, color: string, halo: { color: string; width: number } | null) {
  const box = shape.box ?? 24, k = size / box;
  // strokes never thinner than ~1 px on screen
  const width = (part: SymbolPart) => Math.max(part.w ?? (2.2 * box) / 24, 1.1 / k);
  const pen = (part: SymbolPart) => {
    g.lineJoin = part.join ?? "round";
    g.lineCap = part.cap ?? "round";
  };
  g.save();
  g.translate(cx - size / 2, cy - size / 2);
  g.scale(k, k);
  if (halo) {
    g.strokeStyle = halo.color;
    for (const part of shape.parts) {
      pen(part);
      g.lineWidth = (part.paint === "stroke" ? width(part) : 0) + (2 * halo.width) / k;
      g.stroke(path(part.d));
    }
  }
  const paint = (part: SymbolPart, p: Path2D) => {
    if (part.paint === "stroke") {
      pen(part);
      g.lineWidth = width(part);
      g.stroke(p);
    } else if (!part.clip) g.fill(p, part.rule ?? "nonzero");
    else {
      g.save();
      g.beginPath();
      if (part.clip === "left") g.rect(0, 0, box / 2, box);
      else g.rect(0, 0, box, box / 2);
      g.clip();
      g.fill(p, part.rule ?? "nonzero");
      g.restore();
    }
  };
  for (const part of shape.parts) {
    const p = path(part.d);
    g.fillStyle = g.strokeStyle = color;
    if (!part.holes) {
      paint(part, p);
      continue;
    }
    g.save();
    for (const hole of part.holes) g.clip(outside(hole), "evenodd");
    paint(part, p);
    g.restore();
    // a cut-out is white paper where it crosses the shape — never the cell's colour showing through
    g.fillStyle = g.strokeStyle = cutOutColour(color);
    for (const hole of part.holes) {
      g.save();
      g.clip(path(hole));
      paint(part, p);
      g.restore();
    }
  }
  g.restore();
}
