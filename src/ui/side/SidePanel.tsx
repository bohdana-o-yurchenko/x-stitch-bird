"use client";

import { FabricPanel } from "./FabricPanel";
import { KeyPanel } from "./KeyPanel";
import { CurrentTool } from "./CurrentTool";
import { TotalsPanel } from "./TotalsPanel";
import { UnderlayPanel } from "./UnderlayPanel";

export function SidePanel() {
  return (
    <>
      <CurrentTool />
      <KeyPanel />
      <UnderlayPanel />
      <FabricPanel />
      <TotalsPanel />
    </>
  );
}
