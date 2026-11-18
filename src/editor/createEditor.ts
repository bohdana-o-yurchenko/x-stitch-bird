import { parsePattern } from "@/core/formats/json/parse";
import type { QuantizeResult } from "@/core/imageToPattern/quantize";
import { formatLabel, keyLabelData, type Translate } from "@/core/labels/keyLabel";
import { buildPalette } from "@/core/pattern/palette";
import type { KeyIndex, Pattern, Point } from "@/core/pattern/types";
import { ALL_SYMBOLS, isShapeSymbol } from "@/core/symbols/symbols";
import { RULER_SIZE } from "@/render/ChartRenderer";
import { defaultCanvasTheme, type CanvasTheme } from "@/render/theme";
import { account, createPersistence, type Persistence } from "@/persistence";
import { loadImage } from "@/platform/images";
import { confirmLargePhoto } from "./images/largePhoto";
import { photoFits } from "./images/photoRoom";
import { addPdf } from "./images/pdfPages";
import { isPdf } from "@/platform/pdf";
import { bodyFontFamily, usableSymbols } from "@/platform/fontProbe";
import { chromeColours } from "@/platform/themeColours";
import { alreadyHere, createFromImage, loadFile, saveToLibrary } from "./actions/importExport";
import type { StartIntent } from "./startRequest";
import { demoPattern, loadPattern, replaceDoc } from "./actions/pattern";
import { Autosave } from "./autosave";
import { CommandRegistry } from "./commands/registry";
import { KeepPattern } from "./keepPattern";
import { LiveSync } from "./live/LiveSync";
import { ThreadInventory } from "./threads/inventory";
import { forgetAccountHere } from "./library";
import { saveOpen, saveSections, savedOpen, savedSections } from "./panelSections";
import { History } from "./history/history";
import { ImageService } from "./images/ImageService";
import { canMatch, PICKING } from "./matching/matching";
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

