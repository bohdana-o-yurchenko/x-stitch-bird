"use client";

import { useTranslations } from "next-intl";
import { PARTIAL_KINDS } from "@/core/stitches/partialKinds";
import { TOOLS } from "@/editor/tools/registry";
import { Icon } from "../common/Icon";
import { cx, ui } from "../common/widgets";
import { useCommand, useEditorState } from "../hooks/editor";
import s from "./side.module.css";

const MIRROR_LABEL = { off: "mirrorOff", vertical: "mirrorVertical", horizontal: "mirrorHorizontal", quad: "mirrorQuad" } as const;

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
  return (
    <div className={s.tools}>
      {TOOLS.map((tl) => (
        <button key={tl.id} type="button" className={cx(ui.tool, tool === tl.id && ui.on)} title={t(tl.id)} aria-label={t(tl.id)} aria-pressed={tool === tl.id} onClick={() => run("tool.select", tl.id)}>
          <Icon name={tl.icon} size={18} />
        </button>
      ))}
      <span className={s.sep} />
      {tool === "partial" ? (
        <select className={s.select} title={t("partial")} value={partialKind} onChange={(e) => run("draw.setPartialKind", e.target.value)}>
          {PARTIAL_KINDS.map((k) => (
            <option key={k.id} value={k.id}>{`${k.glyph} ${t(`partialKind.${k.id}`)}`}</option>
          ))}
        </select>
      ) : (
        <select className={s.select} title={t("brushSize")} value={brush} onChange={(e) => run("draw.setBrush", e.target.value)}>
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>{`${n}×${n}`}</option>
          ))}
        </select>
      )}
      <button type="button" className={cx(ui.tool, override && ui.on)} title={t("override")} aria-pressed={override} onClick={() => run("draw.toggleOverride")}><Icon name="override" size={18} /></button>
      <button type="button" className={cx(ui.tool, mirror !== "off" && ui.on)} title={`${t("mirror")} — ${t(MIRROR_LABEL[mirror])}`} onClick={() => run("draw.cycleMirror")}><Icon name="mirror" size={18} /></button>
      <span className={s.sep} />
      <button type="button" className={ui.tool} title={t("undo")} disabled={!canUndo} onClick={() => run("history.undo")}><Icon name="undo" size={18} /></button>
      <button type="button" className={ui.tool} title={t("redo")} disabled={!canRedo} onClick={() => run("history.redo")}><Icon name="redo" size={18} /></button>
      <span className={s.spacer} />
      <button type="button" className={ui.tool} title={t("collapse")} onClick={() => run("panel.toggle")}><Icon name="collapse" size={18} /></button>
    </div>
  );
}
