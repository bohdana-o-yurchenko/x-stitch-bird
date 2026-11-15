"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { CUSTOM_EXAMPLES, CUSTOM_GRID, CUSTOM_MAX_SHAPES, coveredPath, decodeCustomSymbol, encodeCustomSymbol, isCut, validShape, type CustomShape, type Paint, type TriangleDir } from "@/core/symbols/customSymbol";
import { SymbolGlyph } from "../../common/SymbolGlyph";
import { cx, ui } from "../../common/widgets";
import s from "./keyEntry.module.css";

type Shape = "circle" | "rect" | "triangle" | "star" | "line1" | "line2" | "arrow";
const SHAPES: { id: Shape; icon: string }[] = [
  { id: "circle", icon: "sym:circle-o" }, { id: "rect", icon: "sym:square-o" }, { id: "triangle", icon: "sym:triangle-o" }, { id: "star", icon: "sym:star-o" },
  { id: "line1", icon: "draw:l16b6" }, { id: "line2", icon: "draw:L16b6" }, { id: "arrow", icon: "draw:a2aa2" },
];
const PAINTS: { id: Paint; icon: string }[] = [
  { id: "fill", icon: "sym:circle" }, { id: "outline", icon: "sym:circle-o" }, { id: "cut", icon: "draw:O00cc;!O3399" },
];
/** Which paints a shape can have: lines are solid or cut, an arrow is only solid. */
const allowed = (shape: Shape): Paint[] => (shape === "arrow" ? ["fill"] : shape.startsWith("line") ? ["fill", "cut"] : ["fill", "outline", "cut"]);
const DIRS: { id: TriangleDir; icon: string }[] = [{ id: "u", icon: "sym:triangle" }, { id: "r", icon: "sym:triangle-right" }, { id: "d", icon: "sym:triangle-down" }, { id: "l", icon: "sym:triangle-left" }];

// the drawing area: the symbol's 24-unit box at 12 px per unit, so grid point v sits at 24 + 20·v px
const SIZE = 288, PAD = 24, STEP = 20;

type Pt = { x: number; y: number };

/** A line goes horizontal, vertical or diagonal — whichever the drag is closest to — and stays on the grid. */
function straight(a: Pt, b: Pt): Pt {
  const dx = b.x - a.x, dy = b.y - a.y, ax = Math.abs(dx), ay = Math.abs(dy);
  if (ax >= 2 * ay) return { x: b.x, y: a.y };
  if (ay >= 2 * ax) return { x: a.x, y: b.y };
  const sx = dx < 0 ? -1 : 1, sy = dy < 0 ? -1 : 1;
  const m = Math.min(Math.max(ax, ay), sx > 0 ? CUSTOM_GRID - a.x : a.x, sy > 0 ? CUSTOM_GRID - a.y : a.y);
  return { x: a.x + sx * m, y: a.y + sy * m };
}

function shapeFrom(shape: Shape, paint: Paint, dir: TriangleDir, a: Pt, b: Pt): CustomShape {
  if (shape === "arrow") return { kind: "arrow", paint: "fill", x1: a.x, y1: a.y, x2: b.x, y2: b.y };
  if (shape.startsWith("line")) {
    const to = straight(a, b);
    return { kind: "line", paint: paint === "cut" ? "cut" : "fill", width: shape === "line2" ? 2 : 1, x1: a.x, y1: a.y, x2: to.x, y2: to.y };
  }
  const box = { x1: Math.min(a.x, b.x), y1: Math.min(a.y, b.y), x2: Math.max(a.x, b.x), y2: Math.max(a.y, b.y) };
  return shape === "triangle" ? { kind: "triangle", paint, dir, ...box } : { kind: shape as "circle" | "rect" | "star", paint, ...box };
}

/**
 * Draws a chart symbol from a few simple shapes (SPEC §2.5): pick a shape and how it is painted — filled, outline or
 * cut out (a negative that removes what lies under it) — and drag on the grid. The tool can only make what the symbol
 * format holds: at most `CUSTOM_MAX_SHAPES` circles, rectangles, triangles, stars, lines and arrows on a 12×12 grid,
 * so a drawing can never get too heavy for the file or too fussy to read at chart size.
 */
