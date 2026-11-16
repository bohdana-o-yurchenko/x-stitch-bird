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

type Halo = { color: string; width: number } | null;

/** Ready-drawn symbols per shape: colour, size, halo and pixel scale → a small picture to stamp on each cell. */
const sprites = new WeakMap<ShapeSymbol, Map<string, CanvasImageSource>>();
const MAX_SPRITES = 48;
const cutOuts = new WeakMap<ShapeSymbol, boolean>();
const hasCutOuts = (shape: ShapeSymbol) => {
  let v = cutOuts.get(shape);
  if (v === undefined) cutOuts.set(shape, (v = shape.parts.some((p) => !!p.holes)));
  return v;
};

function newCanvas(w: number, h: number): (HTMLCanvasElement | OffscreenCanvas) | null {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

/**
 * A vector chart symbol `size` px wide centred on (cx, cy); `halo` = a light outline so it reads on any colour.
 * A hand-drawn symbol with cut-outs is drawn once per colour, size and screen scale into a small picture, then
 * stamped: a chart shows it thousands of times, and its cut-outs (clipped twice each) were costly to draw anew on
 * every cell of every frame — panning stuttered on patterns with many of them.
 */
export function drawShape(g: Ctx, shape: ShapeSymbol, cx: number, cy: number, size: number, color: string, halo: Halo) {
  // plain shapes are quicker to fill than to stamp
  if (!hasCutOuts(shape)) return paintShape(g, shape, cx, cy, size, color, halo);
  const m = g.getTransform?.();
  // turned or skewed drawing (rare), or no canvas to draw into (tests): straight onto the target
  if (!m || m.b || m.c) return paintShape(g, shape, cx, cy, size, color, halo);
  // the picture is whole screen pixels, stamped 1:1 (no stretching); `full` is its side in drawing units
  const scale = Math.abs(m.a), pad = Math.ceil((halo?.width ?? 0) + size * 0.12 + 2), px = Math.ceil((size + 2 * pad) * scale), full = px / scale;
  const key = `${color}|${halo ? `${halo.color}/${halo.width}` : ""}|${size.toFixed(2)}|${scale}`;
  let byKey = sprites.get(shape);
  if (!byKey) sprites.set(shape, (byKey = new Map()));
  let sprite = byKey.get(key);
  if (!sprite) {
    const c = newCanvas(px, px);
    const sg = c?.getContext("2d") as Ctx | null | undefined;
    if (!c || !sg) return paintShape(g, shape, cx, cy, size, color, halo);
    sg.setTransform(scale, 0, 0, scale, 0, 0);
    paintShape(sg, shape, full / 2, full / 2, size, color, halo);
    if (byKey.size >= MAX_SPRITES) byKey.clear();
    byKey.set(key, (sprite = c));
  }
  // on whole screen pixels too, so the edges stay as sharp as when drawn directly
  const x = Math.round((cx - full / 2) * scale + m.e) / scale - m.e / scale, y = Math.round((cy - full / 2) * scale + m.f) / scale - m.f / scale;
  g.drawImage(sprite, x, y, full, full);
}

function paintShape(g: Ctx, shape: ShapeSymbol, cx: number, cy: number, size: number, color: string, halo: Halo) {
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
