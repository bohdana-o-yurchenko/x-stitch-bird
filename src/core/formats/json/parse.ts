import { libraryColor } from "../../catalog/catalog";
import { LAYERS } from "../../layers/registry";
import { cleanEntry, fixEntrySymbols } from "../../pattern/keyEntries";
import { cleanMeta } from "../../pattern/meta";
import { createPattern, DEFAULT_FABRIC, DEFAULT_GRID } from "../../pattern/createPattern";
import type { CustomColor, GridNumbering, KeyEntry, Pattern } from "../../pattern/types";
import { normalizeSymbol } from "../../symbols/symbols";
import { cleanUnderlay, type UnderlayData } from "../../underlay/underlay";
import { OPTIONAL_LAYER_FIELDS, XBIRD_VERSION, type FileVersion, type PatternFile } from "./serialize";

export class PatternFormatError extends Error {}

/** The file was written by a newer пташечка (a higher .xbird version than this app knows). */
export class NewerFileError extends PatternFormatError {}

/**
 * Upgrades for older .xbird files: XBIRD_MIGRATIONS[n] turns a version-n file into version n + 1. Empty while the
 * format is at version 1; every XBIRD_VERSION bump adds one step here (docs/RELEASING.md).
 */
const XBIRD_MIGRATIONS: Record<number, (d: PatternFile) => PatternFile> = {};

/** Brings a file up to XBIRD_VERSION; refuses files from a newer app. */
export function upgradeFile(d: PatternFile): PatternFile {
  const from = Number.isInteger(d.xbird) && d.xbird! >= 1 ? d.xbird! : 1;
  if (from > XBIRD_VERSION) throw new NewerFileError(`File format ${from} is newer than ${XBIRD_VERSION}`);
  let out = d;
  for (let n = from; n < XBIRD_VERSION; n++) out = XBIRD_MIGRATIONS[n]!(out);
  return { ...out, xbird: XBIRD_VERSION };
}

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

const isDoc = (d: unknown): d is PatternFile => !!d && typeof d === "object" && (d as PatternFile).app === "stitchwork" && !!(d as PatternFile).w && !!(d as PatternFile).h;

/** The versions a .xbird file carries, oldest first; anything malformed is skipped. */
export function cleanVersions(raw: unknown): FileVersion[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((v): v is FileVersion => !!v && Number.isFinite(v.time) && isDoc(v.doc))
    .map((v) => ({ time: Number(v.time), reason: typeof v.reason === "string" ? v.reason : "timer", doc: v.doc }))
    .sort((a, b) => a.time - b.time);
}

/** Reads any Stitchwork JSON (v1–v4). `symbols` normalises chart symbols to this device's set. */
export function parsePattern(raw: unknown, symbols: readonly string[]): { pattern: Pattern; refs: unknown[] | null; underlay: UnderlayData | null; versions: FileVersion[] } {
  if (!isDoc(raw)) throw new PatternFormatError("Not a Stitchwork pattern file");
  const d = upgradeFile(raw) as Partial<PatternFile> & PatternFile & { pal?: unknown[] };
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
  p.spent = Number.isFinite(d.spent) && d.spent! > 0 ? d.spent! * 1000 : 0;
  const v = d.v ?? 1;
  const pal = (d.pal ?? []).map((e) => {
    if (!e) return null;
    const entry = v < 2 ? migrateV1Key(e as unknown as { id: string; sym: string }, d.strands || 2) : (e as KeyEntry);
    return cleanEntry(entry, normalizeSymbol(entry.sym, symbols));
  });
  p.key = [null, ...pal];
  fixEntrySymbols(p, symbols);
  const size = { w: p.w, h: p.h };
  for (const l of LAYERS) l.set(p.layers, l.parse((d as unknown as Record<string, unknown>)[LAYER_FIELD[l.id]!], size));
  return { pattern: p, refs: Array.isArray(d.refs) ? d.refs : null, underlay: cleanUnderlay(d.underlay), versions: cleanVersions(d.versions) };
}
