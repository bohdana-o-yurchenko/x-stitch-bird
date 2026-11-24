import type { Layers, Stamp } from "../pattern/types";
import { composeTurn, isIdentityTurn, stampDef, stampLines } from "../stamps/stamps";
import { boundsOfPoints } from "./maskGeometry";
import type { LayerHandler } from "./types";

const valid = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
const turnValid = (m: unknown): m is [number, number, number, number] => Array.isArray(m) && m.length === 4 && m.every((n) => n === 0 || n === 1 || n === -1);

/** Every cell of the stamp's block, as indices into a w-wide chart; null when part of it is off the chart. */
function blockCells(s: Stamp, size: { w: number; h: number }): number[] | null {
  if (s.x < 0 || s.y < 0 || s.x + s.w > size.w || s.y + s.h > size.h) return null;
  const out: number[] = [];
  for (let y = s.y; y < s.y + s.h; y++) for (let x = s.x; x < s.x + s.w; x++) out.push(y * size.w + x);
  return out;
}

const fits = (s: Stamp, size: { w: number; h: number }) => s.x >= 0 && s.y >= 0 && s.x + s.w <= size.w && s.y + s.h <= size.h;
const inBlock = (s: Stamp, x: number, y: number, slack = 0) => x >= s.x - slack && y >= s.y - slack && x <= s.x + s.w + slack && y <= s.y + s.h + slack;
const same = (a: Stamp, b: Stamp) => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h && a.def === b.def && a.k === b.k && (a.m ?? []).join() === (b.m ?? []).join();
const copy = (s: Stamp): Stamp => ({ ...s, ...(s.m ? { m: [...s.m] as Stamp["m"] } : {}) });

/** Stamps (ARCHITECTURE-REVIEW §3): blocks of straight stitches placed as one; drawn and exported as their lines. */
export const stampsLayer: LayerHandler<Stamp[]> = {
  id: "stamps",
  fileField: "stamps",
  group: "backstitch",
  exported: true,
  pickPriority: 12,
  get: (l: Layers) => l.stamps,
  set: (l: Layers, v: Stamp[]) => void (l.stamps = v),
  create: () => [],
  clone: (v) => v.map(copy),
  equals: (a, b) => a.length === b.length && a.every((s, i) => same(s, b[i]!)),
  isEmpty: (v) => v.length === 0,
  lines: (v, p) => v.flatMap((s) => {
    const def = stampDef(p, s.def);
    return def ? stampLines(s, def) : [];
  }),
  resize: (v, _from, to, off) => v.map((s) => ({ ...copy(s), x: s.x + off.x, y: s.y + off.y })).filter((s) => fits(s, to)),
  transform(v, t, size) {
    // the block's corners land somewhere new; its directions turn with the chart
    const [ox, oy] = t.point(0, 0, size), [ax, ay] = t.point(1, 0, size), [bx, by] = t.point(0, 1, size);
    const turn = [ax - ox, bx - ox, ay - oy, by - oy];
    return v.map((s) => {
      const [x1, y1] = t.point(s.x, s.y, size), [x2, y2] = t.point(s.x + s.w, s.y + s.h, size);
      const m = composeTurn(turn, s.m);
      return { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1), def: s.def, k: s.k, ...(isIdentityTurn(m) ? {} : { m }) };
    });
  },
  extract: (v, mask, size, b) =>
    v.filter((s) => blockCells(s, size)?.every((i) => mask[i])).map((s) => ({ ...copy(s), x: s.x - b.x, y: s.y - b.y })),
  insert(v, piece, _ps, at, size, { override }) {
    for (const s of piece) {
      const n = { ...copy(s), x: s.x + at.x, y: s.y + at.y };
      if (!fits(n, size) || v.some((o) => same(o, n))) continue;
      // the same place taken by another stamp: kept unless overriding
      const there = v.findIndex((o) => o.x === n.x && o.y === n.y && o.w === n.w && o.h === n.h);
      if (there >= 0 && !override) continue;
      if (there >= 0) v.splice(there, 1);
      v.push(n);
    }
  },
  clearMask(v, mask, size) {
    const keep = v.filter((s) => !blockCells(s, size)?.every((i) => mask[i]));
    v.splice(0, v.length, ...keep);
  },
  erase(v, target, size) {
    const cells = new Set(target.cells);
    // a stamp goes when the pointer is on its block, or the brush covers one of its cells
    const hit = (s: Stamp) => inBlock(s, target.point.x, target.point.y) || !!blockCells(s, size)?.some((i) => cells.has(i));
    const keep = v.filter((s) => !hit(s));
    if (keep.length === v.length) return false;
    v.splice(0, v.length, ...keep);
    return true;
  },
  pickAt: (v, at) => v.filter((s) => inBlock(s, at.x, at.y)).pop()?.k ?? 0,
  remapKeys(v, map) {
    const keep = v.map((s) => ({ ...s, k: map(s.k) })).filter((s) => s.k);
    v.splice(0, v.length, ...keep);
  },
  usage(v, sink, p) {
    for (const s of v) {
      sink(s.k, "stamp", 1);
      const def = stampDef(p, s.def);
      if (def) for (const l of stampLines(s, def)) sink(s.k, "segmentLength", Math.hypot(l.x2 - l.x1, l.y2 - l.y1));
    }
  },
  bounds: (v) => boundsOfPoints(v.flatMap((s) => [[s.x, s.y], [s.x + s.w, s.y + s.h]] as [number, number][])),
  serialize: (v, map) => v.filter((s) => map(s.k)).map((s) => [s.x, s.y, s.w, s.h, map(s.k), s.def, ...(s.m ?? [])]),
  parse: (raw) =>
    Array.isArray(raw)
      ? raw
          .filter((r): r is unknown[] => Array.isArray(r) && (r.length === 6 || r.length === 10) && r.slice(0, 5).every(valid) && typeof r[5] === "string")
          .map((r) => {
            const [x, y, w, h, k, def] = r as [number, number, number, number, number, string], m = r.slice(6);
            return { x, y, w, h, k, def, ...(turnValid(m) && !isIdentityTurn(m) ? { m } : {}) };
          })
          .filter((s) => s.w >= 1 && s.h >= 1)
      : [],
};
