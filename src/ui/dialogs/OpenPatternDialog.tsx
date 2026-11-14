"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { PatternSummary, SnapshotSummary } from "@/editor/types";
import { Modal, cx, ui } from "../common/widgets";
import { useCommand, useEditor } from "../hooks/editor";

export function OpenPatternDialog({ onClose }: { onClose: () => void }) {
  const t = useTranslations();
  const run = useCommand();
  const ed = useEditor();
  const [items, setItems] = useState<PatternSummary[] | null>(null);
  /** The saved pattern whose delete is waiting for confirmation. */
  const [confirming, setConfirming] = useState<string | null>(null);
  useEffect(() => {
    void ed.persistence.patterns.list().then(setItems);
  }, [ed]);
  const remove = async (id: string) => {
    await ed.persistence.patterns.remove(id);
    setItems((list) => list?.filter((i) => i.id !== id) ?? null);
    setConfirming(null);
    ed.toast("toasts.deleted");
  };
  return (
    <Modal title={t("dialogs.openTitle")} onClose={onClose} buttons={[{ label: t("dialogs.close") }]}>
      {!items && <p className={ui.hint}>{t("dialogs.loading")}</p>}
      {items && !items.length && <p className={ui.hint}>{t("dialogs.noPatterns")}</p>}
      {items?.map((it) =>
        confirming === it.id ? (
          <div key={it.id} className={ui.warn} role="alertdialog" aria-label={t("dialogs.deleteSavedTitle", { name: it.name })} data-testid="confirm-delete">
            <p style={{ margin: "0 0 8px" }}>{t.rich("dialogs.deleteSavedBody", { name: it.name, b: (c) => <b>{c}</b> })}</p>
            <div className={ui.row}>
              <button type="button" className={cx(ui.btn, ui.sm)} autoFocus onClick={() => setConfirming(null)}>{t("dialogs.cancel")}</button>
              <button type="button" className={cx(ui.btn, ui.sm, ui.primary)} onClick={() => void remove(it.id)}>{t("dialogs.deleteSaved")}</button>
            </div>
          </div>
        ) : (
        <div key={it.id} className={ui.row} style={{ flexWrap: "nowrap" }}>
          <button type="button" className={ui.option} onClick={() => { onClose(); run("file.openSaved", it.id); }}>
            <span className={ui.swatch} style={{ background: "#F7F4EC", display: "grid", placeItems: "center", fontSize: 12 }}>✕</span>
            <span style={{ minWidth: 0 }}>
              <b>{it.name}</b>
              <span className={ui.hint} style={{ display: "block" }}>
                {it.designer ? `${it.designer} · ` : ""}
                {`${it.w}×${it.h} · ${new Date(it.updatedAt).toLocaleString()}`}
                {t("dialogs.thisBrowser")}
              </span>
            </span>
          </button>
          <button type="button" className={ui.iconbtn} aria-label={t("dialogs.deleteSavedTitle", { name: it.name })} title={t("dialogs.deleteSavedTitle", { name: it.name })} onClick={() => setConfirming(it.id)}>🗑</button>
        </div>
        ),
      )}
    </Modal>
  );
}

/** Automatic snapshots of the open pattern (SPEC §15.7). */
export function VersionsDialog({ onClose }: { onClose: () => void }) {
  const t = useTranslations();
  const run = useCommand();
  const ed = useEditor();
  const [snaps, setSnaps] = useState<SnapshotSummary[] | null>(null);
  useEffect(() => {
    void ed.snapshots.list().then(setSnaps);
  }, [ed]);
  return (
    <Modal title={t("dialogs.versionsTitle")} onClose={onClose} buttons={[{ label: t("dialogs.close") }]}>
      <p className={ui.hint}>{t("dialogs.versionsHint")}</p>
      {!snaps && <p className={ui.hint}>{t("dialogs.loading")}</p>}
      {snaps && !snaps.length && <p className={ui.hint}>{t("dialogs.noHistory")}</p>}
      {snaps?.map((sn) => (
        <div key={sn.time} className={ui.row} style={{ flexWrap: "nowrap", padding: "4px 0" }}>
          {sn.thumb && <span style={{ width: 48, height: 48, flex: "none", background: `center / contain no-repeat url(${sn.thumb})`, border: "1px solid var(--line2)", borderRadius: 4, imageRendering: "pixelated" }} />}
          <span className={ui.hint} style={{ flex: 1 }}>
            {t("snapshots.row", { time: new Date(sn.time).toLocaleString(), reason: t(`snapshots.reason.${sn.reason}`), w: sn.w, h: sn.h })}
          </span>
          <button type="button" className={cx(ui.btn, ui.sm)} onClick={() => { onClose(); run("snapshot.restore", sn.time); }}>{t("dialogs.restore")}</button>
        </div>
      ))}
    </Modal>
  );
}
