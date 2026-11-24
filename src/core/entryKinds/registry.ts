import type { EntryKindId, KeyEntry, LayerId } from "../pattern/types";

export type Placement = "cell" | "segment" | "point" | "block";

export type EntryField = "colour" | "blend" | "bead" | "stitchType" | "strands" | "wraps" | "stamp";

/** How a key-entry kind is placed and edited (ARCHITECTURE §7.2). */
export interface EntryKind {
  id: EntryKindId;
  layer: LayerId;
  /** cell: brush tools · segment: backstitch lines · point: knots on the half grid · block: a stamp of fixed size. */
  placement: Placement;
  fields: readonly EntryField[];
  defaultStrands: number | null;
  /** Kinds in the same group can be swapped while an entry is on the chart. */
  group: LayerId;
  /**
   * What tells its entries apart on the chart: a chart symbol each, or a line style in a line colour (backstitch,
   * SPEC §2.5) — with its own line colour on the Symbols view and the printed chart.
   */
  marks: "symbol" | "lineStyle";
  /** Its stitches can lean (half crosses): a mirrored copy uses a twin entry with the other diagonal (SPEC §15.3). */
  leans: boolean;
  /** Beads: none, beads alone, or floss + bead. */
  beads: "none" | "only" | "withFloss";
}

/** In the order the key form offers them: cross, backstitch, knot, floss + bead, bead. */
export const ENTRY_KINDS: readonly EntryKind[] = [
  { id: "thread", layer: "stitches", placement: "cell", fields: ["colour", "blend", "stitchType", "strands"], defaultStrands: 2, group: "stitches", marks: "symbol", leans: true, beads: "none" },
  { id: "back", layer: "segments", placement: "segment", fields: ["colour", "blend", "strands", "stamp"], defaultStrands: 1, group: "segments", marks: "lineStyle", leans: false, beads: "none" },
  { id: "knot", layer: "knots", placement: "point", fields: ["colour", "blend", "strands", "wraps"], defaultStrands: 2, group: "knots", marks: "symbol", leans: false, beads: "none" },
  { id: "combo", layer: "stitches", placement: "cell", fields: ["colour", "bead", "stitchType", "strands"], defaultStrands: 2, group: "stitches", marks: "symbol", leans: true, beads: "withFloss" },
  { id: "bead", layer: "beads", placement: "cell", fields: ["bead"], defaultStrands: null, group: "beads", marks: "symbol", leans: false, beads: "only" },
];

const BY_ID = new Map(ENTRY_KINDS.map((k) => [k.id, k]));
export const entryKind = (id: EntryKindId): EntryKind => BY_ID.get(id) ?? ENTRY_KINDS[0]!;

/** Entries of kind `t` are told apart by line styles (backstitch), not chart symbols. */
export const usesLineStyles = (t: EntryKindId): boolean => entryKind(t).marks === "lineStyle";

/** Entries of kind `t` have beads (alone or with floss). */
export const hasBeads = (t: EntryKindId): boolean => entryKind(t).beads !== "none";

/** A bead (or floss + bead) sewn on a grid point, between cells, placed like a French knot. */
export const isPointBead = (e: Pick<KeyEntry, "t" | "st">): boolean => hasBeads(e.t) && e.st === "point";

/** Backstitch placed as a stamp: a fixed block of lines (Smyrna cross, one's own; core/stamps). */
export const isStampEntry = (e: Pick<KeyEntry, "t" | "stamp">): boolean => e.t === "back" && !!e.stamp;

type EntryLike = Pick<KeyEntry, "t" | "st" | "stamp">;

/**
 * Entries placed unlike the rest of their kind, first match wins (ARCHITECTURE-REVIEW §2). A new way of placing an
 * existing kind is one more rule here, its layer and its tool (editor/tools/registry PLACEMENT_TOOLS).
 */
export const PLACEMENT_RULES: readonly { when: (e: EntryLike) => boolean; placement: Placement; layer: LayerId }[] = [
  { when: isPointBead, placement: "point", layer: "knots" },
  { when: isStampEntry, placement: "block", layer: "stamps" },
];

const ruleFor = (e: EntryLike) => PLACEMENT_RULES.find((r) => r.when(e));

/** Where an entry goes: its kind's placement, unless a placement rule says otherwise. */
export const entryPlacement = (e: EntryLike): Placement => ruleFor(e)?.placement ?? entryKind(e.t).placement;

/** The layer an entry's stitches live in: its kind's, unless a placement rule says otherwise. */
export const entryLayerOf = (e: EntryLike): LayerId => ruleFor(e)?.layer ?? entryKind(e.t).layer;
