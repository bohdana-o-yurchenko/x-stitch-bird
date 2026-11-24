import { brushCells, floodRegion, snapHalf } from "@/core/geometry/geometry";
import { LAYERS, PICK_ORDER, layerHandler } from "@/core/layers/registry";
import { segmentDistance } from "@/core/layers/maskGeometry";
import { PICK_RADIUS } from "@/core/layers/points";
import { defaultCanvasTheme } from "@/render/theme";
import { pointGroup, stitchGroup } from "@/core/pattern/groups";
import { canPlacePartial, clearForPartial, clearUnder, isOccupied } from "@/core/pattern/occupancy";
import type { Corner, KeyEntry, KeyIndex, Knot, LayerId, Point, Segment } from "@/core/pattern/types";
import { nearestCorner } from "@/core/stitches/partialKinds";
import { mirrorCells, mirrorPoints, mirrorTransforms } from "@/core/transform/mirror";
import type { PickerHighlight } from "@/render/ChartRenderer";
import type { Editor } from "../createEditor";

const KNOT_RADIUS = defaultCanvasTheme.knots.radius;

/** Hidden kinds of stitches (SPEC §15.16) are out of the picker's and eraser's reach: a layer… */
const layerHidden = (ed: Editor, id: LayerId) => { const g = layerHandler(id).group; return !!g && ed.state.hiddenGroups.includes(g); };
/** …a cell's cross or floss + bead… */
const stitchHidden = (ed: Editor, k: KeyIndex) => ed.state.hiddenGroups.includes(stitchGroup(ed.doc.key[k]));
/** …and a knot or a bead between cells. */
const pointHidden = (ed: Editor, o: Knot) => ed.state.hiddenGroups.includes(pointGroup(ed.doc.key[o.k]));

/** The active key entry, or a toast explaining what to do. */
export function requireEntry(ed: Editor): { k: KeyIndex; e: KeyEntry } | null {
  const { doc, activeEntry } = ed.state;
  const e = doc.key[activeEntry];
  if (e) return { k: activeEntry, e };
  ed.toast(doc.key.some(Boolean) ? "toasts.needKey" : "toasts.needKeyEmpty");
  return null;
}

/**
 * Paint cells with entry `k`, honouring mirror mode, override and what may share a cell (SPEC §6.2).
 * Mirrored copies use the same entry — a half cross keeps its direction (SPEC §15.3).
 */
export function paintCells(ed: Editor, cells: Point[], k: KeyIndex): void {
  const p = ed.doc, { mirror, override } = ed.state, size = { w: p.w, h: p.h }, e = p.key[k];
  if (!e) return;
  for (const c of cells)
    for (const m of mirrorCells(c.x, c.y, mirror, size)) {
      const key = k;
      const i = m.y * p.w + m.x;
      if (!e || (!override && isOccupied(p, i, e))) continue;
      if (e.t === "bead") p.layers.beads[i] = key;
      else p.layers.stitches[i] = key;
      clearUnder(p, i, e);
    }
}

export function brushAt(ed: Editor, at: Point): Point[] {
  return brushCells(at.x, at.y, ed.state.brush, { w: ed.doc.w, h: ed.doc.h });
}

/** Eraser hit radius for backstitch in grid units: ~6 screen px, but 0.2–0.45 of a cell so a cell centre still erases the cell. */
export const backstitchHitRadius = (zoom: number) => Math.min(0.45, Math.max(0.2, 6 / zoom));

/** Backstitch segments within `radius` of the pointer or of its mirror images (SPEC §6.2 eraser). */
export function segmentsAt(ed: Editor, grid: Point, radius: number): Segment[] {
  const p = ed.doc, points = mirrorPoints(grid.x, grid.y, ed.state.mirror, p);
  if (layerHidden(ed, "segments")) return [];
  return p.layers.segments.filter((s) => points.some((m) => segmentDistance(m.x, m.y, s.x1, s.y1, s.x2, s.y2) <= radius));
}

/**
 * Is `at` on this knot or bead between cells as drawn — a bead's own outline (circle or bugle), a knot's dot — give or
 * take a few screen px, or within `radius` of its point? Pointing anywhere on a bead takes it, not only its middle.
 */
