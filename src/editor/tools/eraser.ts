import { lineCells } from "@/core/geometry/geometry";
import type { Point } from "@/core/pattern/types";
import { backstitchHitRadius, eraseAt, eraseKnotsAt, eraseSegmentsAt, knotsAt, segmentsAt } from "../actions/paint";
import type { Editor } from "../createEditor";
import type { Tool, ToolPointer } from "./types";

let last: Point | null = null;
/** What this stroke erases, chosen where it starts: a knot / bead between cells, a backstitch line, or cells. */
let mode: "knots" | "lines" | "cells" = "cells";

const radius = (ed: Editor) => backstitchHitRadius(ed.state.viewport.zoom);

/** What a press here would take, topmost first like the picker: knots and beads between cells, then lines. */
function topAt(ed: Editor, grid: Point) {
  const knots = knotsAt(ed, grid, radius(ed));
  if (knots.length) return { mode: "knots" as const, knots, segments: [] };
  const segments = segmentsAt(ed, grid, radius(ed));
  return { mode: segments.length ? ("lines" as const) : ("cells" as const), knots, segments };
}

const same = <T>(a: readonly T[] | null, b: readonly T[]) => (a ?? []).length === b.length && b.every((x, i) => x === a![i]);

/**
 * Three modes, chosen where the press starts (SPEC §6.2): on a knot or a bead between cells it deletes only those;
 * on a backstitch line only backstitch; anywhere else it clears crosses, beads, partial stitches, knots and nearby
 * backstitch. Never ambiguous marks.
 */
export const eraserTool: Tool = {
  id: "eraser",
  icon: "eraser",
  labelKey: "tools.eraser",
  cursor: "crosshair",
  usesBrush: true,
  down(ed, p) {
    ed.history.begin("erase");
    mode = topAt(ed, p.grid).mode;
    ed.setOverlay({ eraseHighlight: null, eraseKnots: null });
    if (mode === "knots") eraseKnotsAt(ed, p.grid, radius(ed));
    else if (mode === "lines") eraseSegmentsAt(ed, p.grid, radius(ed));
    else {
      eraseAt(ed, p.cell, p.grid);
      last = p.cell;
    }
    ed.changed();
  },
  hover(ed, p: ToolPointer) {
    const { knots, segments } = topAt(ed, p.grid), o = ed.state.overlay;
    if (!same(o.eraseHighlight, segments) || !same(o.eraseKnots, knots))
      ed.setOverlay({ eraseHighlight: segments.length ? segments : null, eraseKnots: knots.length ? knots : null });
  },
  move(ed, p) {
    if (!ed.history.inTransaction) return;
    if (mode === "knots") {
      if (eraseKnotsAt(ed, p.grid, radius(ed))) ed.changed();
      return;
    }
    if (mode === "lines") {
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
    mode = "cells";
    ed.history.commit();
  },
  cancel(ed) {
    last = null;
    mode = "cells";
    ed.history.commit();
    ed.setOverlay({ eraseHighlight: null, eraseKnots: null });
  },
};
