"use client";

import { useTranslations } from "next-intl";
import { cx, ui } from "../common/widgets";
import { useCommand, useEditor, useEditorState } from "../hooks/editor";
import { Section } from "./Section";
import { UnderlayPanel } from "./UnderlayPanel";
import s from "./side.module.css";

/**
 * References (SPEC §15.15, §11.1, §15.32): the photos of the paper chart — photos in floating windows first, then
 * the image behind the chart. Both are added from here; the windows are listed, shown or hidden, removed.
 */
export function ReferencesPanel() {
  const t = useTranslations("references");
  const tu = useTranslations("underlay");
  const run = useCommand();
  const ed = useEditor();
  const windows = useEditorState((st) => st.references);
  return (
    <Section id="references" title={t("heading")} defaultOpen testId="references-panel">
      <div className={s.group} data-testid="ref-windows">
        <h4 className={s.groupTitle}>{t("windows")}</h4>
        {!windows.length && <p className={s.prowNote} style={{ margin: 0 }}>{t("windowsHint")}</p>}
        {windows.map((w) => (
          <div key={w.id} className={s.refRow}>
            <span className={s.refName}>{w.name}</span>
            <button type="button" className={cx(ui.btn, ui.sm)} aria-pressed={!w.min} onClick={() => ed.references.update(w.id, { min: !w.min })}>{w.min ? t("show") : t("hide")}</button>
            <button type="button" className={cx(ui.btn, ui.sm)} aria-label={t("removeWindow", { name: w.name })} title={t("removeWindow", { name: w.name })} onClick={() => ed.references.remove(w.id)}>✕</button>
          </div>
        ))}
        <button type="button" className={cx(ui.btn, ui.sm)} style={{ alignSelf: "flex-start" }} onClick={() => run("reference.pick")} data-testid="ref-window-add">{t("addWindow")}</button>
      </div>
      <UnderlayPanel title={tu("heading")} />
    </Section>
  );
}
