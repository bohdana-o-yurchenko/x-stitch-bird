import { libraryColor } from "../../catalog/catalog";
import { createPattern, MAX_SIZE, shortId } from "../../pattern/createPattern";
import { addEntry, keyFor } from "../../pattern/keyEntries";
import { canPlacePartial } from "../../pattern/occupancy";
import type { Corner, KeyEntry, KeyIndex, Pattern, StitchTypeId } from "../../pattern/types";
import { resolveCode, type OxsImportOptions, type OxsImportReport } from "../oxs/importOxs";
import { readXsd, XsdFormatError, type XsdCell, type XsdCorner, type XsdPaletteItem, type XsdStrands } from "./readXsd";
import { XSD_ANCHOR, XSD_BLEND, XSD_BRANDS, XSD_DIMENSIONS, XSD_DMC, XSD_MADEIRA, XSD_MILL_HILL, XSD_PRECIOSA } from "./threadBrands";

export { XsdFormatError };

/*
 * A Pattern Maker chart (`.xsd`, readXsd.ts) as a pattern here: its colours matched to the brands here like an .oxs's
 * (importOxs.ts), each stitch kind with its own strands. Straight and special stitches (Smyrna crosses) become
 * backstitch lines; a half and a quarter of one colour that make a three-quarter become one.
 */

const CORNER: Record<XsdCorner, Corner> = { tl: 0, tr: 1, br: 2, bl: 3 };
/** The corners a half's diagonal leaves free: where a quarter makes it a three-quarter. */
const FREE: Record<"/" | "\\", Corner[]> = { "/": [0, 2], "\\": [1, 3] };

const FIT_COUNTS = [11, 14, 16, 18, 20, 24, 31];

