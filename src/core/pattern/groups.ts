import type { KeyEntry, Pattern } from "./types";
import { hasBeads } from "../entryKinds/registry";

/**
 * What can be shown or hidden on the chart, a whole kind at a time (SPEC §15.16): crosses (whole and half), fractional
 * stitches, backstitch, French knots, beads — a bead alone or floss + bead, in a cell or between cells.
 */
export type ChartGroup = "crosses" | "partials" | "backstitch" | "knots" | "beads";
export const CHART_GROUPS: readonly ChartGroup[] = ["crosses", "partials", "backstitch", "knots", "beads"];

// a layer whose contents are all of one kind names its group itself (LayerHandler.group); the stitches and knots
// layers hold two, told apart per item below

/** A cell's stitch is a cross, or floss + bead — a bead. */
export const stitchGroup = (e: Pick<KeyEntry, "t"> | null | undefined): ChartGroup => (e && hasBeads(e.t) ? "beads" : "crosses");

/** A point on the grid holds a French knot, or a bead (alone or with its floss) between cells. */
export const pointGroup = (e: Pick<KeyEntry, "t"> | null | undefined): ChartGroup => (e && hasBeads(e.t) ? "beads" : "knots");

/** The kinds the chart has at least one of, in the usual order. */
export function groupsIn(p: Pattern): ChartGroup[] {
  const { stitches, partials, beads, segments, knots } = p.layers, has = new Set<ChartGroup>();
  for (let i = 0; i < stitches.length && has.size < 2; i++) if (stitches[i] && p.key[stitches[i]!]) has.add(stitchGroup(p.key[stitches[i]!]));
  if ([...partials.values()].some((l) => l.some((s) => p.key[s.k]))) has.add("partials");
  if (!has.has("beads") && beads.some((k) => k && p.key[k])) has.add("beads");
  if (segments.some((s) => p.key[s.k]) || p.layers.stamps.some((s) => p.key[s.k])) has.add("backstitch");
  for (const o of knots) if (p.key[o.k]) has.add(pointGroup(p.key[o.k]));
  return CHART_GROUPS.filter((g) => has.has(g));
}
