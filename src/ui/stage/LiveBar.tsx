"use client";

import { useTranslations } from "next-intl";
import { Icon } from "../common/Icon";
import { cx, ui } from "../common/widgets";
import { useEditor, useEditorState } from "../hooks/editor";
import s from "./stage.module.css";

/**
 * Another window edits the open pattern (SPEC §15.34): this one follows it, and can take over — said plainly, across
 * the top of the chart, hard to miss. Taking over, a spinning wheel while the other window saves its last changes. A
 * try to change something here makes the bar wave.
 */
export function LiveBar() {
  const t = useTranslations("live");
  const ed = useEditor();
  const role = useEditorState((st) => st.live.role);
  const nudge = useEditorState((st) => st.live.nudge ?? 0);
  if (role !== "following" && role !== "takingOver") return null;
  const taking = role === "takingOver";
  return (
    <div key={nudge} className={cx(s.liveBar, nudge > 0 && s.liveNudge)} role="status" aria-live="polite" data-testid="live-bar">
      {taking ? <span className={s.spinner} aria-hidden="true" /> : <span className={s.liveIcon}><Icon name="pencil" size={18} /></span>}
      <span className={s.liveText}>
        <b>{t(taking ? "takingOverTitle" : "followingTitle")}</b>
        <span>{t(taking ? "takingOver" : "following")}</span>
      </span>
      {!taking && (
        <button type="button" className={cx(ui.btn, ui.primary)} onClick={() => void ed.live.takeOver()} data-testid="live-edit-here">
          {t("editHere")}
        </button>
      )}
    </div>
  );
}
