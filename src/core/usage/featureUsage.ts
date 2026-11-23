/**
 * Feature usage counts (SPEC §15.54): how often each command is run from a button and from a shortcut, summed over
 * everyone — never who ran it. Shared by the browser (counting, sending) and the server (checking, storing).
 */

/** How a command was asked for. */
export type UsageVia = "click" | "key";

/** One feature's counts in a batch: name, signed in, clicks, shortcuts. */
export type UsageRow = [feature: string, signedIn: boolean, clicks: number, keys: number];

/** One feature's totals over a range of days, as the stats page shows them: clicks and keys, signed out and in. */
export interface UsageTotal {
  feature: string;
  clicksOut: number;
  keysOut: number;
  clicksIn: number;
  keysIn: number;
}

/** A day as the stats page asks for it (UTC). */
export const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** A feature: a command id, with its argument when that names a different thing (`tool.select:fill`). */
const FEATURE = /^[a-z][a-zA-Z]{0,20}\.[a-zA-Z]{1,30}(?::[a-zA-Z0-9-]{1,24})?$/;

/** Commands whose argument names the thing used: one feature per tool, export format, transform… */
const ARG_NAMED = new Set([
  "tool.select", "tool.hold", "view.set", "view.toggleGroup", "file.export", "transform.apply", "transform.mirror",
  "draw.pickBrush", "draw.setPartialKind",
]);

/** The feature a command run counts towards (null: not one to count). */
export function featureOf(command: string, args?: unknown): string | null {
  const arg = ARG_NAMED.has(command) && (typeof args === "string" || typeof args === "number") ? `:${args}` : "";
  const name = command + arg;
  return FEATURE.test(name) ? name : null;
}

/** Features in one batch, and the most one feature may add in it: whatever is beyond is not real use. */
export const MAX_FEATURES = 400;
export const MAX_COUNT = 5000;

/** The batch as sent: `{"r": [[feature, 0|1, clicks, keys], …]}` — short, as it goes out on every page close. */
export function encodeUsage(rows: readonly UsageRow[]): string {
  return JSON.stringify({ r: rows.map(([f, s, c, k]) => [f, s ? 1 : 0, c, k]) });
}

const count = (n: unknown) => (Number.isInteger(n) && (n as number) >= 0 ? Math.min(n as number, MAX_COUNT) : -1);

/**
 * A batch as received: rows of known shape only, the same feature merged into one row (a database upsert can't
 * touch one row twice), empty ones dropped. Null when it isn't a batch at all.
 */
export function parseUsage(text: string): UsageRow[] | null {
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return null;
  }
  const raw = (body as { r?: unknown } | null)?.r;
  if (!Array.isArray(raw) || raw.length > MAX_FEATURES) return null;
  const merged = new Map<string, UsageRow>();
  for (const r of raw) {
    if (!Array.isArray(r) || r.length !== 4) return null;
    const [f, s, c0, k0] = r as unknown[];
    const c = count(c0), k = count(k0);
    if (typeof f !== "string" || !FEATURE.test(f) || (s !== 0 && s !== 1) || c < 0 || k < 0) return null;
    if (!c && !k) continue;
    const id = `${s}${f}`, had = merged.get(id);
    merged.set(id, [f, s === 1, Math.min((had?.[2] ?? 0) + c, MAX_COUNT), Math.min((had?.[3] ?? 0) + k, MAX_COUNT)]);
  }
  return [...merged.values()];
}
