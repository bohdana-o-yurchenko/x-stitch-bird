import { lineCells } from "@/core/geometry/geometry";
import type { Point } from "@/core/pattern/types";
import { eraseAt } from "../actions/paint";
import type { Tool } from "./types";

let last: Point | null = null;

/** Erases crosses, beads, partial stitches, backstitch and knots — never ambiguous marks. */
export const eraserTool: Tool = {
  id: "eraser",
  icon: "eraser",
  labelKey: "tools.eraser",
  cursor: "crosshair",
  usesBrush: true,
  down(ed, p) {
    ed.history.begin("erase");
    eraseAt(ed, p.cell, p.grid);
    last = p.cell;
    ed.changed();
  },
  move(ed, p) {
    if (!last || !ed.history.inTransaction) return;
    const path = lineCells(last, p.cell);
    path.forEach((c, i) => eraseAt(ed, c, i === path.length - 1 ? p.grid : { x: c.x + 0.5, y: c.y + 0.5 }));
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
