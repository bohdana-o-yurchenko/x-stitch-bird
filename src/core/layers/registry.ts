import type { LayerId } from "../pattern/types";
import { ambiguousLayer } from "./ambiguous";
import { beadsLayer, stitchesLayer } from "./dense";
import { partialsLayer } from "./partials";
import { knotsLayer, segmentsLayer } from "./points";
import type { LayerHandler } from "./types";

/** Every layer on the chart. Order = drawing order of the content layers. */
export const LAYERS: readonly LayerHandler[] = [
  stitchesLayer,
  partialsLayer,
  beadsLayer,
  segmentsLayer,
  knotsLayer,
  ambiguousLayer,
] as LayerHandler[];

export const layerHandler = (id: LayerId): LayerHandler => LAYERS.find((l) => l.id === id)!;

/** Picker order: knots and backstitch first, then beads, partials, stitches (SPEC §6.2, §15.14). */
export const PICK_ORDER: readonly LayerHandler[] = [...LAYERS].sort((a, b) => a.pickPriority - b.pickPriority);
