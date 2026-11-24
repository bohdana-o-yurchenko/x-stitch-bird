import { nearestCorner } from "@/core/stitches/partialKinds";
import type { Corner, Point } from "@/core/pattern/types";
import { placePartial, requireEntry } from "../actions/paint";
import type { Editor } from "../createEditor";
import { inChart, type Tool, type ToolPointer } from "./types";

let lastCell = -1;
let corner: Corner = 0;
let lastPetiteGrid: Point | null = null;
const petiteVisited = new Set<number>();

const cornerAt = (p: ToolPointer) => nearestCorner(p.grid.x - p.cell.x, p.grid.y - p.cell.y);

function paintPetiteStroke(ed: Editor, from: Point, to: Point, k: number): boolean {
  const dx = to.x - from.x, dy = to.y - from.y;
  const steps = Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) * 4);
  let painted = false;
  for (let step = 1; step <= steps; step++) {
    const x = from.x + dx * step / steps, gridY = from.y + dy * step / steps;
    const cell = { x: Math.floor(x), y: Math.floor(gridY) };
    if (!inChart(ed, cell)) continue;
    const c = nearestCorner(x - cell.x, gridY - cell.y);
    const i = cell.y * ed.doc.w + cell.x, visit = i * 4 + c;
    if (petiteVisited.has(visit)) continue;
    petiteVisited.add(visit);
    placePartial(ed, cell, c, k);
    painted = true;
  }
  return painted;
}

function crossEntry(ed: Editor) {
  const a = requireEntry(ed);
  if (a && a.e.t !== "thread") {
    ed.toast("toasts.partialNeedsCross");
    return null;
  }
  return a;
}

/**
 * Quarter / three-quarter / petite stitches (SPEC §15.13 draft): quarter and three-quarter keep the corner nearest
 * pointer-down; petite follows each half-cell quadrant crossed. The kind comes from the toolbar (Q cycles).
 */
export const partialTool: Tool = {
  id: "partial",
  icon: "partial",
  labelKey: "tools.partial",
  cursor: "crosshair",
  hoverSquare: false,
  down(ed, p) {
    const a = crossEntry(ed);
    if (!a || !inChart(ed, p.cell)) return;
    corner = cornerAt(p);
    lastCell = p.cell.y * ed.doc.w + p.cell.x;
    lastPetiteGrid = ed.state.partialKind === "petite" ? { ...p.grid } : null;
    petiteVisited.clear();
    if (lastPetiteGrid) petiteVisited.add(lastCell * 4 + corner);
    ed.history.begin("partial");
    placePartial(ed, p.cell, corner, a.k);
    ed.changed();
  },
  hover(ed, p) {
    const k = ed.state.activeEntry;
    if (!inChart(ed, p.cell) || ed.doc.key[k]?.t !== "thread") return ed.setOverlay({ partialPreview: null });
    ed.setOverlay({ partialPreview: { cell: p.cell.y * ed.doc.w + p.cell.x, stitch: { kind: ed.state.partialKind, corner: cornerAt(p), k } } });
  },
  move(ed, p) {
    if (!ed.history.inTransaction) return partialTool.hover!(ed, p);
    if (lastPetiteGrid) {
      if (paintPetiteStroke(ed, lastPetiteGrid, p.grid, ed.state.activeEntry)) ed.changed();
      lastPetiteGrid = { ...p.grid };
      return;
    }
    const i = p.cell.y * ed.doc.w + p.cell.x;
    if (i === lastCell || !inChart(ed, p.cell)) return;
    lastCell = i;
    placePartial(ed, p.cell, corner, ed.state.activeEntry);
    ed.changed();
  },
  up(ed) {
    lastCell = -1;
    lastPetiteGrid = null;
    petiteVisited.clear();
    ed.history.commit();
  },
  cancel(ed) {
    lastCell = -1;
    lastPetiteGrid = null;
    petiteVisited.clear();
    ed.history.commit();
    ed.setOverlay({ partialPreview: null });
  },
};
