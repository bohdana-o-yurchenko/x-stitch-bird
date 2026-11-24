import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPattern } from "@/core/pattern/createPattern";
import { addEntry } from "@/core/pattern/keyEntries";
import { buildPalette } from "@/core/pattern/palette";
import { ALL_SYMBOLS } from "@/core/symbols/symbols";
import { UA_BLUE, UA_YELLOW } from "@/core/flag";
import { fakeCanvas, FakePath2D } from "../../tests/support/fakeCanvas";
import { resetScratch } from "./cellBitmap";
import { renderChartImage, type ChartExportText } from "./exportChart";
import { defaultCanvasTheme as theme } from "./theme";

let c: ReturnType<typeof fakeCanvas>;

beforeEach(() => {
  c = fakeCanvas();
  vi.stubGlobal("Path2D", FakePath2D);
  vi.stubGlobal("document", { createElement: () => ({ width: 0, height: 0, getContext: () => c.g }) });
  // flat colour cell by cell, as where there is no canvas to build a bitmap on
  vi.stubGlobal("OffscreenCanvas", class { getContext() { return null; } });
  resetScratch();
});
afterEach(() => {
  vi.unstubAllGlobals();
  resetScratch();
});

function setup() {
  const p = createPattern(20, 10, "Tulip");
  const k = addEntry(p, { t: "thread", src: "dmc:310", n: 2, st: "full" }, ALL_SYMBOLS);
  p.layers.stitches.fill(k, 0, 30);
  p.layers.segments.push({ x1: 0, y1: 0, x2: 4, y2: 4, k });
  const palette = buildPalette(p);
  const text: ChartExportText = { heading: "Tulip", byline: "Ann · ©", key: [{ slot: palette[k]!, title: "DMC 310", sub: "Black · 2 strands", count: 30 }], footer: "Made with пташечка" };
  return { p, palette, text, k };
}

const texts = () => c.calls("fillText").map((a) => a[0]);

describe("the chart as a picture (PNG)", () => {
  it("the printable chart: grid numbers, the heading and byline, and the key with its counts", () => {
    const { p, palette, text } = setup();
    const img = renderChartImage(p, palette, "both", theme, text);
    expect(img.width).toBeGreaterThan(p.w * theme.export.chartCell[0]);
    expect(texts()).toEqual(expect.arrayContaining(["Tulip", "Ann · ©", "DMC 310", "Black · 2 strands  (30)", "10"]));
  });

  it("the preview: no grid numbers and no key, but the footer with the flag", () => {
    const { p, palette, text } = setup();
    renderChartImage(p, palette, "color", theme, text);
    expect(texts()).toEqual(["Made with пташечка"]);
    expect(c.values("fillStyle")).toEqual(expect.arrayContaining([UA_BLUE, UA_YELLOW]));
  });

  it("the stitched preview has bigger cells than the flat one", () => {
    const { p, palette, text } = setup();
    const flat = renderChartImage(p, palette, "color", theme, text).width;
    const stitched = renderChartImage(p, palette, "stitched", theme, text).width;
    expect(stitched).toBeGreaterThan(flat);
  });

  it("a given cell size: just the chart, edge to edge", () => {
    const { p, palette, text } = setup();
    const img = renderChartImage(p, palette, "both", theme, text, 5);
    expect([img.width, img.height]).toEqual([100, 50]);
    expect(texts()).not.toContain("Tulip");
  });

  it("the lines are drawn over the cells", () => {
    const { p, palette, text } = setup();
    renderChartImage(p, palette, "both", theme, text, 10);
    // a line is stroked along its own direction: the diagonal from (0,0) to (4,4) turns by 45°
    expect(c.calls("rotate")).toContainEqual([Math.PI / 4]);
  });
});
