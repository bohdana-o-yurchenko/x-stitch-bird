import type { ColorEntry } from "../color/colorEntry";
import { deltaE2, rgbToLab, type Lab } from "../color/colorMath";

export interface Pixels {
  width: number;
  height: number;
  data: ArrayLike<number>;
}

export interface QuantizeResult {
  w: number;
  h: number;
  /** Colour id per cell, null = unstitched. */
  cells: (string | null)[];
  used: number;
}

const nearest = (lab: Lab, set: Iterable<ColorEntry>): ColorEntry => {
  let best: ColorEntry | undefined, bd = Infinity;
  for (const e of set) {
    const d = deltaE2(e.lab, lab);
    if (d < bd) { bd = d; best = e; }
  }
  return best!;
};

/**
 * Image → pattern (SPEC §12.3): map each pixel (already scaled to the stitch grid) to its nearest candidate
 * colour, then drop the least-used colours until at most `maxColours` remain.
 */
export function quantize(img: Pixels, candidates: readonly ColorEntry[], maxColours: number, skipLightest: boolean): QuantizeResult {
  const { width: w, height: h, data: d } = img;
  const cache = new Map<number, ColorEntry>();
  const idx: (ColorEntry | null)[] = new Array(w * h).fill(null);
  const labs: (Lab | undefined)[] = new Array(w * h);
  for (let k = 0; k < w * h; k++) {
    if ((d[k * 4 + 3] ?? 0) < 128) continue;
    const r = d[k * 4] ?? 0, g = d[k * 4 + 1] ?? 0, b = d[k * 4 + 2] ?? 0;
    const key = ((r >> 2) << 12) | ((g >> 2) << 6) | (b >> 2);
    const lab = rgbToLab([r, g, b]);
    labs[k] = lab;
    let e = cache.get(key);
    if (!e) cache.set(key, (e = nearest(lab, candidates)));
    idx[k] = e;
  }
  const counts = new Map<ColorEntry, number>();
  for (const e of idx) if (e) counts.set(e, (counts.get(e) ?? 0) + 1);
  while (counts.size > maxColours) {
    let minE: ColorEntry | null = null, minN = Infinity;
    counts.forEach((n, e) => { if (n < minN) { minN = n; minE = e; } });
    counts.delete(minE!);
    const rest = [...counts.keys()];
    for (let k = 0; k < idx.length; k++)
      if (idx[k] === minE) {
        const e = nearest(labs[k]!, rest);
        idx[k] = e;
        counts.set(e, (counts.get(e) ?? 0) + 1);
      }
  }
  if (skipLightest && counts.size) {
    let light: ColorEntry | null = null;
    counts.forEach((_n, e) => { if (!light || e.lab[0] > light.lab[0]) light = e; });
    for (let k = 0; k < idx.length; k++) if (idx[k] === light) idx[k] = null;
    counts.delete(light!);
  }
  return { w, h, cells: idx.map((e) => e?.id ?? null), used: counts.size };
}
