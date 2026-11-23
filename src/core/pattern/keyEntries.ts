import { entryLayerOf } from "../entryKinds/registry";
import { customShape } from "../symbols/customSymbol";
import { cleanInk, DEFAULT_LINE_INK, LINE_INKS } from "../symbols/lineInks";
import { mirroredStitchType } from "../stitches/registry";
import { isLineStyle, LINE_STYLES } from "../symbols/lineStyles";
import { firstFreeSymbol } from "../symbols/symbols";
import type { EntryKindId, KeyEntry, KeyIndex, LayerId, Pattern } from "./types";

export const entryLayer = (e: KeyEntry): LayerId => entryLayerOf(e);

/** A backstitch's line colour as compared: black when it has none. */
export const lineInkOf = (e: { ink?: string }): string => cleanInk(e.ink) ?? DEFAULT_LINE_INK;

type SymbolOwner = Pick<KeyEntry, "t" | "sym" | "ink">;

/**
 * Two entries show the same symbol: the same one — for backstitch the same line style **in the same line colour**,
 * so one style may serve several backstitch colours (SPEC §2.5).
 */
export const sameSymbol = (a: SymbolOwner, b: SymbolOwner): boolean =>
  a.sym === b.sym && (a.t !== "back" || b.t !== "back" || lineInkOf(a) === lineInkOf(b));

/** Symbols other entries hold; for a backstitch (`like`) only those of backstitch in its line colour. */
export const usedSymbols = (p: Pattern, except?: KeyIndex, like?: Pick<KeyEntry, "t" | "ink">): string[] =>
  p.key.flatMap((e, i) => (e && i !== except && (like?.t !== "back" || (e.t === "back" && lineInkOf(e) === lineInkOf(like))) ? [e.sym] : []));

/** Backstitch picks from the line styles, everything else from the chart symbols. */
export const symbolsFor = (t: EntryKindId, symbols: readonly string[]): readonly string[] => (t === "back" ? LINE_STYLES : symbols);

/** The first free symbol for an entry of kind `t`; a backstitch's is free among the lines of its colour (`ink`). */
export function nextSymbol(p: Pattern, symbols: readonly string[], except?: KeyIndex, t: EntryKindId = "thread", ink?: string): string {
  const list = symbolsFor(t, symbols), used = usedSymbols(p, except, { t, ink });
  return firstFreeSymbol(used, list, t === "back" ? LINE_STYLES[used.filter(isLineStyle).length % LINE_STYLES.length] : undefined);
}

const PRESET_INKS = LINE_INKS.map((c) => c.hex as string);

/** The preset line colours (black, red, green, …) not yet used with line style `style` by other backstitch entries. */
export function freeLineInks(p: Pattern, style: string, except?: KeyIndex): string[] {
  const taken = new Set(p.key.flatMap((e, i) => (e && i !== except && e.t === "back" && e.sym === style ? [lineInkOf(e)] : [])));
  return PRESET_INKS.filter((ink) => !taken.has(ink));
}

/** Line styles whose preset colours are all taken: nothing new can use them without a swap. */
export const fullLineStyles = (p: Pattern, except?: KeyIndex): string[] => LINE_STYLES.filter((s) => !freeLineInks(p, s, except).length);

/**
 * A new backstitch's style and colour: the first style that still has a preset colour free, in that colour — so
 * solid black, solid red, solid green … then dashed black (SPEC §2.5). All taken: they repeat.
 */
export function nextLine(p: Pattern, except?: KeyIndex): { sym: string; ink: string } {
  for (const sym of LINE_STYLES) {
    const ink = freeLineInks(p, sym, except)[0];
    if (ink) return { sym, ink };
  }
  return { sym: nextSymbol(p, LINE_STYLES, except, "back"), ink: DEFAULT_LINE_INK };
}

/**
 * Makes every entry's symbol usable (files and storage from older versions): backstitch gets a line style; other
 * entries a symbol from `symbols` that no earlier entry uses — old characters without a matching shape, and
 * duplicates left by the old-symbol upgrade, get the next free one.
 */
export function fixEntrySymbols(p: Pattern, symbols: readonly string[]) {
  const seen = new Set<string>();
  p.key.forEach((e, i) => {
    if (!e) return;
    const known = symbols.includes(e.sym) || !!customShape(e.sym);
    const ok = e.t === "back" ? isLineStyle(e.sym) : !isLineStyle(e.sym) && known && !seen.has(e.sym);
    if (!ok) p.key[i] = { ...e, sym: nextSymbol(p, symbols, i, e.t) };
    seen.add(p.key[i]!.sym);
  });
}

/** Same colour, kind, stitch type and strands (beads compare colour only). SPEC §3.2. */
export function sameKey(a: KeyEntry | null | undefined, b: Omit<KeyEntry, "sym">): boolean {
  if (!a || a.src !== b.src || a.t !== b.t) return false;
  // a bead in cells and the same bead between cells are two entries: they live on different layers
  if (b.t === "bead") return (a.st ?? null) === (b.st === "point" ? "point" : null);
  return (a.st ?? null) === (b.st ?? null) && (a.n ?? null) === (b.n ?? null) && (a.wraps ?? null) === (b.wraps ?? null);
}

export const findSameKey = (p: Pattern, k: Omit<KeyEntry, "sym">, except?: KeyIndex): KeyIndex =>
  Math.max(0, p.key.findIndex((e, i) => i > 0 && i !== except && sameKey(e, k)));

/** Normalises the optional fields for the entry's kind. */
export function cleanEntry(k: Omit<KeyEntry, "sym"> & { sym?: string }, sym: string): KeyEntry {
  const e: KeyEntry = { t: k.t, src: k.src, sym };
  if (k.t !== "bead") e.n = k.n ?? null;
  if (k.t === "thread" || k.t === "combo") e.st = k.st === "point" && k.t !== "combo" ? "full" : k.st ?? "full";
  // a plain bead sits in its cell unless it is sewn between cells
  if (k.t === "bead" && k.st === "point") e.st = "point";
  if (k.t === "knot" && k.wraps) e.wraps = k.wraps;
  const ink = k.t === "back" ? cleanInk(k.ink) : undefined;
  if (ink && ink !== DEFAULT_LINE_INK) e.ink = ink;
  return e;
}

export function addEntry(p: Pattern, k: Omit<KeyEntry, "sym"> & { sym?: string }, symbols: readonly string[]): KeyIndex {
  p.key.push(cleanEntry(k, k.sym ?? nextSymbol(p, symbols, undefined, k.t, k.ink)));
  return p.key.length - 1;
}

/** Existing identical entry, or a new one. Used by imports and paste. */
export const keyFor = (p: Pattern, k: Omit<KeyEntry, "sym"> & { sym?: string }, symbols: readonly string[]): KeyIndex =>
  findSameKey(p, k) || addEntry(p, k, symbols);

/**
 * The entry a mirrored copy of `k` must use: the same colour and strands with the opposite half-cross
 * direction (SPEC §15.3). Created with the next free symbol when missing. Symmetric entries return `k`.
 */
export function findOrCreateTwin(p: Pattern, k: KeyIndex, symbols: readonly string[], created?: { count: number }): KeyIndex {
  const e = p.key[k];
  if (!e || (e.t !== "thread" && e.t !== "combo")) return k;
  const st = mirroredStitchType(e.st);
  if (st === (e.st ?? "full")) return k;
  const twin = { ...e, st };
  const found = findSameKey(p, twin);
  if (found) return found;
  if (created) created.count++;
  return addEntry(p, { ...twin, sym: undefined }, symbols);
}
