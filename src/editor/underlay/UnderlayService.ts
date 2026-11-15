import type { Point, Rect } from "@/core/pattern/types";
import { defaultCorners, dragUnderlay, fitToChart, frameHandleAt, frameNeeded, gridToImage, handleAt, imageToGrid, newUnderlay, pinImagePoint, resetCrop, resizeRect, rotateUnderlay, ROTATION_STEP, straightenedSize, toLocal, turnedBounds, type Handle, type Straighten, type UnderlayData } from "@/core/underlay/underlay";
import { downscaleToBlob, loadImage } from "@/platform/images";
import { RULER_SIZE } from "@/render/ChartRenderer";
import { runStraighten } from "../heavy";
import type { Editor } from "../createEditor";

const SAVE_DELAY = 700;
/** Photos larger than this (longer side, px) are scaled down once when added; others are stored untouched. */
const MAX_SIDE = 6000;
/** Grab distance for handles, in screen pixels. */
const GRAB_PX = 8;
/** The zoomed-in edit frame: starting size and smallest size, in screen pixels. */
const FRAME = { w: 320, h: 220 }, FRAME_MIN = 40;
/** Rotate buttons: distance above the edge and between the two (screen px); their size is the theme's. */
const ROT_GAP = 26, ROT_SPREAD = 16;

export interface RotateButton {
  x: number;
  y: number;
  dir: -1 | 1;
  /** The grid point the image turns around. */
  pivot: Point;
}
const UNDO_LIMIT = 50;

