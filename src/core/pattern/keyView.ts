import { brandCode, byNumber } from "../catalog/catalog";
import type { ColorEntry } from "../color/colorEntry";
import { ENTRY_KINDS } from "../entryKinds/registry";
import { resolveColor } from "./resolve";
import type { EntryKindId, KeyIndex, Pattern } from "./types";

/*
 * How a long key is shown (SPEC §7.1): searched, sorted and grouped by entry type. Only the view changes — key
 * indices, and so the chart and the 1–9 shortcuts, stay as they are.
 */

export type KeySort = "added" | "number" | "used";

export interface KeyViewOptions {
  /** Words that must all match: a thread or bead number ("310", "dmc 310"), or part of a colour name. */
  query: string;
  sort: KeySort;
  /** One group per entry type, in the order of the key form; otherwise a single group with `kind: null`. */
  grouped: boolean;
}

export interface KeyGroup {
  kind: EntryKindId | null;
  entries: KeyIndex[];
}

/** The threads and beads an entry is made of: one, a blend's parts, or a combo's thread and bead. */
function colours(p: Pattern, k: KeyIndex): ColorEntry[] {
  const c = resolveColor(p, p.key[k]?.src);
  if (!c) return [];
  if (c.parts) return c.parts.map((q) => q.entry);
  if (c.thread && c.bead) return [c.thread, c.bead];
  return [c];
}

function matches(list: ColorEntry[], query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return words.every((w) => list.some((c) => c.code.toLowerCase().startsWith(w) || c.name.toLowerCase().includes(w) || brandCode(c).toLowerCase().split(" ").some((part) => part.startsWith(w))));
}

export function keyView(p: Pattern, used: (k: KeyIndex) => number, o: KeyViewOptions): KeyGroup[] {
  const all = p.key.flatMap((e, k) => (e && k ? [k] : []));
  const found = o.query.trim() ? all.filter((k) => matches(colours(p, k), o.query)) : all;
  const first = (k: KeyIndex) => colours(p, k)[0];
  const sorted =
    o.sort === "used" ? [...found].sort((a, b) => used(b) - used(a) || a - b)
    : o.sort === "number" ? [...found].sort((a, b) => {
        const ca = first(a), cb = first(b);
        return (ca && cb ? byNumber(ca, cb) : 0) || a - b;
      })
    : found;
  if (!o.grouped) return sorted.length ? [{ kind: null, entries: sorted }] : [];
  return ENTRY_KINDS.map((kind) => ({ kind: kind.id, entries: sorted.filter((k) => p.key[k]!.t === kind.id) })).filter((g) => g.entries.length);
}
