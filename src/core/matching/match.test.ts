import { describe, expect, it } from "vitest";
import { createPattern } from "../pattern/createPattern";
import { addEntry } from "../pattern/keyEntries";
import { ALL_SYMBOLS } from "../symbols/symbols";
import { parsePattern } from "../formats/json/parse";
import { serializePattern } from "../formats/json/serialize";
import { bar, blank, cross, gridded, letterT, letterY, printed, ring } from "../../../tests/support/printedPatch";
import { newUnderlay } from "../underlay/underlay";
import { blockAt, blockImageRect, cellPatches, centre, cleanSamples, decodePatch, encodePatch, learn, libraryExamples, matchBlock, MAX_SAMPLES, SIDE, type GreyImage, type Patch } from "./match";

describe("symbol matching in a block", () => {
  it("finds the 10 × 10 block between heavy lines, cut to the chart, following the numbering", () => {
    const p = createPattern(25, 25);
    expect(blockAt(p, 0, 0)).toEqual({ x: 0, y: 0, w: 10, h: 10 });
    expect(blockAt(p, 13, 27 - 5)).toEqual({ x: 10, y: 20, w: 10, h: 5 });
    p.grid = { ...p.grid, x0: 5 }; // first column numbered 5: heavy lines at columns 10, 20 … sit 6 cells in
    expect(blockAt(p, 2, 0)).toEqual({ x: 0, y: 0, w: 6, h: 10 });
    expect(blockAt(p, 7, 0)).toEqual({ x: 6, y: 0, w: 10, h: 10 });
  });

  it("proposes the entry whose examples look most like the cell, even a little out of line", () => {
    const patches = new Map<number, Patch>([[1, printed(cross, 1, -1, 3)], [2, printed(ring, -2, 1, 4)], [3, printed(bar, 0, 2, 5)], [4, printed(blank)]]);
    const r = matchBlock({ patches, empty: [1, 2, 3, 4], examples: new Map([[7, [printed(cross, 0, 0, 9)]], [8, [printed(ring, 0, 0, 10)]], [9, [printed(bar, 0, 0, 11)]]]) });
    expect(r.proposals).toEqual([{ cell: 1, k: 7 }, { cell: 2, k: 8 }, { cell: 3, k: 9 }]);
    expect(r.blank).toEqual([4]);
    expect(r.unsure).toEqual([]);
  });

  it("is unsure — and proposes nothing — for a symbol it has no example of", () => {
    const patches = new Map<number, Patch>([[1, printed(ring)]]);
    const r = matchBlock({ patches, empty: [1], examples: new Map([[7, [printed(cross)]], [9, [printed(bar)]]]) });
    expect(r.proposals).toEqual([]);
    expect(r.unsure).toEqual([1]);
  });

  it("keeps examples small and safe in the file: base64 bytes, the newest few per entry, by entry identity", () => {
    const p = createPattern(4, 4);
    const red = addEntry(p, { t: "thread", src: "dmc:321", n: 2, st: "full" }, ALL_SYMBOLS);
    const patch = printed(cross);
    expect(decodePatch(encodePatch(patch))).toEqual(patch);
    for (let n = 0; n < MAX_SAMPLES + 3; n++) learn(p, [{ k: red, patch: printed(cross, 0, 0, n + 2) }]);
    expect(p.samples!["thread|dmc:321|full"]).toHaveLength(MAX_SAMPLES);
    // saved and read back; found again for the entry wherever it sits in the key
    const back = parsePattern(serializePattern(p), ALL_SYMBOLS).pattern;
    expect(back.samples).toEqual(p.samples);
    expect(libraryExamples(back).get(red)).toHaveLength(MAX_SAMPLES);
    // anything that isn't a valid example is dropped on load
    expect(cleanSamples({ "thread|dmc:1|full": ["???", encodePatch(patch)], "x|y|z": [encodePatch(patch)], "bead|bead:1|": "nope" })).toEqual({ "thread|dmc:1|full": [encodePatch(patch)] });
    expect(cleanSamples(null)).toBeUndefined();
  });

  it("cuts each cell of a block out of the photo, following where the photo lies on the chart", () => {
    // a 3 × 2 chart over a 90 × 60 photo (30 px a cell), white with a dark square in the middle of cell (1, 0)
    const data = new Uint8Array(90 * 60).fill(230);
    for (let y = 9; y < 21; y++) for (let x = 39; x < 51; x++) data[y * 90 + x] = 30;
    const u = newUnderlay("img", 90, 60, { w: 3, h: 2 }), block = { x: 0, y: 0, w: 3, h: 2 };
    expect(u.rect).toEqual({ x: 0, y: 0, w: 3, h: 2 });
    const area = blockImageRect(u, block);
    expect(area).toEqual({ x: 0, y: 0, w: 90, h: 60 });
    const img: GreyImage = { ...area, data };
    const patches = cellPatches(u, img, block, 3);
    expect([...patches.keys()]).toEqual([0, 1, 2, 3, 4, 5]);
    const mid = (p: Patch) => p[10 * SIDE + 10]!, corner = (p: Patch) => p[1 * SIDE + 1]!;
    expect(mid(patches.get(1)!)).toBeLessThan(60);
    expect(corner(patches.get(1)!)).toBeGreaterThan(200);
    expect(mid(patches.get(0)!)).toBeGreaterThan(200);
    // moved half a cell right: column 0 is half off the photo, so it gets no patch
    const moved = { ...u, rect: { ...u.rect, x: 0.5 } }, partly = cellPatches(moved, { ...blockImageRect(moved, block), data }, block, 3);
    expect([...partly.keys()]).toEqual([1, 2, 4, 5]);
  });

  it("tells a T from a Y when the cells are a few pixels out of line, however many examples each has (a T was read as a Y)", () => {
    const T = gridded(letterT), Y = gridded(letterY);
    const examples = new Map([[1, [printed(T, 0, 0, 3)]], [2, [-3, -1, 0, 1, 2, 3].map((d, i) => printed(Y, d, -d, 20 + i))]]);
    const offsets = [[3, 2], [-3, 3], [4, -2], [-4, -3], [2, 4], [-2, -4]] as const;
    const patches = new Map<number, Patch>(), empty: number[] = [];
    offsets.forEach(([dx, dy], i) => {
      patches.set(i, printed(T, dx, dy, 40 + i));
      patches.set(10 + i, printed(Y, -dx, dy, 60 + i));
      empty.push(i, 10 + i);
    });
    const r = matchBlock({ patches, empty, examples });
    expect(r.proposals.filter((p) => p.cell < 10).map((p) => p.k)).toEqual([1, 1, 1, 1, 1, 1]);
    expect(r.proposals.filter((p) => p.cell >= 10).map((p) => p.k)).toEqual([2, 2, 2, 2, 2, 2]);
    // centring moves the symbol, not the paper: a blank stays blank
    const paper = printed(blank), moved = centre(paper);
    expect(Math.max(...[...moved].map((v, i) => Math.abs(v - paper[i]!)))).toBeLessThanOrEqual(4);
  });

  it("leaves an empty cell empty when a misaligned photo slides grid lines and bits of the neighbours' symbols into it", () => {
    const grid = gridded(() => false);
    const SYMS = [letterT, letterY, cross, ring];
    // the cell photographed with its own symbol (or none), the grid, and the neighbours beyond its four edges
    const shot = (own: ((x: number, y: number) => boolean) | null, nb: (x: number, y: number) => boolean) => (x: number, y: number) =>
      (own ? own(x, y) : false) || grid(x, y) || nb(x + 20, y) || nb(x - 20, y) || nb(x, y + 20) || nb(x, y - 20);
    const examples = new Map(SYMS.map((ink, i) => [i + 1, [printed(shot(ink, () => false), 0, 0, 50 + i)]]));
    const patches = new Map<number, Patch>(), empty: number[] = [];
    [[4, 0], [-4, 4], [0, -4], [4, 4], [-4, -4], [3, -4]].forEach(([dx, dy], i) => {
      patches.set(i, printed(shot(null, SYMS[i % 4]!), dx!, dy!, 70 + i));
      patches.set(10 + i, printed(shot(SYMS[i % 4]!, SYMS[(i + 1) % 4]!), dx! / 2, dy! / 2, 90 + i));
      empty.push(i, 10 + i);
    });
    const r = matchBlock({ patches, empty, examples });
    expect(r.proposals.filter((p) => p.cell < 10)).toEqual([]);
    expect(r.blank).toEqual([0, 1, 2, 3, 4, 5]);
    expect(r.proposals.filter((p) => p.cell >= 10).map((p) => [p.cell, p.k])).toEqual([0, 1, 2, 3, 4, 5].map((i) => [10 + i, (i % 4) + 1]));
  });
});

