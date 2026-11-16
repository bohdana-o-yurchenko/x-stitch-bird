/**
 * Colours a backstitch can be drawn in on the Symbols view and the PDF chart to print (SPEC §2.5): black by
 * default, or one of five vibrant ones that stand apart on paper (the PDF's own line colours), or any colour.
 */
export const DEFAULT_LINE_INK = "#1D1A16";
export const LINE_INKS = [
  { id: "black", hex: DEFAULT_LINE_INK },
  { id: "red", hex: "#E6194B" },
  { id: "green", hex: "#2E9E44" },
  { id: "blue", hex: "#3A5BD9" },
  { id: "orange", hex: "#F07800" },
  { id: "purple", hex: "#8E24AA" },
] as const;

/** A colour as stored: `#RRGGBB`, upper case; anything else is no colour. */
export const cleanInk = (v: unknown): string | undefined => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v.toUpperCase() : undefined);
