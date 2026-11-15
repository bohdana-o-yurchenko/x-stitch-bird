/*
 * Chart symbols drawn from vector paths (SPEC §2.5): the same on every device, in PNG and later in PDF. Each shape is
 * one or more parts in a square box (24×24 here, 100×100 in shapeLibrary.ts). Stored in `KeyEntry.sym` as
 * `sym:<name>`; letters, digits and signs stay plain characters drawn with the app's bundled font. To add a shape:
 * add it to the symbol sheet and re-run scripts/symbols-from-svg.py, or add it to BASES/MARKS below.
 */
import { customShape } from "./customSymbol";
import { BASIC, DECORATIVE } from "./shapeLibrary";

export interface SymbolPart {
  /** SVG path data in the shape's box. */
  d: string;
  paint: "fill" | "stroke";
  /** Stroke width in box units (default 2.2 in a 24 box). */
  w?: number;
  cap?: "butt" | "round" | "square";
  join?: "miter" | "round" | "bevel";
  /** Fill rule; "evenodd" for outlines stored as a filled ring. */
  rule?: "evenodd";
  /** Only this half of the box is painted (half-filled variants). */
  clip?: "left" | "top";
}

/** Basic = simple geometric shapes and marks; decorative = pictures and intricate shapes; custom = drawn by the user. */
export type ShapeGroup = "basic" | "decorative" | "custom";

export interface ShapeSymbol {
  id: string;
  group: ShapeGroup;
  /** Side of the square box the parts are drawn in (default 24). */
  box?: number;
  parts: readonly SymbolPart[];
  /** The closest plain-text character, for places that can only show text (CSV, lists). */
  text: string;
}

const PREFIX = "sym:";
export const isShapeSymbol = (s: string) => s.startsWith(PREFIX);

const poly = (pts: [number, number][]) => `M${pts.map(([x, y]) => `${+x.toFixed(2)} ${+y.toFixed(2)}`).join("L")}Z`;
const regular = (n: number, r: number, rot = -Math.PI / 2): [number, number][] =>
  Array.from({ length: n }, (_, i) => [12 + r * Math.cos(rot + (i * 2 * Math.PI) / n), 12 + r * Math.sin(rot + (i * 2 * Math.PI) / n)]);
const star = (outer: number, inner: number): [number, number][] =>
  Array.from({ length: 10 }, (_, i) => {
    const r = i % 2 ? inner : outer, a = -Math.PI / 2 + (i * Math.PI) / 5;
    return [12 + r * Math.cos(a), 12 + r * Math.sin(a) + 0.8];
  });
const circle = (r: number, cx = 12, cy = 12) => `M${cx + r} ${cy}A${r} ${r} 0 1 1 ${cx - r} ${cy}A${r} ${r} 0 1 1 ${cx + r} ${cy}Z`;

/** Closed base shapes; each gets filled, outline, dotted and two half-filled variants. */
const BASES: { name: string; d: string; text: [string, string] }[] = [
  { name: "circle", d: circle(9), text: ["●", "○"] },
  { name: "square", d: "M3.5 3.5H20.5V20.5H3.5Z", text: ["■", "□"] },
  { name: "triangle", d: poly([[12, 2.8], [21.5, 20], [2.5, 20]]), text: ["▲", "△"] },
  { name: "diamond", d: poly([[12, 2], [22, 12], [12, 22], [2, 12]]), text: ["◆", "◇"] },
  { name: "star", d: poly(star(10.5, 4.4)), text: ["★", "☆"] },
  { name: "heart", d: "M12 20.5C7 16.6 2.5 13.2 2.5 8.6 2.5 5.6 4.8 3.5 7.5 3.5 9.4 3.5 11 4.6 12 6.2 13 4.6 14.6 3.5 16.5 3.5 19.2 3.5 21.5 5.6 21.5 8.6 21.5 13.2 17 16.6 12 20.5Z", text: ["♥", "♡"] },
  { name: "hexagon", d: poly(regular(6, 10, 0)), text: ["⬢", "⬡"] },
  { name: "triangle-down", d: poly([[12, 21.2], [21.5, 4], [2.5, 4]]), text: ["▼", "▽"] },
  { name: "pentagon", d: poly(regular(5, 10)), text: ["⬟", "⬠"] },
  { name: "triangle-right", d: poly([[21.2, 12], [4, 2.5], [4, 21.5]]), text: ["▶", "▷"] },
  { name: "triangle-left", d: poly([[2.8, 12], [20, 2.5], [20, 21.5]]), text: ["◀", "◁"] },
];

const DOT = circle(2.6);

