import { halfPointsBetween, snapHalf } from "@/core/geometry/geometry";
import type { Point } from "@/core/pattern/types";
import { placeKnot, requireEntry } from "../actions/paint";
import type { Tool } from "./types";

let last: Point | null = null;

/** French knots on the half grid (SPEC §15.14); used when the active entry is a knot. Drag places one per half unit. */
export const knotTool: Tool = {
  id: "knot",
  icon: "knot",
  labelKey: "tools.pencil",
  cursor: "crosshair",
  down(ed, p) {
    const a = requireEntry(ed);
    if (!a) return;
    last = snapHalf(p.grid, { w: ed.doc.w, h: ed.doc.h });
    ed.history.begin("knot");
    placeKnot(ed, last, a.k);
    ed.changed();
  },
  hover(ed, p) {
    ed.setOverlay({ knotPreview: { point: snapHalf(p.grid, { w: ed.doc.w, h: ed.doc.h }), key: ed.state.activeEntry } });
  },
  move(ed, p) {
    knotTool.hover!(ed, p);
    if (!last || !ed.history.inTransaction) return;
    const to = snapHalf(p.grid, { w: ed.doc.w, h: ed.doc.h });
    if (to.x === last.x && to.y === last.y) return;
    for (const pt of halfPointsBetween(last, to)) placeKnot(ed, pt, ed.state.activeEntry);
    last = to;
    ed.changed();
  },
  up(ed) {
    last = null;
    ed.history.commit();
  },
  cancel(ed) {
    last = null;
    ed.history.commit();
    ed.setOverlay({ knotPreview: null });
  },
};
