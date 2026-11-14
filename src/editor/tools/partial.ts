import { nearestCorner } from "@/core/stitches/partialKinds";
import type { Corner } from "@/core/pattern/types";
import { placePartial, requireEntry } from "../actions/paint";
import type { Editor } from "../createEditor";
import { inChart, type Tool, type ToolPointer } from "./types";

let lastCell = -1;
let corner: Corner = 0;

const cornerAt = (p: ToolPointer) => nearestCorner(p.grid.x - p.cell.x, p.grid.y - p.cell.y);

function crossEntry(ed: Editor) {
  const a = requireEntry(ed);
  if (a && a.e.t !== "thread") {
    ed.toast("toasts.partialNeedsCross");
    return null;
  }
  return a;
}

/**
 * Quarter / three-quarter / petite stitches (SPEC §15.13 draft): the corner nearest the pointer is used; the kind
 * comes from the toolbar (Q cycles). Dragging paints the same corner along the cells passed. No brush size.
 */
export const partialTool: Tool = {
  id: "partial",
  icon: "partial",
  labelKey: "tools.partial",
  cursor: "crosshair",
  down(ed, p) {
    const a = crossEntry(ed);
    if (!a || !inChart(ed, p.cell)) return;
    corner = cornerAt(p);
    lastCell = p.cell.y * ed.doc.w + p.cell.x;
    ed.history.begin("partial");
    placePartial(ed, p.cell, corner, a.k);
    ed.changed();
  },
  hover(ed, p) {
    const k = ed.state.activeEntry;
    if (!inChart(ed, p.cell) || ed.doc.key[k]?.t !== "thread") return ed.setOverlay({ partialPreview: null });
    ed.setOverlay({ partialPreview: { cell: p.cell.y * ed.doc.w + p.cell.x, stitch: { kind: ed.state.partialKind, corner: cornerAt(p), k } } });
  },
  move(ed, p) {
    if (!ed.history.inTransaction) return partialTool.hover!(ed, p);
    const i = p.cell.y * ed.doc.w + p.cell.x;
    if (i === lastCell || !inChart(ed, p.cell)) return;
    lastCell = i;
    placePartial(ed, p.cell, corner, ed.state.activeEntry);
    ed.changed();
  },
  up(ed) {
    lastCell = -1;
    ed.history.commit();
  },
  cancel(ed) {
    lastCell = -1;
    ed.history.commit();
    ed.setOverlay({ partialPreview: null });
  },
};
