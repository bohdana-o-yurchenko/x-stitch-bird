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
  const own = META_FIELDS.filter((f) => !f.oxs);
  return (
    <>
      <div className={s.group}>
        <TimeSpent />
      </div>
      <div className={s.group}>
        <h4 className={s.groupTitle}>{t("dialogs.infoOxs")}</h4>
        <p className={s.prowNote} style={{ margin: 0 }}>{t("dialogs.infoOxsHint")}</p>
        <div className={s.infoFields}>{META_FIELDS.filter((f) => f.oxs).map(field)}</div>
      </div>
      <div className={s.group}>
        {/* the app's own fields, folded unless something's in them */}
        <details className={s.fold} open={own.some((f) => !!meta[f.id])}>
          <summary>{t("dialogs.infoOwn")}</summary>
          <p className={s.prowNote} style={{ margin: "0 0 4px" }}>{t("dialogs.infoOwnHint")}</p>
          <div className={s.infoFields}>{own.map(field)}</div>
        </details>
      </div>
    </>
  );
}
