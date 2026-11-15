"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import type { ColorEntry } from "@/core/color/colorEntry";
import type { PaletteSlot } from "@/core/pattern/palette";
import type { ChartView } from "@/render/chart";
import { drawKeyIcon } from "@/render/keyIcon";
import { useEditor, useEditorState } from "../hooks/editor";
import { Icon } from "./Icon";
import s from "./common.module.css";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

export interface ModalButton {
  label: string;
  primary?: boolean;
  /** The confirming button of a delete. */
  danger?: boolean;
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
              className={cx(s.btn, b.primary && s.primary, b.danger && s.dangerBtn)}
              autoFocus={b.danger}
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

/** The one delete button everywhere: a red bin. `label` says what it deletes (tooltip and screen readers). */
export function DeleteButton({ label, onClick, size = 17, testId }: { label: string; onClick: () => void; size?: number; testId?: string }) {
  return (
    <button type="button" className={cx(s.iconbtn, s.deleteBtn)} title={label} aria-label={label} data-testid={testId} onClick={(e) => { e.stopPropagation(); onClick(); }}>
      <Icon name="trash" size={size} />
    </button>
  );
}

/** Asks before deleting: the title names what goes, the body says what else happens. */
export function ConfirmDelete({ title, confirm, onConfirm, onClose, children }: { title: string; confirm: string; onConfirm: () => unknown; onClose: () => void; children: ReactNode }) {
  const t = useTranslations("dialogs");
  return (
    <Modal title={title} onClose={onClose} buttons={[{ label: t("cancel") }, { label: confirm, danger: true, onClick: onConfirm }]}>
      <div data-testid="confirm-delete" style={{ display: "contents" }}>{children}</div>
    </Modal>
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
  return <canvas ref={ref} style={{ width: size, height: size, borderRadius: 5, border: "1px solid var(--edge)", flex: "none" }} />;
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

/**
 * A menu entry: an action, a submenu (`items`), or "-" for a separator. `hint` is a second, muted line; `id`
 * names it for the quick-start guide (`data-guide="menu:<id>"`), which can open the menu on it.
 */
/** A menu entry, a separator, or a ready-made row (`node`) such as the theme switcher. */
export type MenuItem = { label: string; hint?: string; onClick?: () => void; disabled?: boolean; items?: MenuItem[]; id?: string } | { node: ReactNode; id: string } | "-";

type MenuPos = { top: number; left?: number; right?: number };

/** `reveal`: ids of submenus to open, outermost first (the guide pointing at an option deep in the menu). */
function MenuList({ items, pos, onDone, testId, reveal }: { items: MenuItem[]; pos: MenuPos; onDone: () => void; testId?: string; reveal?: string[] }) {
  const [sub, setSub] = useState<{ index: number; pos: MenuPos } | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const revealKey = reveal?.join("/");
  const openSub = (index: number, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    // flyout to the right unless that would leave the screen
    setSub({ index, pos: r.right + 240 < window.innerWidth ? { top: r.top - 5, left: r.right + 2 } : { top: r.top - 5, right: window.innerWidth - r.left + 2 } });
  };
  const subItems = sub && items[sub.index];
  useLayoutEffect(() => {
    const id = reveal?.[0];
    const n = items.findIndex((i) => i !== "-" && !("node" in i) && i.id === id && i.items);
    const el = n >= 0 ? list.current?.querySelector<HTMLElement>(`[data-guide="menu:${id}"]`) : null;
    if (el) openSub(n, el);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealKey]);
  return (
    <>
      <div ref={list} className={s.menu} role="menu" data-testid={testId} style={{ position: "fixed", top: pos.top, left: pos.left ?? "auto", right: pos.right ?? "auto" }}>
        {items.map((i, n) =>
          i === "-" ? (
            <hr key={n} className={s.menuSep} />
          ) : "node" in i ? (
            <div key={i.id} onPointerEnter={() => setSub(null)}>{i.node}</div>
          ) : (
            <button
              key={i.label}
              type="button"
              role="menuitem"
              aria-haspopup={i.items ? "menu" : undefined}
              aria-expanded={i.items ? sub?.index === n : undefined}
              disabled={i.disabled}
              data-guide={i.id && `menu:${i.id}`}
              className={cx(i.items && s.hasSub, sub?.index === n && s.subOpen)}
              onPointerEnter={(e) => (i.items ? openSub(n, e.currentTarget) : setSub(null))}
              onClick={(e) => {
                if (i.items) return openSub(n, e.currentTarget);
                onDone();
                i.onClick?.();
              }}
            >
              <span>{i.label}</span>
              {i.hint && <small>{i.hint}</small>}
            </button>
          ),
        )}
      </div>
      {sub && subItems && subItems !== "-" && "items" in subItems && subItems.items && <MenuList items={subItems.items} pos={sub.pos} onDone={onDone} reveal={reveal?.slice(1)} />}
    </>
  );
}

/**
 * Dropdown menu with optional submenus. Menus are rendered into <body> and positioned from the button, so
 * scrolling or clipped containers (like the header) can't hide them. Follows the button on scroll and resize;
 * closes on outside click or Esc.
 */
export function Dropdown({ label, title, items, className, reveal }: { label: string; title?: string; className?: string; items: MenuItem[]; reveal?: string[] | null }) {
  const [pos, setPos] = useState<MenuPos | null>(null);
  /** Opened by the user; the guide can also hold it open (`reveal`), and then outside clicks don't close it. */
  const [manual, setManual] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const revealKey = reveal ? reveal.join("/") : null;
  const held = useRef(false);
  const open = !!pos && (manual || revealKey !== null);
  const place = () => {
    const r = button.current!.getBoundingClientRect();
    // open towards the side with more room
    setPos(r.left < window.innerWidth / 2 ? { top: r.bottom + 6, left: r.left } : { top: r.bottom + 6, right: window.innerWidth - r.right });
  };
  useEffect(() => {
    if (!open) return;
    const close = () => setManual(false);
    const outside = (e: PointerEvent) => !held.current && !(e.target as Element).closest?.("[role=menu]") && !button.current?.contains(e.target as Node) && close();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("pointerdown", outside);
    window.addEventListener("keydown", esc);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("keydown", esc);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);
  useLayoutEffect(() => {
    held.current = revealKey !== null;
    if (revealKey !== null) place();
  }, [revealKey]);
  const toggle = () => {
    if (open) return setManual(false);
    place();
    setManual(true);
  };
  return (
    <>
      <button ref={button} type="button" className={className ?? s.btn} title={title} aria-haspopup="menu" aria-expanded={open} onClick={toggle}>
        {label}
      </button>
      {open && pos && createPortal(<MenuList key={revealKey ?? ""} items={items} pos={pos} onDone={() => setManual(false)} reveal={reveal ?? undefined} />, document.body)}
    </>
  );
}

export { s as ui };
