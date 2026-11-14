import type { StitchTypeId } from "../pattern/types";

/** A stitch that fills one cell and belongs to the key entry (SPEC §3.2, ARCHITECTURE §9). */
export interface StitchType {
  id: StitchTypeId;
  glyph: string;
  /** Thread used relative to a full cross. */
  threadFactor: number;
  countsAs: "full" | "partial";
  /** Diagonal direction; `null` for symmetric stitches. Transforms swap "/" and "\". */
  direction: "/" | "\\" | null;
  /** OXS `<object objecttype="tent" direction>` value, if exported as an object. */
  oxsTentDirection?: 1 | 2;
}

export const STITCH_TYPES: readonly StitchType[] = [
  { id: "full", glyph: "✕", threadFactor: 1, countsAs: "full", direction: null },
  { id: "half", glyph: "╱", threadFactor: 0.5, countsAs: "partial", direction: "/", oxsTentDirection: 2 },
  { id: "halfb", glyph: "╲", threadFactor: 0.5, countsAs: "partial", direction: "\\", oxsTentDirection: 1 },
];

const BY_ID = new Map(STITCH_TYPES.map((s) => [s.id, s]));
export const stitchType = (id: StitchTypeId | undefined): StitchType => BY_ID.get(id ?? "full") ?? STITCH_TYPES[0]!;

/** The stitch type with the opposite diagonal, or the same one if it has none. */
export const mirroredStitchType = (id: StitchTypeId | undefined): StitchTypeId => {
  const s = stitchType(id);
  if (!s.direction) return s.id;
  return STITCH_TYPES.find((o) => o.direction && o.direction !== s.direction)?.id ?? s.id;
};
