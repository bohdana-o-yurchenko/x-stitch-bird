import { lineCells, rectCells } from "@/core/geometry/geometry";
import { isOccupied } from "@/core/pattern/occupancy";
import type { Point } from "@/core/pattern/types";
import { paintCells, requireEntry } from "../actions/paint";
import type { Editor } from "../createEditor";
import type { Tool } from "./types";

type Shape = "line" | "rect" | "filledRect";
let start: Point | null = null;

const shapeCells = (shape: Shape, a: Point, b: Point) => (shape === "line" ? lineCells(a, b) : rectCells(a, b, shape === "filledRect"));

function preview(ed: Editor, shape: Shape, to: Point) {
  if (!start) return;
  const p = ed.doc, k = ed.state.activeEntry, e = p.key[k];
  const cells = shapeCells(shape, start, to)
    .filter((c) => c.x >= 0 && c.y >= 0 && c.x < p.w && c.y < p.h)
    .map((c) => c.y * p.w + c.x)
    .filter((i) => e && (ed.state.override || !isOccupied(p, i, e)));
  ed.setOverlay({ preview: { cells, key: k } });
}

/** Drag a line or rectangle; it is painted on release (SPEC §6.2). */
function shapeTool(shape: Shape, icon: string, labelKey: string): Tool {
  return {
    id: shape,
    icon,
    labelKey,
    cursor: "crosshair",
    down(ed, p) {
      if (!requireEntry(ed)) return;
      start = p.cell;
      preview(ed, shape, p.cell);
    },
    move(ed, p) {
      preview(ed, shape, p.cell);
    },
    up(ed, p) {
      if (!start) return;
      const cells = shapeCells(shape, start, p.cell).filter((c) => c.x >= 0 && c.y >= 0 && c.x < ed.doc.w && c.y < ed.doc.h);
      start = null;
      ed.setOverlay({ preview: null });
      ed.history.transaction(shape, () => paintCells(ed, cells, ed.state.activeEntry));
      ed.changed();
    },
    cancel(ed) {
      start = null;
      ed.setOverlay({ preview: null });
    },
  };
}

export const lineTool = shapeTool("line", "line", "tools.line");
export const rectTool = shapeTool("rect", "rect", "tools.rect");
export const filledRectTool = shapeTool("filledRect", "filledRect", "tools.filledRect");
