import { majorOffset } from "../grid/numbering";
import type { KeyEntry, KeyIndex, Pattern, Rect } from "../pattern/types";
import { gridToImage, type UnderlayData } from "../underlay/underlay";

/*
 * Symbol matching in one 10 × 10 block (SPEC §15.11): which printed symbol is in each empty cell of the block, read
 * off the photo behind the chart. Plain image arithmetic: grey patches, normalised cross-correlation, a small
 * shift to forgive the alignment. The examples are the cells already stitched — in this block, and the ones
 * learned from earlier blocks (saved with the pattern, `Pattern.samples`).
 */

/** A cell as cut out of the photo: SIDE × SIDE grey values (0–255), covering the whole cell. */
export const SIDE = 20;
/** The part compared: the middle INNER × INNER (the inner 80% of the cell, without the grid lines). */
export const INNER = 16;
/** How far (px) the middle may be shifted each way when comparing: the alignment is never perfect. */
const SHIFT = (SIDE - INNER) / 2;
/** Examples kept per key entry (the newest). */
export const MAX_SAMPLES = 8;
const SURE_SCORE = 0.6, SURE_MARGIN = 0.1, ONLY_ONE_SCORE = 0.72;

export type Patch = Uint8Array;

/** The 10 × 10 block (between heavy grid lines, as numbered) that holds cell (x, y), cut to the chart. */
export function blockAt(p: Pattern, x: number, y: number): Rect {
  const size = { w: p.w, h: p.h }, mx = majorOffset(p.grid, "x", size), my = majorOffset(p.grid, "y", size);
  const x0 = x - ((((x - mx) % 10) + 10) % 10), y0 = y - ((((y - my) % 10) + 10) % 10);
  const bx = Math.max(0, x0), by = Math.max(0, y0);
  return { x: bx, y: by, w: Math.min(p.w, x0 + 10) - bx, h: Math.min(p.h, y0 + 10) - by };
}

/** An entry's identity for learned examples: what it is, not where it sits in the key (indices change). */
export const sampleKey = (e: KeyEntry) => `${e.t}|${e.src}|${e.st ?? ""}`;

/** How far (px) centring may move a symbol: beyond that it's a neighbour's ink, not a misaligned cell. */
const MAX_CENTRING = 5;

/**
 * The patch with its symbol moved to the middle: the centre of its ink, without the chart's grid lines (rows and
 * columns inked nearly end to end — symbols don't reach that far). Comparing centred symbols leaves only small
 * offsets for the shift search; without it a cell that drifted more than SHIFT px only matched the entry with the
 * most examples (one of them happened to sit the same way): a T read as a Y.
 */
export function centre(patch: Patch): Patch {
  const sorted = [...patch].sort((a, b) => a - b), paper = sorted[Math.floor(sorted.length * 0.8)]!;
  const dark = (x: number, y: number) => paper - patch[y * SIDE + x]! > 25;
  const span = (n: number, at: (i: number) => boolean) => Array.from({ length: SIDE }, (_, i) => at(i)).filter(Boolean).length > n;
  const lineRow = Array.from({ length: SIDE }, (_, y) => span(SIDE * 0.9, (x) => dark(x, y)));
  const lineCol = Array.from({ length: SIDE }, (_, x) => span(SIDE * 0.9, (y) => dark(x, y)));
  let sw = 0, sx = 0, sy = 0;
  for (let y = 0; y < SIDE; y++)
    for (let x = 0; x < SIDE; x++) {
      if (lineRow[y] || lineCol[x]) continue;
      // well below the paper: print, not the paper's own grain
      const w = Math.max(0, paper - patch[y * SIDE + x]! - 20);
      sw += w;
      sx += w * (x + 0.5);
      sy += w * (y + 0.5);
    }
  if (sw < 1) return patch;
  const clamp = (v: number) => Math.max(-MAX_CENTRING, Math.min(MAX_CENTRING, v));
  const dx = clamp(sx / sw - SIDE / 2), dy = clamp(sy / sw - SIDE / 2);
  const at = (x: number, y: number) => (x < 0 || y < 0 || x > SIDE - 1 || y > SIDE - 1 ? paper : patch[y * SIDE + x]!);
  const out = new Uint8Array(patch.length);
  for (let y = 0; y < SIDE; y++)
    for (let x = 0; x < SIDE; x++) {
      const fx = x + dx, fy = y + dy, x0 = Math.floor(fx), y0 = Math.floor(fy), ax = fx - x0, ay = fy - y0;
      out[y * SIDE + x] = Math.round(at(x0, y0) * (1 - ax) * (1 - ay) + at(x0 + 1, y0) * ax * (1 - ay) + at(x0, y0 + 1) * (1 - ax) * ay + at(x0 + 1, y0 + 1) * ax * ay);
    }
  return out;
}

