import type { ShapeSymbol, SymbolPart } from "./shapes";

/*
 * Hand-drawn chart symbols (SPEC §2.5): a few simple shapes on a small grid, so a key entry can get exactly the
 * icon printed on the paper chart. The whole drawing is the symbol string itself — `draw:O3399;a1b6b1` — stored in
 * `KeyEntry.sym` like any other symbol: nothing else in the file changes, and the format has room for only what the
 * drawing tool can make. Anything that doesn't parse is not a symbol and gets a standard one on load.
 */

const PREFIX = "draw:";
/** Shapes snap to a grid of this many cells each way (points 0..12). */
export const CUSTOM_GRID = 12;
/** The guardrail on complexity: more shapes than this don't read at chart size (and keep the symbol string short). */
export const CUSTOM_MAX_SHAPES = 8;

export type TriangleDir = "u" | "r" | "d" | "l";

interface Box {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * Shapes are painted in the order they were drawn. A box shape is given by its corners (x1 < x2, y1 < y2);
 * a line or arrow by its two ends — a line horizontal, vertical or diagonal and 1 or 2 cells thick, an arrow
 * from its tail to its head. An empty (not filled) shape cuts a hole in everything drawn before it.
 */
export type CustomShape =
  | ({ kind: "circle" | "rect" | "star"; filled: boolean } & Box)
  | ({ kind: "triangle"; filled: boolean; dir: TriangleDir } & Box)
  | ({ kind: "line"; width: 1 | 2 } & Box)
  | ({ kind: "arrow" } & Box);

export const isCustomSymbol = (s: string) => s.startsWith(PREFIX);

const DIGITS = "0123456789abc";
const LETTER = { circle: "o", rect: "s", star: "p", triangle: "t" } as const;
const TOKEN = /^(?:[oOsSpP][0-9a-c]{4}|[tT][0-9a-c]{4}[urdl]|[lL][0-9a-c]{4}|a[0-9a-c]{4})$/;

/** Big enough to see: a box at least one cell each way, a line one cell long, an arrow two. */
export function validShape(s: CustomShape): boolean {
  if (![s.x1, s.y1, s.x2, s.y2].every((v) => Number.isInteger(v) && v >= 0 && v <= CUSTOM_GRID)) return false;
  const dx = Math.abs(s.x2 - s.x1), dy = Math.abs(s.y2 - s.y1);
  if (s.kind === "arrow") return Math.hypot(dx, dy) >= 2;
  if (s.kind === "line") return Math.max(dx, dy) >= 1 && (dx === 0 || dy === 0 || dx === dy);
  return s.x2 > s.x1 && s.y2 > s.y1;
}

/** The symbol string for a drawing, or null when it is empty, too complex or has a shape that is too small. */
export function encodeCustomSymbol(shapes: readonly CustomShape[]): string | null {
  if (!shapes.length || shapes.length > CUSTOM_MAX_SHAPES || !shapes.every(validShape)) return null;
  const xy = (s: CustomShape) => [s.x1, s.y1, s.x2, s.y2].map((v) => DIGITS[v]).join("");
  return PREFIX + shapes.map((s) => {
    if (s.kind === "arrow") return `a${xy(s)}`;
    if (s.kind === "line") return `${s.width === 2 ? "L" : "l"}${xy(s)}`;
    const letter = s.filled ? LETTER[s.kind].toUpperCase() : LETTER[s.kind];
    return `${letter}${xy(s)}${s.kind === "triangle" ? s.dir : ""}`;
  }).join(";");
}

/** The shapes of a custom symbol, or null when the string is not one (wrong form, too many shapes, off the grid). */
export function decodeCustomSymbol(sym: string): CustomShape[] | null {
  if (!isCustomSymbol(sym)) return null;
  const tokens = sym.slice(PREFIX.length).split(";");
  if (tokens.length > CUSTOM_MAX_SHAPES || !tokens.every((t) => TOKEN.test(t))) return null;
  const shapes = tokens.map((t): CustomShape => {
    const [x1, y1, x2, y2] = [...t.slice(1, 5)].map((c) => DIGITS.indexOf(c)) as [number, number, number, number];
    const k = t[0]!.toLowerCase(), filled = t[0] !== k;
    if (k === "a") return { kind: "arrow", x1, y1, x2, y2 };
    if (k === "l") return { kind: "line", width: filled ? 2 : 1, x1, y1, x2, y2 };
    if (k === "t") return { kind: "triangle", filled, dir: t[5] as TriangleDir, x1, y1, x2, y2 };
    return { kind: k === "o" ? "circle" : k === "s" ? "rect" : "star", filled, x1, y1, x2, y2 };
  });
  return shapes.every(validShape) ? shapes : null;
}

// the grid sits inside the 24-unit symbol box with a margin, so outlines are not cut at the edges
const at = (v: number) => +(2 + (v * 20) / CUSTOM_GRID).toFixed(2);
const n = (v: number) => +v.toFixed(2);

/** A regular five-pointed star stretched to fill the box. */
function starPath(x1: number, y1: number, x2: number, y2: number): string {
  const pts = Array.from({ length: 10 }, (_, i) => {
    const r = i % 2 ? 0.4 : 1, a = -Math.PI / 2 + (i * Math.PI) / 5;
    return [r * Math.cos(a), r * Math.sin(a)] as const;
  });
  // the star spans x ±0.951 and y from −1 to 0.809
  return "M" + pts.map(([px, py]) => `${n(x1 + ((px + 0.951) / 1.902) * (x2 - x1))} ${n(y1 + ((py + 1) / 1.809) * (y2 - y1))}`).join("L") + "Z";
}

function shapePart(s: CustomShape): SymbolPart {
  const x1 = at(s.x1), y1 = at(s.y1), x2 = at(s.x2), y2 = at(s.y2);
  if (s.kind === "arrow") {
    const a = Math.atan2(y2 - y1, x2 - x1), head = Math.min(5.5, Math.hypot(x2 - x1, y2 - y1) * 0.55);
    const barb = (turn: number) => `${n(x2 - head * Math.cos(a + turn))} ${n(y2 - head * Math.sin(a + turn))}`;
    return { d: `M${x1} ${y1}L${x2} ${y2}M${barb(0.6)}L${x2} ${y2}L${barb(-0.6)}`, paint: "stroke" };
  }
  // 1 or 2 grid cells thick, flat ends
  if (s.kind === "line") return { d: `M${x1} ${y1}L${x2} ${y2}`, paint: "stroke", w: n((s.width * 20) / CUSTOM_GRID), cap: "butt" };
  const paint = s.filled ? "fill" : "stroke", mx = n((x1 + x2) / 2), my = n((y1 + y2) / 2);
  if (s.kind === "rect") return { d: `M${x1} ${y1}H${x2}V${y2}H${x1}Z`, paint };
  if (s.kind === "star") return { d: starPath(x1, y1, x2, y2), paint };
  if (s.kind !== "triangle") {
    const rx = n((x2 - x1) / 2), ry = n((y2 - y1) / 2);
    return { d: `M${x2} ${my}A${rx} ${ry} 0 1 1 ${x1} ${my}A${rx} ${ry} 0 1 1 ${x2} ${my}Z`, paint };
  }
  const corners: Record<TriangleDir, number[]> = { u: [mx, y1, x2, y2, x1, y2], d: [x1, y1, x2, y1, mx, y2], r: [x1, y1, x2, my, x1, y2], l: [x2, y1, x2, y2, x1, my] };
  const pts = corners[s.dir];
  return { d: `M${pts[0]} ${pts[1]}L${pts[2]} ${pts[3]}L${pts[4]} ${pts[5]}Z`, paint };
}

/** An empty closed shape: it cuts its inside out of what was drawn before it. */
const cuts = (s: CustomShape) => (s.kind === "circle" || s.kind === "rect" || s.kind === "star" || s.kind === "triangle") && !s.filled;

/** The parts in drawing order, each knowing which later empty shapes cut holes in it. */
function shapeParts(shapes: readonly CustomShape[]): SymbolPart[] {
  const parts = shapes.map(shapePart);
  return parts.map((part, i) => {
    const holes = shapes.flatMap((s, j) => (j > i && cuts(s) ? [parts[j]!.d] : []));
    return holes.length ? { ...part, holes } : part;
  });
}

const cache = new Map<string, ShapeSymbol | null>();

/** A custom symbol as a drawable shape (the same form as the built-in ones), or undefined if `sym` isn't one. */
export function customShape(sym: string): ShapeSymbol | undefined {
  if (!isCustomSymbol(sym)) return undefined;
  if (!cache.has(sym)) {
    if (cache.size > 500) cache.clear();
    const shapes = decodeCustomSymbol(sym);
    // "✎" stands for a hand-drawn icon where only text can be shown (CSV, lists)
    cache.set(sym, shapes && { id: sym, group: "custom", parts: shapeParts(shapes), text: "✎" });
  }
  return cache.get(sym) ?? undefined;
}
