import { entryKind } from "@/core/entryKinds/registry";
import type { Editor } from "../createEditor";
import type { ToolId } from "../store/editorStore";
import { panTool } from "./pan";
import { PLACEMENT_TOOLS, toolById } from "./registry";
import type { Tool, ToolPointer } from "./types";

const DRAW_TOOLS: readonly ToolId[] = ["pencil", "line", "rect", "filledRect"];

/**
 * Routes canvas pointer events to the right tool. Priority: floating content, panning (middle/right button,
 * Space or the Pan tool), then the active tool — or the backstitch / knot behaviour when the active entry
 * places lines or points.
 */
export class ToolManager {
  private active: Tool | null = null;
  private panning = false;
  private underlayDrag = false;
  private lastGrid: ToolPointer["grid"] | null = null;

  constructor(private ed: Editor) {}

  /** The tool that handles the next pointer event. */
  resolve(): Tool {
    const s = this.ed.state, id = s.momentaryTool ?? s.tool, e = s.doc.key[s.activeEntry];
    if (e && DRAW_TOOLS.includes(id)) {
      const placement = entryKind(e.t).placement;
      if (placement !== "cell") return PLACEMENT_TOOLS[placement];
    }
    return toolById(id);
  }

  cursor(): string {
    if (this.panning) return "grabbing";
    if (this.ed.underlay.editing && !this.ed.state.momentaryTool) return this.ed.underlay.cursorAt(this.lastGrid);
    if (this.ed.state.floating) return "move";
    return this.resolve().cursor;
  }

  down(p: ToolPointer) {
    const ed = this.ed;
    if (p.button === 2 && ed.state.overlay.chain) return this.cancel();
    if (ed.state.floating && p.button === 0) {
      if (ed.selection.floatingContains(p.cell)) ed.selection.startDrag(p.cell);
      else ed.selection.commitFloating();
      return;
    }
    if (p.button === 1 || p.button === 2 || this.resolve() === panTool) {
      this.panning = true;
      this.active = panTool;
      panTool.down(ed, p);
      return;
    }
    if (p.button !== 0) return;
    if (ed.underlay.editing) {
      ed.underlay.pointerDown(p.grid);
      this.underlayDrag = true;
      return;
    }
    if (p.alt && this.resolve().id !== "picker") {
      toolById("picker").down(ed, p);
      if (ed.state.momentaryTool === "picker") ed.momentaryPicked = true;
      return;
    }
    this.active = this.resolve();
    this.active.down(ed, p);
  }

  move(p: ToolPointer) {
    this.lastGrid = p.grid;
    if (this.underlayDrag) return this.ed.underlay.pointerMove(p.grid, p.shift);
    if (this.ed.underlay.editing && !this.active) return this.ed.setHover(p.cell, 1, false);
    const ed = this.ed, size = this.active?.usesBrush || (!this.active && this.resolve().usesBrush) ? ed.state.brush : 1;
    if (!this.active && !ed.state.floating) this.resolve().hover?.(ed, p);
    ed.setHover(p.cell, size, this.showsHoverSquare());
    if (ed.state.floating && !this.active) return ed.selection.drag(p.cell);
    this.active?.move?.(ed, p);
  }

  up(p: ToolPointer) {
    if (this.underlayDrag) {
      this.underlayDrag = false;
      this.ed.underlay.pointerUp();
    }
    const t = this.active;
    this.active = null;
    this.panning = false;
    if (this.ed.state.floating) this.ed.selection.endDrag();
    t?.up?.(this.ed, p);
  }

  leave() {
    this.ed.setHover(null, 1, false);
    this.ed.setOverlay({ hoverPoint: null, knotPreview: null, partialPreview: null, eraseHighlight: null });
  }

  /** Esc / tool switch: end chains, drop previews, close open strokes. */
  cancel() {
    this.active?.cancel?.(this.ed);
    this.active = null;
    this.panning = false;
    for (const t of [PLACEMENT_TOOLS.segment, PLACEMENT_TOOLS.point, this.resolve()]) t.cancel?.(this.ed);
  }

  private showsHoverSquare(): boolean {
    const t = this.resolve();
    const onLine = t.id === "eraser" && !!this.ed.state.overlay.eraseHighlight;
    return t.id !== "pan" && t.id !== "backstitch" && t.id !== "knot" && t.id !== "partial" && !onLine && !this.ed.state.floating;
  }
}
