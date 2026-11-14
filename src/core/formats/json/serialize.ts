import { layerHandler } from "../../layers/registry";
import type { KeyMap } from "../../layers/types";
import { DEFAULT_GRID } from "../../pattern/createPattern";
import type { CustomColor, KeyEntry, LayerId, Pattern } from "../../pattern/types";

/** Stitchwork JSON document. v4 only adds optional fields to v3 (SPEC §9.3, §15). */
export interface PatternFile {
  app: "stitchwork";
  v: number;
  id: string;
  name: string;
  w: number;
  h: number;
  count: number;
  strands: number;
  fabric: string;
  pal: KeyEntry[];
  blends: Pattern["blends"];
  combos: Pattern["combos"];
  customs: Record<string, CustomColor>;
  s: string;
  b: string;
  back: number[][];
  meta?: Pattern["meta"];
  grid?: Pattern["grid"];
  part?: unknown[];
  knots?: number[][];
  amb?: number[];
  refs?: unknown[];
  underlay?: unknown;
}

export const FORMAT_VERSION = 4;

/** Optional v4 fields: JSON field name → layer. Written only when non-empty. */
export const OPTIONAL_LAYER_FIELDS: readonly [keyof PatternFile, LayerId][] = [
  ["part", "partials"],
  ["knots", "knots"],
  ["amb", "ambiguous"],
];

export function serializePattern(p: Pattern): PatternFile {
  // the file stores the key without gaps: entry i in `pal` is key index i + 1
  const remap = new Map<number, number>();
  const pal: KeyEntry[] = [];
  p.key.forEach((e, i) => {
    if (!e || !i) return;
    pal.push(e);
    remap.set(i, pal.length);
  });
  const map: KeyMap = (k) => remap.get(k) ?? 0;
  const layer = (id: LayerId) => {
    const h = layerHandler(id);
    return h.serialize(h.get(p.layers), map);
  };
  const doc: PatternFile = {
    app: "stitchwork",
    v: FORMAT_VERSION,
    id: p.id,
    name: p.name,
    w: p.w,
    h: p.h,
    count: p.count,
    strands: p.strands,
    fabric: p.fabric,
    pal,
    blends: p.blends,
    combos: p.combos,
    customs: Object.fromEntries(
      Object.entries(p.customs).map(([k, c]) => [k, { id: c.id, kind: c.kind, brand: c.brand, code: c.code, name: c.name, hex: c.hex, series: c.series }]),
    ),
    s: layer("stitches") as string,
    b: layer("beads") as string,
    back: layer("segments") as number[][],
  };
  if (Object.keys(p.meta).length) doc.meta = p.meta;
  if (JSON.stringify(p.grid) !== JSON.stringify(DEFAULT_GRID)) doc.grid = p.grid;
  for (const [field, id] of OPTIONAL_LAYER_FIELDS) {
    const h = layerHandler(id);
    if (!h.isEmpty(h.get(p.layers))) (doc as unknown as Record<string, unknown>)[field] = layer(id);
  }
  return doc;
}
