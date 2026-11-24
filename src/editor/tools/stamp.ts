import type { Stamp } from "@/core/pattern/types";
import { placeStamp, stampPreview } from "../actions/stamps";
import { requireEntry } from "../actions/paint";
import type { Editor } from "../createEditor";
import type { Tool, ToolPointer } from "./types";
import { inChart } from "./types";

let last: Stamp | null = null;

const overlaps = (a: Stamp, b: Stamp) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

const preview = (ed: Editor, p: ToolPointer) =>
  ed.setOverlay({ linePreview: inChart(ed, p.cell) ? (() => { const lines = stampPreview(ed, p.cell, ed.state.activeEntry); return lines && { lines, key: ed.state.activeEntry }; })() : null });

/**
 * Stamps (ARCHITECTURE-REVIEW §3), used when the active entry is a backstitch placed as a stamp: the stamp's lines
 * follow the pointer; a click places one, a drag places one wherever the last one no longer covers.
 */
export const stampTool: Tool = {
  id: "stamp",
  icon: "pencil",
  labelKey: "tools.pencil",
  cursor: "crosshair",
  hoverSquare: false,
  down(ed, p) {
    const a = requireEntry(ed);
    if (!a || !inChart(ed, p.cell)) return;
    ed.history.begin("stamp");
    last = placeStamp(ed, p.cell, a.k);
    ed.changed();
  },
  hover: preview,
  move(ed, p) {
    preview(ed, p);
    if (!last || !ed.history.inTransaction || !inChart(ed, p.cell)) return;
    const k = ed.state.activeEntry, w = last.w, h = last.h;
    // the next stamp only where it won't cover the one just placed
    const next = { ...last, x: p.cell.x - Math.floor((w - 1) / 2), y: p.cell.y - Math.floor((h - 1) / 2) };
    if (overlaps(next, last)) return;
    last = placeStamp(ed, p.cell, k) ?? last;
    ed.changed();
  },
  up(ed) {
    last = null;
    if (ed.history.inTransaction) ed.history.commit();
  },
  cancel(ed) {
    last = null;
    if (ed.history.inTransaction) ed.history.commit();
    ed.setOverlay({ linePreview: null });
  },
};