/** The middle INNER × INNER of a patch, shifted by (dx, dy), normalised: mean 0, length 1. Null when flat. */
function window(patch: Patch, dx: number, dy: number): Float32Array | null {
  const v = new Float32Array(INNER * INNER);
  let sum = 0;
  for (let y = 0; y < INNER; y++) for (let x = 0; x < INNER; x++) sum += v[y * INNER + x] = patch[(y + SHIFT + dy) * SIDE + x + SHIFT + dx]!;
  const mean = sum / v.length;
  let sq = 0;
  for (let i = 0; i < v.length; i++) sq += (v[i]! -= mean) ** 2;
  if (sq < 1e-6) return null;
  const k = 1 / Math.sqrt(sq);
  for (let i = 0; i < v.length; i++) v[i]! *= k;
  return v;
}

/** How much ink a patch's middle has: the spread of its grey values. */
export function inkiness(patch: Patch): number {
  let sum = 0, sq = 0, n = 0;
  for (let y = SHIFT; y < SHIFT + INNER; y++)
    for (let x = SHIFT; x < SHIFT + INNER; x++) {
      const v = patch[y * SIDE + x]!;
      sum += v;
      sq += v * v;
      n++;
    }
  return Math.sqrt(Math.max(0, sq / n - (sum / n) ** 2));
}

/** A patch's middle at every shift, normalised (flat ones left out): compared with each example in turn. */
function shifted(patch: Patch): Float32Array[] {
  const out: Float32Array[] = [];
  for (let dy = -SHIFT; dy <= SHIFT; dy++)
    for (let dx = -SHIFT; dx <= SHIFT; dx++) {
      const w = window(patch, dx, dy);
      if (w) out.push(w);
    }
  return out;
}

/** Best normalised cross-correlation of an example's middle with a patch, over all shifts. */
function score(example: Float32Array, windows: Float32Array[]): number {
  let best = -1;
  for (const w of windows) {
    let dot = 0;
    for (let i = 0; i < w.length; i++) dot += w[i]! * example[i]!;
    if (dot > best) best = dot;
  }
  return best;
}

export interface MatchInput {
  /** Every cell of the block, as cut out of the photo. */
  patches: Map<number, Patch>;
  /** Cells to fill: empty cells of the block. */
  empty: number[];
  /** Examples per key entry: patches of cells known to hold it. */
  examples: Map<KeyIndex, Patch[]>;
}

export interface MatchResult {
  /** Sure proposals: cell → key entry. */
  proposals: { cell: number; k: KeyIndex }[];
  /** Cells with a symbol the app was not sure about (left empty). */
  unsure: number[];
  /** Cells that look blank on the photo. */
  blank: number[];
}

