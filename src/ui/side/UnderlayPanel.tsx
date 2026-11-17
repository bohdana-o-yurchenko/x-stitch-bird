"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { Rect } from "@/core/pattern/types";
import { ROTATION_MAX, ROTATION_STEP } from "@/core/underlay/underlay";
import { Icon } from "../common/Icon";
import { ConfirmDelete, cx, ui } from "../common/widgets";
import { useCommand, useEditorState } from "../hooks/editor";
import s from "./side.module.css";

const round = (v: number) => Math.round(v * 100) / 100;

/** The chart underlay (SPEC §15.15), in References: its controls — or, when the pattern has none, the way to add one. */
export function UnderlayPanel({ title }: { title: string }) {
  const t = useTranslations("underlay");
  const run = useCommand();
  const u = useEditorState((st) => st.underlay);
  const [confirm, setConfirm] = useState(false);
  // none yet: the section is where one is added (SPEC §15.32)
  if (!u)
    return (
      <div className={s.refPart} data-testid="underlay-panel">
        <div className={s.group}>
          <h4 className={s.groupTitle}>{title}</h4>
          <p className={ui.hint} style={{ margin: 0 }}>{t("addHint")}</p>
          <button type="button" className={cx(ui.btn, ui.sm, ui.primary)} style={{ alignSelf: "flex-start" }} onClick={() => run("underlay.pick")} data-testid="underlay-add">{t("add")}</button>
        </div>
      </div>
    );
  const rotation = u.rotation ?? 0;
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
    <div className={s.refPart} data-testid="underlay-panel">
      <div className={s.group}>
        <h4 className={s.groupTitle}>{title}</h4>
        <label className={s.switch}>
          <input type="checkbox" role="switch" checked={u.behind} onChange={(e) => run("underlay.update", { behind: e.target.checked, visible: true })} />
          <b>{t("behind")}</b>
        </label>
        <div className={s.prow}>
          <label className={s.switch}>
            <input type="checkbox" role="switch" checked={u.visible} onChange={(e) => run("underlay.update", { visible: e.target.checked })} />
            {t("show")}
          </label>
          <input type="range" className={s.prowGrow} aria-label={t("opacity")} title={t("opacity")} min={10} max={100} value={Math.round(u.opacity * 100)} style={{ accentColor: "var(--accent)" }} onChange={(e) => run("underlay.update", { opacity: Number(e.target.value) / 100 })} />
        </div>
        {/* editing: what the pointer does, and how */}
        {editing ? (
          <>
            <div className={ui.seg} style={{ alignSelf: "flex-start" }}>
              <button type="button" className={cx(u.tool === "move" && ui.on)} onClick={() => run("underlay.update", { tool: "move" })}>{t("move")}</button>
              <button type="button" className={cx(u.tool === "crop" && ui.on)} onClick={() => run("underlay.update", { tool: "crop" })}>{t("crop")}</button>
            </div>
            <p className={s.prowNote} style={{ margin: 0 }}>{t("editHint")}</p>
          </>
        ) : (
          <p className={s.prowNote} style={{ margin: 0 }}>{t("behindHint")}</p>
        )}
      </div>
      <div className={s.group}>
        <h4 className={s.groupTitle}>{t("adjust")}</h4>
        <div className={s.prow}>
          <span className={s.prowLabel}>{t("rotation")}</span>
          <input className={ui.input} type="number" step={0.1} min={-ROTATION_MAX} max={ROTATION_MAX} value={round(rotation)} aria-label={t("rotation")} data-testid="underlay-rotation" style={{ maxWidth: 76 }}
            onChange={(e) => run("underlay.setRotation", e.target.valueAsNumber)} />
          <button type="button" className={cx(ui.btn, ui.sm)} title={t("rotateLeft")} aria-label={t("rotateLeft")} onClick={() => run("underlay.setRotation", rotation - ROTATION_STEP)}>↺</button>
          <button type="button" className={cx(ui.btn, ui.sm)} title={t("rotateRight")} aria-label={t("rotateRight")} onClick={() => run("underlay.setRotation", rotation + ROTATION_STEP)}>↻</button>
          <button type="button" className={cx(ui.btn, ui.sm)} disabled={!rotation} onClick={() => run("underlay.setRotation", 0)}>{t("rotationReset")}</button>
        </div>
        <div className={s.buttons}>
          <button type="button" className={cx(ui.btn, ui.sm)} onClick={() => run("underlay.openStraighten")}>{t("straighten")}</button>
          <button type="button" className={cx(ui.btn, ui.sm)} onClick={() => run("underlay.fit")}>{t("fit")}</button>
          <button type="button" className={cx(ui.btn, ui.sm)} onClick={() => run("underlay.resetCrop")}>{t("resetCrop")}</button>
        </div>
        <details className={s.fold}>
          <summary>{t("exactPosition")}</summary>
          <div className={ui.grid2}>
            {num("x", t("x"))}
            {num("y", t("y"))}
            {num("w", t("w"))}
            {num("h", t("h"))}
          </div>
        </details>
      </div>
      <div className={s.group}>
        <button type="button" className={cx(ui.btn, ui.sm, ui.primary)} style={{ alignSelf: "flex-start" }} title={t("matchHint")} data-testid="match-start" onClick={() => run("tool.select", "autofill")}>{t("match")}</button>
        <div className={s.buttons}>
          <button type="button" className={cx(ui.btn, ui.sm)} onClick={() => run("underlay.replacePick")}>{t("replace")}</button>
          <button type="button" className={cx(ui.btn, ui.sm, ui.deleteText)} onClick={() => setConfirm(true)}><Icon name="trash" size={15} />{t("remove")}</button>
        </div>
      </div>
      {confirm && (
        <ConfirmDelete title={t("removeTitle")} confirm={t("removeConfirm")} onConfirm={() => run("underlay.remove")} onClose={() => setConfirm(false)}>
          <p className={ui.hint}>{t("removeBody")}</p>
        </ConfirmDelete>
      )}
    </div>
  );
}
