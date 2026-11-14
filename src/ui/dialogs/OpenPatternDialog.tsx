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
  const [snaps, setSnaps] = useState<SnapshotSummary[]>([]);
  useEffect(() => {
    void ed.persistence.patterns.list().then(setItems);
    void ed.snapshots.list().then(setSnaps);
  }, [ed]);
  const remove = async (id: string) => {
    await ed.persistence.patterns.remove(id);
    setItems((list) => list?.filter((i) => i.id !== id) ?? null);
    ed.toast("toasts.deleted");
  };
  return (
    <Modal title={t("dialogs.openTitle")} onClose={onClose} buttons={[{ label: t("dialogs.close") }]}>
      {!items && <p className={ui.hint}>{t("dialogs.loading")}</p>}
      {items && !items.length && <p className={ui.hint}>{t("dialogs.noPatterns")}</p>}
      {items?.map((it) => (
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
          <button type="button" className={ui.iconbtn} aria-label={t("dialogs.delete")} onClick={() => remove(it.id)}>🗑</button>
        </div>
      ))}
      <details>
        <summary style={{ cursor: "pointer", fontWeight: 600, padding: "6px 0" }}>{t("dialogs.history")}</summary>
        {!snaps.length && <p className={ui.hint}>{t("dialogs.noHistory")}</p>}
        {snaps.map((sn) => (
          <div key={sn.time} className={ui.row} style={{ flexWrap: "nowrap", padding: "4px 0" }}>
            {sn.thumb && <span style={{ width: 48, height: 48, flex: "none", background: `center / contain no-repeat url(${sn.thumb})`, border: "1px solid var(--line2)", borderRadius: 4, imageRendering: "pixelated" }} />}
            <span className={ui.hint} style={{ flex: 1 }}>
              {t("snapshots.row", { time: new Date(sn.time).toLocaleString(), reason: t(`snapshots.reason.${sn.reason}`), w: sn.w, h: sn.h })}
            </span>
            <button type="button" className={cx(ui.btn, ui.sm)} onClick={() => { onClose(); run("snapshot.restore", sn.time); }}>{t("dialogs.restore")}</button>
          </div>
        ))}
      </details>
    </Modal>
  );
}
