"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { SampleBox } from "@/core/formats/pdfChart/read";
import { renderPdfPage } from "@/platform/pdf";
import { cx, ui } from "../common/widgets";
import s from "./pdfViewer.module.css";

/** Long side of a drawn page: sharp enough to read a key's small print zoomed in. */
const SIDE = 2600;
const ZOOMS = [1, 1.5, 2, 3, 4];

/**
 * A PDF to read from beside the key being set up (SPEC §15.48): page by page, zoomed to the width or closer. `focus`:
 * the place to look — its page shown, zoomed in, scrolled to it and marked (a key row: the band across the page);
 * without one, page `start`.
 */
export function PdfViewer({ file, sizes, start, focus, row }: { file: File; sizes: readonly { w: number; h: number }[]; start: number; focus: SampleBox | null; row: boolean }) {
  const t = useTranslations("pdfChart");
  const [page, setPage] = useState(focus ? focus.page : start);
  const [zoom, setZoom] = useState(focus ? 2 : 1);
  const [urls, setUrls] = useState<Record<number, string>>({});
  const [failed, setFailed] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const made = useRef<string[]>([]);

  // a new place to look: its page, closer
  const [shownFocus, setShownFocus] = useState(focus);
  if (focus !== shownFocus) {
    setShownFocus(focus);
    if (focus) {
      setPage(focus.page);
      setZoom((z) => Math.max(z, 2));
    }
  }

  useEffect(() => {
    if (urls[page]) return;
    let alive = true;
    renderPdfPage(file, page + 1, SIDE)
      .then((r) => {
        const url = URL.createObjectURL(r.blob);
        made.current.push(url);
        if (alive) setUrls((u) => ({ ...u, [page]: url }));
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [file, page, urls]);
  useEffect(() => () => made.current.forEach((u) => URL.revokeObjectURL(u)), []);

  // scrolled so the place looked at is in the middle
  const size = sizes[page] ?? { w: 1, h: 1 };
  const markLeft = focus ? Math.max(0, focus.x - focus.h * 0.6) : 0;
  const mark = focus && focus.page === page ? (row ? { x: markLeft, y: focus.y - focus.h * 0.35, w: size.w - markLeft - 18, h: focus.h * 1.7 } : { x: focus.x - 3, y: focus.y - 3, w: focus.w + 6, h: focus.h + 6 }) : null;
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || !mark || !urls[page]) return;
    const k = el.clientWidth * zoom / size.w;
    // a key row from its start, with what's left of it in view (its symbol, a line's sample); a place in the chart, centred
    const left = row ? mark.x * k - el.clientWidth * 0.25 : (focus!.x + focus!.w / 2) * k - el.clientWidth / 2;
    el.scrollTo({ left, top: (mark.y + mark.h / 2) * k - el.clientHeight / 2 });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- when the place, page or zoom changes
  }, [focus, page, zoom, urls[page]]);

  const pages = sizes.length;
  const step = (d: number) => setZoom((z) => ZOOMS[Math.min(ZOOMS.length - 1, Math.max(0, ZOOMS.indexOf(z) + d))] ?? 1);
  return (
    <div className={s.viewer} data-testid="pdf-viewer">
      <div className={s.bar}>
        <button type="button" className={cx(ui.btn, ui.sm)} aria-label={t("pagePrev")} title={t("pagePrev")} disabled={page === 0} onClick={() => setPage(page - 1)}>‹</button>
        <select className={ui.input} aria-label={t("page")} value={page} onChange={(e) => setPage(Number(e.target.value))} data-testid="pdf-viewer-page">
          {sizes.map((_, i) => <option key={i} value={i}>{t("pageOf", { page: i + 1, pages })}</option>)}
        </select>
        <button type="button" className={cx(ui.btn, ui.sm)} aria-label={t("pageNext")} title={t("pageNext")} disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>›</button>
        <span className={s.spacer} />
        <button type="button" className={cx(ui.btn, ui.sm)} aria-label={t("zoomOut")} title={t("zoomOut")} disabled={zoom === ZOOMS[0]} onClick={() => step(-1)}>−</button>
        <button type="button" className={cx(ui.btn, ui.sm, s.fit)} title={t("zoomFit")} onClick={() => setZoom(1)} data-testid="pdf-viewer-zoom">{Math.round(zoom * 100)}%</button>
        <button type="button" className={cx(ui.btn, ui.sm)} aria-label={t("zoomIn")} title={t("zoomIn")} disabled={zoom === ZOOMS[ZOOMS.length - 1]} onClick={() => step(1)}>+</button>
      </div>
      <div className={s.scroller} ref={scroller}>
        <div className={s.sheet} style={{ width: `${zoom * 100}%`, aspectRatio: `${size.w} / ${size.h}` }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- a page drawn here, as an object URL */}
          {urls[page] ? <img src={urls[page]} alt={t("pageOf", { page: page + 1, pages })} draggable={false} /> : failed ? <p className={ui.hint}>{t("pageFailed")}</p> : <span className={s.loading} />}
          {mark && <span className={s.mark} data-testid="pdf-viewer-mark" style={{ left: `${(mark.x / size.w) * 100}%`, top: `${(mark.y / size.h) * 100}%`, width: `${(mark.w / size.w) * 100}%`, height: `${(mark.h / size.h) * 100}%` }} />}
        </div>
      </div>
    </div>
  );
}
