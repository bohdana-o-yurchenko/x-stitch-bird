import { describe, expect, it } from "vitest";
import { cellLabel, isMajorLine, majorOffset, parseCellRef, rulerLabels } from "../grid/numbering";
import { ALL_SYMBOLS } from "../symbols/symbols";
import { createPattern } from "./createPattern";
import { addEntry, findSameKey, fixEntrySymbols } from "./keyEntries";
import { LINE_STYLES } from "../symbols/lineStyles";
import { formatLabel, keyLabelData } from "../labels/keyLabel";
import { translateEn } from "../../../tests/support/fixtures";
import { canPlacePartial, clearForPartial } from "./occupancy";
import { partialsLayer } from "../layers/partials";
import { mirrorPoints } from "../transform/mirror";
import { mirrorHalves } from "../transform/wholeChart";

describe("occupancy (override off)", () => {
  const p = createPattern(3, 1);
  addEntry(p, { t: "thread", src: "dmc:310", n: 2, st: "full" }, ALL_SYMBOLS);
  const half = addEntry(p, { t: "thread", src: "dmc:310", n: 2, st: "half" }, ALL_SYMBOLS);

  it("fits two three-quarters along one diagonal, not a third quarter in their corners", () => {
    const q = createPattern(1, 1);
    q.layers.partials.set(0, [{ kind: "threeQuarter", corner: 0, k: 1 }]);
    expect(canPlacePartial(q, 0, "threeQuarter", 2)).toBe(true);
    expect(canPlacePartial(q, 0, "threeQuarter", 1)).toBe(false);
    expect(canPlacePartial(q, 0, "quarter", 2)).toBe(true);
    clearForPartial(q, 0, "threeQuarter", 1);
    expect(q.layers.partials.has(0)).toBe(false);
  });

  it("treats entries as duplicates only with the same colour, strands and stitch", () => {
    expect(findSameKey(p, { t: "thread", src: "dmc:310", n: 2, st: "half" })).toBe(half);
    expect(findSameKey(p, { t: "thread", src: "dmc:310", n: 3, st: "half" })).toBe(0);
  });
});

describe("entry symbols", () => {
  it("gives backstitch line styles and other entries characters, fixing older files", () => {
    const p = createPattern(2, 2);
    const back = addEntry(p, { t: "back", src: "dmc:310", n: 1 }, ALL_SYMBOLS);
    const cross = addEntry(p, { t: "thread", src: "dmc:310", n: 2, st: "full" }, ALL_SYMBOLS);
    expect([p.key[back]!.sym, p.key[cross]!.sym]).toEqual([LINE_STYLES[0], ALL_SYMBOLS[0]]);
    p.key.push({ t: "back", src: "dmc:321", n: 2, sym: "■" });
    p.key.push({ t: "bead", src: "bead:00557", sym: LINE_STYLES[5]! });
    fixEntrySymbols(p, ALL_SYMBOLS);
    expect(p.key[3]!.sym).toBe(LINE_STYLES[1]);
    expect(p.key[4]!.sym).toBe(ALL_SYMBOLS[1]);
  });

  it("labels knots with their wraps and blended backstitch without strands (SPEC §3.4)", () => {
    const p = createPattern(2, 2);
    p.blends["blend:x"] = { parts: [{ id: "dmc:310", n: 1 }, { id: "dmc:White", n: 1 }] };
    const label = (e: Parameters<typeof keyLabelData>[1]) => formatLabel(keyLabelData(p, e), translateEn).sub;
    expect(label({ t: "knot", src: "dmc:310", n: 2, wraps: 3, sym: "a" })).toBe("Black · 2 strands · French knot, 3 wraps");
    expect(label({ t: "back", src: "blend:x", n: null, sym: "b" })).not.toMatch(/strand/);
  });
});

describe("partial stitches on the chart", () => {
  const p = createPattern(2, 1);
  p.layers.partials.set(0, [{ kind: "quarter", corner: 0, k: 1 }, { kind: "quarter", corner: 2, k: 2 }]);
  const layer = partialsLayer;

  it("picks and erases by the corner under the pointer", () => {
    expect(layer.pickAt(p.layers.partials, { x: 0.9, y: 0.9 }, p)).toBe(2);
    expect(layer.erase(p.layers.partials, { cells: [0], point: { x: 0.1, y: 0.1 }, radius: 0.3, precise: true }, p)).toBe(true);
    expect(p.layers.partials.get(0)).toEqual([{ kind: "quarter", corner: 2, k: 2 }]);
    expect(layer.erase(p.layers.partials, { cells: [0], point: { x: 0.1, y: 0.1 }, radius: 0.3, precise: false }, p)).toBe(true);
    expect(p.layers.partials.size).toBe(0);
  });
});

describe("grid numbering", () => {
  const size = { w: 30, h: 20 };
  it("matches the classic rulers by default", () => {
    const g = { x0: 1, y0: 1, label: 10 as const, fromCentre: false };
    expect(rulerLabels(g, "x", size, 10).map((l) => [l.at, l.text])).toEqual([[0, 0], [10, 10], [20, 20], [30, 30]]);
    expect(isMajorLine(10, majorOffset(g, "x", size))).toBe(true);
  });

  it("aligns major lines with a custom first column", () => {
    const g = { x0: 5, y0: 1, label: 10 as const, fromCentre: false };
    expect(cellLabel(g, "x", 0, size)).toBe(5);
    expect(isMajorLine(6, majorOffset(g, "x", size))).toBe(true);
    expect(parseCellRef("12, 3", g, size)).toEqual({ x: 7, y: 2 });
  });

  it("numbers from the centre", () => {
    const g = { x0: 1, y0: 1, label: 10 as const, fromCentre: true };
    expect(cellLabel(g, "x", 15, size)).toBe(0);
    expect(parseCellRef("-15 0", g, size)).toEqual({ x: 0, y: 10 });
    expect(parseCellRef("99, 1", g, size)).toBeNull();
  });
});

describe("mirror helpers", () => {
  const size = { w: 5, h: 4 };
  it.each([
    ["rightToLeft", [0, 1], [3, 4]],
    ["topToBottom", [0, 5], [10, 15]],
    ["quad", [0, 1], [3, 4, 15]],
  ] as const)("%s halves", (dir, inSource, inTarget) => {
    const { source, target } = mirrorHalves(dir, size);
    const pick = (m: Uint8Array) => [...m.keys()].filter((i) => m[i]);
    expect(dir === "rightToLeft" ? pick(target) : pick(source)).toEqual(expect.arrayContaining([...inSource]));
    expect(dir === "rightToLeft" ? pick(source) : pick(target)).toEqual(expect.arrayContaining([...inTarget]));
  });

  it("mirrors drawing points across the horizontal axis", () => {
    expect(mirrorPoints(1, 0.5, "horizontal", size).map((p) => [p.x, p.y])).toEqual([[1, 0.5], [1, 3.5]]);
  });
});
