import type { Pattern } from "@/core/pattern/types";

/**
 * Values worked out from the whole pattern (usage, the kinds of stitches in it…), computed once per document
 * revision however many parts of the screen ask for them (ARCHITECTURE-REVIEW §1). Ask with the same function each
 * time: it is the cache key.
 */
export class Derived {
  private cache = new Map<(p: Pattern) => unknown, { doc: Pattern; revision: number; value: unknown }>();

  constructor(private now: () => { doc: Pattern; docRevision: number }) {}

  of<T>(fn: (p: Pattern) => T): T {
    const { doc, docRevision } = this.now(), hit = this.cache.get(fn);
    if (hit && hit.doc === doc && hit.revision === docRevision) return hit.value as T;
    const value = fn(doc);
    this.cache.set(fn, { doc, revision: docRevision, value });
    return value;
  }
}
