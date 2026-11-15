"use client";

import { useTranslations } from "next-intl";
import type { ChartView } from "@/render/chart";
import { Icon } from "../common/Icon";
import { cx, ui } from "../common/widgets";
import { useCommand, useEditorState } from "../hooks/editor";
import { ChartCanvas } from "./ChartCanvas";
import s from "./stage.module.css";

/** Colour / Both / Symbols — how the chart is drawn; sits with the zoom. */
function ViewSwitch() {
  const t = useTranslations("view");
  const run = useCommand();
  const view = useEditorState((st) => st.view);
  return (
    <div className={s.viewSwitch} role="group" aria-label={t("label")} data-guide="views">
      {(["color", "both", "symbols"] as ChartView[]).map((v) => (
        <button key={v} type="button" className={cx(view === v && s.on)} aria-pressed={view === v} onClick={() => run("view.set", v)}>
          {t(v)}
        </button>
      ))}
    </div>
  );
}

/**
 * Edit mode for the image behind the chart (same as U): shown whenever the pattern has one. When zoomed in, edit
 * mode also draws the small edit frame in the middle of the view (SPEC §15.15).
 */
function UnderlayEditToggle() {
  const t = useTranslations("underlay");
  const run = useCommand();
  const has = useEditorState((st) => !!st.underlay);
  const editing = useEditorState((st) => !!st.underlay && st.underlay.visible && !st.underlay.behind);
  if (!has) return null;
  const label = editing ? t("editOff") : t("editOn");
  return (
    <>
      <span className={s.zoomDivider} />
      <button type="button" className={cx(s.editToggle, editing && s.on)} title={label} aria-label={label} aria-pressed={editing} data-testid="underlay-edit" data-guide="underlay-edit" onClick={() => run("underlay.toggleBehind")}>
        <Icon name="underlayEdit" size={17} />
      </button>
    </>
  );
}

function ZoomControls() {
  const t = useTranslations("tools");
  const run = useCommand();
  const zoom = useEditorState((st) => st.viewport.zoom);
  return (
    <div className={s.zoom}>
      <ViewSwitch />
      <div className={s.zoomRow}>
        <button type="button" title={t("zoomOut")} onClick={() => run("view.zoomOut")}>−</button>
        <span>{Math.round((zoom / 12) * 100)}%</span>
        <button type="button" title={t("zoomIn")} onClick={() => run("view.zoomIn")}>+</button>
        <button type="button" title={t("fit")} onClick={() => run("view.fit")}>⤢</button>
        <UnderlayEditToggle />
      </div>
    </div>
  );
}

function SelectionActions() {
  const t = useTranslations("selection");
  const run = useCommand();
  const floating = useEditorState((st) => !!st.floating);
  const btn = cx(ui.btn, ui.sm);
  return (
    <div className={s.selectionBar}>
      <button type="button" className={btn} title={t("flipH")} onClick={() => run("selection.flipH")}><Icon name="flipH" size={16} /></button>
      <button type="button" className={btn} title={t("flipV")} onClick={() => run("selection.flipV")}><Icon name="flipV" size={16} /></button>
      <button type="button" className={btn} title={t("rotate")} onClick={() => run("selection.rotate")}><Icon name="rotate" size={16} /></button>
      {floating ? (
        <>
          <button type="button" className={cx(btn, ui.primary)} onClick={() => run("floating.commit")}>{t("commit")}</button>
          <button type="button" className={btn} onClick={() => run("floating.cancel")}>{t("cancel")}</button>
        </>
      ) : (
        <>
          <button type="button" className={btn} onClick={() => run("selection.clear")}>{t("delete")}</button>
          <button type="button" className={btn} onClick={() => run("selection.requestReplaceKey")}>{t("replaceKey")}</button>
          <button type="button" className={btn} onClick={() => run("selection.crop")}>{t("crop")}</button>
        </>
      )}
    </div>
  );
}

export function Stage() {
  const hasSelection = useEditorState((st) => !!st.selection || !!st.floating);
  return (
    <>
      <ChartCanvas />
      {hasSelection && <SelectionActions />}
      <ZoomControls />
    </>
  );
}
