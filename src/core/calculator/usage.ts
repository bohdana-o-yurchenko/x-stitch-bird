import { entryKind } from "../entryKinds/registry";
import { LAYERS } from "../layers/registry";
import type { UsageUnit } from "../layers/types";
import { stitchType } from "../stitches/registry";
import type { KeyIndex, Pattern } from "../pattern/types";

export type EntryUsage = Partial<Record<UsageUnit, number>>;

/** Facts only: how much of each key entry is on the chart. Calculators turn this into a shopping list. */
export interface UsageReport {
  perEntry: Map<KeyIndex, EntryUsage>;
}

export function computeUsage(p: Pattern): UsageReport {
  const perEntry = new Map<KeyIndex, EntryUsage>();
  const sink = (k: KeyIndex, unit: UsageUnit, amount: number) => {
    let u = perEntry.get(k);
    if (!u) perEntry.set(k, (u = {}));
    u[unit] = (u[unit] ?? 0) + amount;
  };
  for (const l of LAYERS) l.usage(l.get(p.layers), sink, p);
  return { perEntry };
}

/** The number shown next to a key entry: cells, lines, knots or stamps. */
export const entryCount = (u: EntryUsage | undefined): number =>
  (u?.cell ?? 0) + (u?.segment ?? 0) + (u?.knot ?? 0) + (u?.stamp ?? 0);

export const partialCount = (u: EntryUsage | undefined): number =>
  (u?.quarter ?? 0) + (u?.threeQuarter ?? 0) + (u?.petite ?? 0);

export interface ChartTotals {
  full: number;
  half: number;
  quarter: number;
  threeQuarter: number;
  petite: number;
  backstitch: number;
  beads: number;
  knots: number;
  /** Smyrna crosses and one's own stamps. */
  stamps: number;
}

export function chartTotals(p: Pattern, usage: UsageReport): ChartTotals {
  const t: ChartTotals = { full: 0, half: 0, quarter: 0, threeQuarter: 0, petite: 0, backstitch: 0, beads: 0, knots: 0, stamps: 0 };
  for (const [k, u] of usage.perEntry) {
    const e = p.key[k];
    if (!e) continue;
    const cells = u.cell ?? 0;
    const kind = entryKind(e.t);
    if (kind.layer === "stitches") {
      if (stitchType(e.st).countsAs === "full") t.full += cells;
      else t.half += cells;
    }
    // beads on grid points count as beads, not knots
    if (kind.beads !== "none") t.beads += cells + (u.knot ?? 0);
    else t.knots += u.knot ?? 0;
    t.quarter += u.quarter ?? 0;
    t.threeQuarter += u.threeQuarter ?? 0;
    t.petite += u.petite ?? 0;
    t.backstitch += u.segment ?? 0;
    t.stamps += u.stamp ?? 0;
  }
  return t;
}
