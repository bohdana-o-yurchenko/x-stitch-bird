import { describe, expect, it } from "vitest";
import { ALL_SYMBOLS } from "../symbols/symbols";
import { TRANSFORMS } from "../transform/cellTransform";
import { createPattern } from "./createPattern";
import { clearMask, extractFragment, insertFragment, transformFragment } from "./fragment";
import { addEntry } from "./keyEntries";
import type { Pattern } from "./types";

/* A piece of chart carried between places and patterns (SPEC §15.6): copy, paste, clear — every layer, every key. */
function rich() {
  const p = createPattern(8, 6, "Src");
  p.customs["custom:a"] = { id: "custom:a", kind: "thread", brand: "Anchor", code: "403", name: "Black", hex: "#111111" };
  p.blends["blend:a"] = { parts: [{ id: "dmc:310", n: 1 }, { id: "custom:a", n: 1 }] };
  p.combos["combo:a"] = { thread: "dmc:321", bead: "bead:00557" };
  const cross = addEntry(p, { t: "thread", src: "dmc:310", n: 2, st: "full" }, ALL_SYMBOLS);
  const half = addEntry(p, { t: "thread", src: "dmc:321", n: 2, st: "half" }, ALL_SYMBOLS);
  const blend = addEntry(p, { t: "thread", src: "blend:a", n: null, st: "full" }, ALL_SYMBOLS);
  const combo = addEntry(p, { t: "combo", src: "combo:a", n: 2, st: "full" }, ALL_SYMBOLS);
  const bead = addEntry(p, { t: "bead", src: "bead:02011" }, ALL_SYMBOLS);
  const back = addEntry(p, { t: "back", src: "dmc:310", n: 1 }, ALL_SYMBOLS);
  const knot = addEntry(p, { t: "knot", src: "dmc:310", n: 2 }, ALL_SYMBOLS);
  const w = p.w;
  const L = p.layers;
  L.stitches[1 * w + 1] = cross;
  L.stitches[1 * w + 2] = half;
  L.stitches[2 * w + 1] = blend;
  L.stitches[2 * w + 2] = combo;
  L.beads[1 * w + 3] = bead;
  L.partials.set(2 * w + 3, [{ kind: "quarter", corner: 1, k: cross }]);
  L.segments.push({ x1: 1, y1: 1, x2: 3, y2: 1, k: back });
  L.knots.push({ x: 2.5, y: 2.5, k: knot });
  L.ambiguous.add(1 * w + 1);
  // outside the piece
  L.stitches[5 * w + 6] = cross;
  L.segments.push({ x1: 6, y1: 5, x2: 7, y2: 5, k: back });
  const mask = new Uint8Array(w * p.h);
  for (let y = 1; y <= 2; y++) for (let x = 1; x <= 3; x++) mask[y * w + x] = 1;
  return { p, mask, cross, half };
}

const names = (p: Pattern) => p.key.filter(Boolean).map((e) => `${e!.t}:${e!.src}:${e!.st ?? ""}`).sort();

describe("copying a piece", () => {
  it("takes what is under the mask from every layer, in a box as small as the piece", () => {
    const { p, mask } = rich();
    const f = extractFragment(p, mask)!;
    expect(f.size).toEqual({ w: 3, h: 2 });
    expect(Object.keys(f.layers).sort()).toEqual(["ambiguous", "beads", "knots", "partials", "segments", "stitches"]);
    expect(f.keys.size).toBe(7);
  });

  it("carries the blends, combos and custom colours the piece uses, and no others", () => {
    const { p, mask } = rich();
    p.customs["custom:unused"] = { id: "custom:unused", kind: "thread", brand: "X", code: "1", name: "n", hex: "#000000" };
    const f = extractFragment(p, mask)!;
    expect(Object.keys(f.blends)).toEqual(["blend:a"]);
    expect(Object.keys(f.combos)).toEqual(["combo:a"]);
    expect(Object.keys(f.customs)).toEqual(["custom:a"]);
  });

  it("a mask with nothing in it gives nothing; an area with no stitches has no layers", () => {
    const { p } = rich();
    expect(extractFragment(p, new Uint8Array(p.w * p.h))).toBeNull();
    const none = new Uint8Array(p.w * p.h);
    none[0] = 1;
    expect(extractFragment(p, none)!.layers).toEqual({});
  });
});

