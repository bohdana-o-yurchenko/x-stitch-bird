import { brandCode, ORGANIZER } from "../catalog/catalog";
import { blendStrands, resolveColor } from "../pattern/resolve";
import type { EntryKindId, KeyEntry, Pattern, StitchTypeId } from "../pattern/types";
import type { ColorEntry } from "../color/colorEntry";
import { isBuiltInStamp, stampDef } from "../stamps/stamps";

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
  /** Placed as a stamp: a built-in one's message key (`stamps.smyrna1`), or one's own name. */
  stamp?: { key: string } | { name: string };
}

export function labelData(e: KeyEntry, c: ColorEntry | undefined): LabelData {
  const base = { kind: e.t, name: c?.name ?? "?", strands: e.n ?? null, stitch: null, blend: false };
  if (!c) return { ...base, title: "?" };
  // a numbered organizer's blend: floss as bare numbers, beads as "Bead N"
  if (e.t !== "bead" && c.isBlend && c.parts?.some((q) => q.entry.brand === ORGANIZER)) {
    const title = c.parts.map((q) => brandCode(q.entry)).join("+");
    if (e.t === "back") return { ...base, title };
    if (e.t === "knot") return { ...base, title, wraps: e.wraps };
    return { ...base, title, stitch: e.st ?? "full", strands: blendStrands(c) || null };
  }
  if (e.t === "bead") return { ...base, strands: null, title: brandCode(c), series: c.series, stitch: e.st === "point" ? "point" : null };
  if (e.t === "combo")
    return { ...base, title: `${brandCode(c.thread)} + ${brandCode(c.bead)}`, stitch: e.st ?? "full", beadName: c.bead?.name, name: c.thread?.name ?? "?" };
  const blend = !!c.isBlend;
  const title = blend ? c.code : brandCode(c);
  if (e.t === "back") return { ...base, title, blend };
  if (e.t === "knot") return { ...base, title, blend, wraps: e.wraps };
  return { ...base, title, blend, stitch: e.st ?? "full", strands: blend ? blendStrands(c) || null : e.n ?? null };
}

/** How a stamp is named in a label: a built-in one by its message, one's own by the name given it. */
export const stampLabel = (p: Pick<Pattern, "stamps">, id: string | undefined): LabelData["stamp"] =>
  !id ? undefined : isBuiltInStamp(id) ? { key: `stamps.${id}` } : { name: stampDef(p, id)?.name || "" };

export const keyLabelData = (p: Pattern, e: KeyEntry): LabelData => {
  const d = labelData(e, resolveColor(p, e.src)), stamp = stampLabel(p, e.stamp);
  return stamp ? { ...d, stamp } : d;
};

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
      parts.push(d.blend ? null : strands, !d.stamp ? t("label.backstitch") : "key" in d.stamp ? t(d.stamp.key) : d.stamp.name || t("stamps.own"));
      break;
    case "knot":
      parts.push(d.blend ? null : strands, d.wraps ? t("label.knotWraps", { wraps: d.wraps }) : t("label.knot"));
      break;
    default:
      parts.push(d.blend ? null : strands, stitch);
  }
  return { title, sub: parts.filter(Boolean).join(" · ") };
}
