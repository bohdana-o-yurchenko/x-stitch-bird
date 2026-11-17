"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { META_FIELDS } from "@/core/pattern/meta";
import type { PatternMeta } from "@/core/pattern/types";
import { TimeSpent } from "../common/TimeSpent";
import { ui } from "../common/widgets";
import { useCommand, useEditorState } from "../hooks/editor";
import { Section } from "./Section";
import s from "./side.module.css";

/**
 * Pattern info (SPEC §15.1, §15.32): the time spent, then who made it and where it's from — the fields OXS carries
 * first, then the app's own. Each field is saved as you leave it. The name is changed in the header.
 */
export function PatternInfoPanel() {
  const t = useTranslations();
  const run = useCommand();
  const id = useEditorState((st) => st.doc.id);
  // a fresh form for each pattern
  return (
    <Section id="info" title={t("side.info")} defaultOpen testId="info-panel">
      <InfoFields key={id} save={(m) => run("pattern.setInfo", m)} />
    </Section>
  );
}

function InfoFields({ save }: { save: (m: PatternMeta) => void }) {
  const t = useTranslations();
  const meta = useEditorState((st) => st.doc.meta);
  const [m, set] = useState<PatternMeta>({ ...meta });
  const commit = (next: PatternMeta) => JSON.stringify(next) !== JSON.stringify(meta) && save(next);
  const field = (f: (typeof META_FIELDS)[number]) => (
    <label key={f.id} className={ui.field}>
      {t(`meta.${f.id}`)}
      {f.multiline ? (
        <textarea value={m[f.id] ?? ""} onChange={(e) => set({ ...m, [f.id]: e.target.value })} onBlur={() => commit(m)} />
      ) : (
        <input value={m[f.id] ?? ""} onChange={(e) => set({ ...m, [f.id]: e.target.value })} onBlur={() => commit(m)} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} />
      )}
    </label>
  );
  return (
    <div className={s.section}>
      <TimeSpent />
      <p className={ui.hint} style={{ margin: "4px 0 0" }}>{t("dialogs.infoOxsHint")}</p>
      <div className={s.infoFields}>{META_FIELDS.filter((f) => f.oxs).map(field)}</div>
      <h4 className={ui.sectionTitle}>{t("dialogs.infoOwn")}</h4>
      <p className={ui.hint} style={{ margin: 0 }}>{t("dialogs.infoOwnHint")}</p>
      <div className={s.infoFields}>{META_FIELDS.filter((f) => !f.oxs).map(field)}</div>
    </div>
  );
}
