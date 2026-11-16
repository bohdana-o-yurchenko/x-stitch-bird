import { createStore } from "zustand/vanilla";
import type { PkReport } from "@/core/formats/pdf/patternKeeper";
import type { Fragment } from "@/core/pattern/fragment";
import type { Palette } from "@/core/pattern/palette";
import { createPattern } from "@/core/pattern/createPattern";
import type { KeyIndex, PartialKindId, PartialStitch, Pattern, Point, Rect, Segment } from "@/core/pattern/types";
import type { MirrorMode } from "@/core/transform/mirror";
import type { ChartView } from "@/render/chart";
import type { Viewport } from "@/render/ChartRenderer";
import type { RefWindowData } from "@/persistence/ports";
import type { Handle, UnderlayData } from "@/core/underlay/underlay";
import type { ChecksState } from "../checks/checks";
import type { MatchState } from "../matching/matching";

export type ToolId = "pencil" | "line" | "rect" | "filledRect" | "fill" | "eraser" | "picker" | "pan" | "select" | "magicWand" | "partial" | "autofill";

export interface Toast {
  id: number;
  key: string;
  values?: Record<string, string | number>;
}

/** Dialogs the UI should show; the editor asks, the UI renders (ARCHITECTURE §5). */
export type DialogRequest =
  | { type: "deleteEntry"; index: KeyIndex; count: number }
  | { type: "newPattern" }
  | { type: "open" }
  | { type: "resize" }
  | { type: "versions" }
  | { type: "straighten" }
  | { type: "changelog"; since?: string | null }
  | { type: "imageImport"; image: HTMLImageElement }
  | { type: "patternInfo" }
  | { type: "goToCell" }
  | { type: "mirrorFromCentre" }
  | { type: "extendCanvas" }
  | { type: "replaceKey" }
  | { type: "dropChoice"; file: File }
  | { type: "patternKeeper"; issues: PkReport["issues"] }
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

/** The header's menus: Pattern ▾, 🖨 Print & share, ☰. */
export type HeaderMenu = "pattern" | "print" | "app";

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
  /** Saving to the saved patterns (and the account, signed in): under way, done, or the account didn't get it. */
  saveState: "saving" | "saved" | "offline" | null;
  /** Saved patterns besides the open one exist (in this browser or the account): Pattern ▸ Open is offered. */
  hasOtherPatterns: boolean;
  /** The keyboard shortcuts list, opened from ☰. */
  shortcutsOpen: boolean;
  /** Toolbar groups hidden in ☰ ▸ Toolbar (remembered in this browser; ui/header/toolbarPrefs). */
  toolbarHide: { shapes: boolean; partials: boolean };
  dialog: DialogRequest | null;
  /** The add/edit key entry form, docked in the side panel so the chart and references stay visible. */
  keyForm: { edit?: KeyIndex; seq: number } | null;
  toasts: Toast[];
  references: RefWindowData[];
  underlay: UnderlayData | null;
  underlayImage: HTMLImageElement | null;
  /** The guide holds one of the header menus open on these item ids (submenus first); null = none held. */
  menuReveal: { menu: HeaderMenu; path: string[] } | null;
  /** The tour on screen (SPEC §9.8): "intro" or a feature tip; null = none. */
  guide: string | null;
  /** A feature tip to show once nothing else is in the way (each tip appears only the first time). */
  pendingTip: string | null;
  /** The zoomed-in edit frame of the underlay, in canvas px, once the user has resized it (SPEC §15.15). */
  underlayFrame: Rect | null;
  /** The side or corner of the edit frame under the pointer (or being dragged): drawn highlighted. */
  underlayHot: Exclude<Handle, "inside"> | null;
  /** Fade every key entry except the active one (SPEC §15.16). */
  highlight: boolean;
  hasClipboard: boolean;
  /** The last run of the chart checks (SPEC §15.4); null = not run or closed. */
  checks: ChecksState | null;
  /** Symbol matching (SPEC §15.11): picking a block or reviewing its proposals; null = off. */
  match: MatchState | null;
  /** How Autofill's proposals are shown: colour + symbols, or symbols only; null = as the main view. */
  matchView: "both" | "symbols" | null;
  /** The proposals hidden for a moment (held down), to see the photo under them. */
  matchPeek: boolean;
  /** Who is signed in (SPEC §15.23); null = nobody — everything stays in this browser. */
  account: { id: string; email: string; name?: string } | null;
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
    saveState: null,
    hasOtherPatterns: false,
    shortcutsOpen: false,
    toolbarHide: { shapes: false, partials: false },
    dialog: null,
    keyForm: null,
    toasts: [],
    references: [],
    underlay: null,
    underlayImage: null,
    highlight: false,
    underlayFrame: null,
    underlayHot: null,
    guide: null,
    pendingTip: null,
    menuReveal: null,
    hasClipboard: false,
    checks: null,
    match: null,
    matchView: null,
    matchPeek: false,
    account: null,
  }));

export type EditorStore = ReturnType<typeof createEditorStore>;
