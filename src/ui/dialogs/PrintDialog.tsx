"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { chartTitle, hasLines, type ChartPlan } from "@/core/formats/pdf/chartPdf";
import {
  applyPreset, CELL_SIZES, chart, CROSSES, hasContent, LINES, MAX_CHARTS, OVERLAPS, presetOf, PRESET_IDS, stitchesAcross,
  type CellSize, type ChartSpec, type PrintOptions,
} from "@/core/formats/pdf/printOptions";
import { chartPdfPage, chartPdfPlan, exportChartPdf } from "@/editor/actions/importExport";
import { loadPrintOptions } from "@/editor/printOptions";
import { renderPdfPage } from "@/platform/pdf";
import { DeleteButton, Modal, cx, ui } from "../common/widgets";
import { useEditor, useEditorState } from "../hooks/editor";
import s from "./print.module.css";

/** Long side of the preview page, in pixels: the symbols readable, quick to draw. */
const SIDE = 1500;
/** The pages are planned and the page drawn again this long after the last change. */
const WAIT = 300;

/**
 * Print (SPEC §15.10c): a list of charts, each with its own colouring, size and keys; the pages around them; the
 * paper — and beside it the real pages. The file is planned (counted, not drawn) after each change and only the page
 * looked at is made, so even a 1000 × 1000 chart previews quickly. Download makes every page, with progress and Stop.
 */
