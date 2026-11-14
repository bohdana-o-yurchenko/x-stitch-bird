import { describe, expect, it } from "vitest";
import { createPattern } from "../pattern/createPattern";
import { addEntry } from "../pattern/keyEntries";
import { extractFragment, insertFragment, transformFragment } from "../pattern/fragment";
import { ALL_SYMBOLS } from "../symbols/symbols";
import { TRANSFORMS } from "./cellTransform";
import { mirrorCells } from "./mirror";
import { cropToContent, extendCanvas, mirrorFromCentre, mirrorTargetHasContent, resizePattern, transformPattern } from "./wholeChart";

const withHalf = () => {
  const p = createPattern(4, 3);
  const half = addEntry(p, { t: "thread", src: "dmc:310", n: 2, st: "half" }, ALL_SYMBOLS);
  p.layers.stitches[0] = half;
  return { p, half };
};

describe("whole-chart transforms", () => {
  it("flips a ╱ half cross into a new ╲ entry and reports it", () => {
    const { p, half } = withHalf();
    const report = transformPattern(p, TRANSFORMS.flipH, ALL_SYMBOLS);
    const k = p.layers.stitches[3]!;
    expect(report.newTwins).toBe(1);
    expect(k).not.toBe(half);
    expect(p.key[k]).toMatchObject({ src: "dmc:310", n: 2, st: "halfb" });
  });

  it("re-uses an existing twin and keeps direction on a half turn", () => {
    const { p } = withHalf();
    const twin = addEntry(p, { t: "thread", src: "dmc:310", n: 2, st: "halfb" }, ALL_SYMBOLS);
    expect(transformPattern(p, TRANSFORMS.rot90cw, ALL_SYMBOLS).newTwins).toBe(0);
    expect(p.layers.stitches.includes(twin)).toBe(true);
    expect({ w: p.w, h: p.h }).toEqual({ w: 3, h: 4 });
    const before = p.layers.stitches.slice();
    transformPattern(p, TRANSFORMS.rot180, ALL_SYMBOLS);
    expect([...p.layers.stitches].sort()).toEqual([...before].sort());
  });

  it("maps partial-stitch corners on a flip", () => {
    const p = createPattern(2, 2);
    p.layers.partials.set(0, [{ kind: "quarter", corner: 0, k: 1 }]);
    transformPattern(p, TRANSFORMS.flipH, ALL_SYMBOLS);
    expect(p.layers.partials.get(1)).toEqual([{ kind: "quarter", corner: 1, k: 1 }]);
  });

  it("mirrors the left half onto the right, keeping the odd centre column and half-cross direction", () => {
    const p = createPattern(5, 1);
    const k = addEntry(p, { t: "thread", src: "dmc:310", n: 2, st: "full" }, ALL_SYMBOLS);
    const half = addEntry(p, { t: "thread", src: "dmc:321", n: 2, st: "half" }, ALL_SYMBOLS);
    p.layers.stitches.set([k, half, k, 0, 0]);
    p.layers.segments.push({ x1: 1, y1: 0, x2: 1, y2: 1, k });
    expect(mirrorTargetHasContent(p, "leftToRight")).toBe(false);
    mirrorFromCentre(p, "leftToRight");
    expect([...p.layers.stitches]).toEqual([k, half, k, half, k]);
    expect(p.key).toHaveLength(3);
    expect(p.layers.segments).toHaveLength(2);
  });

  it("resizes around the centre, extends and crops to content", () => {
    const p = createPattern(4, 4);
    p.layers.stitches[5] = 1;
    resizePattern(p, 6, 6, "centre");
    expect(p.layers.stitches[2 * 6 + 2]).toBe(1);
    extendCanvas(p, { left: 1, right: 0, top: 0, bottom: 2 });
    expect({ w: p.w, h: p.h }).toEqual({ w: 7, h: 8 });
    expect(cropToContent(p, 1)).toBe(true);
    expect({ w: p.w, h: p.h }).toEqual({ w: 3, h: 3 });
    expect(p.layers.stitches[4]).toBe(1);
  });

  it("mirror drawing: quad mode copies into all four quarters", () => {
    expect(mirrorCells(0, 0, "quad", { w: 4, h: 4 })).toEqual([{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 0, y: 3 }, { x: 3, y: 3 }]);
  });
});

describe("fragments", () => {
  it("pastes into another pattern, adding missing entries and their blends", () => {
    const src = createPattern(3, 3);
    src.blends["blend:x"] = { parts: [{ id: "dmc:310", n: 1 }, { id: "dmc:White", n: 1 }] };
    const k = addEntry(src, { t: "thread", src: "blend:x", n: null, st: "half" }, ALL_SYMBOLS);
    src.layers.stitches[4] = k;
    const mask = new Uint8Array(9).fill(1);
    const f = transformFragment(extractFragment(src, mask)!, TRANSFORMS.flipH);

    const dst = createPattern(5, 5);
    insertFragment(dst, f, { x: 2, y: 2 }, false, ALL_SYMBOLS);
    const placed = dst.layers.stitches[3 * 5 + 3]!;
    expect(dst.blends["blend:x"]).toBeDefined();
    expect(dst.key[placed]).toMatchObject({ src: "blend:x", st: "halfb" });
  });

  it("respects override off when pasting onto stitches", () => {
    const p = createPattern(2, 1);
    const a = addEntry(p, { t: "thread", src: "dmc:310", n: 2, st: "full" }, ALL_SYMBOLS);
    const b = addEntry(p, { t: "thread", src: "dmc:321", n: 2, st: "full" }, ALL_SYMBOLS);
    p.layers.stitches.set([a, 0]);
    const f = extractFragment(p, new Uint8Array([1, 0]))!;
    p.layers.stitches.set([b, b]);
    insertFragment(p, f, { x: 0, y: 0 }, false, ALL_SYMBOLS);
    expect([...p.layers.stitches]).toEqual([b, b]);
    insertFragment(p, f, { x: 0, y: 0 }, true, ALL_SYMBOLS);
    expect([...p.layers.stitches]).toEqual([a, b]);
  });
});