export function onPoint(ed: Editor, o: Knot, at: Point, radius = PICK_RADIUS): boolean {
  const zoom = ed.state.viewport.zoom, slot = ed.state.palette[o.k], slack = Math.min(0.15, 4 / zoom);
  const dx = Math.abs(at.x - o.x), dy = Math.abs(at.y - o.y);
  if (Math.hypot(dx, dy) < Math.max(radius, PICK_RADIUS)) return true;
  const shape = slot?.bead && (slot.t === "bead" || slot.t === "combo") ? slot.bead.shape : null;
  if (shape?.bugle) {
    // a bugle lies across: a capsule half its length wide each way, 0.2 of a cell thick each way (render/beadPath)
    const t = 0.2, reach = Math.max(0, shape.bugle / 2 - t);
    return Math.hypot(Math.max(0, dx - reach), dy) <= t + slack;
  }
  // a knot's dot is at least 2 px: far out, that would reach over the cells around it
  const r = shape ? (shape.r ?? 0.4) : Math.min(0.35, Math.max(2 / zoom, KNOT_RADIUS));
  return Math.hypot(dx, dy) <= r + slack;
}

/** Knots and beads between cells under the pointer or its mirror images (their drawn size, at least `radius`). */
export function knotsAt(ed: Editor, grid: Point, radius: number): Knot[] {
  const p = ed.doc, points = mirrorPoints(grid.x, grid.y, ed.state.mirror, p);
  return p.layers.knots.filter((o) => !pointHidden(ed, o) && points.some((m) => onPoint(ed, o, m, radius)));
}

/** Delete only knots and beads between cells near the pointer; the cells around them stay. */
export function eraseKnotsAt(ed: Editor, grid: Point, radius: number): boolean {
  const hit = new Set(knotsAt(ed, grid, radius));
  if (!hit.size) return false;
  ed.doc.layers.knots = ed.doc.layers.knots.filter((o) => !hit.has(o));
  return true;
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
    for (const l of LAYERS) {
      if (layerHidden(ed, l.id)) continue;
      if (l.id === "stitches" && ed.state.hiddenGroups.length) {
        // the hidden crosses / floss + bead in the brush stay
        const st = p.layers.stitches, kept = cells.filter((i) => st[i] && stitchHidden(ed, st[i]!)).map((i) => [i, st[i]!] as const);
        if (cells.some((i) => st[i] && !stitchHidden(ed, st[i]!))) any = true;
        l.erase(st, target, size);
        for (const [i, k] of kept) st[i] = k;
      } else if (l.id === "knots" && ed.state.hiddenGroups.length) {
        // only the shown knots / beads between cells; the hidden ones stay, in their places
        const shown = p.layers.knots.filter((o) => !pointHidden(ed, o));
        if (l.erase(shown, target, size)) {
          const kept = new Set(shown);
          p.layers.knots = p.layers.knots.filter((o) => pointHidden(ed, o) || kept.has(o));
          any = true;
        }
      } else if (l.erase(l.get(p.layers), target, size)) any = true;
    }
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
    clearUnder(p, i, e);
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

/** The same topmost valid entry for both the picker click and its hover outline. */
export function pickerHit(ed: Editor, grid: Point): PickerHighlight | null {
  const p = ed.doc, size = { w: p.w, h: p.h };
  for (const l of PICK_ORDER) {
    if (layerHidden(ed, l.id)) continue;
    if (l.id === "knots") {
      // the topmost (last drawn) knot or bead between cells under the pointer, by its drawn size
      const point = [...p.layers.knots].reverse().find((o) => p.key[o.k] && !pointHidden(ed, o) && onPoint(ed, o, grid));
      if (point) return { kind: "knot", point, key: point.k };
      continue;
    }
    const k = l.pickAt(l.get(p.layers), grid, size);
    if (l.id === "stitches" && k && stitchHidden(ed, k)) continue;
    if (k && p.key[k]) {
      if (l.id === "segments") {
        const segment = [...p.layers.segments].reverse().find((o) => o.k === k && segmentDistance(grid.x, grid.y, o.x1, o.y1, o.x2, o.y2) < PICK_RADIUS)!;
        return { kind: "segment", segment, key: k };
      }
      const x = Math.floor(grid.x), y = Math.floor(grid.y), cell = y * p.w + x;
      if (l.id === "partials") {
        const list = p.layers.partials.get(cell)!;
        const corner = nearestCorner(grid.x - x, grid.y - y);
        return { kind: "partial", cell, stitch: (list.find((o) => o.corner === corner) ?? list[0])!, key: k };
      }
      return l.id === "beads" ? { kind: "bead", cell, key: k } : { kind: "stitch", cell, key: k };
    }
  }
  return null;
}

/** Picker: knots and backstitch first, then beads, partial stitches, stitches. */
export function pickAt(ed: Editor, grid: Point): void {
  const hit = pickerHit(ed, grid);
  if (hit) {
    ed.setActiveEntry(hit.key);
    ed.toast("toasts.picked", { label: ed.entryLabel(hit.key) });
    return;
  }
  ed.toast("toasts.nothingToPick");
}
