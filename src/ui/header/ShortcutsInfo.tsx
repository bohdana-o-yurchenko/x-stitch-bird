"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { HOLD_BINDINGS, shortcutLabels } from "@/editor/shortcuts/keymap";
import { TOOLS } from "@/editor/tools/registry";
import { Icon } from "../common/Icon";
import { cx, ui } from "../common/widgets";
import { useEditor, useEditorState } from "../hooks/editor";
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
        row(t("highlight"), keys("view.toggleHighlight")),
        row(t("panel"), keys("panel.toggle")),
        row(t("save"), keys("file.save")),
      ],
    },
    {
      title: t("underlay"),
      rows: [
        row(t("underlayEdit"), keys("underlay.toggleBehind")),
        row(t("nudge"), ["← → ↑ ↓", t("shiftOne", { shift: mac ? "⇧" : "Shift" })]),
        row(t("underlayUndo"), keys("underlay.undo")),
        row(t("underlayRotate"), [...keys("underlay.rotate", -1), ...keys("underlay.rotate", 1)]),
      ],
    },
  ];
}

/** ⌨ in the header, left of ☰: every keyboard shortcut in a panel under it; closes on Esc, a click outside or ⌨ again. */
export function ShortcutsPanel() {
  const t = useTranslations("shortcuts");
  const ed = useEditor();
  const open = useEditorState((st) => st.shortcutsOpen);
  const groups = useGroups();
  const button = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !button.current) return setPos(null);
    const r = button.current.getBoundingClientRect();
    setPos({ top: r.bottom + 8, right: Math.max(8, window.innerWidth - r.right - 8) });
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const close = () => ed.store.setState({ shortcutsOpen: false });
    const esc = (e: KeyboardEvent) => e.key === "Escape" && close();
    const outside = (e: PointerEvent) => !(e.target as Element).closest?.("[data-shortcuts]") && close();
    window.addEventListener("keydown", esc);
    document.addEventListener("pointerdown", outside);
    return () => {
      window.removeEventListener("keydown", esc);
      document.removeEventListener("pointerdown", outside);
    };
  }, [ed, open]);

  return (
    <>
      <button
        ref={button}
        type="button"
        className={cx(ui.tool, open && ui.on)}
        title={t("title")}
        aria-label={t("title")}
        aria-expanded={open}
        data-shortcuts
        data-guide="shortcuts"
        data-testid="shortcuts-button"
        onClick={() => ed.store.setState({ shortcutsOpen: !open })}
      >
        <Icon name="keyboard" size={18} />
      </button>
      {open &&
        pos &&
        createPortal(
          <div className={s.shortcuts} role="dialog" aria-label={t("title")} data-shortcuts data-testid="shortcuts" style={{ top: pos.top, right: pos.right }}>
            <h3>{t("title")}</h3>
            <div className={s.shortcutGroups}>
              {groups.map((g) => (
                <section key={g.title}>
                  <h4>{g.title}</h4>
                  {g.rows.map((r) => (
                    <div key={r.label} className={s.shortcutRow}>
                      <span>{r.label}</span>
                      <span className={s.keys}>{r.keys.map((k) => <kbd key={k}>{k}</kbd>)}</span>
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
