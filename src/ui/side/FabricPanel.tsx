"use client";

import { useTranslations } from "next-intl";
import { cx, ui } from "../common/widgets";
import { useCommand, useEditorState } from "../hooks/editor";
import s from "./side.module.css";

const COUNTS = [["11", "ct11"], ["14", "ct14"], ["16", "ct16"], ["18", "ct18"], ["14.01", "ct28o2"], ["16.01", "ct32o2"]] as const;

export function FabricPanel() {
  const t = useTranslations("fabric");
  const run = useCommand();
  useEditorState((st) => st.docRevision);
  const p = useEditorState((st) => st.doc);
  const ct = Math.floor(p.count), wi = p.w / ct, hi = p.h / ct;
  const b = (chunks: React.ReactNode) => <b>{chunks}</b>;
  const grid = p.grid;
  return (
    <details className={s.details}>
      <summary>{t("heading")}</summary>
      <div className={s.section}>
        <div className={ui.grid2}>
          <label className={ui.field}>
            {t("count")}
            <select value={String(p.count)} onChange={(e) => run("pattern.setFabric", { count: Number(e.target.value) })}>
              {COUNTS.map(([v, k]) => <option key={v} value={v}>{t(k)}</option>)}
            </select>
          </label>
          <label className={ui.field}>
            {t("colour")}
            <input type="color" value={p.fabric} style={{ height: 33, padding: 2 }} onChange={(e) => run("pattern.setFabric", { fabric: e.target.value })} />
          </label>
          <label className={ui.field}>
            {t("gridSize")}
            <button type="button" className={cx(ui.btn, ui.sm)} style={{ height: 33 }} onClick={() => run("pattern.requestResize")}>{t("resize")}</button>
          </label>
        </div>
        <div className={s.totals}>
          <span>{t.rich("grid", { w: p.w, h: p.h, b })}</span>
          <span>{t.rich("finished", { wi: wi.toFixed(1), hi: hi.toFixed(1), wc: (wi * 2.54).toFixed(1), hc: (hi * 2.54).toFixed(1), b })}</span>
          <span>{t.rich("cut", { wi: (wi + 6).toFixed(0), hi: (hi + 6).toFixed(0), b })}</span>
        </div>
        <h3 style={{ fontSize: 14, marginTop: 6 }}>{t("numbering")}</h3>
        <div className={ui.grid2}>
          <label className={ui.field}>
            {t("firstColumn")}
            <input type="number" value={grid.x0} disabled={grid.fromCentre} onChange={(e) => run("pattern.setGrid", { ...grid, x0: Number(e.target.value) || 0 })} />
          </label>
          <label className={ui.field}>
            {t("firstRow")}
            <input type="number" value={grid.y0} disabled={grid.fromCentre} onChange={(e) => run("pattern.setGrid", { ...grid, y0: Number(e.target.value) || 0 })} />
          </label>
          <label className={ui.field}>
            {t("labelEvery")}
            <select value={grid.label} onChange={(e) => run("pattern.setGrid", { ...grid, label: Number(e.target.value) })}>
              <option value={10}>10</option>
              <option value={5}>5</option>
            </select>
          </label>
          <label className={ui.chk} style={{ alignSelf: "end" }}>
            <input type="checkbox" checked={grid.fromCentre} onChange={(e) => run("pattern.setGrid", { ...grid, fromCentre: e.target.checked })} />
            {t("fromCentre")}
          </label>
        </div>
      </div>
    </details>
  );
}
