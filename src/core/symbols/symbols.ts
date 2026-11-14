import allSymbols from "./symbols.json";

/** U+FE0E: asks for the text (not emoji) presentation of a character. */
export const TEXT_STYLE = "︎";

/** Every candidate chart symbol, most distinct first (SPEC §2.5). Devices drop the ones their fonts can't draw. */
export const ALL_SYMBOLS: readonly string[] = allSymbols as string[];

/** Upgrades a bare character to its text-style variant when that's the form in the symbol list. */
export const normalizeSymbol = (s: string, symbols: readonly string[]): string =>
  s && [...s].length === 1 && symbols.includes(s + TEXT_STYLE) ? s + TEXT_STYLE : s;

export function firstFreeSymbol(used: Iterable<string>, symbols: readonly string[]): string {
  const taken = new Set(used);
  return symbols.find((s) => !taken.has(s)) ?? "?";
}
