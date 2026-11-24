import { afterEach, describe, expect, it, vi } from "vitest";
import { createPattern } from "@/core/pattern/createPattern";
import { addEntry } from "@/core/pattern/keyEntries";
import { buildPalette } from "@/core/pattern/palette";
import { ALL_SYMBOLS } from "@/core/symbols/symbols";
import { fakeCanvas, FakePath2D } from "../../tests/support/fakeCanvas";
import { drawCellBitmap, pixel, resetScratch } from "./cellBitmap";
import { drawCells, viewStyle } from "./chart";
import { defaultCanvasTheme as theme } from "./theme";

/** An OffscreenCanvas stand-in that keeps the last bitmap put on it. */
function stubOffscreen() {
  const put: Uint32Array[] = [];
  class Fake {
    constructor(public width: number, public height: number) {}
    getContext() {
      return {
        createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
        putImageData: (img: { data: Uint8ClampedArray }) => put.push(new Uint32Array(img.data.buffer.slice(0))),
      };
    }
  }
  vi.stubGlobal("OffscreenCanvas", Fake);
  resetScratch();
  return put;
}

afterEach(() => {
  vi.unstubAllGlobals();
  resetScratch();
});

describe("flat colour drawn as one bitmap", () => {
  it("a pixel is the colour's bytes, opaque", () => {
    const bytes = new Uint8Array(new Uint32Array([pixel("#102030")]).buffer);
    expect([...bytes]).toEqual([0x10, 0x20, 0x30, 255]);
  });

  it("without a canvas to build on, says so: the cells are drawn one by one", () => {
    const { g } = fakeCanvas();
    expect(drawCellBitmap(g, 0, 0, 2, 2, 0, 0, 10, () => 1)).toBe(false);
  });

  it("one pixel per cell, scaled up unsmoothed onto the cells' place", () => {
    const put = stubOffscreen(), c = fakeCanvas();
    expect(drawCellBitmap(c.g, 3, 4, 2, 1, 10, 20, 8, (x, y) => x * 100 + y)).toBe(true);
    expect([...put[0]!]).toEqual([304, 404]);
    expect(c.calls("drawImage")[0]!.slice(1)).toEqual([0, 0, 2, 1, 10 + 3 * 8, 20 + 4 * 8, 16, 8]);
    expect(c.values("imageSmoothingEnabled")[0]).toBe(false);
  });

  it("the chart's full crosses go into the bitmap; half crosses and symbols still each draw their own", () => {
    const put = stubOffscreen(), c = fakeCanvas();
    const p = createPattern(4, 1);
    const full = addEntry(p, { t: "thread", src: "dmc:310", n: 2, st: "full" }, ALL_SYMBOLS);
    const half = addEntry(p, { t: "thread", src: "dmc:321", n: 2, st: "half" }, ALL_SYMBOLS);
    p.layers.stitches.set([full, half, 0, full]);
    const palette = buildPalette(p);
    drawCells(c.g, p, palette, { z: 4, ox: 0, oy: 0, x0: 0, y0: 0, x1: 4, y1: 1 }, viewStyle("color", theme));
    const black = pixel(palette[full]!.hex);
    expect([...put[0]!]).toEqual([black, 0, 0, black]);
    // the fabric is the only flat fill; the half cross is a stroke of its own
    expect(c.calls("fillRect")).toHaveLength(1);
    expect(c.calls("stroke")).toHaveLength(1);
  });

  it("zoomed in on the symbols view nothing is flat: every cell draws itself", () => {
    const put = stubOffscreen(), c = fakeCanvas();
    const p = createPattern(2, 1);
    const full = addEntry(p, { t: "thread", src: "dmc:310", n: 2, st: "full" }, ALL_SYMBOLS);
    p.layers.stitches.set([full, full]);
    vi.stubGlobal("Path2D", FakePath2D);
    drawCells(c.g, p, buildPalette(p), { z: 20, ox: 0, oy: 0, x0: 0, y0: 0, x1: 2, y1: 1 }, viewStyle("symbols", theme));
    expect(put).toHaveLength(0);
    expect(c.calls("fill").length + c.calls("fillText").length).toBeGreaterThanOrEqual(2);
  });
});
