import type { GridNumbering, Point, Size } from "../pattern/types";

/*
 * Paper-chart numbering (SPEC §15.2). The only place that turns cell indices into the numbers printed on a
 * chart and back. "From centre" labels the centre cell 0, negative to the left / top.
 */

type Axis = "x" | "y";
const length = (axis: Axis, s: Size) => (axis === "x" ? s.w : s.h);
const centre = (axis: Axis, s: Size) => Math.floor(length(axis, s) / 2);
const origin = (g: GridNumbering, axis: Axis) => (axis === "x" ? g.x0 : g.y0);

/** Label of cell `i` along an axis. */
export const cellLabel = (g: GridNumbering, axis: Axis, i: number, s: Size): number =>
  g.fromCentre ? i - centre(axis, s) : origin(g, axis) + i;

/** Grid-line positions (0..n) that are major lines: every 10 labels, aligned with the numbering. */
export function majorOffset(g: GridNumbering, axis: Axis, s: Size): number {
  const o = g.fromCentre ? centre(axis, s) : 1 - origin(g, axis);
  return ((o % 10) + 10) % 10;
}

export const isMajorLine = (b: number, offset: number): boolean => (((b - offset) % 10) + 10) % 10 === 0;

/** Ruler labels: a label at every `step`-th line (step is a multiple of the numbering interval). */
export function rulerLabels(g: GridNumbering, axis: Axis, s: Size, step: number): { at: number; text: number }[] {
  const n = length(axis, s), out: { at: number; text: number }[] = [];
  const offset = g.fromCentre ? centre(axis, s) : 1 - origin(g, axis);
  const first = ((offset % step) + step) % step;
  for (let b = first; b <= n; b += step) out.push({ at: b, text: g.fromCentre ? b - centre(axis, s) : origin(g, axis) + b - 1 });
  return out;
}

/** "12, 40" / "12 40" in the chart's numbering → cell, or null if malformed or outside. */
export function parseCellRef(text: string, g: GridNumbering, s: Size): Point | null {
  const m = text.trim().match(/^(-?\d+)\s*[,;\s]\s*(-?\d+)$/);
  if (!m) return null;
  const col = Number(m[1]), row = Number(m[2]);
  const x = g.fromCentre ? col + centre("x", s) : col - g.x0;
  const y = g.fromCentre ? row + centre("y", s) : row - g.y0;
  return x >= 0 && y >= 0 && x < s.w && y < s.h ? { x, y } : null;
}
