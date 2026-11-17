"use client";

import { Section } from "./Section";
import { useTranslations } from "next-intl";
import { cx, ui } from "../common/widgets";
import { useCommand, useEditorState } from "../hooks/editor";
import s from "./side.module.css";

const COUNTS = [["11", "ct11"], ["14", "ct14"], ["16", "ct16"], ["18", "ct18"], ["20", "ct20"], ["24", "ct24"], ["31", "ct31"]] as const;
/** No longer offered, but older patterns may still use them (SPEC §3.1). */
const LEGACY_COUNTS = [["14.01", "ct28o2"], ["16.01", "ct32o2"]] as const;

export function FabricPanel() {
  const t = useTranslations("fabric");
  const run = useCommand();
  useEditorState((st) => st.docRevision);
  const p = useEditorState((st) => st.doc);
  const ct = Math.floor(p.count), wi = p.w / ct, hi = p.h / ct;
  const b = (chunks: React.ReactNode) => <b>{chunks}</b>;
  const grid = p.grid;
  return (
    <Section id="fabric" title={t("heading")}>
      <div className={s.group}>
        <h4 className={s.groupTitle}>{t("fabricGroup")}</h4>
        <label className={s.prow}>
          <span className={s.prowLabel}>{t("count")}</span>
          <select className={ui.input} value={String(p.count)} onChange={(e) => run("pattern.setFabric", { count: Number(e.target.value) })}>
            {[...COUNTS, ...LEGACY_COUNTS.filter(([v]) => Number(v) === p.count)].map(([v, k]) => <option key={v} value={v}>{t(k)}</option>)}
          </select>
        </label>
        <label className={s.prow}>
          <span className={s.prowLabel}>{t("colour")}</span>
          <input type="color" className={s.colourSwatch} value={p.fabric} onChange={(e) => run("pattern.setFabric", { fabric: e.target.value })} />
        </label>
        <div className={s.prowNote}>
          {t.rich("finished", { wi: wi.toFixed(1), hi: hi.toFixed(1), wc: (wi * 2.54).toFixed(1), hc: (hi * 2.54).toFixed(1), b })}
          <br />
          {t.rich("cut", { wi: (wi + 6).toFixed(0), hi: (hi + 6).toFixed(0), b })}
        </div>
      </div>
      <div className={s.group}>
        <h4 className={s.groupTitle}>{t("gridSize")}</h4>
        <div className={s.prow}>{t.rich("grid", { w: p.w, h: p.h, b })}</div>
        {/* everything that changes the size lives here (SPEC §15.32) */}
        <div className={s.buttons} role="group" aria-label={t("gridSize")}>
          <button type="button" className={cx(ui.btn, ui.sm)} onClick={() => run("pattern.requestResize")}>{t("resize")}</button>
          <button type="button" className={cx(ui.btn, ui.sm)} onClick={() => run("transform.requestExtend")}>{t("extend")}</button>
          <button type="button" className={cx(ui.btn, ui.sm)} onClick={() => run("transform.crop")}>{t("crop")}</button>
        </div>
      </div>
      <div className={s.group}>
        <h4 className={s.groupTitle}>{t("numbering")}</h4>
        <label className={s.prow}>
          <span className={s.prowLabel}>{t("firstColumn")}</span>
          <input className={ui.input} type="number" value={grid.x0} disabled={grid.fromCentre} onChange={(e) => run("pattern.setGrid", { ...grid, x0: Number(e.target.value) || 0 })} />
        </label>
        <label className={s.prow}>
          <span className={s.prowLabel}>{t("firstRow")}</span>
          <input className={ui.input} type="number" value={grid.y0} disabled={grid.fromCentre} onChange={(e) => run("pattern.setGrid", { ...grid, y0: Number(e.target.value) || 0 })} />
        </label>
        <label className={s.prow}>
          <span className={s.prowLabel}>{t("labelEvery")}</span>
          <select className={ui.input} style={{ maxWidth: 96 }} value={grid.label} onChange={(e) => run("pattern.setGrid", { ...grid, label: Number(e.target.value) })}>
            <option value={10}>10</option>
            <option value={5}>5</option>
          </select>
        </label>
        <label className={s.switch}>
          <input type="checkbox" role="switch" checked={grid.fromCentre} onChange={(e) => run("pattern.setGrid", { ...grid, fromCentre: e.target.checked })} />
          {t("fromCentre")}
        </label>
      </div>
    </Section>
  );
}
