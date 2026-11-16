import { brandCode } from "../catalog/catalog";
import { blendStrands, resolveColor } from "../pattern/resolve";
import type { EntryKindId, KeyEntry, Pattern, StitchTypeId } from "../pattern/types";
import type { ColorEntry } from "../color/colorEntry";

/** Translation function: message key + values → text. The UI passes next-intl's `t`. */
export type Translate = (key: string, values?: Record<string, string | number>) => string;

/** A key entry's label as data; turned into text by `formatLabel` (SPEC §3.4). */
export interface LabelData {
  kind: EntryKindId;
  title: string;
  /** Title is a blend code, shown as "Blend …". */
  blend: boolean;
  name: string;
  strands: number | null;
  stitch: StitchTypeId | null;
  beadName?: string;
  series?: string;
  wraps?: number;
}

export function labelData(e: KeyEntry, c: ColorEntry | undefined): LabelData {
  const base = { kind: e.t, name: c?.name ?? "?", strands: e.n ?? null, stitch: null, blend: false };
  if (!c) return { ...base, title: "?" };
  if (e.t === "bead") return { ...base, strands: null, title: brandCode(c), series: c.series, stitch: e.st === "point" ? "point" : null };
  if (e.t === "combo")
    return { ...base, title: `${brandCode(c.thread)} + ${brandCode(c.bead)}`, stitch: e.st ?? "full", beadName: c.bead?.name, name: c.thread?.name ?? "?" };
  const blend = !!c.isBlend;
  const title = blend ? c.code : brandCode(c);
  if (e.t === "back") return { ...base, title, blend };
  if (e.t === "knot") return { ...base, title, blend, wraps: e.wraps };
  return { ...base, title, blend, stitch: e.st ?? "full", strands: blend ? blendStrands(c) || null : e.n ?? null };
}

export const keyLabelData = (p: Pattern, e: KeyEntry): LabelData => labelData(e, resolveColor(p, e.src));

export function formatLabel(d: LabelData, t: Translate): { title: string; sub: string } {
  const title = d.blend ? t("label.blendTitle", { code: d.title }) : d.title;
  const strands = d.strands ? t("label.strands", { n: d.strands }) : null;
  const stitch = d.stitch ? t(`stitches.${d.stitch}`) : null;
  const parts: (string | null)[] = [d.name];
  switch (d.kind) {
    case "bead":
      parts.push(d.series ? t("label.beadSeries", { series: d.series }) : t("label.bead"), stitch);
      break;
    case "combo":
      parts.splice(0, 1, strands, stitch, t("label.withBead", { name: d.beadName ?? "?" }));
      break;
    case "back":
      parts.push(d.blend ? null : strands, t("label.backstitch"));
      break;
    case "knot":
      parts.push(d.blend ? null : strands, d.wraps ? t("label.knotWraps", { wraps: d.wraps }) : t("label.knot"));
      break;
    default:
      parts.push(d.blend ? null : strands, stitch);
  }
  return { title, sub: parts.filter(Boolean).join(" · ") };
}
