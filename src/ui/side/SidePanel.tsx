"use client";

import { KeyEntryForm } from "../dialogs/key-entry/KeyEntryForm";
import { useEditorState } from "../hooks/editor";
import { FabricPanel } from "./FabricPanel";
import { KeyPanel } from "./KeyPanel";
import { ChecksPanel } from "./ChecksPanel";
import { CurrentTool } from "./CurrentTool";
import { TotalsPanel } from "./TotalsPanel";
import { UnderlayPanel } from "./UnderlayPanel";

/** The side panel; while a key entry is added or edited, its form takes the whole panel. */
export function SidePanel() {
  const form = useEditorState((st) => st.keyForm);
  if (form) return <KeyEntryForm key={form.seq} edit={form.edit} />;
  return (
    <>
      <CurrentTool />
      <KeyPanel />
      <UnderlayPanel />
      <ChecksPanel />
      <FabricPanel />
      <TotalsPanel />
    </>
  );
}
