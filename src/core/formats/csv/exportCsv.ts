import { brandCode } from "../../catalog/catalog";
import { computeUsage, entryCount, partialCount } from "../../calculator/usage";
import type { ShoppingList } from "../../calculator/types";
import { formatLabel, keyLabelData, type Translate } from "../../labels/keyLabel";
import { META_FIELDS } from "../../pattern/meta";
import type { Pattern } from "../../pattern/types";
import { symbolText } from "../../symbols/lineStyles";

const q = (v: unknown) => `"${String(v).replace(/"/g, '""')}"`;

/** Shopping-list CSV (SPEC §10.2): used key entries, what to buy, then pattern info at the end (§15.1). */
export function exportCsv(p: Pattern, shopping: ShoppingList, t: Translate): string {
  const usage = computeUsage(p).perEntry;
  const lines = [[t("csv.symbol"), t("csv.item"), t("csv.details"), t("csv.count")].map(q).join(",")];
  p.key.forEach((e, i) => {
    const n = entryCount(usage.get(i)) + partialCount(usage.get(i));
    if (!e || !i || !n) return;
    const { title, sub } = formatLabel(keyLabelData(p, e), t);
    lines.push([symbolText(e.sym), title, sub, n].map(q).join(","));
  });
  lines.push("", q(t("csv.toBuy")));
  for (const l of shopping.lines)
    lines.push([q(""), q(brandCode(l.item)), q(l.item.name), q(t(`csv.unit.${l.unit}`, { n: l.quantity }))].join(","));
  const info = META_FIELDS.filter((f) => p.meta[f.id]);
  if (info.length) {
    lines.push("", q(t("csv.patternInfo")));
    for (const f of info) lines.push([q(t(`meta.${f.id}`)), q(p.meta[f.id])].join(","));
  }
  lines.push("", q(`${t("csv.generatedBy", { url: t("app.url") })} · ${t("app.glory")} 🇺🇦`));
  return lines.join("\n");
}
