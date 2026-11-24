/** Index into `Pattern.key`. 0 always means "nothing". */
export type KeyIndex = number;

/** `point`: beads only (plain or with floss) — sewn on a grid point, like a French knot, not in a cell. */
export type StitchTypeId = "full" | "half" | "halfb" | "point";
export type EntryKindId = "thread" | "combo" | "bead" | "back" | "knot";
export type PartialKindId = "quarter" | "threeQuarter" | "petite";
/** Cell corner: 0 top-left, 1 top-right, 2 bottom-right, 3 bottom-left. */
export type Corner = 0 | 1 | 2 | 3;

export interface KeyEntry {
  t: EntryKindId;
  /** Colour id: `dmc:…`, `bead:…`, `custom:…`, `blend:…` or `combo:…`. */
  src: string;
  /** Strands; `null` for blends (each part carries its own). */
  n?: number | null;
  st?: StitchTypeId;
  sym: string;
  wraps?: number;
  /** Backstitch only: the line's colour on the Symbols view and the PDF chart to print; absent = black. */
  ink?: string;
  /**
   * Backstitch only: placed as this stamp — a fixed block of straight stitches (Smyrna cross, one's own; core/stamps) —
   * instead of one line at a time. Absent: plain backstitch lines.
   */
  stamp?: string;
}

export interface BlendPart {
  id: string;
  n: number;
}
export interface Blend {
  parts: BlendPart[];
}
export interface Combo {
  thread: string;
  bead: string;
}
export interface CustomColor {
  id: string;
  kind: "thread" | "bead";
  brand: string;
  code: string;
  name: string;
  hex: string;
  series?: string;
}

/** Points are in grid units with half-unit precision (0..w, 0..h). */
export interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  k: KeyIndex;
}
export interface Knot {
  x: number;
  y: number;
  k: KeyIndex;
}
export interface PartialStitch {
  kind: PartialKindId;
  corner: Corner;
  k: KeyIndex;
}

/** A line inside a stamp, in half-grid units from the stamp's top-left corner (0..w, 0..h). */
export interface StampLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** A stamp: a fixed block of `w`×`h` cells and the straight stitches in it, placed as one (ARCHITECTURE-REVIEW §3). */
export interface StampDef {
  id: string;
  name: string;
  w: number;
  h: number;
  lines: StampLine[];
}

/**
 * A stamp on the chart: its block (top-left cell, size as placed) and how it's turned — `m` maps the stamp's own
 * directions onto the chart's ([a, b, c, d]: x' = a·x + b·y, y' = c·x + d·y around the block's middle); absent: as drawn.
 */
export interface Stamp {
  x: number;
  y: number;
  w: number;
  h: number;
  def: string;
  k: KeyIndex;
  m?: [number, number, number, number];
}

export interface Layers {
  stitches: Uint16Array;
  beads: Uint16Array;
  partials: Map<number, PartialStitch[]>;
  segments: Segment[];
  knots: Knot[];
  ambiguous: Set<number>;
  stamps: Stamp[];
}
export type LayerId = keyof Layers;

export interface PatternMeta {
  designer?: string;
  publisher?: string;
  source?: string;
  sourceYear?: string;
  sourceRef?: string;
  copyright?: string;
  notes?: string;
  instructions?: string;
  mappedBy?: string;
  mappedDate?: string;
}

export interface GridNumbering {
  x0: number;
  y0: number;
  label: 10 | 5;
  fromCentre: boolean;
}

export interface Pattern {
  id: string;
  name: string;
  w: number;
  h: number;
  /** Fabric count; 14.01 / 16.01 encode "28 / 32 ct over 2" (SPEC §3.1). Use `Math.floor` for maths. */
  count: number;
  strands: number;
  fabric: string;
  meta: PatternMeta;
  grid: GridNumbering;
  key: (KeyEntry | null)[];
  blends: Record<string, Blend>;
  combos: Record<string, Combo>;
  customs: Record<string, CustomColor>;
  /** Thread brands, by name, in the picker's order (SPEC §15.28). Optional: absent means DMC (core/pattern/brands). */
  brands?: string[];
  /** Only its one thread brand: the key form offers no other (SPEC §15.31). */
  onlyBrand?: boolean;
  /** Bead brands, by name (SPEC §15.31). Absent: all built-in ones. */
  beadBrands?: string[];
  /** Only its one bead brand. */
  onlyBeadBrand?: boolean;
  /** No beads in this pattern: the key form offers no bead or floss + bead. */
  noBeads?: boolean;
  /** The pattern's own stamps, by id (`own:…`); the built-in ones (Smyrna crosses) aren't stored. */
  stamps?: Record<string, StampDef>;
  layers: Layers;
  /** Active work time in ms (SPEC §15.17). Counted by the editor, never edited by hand, not part of undo. */
  spent: number;
  /**
   * Symbol matching (SPEC §15.11): photo examples learned per key entry, by `sampleKey` ("thread|dmc:310|full"),
   * base64 grey patches. Optional; not part of undo.
   */
  samples?: Record<string, string[]>;
}

export interface Size {
  w: number;
  h: number;
}
export interface Point {
  x: number;
  y: number;
}
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
