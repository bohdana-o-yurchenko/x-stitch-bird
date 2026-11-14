import type { Point } from "@/core/pattern/types";
import type { Tool } from "./types";

let start: Point | null = null;
let add = false;
let moving = false;

const rectOf = (a: Point, b: Point) => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x) + 1, h: Math.abs(a.y - b.y) + 1 });

/** Marquee selection (SPEC §15.6). Drag inside the selection to move it; Shift adds; a plain click deselects. */
export const selectTool: Tool = {
  id: "select",
  icon: "select",
  labelKey: "tools.select",
  cursor: "crosshair",
  down(ed, p) {
    if (!p.shift && ed.selection.contains(p.cell) && ed.selection.lift()) {
      moving = true;
      ed.selection.startDrag(p.cell);
      return;
    }
    start = p.cell;
    add = p.shift;
    ed.setOverlay({ marquee: rectOf(p.cell, p.cell) });
  },
  move(ed, p) {
    if (moving) return ed.selection.drag(p.cell);
    if (start) ed.setOverlay({ marquee: rectOf(start, p.cell) });
  },
  up(ed, p) {
    if (moving) {
      moving = false;
      ed.selection.endDrag();
      return;
    }
    if (!start) return;
    const click = start.x === p.cell.x && start.y === p.cell.y && !add;
    if (click) ed.selection.none();
    else ed.selection.selectRect(rectOf(start, p.cell), add);
    start = null;
    ed.setOverlay({ marquee: null });
  },
  cancel(ed) {
    start = null;
    moving = false;
    ed.setOverlay({ marquee: null });
  },
};

export const magicWandTool: Tool = {
  id: "magicWand",
  icon: "wand",
  labelKey: "tools.magicWand",
  cursor: "crosshair",
  down(ed, p) {
    if (p.cell.x < 0 || p.cell.y < 0 || p.cell.x >= ed.doc.w || p.cell.y >= ed.doc.h) return;
    ed.selection.selectSame(p.cell, p.shift, false);
  },
};
