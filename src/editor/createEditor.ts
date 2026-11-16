import { parsePattern } from "@/core/formats/json/parse";
import type { QuantizeResult } from "@/core/imageToPattern/quantize";
import { formatLabel, keyLabelData, type Translate } from "@/core/labels/keyLabel";
import { buildPalette } from "@/core/pattern/palette";
import type { KeyIndex, Pattern, Point } from "@/core/pattern/types";
import { ALL_SYMBOLS, isShapeSymbol } from "@/core/symbols/symbols";
import { RULER_SIZE } from "@/render/ChartRenderer";
import { defaultCanvasTheme, type CanvasTheme } from "@/render/theme";
import { createPersistence, type Persistence } from "@/persistence";
import { downscaleToBlob, loadImage } from "@/platform/images";
import { bodyFontFamily, usableSymbols } from "@/platform/fontProbe";
import { chromeColours } from "@/platform/themeColours";
import { createFromImage, saveToLibrary } from "./actions/importExport";
import { demoPattern, loadPattern } from "./actions/pattern";
import { Autosave } from "./autosave";
import { CommandRegistry } from "./commands/registry";
import { History } from "./history/history";
import { ImageService } from "./images/ImageService";
import { ReferenceService } from "./references/references";
import { SelectionService } from "./selection/selection";
import { ShortcutManager } from "./shortcuts/ShortcutManager";
import { SnapshotService } from "./snapshots/SnapshotService";
import { WorkTimer } from "./timer/WorkTimer";
import { createEditorStore, type DialogRequest, type EditorState, type Overlay, type ToolId } from "./store/editorStore";
import { ToolManager } from "./tools/ToolManager";
import { UnderlayService } from "./underlay/UnderlayService";
import { ViewportService } from "./viewport/viewport";

let toastId = 0;

/** The canvas theme with the stage, rulers and accent taken from the interface theme. */
function withChrome(theme: CanvasTheme): CanvasTheme {
  const c = chromeColours();
  if (!c) return theme;
  return { ...theme, stageBackground: c.stage, accent: c.accent, rulers: { ...theme.rulers, background: c.rulerBackground, text: c.rulerText, line: c.rulerLine } };
}

/**
 * One editor instance: state store, undo history and services. React gets it through context; the canvas,
 * shortcuts and tools use it directly (ARCHITECTURE §5.1).
 */
export class Editor {
  readonly store = createEditorStore();
  readonly persistence: Persistence;
  readonly history: History;
  readonly viewport: ViewportService;
  readonly tools: ToolManager;
  readonly commands: CommandRegistry;
  readonly shortcuts: ShortcutManager;
  readonly selection: SelectionService;
  readonly references: ReferenceService;
  readonly underlay: UnderlayService;
  readonly snapshots: SnapshotService;
  readonly autosave: Autosave;
  readonly images: ImageService;
  readonly timer: WorkTimer;
  theme: CanvasTheme = defaultCanvasTheme;
  /** Translation for exported texts and labels built here; set by the UI for the current locale. */
  t: Translate = (key) => key;

  setTranslator(t: Translate) {
    this.t = t;
  }
  /** Set when the held-Alt picker picked something (SPEC §6.2). */
  momentaryPicked = false;
  private initialising: Promise<void> | null = null;

  constructor(persistence = createPersistence(), readonly isMac = false) {
    this.persistence = persistence;
    this.images = new ImageService(persistence.images);
    this.history = new History(() => this.doc, (info) => this.changed({ keys: info.keys, structural: info.structural }));
    this.viewport = new ViewportService(this.store, RULER_SIZE);
    this.tools = new ToolManager(this);
    this.commands = new CommandRegistry(this);
    this.shortcuts = new ShortcutManager(this, isMac);
    this.selection = new SelectionService(this);
    this.references = new ReferenceService(this);
    this.underlay = new UnderlayService(this);
    this.snapshots = new SnapshotService(this);
    this.autosave = new Autosave(persistence.draft, () => this.doc, () => saveToLibrary(this, { quiet: true }));
    this.timer = new WorkTimer(this);
  }

  get state(): EditorState {
    return this.store.getState();
  }

  get doc(): Pattern {
    return this.store.getState().doc;
  }

  /** Start-up: probe symbols once fonts are ready, then restore the draft or show the demo (SPEC §9.2). */
  init(): Promise<void> {
    this.initialising ??= this.boot();
    return this.initialising;
  }

  /** The canvas around the fabric follows the interface theme (CSS tokens); the chart itself never changes. */
  refreshChrome() {
    this.theme = withChrome(this.theme);
    this.store.setState({});
  }

  private async boot() {
    await document.fonts?.ready;
    const family = bodyFontFamily();
    this.theme = withChrome({ ...defaultCanvasTheme, fontFamily: family });
    // vector shapes always draw; only the letters, digits and signs depend on the font
    const drawable = new Set(usableSymbols(ALL_SYMBOLS.filter((s) => !isShapeSymbol(s)), family));
    const symbols = ALL_SYMBOLS.filter((s) => isShapeSymbol(s) || drawable.has(s));
    this.store.setState({ symbols });
    let pattern: Pattern | null = null;
    const draft = this.persistence.draft.load();
    if (draft)
      try {
        pattern = parsePattern(draft, symbols).pattern;
      } catch (e) {
        console.warn(e);
      }
    loadPattern(this, pattern ?? demoPattern(symbols));
    // a restored draft is saved to the library once it's edited; the demo only then too
    this.autosave.markSaved();
    this.store.setState({ ready: true });
    // pictures no record uses any more (closed windows, replaced underlays, old marks)
    setTimeout(() => void this.persistence.images.collectGarbage().catch(() => {}), 10_000);
  }

