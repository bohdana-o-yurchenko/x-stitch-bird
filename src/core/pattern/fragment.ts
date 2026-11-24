import { entryKind } from "../entryKinds/registry";
import { LAYERS } from "../layers/registry";
import type { TransformContext } from "../layers/types";
import { boundsOfCells } from "../layers/maskGeometry";
import type { CellTransform } from "../transform/cellTransform";
import { mirroredStitchType } from "../stitches/registry";
import { keyFor, sameKey, sameSymbol } from "./keyEntries";
import type { Blend, Combo, CustomColor, KeyEntry, KeyIndex, LayerId, Pattern, Point, Size, StampDef } from "./types";

/** A cut-out piece of a chart that can travel between patterns (SPEC §15.6). */
export interface Fragment {
  sourceId: string;
  size: Size;
  mask: Uint8Array;
  layers: Partial<Record<LayerId, unknown>>;
  /** Key entries the piece uses, by their index in the source pattern (or a temporary index). */
  keys: Map<KeyIndex, KeyEntry>;
  blends: Record<string, Blend>;
  combos: Record<string, Combo>;
  customs: Record<string, CustomColor>;
  /** The pattern's own stamps the piece's entries place (core/stamps): they go along to another pattern. */
  stamps?: Record<string, StampDef>;
}

function collectColours(p: Pattern, keys: Iterable<KeyEntry>) {
  const blends: Record<string, Blend> = {}, combos: Record<string, Combo> = {}, customs: Record<string, CustomColor> = {}, stamps: Record<string, StampDef> = {};
  const addCustom = (id: string) => { if (p.customs[id]) customs[id] = p.customs[id]; };
  for (const e of keys) {
    const b = p.blends[e.src], c = p.combos[e.src];
    if (b) { blends[e.src] = b; b.parts.forEach((q) => addCustom(q.id)); }
    if (c) { combos[e.src] = c; addCustom(c.thread); addCustom(c.bead); }
    addCustom(e.src);
    if (e.stamp && p.stamps?.[e.stamp]) stamps[e.stamp] = p.stamps[e.stamp]!;
  }
  return { blends, combos, customs, ...(Object.keys(stamps).length ? { stamps } : {}) };
}

export function extractFragment(p: Pattern, mask: Uint8Array): Fragment | null {
  const size = { w: p.w, h: p.h };
  const b = boundsOfCells(mask.reduce<number[]>((a, v, i) => (v ? (a.push(i), a) : a), []), p.w);
  if (!b) return null;
  const layers: Fragment["layers"] = {};
  const keys = new Map<KeyIndex, KeyEntry>();
  for (const l of LAYERS) {
    const piece = l.extract(l.get(p.layers), mask, size, b);
    if (l.isEmpty(piece)) continue;
    layers[l.id] = piece;
    l.usage(piece, (k) => { const e = p.key[k]; if (e) keys.set(k, e); }, p);
  }
  const local = new Uint8Array(b.w * b.h);
  for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) local[y * b.w + x] = mask[(y + b.y) * p.w + x + b.x] ?? 0;
  return { sourceId: p.id, size: { w: b.w, h: b.h }, mask: local, layers, keys, ...collectColours(p, keys.values()) };
}

/** Flip or rotate a fragment in place; mirrored half crosses get twin entries inside the fragment. */
export function transformFragment(f: Fragment, t: CellTransform): Fragment {
  let next = Math.max(0, ...f.keys.keys()) + 1;
  const twins = new Map<KeyIndex, KeyIndex>();
  const ctx: TransformContext = {
    repoint(k) {
      const e = f.keys.get(k);
      if (!e || !entryKind(e.t).leans) return k;
      const st = mirroredStitchType(e.st);
      if (st === (e.st ?? "full")) return k;
      if (!twins.has(k)) {
        const twin = { ...e, st };
        const found = [...f.keys].find(([, o]) => sameKey(o, twin))?.[0];
        if (found !== undefined) twins.set(k, found);
        else { f.keys.set(next, { ...twin, sym: "" }); twins.set(k, next++); }
      }
      return twins.get(k)!;
    },
  };
  const layers: Fragment["layers"] = {};
  for (const l of LAYERS) if (f.layers[l.id] !== undefined) layers[l.id] = l.transform(f.layers[l.id], t, f.size, ctx);
  const maskLayer = LAYERS.find((l) => l.id === "stitches")!;
  const mask = new Uint8Array(maskLayer.transform(new Uint16Array(f.mask), t, f.size, { repoint: (k) => k }) as Uint16Array);
  return { ...f, layers, mask, size: t.newSize(f.size) };
}

/**
 * Paste a fragment with its top-left at `at`. Key entries are matched by `sameKey`; missing ones are added
 * together with their blends, combos and custom colours.
 */
export function insertFragment(p: Pattern, f: Fragment, at: Point, override: boolean, symbols: readonly string[]): void {
  for (const [id, b] of Object.entries(f.blends)) p.blends[id] ??= b;
  for (const [id, c] of Object.entries(f.combos)) p.combos[id] ??= c;
  for (const [id, c] of Object.entries(f.customs)) p.customs[id] ??= c;
  for (const [id, d] of Object.entries(f.stamps ?? {})) (p.stamps ??= {})[id] ??= d;
  const map = new Map<KeyIndex, KeyIndex>();
  for (const [k, e] of f.keys) {
    const same = f.sourceId === p.id && sameKey(p.key[k], e);
    map.set(k, same ? k : keyFor(p, { ...e, sym: e.sym && !p.key.some((o) => o && sameSymbol(o, e)) ? e.sym : undefined }, symbols));
  }
  const size = { w: p.w, h: p.h }, placed = new Set<number>();
  for (const l of LAYERS) {
    const piece = f.layers[l.id];
    if (piece === undefined) continue;
    const copy = l.clone(piece);
    l.remapKeys(copy, (k) => map.get(k) ?? 0);
    l.insert(l.get(p.layers), copy, f.size, at, size, { pattern: p, override, placed });
  }
}

export function clearMask(p: Pattern, mask: Uint8Array): void {
  const size = { w: p.w, h: p.h };
  for (const l of LAYERS) l.clearMask(l.get(p.layers), mask, size);
}
