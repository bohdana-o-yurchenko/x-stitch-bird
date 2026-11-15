import type { EntryKindId, LayerId } from "../pattern/types";

export type EntryField = "colour" | "blend" | "bead" | "stitchType" | "strands" | "wraps";

/** How a key-entry kind is placed and edited (ARCHITECTURE §7.2). */
export interface EntryKind {
  id: EntryKindId;
  layer: LayerId;
  /** cell: brush tools · segment: backstitch lines · point: knots on the half grid. */
  placement: "cell" | "segment" | "point";
  fields: readonly EntryField[];
  defaultStrands: number | null;
  /** Kinds in the same group can be swapped while an entry is on the chart. */
  group: LayerId;
}

/** In the order the key form offers them: cross, backstitch, knot, floss + bead, bead. */
export const ENTRY_KINDS: readonly EntryKind[] = [
  { id: "thread", layer: "stitches", placement: "cell", fields: ["colour", "blend", "stitchType", "strands"], defaultStrands: 2, group: "stitches" },
  { id: "back", layer: "segments", placement: "segment", fields: ["colour", "blend", "strands"], defaultStrands: 1, group: "segments" },
  { id: "knot", layer: "knots", placement: "point", fields: ["colour", "blend", "strands", "wraps"], defaultStrands: 2, group: "knots" },
  { id: "combo", layer: "stitches", placement: "cell", fields: ["colour", "bead", "stitchType", "strands"], defaultStrands: 2, group: "stitches" },
  { id: "bead", layer: "beads", placement: "cell", fields: ["bead"], defaultStrands: null, group: "beads" },
];

const BY_ID = new Map(ENTRY_KINDS.map((k) => [k.id, k]));
export const entryKind = (id: EntryKindId): EntryKind => BY_ID.get(id) ?? ENTRY_KINDS[0]!;
