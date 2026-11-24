import { floodRegion } from "@/core/geometry/geometry";
import { boundsOfCells } from "@/core/layers/maskGeometry";
import { buildPalette } from "@/core/pattern/palette";
import { createPattern } from "@/core/pattern/createPattern";
import { clearMask, extractFragment, insertFragment, transformFragment, type Fragment } from "@/core/pattern/fragment";
import type { KeyIndex, Pattern, Point, Rect } from "@/core/pattern/types";
import { TRANSFORMS, type TransformId } from "@/core/transform/cellTransform";
import { LAYERS } from "@/core/layers/registry";
import type { Editor } from "../createEditor";
import { reframe } from "../actions/pattern";
import type { FloatingContent } from "../store/editorStore";

const cellsOf = (mask: Uint8Array) => mask.reduce<number[]>((a, v, i) => (v ? (a.push(i), a) : a), []);

/** A small pattern holding the fragment, so the renderer can draw it while it floats. */
function previewOf(ed: Editor, f: Fragment): FloatingContent["preview"] {
  const p: Pattern = createPattern(f.size.w, f.size.h);
  const max = Math.max(0, ...f.keys.keys());
  p.key = Array.from({ length: max + 1 }, (_, k) => (k ? f.keys.get(k) ?? null : null));
  p.blends = { ...ed.doc.blends, ...f.blends };
  p.combos = { ...ed.doc.combos, ...f.combos };
  p.customs = { ...ed.doc.customs, ...f.customs };
  for (const l of LAYERS) if (f.layers[l.id] !== undefined && l.exported) l.set(p.layers, l.clone(f.layers[l.id]));
  return { pattern: p, palette: buildPalette(p) };
}

/**
 * Selection, floating content and the clipboard (SPEC §15.6). Moving or pasting opens a history transaction
 * that `commit` closes as one undo step and `cancel` rolls back.
 */
export class SelectionService {
  private clipboard: Fragment | null = null;
  private grab: Point | null = null;

  constructor(private ed: Editor) {}

  private setMask(mask: Uint8Array | null) {
    const bounds = mask && boundsOfCells(cellsOf(mask), this.ed.doc.w);
    this.ed.store.setState({ selection: mask && bounds ? { mask, bounds } : null });
  }

  selectRect(r: Rect, add: boolean) {
    const p = this.ed.doc;
    const mask = add && this.ed.state.selection ? this.ed.state.selection.mask.slice() : new Uint8Array(p.w * p.h);
    for (let y = Math.max(0, r.y); y < Math.min(p.h, r.y + r.h); y++)
      for (let x = Math.max(0, r.x); x < Math.min(p.w, r.x + r.w); x++) mask[y * p.w + x] = 1;
    this.setMask(mask);
  }

  /** Magic wand: connected cells with the same key, or every cell of that key. */
  selectSame(cell: Point, everywhere: boolean, add: boolean) {
    const p = this.ed.doc, start = cell.y * p.w + cell.x;
    const layer = p.layers.stitches[start] ? p.layers.stitches : p.layers.beads;
    const k = layer[start] ?? 0;
    if (!k) return this.none();
    const mask = add && this.ed.state.selection ? this.ed.state.selection.mask.slice() : new Uint8Array(p.w * p.h);
    const cells = everywhere ? [...layer.keys()].filter((i) => layer[i] === k) : floodRegion(start, p, (i) => layer[i] === k);
    for (const i of cells) mask[i] = 1;
    this.setMask(mask);
  }

  all() {
    this.setMask(new Uint8Array(this.ed.doc.w * this.ed.doc.h).fill(1));
  }

  none() {
    if (this.ed.state.floating) this.commitFloating();
    this.ed.store.setState({ selection: null });
  }

  contains(cell: Point) {
    const s = this.ed.state.selection, p = this.ed.doc;
    return !!s && cell.x >= 0 && cell.y >= 0 && cell.x < p.w && cell.y < p.h && !!s.mask[cell.y * p.w + cell.x];
  }

  private float(fragment: Fragment, at: Point) {
    this.ed.store.setState({ floating: { fragment, at, preview: previewOf(this.ed, fragment) }, selection: null });
  }

  /** Cut the selection out into floating content (start of a move). */
  lift(): boolean {
    const s = this.ed.state.selection;
    if (!s || this.ed.state.floating) return !!this.ed.state.floating;
    const f = extractFragment(this.ed.doc, s.mask);
    if (!f) return false;
    this.ed.history.begin("move");
    clearMask(this.ed.doc, s.mask);
    this.float(f, { x: s.bounds.x, y: s.bounds.y });
    this.ed.changed();
    return true;
  }

  floatingContains(cell: Point) {
    const f = this.ed.state.floating;
    if (!f) return false;
    const x = cell.x - f.at.x, y = cell.y - f.at.y;
    return x >= 0 && y >= 0 && x < f.fragment.size.w && y < f.fragment.size.h && !!f.fragment.mask[y * f.fragment.size.w + x];
  }

  startDrag(cell: Point) {
    const f = this.ed.state.floating;
    if (f) this.grab = { x: cell.x - f.at.x, y: cell.y - f.at.y };
  }

