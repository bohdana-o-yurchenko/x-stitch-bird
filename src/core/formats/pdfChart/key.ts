import { ANCHOR, BEADS, DMC, MADEIRA, PRECIOSA } from "../../catalog/catalog";
import type { ColorEntry } from "../../color/colorEntry";

/*
 * A chart's key, read off its text (SPEC §15.47): "DMC 310 Black", "2  DMC  223  Shell Pink-LT", "ANC 403",
 * "Mill Hill 00557" — a brand, then its number; the colour's name settles a number the catalogue doesn't have.
 */

/** What a key row stands for: a thread, a bead, or two threads blended (one strand each). */
export type KeyThread = { kind: "thread" | "bead"; ids: string[] };

const lower = (s: string) => s.toLowerCase().replace(/[‐-―]/g, "-").replace(/\s+/g, " ").trim();
const byCode = (list: readonly ColorEntry[]) => new Map(list.map((e) => [e.code.toLowerCase(), e]));
const byName = (list: readonly ColorEntry[]) => new Map(list.map((e) => [lower(e.name).replace(/[^a-z0-9]+/g, " ").trim(), e]));

const BRANDS: { re: RegExp; kind: "thread" | "bead"; codes: Map<string, ColorEntry>; names: Map<string, ColorEntry>; pad?: number }[] = [
  { re: /^dmc$/i, kind: "thread", codes: byCode(DMC), names: byName(DMC) },
  { re: /^(anchor|anc)$/i, kind: "thread", codes: byCode(ANCHOR), names: byName(ANCHOR) },
  { re: /^(madeira|mad)$/i, kind: "thread", codes: byCode(MADEIRA), names: byName(MADEIRA), pad: 4 },
  { re: /^(mh|millhill|mill-hill)$/i, kind: "bead", codes: byCode(BEADS), names: byName(BEADS), pad: 5 },
  { re: /^(preciosa|prec)$/i, kind: "bead", codes: byCode(PRECIOSA), names: byName(PRECIOSA) },
];
/** Numbers other apps write for DMC's own names. */
const DMC_ALIASES: Record<string, string> = { blanc: "white", wht: "white", ecru: "ecru", b5200: "b5200", "5200": "b5200" };

/** The words of a row, "Mill Hill" kept together, a code stuck to its brand ("DMC310") split off. */
function tokens(text: string): string[] {
  return text
    .replace(/\bmill\s+hill\b/gi, "millhill")
    .split(/[\s,;|]+/)
    .flatMap((t) => /^(dmc|anc|mad|mh)\d/i.test(t) ? [t.replace(/\d.*$/, ""), t.replace(/^[a-z]+/i, "")] : [t])
    .filter(Boolean);
}

function lookup(b: (typeof BRANDS)[number], code: string, rest: string): ColorEntry | null {
  const c = code.toLowerCase().replace(/^#/, "");
  const alias = b.re.test("dmc") ? DMC_ALIASES[c] : undefined;
  const hit = b.codes.get(alias ?? c) ?? b.codes.get(c.replace(/^0+(?=\w)/, "")) ?? (b.pad ? b.codes.get(c.padStart(b.pad, "0")) : undefined);
  if (hit) return hit;
  // a number the catalogue doesn't have ("DMC 1 White"): the name, when it is one of the brand's
  const words = lower(rest).replace(/[^a-z0-9]+/g, " ").trim().split(" ");
  for (let n = Math.min(words.length, 5); n >= 1; n--) {
    const named = b.names.get(words.slice(0, n).join(" "));
    if (named) return named;
  }
  return null;
}

/** The thread or bead a key row names; null when it names none this app knows. `brand`: the column's, when the row has none. */
export function threadOf(text: string, brand?: string): KeyThread | null {
  const ts = tokens(text), found: ColorEntry[] = [];
  for (let i = 0; i < ts.length; i++) {
    const b = BRANDS.find((x) => x.re.test(ts[i]!));
    if (!b || i + 1 >= ts.length) continue;
    const hit = lookup(b, ts[i + 1]!, ts.slice(i + 2).join(" "));
    if (hit) {
      found.push(hit);
      i++;
    }
  }
  if (!found.length && brand) {
    const b = BRANDS.find((x) => x.re.test(brand));
    // the number is the first word the brand's catalogue knows
    if (b) for (let i = 0; i < ts.length && !found.length; i++) {
      const hit = /^[a-z]*\d/i.test(ts[i]!) || /^(white|ecru|blanc)$/i.test(ts[i]!) ? lookup(b, ts[i]!, ts.slice(i + 1).join(" ")) : null;
      if (hit) found.push(hit);
    }
  }
  if (!found.length) return null;
  const kind = found[0]!.kind === "bead" ? "bead" : "thread";
  // floss + floss written as one row: a blend; anything else, the first
  const ids = kind === "thread" && found.length === 2 && found[1]!.kind === "thread" && /\+|&|\//.test(text) ? found.map((e) => e.id) : [found[0]!.id];
  return { kind, ids };
}

/** A brand named as a column heading ("DMC", "Anchor"): the rows below may give the number alone. */
export const brandWord = (word: string): string | null => (BRANDS.some((b) => b.re.test(word)) ? word : null);
