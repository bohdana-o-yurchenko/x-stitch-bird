import type { CellTransform } from "../transform/cellTransform";
import type { KeyIndex, LayerId, Layers, PartialKindId, Pattern, Point, Rect, Size } from "../pattern/types";

export type UsageUnit = "cell" | "segment" | "segmentLength" | "knot" | PartialKindId;
export type UsageSink = (k: KeyIndex, unit: UsageUnit, amount: number) => void;
/** Old key index → new one; 0 removes the item. */
export type KeyMap = (k: KeyIndex) => KeyIndex;

export interface TransformContext {
  /** Entry to use for a mirrored copy of `k` (opposite half-cross direction). */
  repoint(k: KeyIndex): KeyIndex;
}

export interface InsertContext {
  pattern: Pattern;
  override: boolean;
  /** Cells this same insert (all its layers) has already put something in: what came along together stays together. */
  placed?: Set<number>;
}

/** What the eraser covers: whole cells (brush) and/or a point with a radius (grid units). */
export interface EraseTarget {
  cells: number[];
  point: Point;
  radius: number;
  /** Brush 1×1: partial stitches are erased by corner, not whole cell. */
  precise: boolean;
}

/** One kind of content on the chart. Code that touches "everything" loops over the registry (ARCHITECTURE §7.1). */
export interface LayerHandler<T = unknown> {
  id: LayerId;
  /** Not part of PNG/PDF/OXS/CSV exports (ambiguous marks). */
  exported: boolean;
  /** Lower picks first. */
  pickPriority: number;
  get(l: Layers): T;
  set(l: Layers, v: T): void;
  create(size: Size): T;
  clone(v: T): T;
  equals(a: T, b: T): boolean;
  isEmpty(v: T): boolean;
  /** Copy into a new size; `offset` is where the old (0,0) lands. */
  resize(v: T, from: Size, to: Size, offset: Point): T;
  transform(v: T, t: CellTransform, size: Size, ctx: TransformContext): T;
  /** Content under `mask`, re-based to `bounds` (size bounds.w × bounds.h). */
  extract(v: T, mask: Uint8Array, size: Size, bounds: Rect): T;
  /** Place a piece (from `extract`) with its top-left at `at`. Mutates `v`. */
  insert(v: T, piece: T, pieceSize: Size, at: Point, size: Size, ctx: InsertContext): void;
  clearMask(v: T, mask: Uint8Array, size: Size): void;
  /** Returns true if anything was erased. Mutates `v`. */
  erase(v: T, target: EraseTarget, size: Size): boolean;
  pickAt(v: T, at: Point, size: Size): KeyIndex;
  remapKeys(v: T, map: KeyMap): void;
  usage(v: T, sink: UsageSink): void;
  /** Bounding box of the content in cells, or null. */
  bounds(v: T, size: Size): Rect | null;
  serialize(v: T, map: KeyMap): unknown;
  parse(raw: unknown, size: Size): T;
}
