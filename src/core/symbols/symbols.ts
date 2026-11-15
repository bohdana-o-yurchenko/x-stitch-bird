import { SHAPES, TEXT_SYMBOLS, isShapeSymbol } from "./shapes";

/** Every chart symbol, most distinct first (SPEC §2.5): vector shapes, then letters, digits and signs. */
export const ALL_SYMBOLS: readonly string[] = [...SHAPES.map((s) => s.id), ...TEXT_SYMBOLS];

/** Older patterns stored Unicode characters; the closest shape (or sign) for each, where there is one. */
const LEGACY: Record<string, string> = {
  ...Object.fromEntries([...SHAPES].reverse().map((s) => [s.text, s.id])),
  "●": "sym:circle", "○": "sym:circle-o", "■": "sym:square", "□": "sym:square-o", "▲": "sym:triangle", "△": "sym:triangle-o",
  "◆": "sym:diamond", "◇": "sym:diamond-o", "★": "sym:star", "☆": "sym:star-o", "♥": "sym:heart", "♡": "sym:heart-o",
  "◉": "sym:circle-dot", "⊙": "sym:circle-dot", "◐": "sym:circle-hl", "◓": "sym:circle-ht", "▣": "sym:square-dot",
  "◧": "sym:square-hl", "⬒": "sym:square-ht", "◈": "sym:diamond-dot", "◎": "sym:ring",
  "✚": "sym:cross-filled", "✖": "×", "✕": "×", "╳": "×", "x": "×", "*": "sym:asterisk", "✱": "sym:asterisk", "-": "−",
};

/** A symbol from any version: today's ids and characters pass; old characters become their closest shape. */
export function upgradeSymbol(s: string): string {
  if (!s || isShapeSymbol(s) || s.startsWith("line:")) return s;
  const bare = s.replace(/︎/g, "");
  return LEGACY[bare] ?? bare;
}

export function firstFreeSymbol(used: Iterable<string>, symbols: readonly string[], fallback = "?"): string {
  const taken = new Set(used);
  return symbols.find((s) => !taken.has(s)) ?? fallback;
}

export { isShapeSymbol };
