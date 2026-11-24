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

/** Where the PDF was left: kept by the dialog (`onLeave`, `kept`), so the Chart tab and back finds it there. */
export interface PdfPlace {
  page: number;
  zoom: number;
  left: number;
  top: number;
}

/** A key row (or a place in the chart) marked on its page, in PDF points. */
function markOf(focus: SampleBox, row: boolean, size: { w: number }) {
  const left = Math.max(0, focus.x - focus.h * 0.6);
  return row ? { x: left, y: focus.y - focus.h * 0.35, w: size.w - left - 18, h: focus.h * 1.7 } : { x: focus.x - 3, y: focus.y - 3, w: focus.w + 6, h: focus.h + 6 };
}

/**
 * A PDF to read from beside the key being set up (SPEC §15.48): page by page, zoomed to the width or closer. It opens
 * where it was left (`kept`), else at `focus` — its page, zoomed in, scrolled to it — else on page `start`. After that
 * it stays where the user puts it: another row picked doesn't move it; `focus`, the row being set up, is marked when
 * it's on the page shown (a key row: the band across the page).
 */
export function PdfViewer({ file, sizes, start, focus, row, kept, onLeave }: {
  file: File; sizes: readonly { w: number; h: number }[]; start: number; focus: SampleBox | null; row: boolean;
  kept: PdfPlace | null; onLeave: (where: PdfPlace) => void;
}) {
  const t = useTranslations("pdfChart");
  // where it opens: scrolled there as it opens
  const opening = useRef<{ kept: PdfPlace } | { focus: SampleBox; row: boolean } | null>(kept ? { kept } : focus ? { focus, row } : null);
  const [page, setPage] = useState(kept?.page ?? (focus ? focus.page : start));
  const [zoom, setZoom] = useState(kept?.zoom ?? (focus ? 2 : 1));
  const [urls, setUrls] = useState<Record<number, string>>({});
  const [failed, setFailed] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const made = useRef<string[]>([]);

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

  const size = sizes[page] ?? { w: 1, h: 1 };
  const mark = focus && focus.page === page ? markOf(focus, row, size) : null;
  // as it opens (the page has its size before it's drawn): scrolled to where it was left, or so the place looked at is
  // in the middle
  useLayoutEffect(() => {
    const el = scroller.current, o = opening.current;
    if (!el || !o) return;
    opening.current = null;
    // (not `return el.scrollTo(…)`: browsers now return a promise from it, which React takes for a clean-up)
    if ("kept" in o) return void el.scrollTo({ left: o.kept.left, top: o.kept.top });
    const m = markOf(o.focus, o.row, size), k = el.clientWidth * zoom / size.w;
    // a key row from its start, with what's left of it in view (its symbol, a line's sample); a place in the chart, centred
    const left = o.row ? m.x * k - el.clientWidth * 0.25 : (o.focus.x + o.focus.w / 2) * k - el.clientWidth / 2;
    el.scrollTo({ left, top: (m.y + m.h / 2) * k - el.clientHeight / 2 });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, as it opens
  }, []);
  // where it is, handed over when it closes: for when it's shown again
  const where = useRef<PdfPlace | null>(kept);
  const keep = () => {
    const el = scroller.current;
    if (el) where.current = { page, zoom, left: el.scrollLeft, top: el.scrollTop };
  };
  useEffect(keep);
  useEffect(() => () => void (where.current && onLeave(where.current)), [onLeave]);

  const pages = sizes.length;
  const step = (d: number) => setZoom((z) => ZOOMS[Math.min(ZOOMS.length - 1, Math.max(0, ZOOMS.indexOf(z) + d))] ?? 1);
  return (
    <div className={s.viewer} data-testid="pdf-viewer">
      <div className={s.bar}>
        <button type="button" className={ui.pager} aria-label={t("pagePrev")} title={t("pagePrev")} disabled={page === 0} onClick={() => setPage(page - 1)}>‹</button>
        <select className={ui.input} aria-label={t("page")} value={page} onChange={(e) => setPage(Number(e.target.value))} data-testid="pdf-viewer-page">
          {sizes.map((_, i) => <option key={i} value={i}>{t("pageOf", { page: i + 1, pages })}</option>)}
        </select>
        <button type="button" className={ui.pager} aria-label={t("pageNext")} title={t("pageNext")} disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>›</button>
        <span className={s.spacer} />
        <button type="button" className={cx(ui.btn, ui.sm)} aria-label={t("zoomOut")} title={t("zoomOut")} disabled={zoom === ZOOMS[0]} onClick={() => step(-1)}>−</button>
        <button type="button" className={cx(ui.btn, ui.sm, s.fit)} title={t("zoomFit")} onClick={() => setZoom(1)} data-testid="pdf-viewer-zoom">{Math.round(zoom * 100)}%</button>
        <button type="button" className={cx(ui.btn, ui.sm)} aria-label={t("zoomIn")} title={t("zoomIn")} disabled={zoom === ZOOMS[ZOOMS.length - 1]} onClick={() => step(1)}>+</button>
      </div>
      <div className={s.scroller} ref={scroller} onScroll={keep}>
        <div className={s.sheet} style={{ width: `${zoom * 100}%`, aspectRatio: `${size.w} / ${size.h}` }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- a page drawn here, as an object URL */}
          {urls[page] ? <img src={urls[page]} alt={t("pageOf", { page: page + 1, pages })} draggable={false} /> : failed ? <p className={ui.hint}>{t("pageFailed")}</p> : <span className={s.loading} />}
          {mark && <span className={s.mark} data-testid="pdf-viewer-mark" style={{ left: `${(mark.x / size.w) * 100}%`, top: `${(mark.y / size.h) * 100}%`, width: `${(mark.w / size.w) * 100}%`, height: `${(mark.h / size.h) * 100}%` }} />}
        </div>
      </div>
    </div>
  );
}