describe("pasting", () => {
  it("into another pattern brings its keys, blends, combos and customs, and every layer lands where asked", () => {
    const { p, mask } = rich();
    const f = extractFragment(p, mask)!;
    const dst = createPattern(10, 10, "Dst");
    insertFragment(dst, f, { x: 4, y: 3 }, false, ALL_SYMBOLS);
    expect(names(dst)).toEqual(names(p));
    expect(dst.key.filter(Boolean)).toHaveLength(7);
    expect(Object.keys(dst.blends)).toEqual(["blend:a"]);
    expect(Object.keys(dst.combos)).toEqual(["combo:a"]);
    expect(Object.keys(dst.customs)).toEqual(["custom:a"]);
    const at = (x: number, y: number) => dst.layers.stitches[(3 + y) * 10 + 4 + x]!;
    expect([at(0, 0), at(1, 0), at(0, 1), at(1, 1)].every(Boolean)).toBe(true);
    expect(dst.key[at(0, 0)]).toMatchObject({ src: "dmc:310" });
    expect(dst.layers.beads[3 * 10 + 4 + 2]).toBeGreaterThan(0);
    expect(dst.layers.segments).toEqual([expect.objectContaining({ x1: 4, y1: 3, x2: 6, y2: 3 })]);
    expect(dst.layers.knots).toEqual([expect.objectContaining({ x: 5.5, y: 4.5 })]);
    expect(dst.layers.partials.has(4 * 10 + 6)).toBe(true);
    expect(dst.layers.ambiguous.has(3 * 10 + 4)).toBe(true);
    // the source is untouched
    expect(p.layers.stitches[1 * 8 + 1]).toBeGreaterThan(0);
  });

  it("into the same pattern re-uses its entries instead of making twins", () => {
    const { p, mask } = rich();
    const f = extractFragment(p, mask)!;
    const keys = p.key.length;
    insertFragment(p, f, { x: 4, y: 3 }, false, ALL_SYMBOLS);
    expect(p.key).toHaveLength(keys);
    expect(p.layers.stitches[3 * 8 + 4]).toBe(p.layers.stitches[1 * 8 + 1]);
  });

  it("only what fits in the chart is pasted, the rest is cut off at the edge", () => {
    const { p, mask } = rich();
    const f = extractFragment(p, mask)!;
    const dst = createPattern(5, 5, "Small");
    insertFragment(dst, f, { x: 3, y: 4 }, false, ALL_SYMBOLS);
    expect(dst.layers.stitches.length).toBe(25);
    expect(dst.layers.stitches[4 * 5 + 3]).toBeGreaterThan(0);
    expect(dst.layers.stitches[4 * 5 + 4]).toBeGreaterThan(0);
    expect([...dst.layers.stitches].filter(Boolean)).toHaveLength(2);
    insertFragment(dst, f, { x: 20, y: 20 }, false, ALL_SYMBOLS);
    expect([...dst.layers.stitches].filter(Boolean)).toHaveLength(2);
  });

  it("without override the stitches already there stay; with it they are replaced", () => {
    const { p, mask } = rich();
    const f = extractFragment(p, mask)!;
    const dst = createPattern(10, 10, "Dst");
    const other = addEntry(dst, { t: "thread", src: "dmc:699", n: 2, st: "full" }, ALL_SYMBOLS);
    dst.layers.stitches[3 * 10 + 4] = other;
    insertFragment(dst, f, { x: 4, y: 3 }, false, ALL_SYMBOLS);
    expect(dst.layers.stitches[3 * 10 + 4]).toBe(other);
    insertFragment(dst, f, { x: 4, y: 3 }, true, ALL_SYMBOLS);
    expect(dst.layers.stitches[3 * 10 + 4]).not.toBe(other);
  });

  it("a cross and a bead sharing a cell (an older chart) move together; a pasted bead never lands on a cross already there", () => {
    const p = createPattern(6, 2, "Old");
    const cross = addEntry(p, { t: "thread", src: "dmc:310", n: 2, st: "full" }, ALL_SYMBOLS);
    const bead = addEntry(p, { t: "bead", src: "bead:02011" }, ALL_SYMBOLS);
    p.layers.stitches[0] = cross;
    p.layers.beads[0] = bead;
    const mask = new Uint8Array(12);
    mask[0] = 1;
    const f = extractFragment(p, mask)!;
    clearMask(p, mask);
    insertFragment(p, f, { x: 2, y: 0 }, false, ALL_SYMBOLS);
    expect([p.layers.stitches[2], p.layers.beads[2]]).toEqual([cross, bead]);
    // only the bead, onto a cross: not without override; with it, the cross goes
    const only = createPattern(6, 2, "Bead");
    const mask2 = new Uint8Array(12);
    mask2[0] = 1;
    only.layers.beads[0] = addEntry(only, { t: "bead", src: "bead:02011" }, ALL_SYMBOLS);
    const g = extractFragment(only, mask2)!;
    p.layers.stitches[4] = cross;
    insertFragment(p, g, { x: 4, y: 0 }, false, ALL_SYMBOLS);
    expect([p.layers.stitches[4], p.layers.beads[4]]).toEqual([cross, 0]);
    insertFragment(p, g, { x: 4, y: 0 }, true, ALL_SYMBOLS);
    expect([p.layers.stitches[4], p.layers.beads[4]]).toEqual([0, bead]);
  });

  it("a symbol the destination already uses is not reused for another entry", () => {
    const { p, mask } = rich();
    const f = extractFragment(p, mask)!;
    const dst = createPattern(10, 10, "Dst");
    const taken = addEntry(dst, { t: "thread", src: "dmc:699", n: 2, st: "full", sym: p.key[1]!.sym }, ALL_SYMBOLS);
    insertFragment(dst, f, { x: 0, y: 0 }, false, ALL_SYMBOLS);
    const syms = dst.key.filter(Boolean).map((e) => e!.sym);
    expect(new Set(syms).size).toBe(syms.length);
    expect(dst.key[taken]!.sym).toBe(p.key[1]!.sym);
  });
});