export function PrintDialog({ onClose }: { onClose: () => void }) {
  const t = useTranslations("print");
  const tAll = useTranslations();
  const ed = useEditor();
  const doc = useEditorState((st) => st.doc);
  const instructions = !!doc.meta.instructions?.trim(), lined = useMemo(() => hasLines(doc), [doc]);
  const [o, setO] = useState<PrintOptions>(loadPrintOptions);
  const [open, setOpen] = useState<number>(0);
  const preset = presetOf(o), ok = hasContent(o, instructions);
  const set = (patch: Partial<PrintOptions>) => setO((cur) => ({ ...cur, ...patch }));
  const setChart = (i: number, patch: Partial<ChartSpec>) => setO((cur) => ({ ...cur, charts: cur.charts.map((c, j) => (j === i ? { ...c, ...patch } : c)) }));
  const charts = (f: (list: ChartSpec[]) => ChartSpec[]) => setO((cur) => ({ ...cur, charts: f([...cur.charts]) }));
  const move = (i: number, d: number) => {
    charts((list) => {
      const [c] = list.splice(i, 1);
      list.splice(i + d, 0, c!);
      return list;
    });
    setOpen(i + d);
  };

  // the plan (page count, each chart's pages), a moment after the last change
  const [plan, setPlan] = useState<ChartPlan | null>(null);
  const [page, setPage] = useState(1);
  useEffect(() => {
    if (!ok) return;
    const timer = setTimeout(() => {
      const next = chartPdfPlan(ed, o);
      setPlan(next);
      setPage((n) => Math.min(n, next.total));
    }, WAIT);
    return () => clearTimeout(timer);
  }, [ed, o, ok]);
  const total = ok ? (plan?.total ?? 0) : 0;
  /** The first page of each chart in the file (the charts come after the cover, instructions and materials). */
  const firstPage = (i: number) => {
    if (!plan) return 1;
    const inCharts = plan.charts.reduce((n, c) => n + c.chartPages + c.keyPages, 0);
    return plan.total - inCharts + plan.charts.slice(0, i).reduce((n, c) => n + c.chartPages + c.keyPages, 0) + 1;
  };

  // the page looked at, made on its own and drawn; a newer one makes an older result count for nothing
  const [image, setImage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const made = useRef(0);
  useEffect(() => {
    if (!plan || !ok) return;
    const n = ++made.current;
    void (async () => {
      try {
        setBusy(true);
        const bytes = await chartPdfPage(ed, o, page);
        const r = await renderPdfPage(new Blob([bytes as BlobPart], { type: "application/pdf" }), 1, SIDE);
        if (n !== made.current) return;
        setImage(URL.createObjectURL(r.blob));
        setFailed(false);
      } catch (e) {
        console.error(e);
        if (n === made.current) setFailed(true);
      } finally {
        if (n === made.current) setBusy(false);
      }
    })();
    // the settings are in the plan: drawn again when it's made again
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, page]);
  // the page shown before is let go once the next is in
  const shown = useRef<string | null>(null);
  useEffect(() => {
    const old = shown.current;
    shown.current = image;
    if (old && old !== image) URL.revokeObjectURL(old);
  }, [image]);
  useEffect(() => () => void (shown.current && URL.revokeObjectURL(shown.current)), []);

  // making the file: page by page, Stop cancels
  const [building, setBuilding] = useState<{ done: number; total: number } | null>(null);
  const stop = useRef<AbortController | null>(null);
  useEffect(() => () => stop.current?.abort(), []);
  const download = async () => {
    const controller = new AbortController();
    stop.current = controller;
    setBuilding({ done: 0, total });
    const result = await exportChartPdf(ed, o, { signal: controller.signal, progress: (done, all) => setBuilding({ done, total: all }) });
    stop.current = null;
    setBuilding(null);
    if (result === "done") onClose();
  };

  const go = (d: number) => setPage((p) => Math.min(Math.max(1, p + d), total || 1));
  const cellLabel = (c: CellSize) => `${t(`cellSize.${String(c).replace(".", "_")}`)} — ${t("across", { n: Math.min(doc.w, stitchesAcross(o, c)) })}`;

  return (
    <Modal
      title={t("title")}
      help="export#print"
      full
      onClose={() => {
        stop.current?.abort();
        onClose();
      }}
      buttons={[{ label: t("cancel") }, { label: t("download"), primary: true, disabled: !ok || !!building, onClick: () => (void download(), false as const) }]}
    >
      <div className={s.layout} data-no-shortcuts>
        <div className={s.settings}>
          <div className={s.presets}>
            <div className={ui.seg} role="group" aria-label={t("title")} data-testid="print-presets">
              {PRESET_IDS.map((id) => (
                <button key={id} type="button" className={cx(preset === id && ui.on)} aria-pressed={preset === id} onClick={() => (setO(applyPreset(o, id)), setOpen(0))}>
                  {t(`preset.${id}`)}
                </button>
              ))}
            </div>
          </div>

          <section className={s.group}>
            <div className={s.groupHead}>
              <h3>{t("charts")}</h3>
              <button type="button" className={cx(ui.btn, ui.sm)} disabled={o.charts.length >= MAX_CHARTS} onClick={() => {
                charts((list) => [...list, chart("contrast", lined ? "contrast" : "hidden")]);
                setOpen(o.charts.length);
              }}>
                + {t("addChart")}
              </button>
            </div>
            <ol className={s.charts} data-testid="print-charts">
              {o.charts.map((c, i) => {
                const isOpen = open === i, pages = plan?.charts[i];
                return (
                  <li key={i} className={cx(s.chart, isOpen && s.open)}>
                    <div className={s.chartHead}>
                      <button type="button" className={s.chartTitle} aria-expanded={isOpen} onClick={() => {
                        setOpen(isOpen ? -1 : i);
                        if (!isOpen) setPage(firstPage(i));
                      }}>
                        <span className={s.num}>{i + 1}</span>
                        <span className={s.name}>{chartTitle(c, tAll, lined)}</span>
                        {pages && <span className={s.pagesNote}>{t("chartPages", { n: pages.chartPages + pages.keyPages })}</span>}
                      </button>
                      <span className={s.tools}>
                        <button type="button" className={ui.iconbtn} title={t("duplicate")} aria-label={t("duplicate")} disabled={o.charts.length >= MAX_CHARTS} onClick={() => (charts((list) => (list.splice(i + 1, 0, { ...c }), list)), setOpen(i + 1))}>⧉</button>
                        <button type="button" className={ui.iconbtn} title={t("moveUp")} aria-label={t("moveUp")} disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                        <button type="button" className={ui.iconbtn} title={t("moveDown")} aria-label={t("moveDown")} disabled={i === o.charts.length - 1} onClick={() => move(i, 1)}>↓</button>
                        <DeleteButton label={t("remove")} size={15} onClick={() => (charts((list) => list.filter((_, j) => j !== i)), setOpen(-1))} />
                      </span>
                    </div>
                    {isOpen && (
                      <div className={s.chartBody}>
                        <Choice label={t("crossesLabel")} options={CROSSES} value={c.crosses} text={(v) => t(`crosses.${v}`)} hint={(v) => t(`crossesHint.${v}`)} onChange={(crosses) => setChart(i, { crosses })} />
                        {lined && <Choice label={t("linesLabel")} options={LINES} value={c.lines} text={(v) => t(`lines.${v}`)} hint={(v) => t(`linesHint.${v}`)} onChange={(lines) => setChart(i, { lines })} />}
                        <label className={ui.field}>
                          {t("cell")}
                          <select value={String(c.cell)} onChange={(e) => setChart(i, { cell: (e.target.value === "auto" ? "auto" : Number(e.target.value)) as CellSize })} data-testid="print-cell">
                            {CELL_SIZES.map((v) => <option key={String(v)} value={String(v)}>{cellLabel(v)}</option>)}
                          </select>
                        </label>
                        <div className={s.inline}>
                          <span>{t("overlap")}</span>
                          <div className={ui.seg} role="group" aria-label={t("overlap")}>
                            {OVERLAPS.map((n) => (
                              <button key={n} type="button" className={cx(c.overlap === n && ui.on)} aria-pressed={c.overlap === n} onClick={() => setChart(i, { overlap: n })}>{n}</button>
                            ))}
                          </div>
                        </div>
                        <label className={ui.chk}>
                          <input type="checkbox" checked={c.pageKey} onChange={(e) => setChart(i, { pageKey: e.target.checked })} />
                          {t("pageKey")}
                        </label>
                        <label className={ui.chk}>
                          <input type="checkbox" checked={c.key} onChange={(e) => setChart(i, { key: e.target.checked })} />
                          {t("chartKey")}
                        </label>
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
            {!ok && <p className={ui.warn}>{t("nothing")}</p>}
          </section>

          <section className={s.group}>
            <h3>{t("also")}</h3>
            {(["cover", "contents", "instructions", "materials"] as const).map((k) => {
              const off = k === "instructions" && !instructions;
              return (
                <label key={k} className={cx(ui.chk, off && s.off)}>
                  <input type="checkbox" checked={o[k] && !off} disabled={off} onChange={(e) => set({ [k]: e.target.checked })} />
                  <span className={s.stack}>
                    {t(`section.${k}`)}
                    {off && <small className={s.note}>{t("noInstructions")}</small>}
                  </span>
                </label>
              );
            })}
          </section>

          <section className={s.group}>
            <h3>{t("paper")}</h3>
            <div className={s.pair}>
              <div className={ui.seg} role="group" aria-label={t("paper")}>
                {(["a4", "letter"] as const).map((p) => (
                  <button key={p} type="button" className={cx(o.paper === p && ui.on)} aria-pressed={o.paper === p} onClick={() => set({ paper: p })}>{t(p)}</button>
                ))}
              </div>
              <div className={ui.seg} role="group">
                {([false, true] as const).map((l) => (
                  <button key={String(l)} type="button" className={cx(o.landscape === l && ui.on)} aria-pressed={o.landscape === l} onClick={() => set({ landscape: l })}>{t(l ? "landscape" : "portrait")}</button>
                ))}
              </div>
            </div>
          </section>
        </div>

        <div className={s.preview}>
          <div className={s.bar}>
            <strong className={s.count} data-testid="print-pages">{total ? t("pages", { n: total }) : " "}</strong>
            <div className={s.nav}>
              <button type="button" className={ui.pager} aria-label={t("prev")} title={t("prev")} disabled={page <= 1} onClick={() => go(-1)}>‹</button>
              <span>{total ? t("pageOf", { n: page, total }) : ""}</span>
              <button type="button" className={ui.pager} aria-label={t("next")} title={t("next")} disabled={page >= total} onClick={() => go(1)}>›</button>
            </div>
          </div>
          <div className={s.sheet}>
            {/* a page drawn here as a blob URL: nothing for next/image to do */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {ok && image && <img src={image} alt={t("pageOf", { n: page, total })} className={cx(busy && s.stale)} data-testid="print-preview" />}
            {ok && !image && !failed && <span className={s.status}>{t("making")}</span>}
            {failed && <span className={s.status}>{t("failed")}</span>}
            {building && (
              <div className={s.building} role="status" data-testid="print-building">
                <strong>{t("building")}</strong>
                <div className={s.progress}><span style={{ width: `${building.total ? (100 * building.done) / building.total : 0}%` }} /></div>
                <span className={s.status}>{t("buildingPage", { done: building.done, total: building.total })}</span>
                <button type="button" className={ui.btn} onClick={() => stop.current?.abort()}>{t("stop")}</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

/** One setting of a chart: a label and a row of buttons, each with a hint. */
function Choice<T extends string>({ label, options, value, text, hint, onChange }: { label: string; options: readonly T[]; value: T; text: (v: T) => string; hint: (v: T) => string; onChange: (v: T) => void }) {
  return (
    <div className={s.choice}>
      <span>{label}</span>
      <div className={ui.seg} role="group" aria-label={label}>
        {options.map((v) => (
          <button key={v} type="button" className={cx(value === v && ui.on)} aria-pressed={value === v} title={hint(v)} onClick={() => onChange(v)}>{text(v)}</button>
        ))}
      </div>
    </div>
  );
}
