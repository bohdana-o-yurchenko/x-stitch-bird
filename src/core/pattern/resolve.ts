import { libraryColor, brandCode } from "../catalog/catalog";
import { makeColor, type ColorEntry } from "../color/colorEntry";
import { linearToSrgb, rgbToHex } from "../color/colorMath";
import type { Blend, Combo, CustomColor, Pattern } from "./types";

const cache = new WeakMap<Pattern, Map<string, ColorEntry | undefined>>();

/** Forget computed blends/combos/customs, e.g. after loading or editing custom colours. */
export const invalidateColors = (p: Pattern) => cache.delete(p);

/** Resolves any colour id used in a key entry or blend (SPEC §3.2). */
export function resolveColor(p: Pattern, id: string | undefined | null): ColorEntry | undefined {
  if (!id) return undefined;
  let m = cache.get(p);
  if (!m) cache.set(p, (m = new Map()));
  if (m.has(id)) return m.get(id);
  let e: ColorEntry | undefined;
  if (id.startsWith("blend:")) e = p.blends[id] && makeBlendColor(p, id, p.blends[id]);
  else if (id.startsWith("combo:")) e = p.combos[id] && makeComboColor(p, id, p.combos[id]);
  else if (id.startsWith("custom:")) e = p.customs[id] && customColor(p.customs[id]);
  else e = libraryColor(id);
  if (e) m.set(id, e);
  return e;
}

export const customColor = (c: CustomColor): ColorEntry => makeColor({ ...c, order: 9999 });

/** Blend colour = strand-weighted average in linear RGB. */
export function makeBlendColor(p: Pattern, id: string, b: Blend): ColorEntry {
  let total = 0;
  const acc = [0, 0, 0];
  const parts: { entry: ColorEntry; n: number }[] = [];
  for (const part of b.parts) {
    const e = resolveColor(p, part.id);
    if (!e) continue;
    total += part.n;
    for (let k = 0; k < 3; k++) acc[k]! += (e.lin[k] ?? 0) * part.n;
    parts.push({ entry: e, n: part.n });
  }
  const hex = total ? rgbToHex(acc.map((v) => linearToSrgb(v / total))) : "#CCCCCC";
  return {
    ...makeColor({
      id,
      kind: "thread",
      brand: "Blend",
      hex,
      order: 9000,
      code: parts.map((q) => q.entry.code).join("+"),
      name: parts.map((q) => `${q.n}× ${brandCode(q.entry)}`).join(" + "),
    }),
    isBlend: true,
    parts,
  };
}

export function makeComboColor(p: Pattern, id: string, c: Combo): ColorEntry | undefined {
  const thread = resolveColor(p, c.thread), bead = resolveColor(p, c.bead);
  if (!thread || !bead) return undefined;
  return {
    ...makeColor({
      id,
      kind: "combo",
      brand: "Combo",
      hex: thread.hex,
      order: 9500,
      code: `${thread.code}+${bead.code}`,
      name: `${brandCode(thread)} + ${brandCode(bead)}`,
    }),
    isCombo: true,
    thread,
    bead,
  };
}

export const blendStrands = (e: ColorEntry | undefined): number => e?.parts?.reduce((a, q) => a + q.n, 0) ?? 0;
