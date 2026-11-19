"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { buildPalette } from "@/core/pattern/palette";
import type { CheckSuite, Marks } from "@/core/readerCheck/types";
import { renderChartImage } from "@/render/exportChart";
import { defaultCanvasTheme } from "@/render/theme";
import { cx, ui } from "../common/widgets";
import s from "./check.module.css";

/** Pixels per cell the chart is drawn at; shown scaled. */
const CELL = 18;
const ZOOMS = [0.5, 0.75, 1, 1.5, 2, 3];

/**
 * The test chart as this app shows it — to look at, not to edit (SPEC §15.51). Each sample's box (its number and
 * its stitches) can be picked; the one picked is ringed and brought into view, marked ones tinted.
 */
export function CheckChart({ suite, marks, selected, onSelect, lang }: { suite: CheckSuite; marks: Marks; selected: string | null; onSelect: (id: string) => void; lang: "uk" | "en" }) {
  const t = useTranslations("readerCheck");
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  /** null: as wide as the box. */
  const [zoom, setZoom] = useState<number | null>(null);
  const [fit, setFit] = useState(1);
  const p = suite.pattern, W = p.w * CELL, H = p.h * CELL;
  const k = zoom ?? fit;

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    // sharp on high-density screens
    const img = renderChartImage(p, buildPalette(p), "both", defaultCanvasTheme, { heading: "", key: [] }, Math.round(CELL * Math.min(2, window.devicePixelRatio || 1)));
    c.width = img.width;
    c.height = img.height;
    c.getContext("2d")!.drawImage(img, 0, 0);
  }, [p]);

  useLayoutEffect(() => {
    const el = box.current!;
    const measure = () => setFit(Math.min(2, (el.clientWidth - 2) / W));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [W]);

  // the picked box in view (picked in the list)
  useEffect(() => {
    const el = box.current, a = suite.items.find((i) => i.id === selected)?.area;
    if (!el || !a) return;
    const x = a.x * CELL * k, y = a.y * CELL * k, w = a.w * CELL * k, h = a.h * CELL * k;
    const left = x < el.scrollLeft || x + w > el.scrollLeft + el.clientWidth ? x - (el.clientWidth - w) / 2 : el.scrollLeft;
    const top = y < el.scrollTop || y + h > el.scrollTop + el.clientHeight ? y - (el.clientHeight - h) / 2 : el.scrollTop;
    if (left !== el.scrollLeft || top !== el.scrollTop) el.scrollTo({ left, top, behavior: "smooth" });
  }, [selected, suite, k]);

  const step = (d: number) => {
    const i = ZOOMS.findIndex((z) => z >= k - 0.001);
    const at = d > 0 ? ZOOMS.find((z) => z > k + 0.001) : [...ZOOMS].reverse().find((z) => z < k - 0.001);
    setZoom(at ?? ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, i + d))]!);
  };
  const pct = (v: number, of: number) => `${(v / of) * 100}%`;

  return (
    <div className={s.chartPane}>
      <div className={s.chartTools}>
        <span className={s.chartTitle}>{t("chart")}</span>
        <span className={s.chartNote}>{t(`kinds.${suite.kind}.numbers`)}</span>
        <span className={s.grow} />
        <button type="button" className={cx(ui.btn, ui.sm)} onClick={() => step(-1)} aria-label={t("zoomOut")} title={t("zoomOut")}>−</button>
        <button type="button" className={cx(ui.btn, ui.sm)} onClick={() => step(1)} aria-label={t("zoomIn")} title={t("zoomIn")}>+</button>
        <button type="button" className={cx(ui.btn, ui.sm, zoom === null && s.on)} onClick={() => setZoom(null)}>{t("fit")}</button>
      </div>
      <div ref={box} className={s.chartBox} data-testid="check-chart">
        <div className={s.chartInner} style={{ width: W * k, height: H * k }}>
          <canvas ref={canvas} className={s.canvas} />
          {suite.items.map((i, n) => i.area && (
            <button
              key={i.id}
              type="button"
              className={cx(s.area, marks[i.id]?.v === "ok" && s.areaOk, marks[i.id]?.v === "issue" && s.areaBad, selected === i.id && s.areaOn)}
              style={{ left: pct(i.area.x, p.w), top: pct(i.area.y, p.h), width: pct(i.area.w, p.w), height: pct(i.area.h, p.h) }}
              aria-label={`${n + 1}. ${i.what[lang]}`}
              aria-pressed={selected === i.id}
              data-testid={`check-area-${n + 1}`}
              onClick={() => onSelect(i.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