  /** Call after every document change. `keys`: key entries changed; `structural`: size changed. */
  changed(o: { keys?: boolean; structural?: boolean } = {}) {
    const s = this.state;
    this.store.setState({
      docRevision: s.docRevision + 1,
      ...(o.keys || o.structural ? { keyRevision: s.keyRevision + 1, palette: buildPalette(s.doc) } : {}),
      canUndo: this.history.canUndo,
      canRedo: this.history.canRedo,
    });
    if (s.activeEntry && !s.doc.key[s.activeEntry]) this.store.setState({ activeEntry: 0 });
    this.autosave.schedule();
  }

  flush() {
    // before start-up has restored the draft, the open pattern is only a blank placeholder: saving it would
    // replace the draft (closing or reloading the page while it loads)
    if (!this.state.ready) return;
    this.autosave.flush();
    this.references.flush();
    this.underlay.flush();
  }

  toast(key: string, values?: Record<string, string | number>) {
    const t = { id: ++toastId, key, values };
    this.store.setState({ toasts: [...this.state.toasts.slice(-2), t] });
    setTimeout(() => this.store.setState({ toasts: this.state.toasts.filter((x) => x.id !== t.id) }), 2600);
  }

  openDialog(d: DialogRequest) {
    this.tools.cancel();
    this.shortcuts.releaseAll();
    this.store.setState({ dialog: d });
  }

  closeDialog() {
    this.store.setState({ dialog: null });
  }

  /** Opens the key entry form in the side panel (showing the panel if it was hidden). */
  openKeyForm(edit?: KeyIndex) {
    this.tools.cancel();
    this.shortcuts.releaseAll();
    this.store.setState({ keyForm: { edit, seq: (this.state.keyForm?.seq ?? 0) + 1 }, panelCollapsed: false });
  }

  closeKeyForm() {
    this.store.setState({ keyForm: null });
  }

  setOverlay(patch: Partial<Overlay>) {
    this.store.setState({ overlay: { ...this.state.overlay, ...patch } });
  }

  setHover(cell: Point | null, size: number, showSquare: boolean) {
    const prev = this.state.hoverCell;
    if (prev?.x === cell?.x && prev?.y === cell?.y && this.state.overlay.hover?.size === size && !!this.state.overlay.hover === showSquare) return;
    this.store.setState({ hoverCell: cell, overlay: { ...this.state.overlay, hover: cell && showSquare ? { ...cell, size } : null } });
  }

  setTool(tool: ToolId) {
    this.tools.cancel();
    this.store.setState({ tool, overlay: { ...this.state.overlay, preview: null, partialPreview: null, knotPreview: null, hoverPoint: null, marquee: null, eraseHighlight: null } });
  }

  setMomentaryTool(tool: ToolId) {
    this.momentaryPicked = false;
    this.store.setState({ momentaryTool: tool });
  }

  /** Releasing a held key returns to the tool underneath — or the pencil after picking while erasing/panning. */
  releaseMomentaryTool(tool: ToolId) {
    if (this.state.momentaryTool !== tool) return;
    this.store.setState({ momentaryTool: null });
    if (tool === "picker" && this.momentaryPicked && (this.state.tool === "eraser" || this.state.tool === "pan")) this.setTool("pencil");
    this.momentaryPicked = false;
  }

  setActiveEntry(k: KeyIndex) {
    const valid = k && this.doc.key[k] ? k : 0;
    this.tools.cancel();
    this.store.setState({ activeEntry: valid });
    if (this.state.momentaryTool === "picker") this.momentaryPicked = true;
    else if (["eraser", "picker", "pan", "select", "magicWand"].includes(this.state.tool)) this.setTool("pencil");
  }

  entryLabel(k: KeyIndex): string {
    const e = this.doc.key[k];
    if (!e) return "";
    const { title, sub } = formatLabel(keyLabelData(this.doc, e), this.t);
    return `${title} — ${sub}`;
  }

  /** Esc-like reset before undo: drop floating content and open tool strokes. */
  cancelInteractions() {
    if (this.state.floating) this.selection.cancelFloating();
    this.tools.cancel();
  }

  createFromImage(result: QuantizeResult, image: HTMLImageElement, keepReference: boolean) {
    createFromImage(this, result, image, keepReference);
  }

  async addReferenceFromFile(f: File) {
    try {
      const img = await loadImage(f);
      const image = await this.images.put(await downscaleToBlob(img));
      this.references.add({ image, name: f.name.replace(/\.[^.]+$/, "") });
    } catch {
      this.toast("toasts.badImage");
    }
  }
}

export function createEditor(isMac: boolean): Editor {
  return new Editor(createPersistence(), isMac);
}
