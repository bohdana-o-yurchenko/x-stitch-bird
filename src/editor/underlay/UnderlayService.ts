import type { Point } from "@/core/pattern/types";
import { alignUnderlay, dragUnderlay, fitToChart, handleAt, newUnderlay, resetCrop, stretchUnderlay, type Handle, type UnderlayData } from "@/core/underlay/underlay";
import { loadImage } from "@/platform/images";
import type { Editor } from "../createEditor";

const SAVE_DELAY = 700;
const MAX_SIDE = 3000;
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
    const img = await loadImage(u.src).catch(() => null);
    if (this.data?.src === u.src) this.ed.store.setState({ underlayImage: img });
  }

  async switchTo(patternId: string, incoming: UnderlayData | null) {
    if (this.dirty) this.saveNow();
    this.patternId = patternId;
    this.ready = false;
    void this.show(null);
    const u = incoming ?? (await this.ed.persistence.underlays.load(patternId));
    if (this.patternId !== patternId) return;
    this.ready = true;
    await this.show(u);
    if (incoming) this.save();
  }

  /** Downscaled JPEG of the picture, fitted to the chart; starts in edit mode. */
  async addFromFile(f: File, keepPlacement = false) {
    const img = await loadImage(f).catch(() => null);
    if (!img) return this.ed.toast("toasts.badImage");
    const k = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(img.naturalWidth * k));
    c.height = Math.max(1, Math.round(img.naturalHeight * k));
    const g = c.getContext("2d")!;
    g.fillStyle = "#fff";
    g.fillRect(0, 0, c.width, c.height);
    g.drawImage(img, 0, 0, c.width, c.height);
    const fresh = newUnderlay(c.toDataURL("image/jpeg", 0.9), c.width, c.height, this.ed.doc);
    const old = this.data;
    const u = keepPlacement && old ? { ...fresh, rect: { ...old.rect, h: (old.rect.w * c.height) / c.width }, opacity: old.opacity } : fresh;
    await this.show(u);
    this.save();
    this.ed.toast("toasts.underlayAdded");
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

  /** 3-point alignment is collecting clicks (it takes the pointer, like edit mode). */
  get aligning(): boolean {
    const pts = this.ed.state.underlayAlign;
    return !!pts && pts.length < 3;
  }

  startAlign() {
    if (!this.data) return;
    this.ed.tools.cancel();
    this.ed.store.setState({ underlayAlign: [], underlay: { ...this.data, visible: true } });
  }

  alignClick(p: Point) {
    const pts = this.ed.state.underlayAlign;
    if (pts && pts.length < 3) this.ed.store.setState({ underlayAlign: [...pts, p] });
  }

  alignBack() {
    const pts = this.ed.state.underlayAlign;
    if (pts?.length) this.ed.store.setState({ underlayAlign: pts.slice(0, -1) });
  }

  cancelAlign() {
    this.ed.store.setState({ underlayAlign: null });
  }

  /** Places the image so the clicked square is exactly `n`×`n` cells on the chart grid. */
  applyAlign(n: number) {
    const pts = this.ed.state.underlayAlign, u = this.data;
    if (!u || pts?.length !== 3) return;
    const rect = alignUnderlay(u.rect, pts[0]!, pts[1]!, pts[2]!, n);
    if (!rect) return this.ed.toast("toasts.alignFailed");
    this.ed.store.setState({ underlayAlign: null });
    this.update({ rect });
    this.ed.toast("toasts.aligned");
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