const CURSORS: Record<Handle, string> = { nw: "nwse-resize", se: "nwse-resize", ne: "nesw-resize", sw: "nesw-resize", n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize", inside: "move" };

/**
 * The reference image on the chart canvas (SPEC §15.15). Edit mode routes the pointer here; behind mode leaves
 * the chart tools alone. Saved per pattern like reference windows — never while a pattern's underlay is loading.
 */
export class UnderlayService {
  private patternId: string | null = null;
  private ready = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private dirty = false;
  private drag: { handle: Handle; from: Point; start: UnderlayData } | null = null;
  private frameDrag: { handle: Exclude<Handle, "inside">; from: Point; frame: Rect; start: UnderlayData } | null = null;
  private undoStack: UnderlayData[] = [];

  constructor(private ed: Editor) {}

  get data(): UnderlayData | null {
    return this.ed.state.underlay;
  }

  /** Edit mode is on: the pointer edits the image instead of the chart. */
  get editing(): boolean {
    const u = this.data;
    return !!u && u.visible && !u.behind;
  }

  private set(u: UnderlayData | null, save = true) {
    this.ed.store.setState({ underlay: u });
    if (save) this.save();
  }

  private async show(u: UnderlayData | null) {
    this.ed.store.setState({ underlay: u, underlayImage: null });
    if (!u) return;
    const img = await this.ed.images.load(u.image).catch(() => null);
    if (this.data?.image === u.image) this.ed.store.setState({ underlayImage: img });
  }

  /** `incoming`: the underlay from a loaded .json file (pictures as data URLs). */
  async switchTo(patternId: string, incoming: UnderlayData | null) {
    if (this.dirty) this.saveNow();
    this.patternId = patternId;
    this.ready = false;
    void this.show(null);
    const u = incoming ? await this.ed.images.underlayFromFile(incoming) : await this.ed.persistence.underlays.load(patternId);
    if (this.patternId !== patternId) return;
    this.ready = true;
    await this.show(u);
    if (incoming) this.save();
  }

  /**
   * Stores the photo as it is (only very large ones are scaled down), fits it to the chart in edit mode and opens
   * the straighten dialog. `keepPlacement`: replacing keeps where the old one was.
   */
  async addFromFile(f: File, keepPlacement = false) {
    const img = await loadImage(f).catch(() => null);
    if (!img) return this.ed.toast("toasts.badImage");
    const big = Math.max(img.naturalWidth, img.naturalHeight) > MAX_SIDE;
    const blob = big ? await downscaleToBlob(img, MAX_SIDE, 0.92) : f;
    const k = big ? MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight) : 1;
    const w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k));
    const fresh = newUnderlay(await this.ed.images.put(blob), w, h, this.ed.doc);
    const old = this.data;
    const u = keepPlacement && old ? { ...fresh, rect: { ...old.rect, h: (old.rect.w * h) / w }, opacity: old.opacity } : fresh;
    await this.show(u);
    this.save();
    this.ed.openDialog({ type: "straighten" });
    // the first time: once the straighten dialog is closed, point at the quick edit toggle
    this.ed.store.setState({ pendingTip: "underlay" });
  }

  update(patch: Partial<UnderlayData>) {
    if (!this.data) return;
    if (patch.rect || patch.crop) this.remember();
    this.set({ ...this.data, ...patch });
  }

  /** Behind = stitching; off = edit mode, which starts with a fresh edit frame and its own undo. */
  setBehind(behind: boolean) {
    this.update({ behind, visible: true });
    this.ed.store.setState({ underlayFrame: null });
    if (behind) this.undoStack = [];
    this.ed.tools.leave();
  }

  fit() {
    if (this.data) this.update({ rect: fitToChart(this.data.crop, this.ed.doc) });
  }

  resetCrop() {
    if (this.data) this.update(resetCrop(this.data));
  }

  remove() {
    this.set(null);
    this.ed.store.setState({ underlayImage: null });
  }

  nudge(dx: number, dy: number) {
    const u = this.data;
    if (u) this.update({ rect: { ...u.rect, x: u.rect.x + dx, y: u.rect.y + dy } });
  }

  /** What the straighten dialog starts from: the original photo and the previous corners and sizes. */
  straightenStart(): (Pick<Straighten, "source" | "sourceW" | "sourceH" | "corners" | "cols" | "rows" | "at">) | null {
    const u = this.data;
    if (!u) return null;
    if (u.straighten) return u.straighten;
    return { source: u.image, sourceW: u.imageW, sourceH: u.imageH, corners: defaultCorners(u.imageW, u.imageH), cols: this.ed.doc.w, rows: this.ed.doc.h, at: { x: 0, y: 0 } };
  }

  /**
   * Straightens the marked area of the original photo (4 corners) into a flat picture exactly `cols`×`rows` cells,
   * placed with its top-left at grid point `at`. The original and the corners are kept, so it can be redone.
   */
  async straighten(o: Pick<Straighten, "corners" | "cols" | "rows" | "at">) {
    const start = this.straightenStart(), u = this.data;
    if (!start || !u) return;
    const blob = await this.ed.images.blob(start.source);
    if (!blob) return this.ed.toast("toasts.badImage");
    const size = straightenedSize(o);
    const out = await runStraighten({ blob, corners: o.corners, w: size.w, h: size.h });
    const image = await this.ed.images.put(out);
    const straighten: Straighten = { source: start.source, sourceW: start.sourceW, sourceH: start.sourceH, ...o };
    const next: UnderlayData = { ...u, image, imageW: size.w, imageH: size.h, crop: { x: 0, y: 0, w: size.w, h: size.h }, rect: { x: o.at.x, y: o.at.y, w: o.cols, h: o.rows }, straighten, visible: true, tool: "move", rotation: 0 };
    await this.show(next);
    this.save();
    this.ed.toast("toasts.straightened");
  }

  /** The zoomed-in edit frame (SPEC §15.15), in canvas pixels; null when the image's own handles are reachable. */
  frame(): Rect | null {
    const u = this.data;
    if (!u || !this.editing || u.tool !== "move" || !frameNeeded(turnedBounds(u), this.ed.viewport.visibleGrid())) return null;
    if (this.ed.state.underlayFrame) return this.ed.state.underlayFrame;
    const c = this.ed.viewport.centreOnScreen();
    return { x: c.x - FRAME.w / 2, y: c.y - FRAME.h / 2, ...FRAME };
  }

  /** Undo inside edit mode: the image's placement before the last change. */
  undo() {
    const prev = this.undoStack.pop();
    if (prev) this.set(prev);
  }

  private remember() {
    const u = this.data, last = this.undoStack[this.undoStack.length - 1];
    if (!u || (last && last.rect === u.rect && last.crop === u.crop)) return;
    this.undoStack.push(u);
    if (this.undoStack.length > UNDO_LIMIT) this.undoStack.shift();
  }

  private grabTolerance() {
    return GRAB_PX / this.ed.state.viewport.zoom;
  }

  /** A side or corner handle of the edit frame under canvas point `s`, if the frame is shown. */
  /**
   * The ↺ ↻ buttons in edit mode (Move & resize), in canvas px: above the frame when it is shown (turning around its
   * middle), and above the image's top edge when that is on screen (turning around the image's middle).
   */
  rotateButtons(): RotateButton[] {
    const u = this.data, v = this.ed.viewport;
    if (!u || !this.editing || u.tool !== "move") return [];
    const out: RotateButton[] = [];
    const f = this.frame();
    if (f) {
      const pivot = v.toGrid(f.x + f.w / 2, f.y + f.h / 2), y = f.y - ROT_GAP;
      out.push({ x: f.x + f.w / 2 - ROT_SPREAD, y, dir: -1, pivot }, { x: f.x + f.w / 2 + ROT_SPREAD, y, dir: 1, pivot });
    }
    // above the middle of the image's top edge, along the image's own (turned) axes
    const a = ((u.rotation ?? 0) * Math.PI) / 180, top = v.toScreen(imageToGrid(u, { x: u.crop.x + u.crop.w / 2, y: u.crop.y }));
    const pivot = imageToGrid(u, { x: u.crop.x + u.crop.w / 2, y: u.crop.y + u.crop.h / 2 });
    const up = { x: Math.sin(a), y: -Math.cos(a) }, along = { x: Math.cos(a), y: Math.sin(a) };
    for (const dir of [-1, 1] as const) {
      const b = { x: top.x + up.x * ROT_GAP + along.x * dir * ROT_SPREAD, y: top.y + up.y * ROT_GAP + along.y * dir * ROT_SPREAD, dir, pivot };
      if (b.x > RULER_SIZE && b.y > RULER_SIZE && b.x < v.width && b.y < v.height) out.push(b);
    }
    return out;
  }

  /** Turn by one small step (↺ = -1, ↻ = 1) around a grid point (default: the middle of the view). */
  rotate(dir: number, pivot = this.ed.viewport.toGrid(this.ed.viewport.centreOnScreen().x, this.ed.viewport.centreOnScreen().y)) {
    const u = this.data;
    if (!u) return;
    this.remember();
    this.set(rotateUnderlay(u, dir * ROTATION_STEP, pivot));
  }

  /** An exact angle (side panel), turning around the image's middle. */
  setRotation(deg: number) {
    const u = this.data;
    if (!u || !Number.isFinite(deg)) return;
    this.remember();
    this.set(rotateUnderlay(u, deg - (u.rotation ?? 0), imageToGrid(u, { x: u.crop.x + u.crop.w / 2, y: u.crop.y + u.crop.h / 2 })));
  }

  private rotateButtonAt(s: Point): RotateButton | undefined {
    const r = this.ed.theme.underlayFrame.rotate + 2;
    return this.rotateButtons().find((b) => Math.hypot(b.x - s.x, b.y - s.y) <= r);
  }

  private frameHandle(s: Point): Exclude<Handle, "inside"> | null {
    const f = this.frame();
    return f ? frameHandleAt(f, s, GRAB_PX) : null;
  }

  /** CSS cursor in edit mode for a pointer at grid point `p` / canvas point `s`. */
  cursorAt(p: Point | null, s: Point | null): string {
    const u = this.data;
    if (this.drag) return CURSORS[this.drag.handle];
    if (this.frameDrag) return CURSORS[this.frameDrag.handle];
    if (s && this.rotateButtonAt(s)) return "pointer";
    const fh = s && this.frameHandle(s);
    if (fh) return CURSORS[fh];
    const h = u && p ? handleAt(u.rect, toLocal(u, p), this.grabTolerance()) : null;
    return h ? CURSORS[h] : "default";
  }

  /** Rotate buttons first, then the edit frame's sides, then the image's own handles; inside the image = move. */
  pointerDown(p: Point, s: Point) {
    const u = this.data;
    if (!u) return;
    const rb = this.rotateButtonAt(s);
    if (rb) return this.rotate(rb.dir, rb.pivot);
    const fh = this.frameHandle(s);
    if (fh) {
      this.remember();
      this.frameDrag = { handle: fh, from: s, frame: this.frame()!, start: u };
      return;
    }
    const handle = handleAt(u.rect, toLocal(u, p), this.grabTolerance());
    if (handle) {
      this.remember();
      this.drag = { handle, from: p, start: u };
    }
  }

  /**
   * Edit frame: the dragged side follows the pointer and the opposite side stays pinned — on the frame and on the
   * image under it (pin and stretch), so a grid line can be dragged onto the chart's grid line.
   */
  pointerMove(p: Point, s: Point, free: boolean) {
    const fd = this.frameDrag;
    if (fd) {
      const f0 = fd.frame, f1 = resizeRect(f0, fd.handle, s.x - fd.from.x, s.y - fd.from.y, free, FRAME_MIN);
      const h = fd.handle, east = h.includes("e"), west = h.includes("w"), south = h.startsWith("s"), north = h.startsWith("n");
      const pin = this.ed.viewport.toGrid(west ? f0.x + f0.w : f0.x, north ? f0.y + f0.h : f0.y);
      const sx = east || west ? f1.w / f0.w : 1, sy = north || south ? f1.h / f0.h : 1;
      const u0 = fd.start, stretched = { ...u0, rect: { ...u0.rect, w: u0.rect.w * sx, h: u0.rect.h * sy } };
      this.ed.store.setState({ underlayFrame: f1 });
      this.set(pinImagePoint(stretched, gridToImage(u0, pin), pin), false);
      return;
    }
    const d = this.drag;
    if (!d) return;
    this.set({ ...d.start, ...dragUnderlay(d.start, d.handle, p.x - d.from.x, p.y - d.from.y, free) }, false);
  }

  pointerUp() {
    if (!this.drag && !this.frameDrag) return;
    this.drag = null;
    this.frameDrag = null;
    this.save();
  }

  save() {
    this.dirty = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.saveNow(), SAVE_DELAY);
  }

  saveNow() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (!this.patternId || !this.ready) return;
    this.dirty = false;
    void this.ed.persistence.underlays.save(this.patternId, this.data).then((r) => {
      if (!r.ok) this.ed.toast("toasts.refsTooBig");
    });
  }

  flush() {
    if (this.dirty) this.saveNow();
  }
}
