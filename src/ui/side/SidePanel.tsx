"use client";

import { FabricPanel } from "./FabricPanel";
import { KeyPanel } from "./KeyPanel";
import { ToolBar } from "./ToolBar";
import { TotalsPanel } from "./TotalsPanel";
import { UnderlayPanel } from "./UnderlayPanel";

export function SidePanel() {
  return (
    <>
      <ToolBar />
      <KeyPanel />
      <UnderlayPanel />
      <FabricPanel />
      <TotalsPanel />
    </>
  );
}
