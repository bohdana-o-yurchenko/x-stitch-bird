import type { Point } from "@/core/pattern/types";
import { defaultCorners, dragUnderlay, fitToChart, handleAt, newUnderlay, resetCrop, straightenedSize, stretchUnderlay, type Handle, type Straighten, type UnderlayData } from "@/core/underlay/underlay";
import { downscaleToBlob, loadImage } from "@/platform/images";
import { runStraighten } from "../heavy";
import type { Editor } from "../createEditor";

const SAVE_DELAY = 700;
/** Photos larger than this (longer side, px) are scaled down once when added; others are stored untouched. */
const MAX_SIDE = 6000;
/** Grab distance for handles, in screen pixels. */
const GRAB_PX = 8;

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
  }

  update(patch: Partial<UnderlayData>) {
    if (this.data) this.set({ ...this.data, ...patch });
  }

  setBehind(behind: boolean) {
    this.update({ behind, visible: true });
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
    const next: UnderlayData = { ...u, image, imageW: size.w, imageH: size.h, crop: { x: 0, y: 0, w: size.w, h: size.h }, rect: { x: o.at.x, y: o.at.y, w: o.cols, h: o.rows }, straighten, visible: true, tool: "move" };
    await this.show(next);
    this.save();
    this.ed.toast("toasts.straightened");
  }

  /** Grow or shrink by (dw, dh) cells around the middle of the screen; works in both modes, at any zoom. */
  stretch(dw: number, dh: number) {
    const u = this.data;
    if (u) this.update({ rect: stretchUnderlay(u.rect, this.ed.viewport.centre(), dw, dh) });
  }

  private grabTolerance() {
    return GRAB_PX / this.ed.state.viewport.zoom;
  }

  /** CSS cursor for a pointer at `p` (grid units) in edit mode. */
  cursorAt(p: Point | null): string {
    const u = this.data;
    if (this.drag) return CURSORS[this.drag.handle];
    const h = u && p ? handleAt(u.rect, p, this.grabTolerance()) : null;
    return h ? CURSORS[h] : "default";
  }

  pointerDown(p: Point) {
    const u = this.data;
    const handle = u && handleAt(u.rect, p, this.grabTolerance());
    if (u && handle) this.drag = { handle, from: p, start: u };
  }

  pointerMove(p: Point, free: boolean) {
    const d = this.drag;
    if (!d) return;
    this.set({ ...d.start, ...dragUnderlay(d.start, d.handle, p.x - d.from.x, p.y - d.from.y, free) }, false);
  }

  pointerUp() {
    if (!this.drag) return;
    this.drag = null;
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
