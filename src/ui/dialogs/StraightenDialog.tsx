"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { homography, project, type Homography } from "@/core/geometry/homography";
import type { Point } from "@/core/pattern/types";
import { defaultCorners, type Quad } from "@/core/underlay/underlay";
import { cx, ui } from "../common/widgets";
import { useEditor } from "../hooks/editor";
import s from "./straighten.module.css";
import { HelpLink } from "../common/HelpLink";

const HANDLE_R = 9, GRAB_R = 24, LOUPE_R = 80, LOUPE_ZOOM = 4, PAD = 28;

/** Corners in order and not crossing: the quad is convex with a consistent turn direction. */
function isConvex(q: Quad): boolean {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i]!, b = q[(i + 1) % 4]!, c = q[(i + 2) % 4]!;
    const z = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(z) < 1e-9) return false;
    if (sign && Math.sign(z) !== sign) return false;
    sign = Math.sign(z);
  }
  return true;
}

/** The marked area's grid (every cell when there is room, every 10th otherwise) mapped onto the photo. */
function drawGrid(g: CanvasRenderingContext2D, h: Homography, cols: number, rows: number, toScreen: (p: Point) => Point, minor: boolean) {
  const line = (a: Point, b: Point) => {
    const p = toScreen(project(h, a)), q = toScreen(project(h, b));
    g.moveTo(p.x, p.y);
    g.lineTo(q.x, q.y);
  };
  g.beginPath();
  for (let i = 0; i <= cols; i++) if (minor || i % 10 === 0 || i === cols) line({ x: i, y: 0 }, { x: i, y: rows });
  for (let j = 0; j <= rows; j++) if (minor || j % 10 === 0 || j === rows) line({ x: 0, y: j }, { x: cols, y: j });
  g.stroke();
}

/**
 * Straighten a photo of a paper chart (SPEC §15.15): drag the 4 corners onto the corners of the chart's grid on the
 * photo; the predicted grid is drawn over it, a loupe magnifies the corner being dragged, arrow keys nudge it.
 */
