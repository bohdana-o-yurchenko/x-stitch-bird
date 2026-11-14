import { entryKind } from "../entryKinds/registry";
import { mirroredStitchType } from "../stitches/registry";
import { firstFreeSymbol } from "../symbols/symbols";
import type { KeyEntry, KeyIndex, LayerId, Pattern } from "./types";

export const entryLayer = (e: KeyEntry): LayerId => entryKind(e.t).layer;

export const usedSymbols = (p: Pattern, except?: KeyIndex): string[] =>
  p.key.flatMap((e, i) => (e && i !== except ? [e.sym] : []));

export const nextSymbol = (p: Pattern, symbols: readonly string[], except?: KeyIndex): string =>
  firstFreeSymbol(usedSymbols(p, except), symbols);

/** Same colour, kind, stitch type and strands (beads compare colour only). SPEC §3.2. */
export function sameKey(a: KeyEntry | null | undefined, b: Omit<KeyEntry, "sym">): boolean {
  if (!a || a.src !== b.src || a.t !== b.t) return false;
  if (b.t === "bead") return true;
  return (a.st ?? null) === (b.st ?? null) && (a.n ?? null) === (b.n ?? null) && (a.wraps ?? null) === (b.wraps ?? null);
}

export const findSameKey = (p: Pattern, k: Omit<KeyEntry, "sym">, except?: KeyIndex): KeyIndex =>
  Math.max(0, p.key.findIndex((e, i) => i > 0 && i !== except && sameKey(e, k)));

/** Normalises the optional fields for the entry's kind. */
export function cleanEntry(k: Omit<KeyEntry, "sym"> & { sym?: string }, sym: string): KeyEntry {
  const e: KeyEntry = { t: k.t, src: k.src, sym };
  if (k.t !== "bead") e.n = k.n ?? null;
  if (k.t === "thread" || k.t === "combo") e.st = k.st ?? "full";
  if (k.t === "knot" && k.wraps) e.wraps = k.wraps;
  return e;
}

export function addEntry(p: Pattern, k: Omit<KeyEntry, "sym"> & { sym?: string }, symbols: readonly string[]): KeyIndex {
  p.key.push(cleanEntry(k, k.sym ?? nextSymbol(p, symbols)));
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

export const activeEntries = (p: Pattern): KeyIndex[] => p.key.flatMap((e, i) => (e && i > 0 ? [i] : []));
