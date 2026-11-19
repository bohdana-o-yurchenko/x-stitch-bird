/*
 * A colour the user names while settling a PDF chart (SPEC §15.52): a number and an approximate colour, for the
 * project's own palette. Carried as an id until the pattern is made: `palette:thread:#7A9CC6:3`.
 */

export interface PaletteColour {
  kind: "thread" | "bead";
  hex: string;
  code: string;
}

export const paletteId = (c: PaletteColour) => `palette:${c.kind}:${c.hex.toUpperCase()}:${c.code.trim()}`;

export function parsePaletteId(id: string): PaletteColour | null {
  const m = /^palette:(thread|bead):(#[0-9A-Fa-f]{6}):(.+)$/.exec(id);
  return m ? { kind: m[1] as PaletteColour["kind"], hex: m[2]!.toUpperCase(), code: m[3]! } : null;
}
