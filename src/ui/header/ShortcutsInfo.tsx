"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { HOLD_BINDINGS, shortcutLabels } from "@/editor/shortcuts/keymap";
import { TOOLS } from "@/editor/tools/registry";
import { useEditor } from "../hooks/editor";
import s from "./header.module.css";

type Row = { label: string; keys: string[] };

/** Rows come from the keymap, so the list can't drift from what the keys really do. */
function useGroups(): { title: string; rows: Row[] }[] {
  const t = useTranslations("shortcuts");
  const tn = useTranslations("toolNames");
  const mac = useEditor().isMac;
  const keys = (command: string, args?: unknown) => shortcutLabels(command, args, mac);
  const held = (tool: string) => HOLD_BINDINGS.filter((h) => h.tool === tool).map((h) => t("hold", { key: h.hold === "Alt" ? (mac ? "⌥" : "Alt") : t("space") }));
  const row = (label: string, k: string[]): Row => ({ label, keys: k });
  return [
    {
      title: t("tools"),
      rows: [
        ...TOOLS.map((tl) => row(tn(tl.id), [...keys("tool.select", tl.id), ...(tl.id === "partial" ? keys("draw.cyclePartialKind") : []), ...held(tl.id)])),
      ].filter((r) => r.keys.length),
    },
    {
      title: t("drawing"),
      rows: [
        row(t("override"), keys("draw.toggleOverride")),
        row(t("mirror"), keys("draw.cycleMirror")),
        row(t("pickEntry"), ["1–9"]),
        row(t("endLine"), keys("tool.cancel")),
        row(t("ambiguous"), keys("ambiguous.toggleAtHover")),
        row(t("ambiguousNext"), keys("ambiguous.next")),
      ],
    },
    {
      title: t("edit"),
      rows: [
        row(t("undo"), keys("history.undo")),
        row(t("redo"), keys("history.redo")),
        row(t("copyCutPaste"), [...keys("clipboard.copy"), ...keys("clipboard.cut"), ...keys("clipboard.paste")]),
        row(t("selectAll"), keys("selection.all")),
        row(t("deselect"), keys("selection.none")),
        row(t("deleteSelection"), keys("selection.clear")),
        row(t("nudge"), ["← → ↑ ↓", t("shiftTen", { shift: mac ? "⇧" : "Shift" })]),
        row(t("place"), keys("floating.commit")),
      ],
    },
    {
      title: t("view"),
      rows: [
        row(t("zoom"), [...keys("view.zoomIn"), ...keys("view.zoomOut")]),
        row(t("fit"), keys("view.fit")),
        row(t("goToCell"), keys("view.goToCell")),
        row(t("panel"), keys("panel.toggle")),
        row(t("save"), keys("file.save")),
      ],
    },
    {
      title: t("underlay"),
      rows: [
        row(t("underlayEdit"), keys("underlay.toggleBehind")),
        row(t("nudge"), ["← → ↑ ↓", t("shiftOne", { shift: mac ? "⇧" : "Shift" })]),
      ],
    },
  ];
}

/** The "i" button: hover (or click) shows every keyboard shortcut. */
export function ShortcutsInfo() {
  const t = useTranslations("shortcuts");
  const groups = useGroups();
  const button = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const [pinned, setPinned] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const open = () => {
    clearTimeout(closeTimer.current);
    const r = button.current!.getBoundingClientRect();
    setPos({ top: r.bottom + 8, right: Math.max(8, window.innerWidth - r.right - 280) });
  };
  const close = () => {
    setPos(null);
    setPinned(false);
  };
  const leave = () => {
    if (!pinned) closeTimer.current = setTimeout(close, 200);
  };

  useEffect(() => {
    if (!pos) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && close();
    const outside = (e: PointerEvent) => !(e.target as Element).closest?.("[data-shortcuts]") && close();
    window.addEventListener("keydown", esc);
    document.addEventListener("pointerdown", outside);
    return () => {
      window.removeEventListener("keydown", esc);
      document.removeEventListener("pointerdown", outside);
    };
  }, [pos]);

  return (
    <>
      <button
        ref={button}
        type="button"
        className={s.info}
        aria-label={t("title")}
        aria-expanded={!!pos}
        data-shortcuts
        onPointerEnter={open}
        onPointerLeave={leave}
        onFocus={open}
        onBlur={leave}
        onClick={() => (pinned ? close() : (open(), setPinned(true)))}
      >
        i
      </button>
      {pos &&
        createPortal(
          <div className={s.shortcuts} role="dialog" aria-label={t("title")} data-shortcuts data-testid="shortcuts" style={{ top: pos.top, right: pos.right }} onPointerEnter={open} onPointerLeave={leave}>
            <h3>{t("title")}</h3>
            <div className={s.shortcutGroups}>
              {groups.map((g) => (
                <section key={g.title}>
                  <h4>{g.title}</h4>
                  {g.rows.map((r) => (
                    <div key={r.label} className={s.shortcutRow}>
                      <span>{r.label}</span>
                      <span>{r.keys.map((k) => <kbd key={k}>{k}</kbd>)}</span>
                    </div>
                  ))}
                </section>
              ))}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
