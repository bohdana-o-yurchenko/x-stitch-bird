import type { GridNumbering, Layers, Pattern } from "./types";

export const DEFAULT_FABRIC = "#F7F4EC";
export const DEFAULT_GRID: GridNumbering = { x0: 1, y0: 1, label: 10, fromCentre: false };
export const MIN_SIZE = 5;
export const MAX_SIZE = 1000;

export const newPatternId = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : "p" + Date.now().toString(36);

export const emptyLayers = (w: number, h: number): Layers => ({
  stitches: new Uint16Array(w * h),
  beads: new Uint16Array(w * h),
  partials: new Map(),
  segments: [],
  knots: [],
  ambiguous: new Set(),
});

export function createPattern(w = 80, h = 80, name = "Untitled pattern"): Pattern {
  return {
    id: newPatternId(),
    name,
    w,
    h,
    count: 14,
    strands: 2,
    fabric: DEFAULT_FABRIC,
    meta: {},
    grid: { ...DEFAULT_GRID },
    key: [null],
    blends: {},
    combos: {},
    customs: {},
    layers: emptyLayers(w, h),
    spent: 0,
  };
}

export const clampSize = (v: unknown, min = MIN_SIZE, max = MAX_SIZE): number =>
  Math.max(min, Math.min(max, Math.round(Number(v)) || min));

/** Short unique id for blends, combos and custom colours. */
export const shortId = (prefix: string): string =>
  `${prefix}:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
