"use client";

import { useTranslations } from "next-intl";
import { PARTIAL_KINDS } from "@/core/stitches/partialKinds";
import type { ToolId } from "@/editor/store/editorStore";
import { toolById } from "@/editor/tools/registry";
import { Icon } from "../common/Icon";
import { cx, ui } from "../common/widgets";
import { useCommand, useEditorState } from "../hooks/editor";
import s from "./header.module.css";

const MIRROR_LABEL = { off: "mirrorOff", vertical: "mirrorVertical", horizontal: "mirrorHorizontal", quad: "mirrorQuad" } as const;

/** The main drawing toolbar, in the header (SPEC §4.1): history, modes, brush tools + size, shapes, partials, look, select. */
export function ToolBar() {
  const t = useTranslations("tools");
  const run = useCommand();
  const tool = useEditorState((st) => st.tool);
  // a tool held down (Alt: picker, Space: move) shows as the selected one while it's held
  const shown = useEditorState((st) => st.momentaryTool ?? st.tool);
  const brush = useEditorState((st) => st.brush);
  const override = useEditorState((st) => st.override);
  const mirror = useEditorState((st) => st.mirror);
  const partialKind = useEditorState((st) => st.partialKind);
  const canUndo = useEditorState((st) => st.canUndo || !!st.floating);
  const canRedo = useEditorState((st) => st.canRedo);
  const usesBrush = toolById(tool).usesBrush;
  // while the image behind the chart is edited, the pointer moves the image: no tool works
  const paused = useEditorState((st) => !!st.underlay && st.underlay.visible && !st.underlay.behind);
  const toolButton = (id: ToolId) => (
    <button key={id} type="button" className={cx(ui.tool, shown === id && ui.on)} title={t(id)} aria-label={t(id)} aria-pressed={shown === id} data-guide={`tool-${id}`} onClick={() => run("tool.select", id)}>
      <Icon name={toolById(id).icon} size={18} />
    </button>
  );
  // sizes and partial kinds stay in place; they are dimmed while the active tool doesn't use them, and picking
  // one switches to a tool that does
  const setBrush = (n: number) => {
    run("draw.setBrush", n);
    if (!usesBrush) run("tool.select", "pencil");
  };
  const setPartial = (k: string) => {
    run("draw.setPartialKind", k);
    if (tool !== "partial") run("tool.select", "partial");
  };
  return (
    <div className={cx(s.tools, paused && s.paused)} role="toolbar" aria-label={t("toolbar")} aria-disabled={paused} title={paused ? t("pausedForImage") : undefined} data-guide="toolbar" data-testid="toolbar">
      <button type="button" className={ui.tool} title={t("undo")} disabled={!canUndo} onClick={() => run("history.undo")}><Icon name="undo" size={18} /></button>
      <button type="button" className={ui.tool} title={t("redo")} disabled={!canRedo} onClick={() => run("history.redo")}><Icon name="redo" size={18} /></button>
      <span className={s.sep} />
      <button type="button" className={cx(ui.tool, override && ui.on)} title={t("override")} aria-pressed={override} data-guide="override" onClick={() => run("draw.toggleOverride")}><Icon name="override" size={18} /></button>
      <button type="button" className={cx(ui.tool, mirror !== "off" && ui.on)} title={`${t("mirror")} — ${t(MIRROR_LABEL[mirror])}`} onClick={() => run("draw.cycleMirror")}><Icon name="mirror" size={18} /></button>
      <span className={s.sep} />
      {toolButton("autofill")}
      <span className={s.sep} />
      {toolButton("pencil")}
      {toolButton("eraser")}
      <div className={cx(s.sizes, !usesBrush && s.idle)} role="group" aria-label={t("brushSize")}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" className={cx(brush === n && s.on)} title={t("brushSizeN", { n })} aria-label={t("brushSizeN", { n })} aria-pressed={brush === n} onClick={() => setBrush(n)}>{n}</button>
        ))}
      </div>
      <span className={s.sep} />
      {(["line", "rect", "filledRect", "fill"] as const).map(toolButton)}
      <span className={s.sep} />
      {toolButton("partial")}
      <div className={cx(s.sizes, tool !== "partial" && s.idle)} role="group" aria-label={t("partial")}>
        {PARTIAL_KINDS.map((k) => (
          <button key={k.id} type="button" className={cx(partialKind === k.id && s.on)} title={t(`partialKind.${k.id}`)} aria-label={t(`partialKind.${k.id}`)} aria-pressed={partialKind === k.id} onClick={() => setPartial(k.id)}>{k.glyph}</button>
        ))}
      </div>
      <span className={s.sep} />
      {(["picker", "pan"] as const).map(toolButton)}
      <span className={s.sep} />
      {(["select", "magicWand"] as const).map(toolButton)}
    </div>
  );
}
