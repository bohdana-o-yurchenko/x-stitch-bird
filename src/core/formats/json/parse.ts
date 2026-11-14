import { libraryColor } from "../../catalog/catalog";
import { LAYERS } from "../../layers/registry";
import { cleanEntry } from "../../pattern/keyEntries";
import { cleanMeta } from "../../pattern/meta";
import { createPattern, DEFAULT_FABRIC, DEFAULT_GRID } from "../../pattern/createPattern";
import type { CustomColor, GridNumbering, KeyEntry, Pattern } from "../../pattern/types";
import { normalizeSymbol } from "../../symbols/symbols";
import { OPTIONAL_LAYER_FIELDS, type PatternFile } from "./serialize";

export class PatternFormatError extends Error {}

const LAYER_FIELD: Record<string, string> = { stitches: "s", beads: "b", segments: "back", ...Object.fromEntries(OPTIONAL_LAYER_FIELDS.map(([f, id]) => [id, f])) };

/** v1 key entries were `{ id, sym }` and always full crosses or beads. */
function migrateV1Key(raw: { id: string; sym: string }, strands: number): Omit<KeyEntry, "sym"> & { sym: string } {
  const bead = libraryColor(raw.id)?.kind === "bead";
  return bead
    ? { t: "bead", src: raw.id, sym: raw.sym }
    : { t: "thread", src: raw.id, n: raw.id.startsWith("blend:") ? null : strands, st: "full", sym: raw.sym };
}

function cleanGrid(raw: unknown): GridNumbering {
  const g = (raw ?? {}) as Partial<GridNumbering>;
  return {
    x0: Number.isFinite(g.x0) ? Number(g.x0) : DEFAULT_GRID.x0,
    y0: Number.isFinite(g.y0) ? Number(g.y0) : DEFAULT_GRID.y0,
    label: g.label === 5 ? 5 : 10,
    fromCentre: !!g.fromCentre,
  };
}

/** Reads any Stitchwork JSON (v1–v4). `symbols` normalises chart symbols to this device's set. */
export function parsePattern(raw: unknown, symbols: readonly string[]): { pattern: Pattern; refs: unknown[] | null } {
  const d = raw as Partial<PatternFile> & { pal?: unknown[] };
  if (!d || d.app !== "stitchwork" || !d.w || !d.h) throw new PatternFormatError("Not a Stitchwork pattern file");
  const p = createPattern(d.w, d.h, d.name || "Untitled pattern");
  if (d.id) p.id = d.id;
  p.count = d.count || 14;
  p.strands = d.strands || 2;
  p.fabric = d.fabric || DEFAULT_FABRIC;
  p.blends = d.blends ?? {};
  p.combos = d.combos ?? {};
  p.customs = Object.fromEntries(Object.values(d.customs ?? {}).map((c: CustomColor) => [c.id, { ...c }]));
  p.meta = cleanMeta(d.meta);
  p.grid = cleanGrid(d.grid);
  const v = d.v ?? 1;
  const pal = (d.pal ?? []).map((e) => {
    if (!e) return null;
    const entry = v < 2 ? migrateV1Key(e as unknown as { id: string; sym: string }, d.strands || 2) : (e as KeyEntry);
    return cleanEntry(entry, normalizeSymbol(entry.sym, symbols));
  });
  p.key = [null, ...pal];
  const size = { w: p.w, h: p.h };
  for (const l of LAYERS) l.set(p.layers, l.parse((d as Record<string, unknown>)[LAYER_FIELD[l.id]!], size));
  return { pattern: p, refs: Array.isArray(d.refs) ? d.refs : null };
}
