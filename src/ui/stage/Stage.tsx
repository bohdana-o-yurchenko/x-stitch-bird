"use client";

import { useTranslations } from "next-intl";
import { MINI_TOOLS, toolById } from "@/editor/tools/registry";
import { Icon } from "../common/Icon";
import { KeyIcon, cx, ui } from "../common/widgets";
import { useCommand, useEditor, useEditorState } from "../hooks/editor";
import { ChartCanvas } from "./ChartCanvas";
import s from "./stage.module.css";

function ZoomControls() {
  const t = useTranslations("tools");
  const run = useCommand();
  const zoom = useEditorState((st) => st.viewport.zoom);
  return (
    <div className={s.zoom}>
      <button type="button" title={t("zoomOut")} onClick={() => run("view.zoomOut")}>−</button>
      <span>{Math.round((zoom / 12) * 100)}%</span>
      <button type="button" title={t("zoomIn")} onClick={() => run("view.zoomIn")}>+</button>
      <button type="button" title={t("fit")} onClick={() => run("view.fit")}>⤢</button>
    </div>
  );
}

/** Shown while the side panel is hidden (SPEC §4.2). */
function MiniToolbar() {
  const t = useTranslations("tools");
  const run = useCommand();
  const tool = useEditorState((st) => st.tool);
  const override = useEditorState((st) => st.override);
  const canUndo = useEditorState((st) => st.canUndo);
  const canRedo = useEditorState((st) => st.canRedo);
  const active = useEditorState((st) => st.activeEntry);
  const slot = useEditorState((st) => st.palette[st.activeEntry]);
  const ed = useEditor();
  return (
    <div className={s.mini}>
      <button type="button" className={ui.tool} title={t("expand")} aria-label={t("expand")} onClick={() => run("panel.toggle")}><Icon name="expand" size={18} /></button>
      <button type="button" className={s.miniKey} title={active ? t("activeEntry", { label: ed.entryLabel(active) }) : t("noActiveEntry")} onClick={() => run("panel.toggle")}>
        {slot && <KeyIcon slot={slot} size={34} />}
      </button>
      {MINI_TOOLS.map((id) => (
        <button key={id} type="button" className={cx(ui.tool, tool === id && ui.on)} title={t(id)} aria-label={t(id)} onClick={() => run("tool.select", id)}>
          <Icon name={toolById(id).icon} size={18} />
        </button>
      ))}
      <button type="button" className={cx(ui.tool, override && ui.on)} title={t("override")} onClick={() => run("draw.toggleOverride")}><Icon name="override" size={18} /></button>
      <button type="button" className={ui.tool} title={t("undo")} disabled={!canUndo} onClick={() => run("history.undo")}><Icon name="undo" size={18} /></button>
      <button type="button" className={ui.tool} title={t("redo")} disabled={!canRedo} onClick={() => run("history.redo")}><Icon name="redo" size={18} /></button>
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
  const collapsed = useEditorState((st) => st.panelCollapsed);
  const hasSelection = useEditorState((st) => !!st.selection || !!st.floating);
  return (
    <>
      <ChartCanvas />
      {collapsed && <MiniToolbar />}
      {hasSelection && <SelectionActions />}
      <ZoomControls />
    </>
  );
}
