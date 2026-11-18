import { partialKind } from "../stitches/partialKinds";
import { stitchType } from "../stitches/registry";
import type { Corner, KeyEntry, PartialKindId, Pattern } from "./types";

/*
 * The one place that decides what may share a cell (SPEC §6.2, §15.13 Q4). With override off only free space
 * takes paint; with override on, painting replaces whatever is in the way.
 *  - a bead in a cell takes the whole cell: nothing is stitched under it, it isn't put on a stitch; floss + bead
 *    needs a completely empty cell too (a bead between cells is a point, not a cell: it goes on anything)
 *  - a cell holds a full/half cross OR partial stitches; a half cross may share with quarters
 * `together`: what is in the cell came along with this content (a paste, a turn of the whole chart) — a bead and a
 * stitch that already shared a cell (older charts, other apps' files) stay together then.
 */

type Partials = Pattern["layers"]["partials"];

const usedSlots = (partials: Partials, i: number): number =>
  (partials.get(i) ?? []).reduce((m, s) => m | partialKind(s.kind).slots(s.corner), 0);

const stitchAt = (p: Pattern, i: number): KeyEntry | null => p.key[p.layers.stitches[i] ?? 0] ?? null;

/** Is cell `i` already taken for a cell-placed entry? */
export function isOccupied(p: Pattern, i: number, e: KeyEntry, together = false): boolean {
  const { stitches, beads, partials } = p.layers;
  if (e.t === "bead") return !!beads[i] || stitchAt(p, i)?.t === "combo" || (!together && (!!stitches[i] || partials.has(i)));
  if (e.t === "combo") return !!stitches[i] || !!beads[i] || partials.has(i);
  if (!together && beads[i]) return true;
  return !!stitches[i] || (partials.get(i)?.some((s) => !(partialKind(s.kind).allowedWithHalf && stitchType(e.st).countsAs === "partial")) ?? false);
}

export function canPlacePartial(p: Pattern, i: number, kind: PartialKindId, corner: Corner, partials: Partials = p.layers.partials, together = false): boolean {
  const st = stitchAt(p, i);
  if (st && (stitchType(st.st).countsAs === "full" || !partialKind(kind).allowedWithHalf || st.t === "combo")) return false;
  if (!together && p.layers.beads[i]) return false;
  return (usedSlots(partials, i) & partialKind(kind).slots(corner)) === 0;
}

/** Override on: clear whatever overlaps a new partial stitch. */
export function clearForPartial(p: Pattern, i: number, kind: PartialKindId, corner: Corner, partials: Partials = p.layers.partials, together = false): void {
  const st = stitchAt(p, i);
  if (st && (stitchType(st.st).countsAs === "full" || !partialKind(kind).allowedWithHalf || st.t === "combo")) p.layers.stitches[i] = 0;
  if (!together) p.layers.beads[i] = 0;
  const mask = partialKind(kind).slots(corner);
  const rest = (partials.get(i) ?? []).filter((s) => (partialKind(s.kind).slots(s.corner) & mask) === 0);
  if (rest.length) partials.set(i, rest);
  else partials.delete(i);
}

/** After putting a cell-placed entry in cell `i`: drop what it now overlaps (with override off nothing is left to drop). */
export function clearUnder(p: Pattern, i: number, e: KeyEntry, together = false): void {
  const { layers } = p;
  if (e.t === "bead") {
    if (!together) {
      layers.stitches[i] = 0;
      layers.partials.delete(i);
    }
    return;
  }
  if (e.t === "combo" || !together) layers.beads[i] = 0;
  const list = layers.partials.get(i);
  if (!list) return;
  const keepWithHalf = e.t === "thread" && stitchType(e.st).countsAs === "partial";
  const rest = keepWithHalf ? list.filter((s) => partialKind(s.kind).allowedWithHalf) : [];
  if (rest.length) layers.partials.set(i, rest);
  else layers.partials.delete(i);
}
