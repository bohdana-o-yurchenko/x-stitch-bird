import { describe, expect, it } from "vitest";
import { candidateColours, imageToPattern } from "./candidates";

/** 4×1 image: red, red, near-white, transparent. */
const pixels = { width: 4, height: 1, data: [200, 20, 30, 255, 201, 22, 30, 255, 250, 250, 248, 255, 0, 0, 0, 0] };

describe("image → pattern", () => {
  it("maps pixels to DMC, leaves transparent pixels empty and limits colours", () => {
    const r = imageToPattern({ pixels, maxColours: 1, skipLightest: false, blends: null });
    expect(r.cells[3]).toBeNull();
    expect(new Set(r.cells.filter(Boolean)).size).toBe(1);
    expect(r.used).toBe(1);
  });

  it("can leave the lightest colour unstitched", () => {
    const r = imageToPattern({ pixels, maxColours: 5, skipLightest: true, blends: null });
    expect(r.cells[2]).toBeNull();
    expect(r.cells[0]).toBe(r.cells[1]);
  });

  it("offers the pattern's blends as candidates", () => {
    expect(candidateColours({ "blend:x": { parts: [{ id: "dmc:310", n: 1 }, { id: "dmc:White", n: 1 }] } }).at(-1)?.id).toBe("blend:x");
  });
});
