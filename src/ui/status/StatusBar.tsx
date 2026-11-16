"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { cellLabel } from "@/core/grid/numbering";
import { ConfirmDelete, KeyIcon, cx, ui } from "../common/widgets";
import { useCommand, useEditorState } from "../hooks/editor";
import { useEntryLabel } from "../i18n/labels";
import s from "./status.module.css";

/** Appears only when marks exist (SPEC §15.5: no footprint when unused). */
function AmbiguousStatus() {
  const t = useTranslations("status");
  const run = useCommand();
  useEditorState((st) => st.docRevision);
  const count = useEditorState((st) => st.doc.layers.ambiguous.size);
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  if (!count) return null;
  return (
    <span className={s.amb}>
      <button type="button" className={s.link} title={t("ambiguousNext")} onClick={() => run("ambiguous.next")}>{t("ambiguous", { count })}</button>
      <button type="button" className={s.link} aria-label={t("ambiguousClear")} onClick={() => setOpen(!open)}>▾</button>
      {open && (
        <span className={s.pop}>
          <button type="button" className={cx(ui.btn, ui.sm, ui.deleteText)} onClick={() => { setOpen(false); setConfirm(true); }}>{t("ambiguousClear")}</button>
        </span>
      )}
      {confirm && (
        <ConfirmDelete title={t("ambiguousClearTitle", { count })} confirm={t("ambiguousClearConfirm")} onConfirm={() => run("ambiguous.clearAll")} onClose={() => setConfirm(false)}>
          <p className={ui.hint}>{t("ambiguousClearBody")}</p>
        </ConfirmDelete>
      )}
    </span>
  );
}

/** The active key entry — what the brush paints with. */
function CurrentEntry() {
  const t = useTranslations("status");
  const active = useEditorState((st) => st.activeEntry);
  const slot = useEditorState((st) => st.palette[st.activeEntry]);
  const autofill = useEditorState((st) => st.tool === "autofill");
  const label = useEntryLabel();
  if (!active || !slot) return <span>{t("noEntry")}</span>;
  const l = label(active);
  return (
    <span className={cx(s.entry, autofill && s.idle)} data-testid="status-entry" data-idle={autofill || undefined} title={autofill ? t("notUsedByAutofill") : undefined}>
      <KeyIcon slot={slot} size={18} />
      <b>{l.title}</b>
      <span className={s.entrySub}>{l.sub}</span>
    </span>
  );
}

export function StatusBar() {
  const t = useTranslations("status");
  const tt = useTranslations("tools");
  const hover = useEditorState((st) => st.hoverCell);
  useEditorState((st) => st.docRevision);
  const p = useEditorState((st) => st.doc);
  const savedAt = useEditorState((st) => st.savedAt);
  const underlayEditing = useEditorState((st) => !!st.underlay && st.underlay.visible && !st.underlay.behind);
  const label = useEntryLabel();
  const inside = hover && hover.x >= 0 && hover.y >= 0 && hover.x < p.w && hover.y < p.h;
  const i = inside ? hover.y * p.w + hover.x : -1;
  const parts: string[] = [];
  if (inside) {
    const k = p.layers.stitches[i] ?? 0, b = p.layers.beads[i] ?? 0;
    if (k && p.key[k]) parts.push(`${label(k).title} — ${label(k).sub}`);
    for (const ps of p.layers.partials.get(i) ?? []) if (p.key[ps.k]) parts.push(`${label(ps.k).title} (${tt(`partialKind.${ps.kind}`)})`);
    if (b && p.key[b]) parts.push(`${label(b).title} — ${label(b).sub}`);
    if (p.layers.ambiguous.has(i)) parts.push(t("markedAmbiguous"));
  }
  const size = { w: p.w, h: p.h };
  return (
    <div className={s.bar}>
      <CurrentEntry />
      <span>{inside ? t.rich("position", { col: cellLabel(p.grid, "x", hover.x, size), row: cellLabel(p.grid, "y", hover.y, size), b: (c) => <b>{c}</b> }) : "—"}</span>
      <span className={s.cell}>{parts.join("  ·  ")}</span>
      <span className={s.spacer} />
      <AmbiguousStatus />
      {underlayEditing && <span className={s.hint}>{t("underlayHint")}</span>}
      <span>{`${p.w}×${p.h}`}</span>
      <span data-guide="saved">{savedAt ? t("savedAt", { time: new Date(savedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) }) : t("savesLocal")}</span>
    </div>
  );
}
