import type { Knot, Layers, Segment } from "../pattern/types";
import { boundsOfPoints, pointInBounds, pointInMask, segmentDistance } from "./maskGeometry";
import type { LayerHandler } from "./types";

export const PICK_RADIUS = 0.25;
const valid = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

/** Backstitch: straight segments between half-grid points. */
export const segmentsLayer: LayerHandler<Segment[]> = {
  id: "segments",
  fileField: "back",
  alwaysWritten: true,
  group: "backstitch",
  lines: (v) => v,
  exported: true,
  pickPriority: 10,
  get: (l: Layers) => l.segments,
  set: (l: Layers, v: Segment[]) => void (l.segments = v),
  create: () => [],
  clone: (v) => v.map((s) => ({ ...s })),
  equals: (a, b) => a.length === b.length && a.every((s, i) => { const o = b[i]!; return s.x1 === o.x1 && s.y1 === o.y1 && s.x2 === o.x2 && s.y2 === o.y2 && s.k === o.k; }),
  isEmpty: (v) => v.length === 0,
  resize: (v, _from, to, off) =>
    v
      .map((s) => ({ ...s, x1: s.x1 + off.x, y1: s.y1 + off.y, x2: s.x2 + off.x, y2: s.y2 + off.y }))
      .filter((s) => pointInBounds(s.x1, s.y1, to) && pointInBounds(s.x2, s.y2, to)),
  transform: (v, t, size) =>
    v.map((s) => {
      const [x1, y1] = t.point(s.x1, s.y1, size), [x2, y2] = t.point(s.x2, s.y2, size);
      return { x1, y1, x2, y2, k: s.k };
    }),
  extract: (v, mask, size, b) =>
    v
      .filter((s) => pointInMask(s.x1, s.y1, mask, size) && pointInMask(s.x2, s.y2, mask, size))
      .map((s) => ({ ...s, x1: s.x1 - b.x, y1: s.y1 - b.y, x2: s.x2 - b.x, y2: s.y2 - b.y })),
  insert(v, piece, _ps, at, size) {
    for (const s of piece) {
      const n = { ...s, x1: s.x1 + at.x, y1: s.y1 + at.y, x2: s.x2 + at.x, y2: s.y2 + at.y };
      const duplicate = v.some((o) => o.k === n.k && ((o.x1 === n.x1 && o.y1 === n.y1 && o.x2 === n.x2 && o.y2 === n.y2) || (o.x1 === n.x2 && o.y1 === n.y2 && o.x2 === n.x1 && o.y2 === n.y1)));
      if (!duplicate && pointInBounds(n.x1, n.y1, size) && pointInBounds(n.x2, n.y2, size)) v.push(n);
    }
  },
  clearMask(v, mask, size) {
    const keep = v.filter((s) => !(pointInMask(s.x1, s.y1, mask, size) && pointInMask(s.x2, s.y2, mask, size)));
    v.splice(0, v.length, ...keep);
  },
  erase(v, target) {
    const keep = v.filter((s) => segmentDistance(target.point.x, target.point.y, s.x1, s.y1, s.x2, s.y2) > target.radius);
    if (keep.length === v.length) return false;
    v.splice(0, v.length, ...keep);
    return true;
  },
  pickAt: (v, at) => v.filter((s) => segmentDistance(at.x, at.y, s.x1, s.y1, s.x2, s.y2) < PICK_RADIUS).pop()?.k ?? 0,
  remapKeys(v, map) {
    const keep = v.map((s) => ({ ...s, k: map(s.k) })).filter((s) => s.k);
    v.splice(0, v.length, ...keep);
  },
  usage(v, sink) {
    for (const s of v) {
      sink(s.k, "segment", 1);
      sink(s.k, "segmentLength", Math.hypot(s.x2 - s.x1, s.y2 - s.y1));
    }
  },
  bounds: (v) => boundsOfPoints(v.flatMap((s) => [[s.x1, s.y1], [s.x2, s.y2]] as [number, number][])),
  serialize: (v, map) => v.filter((s) => map(s.k)).map((s) => [s.x1, s.y1, s.x2, s.y2, map(s.k)]),
  parse: (raw) =>
    Array.isArray(raw)
      ? raw
          .filter((r): r is number[] => Array.isArray(r) && r.length === 5 && r.every(valid))
          .map(([x1, y1, x2, y2, k]) => ({ x1: x1!, y1: y1!, x2: x2!, y2: y2!, k: k! }))
      : [],
};

/** French knots on half-grid points (SPEC §15.14). */
export const knotsLayer: LayerHandler<Knot[]> = {
  id: "knots",
  fileField: "knots",
  exported: true,
  pickPriority: 5,
  get: (l: Layers) => l.knots,
  set: (l: Layers, v: Knot[]) => void (l.knots = v),
  create: () => [],
  clone: (v) => v.map((s) => ({ ...s })),
  equals: (a, b) => a.length === b.length && a.every((s, i) => s.x === b[i]!.x && s.y === b[i]!.y && s.k === b[i]!.k),
  isEmpty: (v) => v.length === 0,
  resize: (v, _from, to, off) => v.map((s) => ({ ...s, x: s.x + off.x, y: s.y + off.y })).filter((s) => pointInBounds(s.x, s.y, to)),
  transform: (v, t, size) => v.map((s) => { const [x, y] = t.point(s.x, s.y, size); return { x, y, k: s.k }; }),
  extract: (v, mask, size, b) => v.filter((s) => pointInMask(s.x, s.y, mask, size)).map((s) => ({ ...s, x: s.x - b.x, y: s.y - b.y })),
  insert(v, piece, _ps, at, size, { override }) {
    for (const s of piece) {
      const x = s.x + at.x, y = s.y + at.y;
      if (!pointInBounds(x, y, size)) continue;
      const existing = v.findIndex((o) => o.x === x && o.y === y);
      if (existing >= 0 && !override) continue;
      if (existing >= 0) v.splice(existing, 1);
      v.push({ x, y, k: s.k });
    }
  },
  clearMask(v, mask, size) {
    const keep = v.filter((s) => !pointInMask(s.x, s.y, mask, size));
    v.splice(0, v.length, ...keep);
  },
  erase(v, target) {
    const keep = v.filter((s) => Math.hypot(s.x - target.point.x, s.y - target.point.y) > Math.max(target.radius, PICK_RADIUS));
    if (keep.length === v.length) return false;
    v.splice(0, v.length, ...keep);
    return true;
  },
  pickAt: (v, at) => v.filter((s) => Math.hypot(s.x - at.x, s.y - at.y) < PICK_RADIUS).pop()?.k ?? 0,
  remapKeys(v, map) {
    const keep = v.map((s) => ({ ...s, k: map(s.k) })).filter((s) => s.k);
    v.splice(0, v.length, ...keep);
  },
  usage(v, sink) {
    for (const s of v) sink(s.k, "knot", 1);
  },
  bounds: (v) => boundsOfPoints(v.map((s) => [s.x, s.y] as [number, number])),
  serialize: (v, map) => v.filter((s) => map(s.k)).map((s) => [s.x, s.y, map(s.k)]),
  parse: (raw) =>
    Array.isArray(raw)
      ? raw.filter((r): r is number[] => Array.isArray(r) && r.length === 3 && r.every(valid)).map(([x, y, k]) => ({ x: x!, y: y!, k: k! }))
      : [],
};
