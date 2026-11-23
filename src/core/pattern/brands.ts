import { BEAD_CATALOGUES, libraryColor, ORGANIZER, THREAD_CATALOGUES } from "../catalog/catalog";
import type { Pattern } from "./types";

/*
 * Thread brands of a pattern (SPEC §15.28). A pattern usually keeps to one brand; some mix (a Mirabilia chart: DMC
 * and Kreinik). The picker shows one tab per brand of the pattern. Brands are named, as threads show them in the key
 * ("DMC", "Weeks Dye Works"). Beads have their own picker and aren't counted here.
 */

/** Thread brands built into the app (catalogues). */
export const BUILT_IN_THREAD_BRANDS: readonly string[] = Object.keys(THREAD_CATALOGUES);

/*
 * The numbered organizer (SPEC §15.52) is a mode of the pattern's floss (or beads), instead of brands: the kit's own
 * numbers 1, 2, 3 … Its colours live in this pattern only — never in the account's inventory, never offered in another
 * pattern. Brands and the organizer don't mix: a pattern's floss is either one or the other.
 */
export { ORGANIZER };

/** The colours of the organizer, threads or beads. */
export const organizerColours = (p: Pick<Pattern, "customs">, kind: "thread" | "bead") =>
  Object.values(p.customs).filter((c) => c.kind === kind && c.brand === ORGANIZER);

/** The next free number for a colour of the organizer (1, 2, 3 …). */
export function nextOrganizerCode(p: Pick<Pattern, "customs">, kind: "thread" | "bead"): string {
  const taken = new Set(organizerColours(p, kind).map((c) => c.code.trim().toLowerCase()));
  let n = 1;
  while (taken.has(String(n))) n++;
  return String(n);
}

/** A number the organizer already has (another colour than `except`, letters' case and spaces aside). */
export const organizerCodeTaken = (p: Pick<Pattern, "customs">, kind: "thread" | "bead", code: string, except?: string) =>
  organizerColours(p, kind).some((c) => c.id !== except && c.code.trim().toLowerCase() === code.trim().toLowerCase());

/** The brand of a single thread id, if it's a thread: `dmc:310` → DMC, `anchor:403` → Anchor, your own → its brand. */
function threadBrand(p: Pattern, id: string): string | null {
  if (id.startsWith("custom:")) {
    const c = p.customs[id];
    return c && c.kind === "thread" ? c.brand : null;
  }
  const e = libraryColor(id);
  return e?.kind === "thread" ? e.brand : null;
}

/** Every thread and bead id the key uses: its own, the parts of its blends, the floss and bead of floss + bead. */
export function usedColourIds(p: Pattern): Set<string> {
  const used = new Set<string>();
  for (const e of p.key) {
    if (!e) continue;
    if (e.src.startsWith("blend:")) p.blends[e.src]?.parts.forEach((part) => used.add(part.id));
    else if (e.src.startsWith("combo:")) {
      const c = p.combos[e.src];
      if (c) used.add(c.thread).add(c.bead);
    } else used.add(e.src);
  }
  return used;
}

/** Brands the key uses: its threads, the parts of its blends, the threads of floss + bead — and the project palette once it holds a thread. */
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
  // the organizer with threads in it can't leave, used on the chart or not
  if (organizerColours(p, "thread").length) used.add(ORGANIZER);
  return used;
}

/** Floss is the organizer's numbers, not brands: chosen, or it already holds a thread. */
export const threadsInOrganizer = (p: Pattern) => !!p.brands?.includes(ORGANIZER) || organizerColours(p, "thread").length > 0;

/** Beads likewise. */
export const beadsInOrganizer = (p: Pattern) => !!p.beadBrands?.includes(ORGANIZER) || organizerColours(p, "bead").length > 0;

/**
 * The pattern's brands, in its order: the ones chosen for it (DMC when it never chose — patterns made before brands),
 * and any the key uses — a used brand is never hidden. In the organizer mode, that's the organizer alone.
 */
export function patternBrands(p: Pattern): string[] {
  const out = threadsInOrganizer(p) ? [ORGANIZER] : [...(p.brands?.length ? p.brands : ["DMC"])];
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
  if (organizerColours(p, "bead").length) used.add(ORGANIZER);
  return used;
}

/** The key has beads (or floss + bead): beads can't be turned off. */
export const usesBeads = (p: Pattern) => p.key.some((e) => !!e && (e.t === "bead" || e.t === "combo"));

/** The pattern's bead brands: the chosen ones (all built-in when it never chose), and any the key uses. */
export function patternBeadBrands(p: Pattern): string[] {
  const out = beadsInOrganizer(p) ? [ORGANIZER] : [...(p.beadBrands?.length ? p.beadBrands : BUILT_IN_BEAD_BRANDS)];
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
    threads: { brands: threads, single: threads.length === 1 && (!!p.onlyBrand || threads[0] === ORGANIZER) },
    beads: { on: beadsOn, brands: beads, single: beadsOn && beads.length === 1 && (!!p.onlyBeadBrand || beads[0] === ORGANIZER) },
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
  // the organizer replaces brands: with it chosen, nothing else is kept beside it
  const organizer = (list: string[]) => (list.includes(ORGANIZER) ? [ORGANIZER] : [...new Set(list)]);
  p.brands = organizer(m.brands);
  p.beadBrands = organizer(m.beadBrands);
  if (m.onlyBrand || p.brands[0] === ORGANIZER) p.onlyBrand = true;
  else delete p.onlyBrand;
  if (m.onlyBeadBrand || p.beadBrands[0] === ORGANIZER) p.onlyBeadBrand = true;
  else delete p.onlyBeadBrand;
  if (m.noBeads && !usesBeads(p)) p.noBeads = true;
  else delete p.noBeads;
}
