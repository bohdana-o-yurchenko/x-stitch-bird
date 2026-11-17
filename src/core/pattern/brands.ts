import { libraryColor, THREAD_CATALOGUES } from "../catalog/catalog";
import type { Pattern } from "./types";

/*
 * Thread brands of a pattern (SPEC §15.28). A pattern usually keeps to one brand; some mix (a Mirabilia chart: DMC
 * and Kreinik). The picker shows one tab per brand of the pattern. Brands are named, as threads show them in the key
 * ("DMC", "Weeks Dye Works"). Beads have their own picker and aren't counted here.
 */

/** Thread brands built into the app (catalogues). */
export const BUILT_IN_THREAD_BRANDS: readonly string[] = Object.keys(THREAD_CATALOGUES);

/** The brand of a single thread id, if it's a thread: `dmc:310` → DMC, `anchor:403` → Anchor, your own → its brand. */
function threadBrand(p: Pattern, id: string): string | null {
  if (id.startsWith("custom:")) {
    const c = p.customs[id];
    return c && c.kind === "thread" ? c.brand : null;
  }
  const e = libraryColor(id);
  return e?.kind === "thread" ? e.brand : null;
}

/** Brands the key uses: its threads, the parts of its blends, the threads of floss + bead. */
export function usedThreadBrands(p: Pattern): Set<string> {
  const used = new Set<string>();
  const add = (id: string | undefined) => {
    const b = id && threadBrand(p, id);
    if (b) used.add(b);
  };
  for (const e of p.key) {
    if (!e) continue;
    if (e.src.startsWith("blend:")) p.blends[e.src]?.parts.forEach((part) => add(part.id));
    else if (e.src.startsWith("combo:")) add(p.combos[e.src]?.thread);
    else add(e.src);
  }
  return used;
}

/**
 * The pattern's brands, in its order: the ones chosen for it (DMC when it never chose — patterns made before brands),
 * and any the key uses — a used brand is never hidden.
 */
export function patternBrands(p: Pattern): string[] {
  const out = [...(p.brands?.length ? p.brands : ["DMC"])];
  for (const b of usedThreadBrands(p)) if (!out.includes(b)) out.push(b);
  return out;
}

/** A brand can leave the pattern when no key entry uses it, and it isn't the last one. */
export const canRemoveBrand = (p: Pattern, brand: string) => !usedThreadBrands(p).has(brand) && patternBrands(p).length > 1;
