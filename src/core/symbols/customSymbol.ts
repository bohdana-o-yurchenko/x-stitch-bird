import type { ShapeSymbol, SymbolPart } from "./shapes";

/*
 * Hand-drawn chart symbols (SPEC §2.5): a few simple shapes on a small grid, so a key entry can get exactly the
 * icon printed on the paper chart. The whole drawing is the symbol string itself — `draw:O00cc;!P22aa` — stored in
 * `KeyEntry.sym` like any other symbol: nothing else in the file changes, and the format has room for only what the
 * drawing tool can make. Anything that doesn't parse is not a symbol and gets a standard one on load.
 */

const PREFIX = "draw:";
/** Shapes snap to a grid of this many cells each way (points 0..12). */
export const CUSTOM_GRID = 12;
/** The guardrail on complexity: more shapes than this don't read at chart size (and keep the symbol string short). */
export const CUSTOM_MAX_SHAPES = 8;

export type TriangleDir = "u" | "r" | "d" | "l";

/** How a shape is painted: solid ink, an outline, or a negative that cuts its inside out of what is below it. */
export type Paint = "fill" | "outline" | "cut";

interface Box {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * Shapes are painted in the order they were drawn. A box shape is given by its corners (x1 < x2, y1 < y2); a line
 * or arrow by its two ends — a line horizontal, vertical or diagonal and 1 or 2 cells thick, an arrow from its
 * tail to its head. A `cut` shape is a negative: it removes everything drawn before it where it lies, and shapes
 * drawn after it sit on top again. Lines can be filled or cut, an arrow only filled.
 */
export type CustomShape =
  | ({ kind: "circle" | "rect" | "star"; paint: Paint } & Box)
  | ({ kind: "triangle"; paint: Paint; dir: TriangleDir } & Box)
  | ({ kind: "line"; paint: "fill" | "cut"; width: 1 | 2 } & Box)
  | ({ kind: "arrow"; paint: "fill" } & Box);

export const isCustomSymbol = (s: string) => s.startsWith(PREFIX);

export const isCut = (s: CustomShape) => s.paint === "cut";

const DIGITS = "0123456789abc";
const LETTER = { circle: "o", rect: "s", star: "p", triangle: "t" } as const;
const XY = "[0-9a-c]{4}";
const TOKEN = new RegExp(`^(?:[oOsSpP]${XY}|[tT]${XY}[urdl]|[lL]${XY}|a${XY}|!(?:[OSP]${XY}|T${XY}[urdl]|[lL]${XY}))$`);

/** Big enough to see: a box at least one cell each way, a line one cell long, an arrow two. */
export function validShape(s: CustomShape): boolean {
  if (![s.x1, s.y1, s.x2, s.y2].every((v) => Number.isInteger(v) && v >= 0 && v <= CUSTOM_GRID)) return false;
  const dx = Math.abs(s.x2 - s.x1), dy = Math.abs(s.y2 - s.y1);
  if (s.kind === "arrow") return s.paint === "fill" && Math.hypot(dx, dy) >= 2;
  if (s.kind === "line") return (s.paint === "fill" || s.paint === "cut") && Math.max(dx, dy) >= 1 && (dx === 0 || dy === 0 || dx === dy);
  return s.x2 > s.x1 && s.y2 > s.y1;
}

/** A drawing needs something to see: cuts alone leave nothing. */
const hasInk = (shapes: readonly CustomShape[]) => shapes.some((s) => !isCut(s));

/** The symbol string for a drawing, or null when it is empty, all cuts, too complex or has a shape that is too small. */
export function encodeCustomSymbol(shapes: readonly CustomShape[]): string | null {
  if (!shapes.length || shapes.length > CUSTOM_MAX_SHAPES || !shapes.every(validShape) || !hasInk(shapes)) return null;
  const xy = (s: CustomShape) => [s.x1, s.y1, s.x2, s.y2].map((v) => DIGITS[v]).join("");
  return PREFIX + shapes.map((s) => {
    const cut = isCut(s) ? "!" : "";
    if (s.kind === "arrow") return `a${xy(s)}`;
    if (s.kind === "line") return `${cut}${s.width === 2 ? "L" : "l"}${xy(s)}`;
    const letter = s.paint === "outline" ? LETTER[s.kind] : LETTER[s.kind].toUpperCase();
    return `${cut}${letter}${xy(s)}${s.kind === "triangle" ? s.dir : ""}`;
  }).join(";");
}

/** The shapes of a custom symbol, or null when the string is not one (wrong form, too many shapes, off the grid). */
export function decodeCustomSymbol(sym: string): CustomShape[] | null {
  if (!isCustomSymbol(sym)) return null;
  const tokens = sym.slice(PREFIX.length).split(";");
  if (tokens.length > CUSTOM_MAX_SHAPES || !tokens.every((t) => TOKEN.test(t))) return null;
  const shapes = tokens.map((token): CustomShape => {
    const cut = token.startsWith("!"), t = cut ? token.slice(1) : token;
    const [x1, y1, x2, y2] = [...t.slice(1, 5)].map((c) => DIGITS.indexOf(c)) as [number, number, number, number];
    const k = t[0]!.toLowerCase(), paint: Paint = cut ? "cut" : t[0] === k ? "outline" : "fill";
    if (k === "a") return { kind: "arrow", paint: "fill", x1, y1, x2, y2 };
    if (k === "l") return { kind: "line", paint: cut ? "cut" : "fill", width: t[0] === "L" ? 2 : 1, x1, y1, x2, y2 };
    if (k === "t") return { kind: "triangle", paint, dir: t[5] as TriangleDir, x1, y1, x2, y2 };
    return { kind: k === "o" ? "circle" : k === "s" ? "rect" : "star", paint, x1, y1, x2, y2 };
  });
  return shapes.every(validShape) && hasInk(shapes) ? shapes : null;
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

/** The outline of a closed shape (circle, rectangle, star, triangle) in the 24-unit box. */
function closedPath(s: Exclude<CustomShape, { kind: "line" | "arrow" }>): string {
  const x1 = at(s.x1), y1 = at(s.y1), x2 = at(s.x2), y2 = at(s.y2), mx = n((x1 + x2) / 2), my = n((y1 + y2) / 2);
  if (s.kind === "rect") return `M${x1} ${y1}H${x2}V${y2}H${x1}Z`;
  if (s.kind === "star") return starPath(x1, y1, x2, y2);
  if (s.kind !== "triangle") {
    const rx = n((x2 - x1) / 2), ry = n((y2 - y1) / 2);
    return `M${x2} ${my}A${rx} ${ry} 0 1 1 ${x1} ${my}A${rx} ${ry} 0 1 1 ${x2} ${my}Z`;
  }
  const corners: Record<TriangleDir, number[]> = { u: [mx, y1, x2, y2, x1, y2], d: [x1, y1, x2, y1, mx, y2], r: [x1, y1, x2, my, x1, y2], l: [x2, y1, x2, y2, x1, my] };
  const pts = corners[s.dir];
  return `M${pts[0]} ${pts[1]}L${pts[2]} ${pts[3]}L${pts[4]} ${pts[5]}Z`;
}

const thickness = (s: { width: 1 | 2 }) => n((s.width * 20) / CUSTOM_GRID);

/** The area a shape covers, as a closed path: what a `cut` shape removes, and what the editor outlines for it. */
export function coveredPath(s: CustomShape): string {
  if (s.kind === "arrow") return "";
  if (s.kind !== "line") return closedPath(s);
  // a line is a band of its thickness around the segment, with flat ends
  const x1 = at(s.x1), y1 = at(s.y1), x2 = at(s.x2), y2 = at(s.y2), len = Math.hypot(x2 - x1, y2 - y1) || 1;
  const nx = (-(y2 - y1) / len) * (thickness(s) / 2), ny = ((x2 - x1) / len) * (thickness(s) / 2);
  return `M${n(x1 + nx)} ${n(y1 + ny)}L${n(x2 + nx)} ${n(y2 + ny)}L${n(x2 - nx)} ${n(y2 - ny)}L${n(x1 - nx)} ${n(y1 - ny)}Z`;
}

function shapePart(s: CustomShape): SymbolPart {
  if (s.kind === "arrow") {
    const x1 = at(s.x1), y1 = at(s.y1), x2 = at(s.x2), y2 = at(s.y2);
    const a = Math.atan2(y2 - y1, x2 - x1), head = Math.min(5.5, Math.hypot(x2 - x1, y2 - y1) * 0.55);
    const barb = (turn: number) => `${n(x2 - head * Math.cos(a + turn))} ${n(y2 - head * Math.sin(a + turn))}`;
    return { d: `M${x1} ${y1}L${x2} ${y2}M${barb(0.6)}L${x2} ${y2}L${barb(-0.6)}`, paint: "stroke" };
  }
  // 1 or 2 grid cells thick, flat ends
  if (s.kind === "line") return { d: `M${at(s.x1)} ${at(s.y1)}L${at(s.x2)} ${at(s.y2)}`, paint: "stroke", w: thickness(s), cap: "butt" };
  return { d: closedPath(s), paint: s.paint === "outline" ? "stroke" : "fill" };
}

/** The parts in drawing order — cuts leave no part of their own, but cut holes in the parts drawn before them. */
function shapeParts(shapes: readonly CustomShape[]): SymbolPart[] {
  return shapes.flatMap((s, i) => {
    if (isCut(s)) return [];
    const holes = shapes.slice(i + 1).filter(isCut).map(coveredPath);
    return [holes.length ? { ...shapePart(s), holes } : shapePart(s)];
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

/** Ready-made drawings the dialog offers as starting points; each shows one way to use a cut-out. */
export const CUSTOM_EXAMPLES: readonly { id: string; sym: string }[] = [
  { id: "ringDot", sym: "draw:o00cc;O4488" },
  { id: "starCut", sym: "draw:O00cc;!P22aa" },
  { id: "squareHole", sym: "draw:S00cc;!O3399" },
  { id: "crossCut", sym: "draw:O00cc;!l06c6;!l606c" },
];

/**
 * The colour a hand-drawn symbol's cut-out shows: paper white, so it never lets the cell's colour through — or dark
 * when the symbol itself is drawn light (on dark floss), so the cut-out still shows.
 */
export function cutOutColour(ink: string): string {
  const h = ink.replace("#", ""), full = h.length === 3 ? h.replace(/./g, (c) => c + c) : h;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) || 0);
  return 0.299 * r! + 0.587 * g! + 0.114 * b! > 160 ? "#1D1A16" : "#FFFFFF";
}
