import { deltaE2, deltaE2000 } from "../color/colorMath";
import type { ColorEntry } from "../color/colorEntry";
import { BEAD_CATALOGUES, DMC, DMC_BY_CODE, THREAD_CATALOGUES } from "./catalog";

/*
 * What the Floss and Beads pages tell about one colour (SPEC §15.57): its colour family, the nearest colours of the
 * same brand (only those that look close — CIEDE2000), its shades lighter and darker, and the same colour in the
 * other brands — from the maker's conversion chart when there is one (the catalogues' DMC equivalents), else the
 * nearest by colour, said how near.
 */

export const FAMILIES = ["red", "orange", "yellow", "green", "teal", "blue", "purple", "pink", "brown", "neutral"] as const;
export type Family = (typeof FAMILIES)[number];

/** A colour each family's chip shows. */
export const FAMILY_HEX: Record<Family, string> = {
  red: "#C8323C", orange: "#EB7A2E", yellow: "#F2CF3A", green: "#5C9A43", teal: "#2D9C99",
  blue: "#3D6DC7", purple: "#7D55B0", pink: "#E88BB0", brown: "#8A5A35", neutral: "#A8A49C",
};

/** HSL of a colour, hue in degrees, saturation and lightness 0–1. */
function hsl(e: ColorEntry): [number, number, number] {
  const [r, g, b] = e.rgb.map((v) => v / 255) as [number, number, number];
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, l = (mx + mn) / 2;
  if (!d) return [0, 0, l];
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  return [h, d / (1 - Math.abs(2 * l - 1)), l];
}

const chroma = (e: ColorEntry) => Math.hypot(e.lab[1], e.lab[2]);

/** The family a colour belongs to, as a stitcher would sort a box of floss. */
export function familyOf(e: ColorEntry): Family {
  const [h, s, l] = hsl(e), L = e.lab[0];
  // pale colours have little chroma to begin with: a very light blue is still blue
  if (chroma(e) < (L > 85 ? 4.5 : 9) || s < 0.1) return "neutral";
  // tans, beiges and browns: warm, and dark or muted
  if (h >= 12 && h < 55 && (L < 52 || (s < 0.45 && L < 82))) return "brown";
  if (h < 12 || h >= 340) return L > 68 && l > 0.7 ? "pink" : "red";
  if (h < 38) return "orange";
  if (h < 70) return "yellow";
  if (h < 160) return "green";
  if (h < 195) return "teal";
  if (h < 255) return "blue";
  if (h < 312) return "purple";
  return L > 45 ? "pink" : "purple";
}

/** Lightness, 0 (black) to 100 (white). */
export const lightness = (e: ColorEntry) => e.lab[0];

/** Each colour's place in "by colour" order, worked out once. */
const colourKeys = new WeakMap<ColorEntry, [number, number]>();

/**
 * "By colour" (SPEC §15.57): by family round the wheel — reds, oranges, yellows, greens, teals, blues, purples,
 * pinks, then browns, then whites, greys and blacks — and light to dark within each, so every family is one smooth
 * run (a near-white never lands among the oranges).
 */
export function byColour(a: ColorEntry, b: ColorEntry): number {
  const key = (e: ColorEntry) => {
    let k = colourKeys.get(e);
    if (!k) colourKeys.set(e, (k = [FAMILIES.indexOf(familyOf(e)), -lightness(e)]));
    return k;
  };
  const ka = key(a), kb = key(b);
  return ka[0] - kb[0] || ka[1] - kb[1];
}

export type Closeness = "veryClose" | "close" | "rough";

/** How near two colours look (CIEDE2000): very close is hard to tell apart on the fabric; rough is another colour. */
export const closeness = (d: number): Closeness => (d < 3 ? "veryClose" : d < 6 ? "close" : "rough");

/** As far as a colour may be and still be offered as similar (CIEDE2000): close at most — never a rough one. */
export const SIMILAR = 6;

export interface Near {
  entry: ColorEntry;
  /** CIEDE2000. */
  d: number;
}

