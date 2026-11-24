import { canPlacePartial, clearForPartial } from "../pattern/occupancy";
import type { Corner, Layers, PartialKindId, PartialStitch } from "../pattern/types";
import { nearestCorner } from "../stitches/partialKinds";
import { boundsOfCells, inBounds } from "./maskGeometry";
import type { LayerHandler } from "./types";

type Partials = Map<number, PartialStitch[]>;

const KIND_CODE: Record<PartialKindId, string> = { quarter: "q", threeQuarter: "t", petite: "p" };
const CODE_KIND: Record<string, PartialKindId> = { q: "quarter", t: "threeQuarter", p: "petite" };

function moveCells(v: Partials, to: { w: number; h: number }, place: (x: number, y: number) => [number, number] | null, w: number, map = (s: PartialStitch) => s): Partials {
  const out: Partials = new Map();
  for (const [i, list] of v) {
    const target = place(i % w, (i / w) | 0);
    if (!target || !inBounds(target[0], target[1], to)) continue;
    out.set(target[1] * to.w + target[0], list.map(map));
  }
  return out;
}

/** Quarter, three-quarter and petite stitches, sparse by cell (SPEC §15.13). */
export const partialsLayer: LayerHandler<Partials> = {
  id: "partials",
  fileField: "part",
  group: "partials",
  exported: true,
  pickPriority: 30,
  get: (l: Layers) => l.partials,
  set: (l: Layers, v: Partials) => void (l.partials = v),
  create: () => new Map(),
  clone: (v) => new Map([...v].map(([i, list]) => [i, list.map((s) => ({ ...s }))])),
  equals: (a, b) => a.size === b.size && [...a].every(([i, l]) => JSON.stringify(l) === JSON.stringify(b.get(i))),
  isEmpty: (v) => v.size === 0,
  resize: (v, from, to, off) => moveCells(v, to, (x, y) => [x + off.x, y + off.y], from.w),
  transform: (v, t, size) =>
    moveCells(v, t.newSize(size), (x, y) => t.cell(x, y, size), size.w, (s) => ({ ...s, corner: t.corner(s.corner) })),
  extract(v, mask, size, b) {
    const out: Partials = new Map();
    for (const [i, list] of v) {
      if (!mask[i]) continue;
      out.set((((i / size.w) | 0) - b.y) * b.w + (i % size.w) - b.x, list.map((s) => ({ ...s })));
    }
    return out;
  },
  insert(v, piece, ps, at, size, { pattern, override, placed }) {
    for (const [pi, list] of piece) {
      const tx = (pi % ps.w) + at.x, ty = ((pi / ps.w) | 0) + at.y;
      if (!inBounds(tx, ty, size)) continue;
      const i = ty * size.w + tx, together = !!placed?.has(i);
      for (const s of list) {
        if (!override && !canPlacePartial(pattern, i, s.kind, s.corner, v, together)) continue;
        clearForPartial(pattern, i, s.kind, s.corner, v, together);
        v.set(i, [...(v.get(i) ?? []), { ...s }]);
        placed?.add(i);
      }
    }
  },
  clearMask(v, mask) {
    for (const i of [...v.keys()]) if (mask[i]) v.delete(i);
  },
  erase(v, target, size) {
    let any = false;
    for (const i of target.cells) {
      const list = v.get(i);
      if (!list) continue;
      if (!target.precise) {
        v.delete(i);
        any = true;
        continue;
      }
      const corner = nearestCorner(target.point.x - (i % size.w), target.point.y - ((i / size.w) | 0));
      const rest = list.filter((s) => s.corner !== corner);
      if (rest.length === list.length) continue;
      any = true;
      if (rest.length) v.set(i, rest);
      else v.delete(i);
    }
    return any;
  },
  pickAt(v, at, size) {
    const x = Math.floor(at.x), y = Math.floor(at.y);
    const list = inBounds(x, y, size) ? v.get(y * size.w + x) : undefined;
    if (!list) return 0;
    const corner: Corner = nearestCorner(at.x - x, at.y - y);
    return (list.find((s) => s.corner === corner) ?? list[0])?.k ?? 0;
  },
  remapKeys(v, map) {
    for (const [i, list] of v) {
      const rest = list.map((s) => ({ ...s, k: map(s.k) })).filter((s) => s.k);
      if (rest.length) v.set(i, rest);
      else v.delete(i);
    }
  },
  usage(v, sink) {
    for (const list of v.values()) for (const s of list) sink(s.k, s.kind, 1);
  },
  bounds: (v, size) => boundsOfCells(v.keys(), size.w),
  serialize: (v, map) =>
    [...v].sort((a, b) => a[0] - b[0]).flatMap(([i, list]) => list.map((s) => [i, KIND_CODE[s.kind], s.corner, map(s.k)] as const).filter((r) => r[3])),
  parse(raw, size) {
    const out: Partials = new Map();
    if (!Array.isArray(raw)) return out;
    for (const r of raw) {
      if (!Array.isArray(r)) continue;
      const [i, code, c, k] = r as [number, string, number, number];
      const kind = CODE_KIND[code];
      if (!kind || !(i >= 0 && i < size.w * size.h) || !(c >= 0 && c <= 3) || !k) continue;
      out.set(i, [...(out.get(i) ?? []), { kind, corner: c as Corner, k }]);
    }
    return out;
  },
};
