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

/** Shown on the mini toolbar when the side panel is hidden. */
export const MINI_TOOLS = ["pencil", "eraser", "picker", "pan"] as const;

/** Behaviours picked automatically from the active entry's placement (ARCHITECTURE §7.2). */
export const PLACEMENT_TOOLS = { segment: backstitchTool, point: knotTool } as const;

export const toolById = (id: string): Tool => TOOLS.find((t) => t.id === id) ?? pencilTool;
