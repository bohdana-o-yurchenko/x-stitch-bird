import { brushCells, floodRegion, snapHalf } from "@/core/geometry/geometry";
import { LAYERS, PICK_ORDER } from "@/core/layers/registry";
import { segmentDistance } from "@/core/layers/maskGeometry";
import { findOrCreateTwin } from "@/core/pattern/keyEntries";
import { clearPartialsUnder, canPlacePartial, clearForPartial, isOccupied } from "@/core/pattern/occupancy";
import type { Corner, KeyEntry, KeyIndex, Point, Segment } from "@/core/pattern/types";
import { mirrorCells, mirrorPoints, mirrorTransforms } from "@/core/transform/mirror";
import type { Editor } from "../createEditor";

/** The active key entry, or a toast explaining what to do. */
export function requireEntry(ed: Editor): { k: KeyIndex; e: KeyEntry } | null {
  const { doc, activeEntry } = ed.state;
  const e = doc.key[activeEntry];
  if (e) return { k: activeEntry, e };
  ed.toast(doc.key.some(Boolean) ? "toasts.needKey" : "toasts.needKeyEmpty");
  return null;
}

/** Twin entries for mirrored half crosses are created on the fly; reported once per stroke. */
function twinFor(ed: Editor, k: KeyIndex, created: { count: number }) {
  return findOrCreateTwin(ed.doc, k, ed.state.symbols, created);
}

function reportTwins(ed: Editor, created: { count: number }) {
  if (created.count) {
    ed.changed({ keys: true });
    ed.toast("toasts.newTwins", { count: created.count });
  }
}

/** Paint cells with entry `k`, honouring mirror mode, override and what may share a cell (SPEC §6.2). */
export function paintCells(ed: Editor, cells: Point[], k: KeyIndex): void {
  const p = ed.doc, { mirror, override } = ed.state, size = { w: p.w, h: p.h }, created = { count: 0 };
  for (const c of cells)
    for (const m of mirrorCells(c.x, c.y, mirror, size)) {
      const key = m.swap ? twinFor(ed, k, created) : k, e = p.key[key];
      const i = m.y * p.w + m.x;
      if (!e || (!override && isOccupied(p, i, e))) continue;
      if (e.t === "bead") p.layers.beads[i] = key;
      else {
        p.layers.stitches[i] = key;
        if (e.t === "combo") p.layers.beads[i] = 0;
        clearPartialsUnder(p, i, e);
      }
    }
  reportTwins(ed, created);
}

export function brushAt(ed: Editor, at: Point): Point[] {
  return brushCells(at.x, at.y, ed.state.brush, { w: ed.doc.w, h: ed.doc.h });
}

/** Eraser hit radius for backstitch in grid units: ~6 screen px, but 0.2–0.45 of a cell so a cell centre still erases the cell. */
export const backstitchHitRadius = (zoom: number) => Math.min(0.45, Math.max(0.2, 6 / zoom));

/** Backstitch segments within `radius` of the pointer or of its mirror images (SPEC §6.2 eraser). */
export function segmentsAt(ed: Editor, grid: Point, radius: number): Segment[] {
  const p = ed.doc, points = mirrorPoints(grid.x, grid.y, ed.state.mirror, p);
  return p.layers.segments.filter((s) => points.some((m) => segmentDistance(m.x, m.y, s.x1, s.y1, s.x2, s.y2) <= radius));
}

/** Delete only backstitch near the pointer (and its mirror images); crosses and beads stay. */
export function eraseSegmentsAt(ed: Editor, grid: Point, radius: number): boolean {
  const hit = new Set(segmentsAt(ed, grid, radius));
  if (!hit.size) return false;
  ed.doc.layers.segments = ed.doc.layers.segments.filter((s) => !hit.has(s));
  return true;
}