  drag(cell: Point) {
    const f = this.ed.state.floating;
    if (f && this.grab) this.ed.store.setState({ floating: { ...f, at: { x: cell.x - this.grab.x, y: cell.y - this.grab.y } } });
  }

  endDrag() {
    this.grab = null;
  }

  nudge(dx: number, dy: number) {
    if (!this.ed.state.floating && !this.lift()) return;
    const f = this.ed.state.floating!;
    this.ed.store.setState({ floating: { ...f, at: { x: f.at.x + dx, y: f.at.y + dy } } });
  }

  commitFloating() {
    const f = this.ed.state.floating;
    if (!f) return;
    const { doc } = this.ed;
    if (!this.ed.history.inTransaction) this.ed.history.begin("paste");
    insertFragment(doc, f.fragment, f.at, this.ed.state.override, this.ed.state.symbols);
    this.ed.store.setState({ floating: null });
    this.ed.history.commit();
    const mask = new Uint8Array(doc.w * doc.h);
    for (let y = 0; y < f.fragment.size.h; y++)
      for (let x = 0; x < f.fragment.size.w; x++) {
        const tx = x + f.at.x, ty = y + f.at.y;
        if (f.fragment.mask[y * f.fragment.size.w + x] && tx >= 0 && ty >= 0 && tx < doc.w && ty < doc.h) mask[ty * doc.w + tx] = 1;
      }
    this.setMask(mask);
    this.ed.changed({ keys: true });
  }

  cancelFloating() {
    if (!this.ed.state.floating) return;
    this.ed.store.setState({ floating: null });
    this.ed.history.cancel();
    this.ed.changed({ keys: true });
  }

  /** Flip or rotate the selection in place (one undo step unless it is already floating). */
  transform(id: TransformId) {
    const floatingBefore = !!this.ed.state.floating;
    if (!floatingBefore && !this.lift()) return this.ed.toast("toasts.selectionEmpty");
    const f = this.ed.state.floating!;
    this.float(transformFragment(f.fragment, TRANSFORMS[id]), f.at);
    if (!floatingBefore) this.commitFloating();
  }

  clear() {
    const s = this.ed.state.selection;
    if (!s) return;
    this.ed.history.transaction("delete", () => clearMask(this.ed.doc, s.mask));
    this.ed.changed();
  }

  copy(): boolean {
    const s = this.ed.state.selection;
    const f = s ? extractFragment(this.ed.doc, s.mask) : this.ed.state.floating?.fragment ?? null;
    if (!f) {
      this.ed.toast("toasts.selectionEmpty");
      return false;
    }
    this.clipboard = f;
    this.ed.store.setState({ hasClipboard: true });
    return true;
  }

  cut() {
    if (this.copy()) this.clear();
  }

  paste() {
    if (!this.clipboard) return this.ed.toast("toasts.clipboardEmpty");
    if (this.ed.state.floating) this.commitFloating();
    const hover = this.ed.state.hoverCell;
    const at = hover ?? { x: 0, y: 0 };
    this.ed.history.begin("paste");
    this.float(this.clipboard, at);
    this.ed.toast("toasts.pasted");
  }

  /** How many stitches (cells, beads, lines, knots, partials) each key entry has inside the selection (or the whole chart). */
  keyCounts(): Map<KeyIndex, number> {
    const p = this.ed.doc, n = new Map<KeyIndex, number>();
    const mask = this.ed.state.selection?.mask ?? new Uint8Array(p.w * p.h).fill(1);
    const f = extractFragment(p, mask);
    if (!f) return n;
    for (const l of LAYERS) {
      const piece = f.layers[l.id];
      // one per stitch, line, knot or stamp — a line's length isn't one more
      if (piece !== undefined) l.usage(piece as never, (k, unit) => unit !== "segmentLength" && p.key[k] && n.set(k, (n.get(k) ?? 0) + 1), p);
    }
    return n;
  }

  /** Replace one key entry with another inside the selection (or the whole chart). */
  replaceKey(from: KeyIndex, to: KeyIndex) {
    const p = this.ed.doc;
    const mask = this.ed.state.selection?.mask ?? new Uint8Array(p.w * p.h).fill(1);
    const f = extractFragment(p, mask), b = boundsOfCells(cellsOf(mask), p.w);
    if (!f || !b) return;
    this.ed.history.transaction("replaceKey", () => {
      for (const l of LAYERS) {
        const piece = f.layers[l.id];
        if (piece === undefined) continue;
        l.clearMask(l.get(p.layers), mask, p);
        l.remapKeys(piece, (k) => (k === from ? to : k));
      }
      const e = p.key[to];
      if (e) f.keys.set(to, e);
      insertFragment(p, f, { x: b.x, y: b.y }, true, this.ed.state.symbols);
    });
    this.ed.changed();
  }

  cropToSelection() {
    const s = this.ed.state.selection;
    if (!s) return this.ed.toast("toasts.selectionEmpty");
    reframe(this.ed, "crop", { w: s.bounds.w, h: s.bounds.h }, { x: -s.bounds.x, y: -s.bounds.y });
    this.ed.store.setState({ selection: null });
  }
}
