import { mirroredStitchType } from "../stitches/registry";
import type { KeyEntry, Pattern } from "../pattern/types";
import type { ChartCheck, Finding } from "./types";

const MIN_PAIRS = 8;

/** How many of a cell's 8 neighbours hold the same thing — the better-supported side of a pair wins. */
function support(p: Pattern, i: number): number {
  const { w, h } = p, x = i % w, y = (i / w) | 0, k = p.layers.stitches[i] ?? 0;
  let n = 0;
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy;
      if ((dx || dy) && nx >= 0 && ny >= 0 && nx < w && ny < h && p.layers.stitches[ny * w + nx] === k) n++;
    }
  return n;
}

/** Do two cells hold the same thing, with `b` seen in a mirror (╱ ↔ ╲)? */
function mirrorEqual(a: KeyEntry | null | undefined, b: KeyEntry | null | undefined): boolean {
  if (!a || !b) return a === b;
  return a.t === b.t && a.src === b.src && (a.n ?? null) === (b.n ?? null) && (a.st ?? null) === (b.st ? mirroredStitchType(b.st) : null);
}

/**
 * Charts that are almost symmetric (≥ 90 %, < 100 %) around a vertical or horizontal axis near the centre:
 * reports the mismatched pairs with the majority side's value as a fix (SPEC §15.4).
 */
export const nearSymmetryCheck: ChartCheck = {
  id: "nearSymmetry",
  options: [{ id: "threshold", type: "number", default: 90, min: 50, max: 99 }],
  run(p, opts) {
    const { w, h } = p, S = p.layers.stitches;
    const at = (x: number, y: number) => S[y * w + x] ?? 0;
    const findings: Finding[] = [];
    for (const axis of ["vertical", "horizontal"] as const) {
      const n = axis === "vertical" ? w : h;
      let best: { pos: number; ratio: number; bad: [number, number][] } | null = null;
      // axis position in doubled units: cells i and j mirror when i + j = pos2 - 1
      for (let pos2 = n - 10; pos2 <= n + 10; pos2++) {
        if (pos2 < 2 || pos2 > 2 * n - 2) continue;
        let pairs = 0, good = 0;
        const bad: [number, number][] = [];
        for (let a = 0; a < n; a++) {
          const b = pos2 - 1 - a;
          if (b <= a || b >= n) continue;
          for (let o = 0; o < (axis === "vertical" ? h : w); o++) {
            const [ia, ib] = axis === "vertical" ? [o * w + a, o * w + b] : [a * w + o, b * w + o];
            const ka = axis === "vertical" ? at(a, o) : at(o, a), kb = axis === "vertical" ? at(b, o) : at(o, b);
            if (!ka && !kb) continue;
            pairs++;
            if (mirrorEqual(p.key[ka], p.key[kb])) good++;
            else bad.push([ia, ib]);
          }
        }
        if (pairs < MIN_PAIRS) continue;
        const ratio = good / pairs;
        if (ratio * 100 >= Number(opts.threshold) && ratio < 1 && (!best || ratio > best.ratio)) best = { pos: pos2, ratio, bad };
      }
      if (!best) continue;
      for (const [ia, ib] of best.bad) {
        const fromA = support(p, ia) >= support(p, ib);
        findings.push({
          id: `nearSymmetry:${axis}:${best.pos}:${ia}`,
          checkId: "nearSymmetry",
          cell: fromA ? ib : ia,
          related: [ia, ib],
          messageKey: `checks.nearSymmetry.${axis}`,
          params: { percent: Math.round(best.ratio * 1000) / 10 },
          suggestion: [{ to: fromA ? ib : ia, from: fromA ? ia : ib, swap: true }],
        });
      }
    }
    return findings;
  },
};
