import { shapeSymbol } from "./shapes";

/** Backstitch "symbols" are line styles (SPEC §2.5): stored in `KeyEntry.sym` as `line:<name>`. */
export const LINE_STYLES = [
  "solid", "dashed", "longDash", "dotted", "dashDot", "dashDotDot", "longShort", "sparseDots", "shortDash", "dashDashDot",
  "double", "thickThin", "ticks", "wave", "zigzag", "scallop", "circles", "squares", "chevrons", "crosses",
].map((name) => `line:${name}`);

/** Plain-text stand-ins for places that can only show text (selects, CSV, check messages). */
const TEXT: Record<string, string> = {
  solid: "───", dashed: "– –", longDash: "— —", dotted: "···", dashDot: "–·–", dashDotDot: "–··", longShort: "—-—", sparseDots: "· ·",
  shortDash: "---", dashDashDot: "––·", double: "═══", thickThin: "━─━", ticks: "┼┼┼", wave: "∿∿∿", zigzag: "/\\/", scallop: "◡◡◡",
  circles: "-o-", squares: "-▪-", chevrons: "»»»", crosses: "-x-",
};

export const isLineStyle = (sym: string) => sym.startsWith("line:");

export const lineStyleName = (sym: string) => sym.slice(5);

/** The symbol as text: line styles become a short sketch of the line. */
export const symbolText = (sym: string) => (isLineStyle(sym) ? (TEXT[lineStyleName(sym)] ?? "───") : (shapeSymbol(sym)?.text ?? sym));