export function SymbolDrawer({ initial, onUse, onClose }: { initial: string; onUse: (sym: string) => void; onClose: () => void }) {
  const t = useTranslations("keyDialog");
  const [shapes, setShapes] = useState<CustomShape[]>(() => decodeCustomSymbol(initial) ?? []);
  const [shape, setShape] = useState<Shape>("circle");
  const [paint, setPaint] = useState<Paint>("fill");
  const [dir, setDir] = useState<TriangleDir>("u");
  const [drag, setDrag] = useState<{ from: Pt; to: Pt } | null>(null);
  const area = useRef<SVGSVGElement>(null);
  const full = shapes.length >= CUSTOM_MAX_SHAPES;

  useEffect(() => {
    // Esc closes only this dialog, not the key form under it
    const esc = (e: KeyboardEvent) => e.key === "Escape" && (e.stopPropagation(), onClose());
    window.addEventListener("keydown", esc, true);
    return () => window.removeEventListener("keydown", esc, true);
  }, [onClose]);

  const pickShape = (id: Shape) => {
    setShape(id);
    if (!allowed(id).includes(paint)) setPaint("fill");
  };
  const point = (e: React.PointerEvent): Pt => {
    const r = area.current!.getBoundingClientRect(), snap = (px: number) => Math.max(0, Math.min(CUSTOM_GRID, Math.round((px - PAD) / STEP)));
    return { x: snap(e.clientX - r.left), y: snap(e.clientY - r.top) };
  };
  const pending = drag ? shapeFrom(shape, paint, dir, drag.from, drag.to) : null;
  const shown = pending && validShape(pending) ? [...shapes, pending] : shapes;
  const sym = encodeCustomSymbol(shown), result = encodeCustomSymbol(shapes);
  const cuts = shown.filter(isCut);
  const lines = Array.from({ length: CUSTOM_GRID + 1 }, (_, i) => PAD + i * STEP);

  return (
    <div className={ui.backdrop} onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={cx(ui.modal, s.drawer)} role="dialog" aria-modal="true" aria-label={t("drawTitle")} data-no-shortcuts data-testid="symbol-drawer">
        <h2>{t("drawTitle")}</h2>
        <div className={ui.modalBody}>
          <p className={ui.hint}>{t("drawHint", { max: CUSTOM_MAX_SHAPES })}</p>
          <div className={s.drawControls}>
            <span className={s.label}>{t("drawShape")}</span>
            <div className={s.drawControlRow}>
              <div className={s.iconSeg} role="radiogroup" aria-label={t("drawShape")}>
                {SHAPES.map((o) => (
                  <button key={o.id} type="button" role="radio" aria-checked={shape === o.id} aria-label={t(`drawTool.${o.id}`)} title={t(`drawTool.${o.id}`)} className={cx(shape === o.id && s.on)} onClick={() => pickShape(o.id)}><SymbolGlyph sym={o.icon} size={17} /></button>
                ))}
              </div>
              {/* always there (hidden unless a triangle is chosen), so the grid below never jumps */}
              <div className={s.iconSeg} role="radiogroup" aria-label={t("drawDirection")} style={{ visibility: shape === "triangle" ? "visible" : "hidden" }}>
                {DIRS.map((o) => (
                  <button key={o.id} type="button" role="radio" tabIndex={shape === "triangle" ? 0 : -1} aria-checked={dir === o.id} aria-label={t(`drawDir.${o.id}`)} title={t(`drawDir.${o.id}`)} className={cx(dir === o.id && s.on)} onClick={() => setDir(o.id)}><SymbolGlyph sym={o.icon} size={13} /></button>
                ))}
              </div>
            </div>
            <span className={s.label}>{t("drawPaint")}</span>
            <div className={s.drawControlRow}>
              <div className={cx(s.iconSeg, s.paintSeg)} role="radiogroup" aria-label={t("drawPaint")}>
                {PAINTS.map((o) => (
                  <button key={o.id} type="button" role="radio" disabled={!allowed(shape).includes(o.id)} aria-checked={paint === o.id} title={t(`drawPaintHint.${o.id}`)} className={cx(paint === o.id && s.on)} onClick={() => setPaint(o.id)}>
                    <SymbolGlyph sym={o.icon} size={15} />{t(`drawPaintMode.${o.id}`)}
                  </button>
                ))}
              </div>
              <span className={cx(ui.hint, s.paintHint)}>{t(`drawPaintHint.${allowed(shape).includes(paint) ? paint : "fill"}`)}</span>
            </div>
          </div>
          <div className={s.drawRow}>
            <div className={cx(s.drawArea, full && s.drawFull)} style={{ width: SIZE, height: SIZE }}>
              <svg ref={area} width={SIZE} height={SIZE} data-testid="draw-area"
                onPointerDown={(e) => {
                  if (full) return;
                  e.currentTarget.setPointerCapture(e.pointerId);
                  const p = point(e);
                  setDrag({ from: p, to: p });
                }}
                onPointerMove={(e) => drag && setDrag({ from: drag.from, to: point(e) })}
                onPointerUp={() => {
                  if (pending && validShape(pending)) setShapes([...shapes, pending]);
                  setDrag(null);
                }}
                onPointerCancel={() => setDrag(null)}>
                {lines.map((v, i) => (
                  <g key={v} className={cx(s.gridLine, i === CUSTOM_GRID / 2 && s.gridMid)}>
                    <line x1={v} y1={PAD} x2={v} y2={SIZE - PAD} />
                    <line x1={PAD} y1={v} x2={SIZE - PAD} y2={v} />
                  </g>
                ))}
              </svg>
              {sym && <div className={s.drawInk}><SymbolGlyph sym={sym} size={SIZE} /></div>}
              {/* where the cut-outs are, so a cut over empty space is still visible */}
              {cuts.length > 0 && (
                <svg className={s.drawCuts} width={SIZE} height={SIZE} viewBox="0 0 24 24" data-testid="draw-cuts">
                  {cuts.map((c, i) => <path key={i} d={coveredPath(c)} />)}
                </svg>
              )}
            </div>
            <div className={s.drawSide}>
              <span className={s.label}>{t("drawPreview")}</span>
              <div className={s.drawSamples} data-testid="draw-preview">
                {[30, 18, 12].map((px) => <span key={px} className={s.drawSample} style={{ width: px + 8, height: px + 8 }}>{result && <SymbolGlyph sym={result} size={px} />}</span>)}
              </div>
              <span className={cx(ui.hint, (full || (shapes.length > 0 && !result)) && s.drawWarn)} data-testid="draw-count">
                {full ? t("drawFull", { max: CUSTOM_MAX_SHAPES }) : shapes.length > 0 && !result ? t("drawNeedInk") : t("drawCount", { n: shapes.length, max: CUSTOM_MAX_SHAPES })}
              </span>
              <button type="button" className={cx(ui.btn, ui.sm)} disabled={!shapes.length} onClick={() => setShapes(shapes.slice(0, -1))}>{t("drawUndo")}</button>
              <button type="button" className={cx(ui.btn, ui.sm)} disabled={!shapes.length} onClick={() => setShapes([])}>{t("drawClear")}</button>
              <div className={s.drawExamples}>
                <span className={s.label}>{t("drawExamples")}</span>
                <div className={s.drawExampleRow}>
                  {CUSTOM_EXAMPLES.map((ex) => (
                    <button key={ex.id} type="button" className={s.drawExample} title={t(`drawExample.${ex.id}`)} aria-label={t(`drawExample.${ex.id}`)} data-example={ex.id} onClick={() => setShapes(decodeCustomSymbol(ex.sym) ?? [])}>
                      <SymbolGlyph sym={ex.sym} size={30} />
                      <span>{t(`drawExample.${ex.id}`)}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <p className={cx(ui.hint, s.drawTip)} data-testid="draw-tip">{t("drawTip")}</p>
        </div>
        <div className={ui.modalFoot}>
          <button type="button" className={ui.btn} onClick={onClose}>{t("drawCancel")}</button>
          <button type="button" className={cx(ui.btn, ui.primary)} disabled={!result} onClick={() => { onUse(result!); onClose(); }}>{t("drawUse")}</button>
        </div>
      </div>
    </div>
  );
}
