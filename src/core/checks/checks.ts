import type { KeyEntry, Pattern, StitchTypeId } from "../pattern/types";

/*
 * Chart checks (SPEC §15.4): likely mistakes in a copied chart, found on demand. Pure functions over a pattern; each
 * is linear in the number of cells (near symmetry: × 21 candidate axes), so instant even on big charts.
 */

export type CheckId = "holes" | "lone" | "symmetry";

export interface CheckOptions {
  holes: { on: boolean; max: 1 | 2 | 3 };
  lone: { on: boolean; max: 1 | 2; alone: boolean };
  symmetry: { on: boolean };
}

export const DEFAULT_CHECKS: CheckOptions = { holes: { on: false, max: 3 }, lone: { on: false, max: 1, alone: false }, symmetry: { on: false } };

export interface Finding {
  /** Stable, so a finding can be ignored for the session. */
  id: string;
  check: CheckId;
  /** The cells (indices), in reading order; for symmetry the two mirrored cells. */
  cells: number[];
  /** Near symmetry: which mirror axis. */
  axis?: "vertical" | "horizontal";
}

const NEIGHBOURS = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]] as const;

/** 8-connected groups of cells for which `same(a, b)` holds between neighbours; `in(i)` says which cells take part. */
function groups(p: Pattern, take: (i: number) => boolean, same: (a: number, b: number) => boolean): number[][] {
  const { w, h } = p, seen = new Uint8Array(w * h), out: number[][] = [];
  for (let start = 0; start < w * h; start++) {
    if (seen[start] || !take(start)) continue;
    const group: number[] = [], stack = [start];
    seen[start] = 1;
    while (stack.length) {
      const i = stack.pop()!, x = i % w, y = (i / w) | 0;
      group.push(i);
      for (const [dx, dy] of NEIGHBOURS) {
        const nx = x + dx, ny = y + dy, n = ny * w + nx;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h || seen[n] || !take(n) || !same(i, n)) continue;
        seen[n] = 1;
        stack.push(n);
      }
    }
    out.push(group.sort((a, b) => a - b));
  }
  return out;
}

const neighbours = (p: Pattern, i: number) => {
  const x = i % p.w, y = (i / p.w) | 0;
  return NEIGHBOURS.flatMap(([dx, dy]) => (x + dx < 0 || y + dy < 0 || x + dx >= p.w || y + dy >= p.h ? [] : [(y + dy) * p.w + x + dx]));
};

/** Holes: small groups of empty cells that touch no other empty cell and not the chart's edge. */
export function findHoles(p: Pattern, max: number): Finding[] {
  const { stitches, beads, partials } = p.layers;
  const empty = (i: number) => !stitches[i] && !beads[i] && !partials.has(i);
  const edge = (i: number) => i % p.w === 0 || i % p.w === p.w - 1 || i < p.w || i >= p.w * (p.h - 1);
  return groups(p, empty, () => true)
    .filter((g) => g.length <= max && !g.some(edge))
    .map((cells) => ({ id: `holes:${cells.join(",")}`, check: "holes", cells }));
}

/** The colour of a cell's cross or half cross: same thread or blend counts as the same, whatever the stitch. */
const colourAt = (p: Pattern, i: number): string | null => p.key[p.layers.stitches[i] ?? 0]?.src ?? null;

/** Lone stitches: small groups of one colour with no more of that colour around; by default only among other stitches. */
export function findLoneStitches(p: Pattern, max: number, alone: boolean): Finding[] {
  const { stitches } = p.layers;
  return groups(p, (i) => !!colourAt(p, i), (a, b) => colourAt(p, a) === colourAt(p, b))
    .filter((g) => g.length <= max && (alone || g.some((i) => neighbours(p, i).some((n) => stitches[n] && !g.includes(n)))))
    .map((cells) => ({ id: `lone:${cells.join(",")}`, check: "lone", cells }));
}

const MIRRORED: Record<StitchTypeId, StitchTypeId> = { full: "full", half: "halfb", halfb: "half" };
/** Does `b` show what the mirror image of `a` should? Same thread, kind and stitch, a half cross turned over. */
const mirrors = (a: KeyEntry | null, b: KeyEntry | null) => !!a && !!b && a.src === b.src && a.t === b.t && MIRRORED[a.st ?? "full"] === (b.st ?? "full");

/**
 * Near symmetry: the mirror axis near the middle (±5 cells, on grid lines and through cell middles) where the most
 * mirrored pairs match; when 90–99.9% match, the pairs that don't.
 */
export function findNearSymmetry(p: Pattern): Finding[] {
  const out: Finding[] = [];
  const entry = (i: number) => p.key[p.layers.stitches[i] ?? 0] ?? null;
  for (const axis of ["vertical", "horizontal"] as const) {
    const along = axis === "vertical" ? p.w : p.h, across = axis === "vertical" ? p.h : p.w;
    const at = (u: number, v: number) => (axis === "vertical" ? v * p.w + u : u * p.w + v);
    let best: { ratio: number; misses: [number, number][] } | null = null;
    // u′ = s − 1 − u mirrors u across the axis; s = 2 × the axis position, from 5 cells left of the middle to 5 right
    for (let s = Math.max(1, along - 10); s <= Math.min(2 * along - 1, along + 10); s++) {
      let pairs = 0, matches = 0;
      const misses: [number, number][] = [];
      for (let v = 0; v < across; v++)
        for (let u = 0; u < along; u++) {
          const m = s - 1 - u;
          if (m <= u || m >= along) continue;
          const a = at(u, v), b = at(m, v), ea = entry(a), eb = entry(b);
          if (!ea && !eb) continue;
          pairs++;
          if (mirrors(ea, eb)) matches++;
          else misses.push([a, b]);
        }
      if (pairs < 10) continue;
      const ratio = matches / pairs;
      if (!best || ratio > best.ratio) best = { ratio, misses };
    }
    if (best && best.ratio >= 0.9 && best.ratio < 1)
      for (const [a, b] of best.misses) out.push({ id: `symmetry:${axis}:${a},${b}`, check: "symmetry", axis, cells: [Math.min(a, b), Math.max(a, b)] });
  }
  return out;
}

/** The chosen checks, in the order of the panel: empty cells, lone stitches, near symmetry. */
export function runChecks(p: Pattern, o: CheckOptions): Finding[] {
  return [
    ...(o.holes.on ? findHoles(p, o.holes.max) : []),
    ...(o.lone.on ? findLoneStitches(p, o.lone.max, o.lone.alone) : []),
    ...(o.symmetry.on ? findNearSymmetry(p) : []),
  ];
}