/** Eraser: clears cells under the brush and lines/knots near the pointer, mirrored (SPEC §6.2). */
export function eraseAt(ed: Editor, cell: Point, grid: Point): boolean {
  const p = ed.doc, { brush, mirror } = ed.state, size = { w: p.w, h: p.h };
  const radius = 0.3 * Math.max(1, brush / 2);
  let any = false;
  for (const m of mirrorPoints(grid.x, grid.y, mirror, size)) {
    const c = m.t ? m.t.cell(cell.x, cell.y, size) : [cell.x, cell.y];
    const cells = brushCells(c[0]!, c[1]!, brush, size).map((q) => q.y * p.w + q.x);
    const target = { cells, point: { x: m.x, y: m.y }, radius, precise: brush === 1 };
    for (const l of LAYERS) if (l.erase(l.get(p.layers), target, size)) any = true;
  }
  return any;
}

/** Flood fill on the entry's layer; ignores mirror mode like the original app. */
export function fillAt(ed: Editor, cell: Point, k: KeyIndex, e: KeyEntry): void {
  const p = ed.doc, { override } = ed.state, size = { w: p.w, h: p.h };
  const layer = e.t === "bead" ? p.layers.beads : p.layers.stitches;
  const start = cell.y * p.w + cell.x, target = layer[start] ?? 0;
  if (target === k || (!override && isOccupied(p, start, e))) return;
  for (const i of floodRegion(start, size, (i) => layer[i] === target && (override || !isOccupied(p, i, e)))) {
    layer[i] = k;
    if (e.t === "combo") p.layers.beads[i] = 0;
    if (e.t !== "bead") clearPartialsUnder(p, i, e);
  }
}

export function addSegment(ed: Editor, a: Point, b: Point, k: KeyIndex): void {
  if (a.x === b.x && a.y === b.y) return;
  const p = ed.doc, size = { w: p.w, h: p.h };
  ed.history.transaction("backstitch", () => {
    p.layers.segments.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, k });
    for (const t of mirrorTransforms(ed.state.mirror)) {
      const [x1, y1] = t.point(a.x, a.y, size), [x2, y2] = t.point(b.x, b.y, size);
      p.layers.segments.push({ x1, y1, x2, y2, k });
    }
  });
}

export function placeKnot(ed: Editor, pt: Point, k: KeyIndex): void {
  const p = ed.doc, size = { w: p.w, h: p.h }, { override, mirror } = ed.state;
  for (const m of mirrorPoints(pt.x, pt.y, mirror, size)) {
    const at = snapHalf(m, size);
    const existing = p.layers.knots.findIndex((o) => o.x === at.x && o.y === at.y);
    if (existing >= 0 && !override) continue;
    if (existing >= 0) p.layers.knots.splice(existing, 1);
    p.layers.knots.push({ ...at, k });
  }
}

export function placePartial(ed: Editor, cell: Point, corner: Corner, k: KeyIndex): void {
  const p = ed.doc, size = { w: p.w, h: p.h }, { override, mirror, partialKind: kind } = ed.state;
  const copies = [{ c: [cell.x, cell.y], corner }, ...mirrorTransforms(mirror).map((t) => ({ c: t.cell(cell.x, cell.y, size), corner: t.corner(corner) }))];
  for (const { c, corner: cc } of copies) {
    const i = c[1]! * p.w + c[0]!;
    if (!override && !canPlacePartial(p, i, kind, cc)) continue;
    clearForPartial(p, i, kind, cc);
    p.layers.partials.set(i, [...(p.layers.partials.get(i) ?? []), { kind, corner: cc, k }]);
  }
}

/** Picker: knots and backstitch first, then beads, partial stitches, stitches. */
export function pickAt(ed: Editor, grid: Point): void {
  const p = ed.doc, size = { w: p.w, h: p.h };
  for (const l of PICK_ORDER) {
    const k = l.pickAt(l.get(p.layers), grid, size);
    if (k && p.key[k]) {
      ed.setActiveEntry(k);
      ed.toast("toasts.picked", { label: ed.entryLabel(k) });
      return;
    }
  }
  ed.toast("toasts.nothingToPick");
}
