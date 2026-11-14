import { pickAt } from "../actions/paint";
import type { Tool } from "./types";

export const pickerTool: Tool = {
  id: "picker",
  icon: "picker",
  labelKey: "tools.picker",
  cursor: "copy",
  down(ed, p) {
    pickAt(ed, p.grid);
  },
};
