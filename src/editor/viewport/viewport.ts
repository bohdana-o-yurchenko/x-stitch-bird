import type { Point } from "@/core/pattern/types";
import type { EditorStore } from "../store/editorStore";

const MIN_ZOOM = 2, MAX_ZOOM = 60, MAX_FIT_ZOOM = 40;
/** Zoom per wheel delta unit: a mouse notch is ~100 units, a trackpad pinch sends many small deltas. */
const WHEEL_SPEED = 0.0025, PINCH_SPEED = 0.012;

/** Zoom and pan of the chart canvas (SPEC §5.1). Screen points are relative to the canvas element. */
export class ViewportService {
  width = 0;
  height = 0;

  constructor(private store: EditorStore, private ruler: number) {}

  setSize(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  toGrid(sx: number, sy: number): Point {
    const { zoom, offX, offY } = this.store.getState().viewport;
    return { x: (sx - this.ruler - offX) / zoom, y: (sy - this.ruler - offY) / zoom };
  }

  /** Grid point at the middle of the visible chart area (right of and below the rulers). */
  centre(): Point {
    return this.toGrid((this.width + this.ruler) / 2, (this.height + this.ruler) / 2);
  }

  toCell(sx: number, sy: number): Point {
    const g = this.toGrid(sx, sy);
    return { x: Math.floor(g.x), y: Math.floor(g.y) };
  }

  fit() {
    const { doc } = this.store.getState();
    const z = Math.min((this.width - this.ruler - 30) / doc.w, (this.height - this.ruler - 30) / doc.h);
    const zoom = Math.max(MIN_ZOOM, Math.min(MAX_FIT_ZOOM, Math.floor(z * 2) / 2 || MIN_ZOOM));
    this.store.setState({ viewport: { zoom, offX: (this.width - this.ruler - doc.w * zoom) / 2, offY: (this.height - this.ruler - doc.h * zoom) / 2 } });
  }

  zoomAt(factor: number, sx = this.width / 2, sy = this.height / 2) {
    const { zoom, offX, offY } = this.store.getState().viewport;
    const nz = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom * factor));
    const wx = (sx - this.ruler - offX) / zoom, wy = (sy - this.ruler - offY) / zoom;
    this.store.setState({ viewport: { zoom: nz, offX: sx - this.ruler - wx * nz, offY: sy - this.ruler - wy * nz } });
  }

  panBy(dx: number, dy: number) {
    const v = this.store.getState().viewport;
    this.store.setState({ viewport: { ...v, offX: v.offX + dx, offY: v.offY + dy } });
  }

  setOffset(offX: number, offY: number) {
    this.store.setState({ viewport: { ...this.store.getState().viewport, offX, offY } });
  }

  /** Centre a cell on screen, zooming in if it would be too small to see. */
  centreOn(cell: number, flashMs = 900) {
    const { doc, viewport } = this.store.getState();
    const zoom = Math.max(viewport.zoom, 10);
    const x = cell % doc.w, y = (cell / doc.w) | 0;
    this.store.setState({
      viewport: { zoom, offX: (this.width - this.ruler) / 2 - (x + 0.5) * zoom, offY: (this.height - this.ruler) / 2 - (y + 0.5) * zoom },
      flash: { cell, until: Date.now() + flashMs },
    });
  }

  /** Mouse wheel: real wheels and Ctrl/⌘ zoom, trackpads pan (SPEC §5.1). */
  wheel(e: { deltaX: number; deltaY: number; deltaMode: number; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }, sx: number, sy: number) {
    const mouseWheel = e.deltaMode !== 0 || (e.deltaX === 0 && Math.abs(e.deltaY) >= 50 && Number.isInteger(e.deltaY));
    if (e.ctrlKey || e.metaKey || (mouseWheel && !e.shiftKey)) {
      // trackpad pinch arrives as ctrl + small pixel deltas
      const pinch = !mouseWheel && e.deltaMode === 0;
      const d = Math.max(-120, Math.min(120, e.deltaY * (e.deltaMode ? 33 : 1)));
      this.zoomAt(Math.exp(-d * (pinch ? PINCH_SPEED : WHEEL_SPEED)), sx, sy);
    } else if (e.shiftKey && !e.deltaX) this.panBy(-e.deltaY, 0);
    else this.panBy(-e.deltaX, -e.deltaY);
  }

  get percent() {
    return Math.round((this.store.getState().viewport.zoom / 12) * 100);
  }
}
