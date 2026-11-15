import { describe, expect, it } from "vitest";
import { createPattern } from "../pattern/createPattern";
import { addEntry, fixEntrySymbols } from "../pattern/keyEntries";
import { parsePattern } from "../formats/json/parse";
import { serializePattern } from "../formats/json/serialize";
import { symbolText } from "./lineStyles";
import { shapeSymbol } from "./shapes";
import { ALL_SYMBOLS, upgradeSymbol } from "./symbols";
import { coveredPath, CUSTOM_EXAMPLES, CUSTOM_MAX_SHAPES, customShape, decodeCustomSymbol, encodeCustomSymbol, type CustomShape } from "./customSymbol";

const ring: CustomShape = { kind: "circle", paint: "outline", x1: 2, y1: 2, x2: 10, y2: 10 };
const dot: CustomShape = { kind: "rect", paint: "fill", x1: 5, y1: 5, x2: 7, y2: 7 };
const up: CustomShape = { kind: "triangle", paint: "fill", dir: "u", x1: 0, y1: 0, x2: 12, y2: 12 };
const arrow: CustomShape = { kind: "arrow", paint: "fill", x1: 1, y1: 11, x2: 11, y2: 1 };

describe("hand-drawn symbols", () => {
  it("are written as a short string and read back unchanged", () => {
    const sym = encodeCustomSymbol([ring, dot, up, arrow])!;
    expect(sym).toBe("draw:o22aa;S5577;T00ccu;a1bb1");
    expect(decodeCustomSymbol(sym)).toEqual([ring, dot, up, arrow]);
  });

  it("refuse drawings that are empty, too complex, too small or off the grid", () => {
    expect(encodeCustomSymbol([])).toBeNull();
    expect(encodeCustomSymbol(Array(CUSTOM_MAX_SHAPES + 1).fill(ring))).toBeNull();
    expect(encodeCustomSymbol(Array(CUSTOM_MAX_SHAPES).fill(ring))).not.toBeNull();
    expect(encodeCustomSymbol([{ ...ring, x2: 2 }])).toBeNull(); // no width
    expect(encodeCustomSymbol([{ ...arrow, x2: 2, y2: 11 }])).toBeNull(); // one cell long
    expect(encodeCustomSymbol([{ ...ring, x2: 13 }])).toBeNull();
    expect(encodeCustomSymbol([{ ...ring, x1: 2.5 }])).toBeNull();
  });

  it("read nothing but what the drawing tool writes", () => {
    for (const bad of ["draw:", "draw:x0011", "draw:o22a", "draw:o22aad", "draw:t0055", "draw:t0055x", "draw:oaa22", "draw:o22aa;", "draw:" + Array(CUSTOM_MAX_SHAPES + 1).fill("o22aa").join(";"), "sym:circle", "draw:o22aa<script>", "draw:!o22aa"])
      expect(decodeCustomSymbol(bad), bad).toBeNull();
    expect(customShape("draw:o22aa<script>")).toBeUndefined();
  });

  it("draw as outlines or fills inside the symbol box, an arrow as a line with a head", () => {
    const parts = shapeSymbol("draw:o00cc;S0066;T66ccd;a0666")!.parts;
    expect(parts.map((p) => p.paint)).toEqual(["stroke", "fill", "fill", "stroke"]);
    expect(parts[1]!.d).toBe("M2 2H12V12H2Z");
    expect(parts[2]!.d).toBe("M12 12L22 12L17 22Z");
    expect(parts[3]!.d.match(/M/g)).toHaveLength(2); // shaft, then the two barbs through the head
    const numbers = parts.flatMap((p) => p.d.match(/-?\d+(\.\d+)?/g)!.map(Number));
    expect(Math.min(...numbers)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...numbers)).toBeLessThanOrEqual(24);
    expect(shapeSymbol("draw:o00cc")!.group).toBe("custom");
  });

  it("draw lines 1 or 2 cells thick, flat-ended, horizontal, vertical or diagonal, and nothing slanted", () => {
    const [thin, thick] = shapeSymbol("draw:l16b6;L6162")!.parts;
    expect(thin).toMatchObject({ d: "M3.67 12L20.33 12", paint: "stroke", cap: "butt", w: 1.67 });
    expect(thick).toMatchObject({ d: "M12 3.67L12 5.33", w: 3.33 });
    expect(decodeCustomSymbol("draw:l0044")).toEqual([{ kind: "line", paint: "fill", width: 1, x1: 0, y1: 0, x2: 4, y2: 4 }]);
    expect(decodeCustomSymbol("draw:L0042")).toBeNull(); // 4 across, 2 down: not a straight or diagonal line
    expect(decodeCustomSymbol("draw:l5555")).toBeNull(); // no length
    expect(encodeCustomSymbol([{ kind: "line", paint: "fill", width: 2, x1: 12, y1: 3, x2: 2, y2: 3 }])).toBe("draw:Lc323");
  });

  it("draw a star, outlined or filled, inside its box", () => {
    const [outline, filled] = shapeSymbol("draw:p00cc;P00cc")!.parts;
    expect(outline!.paint).toBe("stroke");
    expect(filled!.paint).toBe("fill");
    expect(outline!.d.match(/L/g)).toHaveLength(9); // ten points
    const xs = [...outline!.d.matchAll(/(-?\d+(?:\.\d+)?) /g)].map((m) => Number(m[1]));
    expect(Math.min(...xs)).toBeCloseTo(2, 1);
    expect(Math.max(...xs)).toBeCloseTo(22, 0);
  });

  it("write a cut-out (negative) with a ! in front, for filled-form shapes and lines only", () => {
    const circle: CustomShape = { kind: "circle", paint: "fill", x1: 0, y1: 0, x2: 12, y2: 12 };
    const star: CustomShape = { kind: "star", paint: "cut", x1: 2, y1: 2, x2: 10, y2: 10 };
    expect(encodeCustomSymbol([circle, star])).toBe("draw:O00cc;!P22aa");
    expect(decodeCustomSymbol("draw:O00cc;!P22aa")).toEqual([circle, star]);
    expect(encodeCustomSymbol([circle, { kind: "line", paint: "cut", width: 2, x1: 0, y1: 6, x2: 12, y2: 6 }])).toBe("draw:O00cc;!L06c6");
    // an outline can't be cut, nor an arrow
    for (const bad of ["draw:O00cc;!p22aa", "draw:O00cc;!a22aa", "draw:O00cc;!t22aau", "draw:O00cc;!"]) expect(decodeCustomSymbol(bad), bad).toBeNull();
    // cuts alone leave nothing to see
    expect(encodeCustomSymbol([star])).toBeNull();
    expect(decodeCustomSymbol("draw:!P22aa")).toBeNull();
  });

  it("cut a hole in what was drawn before the cut — and only before it", () => {
    // a filled rectangle, then a cut circle inside it: the rectangle has a hole, the cut itself draws nothing
    const parts = shapeSymbol("draw:S00cc;!O3399")!.parts;
    expect(parts).toHaveLength(1);
    expect(parts[0]!.holes).toHaveLength(1);
    // something drawn after the cut sits on top: a circle with a star cut out and a dot put back
    const [circle, dotPart] = shapeSymbol("draw:O00cc;!P22aa;O5577")!.parts;
    expect(circle!.holes).toHaveLength(1);
    expect(dotPart!.holes).toBeUndefined();
    // an outline never cuts, however it is placed
    expect(shapeSymbol("draw:S00cc;o3399")!.parts.map((p) => p.holes)).toEqual([undefined, undefined]);
    // several cuts, in any shape or line, each cut once; they also cut earlier outlines
    expect(shapeSymbol("draw:S00cc;!O1144;!T6699u;!l06c6")!.parts[0]!.holes).toHaveLength(3);
    expect(shapeSymbol("draw:o00cc;!S3399")!.parts[0]!.holes).toHaveLength(1);
  });

  it("describe a cut line as the band it removes, flat-ended, whatever its direction", () => {
    expect(coveredPath({ kind: "line", paint: "cut", width: 1, x1: 0, y1: 6, x2: 12, y2: 6 })).toBe("M2 12.84L22 12.84L22 11.16L2 11.16Z");
    const diagonal = coveredPath({ kind: "line", paint: "cut", width: 2, x1: 0, y1: 0, x2: 12, y2: 12 });
    expect(diagonal.match(/L/g)).toHaveLength(3);
    expect(coveredPath({ kind: "arrow", paint: "fill", x1: 0, y1: 0, x2: 4, y2: 4 })).toBe("");
  });

  it("offer examples that all read back and have something to see", () => {
    for (const { id, sym } of CUSTOM_EXAMPLES) {
      const shapes = decodeCustomSymbol(sym);
      expect(shapes, id).not.toBeNull();
      expect(encodeCustomSymbol(shapes!), id).toBe(sym);
      expect(shapeSymbol(sym)!.parts.length, id).toBeGreaterThan(0);
    }
    expect(CUSTOM_EXAMPLES.some(({ sym }) => sym.includes("!"))).toBe(true);
  });

  it("survive saving and loading, count as taken, and show as ✎ in text lists", () => {
    const p = createPattern(2, 2), sym = encodeCustomSymbol([ring, arrow])!;
    addEntry(p, { t: "thread", src: "dmc:310", n: 2, st: "full", sym }, ALL_SYMBOLS);
    addEntry(p, { t: "thread", src: "dmc:321", n: 2, st: "full", sym }, ALL_SYMBOLS); // the same drawing twice
    addEntry(p, { t: "thread", src: "dmc:797", n: 2, st: "full", sym: "draw:nonsense" }, ALL_SYMBOLS);
    expect(upgradeSymbol(sym)).toBe(sym);
    const back = parsePattern(serializePattern(p), ALL_SYMBOLS).pattern;
    expect(back.key[1]!.sym).toBe(sym);
    // a duplicate and a broken drawing get standard symbols, like any other unusable symbol
    expect(ALL_SYMBOLS).toContain(back.key[2]!.sym);
    expect(ALL_SYMBOLS).toContain(back.key[3]!.sym);
    fixEntrySymbols(back, ALL_SYMBOLS);
    expect(back.key[1]!.sym).toBe(sym);
    expect(symbolText(sym)).toBe("✎");
  });
});
