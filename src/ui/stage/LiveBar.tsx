"use client";

import { useTranslations } from "next-intl";
import { cx, ui } from "../common/widgets";
import { useEditor, useEditorState } from "../hooks/editor";
import s from "./stage.module.css";

/**
 * Another window edits the open pattern (SPEC §15.34): this one follows it, and can take over. A try to change
 * something here makes the bar wave.
 */
export function LiveBar() {
  const t = useTranslations("live");
  const ed = useEditor();
  const role = useEditorState((st) => st.live.role);
  const nudge = useEditorState((st) => st.live.nudge ?? 0);
  if (role !== "following" && role !== "takingOver") return null;
  return (
    <div key={nudge} className={cx(s.selectionBar, s.liveBar, nudge > 0 && s.liveNudge)} role="status" data-testid="live-bar">
      <span className={s.barText}>{t(role === "following" ? "following" : "takingOver")}</span>
      {role === "following" && (
        <button type="button" className={cx(ui.btn, ui.sm, ui.primary)} onClick={() => void ed.live.takeOver()} data-testid="live-edit-here">
          {t("editHere")}
        </button>
      )}
    </div>
  );
}