describe("turning a piece before pasting it", () => {
  it("a flipped half cross becomes its twin, other entries stay, nothing is lost", () => {
    const { p, mask } = rich();
    const f = transformFragment(extractFragment(p, mask)!, TRANSFORMS.flipH);
    const twin = [...f.keys.values()].filter((e) => e.src === "dmc:321" && e.t === "thread");
    expect(twin.map((e) => e.st).sort()).toEqual(["half", "halfb"]);
    expect(f.size).toEqual({ w: 3, h: 2 });
    const dst = createPattern(10, 10, "Dst");
    insertFragment(dst, f, { x: 0, y: 0 }, false, ALL_SYMBOLS);
    // the half cross at the piece's second column moves to its second column from the other side, mirrored
    const i = dst.layers.stitches[0 * 10 + 1]!;
    expect(dst.key[i]).toMatchObject({ src: "dmc:321", st: "halfb" });
  });

  it("a quarter turn swaps the piece's width and height, and four turns bring it home", () => {
    const { p, mask } = rich();
    const f = extractFragment(p, mask)!;
    const turned = transformFragment(f, TRANSFORMS.rot90cw);
    expect(turned.size).toEqual({ w: 2, h: 3 });
    let again = f;
    for (let i = 0; i < 4; i++) again = transformFragment(again, TRANSFORMS.rot90cw);
    expect(again.size).toEqual(f.size);
    expect([...(again.layers.stitches as Uint16Array)].map((k) => again.keys.get(k)?.src ?? 0)).toEqual([...(f.layers.stitches as Uint16Array)].map((k) => f.keys.get(k)?.src ?? 0));
    expect(again.layers.segments).toEqual(f.layers.segments);
    expect(again.layers.knots).toEqual(f.layers.knots);
  });
});

describe("clearing a piece", () => {
  it("removes everything under the mask from every layer, and nothing outside", () => {
    const { p, mask } = rich();
    clearMask(p, mask);
    const L = p.layers;
    expect(L.stitches[1 * 8 + 1]).toBe(0);
    expect(L.beads[1 * 8 + 3]).toBe(0);
    expect(L.partials.size).toBe(0);
    expect(L.knots).toHaveLength(0);
    expect(L.ambiguous.size).toBe(0);
    expect(L.stitches[5 * 8 + 6]).toBeGreaterThan(0);
    expect(L.segments).toHaveLength(1);
    expect(L.segments[0]).toMatchObject({ x1: 6, y1: 5 });
  });
});