const mb = (bytes: number) => Math.ceil(bytes / 1048576);

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
  readonly keep: KeepPattern;
  readonly inventory: ThreadInventory;
  readonly shortcuts: ShortcutManager;
  readonly selection: SelectionService;
  readonly references: ReferenceService;
  readonly underlay: UnderlayService;
  readonly snapshots: SnapshotService;
  readonly autosave: Autosave;
  readonly images: ImageService;
  readonly timer: WorkTimer;
  readonly live: LiveSync;
  theme: CanvasTheme = defaultCanvasTheme;
  /** Translation for exported texts and labels built here; set by the UI for the current locale. */
  t: Translate = (key) => key;

  setTranslator(t: Translate) {
    this.t = t;
  }
  /** Set when the held-Alt picker picked something (SPEC §6.2). */
  momentaryPicked = false;
  private initialising: Promise<void> | null = null;
  /** Resolved once the session is known (signed in or not): an account's pattern can be asked for. */
  private accountReady: Promise<void>;
  private markAccountReady!: () => void;
  private photosFullSaid = false;

  constructor(persistence = createPersistence(), readonly isMac = false) {
    this.persistence = persistence;
    this.images = new ImageService(persistence.images);
    this.history = new History(() => this.doc, (info) => this.changed({ keys: info.keys, structural: info.structural }));
    this.viewport = new ViewportService(this.store, RULER_SIZE);
    this.tools = new ToolManager(this);
    this.commands = new CommandRegistry(this);
    this.keep = new KeepPattern(this);
    this.inventory = new ThreadInventory(this);
    this.shortcuts = new ShortcutManager(this, isMac);
    this.selection = new SelectionService(this);
    this.references = new ReferenceService(this);
    this.underlay = new UnderlayService(this);
    this.snapshots = new SnapshotService(this);
    // another window follows this one: its changes go up within seconds (SPEC §15.34)
    this.autosave = new Autosave(persistence.draft, () => this.doc, () => saveToLibrary(this, { quiet: true }), () => this.state.live.others > 0);
    this.timer = new WorkTimer(this);
    this.live = new LiveSync(this);
    this.accountReady = new Promise((done) => (this.markAccountReady = done));
  }

  get state(): EditorState {
    return this.store.getState();
  }

  get doc(): Pattern {
    return this.store.getState().doc;
  }

  /**
   * Start-up: probe symbols once fonts are ready, then open what `intent` asks for — the pattern picked, a file, or
   * the draft (else the demo) — as the first pattern shown: nothing else is shown before it (SPEC §9.2, §15.37).
   */
  init(intent: StartIntent = { kind: "resume" }): Promise<void> {
    this.initialising ??= this.boot(intent);
    return this.initialising;
  }

  /** The session known, or a while gone by (offline: it may never be). */
  private sessionKnown(): Promise<void> {
    return Promise.race([this.accountReady, new Promise<void>((done) => setTimeout(done, 8_000))]);
  }

  /** The canvas around the fabric follows the interface theme (CSS tokens); the chart itself never changes. */
  refreshChrome() {
    this.theme = withChrome(this.theme);
    this.store.setState({});
  }

  private async boot(intent: StartIntent) {
    await document.fonts?.ready;
    const family = bodyFontFamily();
    this.theme = withChrome({ ...defaultCanvasTheme, fontFamily: family });
    // vector shapes always draw; only the letters, digits and signs depend on the font
    const drawable = new Set(usableSymbols(ALL_SYMBOLS.filter((s) => !isShapeSymbol(s)), family));
    const symbols = ALL_SYMBOLS.filter((s) => isShapeSymbol(s) || drawable.has(s));
    this.store.setState({ symbols });
    let pattern: Pattern | null = null;
    const draft = await this.persistence.draft.load().catch(() => null);
    if (draft)
      try {
        pattern = parsePattern(draft, symbols).pattern;
      } catch (e) {
        console.warn(e);
      }
    // the pattern asked for, straight away: the one worked on last isn't shown first (SPEC §15.37)
    const first = await this.openFirst(intent, pattern);
    if (!first) {
      loadPattern(this, pattern ?? demoPattern(symbols));
      // a restored draft is saved to the library once it's edited; the demo only then too
      this.autosave.markSaved();
      // the draft may hold changes its saved copies don't
      if (pattern) this.live.opened(pattern.id, { unsure: true });
    }
    this.store.setState({ panelSections: savedSections(), openSection: savedOpen() });
    // what came back from an earlier visit is work if it was edited then; the demo isn't
    if (pattern) this.keep.restored();
    this.store.setState({ ready: true });
    this.live.start();
    void this.afterStart(intent, first);
    // a photo that didn't fit in the account stays here; say so once
    this.persistence.pictures?.onFull((room) => {
      if (this.photosFullSaid) return;
      this.photosFullSaid = true;
      this.toast("toasts.photosFull", { used: mb(room.used), max: mb(room.max) });
    });
    // the account's newer windows (or ones merged in from another device) replace the open pattern's on screen
    this.persistence.pictures?.onChange((id) => {
      if (id !== this.doc.id) return;
      void this.references.switchTo(id, null);
      void this.underlay.switchTo(id, null);
    });
    // pictures no record uses any more (closed windows, replaced underlays, old marks)
    setTimeout(() => void this.persistence.images.collectGarbage().catch(() => {}), 10_000);
  }

  /**
   * Opens the pattern `intent` asks for as the first one; false when it's the draft's to show (resume, the draft is
   * that pattern, a new one, a picture, or a file while signed out — replacing the draft may need asking then).
   */
  private async openFirst(intent: StartIntent, draft: Pattern | null): Promise<boolean> {
    if (intent.kind === "open" && intent.id !== draft?.id) {
      // in this browser, or — once the session is known — in the account
      let doc = await this.persistence.patterns.load(intent.id).catch(() => null);
      if (!doc) {
        await this.sessionKnown();
        doc = await this.persistence.patterns.load(intent.id).catch(() => null);
      }
      if (!doc) {
        this.toast("toasts.openFailed");
        return false;
      }
      try {
        loadPattern(this, parsePattern(doc, this.state.symbols).pattern);
        this.autosave.markSaved();
        return true;
      } catch {
        this.toast("toasts.openFailed");
        return false;
      }
    }
    if (intent.kind === "file") {
      await this.sessionKnown();
      if (!this.state.account) return false;
      // one already here: what to do with it is asked once the editor shows (afterStart)
      if (await alreadyHere(this, intent.file)) return false;
      const placeholder = this.doc.id;
      await loadFile(this, intent.file);
      return this.doc.id !== placeholder;
    }
    return false;
  }

  /** What's left of `intent` once the first pattern shows: a dialog for a new one or a picture, a file signed out or already here. */
  private async afterStart(intent: StartIntent, opened: boolean) {
    if (intent.kind === "resume" || intent.kind === "open" || opened) return;
    await this.sessionKnown();
    if (intent.kind === "new") void this.commands.run(intent.from === "pdf" ? "file.newFromPdf" : "file.new");
    else void this.commands.run(intent.kind === "image" ? "image.open" : "file.load", intent.file);
  }

  /** The same pattern as changed elsewhere, in place of this one: the view and tools stay (SPEC §15.34). */
  replaceDoc(p: Pattern) {
    replaceDoc(this, p);
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
    this.keep.changed();
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
    // the first time an entry is added: a tip on symbols and drawing your own (shown once — the guide keeps track)
    this.store.setState({ keyForm: { edit, seq: (this.state.keyForm?.seq ?? 0) + 1 }, panelCollapsed: false, ...(edit ? {} : { pendingTip: "keyEntry" }) });
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

  /** Signed in or out (the account menu tells): while signed in, saved patterns also go to the account. */
  setAccount(user: EditorState["account"]) {
    account.signedIn = !!user;
    if (!this.state.accountKnown) this.store.setState({ accountKnown: true });
    this.markAccountReady();
    if (this.state.account?.id === user?.id) return;
    this.store.setState({ account: user, saveState: null, inventory: null, ...(user ? { signInOpen: false } : {}) });
    // your own threads: the account's, and the open pattern's join them
    if (user) void this.inventory.load();
    // signed in with work open ("Sign in to keep it"): it goes to the account now
    if (user && this.state.ready && this.keep.edited) void saveToLibrary(this, { quiet: true });
    // an upload cut off last time (tab closed mid-save): the browser copy is newer, so it goes up now
    // then this browser keeps only the open pattern and the most recent few of the account's
    if (user)
      void (this.persistence.patterns.catchUp?.() ?? Promise.resolve())
        .then(() => this.persistence.patterns.trimCache?.({ keep: [this.doc.id] }))
        // the open pattern's photo windows as the account has them (another device may have added some)
        .then(() => this.persistence.pictures?.refresh(this.doc.id))
        .catch(() => {});
  }

  /**
   * Before signing out: changes reach the account, then its patterns leave this browser. When the open pattern was
   * one of them, the demo takes its place — nothing of the account stays on screen.
   */
  async prepareSignOut() {
    await this.autosave.settle();
    this.references.flush();
    this.underlay.flush();
    await this.persistence.pictures?.settle();
    const gone = await forgetAccountHere(this.persistence);
    if (!gone.includes(this.doc.id)) return;
    loadPattern(this, demoPattern(this.state.symbols));
    this.autosave.markSaved();
  }

  /**
   * Bring a side-panel section into the panel, unfolded (Pattern info, Versions, References…). One section at a time
   * (SPEC §15.32): the key keeps plenty of room — it takes the place of the one there.
   */
  showSection(id: string) {
    saveSections([id]);
    this.unfoldSection(id);
    this.store.setState({ panelSections: [id], panelCollapsed: false });
  }

  /** The bar's icon: its section in the panel (in place of the one there), or — the one shown — out. */
  toggleSection(id: string) {
    if (!this.state.panelSections.includes(id)) return this.showSection(id);
    saveSections([]);
    this.store.setState({ panelSections: [] });
    this.unfoldSection(null);
  }

  /** One section unfolded at a time; null folds them all. */
  unfoldSection(id: string | null) {
    saveOpen(id);
    this.store.setState({ openSection: id });
  }

  setTool(tool: ToolId) {
    // Autofill reads the image behind the chart
    if (tool === "autofill" && !canMatch(this)) return this.toast("toasts.matchNeedsUnderlay");
    this.tools.cancel();
    // the first time Autofill is picked, its guide (shown once — the guide keeps track)
    if (tool === "autofill" && this.state.tool !== "autofill") this.store.setState({ pendingTip: "autofill" });
    this.store.setState({ tool, match: tool === "autofill" ? (this.state.match ?? PICKING) : null, overlay: { ...this.state.overlay, preview: null, partialPreview: null, knotPreview: null, hoverPoint: null, marquee: null, eraseHighlight: null } });
  }

  setMomentaryTool(tool: ToolId) {
    this.momentaryPicked = false;
    this.store.setState({ momentaryTool: tool });
  }

  /** Releasing a held key returns to the tool underneath — or the pencil after picking while erasing/panning. */
  releaseMomentaryTool(tool: ToolId) {
    if (this.state.momentaryTool !== tool) return;
    this.store.setState({ momentaryTool: null });
    // picked a colour with the held picker from a tool that doesn't draw with it: on to drawing with it
    if (tool === "picker" && this.momentaryPicked && ["eraser", "pan", "autofill"].includes(this.state.tool)) this.setTool("pencil");
    this.momentaryPicked = false;
  }

  setActiveEntry(k: KeyIndex) {
    const valid = k && this.doc.key[k] ? k : 0;
    this.tools.cancel();
    this.store.setState({ activeEntry: valid });
    if (this.state.momentaryTool === "picker") this.momentaryPicked = true;
    else if (["eraser", "picker", "pan", "select", "magicWand", "autofill"].includes(this.state.tool)) this.setTool("pencil");
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
    // a PDF: the page picked (SPEC §15.44), the others a click away in the window (§15.41)
    if (isPdf(f)) {
      const added = await addPdf(this, f, "window");
      if (added) this.references.add({ image: added.drawn.image, name: f.name.replace(/\.[^.]+$/, ""), pdf: { source: added.source, page: added.page, pages: added.pages } });
      return;
    }
    try {
      // kept as it came, never scaled down (SPEC §15.33); a very large one after a word about freezes
      const img = await loadImage(f);
      if (!(await photoFits(this, f)) || !(await confirmLargePhoto(this, img))) return;
      const image = await this.images.put(f);
      this.references.add({ image, name: f.name.replace(/\.[^.]+$/, "") });
    } catch {
      this.toast("toasts.badImage");
    }
  }
}

export function createEditor(isMac: boolean): Editor {
  return new Editor(createPersistence(), isMac);
}
