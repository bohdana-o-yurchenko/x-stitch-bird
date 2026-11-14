import { lineCells } from "@/core/geometry/geometry";
import { brushAt, paintCells, requireEntry } from "../actions/paint";
import type { Tool } from "./types";

let last: { x: number; y: number } | null = null;

export const pencilTool: Tool = {
  id: "pencil",
  icon: "pencil",
  labelKey: "tools.pencil",
  cursor: "crosshair",
  usesBrush: true,
  down(ed, p) {
    const a = requireEntry(ed);
    if (!a) return;
    ed.history.begin("draw");
    paintCells(ed, brushAt(ed, p.cell), a.k);
    last = p.cell;
    ed.changed();
  },
  move(ed, p) {
    if (!last || !ed.history.inTransaction) return;
    const k = ed.state.activeEntry;
    for (const c of lineCells(last, p.cell)) paintCells(ed, brushAt(ed, c), k);
    last = p.cell;
    ed.changed();
  },
  up(ed) {
    last = null;
    ed.history.commit();
  },
  cancel(ed) {
    last = null;
    ed.history.commit();
  },
};
