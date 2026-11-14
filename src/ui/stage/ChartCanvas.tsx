"use client";

import { useEffect, useRef } from "react";
import { ChartRenderer, type ChartScene } from "@/render/ChartRenderer";
import type { Editor } from "@/editor/createEditor";
import type { ToolPointer } from "@/editor/tools/types";
import { useTranslations } from "next-intl";
import { useEditor } from "../hooks/editor";
import s from "./stage.module.css";

function scene(ed: Editor): ChartScene {
  const st = ed.state;
  return {
    pattern: st.doc,
    palette: st.palette,
    view: st.view,
    viewport: st.viewport,
    mirror: st.mirror,
    hover: st.overlay.hover,
    preview: st.overlay.preview,
    partialPreview: st.overlay.partialPreview,
    knotPreview: st.overlay.knotPreview,
    chain: st.overlay.chain,
    hoverPoint: st.overlay.hoverPoint,
    selection: st.selection,
    floating: st.floating && { pattern: st.floating.preview.pattern, palette: st.floating.preview.palette, at: st.floating.at },
    marquee: st.overlay.marquee,
    eraseHighlight: (st.momentaryTool ?? st.tool) === "eraser" ? st.overlay.eraseHighlight : null,
    finding: (() => {
      const f = st.checksOpen ? ed.checks.current() : undefined;
      return f?.cell !== undefined ? { cells: f.related ?? [f.cell] } : null;
    })(),
    flash: st.flash,
    underlay: st.underlay && st.underlay.visible && st.underlayImage ? { image: st.underlayImage, crop: st.underlay.crop, rect: st.underlay.rect, opacity: st.underlay.opacity, editing: !st.underlay.behind } : null,
  };
}

/** The chart: draws through ChartRenderer and turns pointer/wheel events into editor calls. */
export function ChartCanvas() {
  const ed = useEditor();
  const ref = useRef<HTMLCanvasElement>(null);
  const t = useTranslations("app");

  useEffect(() => {
    const canvas = ref.current!;
    const renderer = new ChartRenderer(canvas, ed.theme, () => scene(ed));
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const first = !ed.viewport.width;
      ed.viewport.setSize(r.width, r.height);
      renderer.resize(r.width, r.height, window.devicePixelRatio || 1);
      if (first) ed.viewport.fit();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();
    let lastTheme = ed.theme;
    const unsub = ed.store.subscribe(() => {
      if (ed.theme !== lastTheme) renderer.setTheme((lastTheme = ed.theme));
      canvas.style.cursor = ed.tools.cursor();
      renderer.request();
    });

    const pointer = (e: PointerEvent | MouseEvent): ToolPointer => {
      const r = canvas.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top;
      const grid = ed.viewport.toGrid(sx, sy);
      return { sx, sy, grid, cell: { x: Math.floor(grid.x), y: Math.floor(grid.y) }, button: e.button, shift: e.shiftKey, alt: e.altKey };
    };
    const down = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId);
      ed.tools.down(pointer(e));
      canvas.style.cursor = ed.tools.cursor();
    };
    const move = (e: PointerEvent) => ed.tools.move(pointer(e));
    const up = (e: PointerEvent) => {
      ed.tools.up(pointer(e));
      canvas.style.cursor = ed.tools.cursor();
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = canvas.getBoundingClientRect();
      ed.viewport.wheel(e, e.clientX - r.left, e.clientY - r.top);
    };
    const leave = () => ed.tools.leave();
    const dbl = () => ed.tools.cancel();
    const menu = (e: Event) => e.preventDefault();
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    canvas.addEventListener("pointerleave", leave);
    canvas.addEventListener("dblclick", dbl);
    canvas.addEventListener("contextmenu", menu);
    canvas.addEventListener("wheel", wheel, { passive: false });
    return () => {
      ro.disconnect();
      unsub();
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
      canvas.removeEventListener("pointerleave", leave);
      canvas.removeEventListener("dblclick", dbl);
      canvas.removeEventListener("contextmenu", menu);
      canvas.removeEventListener("wheel", wheel);
    };
  }, [ed]);

  return <canvas ref={ref} className={s.canvas} data-testid="chart" role="img" aria-label={t("chart")} />;
}
