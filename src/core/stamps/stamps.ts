import type { Pattern, Segment, Stamp, StampDef, StampLine } from "../pattern/types";

/**
 * Stamps (ARCHITECTURE-REVIEW §3): a fixed block of straight stitches placed as one — a Smyrna cross over one cell or
 * over four, or one drawn by the user. A backstitch key entry with `stamp` set places them; everything else about
 * it (colour, strands, line style, line ink, thread used, OXS and PDF) is backstitch.
 */

/** Smyrna (double) cross: a diagonal cross with an upright cross over it. */
const smyrna = (n: number): StampDef => ({
  id: `smyrna${n}`,
  name: `smyrna${n}`,
  w: n,
  h: n,
  lines: [
    { x1: 0, y1: n, x2: n, y2: 0 },
    { x1: 0, y1: 0, x2: n, y2: n },
    { x1: n / 2, y1: 0, x2: n / 2, y2: n },
    { x1: 0, y1: n / 2, x2: n, y2: n / 2 },
  ],
});

/** Built in, in the order offered; never stored in a pattern. Their `name` is a message key (`stamps.<name>`). */
export const BUILT_IN_STAMPS: readonly StampDef[] = [smyrna(1), smyrna(2)];

const BUILT_IN = new Map(BUILT_IN_STAMPS.map((d) => [d.id, d]));

/** Own stamps' ids start with this; built-in ids never do. */
export const OWN_STAMP = "own:";
export const isBuiltInStamp = (id: string) => BUILT_IN.has(id);

/** A stamp by id: built in, or the pattern's own. */
export const stampDef = (p: Pick<Pattern, "stamps">, id: string | undefined): StampDef | undefined => (id ? BUILT_IN.get(id) ?? p.stamps?.[id] : undefined);

/** Every stamp the pattern can use: the built-in ones, then its own. */
export const stampDefs = (p: Pick<Pattern, "stamps">): StampDef[] => [...BUILT_IN_STAMPS, ...Object.values(p.stamps ?? {})];

const IDENTITY: [number, number, number, number] = [1, 0, 0, 1];

/** Width and height of a stamp's block when turned by `m` (a quarter turn swaps them). */
export const turnedSize = (d: Pick<StampDef, "w" | "h">, m = IDENTITY) => (m[1] ? { w: d.h, h: d.w } : { w: d.w, h: d.h });

/** A stamp of `def` with its top-left cell at (x, y), as drawn. */
export const placeStampAt = (def: StampDef, x: number, y: number, k: number): Stamp => ({ x, y, w: def.w, h: def.h, def: def.id, k });

/** The stamp whose block has its middle on `cell` (the one under the pointer), its top-left cell. */
export const stampOrigin = (def: Pick<StampDef, "w" | "h">, cell: { x: number; y: number }) => ({ x: cell.x - Math.floor((def.w - 1) / 2), y: cell.y - Math.floor((def.h - 1) / 2) });

/** A stamp's lines on the chart: its def's lines turned by `m` and moved onto its block. */
export function stampLines(s: Stamp, def: StampDef): Segment[] {
  const [a, b, c, d] = s.m ?? IDENTITY, cx = s.x + s.w / 2, cy = s.y + s.h / 2;
  const at = (x: number, y: number) => {
    const u = x - def.w / 2, v = y - def.h / 2;
    return [cx + a * u + b * v, cy + c * u + d * v] as const;
  };
  return def.lines.map((l) => {
    const [x1, y1] = at(l.x1, l.y1), [x2, y2] = at(l.x2, l.y2);
    return { x1, y1, x2, y2, k: s.k };
  });
}

/** Composes two turns: `outer` after `inner`. */
export const composeTurn = (outer: readonly number[], inner: readonly number[] = IDENTITY): [number, number, number, number] => {
  const [a, b, c, d] = outer, [e, f, g, h] = inner;
  return [a! * e! + b! * g!, a! * f! + b! * h!, c! * e! + d! * g!, c! * f! + d! * h!];
};

export const isIdentityTurn = (m: readonly number[] | undefined) => !m || (m[0] === 1 && m[1] === 0 && m[2] === 0 && m[3] === 1);

/** A stamp drawn by the user, made safe: lines on the half grid inside its block, none of zero length, no repeats. */
export function cleanStampDef(raw: unknown): StampDef | null {
  const d = raw as Partial<StampDef> | null;
  if (!d || typeof d.id !== "string" || !d.id.startsWith(OWN_STAMP) || !Number.isInteger(d.w) || !Number.isInteger(d.h)) return null;
  const w = d.w!, h = d.h!;
  if (w < 1 || h < 1 || w > MAX_STAMP || h > MAX_STAMP || !Array.isArray(d.lines)) return null;
  const half = (n: unknown, max: number) => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= max && Number.isInteger(n * 2);
  const seen = new Set<string>(), lines: StampLine[] = [];
  for (const l of d.lines as StampLine[]) {
    if (!l || !half(l.x1, w) || !half(l.y1, h) || !half(l.x2, w) || !half(l.y2, h) || (l.x1 === l.x2 && l.y1 === l.y2)) continue;
    const key = [l.x1, l.y1, l.x2, l.y2].join(), back = [l.x2, l.y2, l.x1, l.y1].join();
    if (seen.has(key) || seen.has(back)) continue;
    seen.add(key);
    lines.push({ x1: l.x1, y1: l.y1, x2: l.x2, y2: l.y2 });
  }
  if (!lines.length) return null;
  return { id: d.id, name: typeof d.name === "string" && d.name.trim() ? d.name.trim().slice(0, 40) : "", w, h, lines };
}

/** The largest stamp, in cells each way. */
export const MAX_STAMP = 8;
