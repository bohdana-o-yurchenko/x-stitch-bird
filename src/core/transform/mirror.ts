import type { Size } from "../pattern/types";
import { TRANSFORMS, type CellTransform } from "./cellTransform";

export type MirrorMode = "off" | "vertical" | "horizontal" | "quad";

export const MIRROR_MODES: readonly MirrorMode[] = ["off", "vertical", "horizontal", "quad"];

/** The transforms that produce the mirrored copies for a drawing mode (the original is not included). */
export function mirrorTransforms(mode: MirrorMode): CellTransform[] {
  if (mode === "vertical") return [TRANSFORMS.flipH];
  if (mode === "horizontal") return [TRANSFORMS.flipV];
  if (mode === "quad") return [TRANSFORMS.flipH, TRANSFORMS.flipV, TRANSFORMS.rot180];
  return [];
}

/** Original cell plus its mirror images, each with whether the copy swaps ╱ / ╲. */
export function mirrorCells(x: number, y: number, mode: MirrorMode, size: Size): { x: number; y: number; swap: boolean }[] {
  const out = [{ x, y, swap: false }];
  for (const t of mirrorTransforms(mode)) {
    const [mx, my] = t.cell(x, y, size);
    if (!out.some((o) => o.x === mx && o.y === my)) out.push({ x: mx, y: my, swap: t.swapsDiagonal });
  }
  return out;
}

export function mirrorPoints(x: number, y: number, mode: MirrorMode, size: Size): { x: number; y: number; t: CellTransform | null }[] {
  const out: { x: number; y: number; t: CellTransform | null }[] = [{ x, y, t: null }];
  for (const t of mirrorTransforms(mode)) {
    const [mx, my] = t.point(x, y, size);
    if (!out.some((o) => o.x === mx && o.y === my)) out.push({ x: mx, y: my, t });
  }
  return out;
}
