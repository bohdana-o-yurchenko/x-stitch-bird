"use client";

import { useTranslations } from "next-intl";
import type { Rect } from "@/core/pattern/types";
import { cx, ui } from "../common/widgets";
import { useCommand, useEditorState } from "../hooks/editor";
import s from "./side.module.css";

const round = (v: number) => Math.round(v * 100) / 100;

/** The chart underlay's controls (SPEC §15.15). Shown only when the pattern has one. */
export function UnderlayPanel() {
  const t = useTranslations("underlay");
  const run = useCommand();
  const u = useEditorState((st) => st.underlay);
  if (!u) return null;
  const editing = !u.behind;
  const setRect = (patch: Partial<Rect>) => run("underlay.update", { rect: { ...u.rect, ...patch } });
  const num = (key: keyof Rect, label: string) => (
    <label className={ui.field}>
      {label}
      <input type="number" step={0.1} min={key === "w" || key === "h" ? 1 : undefined} value={round(u.rect[key])}
        onChange={(e) => Number.isFinite(e.target.valueAsNumber) && setRect({ [key]: (key === "w" || key === "h") ? Math.max(1, e.target.valueAsNumber) : e.target.valueAsNumber })} />
    </label>
  );
  return (
    <details className={s.details} open data-testid="underlay-panel">
      <summary>{t("heading")}</summary>
      <div className={s.section}>
        <label className={ui.chk}>
          <input type="checkbox" checked={u.behind} onChange={(e) => run("underlay.update", { behind: e.target.checked, visible: true })} />
          <b>{t("behind")}</b>
        </label>
        <p className={ui.hint}>{editing ? t("editHint") : t("behindHint")}</p>
        <div className={ui.row}>
          <label className={ui.chk}>
            <input type="checkbox" checked={u.visible} onChange={(e) => run("underlay.update", { visible: e.target.checked })} />
            {t("show")}
          </label>
          <label className={ui.chk} style={{ flex: 1 }}>
            {t("opacity")}
            <input type="range" min={10} max={100} value={Math.round(u.opacity * 100)} style={{ flex: 1, accentColor: "var(--accent)" }} onChange={(e) => run("underlay.update", { opacity: Number(e.target.value) / 100 })} />
          </label>
        </div>
        {editing && (
          <div className={ui.seg}>
            <button type="button" className={cx(u.tool === "move" && ui.on)} onClick={() => run("underlay.update", { tool: "move" })}>{t("move")}</button>
            <button type="button" className={cx(u.tool === "crop" && ui.on)} onClick={() => run("underlay.update", { tool: "crop" })}>{t("crop")}</button>
          </div>
        )}
        <div className={ui.grid2}>
          {num("x", t("x"))}
          {num("y", t("y"))}
          {num("w", t("w"))}
          {num("h", t("h"))}
        </div>
        <div className={ui.row}>
          <button type="button" className={cx(ui.btn, ui.sm)} onClick={() => run("underlay.startAlign")}>{t("align")}</button>
          <button type="button" className={cx(ui.btn, ui.sm)} onClick={() => run("underlay.fit")}>{t("fit")}</button>
          <button type="button" className={cx(ui.btn, ui.sm)} onClick={() => run("underlay.resetCrop")}>{t("resetCrop")}</button>
          <button type="button" className={cx(ui.btn, ui.sm)} onClick={() => run("underlay.replacePick")}>{t("replace")}</button>
          <button type="button" className={cx(ui.btn, ui.sm)} onClick={() => run("underlay.remove")}>{t("remove")}</button>
        </div>
      </div>
    </details>
  );
}
