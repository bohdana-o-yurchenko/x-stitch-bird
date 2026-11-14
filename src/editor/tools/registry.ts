import { backstitchTool } from "./backstitch";
import { eraserTool } from "./eraser";
import { fillTool } from "./fill";
import { knotTool } from "./knot";
import { panTool } from "./pan";
import { partialTool } from "./partial";
import { pencilTool } from "./pencil";
import { pickerTool } from "./picker";
import { magicWandTool, selectTool } from "./select";
import { filledRectTool, lineTool, rectTool } from "./shapes";
import { entryKind } from "@/core/entryKinds/registry";
import type { EditorState, ToolId } from "../store/editorStore";
import type { Tool } from "./types";

/** Toolbar order. The toolbar, mini toolbar and tooltips are generated from this list. */
export const TOOLS: readonly Tool[] = [
  pencilTool,
  lineTool,
  rectTool,
  filledRectTool,
  fillTool,
  partialTool,
  eraserTool,
  pickerTool,
  panTool,
  selectTool,
  magicWandTool,
];


/** Behaviours picked automatically from the active entry's placement (ARCHITECTURE §7.2). */
export const PLACEMENT_TOOLS = { segment: backstitchTool, point: knotTool } as const;

export const toolById = (id: string): Tool => TOOLS.find((t) => t.id === id) ?? pencilTool;

const DRAW_TOOLS: readonly ToolId[] = ["pencil", "line", "rect", "filledRect"];

/**
 * The tool that handles the next pointer event: a held tool (Space/Alt) wins over the chosen one, and the draw
 * tools place backstitch lines or knots when the active entry is one of those.
 */
export function resolveTool(s: Pick<EditorState, "tool" | "momentaryTool" | "activeEntry" | "doc">): Tool {
  const id = s.momentaryTool ?? s.tool, e = s.doc.key[s.activeEntry];
  if (e && DRAW_TOOLS.includes(id)) {
    const placement = entryKind(e.t).placement;
    if (placement !== "cell") return PLACEMENT_TOOLS[placement];
  }
  return toolById(id);
}
