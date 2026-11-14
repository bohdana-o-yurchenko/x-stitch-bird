import { makeColor, type ColorEntry } from "../color/colorEntry";
import dmcData from "./data/dmc.json";
import millHillData from "./data/millhill.json";

export const DMC: readonly ColorEntry[] = (dmcData as [string, string, string][]).map(([code, name, hex], order) =>
  makeColor({ id: `dmc:${code}`, kind: "thread", brand: "DMC", code, name, hex, order }),
);

export const DMC_BY_CODE = new Map(DMC.map((e) => [e.code, e]));

export const BEADS: readonly ColorEntry[] = (millHillData as { series: string; beads: [string, string, string][] }[]).flatMap(
  ({ series, beads }) => beads.map(([code, name, dmc]) => ({ code, name, dmc, series })),
).map(({ code, name, dmc, series }, order) =>
  makeColor({ id: `bead:${code}`, kind: "bead", brand: "Mill Hill", code, name, dmc, series, order, hex: DMC_BY_CODE.get(dmc)?.hex ?? "#B0B0B0" }),
);

export const BEAD_SERIES: readonly string[] = [...new Set(BEADS.map((b) => b.series ?? ""))];

const LIBRARY = new Map<string, ColorEntry>([...DMC, ...BEADS].map((e) => [e.id, e]));

/** Built-in thread or bead by id (`dmc:310`, `bead:00557`). */
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

export const byNumber = (a: ColorEntry, b: ColorEntry) =>
  (a.brand === "DMC" ? 0 : 1) - (b.brand === "DMC" ? 0 : 1) || a.order - b.order;

export const byHue = (a: ColorEntry, b: ColorEntry) => a.hue - b.hue;

export const brandCode = (e: ColorEntry | undefined): string => {
  if (!e) return "?";
  if (e.brand === "DMC") return `DMC ${e.code}`;
  if (e.brand === "Mill Hill") return `MH ${e.code}`;
  return e.brand ? `${e.brand} ${e.code}` : e.code;
};
