import { DMC_BY_CODE, DMC, libraryColor, PRECIOSA } from "../../catalog/catalog";
import { applyMaterials, ORGANIZER, type Materials } from "../../pattern/brands";
import { createPattern, MAX_SIZE, shortId } from "../../pattern/createPattern";
import { keyFor } from "../../pattern/keyEntries";
import type { Corner, CustomColor, KeyEntry, KeyIndex, Pattern, StitchTypeId } from "../../pattern/types";
import { snapHalf } from "../../geometry/geometry";
import { cornerAt } from "./partials";
import { parseXml, type XmlElement } from "./xml";

export class OxsFormatError extends Error {}

export interface OxsImportReport {
  /** Quarter stitches or ornaments simplified or skipped. */
  simplified: number;
  /** Colours whose number matched no brand here (and weren't this app's own): made into colours of one's own. */
  unmatched: number;
}

export interface OxsImportOptions {
  /** Where colours that match no brand go: under a brand of one's own (default), or the project's own palette (SPEC §15.52). */
  unmatched?: "own" | "project";
}

const DMC_LC = new Map(DMC.map((e) => [e.code.toLowerCase(), e]));
DMC_LC.set("blanc", DMC_BY_CODE.get("White")!);
DMC_LC.set("wht", DMC_BY_CODE.get("White")!);

