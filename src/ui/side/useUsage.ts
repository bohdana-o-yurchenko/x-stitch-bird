"use client";

import { useMemo } from "react";
import type { Pattern } from "@/core/pattern/types";
import { calculator } from "@/core/calculator/registry";
import { chartTotals, computeUsage } from "@/core/calculator/usage";
import { useEditor, useEditorState } from "../hooks/editor";

const usageOf = (p: Pattern) => {
  const usage = computeUsage(p);
  return { usage, totals: chartTotals(p, usage), shopping: calculator().calculate({ pattern: p, usage, settings: {} }) };
};

/** Usage, totals and the shopping list, worked out once editing pauses (SPEC §6.5): never on every stroke. */
export function useUsage() {
  const ed = useEditor();
  const rev = useEditorState((s) => s.settledRevision);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the pattern changes in place; the settled revision says when
  return useMemo(() => ed.derived.of(usageOf), [ed, rev]);
}
