"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "../common/Icon";
import { cx } from "../common/widgets";
import { KeyEntryForm } from "../dialogs/key-entry/KeyEntryForm";
import { useEditorState } from "../hooks/editor";
import { ChecksPanel } from "./ChecksPanel";
import { CurrentTool } from "./CurrentTool";
import { FabricPanel } from "./FabricPanel";
import { KeyPanel } from "./KeyPanel";
import { MaterialsPanel } from "./MaterialsPanel";
import { InToolPane } from "./Section";
import { TotalsPanel } from "./TotalsPanel";
import { UnderlayPanel } from "./UnderlayPanel";
import s from "./side.module.css";

type ToolId = "totals" | "checks" | "fabric" | "materials" | "underlay";

/** The tool windows, in the strip's order: icon, title (its message key), content. */
const TOOLS: { id: ToolId; icon: string; title: [string, string]; panel: () => ReactNode }[] = [
  { id: "totals", icon: "totals", title: ["totals", "heading"], panel: () => <TotalsPanel /> },
  { id: "checks", icon: "checks", title: ["checks", "heading"], panel: () => <ChecksPanel /> },
  { id: "fabric", icon: "fabric", title: ["fabric", "heading"], panel: () => <FabricPanel /> },
  { id: "materials", icon: "spool", title: ["materials", "heading"], panel: () => <MaterialsPanel /> },
  { id: "underlay", icon: "image", title: ["underlay", "heading"], panel: () => <UnderlayPanel /> },
];

const OPEN_KEY = "stitchwork.tool";

function savedTool(): ToolId | null {
  try {
    const v = localStorage.getItem(OPEN_KEY);
    return v === "none" ? null : ((v as ToolId | null) ?? "totals");
  } catch {
    return "totals";
  }
}

/**
 * The side panel (SPEC §15.32), like an IDE's tool windows: the key always, and one tool at a time below it, picked
 * from the thin bar of icons along the bottom (again to close). Which one is open is remembered in this browser. While a key
 * entry is added or edited, its form takes the whole panel.
 */
export function SidePanel() {
  const form = useEditorState((st) => st.keyForm);
  const hasUnderlay = useEditorState((st) => !!st.underlay);
  const [open, setOpen] = useState<ToolId | null>(savedTool);
  const t = useTranslations();
  const choose = (id: ToolId | null) => {
    setOpen(id);
    try {
      localStorage.setItem(OPEN_KEY, id ?? "none");
    } catch {
      // private mode: not remembered
    }
  };
  // a picture just put behind the chart: its tool opens, it has the controls
  const had = useRef(hasUnderlay);
  useEffect(() => {
    if (hasUnderlay && !had.current) setOpen("underlay");
    had.current = hasUnderlay;
  }, [hasUnderlay]);

  const tools = TOOLS.filter((x) => x.id !== "underlay" || hasUnderlay);
  const shown = tools.find((x) => x.id === open) ?? null;
  const title = (x: (typeof TOOLS)[number]) => t(`${x.title[0]}.${x.title[1]}`);
  return (
    <div className={s.tools}>
      <div className={s.toolMain}>
        {form ? (
          <KeyEntryForm key={form.seq} edit={form.edit} />
        ) : (
          <>
            <CurrentTool />
            <KeyPanel />
            {shown && (
              <section className={s.pane} aria-label={title(shown)} data-testid={`tool-${shown.id}`}>
                <header className={s.paneHead}>
                  <h3>{title(shown)}</h3>
                  <button type="button" className={s.paneClose} aria-label={t("side.closeTool", { tool: title(shown) })} title={t("side.closeTool", { tool: title(shown) })} onClick={() => choose(null)}>
                    ✕
                  </button>
                </header>
                <div className={s.paneBody}>
                  <InToolPane.Provider value>{shown.panel()}</InToolPane.Provider>
                </div>
              </section>
            )}
          </>
        )}
      </div>
      <nav className={s.rail} aria-label={t("side.tools")}>
        {tools.map((x) => (
          <button
            key={x.id}
            type="button"
            className={cx(s.railBtn, open === x.id && s.on)}
            title={title(x)}
            aria-label={title(x)}
            aria-pressed={open === x.id}
            disabled={!!form}
            data-testid={`rail-${x.id}`}
            onClick={() => choose(open === x.id ? null : x.id)}
          >
            <Icon name={x.icon} size={18} />
          </button>
        ))}
      </nav>
    </div>
  );
}
