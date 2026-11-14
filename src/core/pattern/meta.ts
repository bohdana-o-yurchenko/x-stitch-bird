import type { PatternMeta } from "./types";

/** Pattern info fields in form order (SPEC §15.1). */
export const META_FIELDS: readonly { id: keyof PatternMeta; multiline?: boolean }[] = [
  { id: "designer" },
  { id: "publisher" },
  { id: "source" },
  { id: "sourceYear" },
  { id: "sourceRef" },
  { id: "copyright" },
  { id: "mappedBy" },
  { id: "mappedDate" },
  { id: "notes", multiline: true },
  { id: "instructions", multiline: true },
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
