import { lineCells } from "@/core/geometry/geometry";
import type { Point } from "@/core/pattern/types";
import { backstitchHitRadius, eraseAt, eraseSegmentsAt, segmentsAt } from "../actions/paint";
import type { Editor } from "../createEditor";
import type { Tool, ToolPointer } from "./types";

let last: Point | null = null;
let backOnly = false;

const radius = (ed: Editor) => backstitchHitRadius(ed.state.viewport.zoom);

/**
 * Two modes, chosen where the press starts (SPEC §6.2): on a backstitch line it deletes only backstitch;
 * anywhere else it clears crosses, beads, partial stitches, knots and nearby backstitch. Never ambiguous marks.
 */
export const eraserTool: Tool = {
  id: "eraser",
  icon: "eraser",
  labelKey: "tools.eraser",
  cursor: "crosshair",
  usesBrush: true,
  down(ed, p) {
    ed.history.begin("erase");
    backOnly = segmentsAt(ed, p.grid, radius(ed)).length > 0;
    ed.setOverlay({ eraseHighlight: null });
    if (backOnly) eraseSegmentsAt(ed, p.grid, radius(ed));
    else {
      eraseAt(ed, p.cell, p.grid);
      last = p.cell;
    }
    ed.changed();
  },
  hover(ed, p: ToolPointer) {
    const hit = segmentsAt(ed, p.grid, radius(ed)), cur = ed.state.overlay.eraseHighlight ?? [];
    if (hit.length !== cur.length || hit.some((s, i) => s !== cur[i])) ed.setOverlay({ eraseHighlight: hit.length ? hit : null });
  },
  move(ed, p) {
    if (!ed.history.inTransaction) return;
    if (backOnly) {
      if (eraseSegmentsAt(ed, p.grid, radius(ed))) ed.changed();
      return;
    }
    if (!last) return;
    const path = lineCells(last, p.cell);
    path.forEach((c, i) => eraseAt(ed, c, i === path.length - 1 ? p.grid : { x: c.x + 0.5, y: c.y + 0.5 }));
    last = p.cell;
    ed.changed();
  },
  up(ed) {
    last = null;
    backOnly = false;
    ed.history.commit();
  },
  cancel(ed) {
    last = null;
    backOnly = false;
    ed.history.commit();
    ed.setOverlay({ eraseHighlight: null });
  },
};
