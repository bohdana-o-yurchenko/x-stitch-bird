"use client";

import { useEffect, useRef, type ReactNode } from "react";
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
import { PatternInfoPanel } from "./PatternInfoPanel";
import { TotalsPanel } from "./TotalsPanel";
import { UnderlayPanel } from "./UnderlayPanel";
import { VersionsPanel } from "./VersionsPanel";
import s from "./side.module.css";

/** The sections, in the panel's (and the bar's) order: icon, title (message key), content. */
const SECTIONS: { id: string; icon: string; title: string; panel: () => ReactNode }[] = [
  { id: "underlay", icon: "image", title: "underlay.heading", panel: () => <UnderlayPanel /> },
  { id: "checks", icon: "checks", title: "checks.heading", panel: () => <ChecksPanel /> },
  { id: "fabric", icon: "fabric", title: "fabric.heading", panel: () => <FabricPanel /> },
  { id: "materials", icon: "spool", title: "materials.heading", panel: () => <MaterialsPanel /> },
  { id: "info", icon: "info", title: "side.info", panel: () => <PatternInfoPanel /> },
  { id: "versions", icon: "history", title: "side.versions", panel: () => <VersionsPanel /> },
  { id: "totals", icon: "totals", title: "totals.heading", panel: () => <TotalsPanel /> },
];

/**
 * The side panel (SPEC §15.32): "Drawing with" and the key always; below them the sections chosen in the bar along
 * the bottom — each folds open and closed as before. An icon adds its section (open) or takes it away; which ones
 * are shown, and folded, is remembered in this browser. A section asked for elsewhere (Pattern info, Versions…)
 * comes into view open. While a key entry is added or edited, its form takes the panel.
 */
export function SidePanel() {
  const t = useTranslations();
  const ed = useEditor();
  const form = useEditorState((st) => st.keyForm);
  const shown = useEditorState((st) => st.panelSections);
  const brought = useEditorState((st) => st.sectionShown);
  const main = useRef<HTMLDivElement>(null);
  // a section just brought in: into view
  useEffect(() => {
    if (brought) requestAnimationFrame(() => main.current?.querySelector(`[data-section=${brought.id}]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
  }, [brought]);

  return (
    <div className={s.tools}>
      <div ref={main} className={s.toolMain}>
        {form ? (
          <KeyEntryForm key={form.seq} edit={form.edit} />
        ) : (
          <>
            <CurrentTool />
            <KeyPanel />
            {SECTIONS.filter((x) => shown.includes(x.id)).map((x) => (
              // brought in again while folded: it remounts, open
              <div key={brought?.id === x.id ? `${x.id}:${brought.seq}` : x.id} className={s.shownSection}>{x.panel()}</div>
            ))}
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
