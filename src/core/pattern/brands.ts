import { BEAD_CATALOGUES, libraryColor, THREAD_CATALOGUES } from "../catalog/catalog";
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

/** Bead brands built into the app. */
export const BUILT_IN_BEAD_BRANDS: readonly string[] = Object.keys(BEAD_CATALOGUES);

/** Brands of the key's beads (beads and floss + bead). */
export function usedBeadBrands(p: Pattern): Set<string> {
  const used = new Set<string>();
  const add = (id: string | undefined) => {
    if (!id) return;
    const b = id.startsWith("custom:") ? p.customs[id]?.brand : libraryColor(id)?.brand;
    if (b) used.add(b);
  };
  for (const e of p.key) {
    if (!e) continue;
    if (e.t === "bead") add(e.src);
    else if (e.src.startsWith("combo:")) add(p.combos[e.src]?.bead);
  }
  return used;
}

/** The key has beads (or floss + bead): beads can't be turned off. */
export const usesBeads = (p: Pattern) => p.key.some((e) => !!e && (e.t === "bead" || e.t === "combo"));

/** The pattern's bead brands: the chosen ones (all built-in when it never chose), and any the key uses. */
export function patternBeadBrands(p: Pattern): string[] {
  const out = [...(p.beadBrands?.length ? p.beadBrands : BUILT_IN_BEAD_BRANDS)];
  for (const b of usedBeadBrands(p)) if (!out.includes(b)) out.push(b);
  return out;
}

export const canRemoveBeadBrand = (p: Pattern, brand: string) => !usedBeadBrands(p).has(brand) && patternBeadBrands(p).length > 1;

/**
 * What the key form offers (SPEC §15.31): the thread brands, and whether it's just one — then no brand tabs and
 * your own threads go into it; beads likewise, or none at all. "Only one" holds while exactly one brand is in use.
 */
export function materials(p: Pattern) {
  const threads = patternBrands(p), beads = patternBeadBrands(p);
  const beadsOn = !p.noBeads || usesBeads(p);
  return {
    threads: { brands: threads, single: !!p.onlyBrand && threads.length === 1 },
    beads: { on: beadsOn, brands: beads, single: beadsOn && !!p.onlyBeadBrand && beads.length === 1 },
  };
}

/** The settings, as a New dialog or the side panel edit them. */
export interface Materials {
  brands: string[];
  onlyBrand: boolean;
  beadBrands: string[];
  onlyBeadBrand: boolean;
  noBeads: boolean;
}

export const materialsOf = (p: Pattern): Materials => ({
  brands: patternBrands(p),
  onlyBrand: !!p.onlyBrand,
  beadBrands: patternBeadBrands(p),
  onlyBeadBrand: !!p.onlyBeadBrand,
  noBeads: !!p.noBeads && !usesBeads(p),
});

/**
 * A new pattern's (and the demo's): every brand the app knows, threads and beads (SPEC §15.39) — so the picker shows
 * how much is there; fewer can be chosen in the New dialog or the side panel.
 */
export const NEW_MATERIALS: Materials = { brands: [...BUILT_IN_THREAD_BRANDS], onlyBrand: false, beadBrands: Object.keys(BEAD_CATALOGUES), onlyBeadBrand: false, noBeads: false };

/** Sets them on a pattern (only what differs from a pattern that never chose is written). */
export function applyMaterials(p: Pattern, m: Materials) {
  p.brands = [...new Set(m.brands)];
  p.beadBrands = [...new Set(m.beadBrands)];
  if (m.onlyBrand) p.onlyBrand = true;
  else delete p.onlyBrand;
  if (m.onlyBeadBrand) p.onlyBeadBrand = true;
  else delete p.onlyBeadBrand;
  if (m.noBeads && !usesBeads(p)) p.noBeads = true;
  else delete p.noBeads;
}
