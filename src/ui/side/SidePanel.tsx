"use client";

import { useEditorState } from "../hooks/editor";
import { ChecksPanel } from "./ChecksPanel";
import { FabricPanel } from "./FabricPanel";
import { KeyPanel } from "./KeyPanel";
import { ToolBar } from "./ToolBar";
import { TotalsPanel } from "./TotalsPanel";
import { UnderlayPanel } from "./UnderlayPanel";

export function SidePanel() {
  const checksOpen = useEditorState((st) => st.checksOpen);
  return (
    <>
      <ToolBar />
      {checksOpen && <ChecksPanel />}
      <KeyPanel />
      <UnderlayPanel />
      <FabricPanel />
      <TotalsPanel />
    </>
  );
}
