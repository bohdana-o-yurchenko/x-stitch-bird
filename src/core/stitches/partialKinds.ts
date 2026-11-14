import type { Corner, PartialKindId } from "../pattern/types";

/*
 * Fractional stitches (SPEC §15.13, draft proposals). A cell is divided into 8 slots: each corner owns two
 * half-quadrant triangles, one along its horizontal edge (s = 0) and one along its vertical edge (s = 1).
 * A kind occupies a set of slots; stitches in one cell must not overlap (unless override is on).
 */

export type Vec = [number, number];

const CORNER_PT: readonly Vec[] = [[0, 0], [1, 0], [1, 1], [0, 1]];
const hNeighbour = (c: Corner) => (c ^ 1) as Corner;
const vNeighbour = (c: Corner) => (3 - c) as Corner;
const slot = (c: Corner, s: 0 | 1) => 1 << (c * 2 + s);
const hMid = (c: Corner): Vec => [0.5, c < 2 ? 0 : 1];
const vMid = (c: Corner): Vec => [c === 0 || c === 3 ? 0 : 1, 0.5];
const centroid = (pts: Vec[]): Vec => [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length];

export interface PartialKind {
  id: PartialKindId;
  glyph: string;
  threadFactor: number;
  /** Bit mask of the slots this stitch covers. */
  slots(c: Corner): number;
  /** Outline in unit-cell coordinates (0..1). */
  polygon(c: Corner): Vec[];
  /** May share a cell with a half cross (SPEC §15.13 Q4). */
  allowedWithHalf: boolean;
}

export const PARTIAL_KINDS: readonly PartialKind[] = [
  {
    id: "quarter",
    glyph: "◸",
    threadFactor: 0.25,
    slots: (c) => slot(c, 0) | slot(c, 1),
    polygon: (c) => [CORNER_PT[c]!, hMid(c), vMid(c)],
    allowedWithHalf: true,
  },
  {
    id: "threeQuarter",
    glyph: "◩",
    threadFactor: 0.75,
    slots: (c) => slot(c, 0) | slot(hNeighbour(c), 0) | slot(c, 1) | slot(vNeighbour(c), 1),
    polygon: (c) => [CORNER_PT[c]!, CORNER_PT[hNeighbour(c)]!, CORNER_PT[vNeighbour(c)]!],
    allowedWithHalf: false,
  },
  {
    id: "petite",
    glyph: "▫",
    threadFactor: 0.5,
    slots: (c) => slot(c, 0) | slot(c, 1),
    polygon: (c) => [CORNER_PT[c]!, hMid(c), [0.5, 0.5], vMid(c)],
    allowedWithHalf: false,
  },
];

const BY_ID = new Map(PARTIAL_KINDS.map((k) => [k.id, k]));
export const partialKind = (id: PartialKindId): PartialKind => BY_ID.get(id) ?? PARTIAL_KINDS[0]!;

export const partialAnchor = (id: PartialKindId, c: Corner): Vec => centroid(partialKind(id).polygon(c));

/** The corner nearest to a point inside the cell (fx, fy in 0..1). */
export const nearestCorner = (fx: number, fy: number): Corner =>
  (fy < 0.5 ? (fx < 0.5 ? 0 : 1) : fx < 0.5 ? 3 : 2) as Corner;