/** Brands other apps name in an OXS number or name, and their catalogue prefixes. */
const OTHER_BRANDS = [
  { prefix: "anchor", re: /^(anchor|anc)\s*[-:#]?\s*/i },
  { prefix: "madeira", re: /^(madeira|mad)\s*[-:#]?\s*/i },
];

/** A number this app writes for a brand of your own (SPEC §15.42): "Kreinik 032" — a brand, then a code. */
const OWN_BRAND = /^([\p{L}][\p{L}\p{N} .&'’-]*?)\s+([\p{L}\p{N}][\p{L}\p{N}.\/-]*)$/u;

/** OXS colour number → library id, or a new custom colour (SPEC §12.2, §15.42). */
function resolveCode(number: string | undefined, name: string | undefined, color: string | undefined, asBead: boolean, customs: Record<string, CustomColor>, project = false): string {
  const num = (number ?? "").trim();
  // another brand, named in the number ("Anchor 403", "ANC-403") or the name ("Madeira Black")
  const other = OTHER_BRANDS.find((b) => b.re.test(num) || b.re.test((name ?? "").trim()));
  if (other && !asBead) {
    const raw = num.replace(other.re, "").trim().replace(/^0+(?=\d)/, "");
    const hit = libraryColor(`${other.prefix}:${raw}`) ?? libraryColor(`${other.prefix}:${raw.padStart(4, "0")}`);
    if (hit) return hit.id;
  }
  // Preciosa beads, "PREC 17050" — of the plain article, else the first with that code
  const prec = /^(prec|preciosa)\s*[-:#]?\s*(.+)$/i.exec(num);
  if (prec && asBead) {
    const code = prec[2]!.trim();
    const hit = libraryColor(`preciosa:${code}`) ?? PRECIOSA.find((e) => e.code === code);
    if (hit) return hit.id;
  }
  const code = num.replace(/^(dmc|mill\s*hill|mh)\s*[-:#]?\s*/i, "").trim();
  if (asBead) {
    const c = /^\d+$/.test(code) ? code.padStart(5, "0") : code;
    if (libraryColor(`bead:${c}`)) return `bead:${c}`;
  } else if (code === num || /^dmc/i.test(num)) {
    // a bare number (or DMC's): a DMC colour, as every app takes it
    const e = DMC_LC.get(code.toLowerCase().replace(/^0+(?=\d)/, "")) ?? DMC_LC.get(code.toLowerCase());
    if (e) return e.id;
  }
  const hex = "#" + (color && /^[0-9a-f]{6}$/i.test(color) ? color : "999999");
  // the project's own palette: the number as it is, one colour per number
  if (project) {
    const pc = num || code || "?";
    const same = Object.values(customs).find((c) => c.brand === ORGANIZER && c.kind === (asBead ? "bead" : "thread") && c.code.toLowerCase() === pc.toLowerCase());
    if (same) return same.id;
    const pid = shortId("custom");
    customs[pid] = { id: pid, kind: asBead ? "bead" : "thread", brand: ORGANIZER, code: pc, name: "", hex };
    return pid;
  }
  // not one of the app's: a colour of one's own — under its brand when the number names one ("Kreinik 032")
  const own = !other && !prec && !/^(dmc|mill\s*hill|mh)\b/i.test(num) ? OWN_BRAND.exec(num) : null;
  const id = shortId("custom");
  customs[id] = {
    id, kind: asBead ? "bead" : "thread", brand: own ? own[1]!.trim() : asBead ? "Bead" : "Thread",
    code: (own ? own[2]! : code) || "?", name: name || code || "Colour", hex,
  };
  return id;
}

/** What a palette item of this app's own stands for (SPEC §15.42), or null for anyone else's. */
interface Exact {
  entries: Omit<KeyEntry, "sym">[] & { sym?: string }[];
  customs?: Record<string, CustomColor>;
  blends?: Pattern["blends"];
  combos?: Pattern["combos"];
}
function exactOf(raw: string | undefined): Exact | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Exact;
    return Array.isArray(v?.entries) && v.entries.every((e) => e && typeof e.t === "string" && typeof e.src === "string") ? v : null;
  } catch {
    return null;
  }
}

const isBeadCode = (c: string) => /^(prec|preciosa)\b/i.test(c.trim()) || /^\d{5}$/.test(c.trim().replace(/^(mill\s*hill|mh)\s*/i, ""));
const clamp = (v: number, lo: number, hi: number, d: number) => Math.max(lo, Math.min(hi, v || d));

interface ItemRecord {
  thread: string;
  strands: number;
  bs: number;
  combo?: string;
  bead?: string;
  /** This app's own file: the exact key entries (SPEC §15.42). */
  exact?: Exact;
}

export function importOxs(text: string, symbols: readonly string[], opts: OxsImportOptions = {}): { pattern: Pattern; report: OxsImportReport } {
  const project = opts.unmatched === "project";
  let exactCustoms = 0;
  const els = parseXml(text);
  const pick = (name: string, parent: string) => els.filter((e) => e.name === name && e.path[e.path.length - 1] === parent);
  const pr = els.find((e) => e.name === "properties");
  if (!pr) throw new OxsFormatError("no properties");
  const w = Number(pr.attrs.chartwidth), h = Number(pr.attrs.chartheight);
  if (!(w > 0 && h > 0)) throw new OxsFormatError("no size");
  if (w > MAX_SIZE || h > MAX_SIZE) throw new OxsFormatError(`larger than ${MAX_SIZE} × ${MAX_SIZE}`);
  const p = createPattern(w, h, pr.attrs.charttitle || "Imported pattern");
  const spi = Number(pr.attrs.stitchesperinch);
  p.count = [11, 14, 16, 18, 20, 24, 31].includes(spi) ? spi : 14;
  if (pr.attrs.author) p.meta.designer = pr.attrs.author;
  if (pr.attrs.copyright) p.meta.copyright = pr.attrs.copyright;
  if (pr.attrs.instructions) p.meta.instructions = pr.attrs.instructions;
  // this app's own: the pattern's brands (SPEC §15.42)
  try {
    const m = pr.attrs.stitchwork_materials ? (JSON.parse(pr.attrs.stitchwork_materials) as Materials) : null;
    if (m && Array.isArray(m.brands) && Array.isArray(m.beadBrands)) applyMaterials(p, m);
  } catch {
    // someone else's file, or broken: the brands the colours have
  }

  const objects = pick("object", "ornaments_inc_knots_and_beads");
  const beadIndexes = new Set(objects.filter((o) => /^bead/i.test(o.attrs.objecttype ?? "")).map((o) => o.attrs.palindex));
  const items = new Map<string, ItemRecord>();
  for (const it of pick("palette_item", "palette")) {
    const { index = "", number = "", name = "", color = "" } = it.attrs;
    if (index === "0" || number.toLowerCase() === "cloth") {
      if (/^[0-9a-f]{6}$/i.test(color)) p.fabric = "#" + color;
      continue;
    }
    const strands = clamp(Number(it.attrs.strands), 1, 6, 2), bs = clamp(Number(it.attrs.bsstrands), 1, 6, 1);
    // this app's own file: exactly what it was — its own colours, blends and floss + bead under their ids
    const exact = exactOf(it.attrs.stitchwork);
    if (exact) {
      Object.assign(p.customs, exact.customs ?? {});
      exactCustoms += Object.keys(exact.customs ?? {}).length;
      Object.assign(p.blends, exact.blends ?? {});
      Object.assign(p.combos, exact.combos ?? {});
      items.set(index, { thread: "", strands, bs, exact });
      continue;
    }
    const blends = it.children.filter((c: XmlElement) => c.name === "blend");
    const parts = blends.length
      ? blends.map((b) => ({ number: b.attrs.number ?? "", name: b.attrs.name, color: b.attrs.color, n: Number(b.attrs.strands) || 1 }))
      : number.includes("+") ? number.split("+").map((x) => ({ number: x.trim(), name: "", color: "", n: 0 })) : [];
    const bp = parts.filter((q) => isBeadCode(q.number)), tp = parts.filter((q) => !isBeadCode(q.number));
    const rec: ItemRecord = { thread: "", strands, bs };
    if (parts.length === 2 && bp.length === 1 && tp.length === 1) {
      const bead = resolveCode(bp[0]!.number, bp[0]!.name, bp[0]!.color, true, p.customs, project);
      rec.thread = resolveCode(tp[0]!.number, tp[0]!.name, tp[0]!.color || color, false, p.customs, project);
      rec.combo = shortId("combo");
      p.combos[rec.combo] = { thread: rec.thread, bead };
      rec.strands = clamp(tp[0]!.n, 1, 6, strands);
    } else if (blends.length >= 2) {
      rec.thread = shortId("blend");
      p.blends[rec.thread] = { parts: blends.map((b) => ({ id: resolveCode(b.attrs.number, b.attrs.name, b.attrs.color, false, p.customs, project), n: Math.max(1, Number(b.attrs.strands) || 1) })) };
    } else rec.thread = resolveCode(number, name, color, false, p.customs, project);
    if (beadIndexes.has(index)) rec.bead = resolveCode(number, name, color, true, p.customs, project);
    items.set(index, rec);
  }

  // this app's own file: the key as it was, in its order — before the chart puts anything in it
  for (const r of items.values()) r.exact?.entries.forEach((e) => keyFor(p, e as KeyEntry, symbols));

  type Use = StitchTypeId | "bead" | "back" | "knot" | "pointBead";
  /** This app's own file: the entry the item stood for, used as `use` — created once, its symbol as it was. */
  const exactKey = (x: Exact, use: Use): KeyIndex => {
    const fits = (e: Exact["entries"][number]) =>
      use === "back" ? e.t === "back" : use === "knot" ? e.t === "knot" : use === "bead" ? e.t === "bead" && e.st !== "point" : use === "pointBead" ? e.st === "point" : (e.t === "thread" || e.t === "combo") && (e.st ?? "full") === use;
    const e = x.entries.find(fits) ?? x.entries[0];
    return e ? keyFor(p, e as KeyEntry, symbols) : 0;
  };
  const key = (index: string | undefined, use: Use): KeyIndex => {
    const r = items.get(index ?? "");
    if (!r) return 0;
    if (r.exact) return exactKey(r.exact, use);
    const blend = r.thread.startsWith("blend:");
    const k = (e: Omit<KeyEntry, "sym">) => keyFor(p, e, symbols);
    if (use === "bead" || use === "pointBead") return r.bead ? k({ t: "bead", src: r.bead, ...(use === "pointBead" && { st: "point" as StitchTypeId }) }) : 0;
    if (use === "back") return k({ t: "back", src: r.thread, n: blend ? null : r.bs });
    if (use === "knot") return k({ t: "knot", src: r.thread, n: blend ? null : r.strands });
    if (r.combo) return k({ t: "combo", src: r.combo, n: r.strands, st: use });
    return k({ t: "thread", src: r.thread, n: blend ? null : r.strands, st: use });
  };

  let simplified = 0;
  const { stitches, beads, partials, segments, knots } = p.layers;
  const cell = (x: number, y: number) => (x >= 0 && y >= 0 && x < w && y < h ? y * w + x : -1);
  const addPartial = (i: number, kind: "quarter" | "threeQuarter" | "petite", corner: Corner, k: KeyIndex) => {
    if (i >= 0 && k) partials.set(i, [...(partials.get(i) ?? []), { kind, corner, k }]);
  };
  for (const s of pick("stitch", "fullstitches")) {
    const i = cell(Number(s.attrs.x), Number(s.attrs.y)), v = key(s.attrs.palindex, "full");
    if (i >= 0 && v) stitches[i] = v;
  }
  for (const s of pick("partstitch", "partstitches")) {
    const i = cell(Number(s.attrs.x), Number(s.attrs.y)), d = s.attrs.direction;
    if (i < 0) continue;
    const a = s.attrs.palindex1, b = s.attrs.palindex2;
    if (d === "3" || d === "4") {
      const v = key(a && a !== "0" ? a : b, d === "3" ? "half" : "halfb");
      if (v) stitches[i] = v;
    } else if (d === "1" || d === "2") {
      const [ca, cb]: Corner[] = d === "2" ? [0, 2] : [1, 3];
      if (a && a !== "0") addPartial(i, "threeQuarter", ca!, key(a, "full"));
      if (b && b !== "0") addPartial(i, "threeQuarter", cb!, key(b, "full"));
    } else {
      const v = key(a && a !== "0" ? a : b, "full");
      if (v && !stitches[i]) stitches[i] = v;
      simplified++;
    }
  }
  for (const o of objects) {
    const t = (o.attrs.objecttype ?? "").toLowerCase(), fx = Number(o.attrs.x1), fy = Number(o.attrs.y1);
    const i = cell(Math.floor(fx), Math.floor(fy));
    if (t === "knot") {
      const v = key(o.attrs.palindex, "knot"), pt = snapHalf({ x: fx, y: fy }, { w, h });
      if (v && Number.isFinite(fx) && Number.isFinite(fy)) knots.push({ ...pt, k: v });
      continue;
    }
    // this app's own bead between cells (SPEC §15.42)
    const px = Number(o.attrs.stitchwork_x), py = Number(o.attrs.stitchwork_y);
    if (t.startsWith("bead") && Number.isFinite(px) && Number.isFinite(py)) {
      const v = key(o.attrs.palindex, "pointBead");
      if (v) knots.push({ ...snapHalf({ x: px, y: py }, { w, h }), k: v });
      continue;
    }
    if (i < 0) continue;
    if (t.startsWith("bead")) {
      const v = key(o.attrs.palindex, "bead");
      if (v) beads[i] = v;
    } else if (t === "tent") {
      const v = key(o.attrs.palindex, o.attrs.direction === "1" ? "halfb" : "half");
      if (v) stitches[i] = v;
    } else if (t === "quarter" || t === "petite") {
      // Older Stitchwork files: whole-cell x1/y1 plus our own corner attribute. Everyone else (and newer files): the
      // half-grid point says which quarter; Ursa's "quarter" is a miniature cross unless XSPro's petit="false".
      const old = /^[0-3]$/.test(o.attrs.corner ?? "");
      const corner = old ? (Number(o.attrs.corner) as Corner) : cornerAt(fx, fy);
      const kind = t === "petite" || (!old && o.attrs.petit !== "false") ? "petite" : "quarter";
      addPartial(i, kind, corner, key(o.attrs.palindex, "full"));
    } else simplified++;
  }
  for (const b of pick("backstitch", "backstitches")) {
    const t = (b.attrs.objecttype ?? "backstitch").toLowerCase();
    const c = ["x1", "y1", "x2", "y2"].map((a) => Number(b.attrs[a]));
    if (t !== "backstitch" || c.some(Number.isNaN)) {
      simplified++;
      continue;
    }
    // this app's own floss + bead between cells, written as its tacking stitch (SPEC §15.42)
    const px = Number(b.attrs.stitchwork_x), py = Number(b.attrs.stitchwork_y);
    if (Number.isFinite(px) && Number.isFinite(py) && items.get(b.attrs.palindex ?? "")?.exact) {
      const v = key(b.attrs.palindex, "pointBead");
      if (v) knots.push({ ...snapHalf({ x: px, y: py }, { w, h }), k: v });
      continue;
    }
    const v = key(b.attrs.palindex, "back");
    if (v) segments.push({ x1: c[0]!, y1: c[1]!, x2: c[2]!, y2: c[3]!, k: v });
  }
  return { pattern: p, report: { simplified, unmatched: Object.keys(p.customs).length - exactCustoms } };
}
