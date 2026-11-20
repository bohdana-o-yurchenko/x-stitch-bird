import { pickAt, pickerHit } from "../actions/paint";
import type { Tool } from "./types";

export const pickerTool: Tool = {
  id: "picker",
  icon: "picker",
  labelKey: "tools.picker",
  cursor: "copy",
  down(ed, p) {
    pickAt(ed, p.grid);
  },
  hover(ed, p) {
    const hit = pickerHit(ed, p.grid);
    const next = hit?.kind === "stitch" ? null : hit;
    const previous = ed.state.overlay.pickerHighlight;
    if (previous?.kind === next?.kind && previous?.key === next?.key &&
      (previous?.kind === "segment" && next?.kind === "segment" && previous.segment === next.segment ||
        previous?.kind === "knot" && next?.kind === "knot" && previous.point === next.point ||
        previous?.kind === "bead" && next?.kind === "bead" && previous.cell === next.cell ||
        previous?.kind === "partial" && next?.kind === "partial" && previous.cell === next.cell && previous.stitch === next.stitch ||
        !previous && !next)) return;
    ed.setOverlay({ pickerHighlight: next });
  },
};
