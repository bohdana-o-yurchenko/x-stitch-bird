import type { Point } from "@/core/pattern/types";
import type { Editor } from "../createEditor";
import type { ToolId } from "../store/editorStore";

export interface ToolPointer {
  /** Screen position inside the canvas. */
  sx: number;
  sy: number;
  /** Chart position in grid units (fractional). */
  grid: Point;
  cell: Point;
  button: number;
  shift: boolean;
  alt: boolean;
}

/** A chart tool (ARCHITECTURE §6.1). Tools change the document through `editor/actions` only. */
export interface Tool {
  id: ToolId | "backstitch" | "knot" | "stamp";
  icon: string;
  /** Message key for the tooltip. */
  labelKey: string;
  cursor: string;
  /** Shows the brush-sized hover square. */
  usesBrush?: boolean;
  /** false: no hover square at all (the tool shows its own preview, or none). */
  hoverSquare?: false;
  down(ed: Editor, p: ToolPointer): void;
  move?(ed: Editor, p: ToolPointer): void;
  up?(ed: Editor, p: ToolPointer): void;
  /** Esc, tool switch or pointer cancel. */
  cancel?(ed: Editor): void;
  /** Pointer moves with no button pressed (previews). */
  hover?(ed: Editor, p: ToolPointer): void;
}

export const inChart = (ed: Editor, c: Point) => c.x >= 0 && c.y >= 0 && c.x < ed.doc.w && c.y < ed.doc.h;
