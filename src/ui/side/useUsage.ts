"use client";

import { useEffect, useMemo, useState } from "react";
import { calculator } from "@/core/calculator/registry";
import { chartTotals, computeUsage } from "@/core/calculator/usage";
import { useEditor, useEditorState } from "../hooks/editor";

/** Revision that follows the document after a pause, so counting never runs on every stroke (SPEC §6.5). */
function useSettledRevision(delay = 300) {
  const rev = useEditorState((s) => s.docRevision + s.keyRevision * 1e9);
  const [settled, setSettled] = useState(rev);
  useEffect(() => {
    const t = setTimeout(() => setSettled(rev), delay);
    return () => clearTimeout(t);
  }, [rev, delay]);
  return settled;
}

export function useUsage() {
  const ed = useEditor();
  const rev = useSettledRevision();
  return useMemo(() => {
    void rev;
    const p = ed.doc, usage = computeUsage(p);
    return { usage, totals: chartTotals(p, usage), shopping: calculator().calculate({ pattern: p, usage, settings: {} }) };
  }, [ed, rev]);
}
