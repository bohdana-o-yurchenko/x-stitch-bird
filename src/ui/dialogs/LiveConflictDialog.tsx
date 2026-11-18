"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { parsePattern } from "@/core/formats/json/parse";
import type { PatternFile } from "@/core/formats/json/serialize";
import { buildPalette } from "@/core/pattern/palette";
import type { Pattern } from "@/core/pattern/types";
import { renderChartImage } from "@/render/exportChart";
import { cx, ui } from "../common/widgets";
import { useEditor, useEditorState } from "../hooks/editor";
import s from "../common/common.module.css";

const PREVIEW = 200;

/** A small colour picture of a pattern, or null. */
function preview(p: Pattern | null, theme: Parameters<typeof renderChartImage>[3]): string | null {
  if (!p) return null;
  try {
    const cell = Math.max(1, Math.floor(PREVIEW / Math.max(p.w, p.h)));
    return renderChartImage(p, buildPalette(p), "color", theme, { heading: "", key: [] }, cell).toDataURL("image/png");
  } catch {
    return null;
  }
}

/**
 * Changed here and elsewhere since the same revision (SPEC §15.34): go on with one; the other is kept in Versions.
 * Nothing closes it but a choice — a change can't be left half-settled.
 */
export function LiveConflictDialog({ theirs }: { theirs: { rev: number; doc: PatternFile } }) {
  const t = useTranslations("live");
  const ed = useEditor();
  const mine = useEditorState((st) => st.doc);
  const symbols = useEditorState((st) => st.symbols);
  const other = useMemo(() => {
    try {
      return parsePattern(theirs.doc, symbols).pattern;
    } catch {
      return null;
    }
  }, [theirs, symbols]);
  const pics = useMemo(() => ({ mine: preview(mine, ed.theme), other: preview(other, ed.theme) }), [mine, other, ed]);
  const card = (pic: string | null, title: string, size: string, label: string, onClick: () => void, testId: string) => (
    <div style={{ flex: "1 1 200px", display: "flex", flexDirection: "column", gap: 8, alignItems: "center", padding: 12, border: "1px solid var(--line2)", borderRadius: 10 }}>
      <b>{title}</b>
      <div style={{ width: PREVIEW, height: PREVIEW, display: "grid", placeItems: "center", background: "var(--stage, #f4f1ea)", borderRadius: 6 }}>
        {pic && <span style={{ width: "100%", height: "100%", background: `url(${pic}) center / contain no-repeat`, imageRendering: "pixelated" }} />}
      </div>
      <span className={ui.hint}>{size}</span>
      <button type="button" className={cx(ui.btn, ui.primary)} onClick={onClick} data-testid={testId}>{label}</button>
    </div>
  );
  return (
    <div className={s.backdrop}>
      <div className={cx(s.modal, s.wide)} role="dialog" aria-modal="true" aria-label={t("conflictTitle")} data-testid="live-conflict">
        <h2>{t("conflictTitle")}</h2>
        <div className={s.modalBody}>
          <p className={ui.hint} style={{ marginTop: 0 }}>{t("conflictBody")}</p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {card(pics.mine, t("mine"), t("size", { w: mine.w, h: mine.h }), t("keepMine"), () => void ed.live.keepMine(theirs), "live-keep-mine")}
            {card(pics.other, t("theirs"), other ? t("size", { w: other.w, h: other.h }) : "", t("useTheirs"), () => void ed.live.useTheirs(theirs), "live-use-theirs")}
          </div>
        </div>
      </div>
    </div>
  );
}