export function matchBlock(input: MatchInput): MatchResult {
  const out: MatchResult = { proposals: [], unsure: [], blank: [] };
  // symbols are compared centred (examples are stored as photographed; centring happens here)
  const examples = [...input.examples].map(([k, list]) => ({ k, list: list.map((p) => window(centre(p), 0, 0)).filter((w): w is Float32Array => !!w) })).filter((e) => e.list.length);
  // what counts as blank: little ink compared with the cells known to hold symbols (and never a faint smudge)
  const inks = [...input.examples.values()].flat().map(inkiness).sort((a, b) => a - b);
  const typical = inks.length ? inks[Math.floor(inks.length / 2)]! : 40;
  const blankBelow = Math.max(6, typical * 0.3);
  for (const cell of input.empty) {
    const patch = input.patches.get(cell);
    if (!patch) continue;
    if (inkiness(patch) < blankBelow) {
      out.blank.push(cell);
      continue;
    }
    const windows = shifted(centre(patch));
    const scores = examples.map((e) => ({ k: e.k, s: Math.max(...e.list.map((ex) => score(ex, windows))) })).sort((a, b) => b.s - a.s);
    const [first, second] = scores;
    const sure = !!first && (second ? first.s >= SURE_SCORE && first.s - second.s >= SURE_MARGIN : first.s >= ONLY_ONE_SCORE);
    if (sure) out.proposals.push({ cell, k: first.k });
    else out.unsure.push(cell);
  }
  return out;
}

/** Part of the photo as grey values: `w` × `h` pixels, the first being image pixel (x, y). */
export interface GreyImage {
  x: number;
  y: number;
  w: number;
  h: number;
  data: Uint8Array;
}

/** The photo pixels under a block (a pixel to spare), within the image's visible part. */
export function blockImageRect(u: UnderlayData, b: Rect): Rect {
  const pts = [{ x: b.x, y: b.y }, { x: b.x + b.w, y: b.y }, { x: b.x + b.w, y: b.y + b.h }, { x: b.x, y: b.y + b.h }].map((pt) => gridToImage(u, pt));
  const x0 = Math.max(Math.floor(u.crop.x), Math.floor(Math.min(...pts.map((pt) => pt.x))) - 1), y0 = Math.max(Math.floor(u.crop.y), Math.floor(Math.min(...pts.map((pt) => pt.y))) - 1);
  const x1 = Math.min(Math.ceil(u.crop.x + u.crop.w), Math.ceil(Math.max(...pts.map((pt) => pt.x))) + 1), y1 = Math.min(Math.ceil(u.crop.y + u.crop.h), Math.ceil(Math.max(...pts.map((pt) => pt.y))) + 1);
  return { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) };
}

/**
 * Every cell of a block cut out of the photo as a patch (`chartW`: the chart's width, for cell numbers). Each patch
 * pixel averages 2 × 2 points, so thin printed lines aren't skipped; cells partly off the photo get no patch.
 */
export function cellPatches(u: UnderlayData, img: GreyImage, b: Rect, chartW: number): Map<number, Patch> {
  const out = new Map<number, Patch>();
  const at = (px: number, py: number) => {
    const x = Math.min(img.w - 1, Math.max(0, px - img.x - 0.5)), y = Math.min(img.h - 1, Math.max(0, py - img.y - 0.5));
    const x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(img.w - 1, x0 + 1), y1 = Math.min(img.h - 1, y0 + 1), fx = x - x0, fy = y - y0;
    const d = img.data, top = d[y0 * img.w + x0]! * (1 - fx) + d[y0 * img.w + x1]! * fx, bottom = d[y1 * img.w + x0]! * (1 - fx) + d[y1 * img.w + x1]! * fx;
    return top * (1 - fy) + bottom * fy;
  };
  const inside = (pt: { x: number; y: number }) => pt.x >= u.crop.x && pt.y >= u.crop.y && pt.x <= u.crop.x + u.crop.w && pt.y <= u.crop.y + u.crop.h;
  for (let cy = b.y; cy < b.y + b.h; cy++)
    for (let cx = b.x; cx < b.x + b.w; cx++) {
      if (![{ x: cx, y: cy }, { x: cx + 1, y: cy + 1 }, { x: cx + 1, y: cy }, { x: cx, y: cy + 1 }].every((pt) => inside(gridToImage(u, pt)))) continue;
      const patch = new Uint8Array(SIDE * SIDE);
      for (let j = 0; j < SIDE; j++)
        for (let i = 0; i < SIDE; i++) {
          let sum = 0;
          for (const [ox, oy] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]] as const) {
            const pt = gridToImage(u, { x: cx + (i + ox) / SIDE, y: cy + (j + oy) / SIDE });
            sum += at(pt.x, pt.y);
          }
          patch[j * SIDE + i] = Math.round(sum / 4);
        }
      out.set(cy * chartW + cx, patch);
    }
  return out;
}

