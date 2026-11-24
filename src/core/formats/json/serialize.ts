import { LAYERS, layerHandler } from "../../layers/registry";
import type { KeyMap } from "../../layers/types";
import { DEFAULT_GRID } from "../../pattern/createPattern";
import type { CustomColor, KeyEntry, LayerId, Pattern, StampDef } from "../../pattern/types";

/** Stitchwork JSON document. v4 only adds optional fields to v3 (SPEC §9.3, §15). */
export interface PatternFile {
  app: "stitchwork";
  /** Pattern-data schema shared with the single-file app (v1–v4). */
  v: number;
  /** .xbird file format version (XBIRD_VERSION); files without it are version 1. */
  xbird?: number;
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
  /** Thread brands chosen for the pattern (SPEC §15.28); absent = DMC. */
  brands?: string[];
  onlyBrand?: boolean;
  /** Bead brands chosen for the pattern (SPEC §15.31); absent = all built-in. */
  beadBrands?: string[];
  onlyBeadBrand?: boolean;
  noBeads?: boolean;
  grid?: Pattern["grid"];
  part?: unknown[];
  knots?: number[][];
  amb?: number[];
  refs?: unknown[];
  underlay?: unknown;
  /** Active work time in whole seconds. */
  spent?: number;
  /** Symbol matching: learned photo examples per key entry (SPEC §15.11). Optional; older apps ignore it. */
  samples?: Record<string, string[]>;
  /** Stamps on the chart (ARCHITECTURE-REVIEW §3): `[x, y, w, h, key, stamp id, …turn]`. */
  stamps?: unknown[];
  /** The pattern's own stamps (drawn by the user); the built-in ones aren't written. */
  stampDefs?: StampDef[];
  /** The pattern's versions (automatic snapshots), oldest first; only in .xbird files. */
  versions?: FileVersion[];
  /** When a .xbird was made (ms): tells an older copy of a pattern one has from a newer one (SPEC §15.43). */
  saved?: number;
}

/** A version inside a .xbird file: the pattern as it was then, without pictures or nested versions. */
export interface FileVersion {
  time: number;
  reason: string;
  doc: PatternFile;
}

export const FORMAT_VERSION = 4;

/**
 * The .xbird file format version (docs/RELEASING.md). Bump it only for a change older apps can't read correctly,
 * and add the matching step to XBIRD_MIGRATIONS in parse.ts so older files keep opening. Files without it are 1.
 */
export const XBIRD_VERSION = 1;

/** Layer fields written only when the layer has content (partials, knots, ambiguous marks, stamps…): from the registry. */
export const OPTIONAL_LAYER_FIELDS: readonly [string, LayerId][] = LAYERS.filter((l) => !l.alwaysWritten).map((l) => [l.fileField, l.id]);

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
  if (p.brands?.length && !(p.brands.length === 1 && p.brands[0] === "DMC")) doc.brands = [...p.brands];
  if (p.onlyBrand) doc.onlyBrand = true;
  if (p.beadBrands?.length) doc.beadBrands = [...p.beadBrands];
  if (p.onlyBeadBrand) doc.onlyBeadBrand = true;
  if (p.noBeads) doc.noBeads = true;
  if (JSON.stringify(p.grid) !== JSON.stringify(DEFAULT_GRID)) doc.grid = p.grid;
  if (p.spent >= 1000) doc.spent = Math.round(p.spent / 1000);
  if (p.samples && Object.keys(p.samples).length) doc.samples = p.samples;
  // own stamps the key uses (or used: kept while the pattern has them)
  if (p.stamps && Object.keys(p.stamps).length) doc.stampDefs = Object.values(p.stamps).map((d) => ({ ...d, lines: d.lines.map((l) => ({ ...l })) }));
  for (const [field, id] of OPTIONAL_LAYER_FIELDS) {
    const h = layerHandler(id);
    if (!h.isEmpty(h.get(p.layers))) (doc as unknown as Record<string, unknown>)[field] = layer(id);
  }
  return doc;
}