const variants = (b: (typeof BASES)[number]): ShapeSymbol[] => [
  { id: `${PREFIX}${b.name}`, group: "basic", parts: [{ d: b.d, paint: "fill" }], text: b.text[0] },
  { id: `${PREFIX}${b.name}-o`, group: "basic", parts: [{ d: b.d, paint: "stroke" }], text: b.text[1] },
  { id: `${PREFIX}${b.name}-dot`, group: "basic", parts: [{ d: b.d, paint: "stroke" }, { d: DOT, paint: "fill" }], text: b.text[1] },
  { id: `${PREFIX}${b.name}-hl`, group: "basic", parts: [{ d: b.d, paint: "fill", clip: "left" }, { d: b.d, paint: "stroke" }], text: b.text[0] },
  { id: `${PREFIX}${b.name}-ht`, group: "basic", parts: [{ d: b.d, paint: "fill", clip: "top" }, { d: b.d, paint: "stroke" }], text: b.text[0] },
];

const stroke = (d: string) => ({ d, paint: "stroke" as const });

/** Line symbols and marks in shapes. */
const MARKS: ShapeSymbol[] = ([
  { id: `${PREFIX}circle-plus`, parts: [stroke(circle(9)), stroke("M12 6.5V17.5M6.5 12H17.5")], text: "⊕" },
  { id: `${PREFIX}circle-x`, parts: [stroke(circle(9)), stroke("M8.2 8.2L15.8 15.8M15.8 8.2L8.2 15.8")], text: "⊗" },
  { id: `${PREFIX}square-plus`, parts: [stroke("M3.5 3.5H20.5V20.5H3.5Z"), stroke("M12 6.5V17.5M6.5 12H17.5")], text: "⊞" },
  { id: `${PREFIX}square-x`, parts: [stroke("M3.5 3.5H20.5V20.5H3.5Z"), stroke("M7 7L17 17M17 7L7 17")], text: "⊠" },
  { id: `${PREFIX}ring`, parts: [stroke(circle(9)), stroke(circle(4.5))], text: "◎" },
  { id: `${PREFIX}asterisk`, parts: [stroke("M12 3V21M4.2 7.5L19.8 16.5M19.8 7.5L4.2 16.5")], text: "✱" },
  { id: `${PREFIX}arrow-up`, parts: [stroke("M12 21V4M5 11L12 4L19 11")], text: "↑" },
  { id: `${PREFIX}arrow-down`, parts: [stroke("M12 3V20M5 13L12 20L19 13")], text: "↓" },
  { id: `${PREFIX}arrow-left`, parts: [stroke("M21 12H4M11 5L4 12L11 19")], text: "←" },
  { id: `${PREFIX}arrow-right`, parts: [stroke("M3 12H20M13 5L20 12L13 19")], text: "→" },
  { id: `${PREFIX}bars-v`, parts: [stroke("M8 3.5V20.5M16 3.5V20.5")], text: "‖" },
  { id: `${PREFIX}bars-h`, parts: [stroke("M3.5 8H20.5M3.5 16H20.5")], text: "═" },
  { id: `${PREFIX}chevron-up`, parts: [stroke("M3.5 16.5L12 7L20.5 16.5")], text: "∧" },
  { id: `${PREFIX}chevron-down`, parts: [stroke("M3.5 7.5L12 17L20.5 7.5")], text: "∨" },
  { id: `${PREFIX}slash`, parts: [stroke("M5 20L19 4")], text: "╱" },
  { id: `${PREFIX}backslash`, parts: [stroke("M5 4L19 20")], text: "╲" },
  { id: `${PREFIX}moon`, parts: [{ d: "M15 3.2A9 9 0 1 0 15 20.8A7.2 7.2 0 1 1 15 3.2Z", paint: "fill" }], text: "☾" },
  { id: `${PREFIX}cross-filled`, parts: [{ d: "M9.5 3H14.5V9.5H21V14.5H14.5V21H9.5V14.5H3V9.5H9.5Z", paint: "fill" }], text: "✚" },
] as Omit<ShapeSymbol, "group">[]).map((m) => ({ ...m, group: "basic" }));

const byVariant = (suffix: string) => BASES.map((b) => variants(b).find((v) => v.id === `${PREFIX}${b.name}${suffix}`)!);

/** All shapes, most distinct first: filled, outline, dotted, marks, half-filled, the rest of the basic ones, decorative. */
export const SHAPES: readonly ShapeSymbol[] = [
  ...byVariant(""), ...byVariant("-o"), ...byVariant("-dot"), ...MARKS, ...byVariant("-hl"), ...byVariant("-ht"),
  ...BASIC, ...DECORATIVE,
];

const BY_ID = new Map(SHAPES.map((s) => [s.id, s]));
/** The drawable shape of a symbol: a built-in one (`sym:…`) or a hand-drawn one (`draw:…`); undefined for characters. */
export const shapeSymbol = (id: string): ShapeSymbol | undefined => BY_ID.get(id) ?? customShape(id);

/** Plain characters drawn with the bundled font (no I/O — they look like 1/0). */
export const TEXT_SYMBOLS: readonly string[] = [
  ..."123456789",
  ..."ABCDEFGHJKLMNPRSTUVWXYZ",
  ..."+−×÷=<>%#",
  ..."abdefghkmnqrtuy",
  ..."0Q",
];
