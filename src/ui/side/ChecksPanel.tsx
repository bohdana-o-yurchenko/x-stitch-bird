"use client";

import { useTranslations } from "next-intl";
import { CHECKS } from "@/core/checks/registry";
import { cx, ui } from "../common/widgets";
import { useCommand, useEditor, useEditorState } from "../hooks/editor";
import s from "./side.module.css";

/** "Check chart" (SPEC §15.4): options generated from each check's option list. */
export function ChecksPanel() {
  const t = useTranslations("checks");
  const run = useCommand();
  const ed = useEditor();
  const checks = useEditorState((st) => st.checks);
  if (!checks) return null;
  const list = ed.checks.visible(), current = list[checks.index];
  return (
    <section className={cx(s.section, s.details)} style={{ paddingTop: 10 }} data-testid="checks">
      <h3>{t("title")}</h3>
      <div className={s.checksScroll}>
        {CHECKS.map((c) => (
          <div key={c.id} style={{ marginBottom: 6 }}>
            <label className={ui.chk}>
              <input type="checkbox" checked={!!checks.enabled[c.id]} onChange={(e) => ed.checks.setEnabled(c.id, e.target.checked)} />
              <b>{t(`names.${c.id}`)}</b>
            </label>
            {checks.enabled[c.id] &&
              c.options.map((o) => (
                <label key={o.id} className={ui.chk} style={{ marginLeft: 22 }}>
                  {o.type === "boolean" ? (
                    <input type="checkbox" checked={!!checks.options[c.id]?.[o.id]} onChange={(e) => ed.checks.setOption(c.id, o.id, e.target.checked)} />
                  ) : (
                    <input type="number" className={ui.input} style={{ width: 64 }} min={o.min} max={o.max} value={Number(checks.options[c.id]?.[o.id])} onChange={(e) => ed.checks.setOption(c.id, o.id, Number(e.target.value))} />
                  )}
                  {t(`options.${o.id}`)}
                </label>
              ))}
          </div>
        ))}
      </div>
      <div className={ui.row}>
        <button type="button" className={cx(ui.btn, ui.sm, ui.primary)} onClick={() => run("checks.run")}>{t("run")}</button>
        {list.length > 0 && (
          <>
            <button type="button" className={cx(ui.btn, ui.sm)} onClick={() => run("checks.prev")}>{t("prev")}</button>
            <span className={ui.hint}>{t("position", { index: checks.index + 1, count: list.length })}</span>
            <button type="button" className={cx(ui.btn, ui.sm)} onClick={() => run("checks.next")}>{t("next")}</button>
          </>
        )}
      </div>
      {checks.index >= 0 && !list.length && <p className={ui.hint}>{t("none")}</p>}
      {current && (
        <div className={s.finding}>
          <p style={{ margin: "0 0 6px" }}>{t(current.messageKey.replace(/^checks\./, ""), current.params as never)}</p>
          <div className={ui.row}>
            {current.suggestion && <button type="button" className={cx(ui.btn, ui.sm)} onClick={() => run("checks.fix")}>{t("fix")}</button>}
            <button type="button" className={cx(ui.btn, ui.sm)} onClick={() => run("checks.ignore")}>{t("ignore")}</button>
          </div>
        </div>
      )}
    </section>
  );
}
