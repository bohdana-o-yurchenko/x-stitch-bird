"use client";

import { useTranslations } from "next-intl";
import { HOLD_BINDINGS, shortcutLabel } from "@/editor/shortcuts/keymap";
import { resolveTool } from "@/editor/tools/registry";
import { Icon } from "../common/Icon";
import { KeyIcon, cx, ui } from "../common/widgets";
import { useCommand, useEditorState } from "../hooks/editor";
import { useEntryLabel } from "../i18n/labels";
import s from "./side.module.css";

/** Tools that put the active entry on the chart; for the others the entry is shown dimmed. */
const USES_ENTRY = new Set(["pencil", "line", "rect", "filledRect", "fill", "partial", "backstitch", "knot"]);

/** What the pointer does right now: the effective tool and options, and the active key entry. */
export function useCurrentTool() {
  const tool = useEditorState((st) => st.tool);
  const momentary = useEditorState((st) => st.momentaryTool);
  const active = useEditorState((st) => st.activeEntry);
  const doc = useEditorState((st) => st.doc);
  useEditorState((st) => st.keyRevision);
  const effective = resolveTool({ tool, momentaryTool: momentary, activeEntry: active, doc });
  return { chosen: tool, effective, momentary, active, slot: useEditorState((st) => st.palette[active]) };
}

/** "Drawing with" card at the top of the side panel (SPEC §4.4). */
export function CurrentTool() {
  const t = useTranslations("current");
  const tt = useTranslations("tools");
  const tn = useTranslations("toolNames");
  const run = useCommand();
  const label = useEntryLabel();
  const { chosen, effective, momentary, active, slot } = useCurrentTool();
  const brush = useEditorState((st) => st.brush);
  const override = useEditorState((st) => st.override);
  const mirror = useEditorState((st) => st.mirror);
  const partialKind = useEditorState((st) => st.partialKind);
  const shortcut = shortcutLabel("tool.select", chosen);
  const hold = momentary && HOLD_BINDINGS.find((h) => h.tool === momentary)?.hold;

  const notes: string[] = [];
  if (hold) notes.push(t("held", { key: hold === "Alt" ? "Alt/⌥" : t("space") }));
  if (effective.id !== (momentary ?? chosen)) notes.push(t(effective.id === "knot" ? "placesKnots" : "placesBackstitch", { tool: tn(chosen) }));
  if (effective.usesBrush) notes.push(t("brush", { n: brush }));
  if (effective.id === "partial") notes.push(tt(`partialKind.${partialKind}`));
  if (USES_ENTRY.has(effective.id) && override) notes.push(t("override"));
  if (USES_ENTRY.has(effective.id) && mirror !== "off") notes.push(tt(`mirror${mirror[0]!.toUpperCase()}${mirror.slice(1)}`));

  const entry = active ? label(active) : null;
  return (
    <section className={s.current} aria-label={t("title")} data-testid="current-tool">
      <div className={s.currentHead}>
        <span>{t("title")}</span>
        <span className={s.spacer} />
        <button type="button" className={ui.tool} title={tt("collapse")} aria-label={tt("collapse")} onClick={() => run("panel.toggle")}><Icon name="collapse" size={18} /></button>
      </div>
      <div className={s.currentRow}>
        <span className={cx(s.toolBadge, hold && s.held)}><Icon name={effective.icon} size={20} /></span>
        <div className={s.text}>
          <div className={s.title} data-testid="current-tool-name">
            {tn(effective.id)}
            {!hold && shortcut && <kbd className={s.kbd}>{shortcut}</kbd>}
          </div>
          <div className={s.sub}>{notes.join(" · ") || " "}</div>
        </div>
      </div>
      <div className={cx(s.currentRow, !USES_ENTRY.has(effective.id) && s.dim)}>
        {slot ? <KeyIcon slot={slot} size={34} /> : <span className={s.toolBadge} style={{ background: "var(--line)" }} />}
        <div className={s.text}>
          <div className={s.title}>{entry ? entry.title : t("noEntry")}</div>
          <div className={s.sub}>{entry ? entry.sub : t("noEntryHint")}</div>
        </div>
        {active > 0 && <button type="button" className={cx(ui.btn, ui.sm)} onClick={() => run("key.edit", active)}>{t("edit")}</button>}
      </div>
    </section>
  );
}
