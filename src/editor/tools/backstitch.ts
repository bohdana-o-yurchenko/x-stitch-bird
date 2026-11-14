import { snapHalf } from "@/core/geometry/geometry";
import type { Point } from "@/core/pattern/types";
import { addSegment, requireEntry } from "../actions/paint";
import type { Editor } from "../createEditor";
import type { Tool } from "./types";

let down: Point | null = null;

const snap = (ed: Editor, g: Point) => snapHalf(g, { w: ed.doc.w, h: ed.doc.h });

/**
 * Backstitch lines (SPEC §6.3), used automatically when the active entry is a backstitch. Click adds a
 * segment from the chain end; drag adds one segment; Esc, double-click or right-click ends the chain.
 */
export const backstitchTool: Tool = {
  id: "backstitch",
  icon: "line",
  labelKey: "tools.line",
  cursor: "crosshair",
  down(ed, p) {
    const a = requireEntry(ed);
    if (!a) return;
    const pt = snap(ed, p.grid), chain = ed.state.overlay.chain;
    if (chain) {
      addSegment(ed, chain.last, pt, a.k);
      ed.changed();
    }
    ed.setOverlay({ chain: { last: pt, hover: pt, key: a.k } });
    down = pt;
  },
  hover(ed, p) {
    const pt = snap(ed, p.grid), chain = ed.state.overlay.chain;
    ed.setOverlay({ hoverPoint: pt, chain: chain && { ...chain, hover: pt } });
  },
  move(ed, p) {
    backstitchTool.hover!(ed, p);
  },
  up(ed, p) {
    const pt = snap(ed, p.grid), chain = ed.state.overlay.chain;
    if (down && chain && (pt.x !== chain.last.x || pt.y !== chain.last.y)) {
      addSegment(ed, chain.last, pt, chain.key);
      ed.setOverlay({ chain: { ...chain, last: pt, hover: pt } });
      ed.changed();
    }
    down = null;
  },
  cancel(ed) {
    down = null;
    ed.setOverlay({ chain: null });
  },
};
