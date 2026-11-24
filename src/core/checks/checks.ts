import type { KeyEntry, Pattern, StitchTypeId } from "../pattern/types";
import { chartLines } from "../layers/registry";

/*
 * Chart checks (SPEC §15.4): likely mistakes in a copied chart, found on demand. Pure functions over a pattern; each
 * is linear in the number of cells (near symmetry: × 21 candidate axes), so instant even on big charts.
 */

export type CheckId = "holes" | "lone" | "symmetry";

export interface CheckOptions {
  holes: { on: boolean; max: 1 | 2 | 3 | 10 };
  /** `reach`: how far around there must be no more of that colour — 1 = the 8 touching cells (the first meaning), 2–3 wider. */
  lone: { on: boolean; max: 1 | 2; alone: boolean; reach?: 1 | 2 | 3 };
  symmetry: { on: boolean };
}

export const DEFAULT_CHECKS: CheckOptions = { holes: { on: false, max: 3 }, lone: { on: false, max: 1, alone: true, reach: 1 }, symmetry: { on: false } };

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

/** Cells up to `r` away (in a square, not the cell itself), inside the chart. */
const around = (p: Pattern, i: number, r: number) => {
  const x = i % p.w, y = (i / p.w) | 0, out: number[] = [];
  for (let dy = -r; dy <= r; dy++)
    for (let dx = -r; dx <= r; dx++)
      if ((dx || dy) && x + dx >= 0 && y + dy >= 0 && x + dx < p.w && y + dy < p.h) out.push((y + dy) * p.w + x + dx);
  return out;
};

/**
 * Lone stitches: small groups of one colour with no more of that colour around; by default only among other stitches.
 * `reach` 2 or 3: none of that colour within that many cells of the group either, not only among the 8 touching.
 */
export function findLoneStitches(p: Pattern, max: number, alone: boolean, reach = 1): Finding[] {
  const { stitches } = p.layers;
  return groups(p, (i) => !!colourAt(p, i), (a, b) => colourAt(p, a) === colourAt(p, b))
    .filter((g) => g.length <= max && (alone || g.some((i) => neighbours(p, i).some((n) => stitches[n] && !g.includes(n)))))
    .filter((g) => reach <= 1 || g.every((i) => around(p, i, reach).every((n) => g.includes(n) || colourAt(p, n) !== colourAt(p, i))))
    .map((cells) => ({ id: `lone:${cells.join(",")}`, check: "lone", cells }));
}

const MIRRORED: Record<StitchTypeId, StitchTypeId> = { full: "full", half: "halfb", halfb: "half", point: "point" };
/** Does `b` show what the mirror image of `a` should? Same thread, kind and stitch, a half cross turned over. */
const mirrors = (a: KeyEntry | null, b: KeyEntry | null) => !!a && !!b && a.src === b.src && a.t === b.t && MIRRORED[a.st ?? "full"] === (b.st ?? "full");

/**
 * Near symmetry: the mirror axis near the middle (±5 cells, on grid lines and through cell middles) where the most
 * mirrored pairs match — crosses, beads in cells, backstitch lines, knots and beads between cells; when 90–99.9%
 * match, the pairs that don't (a line or a point by the cell at its middle and that cell's mirror).
 */
export function findNearSymmetry(p: Pattern): Finding[] {
  const out: Finding[] = [];
  const entry = (i: number) => p.key[p.layers.stitches[i] ?? 0] ?? null;
  const bead = (i: number) => p.key[p.layers.beads[i] ?? 0] ?? null;
  const lines = new Map<string, (KeyEntry | null)[]>();
  const lineAt = (x1: number, y1: number, x2: number, y2: number) => (x1 < x2 || (x1 === x2 && y1 <= y2) ? `${x1},${y1},${x2},${y2}` : `${x2},${y2},${x1},${y1}`);
  // knots and beads between cells are checked like lines of no length (backstitch never has one)
  const marks = [...chartLines(p), ...p.layers.knots.map((o) => ({ x1: o.x, y1: o.y, x2: o.x, y2: o.y, k: o.k }))];
  for (const g of marks) {
    const id = lineAt(g.x1, g.y1, g.x2, g.y2);
    lines.set(id, [...(lines.get(id) ?? []), p.key[g.k] ?? null]);
  }
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
          const a = at(u, v), b = at(m, v);
          for (const layer of [entry, bead]) {
            const ea = layer(a), eb = layer(b);
            if (!ea && !eb) continue;
            pairs++;
            if (mirrors(ea, eb)) matches++;
            else misses.push([a, b]);
          }
        }
      // backstitch, knots, beads between cells: each against its mirror image (s − x across a vertical axis); a pair of lines is one pair
      // a line on a grid line is shown by the cell on its side towards the axis, so a pair is reported the same either way
      const flip = (c: number) => s - c;
      const cellOf = (c: number) => Math.min(along - 1, Math.max(0, Number.isInteger(c) && c >= s / 2 ? c - 1 : Math.floor(c)));
      for (const g of marks) {
        const [u1, v1, u2, v2] = axis === "vertical" ? [g.x1, g.y1, g.x2, g.y2] : [g.y1, g.x1, g.y2, g.x2];
        if (flip(u1) < 0 || flip(u1) > along || flip(u2) < 0 || flip(u2) > along) continue;
        const twin = axis === "vertical" ? lineAt(flip(u1), v1, flip(u2), v2) : lineAt(v1, flip(u1), v2, flip(u2));
        const own = p.key[g.k] ?? null, self = twin === lineAt(g.x1, g.y1, g.x2, g.y2);
        if ((lines.get(twin) ?? []).some((e) => mirrors(own, e))) {
          pairs += self ? 1 : 0.5;
          matches += self ? 1 : 0.5;
          continue;
        }
        pairs++;
        const u = cellOf((u1 + u2) / 2), v = Math.min(across - 1, Math.floor((v1 + v2) / 2));
        misses.push([at(u, v), at(Math.min(along - 1, Math.max(0, s - 1 - u)), v)]);
      }
      if (pairs < 10) continue;
      const ratio = matches / pairs;
      if (!best || ratio > best.ratio) best = { ratio, misses };
    }
    const seen = new Set<string>();
    if (best && best.ratio >= 0.9 && best.ratio < 1)
      for (const [a, b] of best.misses) {
        const id = `symmetry:${axis}:${Math.min(a, b)},${Math.max(a, b)}`;
        if (seen.has(id)) continue;
        seen.add(id);
        out.push({ id, check: "symmetry", axis, cells: [Math.min(a, b), Math.max(a, b)] });
      }
  }
  return out;
}

/** The chosen checks, in the order of the panel: empty cells, lone stitches, near symmetry. */
export function runChecks(p: Pattern, o: CheckOptions): Finding[] {
  return [
    ...(o.holes.on ? findHoles(p, o.holes.max) : []),
    ...(o.lone.on ? findLoneStitches(p, o.lone.max, o.lone.alone, o.lone.reach ?? 1) : []),
    ...(o.symmetry.on ? findNearSymmetry(p) : []),
  ];
}
