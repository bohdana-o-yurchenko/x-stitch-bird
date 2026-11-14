import type { ColorEntry } from "../color/colorEntry";
import { deltaE2, hexToRgb, linearToLab, rgbToLab } from "../color/colorMath";

export interface BlendSuggestion {
  a: ColorEntry;
  b: ColorEntry;
  deltaE: number;
}

/** The pairs of threads whose 50/50 mix (linear RGB) is closest to `hex` (SPEC §8, blend finder). */
export function findBlends(hex: string, threads: readonly ColorEntry[], count = 6): BlendSuggestion[] {
  const target = rgbToLab(hexToRgb(hex));
  const top: { i: number; j: number; d: number }[] = [];
  for (let i = 0; i < threads.length; i++) {
    const a = threads[i]!.lin;
    for (let j = i + 1; j < threads.length; j++) {
      const b = threads[j]!.lin;
      const d = deltaE2(linearToLab([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]), target);
      if (top.length < count || d < top[top.length - 1]!.d) {
        top.push({ i, j, d });
        top.sort((x, y) => x.d - y.d);
        if (top.length > count) top.pop();
      }
    }
  }
  return top.map((s) => ({ a: threads[s.i]!, b: threads[s.j]!, deltaE: Math.sqrt(s.d) }));
}
