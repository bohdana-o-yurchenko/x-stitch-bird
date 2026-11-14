"use client";

import { useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { cx } from "../common/widgets";
import s from "./layout.module.css";

const SIDE_DEFAULT = 360, SIDE_MIN = 280, SIDE_KEY = "stitchwork.sideWidth";
const sideMax = () => Math.max(SIDE_MIN, Math.min(720, window.innerWidth * 0.6));
const clampSide = (w: number) => Math.round(Math.max(SIDE_MIN, Math.min(sideMax(), w)));

function readSide(): number {
  try {
    const w = Number(localStorage.getItem(SIDE_KEY));
    return w ? clampSide(w) : SIDE_DEFAULT;
  } catch {
    return SIDE_DEFAULT;
  }
}

function saveSide(w: number) {
  try {
    localStorage.setItem(SIDE_KEY, String(w));
  } catch {
    // a convenience only
  }
}

/** Drag handle on the side panel's left edge; double-click puts the default width back. */
function SideResizer({ onResize }: { onResize: (w: number) => void }) {
  const t = useTranslations("app");
  const start = (e: ReactPointerEvent<HTMLDivElement>) => {
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    let last = 0;
    const move = (ev: PointerEvent) => onResize((last = clampSide(window.innerWidth - ev.clientX)));
    const up = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      if (last) saveSide(last);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
    e.preventDefault();
  };
  const reset = () => {
    onResize(SIDE_DEFAULT);
    saveSide(SIDE_DEFAULT);
  };
  return <div className={s.resizer} role="separator" aria-orientation="vertical" title={t("resizePanel")} data-testid="side-resizer" onPointerDown={start} onDoubleClick={reset} />;
}

/** The screen's slots (ARCHITECTURE §6.3). Rearranging panels only touches this file and its CSS. */
export function EditorLayout(props: { collapsed: boolean; header: ReactNode; stage: ReactNode; side: ReactNode; status: ReactNode; overlays: ReactNode }) {
  const [side, setSide] = useState(readSide);
  return (
    <div className={cx(s.app, props.collapsed && s.collapsed)} style={{ "--side-w": `${side}px` } as CSSProperties}>
      <div className={s.header}>{props.header}</div>
      <main className={s.stage}>{props.stage}</main>
      <aside className={s.side}>{props.side}</aside>
      {!props.collapsed && <SideResizer onResize={setSide} />}
      <div className={s.status}>{props.status}</div>
      {props.overlays}
    </div>
  );
}

export function DropZoneOverlay({ text }: { text: string }) {
  return <div className={s.dropzone}>{text}</div>;
}
