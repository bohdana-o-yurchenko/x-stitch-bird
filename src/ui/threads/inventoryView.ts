import type { ColorEntry } from "@/core/color/colorEntry";
import { byColour, familyOf, lightness, seriesOf, type Family } from "@/core/catalog/colourInfo";
import { matchesQuery } from "@/core/catalog/catalog";
import type { CustomColor } from "@/core/pattern/types";

/**
 * How the Floss and Beads pages show, filter and order colours (SPEC §15.57): the whole catalogue and your own
 * together. Each view and each sort is one entry of a list, so a new one is one line here, one message key and (for a
 * view) one branch in `ThreadList`.
 */
export const VIEWS = ["gallery", "compact"] as const;
export type InventoryView = (typeof VIEWS)[number];

export const SORTS = ["code", "name", "colour", "light"] as const;
export type InventorySort = (typeof SORTS)[number];

/** One colour of the page: a catalogue colour, or one of your own (`own`). */
export interface Item {
  entry: ColorEntry;
  own: CustomColor | null;
}

const code = (a: ColorEntry, b: ColorEntry) => a.code.localeCompare(b.code, undefined, { numeric: true });
const name = (a: ColorEntry, b: ColorEntry) => (a.name || a.code).localeCompare(b.name || b.code, undefined, { numeric: true, sensitivity: "base" });
const brand = (a: ColorEntry, b: ColorEntry) => a.brand.localeCompare(b.brand);

const BY: Record<InventorySort, (a: ColorEntry, b: ColorEntry) => number> = {
  // by brand, then number — the order the page always had
  code: (a, b) => brand(a, b) || code(a, b),
  name: (a, b) => name(a, b) || brand(a, b) || code(a, b),
  // by family round the wheel, light to dark within each (core/catalog/colourInfo)
  colour: (a, b) => byColour(a, b) || brand(a, b) || code(a, b),
  light: (a, b) => lightness(b) - lightness(a) || brand(a, b) || code(a, b),
};

export const sortItems = (list: readonly Item[], by: InventorySort) => [...list].sort((a, b) => BY[by](a.entry, b.entry));

export interface ItemFilter {
  brand: string | null;
  onlyMine: boolean;
  family: Family | null;
  series: string | null;
  query: string;
}

/** Number, name, "dmc 310" (its chart equivalent), series — or a colour's hex ("#7a9"). */
const matches = (e: ColorEntry, q: string) => (q.startsWith("#") ? e.hex.toLowerCase().startsWith(q.toLowerCase()) : matchesQuery(e, q));

export const filterItems = (list: readonly Item[], f: ItemFilter) =>
  list.filter(({ entry: e, own }) =>
    (!f.brand || e.brand === f.brand) &&
    (!f.onlyMine || !!own) &&
    (!f.family || familyOf(e) === f.family) &&
    (!f.series || seriesOf(e) === f.series) &&
    (!f.query.trim() || matches(e, f.query.trim())));