/** Learned examples as stored in the file: base64 of SIDE × SIDE bytes each. */
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function encodePatch(p: Patch): string {
  let s = "";
  for (let i = 0; i < p.length; i += 3) {
    const n = (p[i]! << 16) | ((p[i + 1] ?? 0) << 8) | (p[i + 2] ?? 0);
    s += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]! + (i + 1 < p.length ? B64[(n >> 6) & 63]! : "=") + (i + 2 < p.length ? B64[n & 63]! : "=");
  }
  return s;
}

/** A stored example back to its bytes; null if it isn't one (wrong characters or size). */
export function decodePatch(s: string): Patch | null {
  if (typeof s !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(s)) return null;
  const bytes: number[] = [];
  for (let i = 0; i < s.length; i += 4) {
    const n = [0, 1, 2, 3].map((j) => (s[i + j] === "=" || s[i + j] === undefined ? 0 : B64.indexOf(s[i + j]!)));
    const v = (n[0]! << 18) | (n[1]! << 12) | (n[2]! << 6) | n[3]!;
    bytes.push((v >> 16) & 255);
    if (s[i + 2] !== "=") bytes.push((v >> 8) & 255);
    if (s[i + 3] !== "=") bytes.push(v & 255);
  }
  return bytes.length === SIDE * SIDE ? Uint8Array.from(bytes) : null;
}

/** Adds examples to the pattern's library: the newest MAX_SAMPLES per entry are kept. */
export function learn(p: Pattern, found: { k: KeyIndex; patch: Patch }[]) {
  const lib = { ...(p.samples ?? {}) };
  for (const { k, patch } of found) {
    const e = p.key[k];
    if (!e) continue;
    const key = sampleKey(e), code = encodePatch(patch), list = (lib[key] ?? []).filter((x) => x !== code);
    lib[key] = [...list, code].slice(-MAX_SAMPLES);
  }
  p.samples = lib;
}

/** The library's examples for the key's entries (by identity), decoded. */
export function libraryExamples(p: Pattern): Map<KeyIndex, Patch[]> {
  const out = new Map<KeyIndex, Patch[]>();
  if (!p.samples) return out;
  p.key.forEach((e, k) => {
    if (!e || !k || out.has(k)) return;
    const list = (p.samples![sampleKey(e)] ?? []).map(decodePatch).filter((x): x is Patch => !!x);
    if (list.length) out.set(k, list);
  });
  return out;
}

/** Only what the format allows: up to 200 entries × MAX_SAMPLES examples that decode. */
export function cleanSamples(v: unknown): Record<string, string[]> | undefined {
  if (!v || typeof v !== "object") return undefined;
  const out: Record<string, string[]> = {};
  for (const [key, list] of Object.entries(v as Record<string, unknown>).slice(0, 200)) {
    if (!/^(thread|combo|bead|back|knot)\|[^|]{1,80}\|(full|half|halfb)?$/.test(key) || !Array.isArray(list)) continue;
    const ok = list.filter((s) => typeof s === "string" && decodePatch(s)).slice(-MAX_SAMPLES) as string[];
    if (ok.length) out[key] = ok;
  }
  return Object.keys(out).length ? out : undefined;
}
