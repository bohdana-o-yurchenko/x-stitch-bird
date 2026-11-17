"use client";

import { Section } from "./Section";
import { useTranslations } from "next-intl";
import { brandCode } from "@/core/catalog/catalog";
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
    <Section id="totals" title={t("totals.heading")} defaultOpen>
      <div data-testid="totals">
        <div className={s.group}>
          <div className={s.stats}>
            <span>{t.rich("totals.full", { count: totals.full.toLocaleString(), b })}</span>
            <span>{t.rich("totals.half", { count: totals.half.toLocaleString(), b })}</span>
            {OPTIONAL.filter((k) => totals[k]).map((k) => <span key={k}>{t.rich(`totals.${k}`, { count: totals[k].toLocaleString(), b })}</span>)}
            <span>{t.rich("totals.backstitch", { count: totals.backstitch.toLocaleString(), b })}</span>
            <span>{t.rich("totals.beads", { count: totals.beads.toLocaleString(), b })}</span>
          </div>
        </div>
        <div className={s.group}>
          <h4 className={s.groupTitle}>{t("totals.toBuy", { threads: threads.length, skeins })}</h4>
          {!threads.length && <p className={s.prowNote} style={{ margin: 0 }}>{t("totals.none")}</p>}
          {threads.length > 0 && (
            <ul className={s.buyList}>
              {threads.map((l) => (
                <li key={l.item.id}>
                  <span>{brandCode(l.item)}</span>
                  <span className={s.buyQty}>× {l.quantity}</span>
                </li>
              ))}
            </ul>
          )}
          {beads.length > 0 && (
            <ul className={s.buyList}>
              {beads.map((l) => (
                <li key={l.item.id}>
                  <span>{brandCode(l.item)} {l.item.name}</span>
                  <span className={s.buyQty}>{l.quantity}</span>
                </li>
              ))}
            </ul>
          )}
          {shopping.notes.map((n) => <p key={n} className={s.prowNote} style={{ margin: 0 }}>{t(n)}</p>)}
        </div>
      </div>
    </Section>
  );
}
