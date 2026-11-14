import type { PatternMeta } from "./types";

/**
 * Pattern info fields in form order (SPEC §15.1). `oxs`: the OXS <properties> attribute it is written to — OXS has
 * only title (the pattern name), author, copyright and instructions; the rest stays in our own .xbird file.
 */
export const META_FIELDS: readonly { id: keyof PatternMeta; multiline?: boolean; oxs?: string }[] = [
  { id: "designer", oxs: "author" },
  { id: "copyright", oxs: "copyright" },
  { id: "instructions", multiline: true, oxs: "instructions" },
  { id: "publisher" },
  { id: "source" },
  { id: "sourceYear" },
  { id: "sourceRef" },
  { id: "mappedBy" },
  { id: "mappedDate" },
  { id: "notes", multiline: true },
];

/** Keeps known, non-empty string fields only. */
export function cleanMeta(raw: unknown): PatternMeta {
  const out: PatternMeta = {};
  if (!raw || typeof raw !== "object") return out;
  for (const { id } of META_FIELDS) {
    const v = (raw as Record<string, unknown>)[id];
    if (typeof v === "string" && v.trim()) out[id] = v;
  }
  return out;
}
