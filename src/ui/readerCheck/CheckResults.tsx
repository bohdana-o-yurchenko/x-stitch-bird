"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { summarize, type SummaryLine } from "@/core/readerCheck/summary";
import type { CheckRun, CheckSuite } from "@/core/readerCheck/types";
import { Modal, cx } from "../common/widgets";
import s from "./check.module.css";

/**
 * The results of a check (SPEC §15.51): how many are fine, what the issues have in common — "doesn't work: your own
 * beads (2 of 2)" — the items with issues and their notes; copied as text to pass on.
 */
export function CheckResults({ suite, run, lang, onClose }: { suite: CheckSuite; run: CheckRun; lang: "uk" | "en"; onClose: () => void }) {
  const t = useTranslations("readerCheck");
  const [copied, setCopied] = useState(false);
  const sum = summarize(suite.items, run.marks);
  const app = run.app.trim() || t("unnamed");
  const bad = suite.items.flatMap((item, i) => (run.marks[item.id]?.v === "issue" ? [{ item, n: i + 1, note: run.marks[item.id]!.note }] : []));
  const line = (l: SummaryLine) => (l.issues === l.of ? t("lineAll", { tag: t(`tags.${l.tag}`), n: l.of }) : t("linePart", { tag: t(`tags.${l.tag}`), issues: l.issues, of: l.of }));
  const headline = !sum.issues ? t("allGood", { app }) : t("someIssues", { app, ok: sum.ok, total: sum.total - sum.left });

  const text = () => [
    `${t(`kinds.${suite.kind}.name`)} — ${app}`,
    headline,
    ...(sum.left ? [t("notChecked", { n: sum.left })] : []),
    ...sum.lines.map((l) => `• ${line(l)}`),
    ...(sum.issues && sum.ok ? [t("rest")] : []),
    ...(bad.length ? ["", t("withIssues"), ...bad.map((b) => `#${b.n} ${b.item.what[lang]}${b.note ? ` — ${b.note}` : ""}`)] : []),
  ].join("\n");

  return (
    <Modal title={t("resultsTitle")} wide onClose={onClose} buttons={[
      { label: copied ? t("copied") : t("copy"), onClick: async () => { await navigator.clipboard?.writeText(text()).catch(() => {}); setCopied(true); return false; } },
      { label: t("close"), primary: true },
    ]}>
      <div className={s.results} data-testid="check-results-dialog">
        <p className={cx(s.headline, !sum.issues && s.headlineOk)}>{headline}</p>
        {sum.left > 0 && <p className={s.hint}>{t("notChecked", { n: sum.left })}</p>}
        {sum.lines.length > 0 && (
          <ul className={s.lines}>
            {sum.lines.map((l) => <li key={l.tag} className={l.issues === l.of ? s.lineAll : s.linePart}>{line(l)}</li>)}
            {sum.ok > 0 && <li className={s.lineOk}>{t("rest")}</li>}
          </ul>
        )}
        {bad.length > 0 && (
          <>
            <h3>{t("withIssues")}</h3>
            <ol className={s.badList}>
              {bad.map((b) => (
                <li key={b.item.id}>
                  <span className={s.num}>{b.n}</span>
                  <span>{b.item.what[lang]}{b.note && <em> — {b.note}</em>}</span>
                </li>
              ))}
            </ol>
          </>
        )}
      </div>
    </Modal>
  );
}
