"use client";

import { useTranslations } from "next-intl";
import { PARTIAL_KINDS } from "@/core/stitches/partialKinds";
import { TOOLS } from "@/editor/tools/registry";
import { Icon } from "../common/Icon";
import { cx, ui } from "../common/widgets";
import { useCommand, useEditorState } from "../hooks/editor";
import s from "./header.module.css";

const MIRROR_LABEL = { off: "mirrorOff", vertical: "mirrorVertical", horizontal: "mirrorHorizontal", quad: "mirrorQuad" } as const;

/** The main drawing toolbar, in the header (SPEC §4.1). */
export function ToolBar() {
  const t = useTranslations("tools");
  const run = useCommand();
  const tool = useEditorState((st) => st.tool);
  const brush = useEditorState((st) => st.brush);
  const override = useEditorState((st) => st.override);
  const mirror = useEditorState((st) => st.mirror);
  const partialKind = useEditorState((st) => st.partialKind);
  const canUndo = useEditorState((st) => st.canUndo || !!st.floating);
  const canRedo = useEditorState((st) => st.canRedo);
  const toolButton = (tl: (typeof TOOLS)[number]) => (
    <button key={tl.id} type="button" className={cx(ui.tool, tool === tl.id && ui.on)} title={t(tl.id)} aria-label={t(tl.id)} aria-pressed={tool === tl.id} onClick={() => run("tool.select", tl.id)}>
      <Icon name={tl.icon} size={18} />
    </button>
  );
  return (
    <div className={s.tools} role="toolbar" aria-label={t("toolbar")}>
      {TOOLS.map(toolButton)}
      <span className={s.sep} />
      {tool === "partial" ? (
        <div className={s.sizes} role="group" aria-label={t("partial")}>
          {PARTIAL_KINDS.map((k) => (
            <button key={k.id} type="button" className={cx(partialKind === k.id && s.on)} title={t(`partialKind.${k.id}`)} aria-label={t(`partialKind.${k.id}`)} aria-pressed={partialKind === k.id} onClick={() => run("draw.setPartialKind", k.id)}>{k.glyph}</button>
          ))}
        </div>
      ) : (
        <div className={s.sizes} role="group" aria-label={t("brushSize")}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" className={cx(brush === n && s.on)} title={t("brushSizeN", { n })} aria-label={t("brushSizeN", { n })} aria-pressed={brush === n} onClick={() => run("draw.setBrush", n)}>{n}</button>
          ))}
        </div>
      )}
      <span className={s.sep} />
      <button type="button" className={cx(ui.tool, override && ui.on)} title={t("override")} aria-pressed={override} onClick={() => run("draw.toggleOverride")}><Icon name="override" size={18} /></button>
      <button type="button" className={cx(ui.tool, mirror !== "off" && ui.on)} title={`${t("mirror")} — ${t(MIRROR_LABEL[mirror])}`} onClick={() => run("draw.cycleMirror")}><Icon name="mirror" size={18} /></button>
      <span className={s.sep} />
      <button type="button" className={ui.tool} title={t("undo")} disabled={!canUndo} onClick={() => run("history.undo")}><Icon name="undo" size={18} /></button>
      <button type="button" className={ui.tool} title={t("redo")} disabled={!canRedo} onClick={() => run("history.redo")}><Icon name="redo" size={18} /></button>
    </div>
  );
}
