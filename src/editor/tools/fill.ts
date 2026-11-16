import { fillAt, requireEntry } from "../actions/paint";
import { inChart, type Tool } from "./types";
import { entryPlacement } from "@/core/entryKinds/registry";

export const fillTool: Tool = {
  id: "fill",
  icon: "fill",
  labelKey: "tools.fill",
  cursor: "crosshair",
  down(ed, p) {
    const a = requireEntry(ed);
    if (!a || !inChart(ed, p.cell)) return;
    if (entryPlacement(a.e) !== "cell") return ed.toast("toasts.fillBackstitch");
    ed.history.transaction("fill", () => fillAt(ed, p.cell, a.k, a.e));
    ed.changed();
  },
};
