import { createStore } from "zustand/vanilla";
import type { Fragment } from "@/core/pattern/fragment";
import type { Palette } from "@/core/pattern/palette";
import { createPattern } from "@/core/pattern/createPattern";
import type { KeyIndex, PartialKindId, PartialStitch, Pattern, Point, Rect, Segment } from "@/core/pattern/types";
import type { MirrorMode } from "@/core/transform/mirror";
import type { ChartView } from "@/render/chart";
import type { Viewport } from "@/render/ChartRenderer";
import type { RefWindowData } from "@/persistence/ports";
import type { UnderlayData } from "@/core/underlay/underlay";

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
  | { type: "versions" }
  | { type: "straighten" }
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
  /** Backstitch the eraser would delete on press (SPEC §6.2). */
  eraseHighlight: Segment[] | null;
}

export interface FloatingContent {
  fragment: Fragment;
  at: Point;
  /** A small pattern + palette for drawing the fragment while it floats. */
  preview: { pattern: Pattern; palette: Palette };
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
  flash: { cell: number; until: number } | null;

  canUndo: boolean;
  canRedo: boolean;
  savedAt: number | null;
  dialog: DialogRequest | null;
  toasts: Toast[];
  references: RefWindowData[];
  underlay: UnderlayData | null;
  underlayImage: HTMLImageElement | null;
  /** The quick-start guide is open (shown once on the first visit, then from the menu). */
  guideOpen: boolean;
  /** The floating alignment pad for the underlay is shown (opt-in, SPEC §15.15). */
  underlayPad: boolean;
  /** Fade every key entry except the active one (SPEC §15.16). */
  highlight: boolean;
  hasClipboard: boolean;
}

export const emptyOverlay: Overlay = { hover: null, preview: null, partialPreview: null, knotPreview: null, chain: null, hoverPoint: null, marquee: null, eraseHighlight: null };

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
    flash: null,
    canUndo: false,
    canRedo: false,
    savedAt: null,
    dialog: null,
    toasts: [],
    references: [],
    underlay: null,
    underlayImage: null,
    highlight: false,
    underlayPad: false,
    guideOpen: false,
    hasClipboard: false,
  }));

export type EditorStore = ReturnType<typeof createEditorStore>;
