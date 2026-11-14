"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import type { ColorEntry } from "@/core/color/colorEntry";
import type { PaletteSlot } from "@/core/pattern/palette";
import type { ChartView } from "@/render/chart";
import { drawKeyIcon } from "@/render/keyIcon";
import { useEditor, useEditorState } from "../hooks/editor";
import s from "./common.module.css";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

export interface ModalButton {
  label: string;
  primary?: boolean;
  disabled?: boolean;
  /** Return false to keep the dialog open. */
  onClick?: () => unknown;
}

export function Modal({ title, wide, children, buttons, onClose }: { title: string; wide?: boolean; children: ReactNode; buttons: ModalButton[]; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className={s.backdrop} onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={cx(s.modal, wide && s.wide)} role="dialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2>
        <div className={s.modalBody}>{children}</div>
        <div className={s.modalFoot}>
          {buttons.map((b) => (
            <button
              key={b.label}
              type="button"
              className={cx(s.btn, b.primary && s.primary)}
              disabled={b.disabled}
              onClick={async () => {
                if ((await b.onClick?.()) !== false) onClose();
              }}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Colour sample: beads round, blends striped with their mix in the middle, combos thread + bead dot. */
export function Swatch({ entry }: { entry: ColorEntry | undefined }) {
  if (!entry) return <div className={s.swatch} />;
  if (entry.isCombo && entry.thread && entry.bead)
    return (
      <div className={s.swatch} style={{ background: entry.thread.hex }}>
        <div style={{ position: "absolute", inset: "22%", borderRadius: "50%", background: entry.bead.hex, border: "1px solid rgba(0,0,0,.4)" }} />
      </div>
    );
  if (entry.isBlend && entry.parts?.length) {
    const n = entry.parts.length;
    const bg = `linear-gradient(135deg,${entry.parts.map((p, i) => `${p.entry.hex} ${(i / n) * 100}% ${((i + 1) / n) * 100}%`).join(",")})`;
    return (
      <div className={s.swatch} style={{ background: bg }}>
        <div style={{ position: "absolute", inset: "25%", borderRadius: 3, background: entry.hex, border: "1px solid rgba(255,255,255,.6)" }} />
      </div>
    );
  }
  return <div className={cx(s.swatch, entry.kind === "bead" && s.bead)} style={{ background: entry.hex }} />;
}

/** Canvas icon of a key entry in the current chart view (SPEC §7.1). */
export function KeyIcon({ slot, size = 30, view }: { slot: PaletteSlot; size?: number; view?: ChartView }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const ed = useEditor();
  const current = useEditorState((st) => st.view);
  const fabric = useEditorState((st) => st.doc.fabric);
  useLayoutEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = c.height = Math.round(size * dpr);
    const g = c.getContext("2d")!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawKeyIcon(g, slot, size, view ?? current, ed.theme, fabric);
  }, [slot, size, view, current, fabric, ed.theme]);
  return <canvas ref={ref} style={{ width: size, height: size, borderRadius: 5, border: "1px solid rgba(0,0,0,.18)", flex: "none" }} />;
}

export function Toasts() {
  const toasts = useEditorState((st) => st.toasts);
  const t = useTranslations();
  return (
    <div className={s.toasts} aria-live="polite">
      {toasts.map((x) => (
        <div key={x.id} className={s.toast}>
          {t.has(x.key) ? t(x.key, x.values as never) : x.key}
        </div>
      ))}
    </div>
  );
}

/** Dropdown anchored to its button; closes on outside click. */
export function Dropdown({ label, title, items, className }: { label: string; title?: string; className?: string; items: { label: string; onClick: () => void; disabled?: boolean }[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button type="button" className={className ?? s.btn} title={title} aria-expanded={open} onClick={() => setOpen(!open)}>
        {label}
      </button>
      {open && (
        <div className={s.menu} role="menu">
          {items.map((i) => (
            <button key={i.label} type="button" role="menuitem" disabled={i.disabled} onClick={() => { setOpen(false); i.onClick(); }}>
              {i.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export { s as ui };
