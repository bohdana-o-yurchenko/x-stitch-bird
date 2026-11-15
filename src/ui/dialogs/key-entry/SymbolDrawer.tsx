"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { CUSTOM_GRID, CUSTOM_MAX_SHAPES, decodeCustomSymbol, encodeCustomSymbol, validShape, type CustomShape, type TriangleDir } from "@/core/symbols/customSymbol";
import { SymbolGlyph } from "../../common/SymbolGlyph";
import { cx, ui } from "../../common/widgets";
import s from "./keyEntry.module.css";

type Tool = "circle" | "circleF" | "rect" | "rectF" | "triangle" | "triangleF" | "arrow";
const TOOLS: { id: Tool; icon: string }[] = [
  { id: "circle", icon: "sym:circle-o" }, { id: "circleF", icon: "sym:circle" },
  { id: "rect", icon: "sym:square-o" }, { id: "rectF", icon: "sym:square" },
  { id: "triangle", icon: "sym:triangle-o" }, { id: "triangleF", icon: "sym:triangle" },
  { id: "arrow", icon: "draw:a2aa2" },
];
const DIRS: { id: TriangleDir; icon: string }[] = [{ id: "u", icon: "sym:triangle" }, { id: "r", icon: "sym:triangle-right" }, { id: "d", icon: "sym:triangle-down" }, { id: "l", icon: "sym:triangle-left" }];

// the drawing area: the symbol's 24-unit box at 12 px per unit, so grid point v sits at 24 + 20·v px
const SIZE = 288, PAD = 24, STEP = 20;

type Pt = { x: number; y: number };

function shapeFrom(tool: Tool, dir: TriangleDir, a: Pt, b: Pt): CustomShape {
  if (tool === "arrow") return { kind: "arrow", x1: a.x, y1: a.y, x2: b.x, y2: b.y };
  const box = { x1: Math.min(a.x, b.x), y1: Math.min(a.y, b.y), x2: Math.max(a.x, b.x), y2: Math.max(a.y, b.y) }, filled = tool.endsWith("F");
  if (tool.startsWith("triangle")) return { kind: "triangle", filled, dir, ...box };
  return { kind: tool.startsWith("circle") ? "circle" : "rect", filled, ...box };
}

/**
 * Draws a chart symbol from a few simple shapes (SPEC §2.5): pick a shape, drag on the grid. The tool can only make
 * what the symbol format holds — at most `CUSTOM_MAX_SHAPES` circles, rectangles, triangles and arrows on a 12×12
 * grid — so a drawing can never get too heavy for the file or too fussy to read at chart size.
 */
export function SymbolDrawer({ initial, onUse, onClose }: { initial: string; onUse: (sym: string) => void; onClose: () => void }) {
  const t = useTranslations("keyDialog");
  const [shapes, setShapes] = useState<CustomShape[]>(() => decodeCustomSymbol(initial) ?? []);
  const [tool, setTool] = useState<Tool>("circle");
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

  const point = (e: React.PointerEvent): Pt => {
    const r = area.current!.getBoundingClientRect(), snap = (px: number) => Math.max(0, Math.min(CUSTOM_GRID, Math.round((px - PAD) / STEP)));
    return { x: snap(e.clientX - r.left), y: snap(e.clientY - r.top) };
  };
  const pending = drag ? shapeFrom(tool, dir, drag.from, drag.to) : null;
  const shown = pending && validShape(pending) ? [...shapes, pending] : shapes;
  const sym = encodeCustomSymbol(shown), result = encodeCustomSymbol(shapes);
  const lines = Array.from({ length: CUSTOM_GRID + 1 }, (_, i) => PAD + i * STEP);

  return (
    <div className={ui.backdrop} onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={cx(ui.modal, s.drawer)} role="dialog" aria-modal="true" aria-label={t("drawTitle")} data-no-shortcuts data-testid="symbol-drawer">
        <h2>{t("drawTitle")}</h2>
        <div className={ui.modalBody}>
          <p className={ui.hint}>{t("drawHint", { max: CUSTOM_MAX_SHAPES })}</p>
          <div className={s.drawTools}>
            <div className={s.iconSeg} role="radiogroup" aria-label={t("drawShape")}>
              {TOOLS.map((o) => (
                <button key={o.id} type="button" role="radio" aria-checked={tool === o.id} aria-label={t(`drawTool.${o.id}`)} title={t(`drawTool.${o.id}`)} className={cx(tool === o.id && s.on)} onClick={() => setTool(o.id)}><SymbolGlyph sym={o.icon} size={17} /></button>
              ))}
            </div>
            {tool.startsWith("triangle") && (
              <div className={s.iconSeg} role="radiogroup" aria-label={t("drawDirection")}>
                {DIRS.map((o) => (
                  <button key={o.id} type="button" role="radio" aria-checked={dir === o.id} aria-label={t(`drawDir.${o.id}`)} title={t(`drawDir.${o.id}`)} className={cx(dir === o.id && s.on)} onClick={() => setDir(o.id)}><SymbolGlyph sym={o.icon} size={13} /></button>
                ))}
              </div>
            )}
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
            </div>
            <div className={s.drawSide}>
              <span className={s.label}>{t("drawPreview")}</span>
              <div className={s.drawSamples} data-testid="draw-preview">
                {[30, 18, 12].map((px) => <span key={px} className={s.drawSample} style={{ width: px + 8, height: px + 8 }}>{result && <SymbolGlyph sym={result} size={px} />}</span>)}
              </div>
              <span className={cx(ui.hint, full && s.drawWarn)} data-testid="draw-count">{full ? t("drawFull", { max: CUSTOM_MAX_SHAPES }) : t("drawCount", { n: shapes.length, max: CUSTOM_MAX_SHAPES })}</span>
              <button type="button" className={cx(ui.btn, ui.sm)} disabled={!shapes.length} onClick={() => setShapes(shapes.slice(0, -1))}>{t("drawUndo")}</button>
              <button type="button" className={cx(ui.btn, ui.sm)} disabled={!shapes.length} onClick={() => setShapes([])}>{t("drawClear")}</button>
            </div>
          </div>
        </div>
        <div className={ui.modalFoot}>
          <button type="button" className={ui.btn} onClick={onClose}>{t("drawCancel")}</button>
          <button type="button" className={cx(ui.btn, ui.primary)} disabled={!result} onClick={() => { onUse(result!); onClose(); }}>{t("drawUse")}</button>
        </div>
      </div>
    </div>
  );
}
