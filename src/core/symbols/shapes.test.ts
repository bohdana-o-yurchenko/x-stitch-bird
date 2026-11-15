import { describe, expect, it } from "vitest";
import { SHAPES, TEXT_SYMBOLS } from "./shapes";
import { ALL_SYMBOLS, upgradeSymbol } from "./symbols";

describe("vector chart symbols", () => {
  it("have unique ids, a group and drawable parts", () => {
    expect(new Set(ALL_SYMBOLS).size).toBe(ALL_SYMBOLS.length);
    for (const s of SHAPES) {
      expect(["basic", "decorative"]).toContain(s.group);
      expect(s.parts.length).toBeGreaterThan(0);
      for (const p of s.parts) expect(p.d).toMatch(/^M[\d .\-MLHVCQAZ]+$/);
    }
  });

  it("keep character symbols as they are (a shape's text stand-in never takes over a character)", () => {
    for (const ch of TEXT_SYMBOLS) expect(upgradeSymbol(ch)).toBe(ch);
  });

  it("list basic shapes before decorative ones, so new entries get the plainest free shape", () => {
    const groups = SHAPES.map((s) => s.group);
    expect(groups.lastIndexOf("basic")).toBeLessThan(groups.indexOf("decorative"));
  });
});
