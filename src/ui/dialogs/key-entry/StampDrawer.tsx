"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { StampDef, StampLine } from "@/core/pattern/types";
import { cleanStampDef, MAX_STAMP } from "@/core/stamps/stamps";
import { cx, ui } from "../../common/widgets";
import s from "./keyEntry.module.css";

type Pt = { x: number; y: number };

/** The drawing area's room; a cell is as big as fits, at most this. */
const ROOM = 300, MAX_CELL = 72, PAD = 14;

const sameLine = (a: StampLine, b: StampLine) =>
  (a.x1 === b.x1 && a.y1 === b.y1 && a.x2 === b.x2 && a.y2 === b.y2) || (a.x1 === b.x2 && a.y1 === b.y2 && a.x2 === b.x1 && a.y2 === b.y1);

/**
 * Draws a stamp of one's own (ARCHITECTURE-REVIEW §3): a block of a fixed number of cells and the straight stitches in
 * it, from one point of the half grid to another. Drag to add a stitch; click a stitch to take it away. Once placed on
 * a chart, its size can't change.
 */
export function StampDrawer({ initial, onUse, onClose }: { initial?: StampDef; onUse: (d: Omit<StampDef, "id">) => void; onClose: () => void }) {
  const t = useTranslations("stamps");
  const [w, setW] = useState(initial?.w ?? 2);
  const [h, setH] = useState(initial?.h ?? 2);
  const [lines, setLines] = useState<StampLine[]>(initial?.lines ?? []);
  const [name, setName] = useState(initial?.name ?? "");
  const [drag, setDrag] = useState<{ from: Pt; to: Pt } | null>(null);
  const area = useRef<SVGSVGElement>(null);
  const cell = Math.min(MAX_CELL, Math.floor((ROOM - 2 * PAD) / Math.max(w, h)));
  const W = w * cell + 2 * PAD, H = h * cell + 2 * PAD;
  const X = (v: number) => PAD + v * cell, Y = (v: number) => PAD + v * cell;

  useEffect(() => {
    // Esc closes only this dialog, not the key form under it
    const esc = (e: KeyboardEvent) => e.key === "Escape" && (e.stopPropagation(), onClose());
    window.addEventListener("keydown", esc, true);
    return () => window.removeEventListener("keydown", esc, true);
  }, [onClose]);

  /** The half-grid point nearest the pointer, inside the block. */
  const point = (e: React.PointerEvent): Pt => {
    const r = area.current!.getBoundingClientRect(), snap = (px: number, max: number) => Math.max(0, Math.min(max, Math.round(((px - PAD) / cell) * 2) / 2));
    return { x: snap(e.clientX - r.left, w), y: snap(e.clientY - r.top, h) };
  };
  const resize = (nw: number, nh: number) => {
    setW(nw);
    setH(nh);
    // stitches that no longer fit go
    setLines((ls) => ls.filter((l) => Math.max(l.x1, l.x2) <= nw && Math.max(l.y1, l.y2) <= nh));
  };
  const pending = drag && (drag.from.x !== drag.to.x || drag.from.y !== drag.to.y) ? { x1: drag.from.x, y1: drag.from.y, x2: drag.to.x, y2: drag.to.y } : null;
  const result = cleanStampDef({ id: "own:draft", name, w, h, lines });
  const sizes = Array.from({ length: MAX_STAMP }, (_, i) => i + 1);
  const halves = (n: number) => Array.from({ length: 2 * n + 1 }, (_, i) => i / 2);

  return (
    <div className={ui.backdrop} onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={cx(ui.modal, s.drawer)} role="dialog" aria-modal="true" aria-label={t("drawTitle")} data-no-shortcuts data-testid="stamp-drawer">
        <h2>{t("drawTitle")}</h2>
        <div className={ui.modalBody}>
          <ul className={cx(ui.hint, s.stampHints)}>
            <li>{t("drawHintDrag")}</li>
            <li>{t("drawHintClick")}</li>
            <li>{t("drawHintSize")}</li>
          </ul>
          <div className={s.stampSize}>
            <label className={s.inline}>
              <span className={s.label}>{t("width")}</span>
              <select className={ui.input} value={w} data-testid="stamp-w" onChange={(e) => resize(Number(e.target.value), h)}>{sizes.map((n) => <option key={n} value={n}>{n}</option>)}</select>
            </label>
            <label className={s.inline}>
              <span className={s.label}>{t("height")}</span>
              <select className={ui.input} value={h} data-testid="stamp-h" onChange={(e) => resize(w, Number(e.target.value))}>{sizes.map((n) => <option key={n} value={n}>{n}</option>)}</select>
            </label>
            <label className={s.inline}>
              <span className={s.label}>{t("name")}</span>
              <input className={ui.input} value={name} maxLength={40} placeholder={t("namePlaceholder")} data-testid="stamp-name" onChange={(e) => setName(e.target.value)} />
            </label>
          </div>
          <div className={s.drawRow}>
            <div className={s.drawArea}>
              <svg ref={area} width={W} height={H} data-testid="stamp-area"
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  const p = point(e);
                  setDrag({ from: p, to: p });
                }}
                onPointerMove={(e) => drag && setDrag({ from: drag.from, to: point(e) })}
                onPointerUp={() => {
                  if (pending && !lines.some((l) => sameLine(l, pending))) setLines([...lines, pending]);
                  setDrag(null);
                }}
                onPointerCancel={() => setDrag(null)}>
                {halves(w).map((v) => <line key={`x${v}`} className={cx(s.stampGrid, Number.isInteger(v) && s.stampGridCell)} x1={X(v)} y1={Y(0)} x2={X(v)} y2={Y(h)} />)}
                {halves(h).map((v) => <line key={`y${v}`} className={cx(s.stampGrid, Number.isInteger(v) && s.stampGridCell)} x1={X(0)} y1={Y(v)} x2={X(w)} y2={Y(v)} />)}
                {lines.map((l, i) => (
                  // a wide invisible line on top makes a thin stitch easy to click away
                  <g key={i} className={s.stampLine} data-testid="stamp-line" onPointerDown={(e) => { e.stopPropagation(); setLines(lines.filter((_, j) => j !== i)); }}>
                    <line x1={X(l.x1)} y1={Y(l.y1)} x2={X(l.x2)} y2={Y(l.y2)} />
                    <line className={s.stampHit} x1={X(l.x1)} y1={Y(l.y1)} x2={X(l.x2)} y2={Y(l.y2)} />
                  </g>
                ))}
                {pending && <line className={s.stampPending} x1={X(pending.x1)} y1={Y(pending.y1)} x2={X(pending.x2)} y2={Y(pending.y2)} />}
              </svg>
            </div>
            <div className={s.drawSide}>
              <span className={ui.hint} data-testid="stamp-count">{t("count", { n: lines.length })}</span>
              <button type="button" className={cx(ui.btn, ui.sm)} disabled={!lines.length} onClick={() => setLines(lines.slice(0, -1))}>{t("undo")}</button>
              <button type="button" className={cx(ui.btn, ui.sm)} disabled={!lines.length} onClick={() => setLines([])}>{t("clear")}</button>
            </div>
          </div>
        </div>
        <div className={ui.modalFoot}>
          <button type="button" className={ui.btn} onClick={onClose}>{t("cancel")}</button>
          <button type="button" className={cx(ui.btn, ui.primary)} disabled={!result} data-testid="stamp-use" onClick={() => { onUse({ name: result!.name, w: result!.w, h: result!.h, lines: result!.lines }); onClose(); }}>{t("use")}</button>
        </div>
      </div>
    </div>
  );
}
