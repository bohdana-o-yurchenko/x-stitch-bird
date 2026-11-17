import { chartTotals, computeUsage } from "../calculator/usage";
import type { Pattern } from "./types";

/** A pattern at a glance (SPEC §15.36, the patterns list): the same figures in the browser and in the account. */
export interface PatternStats {
  /** Key entries: threads, blends, beads, knots. */
  colours: number;
  /** Cross stitches of every kind (full, half, quarter, three-quarter, petite). */
  stitches: number;
  beads: number;
  backstitch: number;
  /** Fabric count. */
  count: number;
  /** Time spent on it, in milliseconds. */
  spent: number;
}

export function patternStats(p: Pattern): PatternStats {
  const t = chartTotals(p, computeUsage(p));
  return {
    colours: p.key.filter(Boolean).length,
    stitches: t.full + t.half + t.quarter + t.threeQuarter + t.petite,
    beads: t.beads,
    backstitch: t.backstitch,
    count: p.count,
    spent: p.spent,
  };
}

/** A saved pattern's figures with what it takes up (SPEC §15.36). */
export interface PatternDetails extends PatternStats {
  /** The pattern file's size. */
  bytes: number;
  /** Photo windows and the image behind the chart, and the bytes of their pictures (marks included). */
  photos: { count: number; bytes: number };
  versions: number;
}
