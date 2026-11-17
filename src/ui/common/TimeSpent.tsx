"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { splitDuration } from "@/core/time/workTime";
import { useEditor, useEditorState } from "../hooks/editor";
import s from "./common.module.css";

/**
 * Read-only "total time spent on this pattern" (SPEC §15.17); refreshes itself while shown. `compact`: one small
 * line (Totals).
 */
export function TimeSpent({ compact = false }: { compact?: boolean }) {
  const t = useTranslations("work");
  const ed = useEditor();
  useEditorState((st) => st.docRevision);
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 10_000);
    return () => clearInterval(id);
  }, []);
  const { h, m } = splitDuration(ed.doc.spent);
  const value = h ? t("hm", { h, m }) : m ? t("m", { m }) : t("none");
  if (compact)
    return (
      <p className={s.timeSpentSmall} title={t("hint")} data-testid="time-spent-small">
        {t("spentShort")} <b>{value}</b>
      </p>
    );
  return (
    <div className={s.timeSpent} title={t("hint")} data-testid="time-spent">
      <span>{t("spent")}</span>
      <b>{value}</b>
      {ed.timer.running && <span className={s.timeRunning}>{t("running")}</span>}
    </div>
  );
}
