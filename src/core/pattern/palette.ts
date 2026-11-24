import { beadShape, type BeadShape } from "../catalog/beadShapes";
import { entryKind, usesLineStyles } from "../entryKinds/registry";
import { blendStrands, resolveColor } from "./resolve";
import type { EntryKindId, Pattern, StampDef, StitchTypeId } from "./types";
import { stampDef } from "../stamps/stamps";
import { DEFAULT_LINE_INK } from "../symbols/lineInks";

export interface PaletteSlot {
  hex: string;
  ink: string;
  sym: string;
  t: EntryKindId;
  st: StitchTypeId;
  /** Strands (blends: total of parts). */
  n: number;
  bead?: { hex: string; ink: string; shape: BeadShape };
  /** Backstitch: the line's colour on the Symbols view (black unless chosen). */
  lineInk?: string;
  /** Backstitch placed as a stamp: its shape (the key icon draws it). */
  stamp?: StampDef;
}

/** Everything drawing needs per key index, resolved once per key change (SPEC §3.3). */
export type Palette = (PaletteSlot | undefined)[];

export function buildPalette(p: Pattern): Palette {
  return p.key.map((e) => {
    if (!e) return undefined;
    const c = resolveColor(p, e.src);
    const beads = entryKind(e.t).beads, b = beads === "withFloss" ? c?.bead : beads === "only" ? c : undefined;
    return {
      hex: c?.hex ?? "#FF00FF",
      ink: c?.ink ?? "#000",
      sym: e.sym,
      ...(usesLineStyles(e.t) ? { lineInk: e.ink ?? DEFAULT_LINE_INK } : {}),
      t: e.t,
      st: e.st ?? "full",
      n: e.n || (c?.isBlend ? blendStrands(c) : 1),
      bead: b && { hex: b.hex, ink: b.ink, shape: beadShape(b.series) },
      ...(e.stamp && stampDef(p, e.stamp) ? { stamp: stampDef(p, e.stamp) } : {}),
    };
  });
}
