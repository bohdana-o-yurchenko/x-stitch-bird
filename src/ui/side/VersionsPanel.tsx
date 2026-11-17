"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { SnapshotSummary } from "@/editor/types";
import { TimeSpent } from "../common/TimeSpent";
import { cx, ui } from "../common/widgets";
import { useCommand, useEditor, useEditorState } from "../hooks/editor";
import { Section } from "./Section";
import s from "./side.module.css";

/** Versions (SPEC §15.7, §15.17, §15.32): the time spent on the pattern, then its automatic copies, newest first, each with Restore. */
export function VersionsPanel() {
  const t = useTranslations();
  const run = useCommand();
  const ed = useEditor();
  const id = useEditorState((st) => st.doc.id);
  const revision = useEditorState((st) => st.docRevision);
  const [snaps, setSnaps] = useState<SnapshotSummary[] | null>(null);
  // copies are taken before risky changes: look again when the pattern changes
  useEffect(() => {
    let live = true;
    void ed.snapshots.list().then((list) => live && setSnaps(list));
    return () => {
      live = false;
    };
  }, [ed, id, revision]);
  return (
    <Section id="versions" title={t("side.versions")} defaultOpen testId="versions-panel">
      <div className={s.section}>
        <TimeSpent />
        <p className={ui.hint} style={{ margin: 0 }}>{t("dialogs.versionsHint")}</p>
        {!snaps && <p className={ui.hint}>{t("dialogs.loading")}</p>}
        {snaps && !snaps.length && <p className={ui.hint}>{t("dialogs.noHistory")}</p>}
        {snaps?.map((sn) => (
          <div key={sn.time} className={s.version}>
            {sn.thumb && <span className={s.versionThumb} style={{ backgroundImage: `url(${sn.thumb})` }} />}
            <span className={ui.hint} style={{ flex: 1 }}>
              {t("snapshots.row", { time: new Date(sn.time).toLocaleString(), reason: t(`snapshots.reason.${sn.reason}`), w: sn.w, h: sn.h })}
            </span>
            <button type="button" className={cx(ui.btn, ui.sm)} onClick={() => run("snapshot.restore", sn.time)}>{t("dialogs.restore")}</button>
          </div>
        ))}
      </div>
    </Section>
  );
}
