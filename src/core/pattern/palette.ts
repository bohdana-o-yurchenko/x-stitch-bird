import { beadShape, type BeadShape } from "../catalog/beadShapes";
import { blendStrands, resolveColor } from "./resolve";
import type { EntryKindId, Pattern, StitchTypeId } from "./types";

export interface PaletteSlot {
  hex: string;
  ink: string;
  sym: string;
  t: EntryKindId;
  st: StitchTypeId;
  /** Strands (blends: total of parts). */
  n: number;
  bead?: { hex: string; ink: string; shape: BeadShape };
}

/** Everything drawing needs per key index, resolved once per key change (SPEC §3.3). */
export type Palette = (PaletteSlot | undefined)[];

export function buildPalette(p: Pattern): Palette {
  return p.key.map((e) => {
    if (!e) return undefined;
    const c = resolveColor(p, e.src);
    const b = e.t === "combo" ? c?.bead : e.t === "bead" ? c : undefined;
    return {
      hex: c?.hex ?? "#FF00FF",
      ink: c?.ink ?? "#000",
      sym: e.sym,
      t: e.t,
      st: e.st ?? "full",
      n: e.n || (c?.isBlend ? blendStrands(c) : 1),
      bead: b && { hex: b.hex, ink: b.ink, shape: beadShape(b.series) },
    };
  });
}
