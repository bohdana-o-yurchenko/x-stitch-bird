import { halfPointOn, halfPointsBetween } from "@/core/geometry/geometry";
import type { Point } from "@/core/pattern/types";
import { placeKnot, requireEntry } from "../actions/paint";
import type { Tool } from "./types";

let last: Point | null = null;

/**
 * French knots on the half grid (SPEC §15.14); used when the active entry is a knot or a bead between cells. Drag
 * places one per half unit; off the chart nothing is placed.
 */
export const knotTool: Tool = {
  id: "knot",
  icon: "knot",
  labelKey: "tools.pencil",
  cursor: "crosshair",
  hoverSquare: false,
  down(ed, p) {
    const a = requireEntry(ed);
    const at = halfPointOn(p.grid, ed.doc);
    if (!a || !at) return;
    last = at;
    ed.history.begin("knot");
    placeKnot(ed, last, a.k);
    ed.changed();
  },
  hover(ed, p) {
    const at = halfPointOn(p.grid, ed.doc);
    ed.setOverlay({ knotPreview: at && { point: at, key: ed.state.activeEntry } });
  },
  move(ed, p) {
    knotTool.hover!(ed, p);
    const to = halfPointOn(p.grid, ed.doc);
    if (!last || !to || !ed.history.inTransaction) return;
    if (to.x === last.x && to.y === last.y) return;
    for (const pt of halfPointsBetween(last, to)) placeKnot(ed, pt, ed.state.activeEntry);
    last = to;
    ed.changed();
  },
  up(ed) {
    last = null;
    if (ed.history.inTransaction) ed.history.commit();
  },
  cancel(ed) {
    last = null;
    if (ed.history.inTransaction) ed.history.commit();
    ed.setOverlay({ knotPreview: null });
  },
};
