"use client";

import { useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "../common/Icon";
import { cx } from "../common/widgets";
import { KeyEntryForm } from "../dialogs/key-entry/KeyEntryForm";
import { useEditor, useEditorState } from "../hooks/editor";
import { ChecksPanel } from "./ChecksPanel";
import { CurrentTool } from "./CurrentTool";
import { FabricPanel } from "./FabricPanel";
import { KeyPanel } from "./KeyPanel";
import { MaterialsPanel } from "./MaterialsPanel";
import { SECTION_HEIGHT, saveHeight, savedHeight } from "@/editor/panelSections";
import { InSidePanel } from "./Section";
import { PatternInfoPanel } from "./PatternInfoPanel";
import { TotalsPanel } from "./TotalsPanel";
import { ReferencesPanel } from "./ReferencesPanel";
import { VersionsPanel } from "./VersionsPanel";
import s from "./side.module.css";

/** The sections, in the panel's (and the bar's) order: icon, title (message key), content. */
const SECTIONS: { id: string; icon: string; title: string; panel: () => ReactNode }[] = [
  { id: "references", icon: "image", title: "references.heading", panel: () => <ReferencesPanel /> },
  { id: "checks", icon: "checks", title: "checks.heading", panel: () => <ChecksPanel /> },
  { id: "fabric", icon: "fabric", title: "fabric.heading", panel: () => <FabricPanel /> },
  { id: "materials", icon: "spool", title: "materials.heading", panel: () => <MaterialsPanel /> },
  { id: "info", icon: "info", title: "side.info", panel: () => <PatternInfoPanel /> },
  { id: "versions", icon: "history", title: "side.versions", panel: () => <VersionsPanel /> },
  { id: "totals", icon: "totals", title: "totals.heading", panel: () => <TotalsPanel /> },
];

/**
 * The side panel (SPEC §15.32): "Drawing with" and the key, then the sections chosen in the bar along the bottom —
 * their headers in a row, one unfolded at a time, at a height set with the handle above them (its content scrolls
 * inside). The key list takes the rest. Which ones are shown, which is unfolded and its height are remembered in
 * this browser. While a key entry is added or edited, its form takes the panel.
 */
export function SidePanel() {
  const t = useTranslations();
  const ed = useEditor();
  const form = useEditorState((st) => st.keyForm);
  const shown = useEditorState((st) => st.panelSections);
  const open = useEditorState((st) => st.openSection);
  const [height, setHeight] = useState(savedHeight);
  const main = useRef<HTMLDivElement>(null);
  const sections = SECTIONS.filter((x) => shown.includes(x.id));
  const unfolded = sections.find((x) => x.id === open) ?? null;

  // the handle: drag up for a taller section, down for a longer key list; double-click puts it back
  const drag = (e: React.PointerEvent) => {
    e.preventDefault();
    const startY = e.clientY, start = height, box = main.current!.getBoundingClientRect();
    const max = Math.max(160, box.height - 240);
    let last = start;
    const move = (ev: PointerEvent) => {
      last = Math.max(120, Math.min(max, start + (startY - ev.clientY)));
      setHeight(last);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      saveHeight(last);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  const reset = () => {
    setHeight(SECTION_HEIGHT);
    saveHeight(SECTION_HEIGHT);
  };

  return (
    <div className={s.tools}>
      <div ref={main} className={s.toolMain}>
        {form ? (
          <KeyEntryForm key={form.seq} edit={form.edit} />
        ) : (
          <>
            <CurrentTool />
            <KeyPanel />
            {unfolded && <div className={s.sectionHandle} role="separator" aria-orientation="horizontal" title={t("side.resize")} data-testid="section-resizer" onPointerDown={drag} onDoubleClick={reset} />}
            {sections.length > 0 && (
              <div className={s.sectionStack}>
                {sections.map((x) => {
                  const isOpen = x.id === unfolded?.id;
                  return (
                    <div key={x.id} className={s.stackItem}>
                      <button type="button" className={cx(s.stackHead, isOpen && s.open)} aria-expanded={isOpen} data-testid={`section-${x.id}`} onClick={() => ed.unfoldSection(isOpen ? null : x.id)}>
                        <span className={s.chev} aria-hidden />
                        <span>{t(x.title)}</span>
                      </button>
                      {isOpen && (
                        <div className={s.stackBody} style={{ height }}>
                          <InSidePanel.Provider value>{x.panel()}</InSidePanel.Provider>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
      <nav className={s.rail} aria-label={t("side.tools")}>
        {SECTIONS.map((x) => (
          <button
            key={x.id}
            type="button"
            className={cx(s.railBtn, shown.includes(x.id) && s.on)}
            title={t(x.title)}
            aria-label={t(x.title)}
            aria-pressed={shown.includes(x.id)}
            disabled={!!form}
            data-testid={`rail-${x.id}`}
            data-guide={`side-${x.id}`}
            onClick={() => ed.toggleSection(x.id)}
          >
            <Icon name={x.icon} size={18} />
          </button>
        ))}
      </nav>
    </div>
  );
}
