import { describe, expect, it } from "vitest";
import { createPattern } from "../pattern/createPattern";
import { addEntry, fixEntrySymbols } from "../pattern/keyEntries";
import { parsePattern } from "../formats/json/parse";
import { serializePattern } from "../formats/json/serialize";
import { symbolText } from "./lineStyles";
import { shapeSymbol } from "./shapes";
import { ALL_SYMBOLS, upgradeSymbol } from "./symbols";
import { CUSTOM_MAX_SHAPES, customShape, decodeCustomSymbol, encodeCustomSymbol, type CustomShape } from "./customSymbol";

const ring: CustomShape = { kind: "circle", filled: false, x1: 2, y1: 2, x2: 10, y2: 10 };
const dot: CustomShape = { kind: "rect", filled: true, x1: 5, y1: 5, x2: 7, y2: 7 };
const up: CustomShape = { kind: "triangle", filled: true, dir: "u", x1: 0, y1: 0, x2: 12, y2: 12 };
const arrow: CustomShape = { kind: "arrow", x1: 1, y1: 11, x2: 11, y2: 1 };

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
    for (const bad of ["draw:", "draw:x0011", "draw:o22a", "draw:o22aad", "draw:t0055", "draw:t0055x", "draw:oaa22", "draw:o22aa;", "draw:" + Array(7).fill("o22aa").join(";"), "sym:circle", "draw:o22aa<script>"])
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
