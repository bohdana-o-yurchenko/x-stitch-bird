import type { Tool } from "./types";

let from: { sx: number; sy: number; offX: number; offY: number } | null = null;

export const panTool: Tool = {
  id: "pan",
  icon: "pan",
  labelKey: "tools.pan",
  cursor: "grab",
  down(ed, p) {
    const v = ed.state.viewport;
    from = { sx: p.sx, sy: p.sy, offX: v.offX, offY: v.offY };
  },
  move(ed, p) {
    if (from) ed.viewport.setOffset(from.offX + p.sx - from.sx, from.offY + p.sy - from.sy);
  },
  up() {
    from = null;
  },
  cancel() {
    from = null;
  },
};
