import { createStore } from "zustand/vanilla";
import type { Finding } from "@/core/checks/types";
import type { Fragment } from "@/core/pattern/fragment";
import type { Palette } from "@/core/pattern/palette";
import { createPattern } from "@/core/pattern/createPattern";
import type { KeyIndex, PartialKindId, PartialStitch, Pattern, Point, Rect } from "@/core/pattern/types";
import type { MirrorMode } from "@/core/transform/mirror";
import type { ChartView } from "@/render/chart";
import type { Viewport } from "@/render/ChartRenderer";
import type { RefWindowData } from "@/persistence/ports";

export type ToolId = "pencil" | "line" | "rect" | "filledRect" | "fill" | "eraser" | "picker" | "pan" | "select" | "magicWand" | "partial";

export interface Toast {
  id: number;
  key: string;
  values?: Record<string, string | number>;
}

/** Dialogs the UI should show; the editor asks, the UI renders (ARCHITECTURE §5). */
export type DialogRequest =
  | { type: "keyEntry"; edit?: KeyIndex }
  | { type: "deleteEntry"; index: KeyIndex; count: number }
  | { type: "newPattern" }
  | { type: "open" }
  | { type: "resize" }
  | { type: "saveToFile" }
  | { type: "imageImport"; image: HTMLImageElement }
  | { type: "patternInfo" }
  | { type: "goToCell" }
  | { type: "mirrorFromCentre" }
  | { type: "extendCanvas" }
  | { type: "replaceKey" }
  | { type: "dropChoice"; file: File }
  | { type: "textFallback"; ext: string; text: string };

export interface Overlay {
  hover: { x: number; y: number; size: number } | null;
  preview: { cells: number[]; key: KeyIndex } | null;
  partialPreview: { cell: number; stitch: PartialStitch } | null;
  knotPreview: { point: Point; key: KeyIndex } | null;
  chain: { last: Point; hover: Point | null; key: KeyIndex } | null;
  hoverPoint: Point | null;
  marquee: Rect | null;
}

export interface FloatingContent {
  fragment: Fragment;
  at: Point;
  /** A small pattern + palette for drawing the fragment while it floats. */
  preview: { pattern: Pattern; palette: Palette };
}

export interface ChecksState {
  findings: Finding[];
  index: number;
  ignored: Set<string>;
  enabled: Record<string, boolean>;
  options: Record<string, Record<string, number | boolean>>;
}

export interface EditorState {
  doc: Pattern;
  docRevision: number;
  keyRevision: number;
  palette: Palette;
  /** Chart symbols this device can draw. */
  symbols: string[];
  ready: boolean;

  tool: ToolId;
  momentaryTool: ToolId | null;
  activeEntry: KeyIndex;
  partialKind: PartialKindId;
  view: ChartView;
  brush: number;
  override: boolean;
  mirror: MirrorMode;
  panelCollapsed: boolean;
  viewport: Viewport;

  overlay: Overlay;
  hoverCell: Point | null;
  selection: { mask: Uint8Array; bounds: Rect } | null;
  floating: FloatingContent | null;
  checks: ChecksState | null;
  checksOpen: boolean;
  flash: { cell: number; until: number } | null;

  canUndo: boolean;
  canRedo: boolean;
  savedAt: number | null;
  dialog: DialogRequest | null;
  toasts: Toast[];
  references: RefWindowData[];
  hasClipboard: boolean;
}

export const emptyOverlay: Overlay = { hover: null, preview: null, partialPreview: null, knotPreview: null, chain: null, hoverPoint: null, marquee: null };

export const createEditorStore = () =>
  createStore<EditorState>()(() => ({
    doc: createPattern(60, 60),
    docRevision: 0,
    keyRevision: 0,
    palette: [],
    symbols: [],
    ready: false,
    tool: "pencil",
    momentaryTool: null,
    activeEntry: 0,
    partialKind: "quarter",
    view: "both",
    brush: 1,
    override: false,
    mirror: "off",
    panelCollapsed: false,
    viewport: { zoom: 12, offX: 40, offY: 40 },
    overlay: emptyOverlay,
    hoverCell: null,
    selection: null,
    floating: null,
    checks: null,
    checksOpen: false,
    flash: null,
    canUndo: false,
    canRedo: false,
    savedAt: null,
    dialog: null,
    toasts: [],
    references: [],
    hasClipboard: false,
  }));

export type EditorStore = ReturnType<typeof createEditorStore>;