export function importXsd(data: Uint8Array, symbols: readonly string[], opts: OxsImportOptions & { name?: string } = {}): { pattern: Pattern; report: OxsImportReport } {
  const project = opts.unmatched === "project";
  const x = readXsd(data);
  if (x.width > MAX_SIZE || x.height > MAX_SIZE) throw new XsdFormatError(`larger than ${MAX_SIZE} × ${MAX_SIZE}`);
  const w = x.width, h = x.height;
  const p = createPattern(w, h, x.info.title || opts.name || "Imported pattern");
  p.count = FIT_COUNTS.includes(x.count) ? x.count : 14;
  if (/^[0-9A-F]{6}$/.test(x.fabric.color)) p.fabric = "#" + x.fabric.color;
  const meta = p.meta;
  if (x.info.author) meta.designer = x.info.author;
  if (x.info.company) meta.publisher = x.info.company;
  if (x.info.copyright) meta.copyright = x.info.copyright;
  if (x.info.notes) meta.instructions = x.info.notes;

  /** A colour from a brand id and its number: the library's when it has it, else one of the pattern's own. */
  const colour = (brand: number, number: string, name: string, hex: string, bead: boolean): string => {
    const num = number.trim();
    if (brand === XSD_DIMENSIONS) {
      const hit = libraryColor(`dimensions:${num}`);
      if (hit) return hit.id;
    }
    const code =
      brand === XSD_DMC || XSD_MILL_HILL.includes(brand) ? num
      : brand === XSD_ANCHOR ? `Anchor ${num}`
      : brand === XSD_MADEIRA ? `Madeira ${num}`
      : brand === XSD_PRECIOSA ? `PREC ${num}`
      // another brand: kept under its name ("Kreinik Blending Filament 032")
      : `${(XSD_BRANDS[brand] ?? "Thread").replace(/[,"]/g, "")} ${num}`;
    return resolveCode(code, name, hex, bead || XSD_MILL_HILL.includes(brand) || brand === XSD_PRECIOSA, p.customs, project);
  };

  /** Each palette item: a thread (or a blend of them) or a bead. */
  const items = x.palette.map((it: XsdPaletteItem): { thread?: string; bead?: string; blend?: boolean } => {
    const bead = it.bead || XSD_MILL_HILL.includes(it.brand) || it.brand === XSD_PRECIOSA;
    if (bead) return { bead: colour(it.brand, it.number, it.name, it.color, true) };
    if (it.blend.length >= 2 || (it.brand === XSD_BLEND && it.blend.length)) {
      if (it.blend.length === 1) return { thread: colour(it.blend[0]!.brand, it.blend[0]!.number, "", it.color, false) };
      const id = shortId("blend");
      p.blends[id] = { parts: it.blend.map((b) => ({ id: colour(b.brand, b.number, "", it.color, false), n: Math.max(1, b.strands || 1) })) };
      return { thread: id, blend: true };
    }
    return { thread: colour(it.brand, it.number, it.name, it.color, false) };
  });

  // the notes Pattern Maker keeps per colour ("ecru half cross st. 2 strands"): with the pattern's instructions
  const notes = x.palette.flatMap((it) => (it.notes.length ? [`${[it.number, it.name].filter(Boolean).join(" ")}: ${it.notes.join("; ")}`] : []));
  if (notes.length) meta.instructions = [meta.instructions, notes.join("\n")].filter(Boolean).join("\n\n");

  const strands = (pal: number, kind: keyof XsdStrands) => {
    const n = x.palette[pal]?.strands[kind] || x.defaults[kind] || (kind === "back" || kind === "straight" ? 1 : 2);
    return Math.max(1, Math.min(6, n));
  };
  const entry = (e: Omit<KeyEntry, "sym">): KeyIndex => keyFor(p, e, symbols);
  /** A thread in a cell (or the bead, for a bead's palette item). */
  const stitch = (pal: number, st: StitchTypeId, kind: keyof XsdStrands): KeyIndex => {
    const it = items[pal];
    if (!it) return 0;
    if (it.bead) return entry({ t: "bead", src: it.bead });
    if (!it.thread) return 0;
    return entry({ t: "thread", src: it.thread, n: it.blend ? null : strands(pal, kind), st });
  };
  /** A bead sewn on a grid point: its own entry, not the same bead's in cells (which `keyFor` would give). */
  const pointBead = (src: string): KeyIndex => {
    const i = p.key.findIndex((e) => e?.t === "bead" && e.src === src && e.st === "point");
    return i > 0 ? i : addEntry(p, { t: "bead", src, st: "point" }, symbols);
  };
  const line = (pal: number, kind: "back" | "straight" | "special"): KeyIndex => {
    const it = items[pal];
    const src = it?.thread ?? it?.bead;
    return src ? entry({ t: "back", src, n: it?.blend ? null : strands(pal, kind) }) : 0;
  };

  const { stitches, beads, partials, segments, knots } = p.layers;
  let simplified = x.skipped;
  const at = (c: { x: number; y: number }) => c.y * w + c.x;
  const isBead = (pal: number) => !!items[pal]?.bead;

  // the cells: full crosses, then each cell's halves, quarters and petites together
  const parts = new Map<number, XsdCell[]>();
  for (const c of x.cells) {
    if (c.kind === "full") {
      const k = stitch(c.pal, "full", "full");
      if (isBead(c.pal)) beads[at(c)] = k;
      else stitches[at(c)] = k;
    } else parts.set(at(c), [...(parts.get(at(c)) ?? []), c]);
  }
  for (const [i, cell] of parts) {
    const halves = cell.filter((c) => c.kind === "half");
    const quarters = cell.filter((c) => c.kind === "quarter");
    for (const half of halves) {
      if (half.kind !== "half") continue;
      // a quarter of the same colour on a free corner: a three-quarter
      const q = quarters.find((c) => c.kind === "quarter" && c.pal === half.pal && FREE[half.dir].includes(CORNER[c.corner]));
      if (q && q.kind === "quarter" && !isBead(half.pal)) {
        quarters.splice(quarters.indexOf(q), 1);
        const k = stitch(half.pal, "full", "half");
        if (k && canPlacePartial(p, i, "threeQuarter", CORNER[q.corner])) partials.set(i, [...(partials.get(i) ?? []), { kind: "threeQuarter", corner: CORNER[q.corner], k }]);
        else simplified++;
      } else if (!stitches[i] && !isBead(half.pal)) stitches[i] = stitch(half.pal, half.dir === "/" ? "half" : "halfb", "half");
      else simplified++;
    }
    for (const c of [...quarters, ...cell.filter((c) => c.kind === "petite")]) {
      if (c.kind !== "quarter" && c.kind !== "petite") continue;
      const k = isBead(c.pal) ? 0 : stitch(c.pal, "full", c.kind);
      if (k && canPlacePartial(p, i, c.kind, CORNER[c.corner])) partials.set(i, [...(partials.get(i) ?? []), { kind: c.kind, corner: CORNER[c.corner], k }]);
      else simplified++;
    }
  }

  const inside = (v: number, max: number) => Number.isFinite(v) && v >= 0 && v <= max;
  for (const j of x.joints) {
    if (j.kind === "knot" || j.kind === "bead") {
      if (!inside(j.x, w) || !inside(j.y, h)) continue;
      const it = items[j.pal];
      if (j.kind === "knot" && it?.thread) {
        const k = entry({ t: "knot", src: it.thread, n: it.blend ? null : strands(j.pal, "knot") });
        if (k) knots.push({ x: Math.round(j.x * 2) / 2, y: Math.round(j.y * 2) / 2, k });
        continue;
      }
      const src = it?.bead ?? it?.thread;
      if (!src) continue;
      // in the middle of a cell: the cell's bead; on a grid point: a bead sewn there, like a knot
      const mid = j.x % 1 === 0.5 && j.y % 1 === 0.5;
      const k = it?.bead ? (mid ? entry({ t: "bead", src }) : pointBead(src)) : 0;
      if (!k) simplified++;
      else if (mid) beads[Math.floor(j.y) * w + Math.floor(j.x)] = k;
      else knots.push({ x: j.x, y: j.y, k });
      continue;
    }
    if (!("x1" in j)) continue;
    if (![j.x1, j.x2].every((v) => inside(v, w)) || ![j.y1, j.y2].every((v) => inside(v, h))) continue;
    const k = line(j.pal, j.kind);
    if (k) segments.push({ x1: j.x1, y1: j.y1, x2: j.x2, y2: j.y2, k });
  }

  return { pattern: p, report: { simplified, unmatched: Object.keys(p.customs).length } };
}
