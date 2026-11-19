import { makeColor, type ColorEntry } from "../color/colorEntry";
import anchorData from "./data/anchor.json";
import dimensionsData from "./data/dimensions.json";
import dmcData from "./data/dmc.json";
import madeiraData from "./data/madeira.json";
import millHillData from "./data/millhill.json";
import preciosaData from "./data/preciosa.json";

export const DMC: readonly ColorEntry[] = (dmcData as [string, string, string][]).map(([code, name, hex], order) =>
  makeColor({ id: `dmc:${code}`, kind: "thread", brand: "DMC", code, name, hex, order }),
);

export const DMC_BY_CODE = new Map(DMC.map((e) => [e.code, e]));

/**
 * Other thread brands, from open data (NOTICE.md; `scripts/catalog/import-kxstitch.py`): rows [code, name, hex,
 * DMC equivalent if known].
 */
const brandCatalogue = (brand: string, prefix: string, rows: string[][]): readonly ColorEntry[] =>
  rows.map(([code, name, hex, dmc], order) => makeColor({ id: `${prefix}:${code}`, kind: "thread", brand, code: code!, name: name!, hex: hex!, ...(dmc ? { dmc } : {}), order }));

export const ANCHOR = brandCatalogue("Anchor", "anchor", anchorData as string[][]);
export const MADEIRA = brandCatalogue("Madeira", "madeira", madeiraData as string[][]);
export const DIMENSIONS = brandCatalogue("Dimensions", "dimensions", dimensionsData as string[][]);

/** Built-in thread catalogues by brand, in the order brands are offered (SPEC §15.28). */
export const THREAD_CATALOGUES: Readonly<Record<string, readonly ColorEntry[]>> = { DMC, Anchor: ANCHOR, Madeira: MADEIRA, Dimensions: DIMENSIONS };

/**
 * Mill Hill, per series: beads per package, and the beads as [code, name, DMC equivalent, beads per package if not
 * the series', colour if there is no DMC equivalent]. Treasures have no DMC equivalent: their colour is read off the
 * maker's product photo.
 */
type BeadRow = [code: string, name: string, dmc: string, pack?: number, hex?: string];

export const BEADS: readonly ColorEntry[] = (millHillData as { series: string; pack: number; beads: BeadRow[] }[]).flatMap(
  (s) => s.beads.map(([code, name, dmc, pack, hex]) => ({ code, name, dmc, series: s.series, pack: pack ?? s.pack, hex })),
).map(({ code, name, dmc, series, pack, hex }, order) =>
  makeColor({ id: `bead:${code}`, kind: "bead", brand: "Mill Hill", code, name, ...(dmc ? { dmc } : {}), series, pack, order, hex: hex ?? DMC_BY_CODE.get(dmc)?.hex ?? "#B0B0B0" }),
);


/**
 * Preciosa Rocailles (SPEC §15.30) from Preciosa's own sample cards (`scripts/catalog/import-preciosa.py`): rows
 * [code, finish, colour, article number]. A code comes in several finishes (13600 plain, 13600 matt), told apart by
 * the article number — so the id carries it unless it's the plain one (311 19 001). The finish is the name and the
 * series; there's no package count (sold by weight).
 */
const PLAIN_ART = "311 19 001";
export const PRECIOSA: readonly ColorEntry[] = (preciosaData as [string, string, string, string][]).map(([code, finish, hex, art], order) =>
  makeColor({ id: `preciosa:${code}${art === PLAIN_ART ? "" : "/" + art.replace(/\s/g, "")}`, kind: "bead", brand: "Preciosa", code, name: finish, series: finish, hex, order }),
);

/** Built-in bead catalogues by brand, in the order they're offered. */
export const BEAD_CATALOGUES: Readonly<Record<string, readonly ColorEntry[]>> = { "Mill Hill": BEADS, Preciosa: PRECIOSA };

const LIBRARY = new Map<string, ColorEntry>([...DMC, ...ANCHOR, ...MADEIRA, ...DIMENSIONS, ...BEADS, ...PRECIOSA].map((e) => [e.id, e]));

/** Built-in thread or bead by id (`dmc:310`, `anchor:403`, `madeira:2713`, `bead:00557`, `preciosa:13600`). */
export const libraryColor = (id: string): ColorEntry | undefined => LIBRARY.get(id);

/** Picker search (SPEC §8.1): code prefix, name substring, "dmc 310" for beads, or series. */
export function matchesQuery(e: ColorEntry, query: string): boolean {
  const q = query.toLowerCase().trim();
  if (!q) return true;
  return (
    e.code.toLowerCase().startsWith(q) ||
    e.name.toLowerCase().includes(q) ||
    (!!e.dmc && `dmc ${e.dmc.toLowerCase()}`.startsWith(q)) ||
    (!!e.series && e.series.toLowerCase().includes(q))
  );
}

const BRAND_ORDER = Object.keys(THREAD_CATALOGUES);
const brandRank = (e: ColorEntry) => (BRAND_ORDER.indexOf(e.brand) + 1 || BRAND_ORDER.length + 1);

/** Catalogue order: DMC, then the other built-in brands, then everything else, each in its own order. */
export const byNumber = (a: ColorEntry, b: ColorEntry) => brandRank(a) - brandRank(b) || a.order - b.order;

export const byHue = (a: ColorEntry, b: ColorEntry) => a.hue - b.hue;

export const brandCode = (e: ColorEntry | undefined): string => {
  if (!e) return "?";
  if (e.brand === "DMC") return `DMC ${e.code}`;
  if (e.brand === "Mill Hill") return `MH ${e.code}`;
  return e.brand ? `${e.brand} ${e.code}` : e.code;
};