/** The `n` colours of `pool` nearest to `e` (never `e` itself), nearest first. */
export function nearest(e: ColorEntry, pool: readonly ColorEntry[], n: number): Near[] {
  return pool
    .filter((x) => x.id !== e.id)
    .map((x) => ({ entry: x, d: deltaE2000(e.lab, x.lab) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, n);
}

/**
 * Similar colours of a pool: the ones that look close (within `SIMILAR`), at most `n`. None: `alone`, with the one
 * nearest — said to be rough.
 */
export function similar(e: ColorEntry, pool: readonly ColorEntry[], n = 6): { close: Near[]; alone: Near | null } {
  const near = nearest(e, pool, n), close = near.filter((x) => x.d < SIMILAR);
  return { close, alone: close.length ? null : (near[0] ?? null) };
}

/**
 * Its shades: colours of the pool with the same hue and about the same colourfulness, light to dark — `e` among them
 * — at most `n`, around `e`.
 */
export function shades(e: ColorEntry, pool: readonly ColorEntry[], n = 9): ColorEntry[] {
  const [h, s] = hsl(e), grey = familyOf(e) === "neutral";
  const like = pool.filter((x) => {
    if (x.id === e.id) return true;
    const [xh, xs] = hsl(x);
    if (grey) return familyOf(x) === "neutral";
    if (familyOf(x) === "neutral") return false;
    const dh = Math.min(Math.abs(xh - h), 360 - Math.abs(xh - h));
    return dh < 9 && Math.abs(xs - s) < 0.3;
  });
  // one colour per step of lightness: the nearest in colour wins (a ladder, not a pile)
  const steps = new Map<number, ColorEntry>();
  for (const x of like) {
    const step = Math.round(lightness(x) / 4);
    const had = steps.get(step);
    if (x.id === e.id || (had?.id !== e.id && (!had || deltaE2(x.lab, e.lab) < deltaE2(had.lab, e.lab)))) steps.set(step, x);
  }
  const ladder = [...steps.values()].sort((a, b) => lightness(b) - lightness(a));
  const at = ladder.findIndex((x) => x.id === e.id), half = Math.floor(n / 2);
  const from = Math.max(0, Math.min(at - half, ladder.length - n));
  return ladder.slice(from, from + n);
}

export interface Match {
  brand: string;
  entry: ColorEntry;
  /** From the maker's conversion chart, or the nearest by colour. */
  how: "chart" | "near";
  /** CIEDE2000. */
  d: number;
}

/** The DMC number a colour stands for on a conversion chart: its own for DMC, its equivalent for the others. */
const dmcOf = (e: ColorEntry) => (e.brand === "DMC" ? e.code : e.dmc);

/**
 * The same colour in each other brand of `catalogues` (thread brands for floss, bead brands for beads): the chart's
 * equivalent (through DMC) when there is one — the nearest of several — else the nearest by colour.
 */
export function inOtherBrands(e: ColorEntry, catalogues: Readonly<Record<string, readonly ColorEntry[]>>): Match[] {
  const dmc = dmcOf(e);
  return Object.entries(catalogues)
    .filter(([brand]) => brand !== e.brand)
    .flatMap(([brand, pool]) => {
      const charted = dmc ? (brand === "DMC" ? [DMC_BY_CODE.get(dmc)].filter((x): x is ColorEntry => !!x) : pool.filter((x) => x.dmc === dmc)) : [];
      const best = nearest(e, charted.length ? charted : pool, 1)[0];
      return best ? [{ brand, entry: best.entry, how: charted.length ? ("chart" as const) : ("near" as const), d: best.d }] : [];
    });
}

/** A bead's floss: DMC's chart equivalent, else the nearest DMC. */
export function flossFor(bead: ColorEntry): Match | null {
  const charted = bead.dmc ? DMC_BY_CODE.get(bead.dmc) : undefined;
  if (charted) return { brand: "DMC", entry: charted, how: "chart", d: deltaE2000(bead.lab, charted.lab) };
  const near = nearest(bead, DMC, 1)[0];
  return near ? { brand: "DMC", entry: near.entry, how: "near", d: near.d } : null;
}

/** A bead series as the Beads page groups it: Mill Hill's own series; Preciosa's finish by its glass (before " - "). */
export const seriesOf = (e: ColorEntry): string | null => (e.series ? (e.brand === "Preciosa" ? e.series.split(" - ")[0]!.split(",")[0]!.trim() : e.series) : null);

export { BEAD_CATALOGUES, THREAD_CATALOGUES };