export function StraightenDialog({ onClose }: { onClose: () => void }) {
  const t = useTranslations("straighten");
  const ed = useEditor();
  const [start] = useState(() => ed.underlay.straightenStart());
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [corners, setCorners] = useState<Quad | null>(start?.corners ?? null);
  const [cols, setCols] = useState(start?.cols ?? ed.doc.w);
  const [rows, setRows] = useState(start?.rows ?? ed.doc.h);
  const [col, setCol] = useState((start?.at.x ?? 0) + 1);
  const [row, setRow] = useState((start?.at.y ?? 0) + 1);
  const [active, setActive] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const area = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    if (start) void ed.images.load(start.source).then(setImg, () => onClose());
  }, [ed, start, onClose]);

  useLayoutEffect(() => {
    const el = area.current!;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // photo → screen: fitted into the area with a margin so corners can sit on the photo's edge
  const k = img && size.w ? Math.min((size.w - 2 * PAD) / img.naturalWidth, (size.h - 2 * PAD) / img.naturalHeight) : 1;
  const ox = img ? (size.w - img.naturalWidth * k) / 2 : 0, oy = img ? (size.h - img.naturalHeight * k) / 2 : 0;
  const toScreen = (p: Point) => ({ x: ox + p.x * k, y: oy + p.y * k });
  const toPhoto = (x: number, y: number) => ({ x: (x - ox) / k, y: (y - oy) / k });
  const valid = !!corners && isConvex(corners) && cols >= 1 && rows >= 1;

  useEffect(() => {
    const c = canvas.current;
    if (!c || !img || !corners || !size.w) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(size.w * dpr);
    c.height = Math.round(size.h * dpr);
    const g = c.getContext("2d")!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, size.w, size.h);
    const h = valid ? homography([{ x: 0, y: 0 }, { x: cols, y: 0 }, { x: cols, y: rows }, { x: 0, y: rows }], corners) : null;
    const scene = (toS: (p: Point) => Point, scale: number) => {
      g.drawImage(img, toS({ x: 0, y: 0 }).x, toS({ x: 0, y: 0 }).y, img.naturalWidth * scale, img.naturalHeight * scale);
      const q = corners.map(toS);
      // dim everything outside the marked area
      g.beginPath();
      g.rect(-1e4, -1e4, 3e4, 3e4);
      q.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
      g.closePath();
      g.fillStyle = "rgba(30, 20, 10, 0.45)";
      g.fill("evenodd");
      if (h) {
        const cell = Math.min(...[0, 1, 2, 3].map((i) => Math.hypot(q[(i + 1) % 4]!.x - q[i]!.x, q[(i + 1) % 4]!.y - q[i]!.y) / (i % 2 ? rows : cols)));
        g.lineWidth = 1;
        if (cell > 6) {
          g.strokeStyle = "rgba(0, 170, 255, 0.55)";
          drawGrid(g, h, cols, rows, toS, true);
        }
        g.strokeStyle = "rgba(0, 140, 255, 0.95)";
        g.lineWidth = 1.5;
        drawGrid(g, h, cols, rows, toS, false);
      }
      g.strokeStyle = valid ? ed.theme.accent : "#d00";
      g.lineWidth = 2;
      g.beginPath();
      q.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
      g.closePath();
      g.stroke();
    };
    scene(toScreen, k);
    corners.forEach((p, i) => {
      const q = toScreen(p);
      g.beginPath();
      g.arc(q.x, q.y, HANDLE_R, 0, Math.PI * 2);
      g.fillStyle = i === active ? ed.theme.accent : "#fff";
      g.fill();
      g.lineWidth = 2;
      g.strokeStyle = ed.theme.accent;
      g.stroke();
    });
    // loupe: the active corner magnified, placed in the corner of the view away from it
    if (active !== null && dragging) {
      const p = toScreen(corners[active]!), left = p.x > size.w / 2, top = p.y > size.h / 2;
      const cx = left ? LOUPE_R + 16 : size.w - LOUPE_R - 16, cy = top ? LOUPE_R + 16 : size.h - LOUPE_R - 16, z = k * LOUPE_ZOOM;
      g.save();
      g.beginPath();
      g.arc(cx, cy, LOUPE_R, 0, Math.PI * 2);
      g.fillStyle = "#fff";
      g.fill();
      g.clip();
      const c0 = corners[active]!;
      scene((pt) => ({ x: cx + (pt.x - c0.x) * z, y: cy + (pt.y - c0.y) * z }), z);
      g.strokeStyle = ed.theme.accent;
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(cx - 12, cy); g.lineTo(cx + 12, cy); g.moveTo(cx, cy - 12); g.lineTo(cx, cy + 12);
      g.stroke();
      g.restore();
      g.beginPath();
      g.arc(cx, cy, LOUPE_R, 0, Math.PI * 2);
      g.lineWidth = 3;
      g.strokeStyle = "#fff";
      g.stroke();
      g.lineWidth = 1.5;
      g.strokeStyle = ed.theme.accent;
      g.stroke();
    }
  });

  const hit = (x: number, y: number) => {
    if (!corners) return null;
    let best: number | null = null, bd = GRAB_R;
    corners.forEach((p, i) => {
      const q = toScreen(p), d = Math.hypot(q.x - x, q.y - y);
      if (d < bd) [best, bd] = [i, d];
    });
    return best;
  };

  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!corners || !img) return;
    const r = e.currentTarget.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    const i = hit(x, y);
    if (i === null) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const q = toScreen(corners[i]!), dx = q.x - x, dy = q.y - y;
    setActive(i);
    setDragging(true);
    const el = e.currentTarget;
    const move = (ev: PointerEvent) => {
      const p = toPhoto(ev.clientX - r.left + dx, ev.clientY - r.top + dy);
      const clamped = { x: Math.max(0, Math.min(img.naturalWidth, p.x)), y: Math.max(0, Math.min(img.naturalHeight, p.y)) };
      setCorners((cur) => cur && (cur.map((c, j) => (j === i ? clamped : c)) as Quad));
    };
    const up = () => {
      setDragging(false);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
  };

  const hover = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.cursor = hit(e.clientX - r.left, e.clientY - r.top) !== null ? "grab" : "default";
  };

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") return onClose();
      const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
      if (!d || active === null || (e.target as HTMLElement).tagName === "INPUT") return;
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      setCorners((cur) => cur && (cur.map((c, j) => (j === active ? { x: c.x + d[0]! * step, y: c.y + d[1]! * step } : c)) as Quad));
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [active, onClose]);

  const apply = async () => {
    if (!valid || !corners) return;
    setBusy(true);
    await ed.underlay.straighten({ corners, cols, rows, at: { x: col - 1, y: row - 1 } });
    onClose();
  };

  const num = (label: string, value: number, set: (n: number) => void, min: number) => (
    <label className={s.num}>
      {label}
      <input type="number" min={min} max={1000} value={value} onChange={(e) => Number.isFinite(e.target.valueAsNumber) && set(Math.max(min, Math.round(e.target.valueAsNumber)))} />
    </label>
  );

  if (!start) return null;
  return (
    <div className={s.backdrop} role="dialog" aria-modal="true" aria-label={t("title")} data-testid="straighten">
      <div className={s.panel}>
        <div className={s.head}>
          <h2>{t("title")}<HelpLink to="import#straighten" /></h2>
          <p className={ui.hint}>{t("hint")}</p>
        </div>
        <div ref={area} className={s.area}>
          {!img && <p className={cx(ui.hint, s.loading)}>{t("loading")}</p>}
          <canvas ref={canvas} style={{ width: size.w, height: size.h }} onPointerDown={down} onPointerMove={hover} data-testid="straighten-canvas" />
        </div>
        <div className={s.foot}>
          <span className={s.group}>
            <b>{t("area")}</b>
            {num(t("cols"), cols, setCols, 1)}
            <span>×</span>
            {num(t("rows"), rows, setRows, 1)}
          </span>
          <span className={s.group}>
            <b>{t("topLeft")}</b>
            {num(t("column"), col, setCol, -999)}
            {num(t("row"), row, setRow, -999)}
          </span>
          <span className={s.spacer} />
          {!valid && corners && <span className={s.warn}>{t("crossed")}</span>}
          <button type="button" className={cx(ui.btn, ui.sm)} onClick={() => img && setCorners(defaultCorners(img.naturalWidth, img.naturalHeight))}>{t("reset")}</button>
          <button type="button" className={ui.btn} onClick={onClose}>{t("cancel")}</button>
          <button type="button" className={cx(ui.btn, ui.primary)} disabled={!valid || busy || !img} onClick={() => void apply()}>{busy ? t("working") : t("apply")}</button>
        </div>
      </div>
    </div>
  );
}
