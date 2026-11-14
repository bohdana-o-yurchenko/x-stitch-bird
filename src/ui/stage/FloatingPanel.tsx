"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { cx } from "../common/widgets";
import s from "./stage.module.css";

type Pos = { x: number; y: number };

const storageKey = (id: string) => `stitchwork.float.${id}`;

function readPos(id: string): Pos | null {
  try {
    const p = JSON.parse(localStorage.getItem(storageKey(id)) ?? "null") as Pos | null;
    return p && Number.isFinite(p.x) && Number.isFinite(p.y) ? p : null;
  } catch {
    return null;
  }
}

function writePos(id: string, p: Pos | null) {
  try {
    if (p) localStorage.setItem(storageKey(id), JSON.stringify(p));
    else localStorage.removeItem(storageKey(id));
  } catch {
    // position is a convenience; storage may be unavailable
  }
}

/**
 * A panel floating over the chart that can be dragged by its grip. Starts in `corner`; the dragged position is
 * remembered in this browser. Double-click the grip to put it back.
 */
export function FloatingPanel({ id, corner, className, children, testId }: { id: string; corner: "topRight" | "bottomLeft"; className?: string; children: ReactNode; testId?: string }) {
  const t = useTranslations("app");
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<Pos | null>(() => readPos(id));

  const clamp = (p: Pos): Pos => {
    const el = ref.current, parent = el?.offsetParent as HTMLElement | null;
    if (!el || !parent) return p;
    return { x: Math.max(0, Math.min(parent.clientWidth - el.offsetWidth, p.x)), y: Math.max(0, Math.min(parent.clientHeight - el.offsetHeight, p.y)) };
  };

  useEffect(() => {
    const keepInside = () => setPos((p) => p && clamp(p));
    keepInside();
    window.addEventListener("resize", keepInside);
    return () => window.removeEventListener("resize", keepInside);
  }, []);

  const startDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = ref.current!;
    const from = { x: e.clientX - el.offsetLeft, y: e.clientY - el.offsetTop };
    const grip = e.currentTarget as HTMLElement;
    grip.setPointerCapture(e.pointerId);
    let last: Pos | null = null;
    const move = (ev: PointerEvent) => setPos((last = clamp({ x: ev.clientX - from.x, y: ev.clientY - from.y })));
    const up = () => {
      grip.removeEventListener("pointermove", move);
      grip.removeEventListener("pointerup", up);
      if (last) writePos(id, last);
    };
    grip.addEventListener("pointermove", move);
    grip.addEventListener("pointerup", up);
    e.preventDefault();
  };

  const reset = () => {
    setPos(null);
    writePos(id, null);
  };

  return (
    <div ref={ref} className={cx(s.float, !pos && s[corner], className)} style={pos ? { left: pos.x, top: pos.y } : undefined} data-testid={testId}>
      <div className={s.grip} title={t("dragToMove")} onPointerDown={startDrag} onDoubleClick={reset} />
      {children}
    </div>
  );
}
