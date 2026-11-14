"use client";

import { useTranslations } from "next-intl";
import { brandCode } from "@/core/catalog/catalog";
import { ui } from "../common/widgets";
import s from "./side.module.css";
import { useUsage } from "./useUsage";

const OPTIONAL = ["quarter", "threeQuarter", "petite", "knots"] as const;

export function TotalsPanel() {
  const t = useTranslations();
  const { totals, shopping } = useUsage();
  const b = (chunks: React.ReactNode) => <b>{chunks}</b>;
  const threads = shopping.lines.filter((l) => l.kind === "thread");
  const beads = shopping.lines.filter((l) => l.kind === "bead");
  const skeins = threads.reduce((a, l) => a + l.quantity, 0);
  return (
    <details className={s.details} open>
      <summary>{t("totals.heading")}</summary>
      <div className={s.section} data-testid="totals">
        <div className={s.totals}>
          <span>{t.rich("totals.full", { count: totals.full.toLocaleString(), b })}</span>
          <span>{t.rich("totals.half", { count: totals.half.toLocaleString(), b })}</span>
          {OPTIONAL.filter((k) => totals[k]).map((k) => <span key={k}>{t.rich(`totals.${k}`, { count: totals[k].toLocaleString(), b })}</span>)}
          <span>{t.rich("totals.backstitch", { count: totals.backstitch.toLocaleString(), b })}</span>
          <span>{t.rich("totals.beads", { count: totals.beads.toLocaleString(), b })}</span>
        </div>
        <p className={s.buyHead}>{t("totals.toBuy", { threads: threads.length, skeins })}</p>
        <p className={ui.hint}>{threads.length ? threads.map((l) => `${brandCode(l.item)} × ${l.quantity}`).join(" · ") : t("totals.none")}</p>
        {beads.length > 0 && <p className={ui.hint}>{beads.map((l) => `${brandCode(l.item)} ${l.item.name}: ${l.quantity}`).join(" · ")}</p>}
        {shopping.notes.map((n) => <p key={n} className={ui.hint}>{t(n)}</p>)}
      </div>
    </details>
  );
}
