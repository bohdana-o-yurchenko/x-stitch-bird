import { beforeAll, describe, expect, it, vi } from "vitest";
import type { PaletteSlot } from "@/core/pattern/palette";
import { LINE_STYLES } from "@/core/symbols/lineStyles";
import { SHAPES, shapeSymbol } from "@/core/symbols/shapes";
import { fakeCanvas, FakePath2D } from "../../tests/support/fakeCanvas";
import { buildPalette } from "@/core/pattern/palette";
import { createPattern } from "@/core/pattern/createPattern";
import { addEntry } from "@/core/pattern/keyEntries";
import { ALL_SYMBOLS } from "@/core/symbols/symbols";
import { drawCells, drawGrid, drawLines, drawUnderlay, fullFrame, viewStyle } from "./chart";
import { drawKeyIcon, drawLineStyleSample } from "./keyIcon";
import { backstitchColour, drawBackstitch, drawStitchCell, drawSymbol, strandFactor } from "./primitives/cells";
import { strokeLineStyle } from "./primitives/lineStyles";
import { drawShape } from "./primitives/symbolArt";
import { defaultCanvasTheme as theme } from "./theme";

beforeAll(() => vi.stubGlobal("Path2D", FakePath2D));

const FABRIC = "#F7F4EC";
const slot = (o: Partial<PaletteSlot>): PaletteSlot => ({ hex: "#C72B3B", ink: "#fff", sym: "sym:circle", t: "thread", st: "full", n: 2, ...o });

describe("key icons", () => {
  const tile = (s: PaletteSlot, view: "color" | "both" | "symbols", fabric = FABRIC) => {
    const c = fakeCanvas();
    drawKeyIcon(c.g, s, 30, view, theme, fabric);
    return c.values("fillStyle")[0];
  };

  it("sit on the fabric colour, or on a contrasting tile when the floss would vanish on it", () => {
    expect(tile(slot({}), "both")).toBe(FABRIC);
    expect(tile(slot({ hex: "#FFFFFF", st: "half" }), "both")).toBe(theme.keyIcon.dark);
    expect(tile(slot({ hex: "#101010" }), "color", "#111111")).toBe(theme.keyIcon.light);
    // lines, knots and beads carry their own outline and stay on the fabric
    expect(tile(slot({ hex: "#FFFFFF", t: "back", sym: "line:solid" }), "both")).toBe(FABRIC);
    expect(tile(slot({ hex: "#FFFFFF", t: "knot" }), "both")).toBe(FABRIC);
  });

  it("are white in Symbols view whatever the fabric", () => {
    expect(tile(slot({ hex: "#FFFFFF" }), "symbols", "#000000")).toBe("#fff");
  });

  it("draw a bead as a bead and a backstitch entry as a diagonal line", () => {
    const bead = fakeCanvas();
    drawKeyIcon(bead.g, slot({ t: "bead", bead: { hex: "#D4AF37", ink: "#000", shape: {} } }), 30, "both", theme, FABRIC);
    expect(bead.calls("arc").length).toBeGreaterThan(0);
    const back = fakeCanvas();
    drawKeyIcon(back.g, slot({ t: "back", sym: "line:solid" }), 30, "both", theme, FABRIC);
    expect(back.calls("rotate")[0]![0]).toBeCloseTo(-Math.PI / 4);
  });

  it("draw line-style samples in the colour they are given (the theme's text colour)", () => {
    const c = fakeCanvas();
    drawLineStyleSample(c.g, "line:dashed", 40, 18, "rgb(242, 242, 236)");
    expect(c.values("strokeStyle")).toEqual(["rgb(242, 242, 236)"]);
    expect(c.calls("clearRect")).toEqual([[0, 0, 40, 18]]);
  });
});

describe("stitches and symbols", () => {
  it("show colour and symbol according to the view", () => {
    expect(viewStyle("color", theme)).toMatchObject({ showColour: true, showSymbol: false });
    expect(viewStyle("both", theme)).toMatchObject({ showColour: true, showSymbol: true });
    expect(viewStyle("symbols", theme)).toMatchObject({ showColour: false, showSymbol: true });
  });

  it("fill a full cross with its colour; a half cross is a diagonal in its own direction", () => {
    const full = fakeCanvas();
    drawStitchCell(full.g, 0, 0, 20, slot({}), viewStyle("color", theme));
    expect(full.calls("fillRect")).toEqual([[0, 0, 20, 20]]);
    const dir = (st: "half" | "halfb") => {
      const c = fakeCanvas();
      drawStitchCell(c.g, 0, 0, 20, slot({ st }), viewStyle("color", theme));
      const [from] = c.calls("moveTo"), [to] = c.calls("lineTo");
      return Math.sign((to![1] as number) - (from![1] as number));
    };
    expect(dir("half")).toBe(-1); // ╱ rises to the right
    expect(dir("halfb")).toBe(1); // ╲ falls
  });

  it("skip the symbol when zoomed out too far to read it", () => {
    const far = fakeCanvas(), near = fakeCanvas();
    drawStitchCell(far.g, 0, 0, theme.symbols.minZoom - 1, slot({ sym: "A" }), viewStyle("both", theme));
    drawStitchCell(near.g, 0, 0, theme.symbols.minZoom, slot({ sym: "A" }), viewStyle("both", theme));
    expect(far.calls("fillText")).toEqual([]);
    expect(near.calls("fillText")[0]![0]).toBe("A");
  });

  it("draw characters as text and shapes as paths, with a halo when asked", () => {
    const text = fakeCanvas();
    drawSymbol(text.g, 10, 10, 20, "A", "#000", 0.68, theme, true);
    expect(text.calls("strokeText")).toHaveLength(1);
    expect(text.values("font")[0]).toMatch(/^600 13px /);
    const shape = fakeCanvas();
    drawSymbol(shape.g, 10, 10, 20, "sym:circle", "#000", 0.68, theme);
    expect(shape.calls("fillText")).toEqual([]);
    expect(shape.calls("fill")).toHaveLength(1);
  });

  it("draw every shape: strokes stroked, fills filled, half-filled ones clipped to their half", () => {
    for (const s of SHAPES) {
      const c = fakeCanvas();
      drawShape(c.g, s, 12, 12, 24, "#000", null);
      expect(c.calls("stroke"), s.id).toHaveLength(s.parts.filter((p) => p.paint === "stroke").length);
      expect(c.calls("fill"), s.id).toHaveLength(s.parts.filter((p) => p.paint === "fill").length);
      expect(c.calls("clip"), s.id).toHaveLength(s.parts.filter((p) => p.clip).length);
      expect(c.calls("save").length, s.id).toBe(c.calls("restore").length);
    }
    const half = fakeCanvas();
    drawShape(half.g, shapeSymbol("sym:circle-hl")!, 12, 12, 24, "#000", null);
    expect(half.calls("rect")).toEqual([[0, 0, 12, 24]]);
  });

  it("cut a hand-drawn symbol's empty shapes out of what was drawn before them, only for that part", () => {
    const c = fakeCanvas();
    drawShape(c.g, shapeSymbol("draw:S00cc;o3399;P5577")!, 12, 12, 24, "#000", null);
    // the rectangle is clipped once (by the circle); the circle and the later star are not clipped
    expect(c.calls("clip").map((x) => x[1])).toEqual(["evenodd"]);
    const order = c.log.map((l) => l[0]).filter((n) => ["save", "clip", "fill", "stroke", "restore"].includes(n));
    expect(order.slice(order.indexOf("clip") - 1, order.indexOf("clip") + 3)).toEqual(["save", "clip", "fill", "restore"]);
    expect(c.calls("save").length).toBe(c.calls("restore").length);
  });

  it("give shapes a halo wide enough to show around the outline, and never hair-thin strokes", () => {
    const c = fakeCanvas();
    drawShape(c.g, shapeSymbol("sym:circle-o")!, 3, 3, 6, "#000", { color: "#fff", width: 1 });
    const [halo, ink] = c.values("lineWidth") as number[];
    expect(c.values("strokeStyle")).toEqual(["#fff", "#000"]);
    expect(halo! - ink!).toBeCloseTo(2 / (6 / 24)); // 1 px each side, in the shape's own units
    expect(ink! * (6 / 24)).toBeGreaterThanOrEqual(1.1 - 1e-9); // at least ~1 px on screen
  });
});

describe("backstitch", () => {
  it("gets thicker with more strands, each strand adding less", () => {
    const f = (n: number) => strandFactor(n, 1, 0.5);
    expect([f(1), f(2), f(3), f(4)]).toEqual([1, 2, 2.5, 2.75]);
    expect(f(0)).toBe(1);
  });

  it("darkens very light floss so it shows on light fabric", () => {
    expect(backstitchColour("#FFFFFF", theme)).not.toBe("#FFFFFF");
    expect(backstitchColour("#C72B3B", theme)).toBe("#C72B3B");
  });

  it("is a solid coloured line in Colour view and a dark styled line in Symbols view", () => {
    const s = slot({ t: "back", sym: "line:dashed", n: 1 });
    const colour = fakeCanvas(), symbols = fakeCanvas();
    drawBackstitch(colour.g, 0, 0, 100, 0, 20, s, viewStyle("color", theme));
    drawBackstitch(symbols.g, 0, 0, 100, 0, 20, s, viewStyle("symbols", theme));
    expect(colour.values("strokeStyle")).toEqual(["#C72B3B"]);
    expect(colour.calls("setLineDash")).toEqual([]);
    expect(symbols.values("strokeStyle")).toEqual([theme.backstitch.symbolsColor]);
    expect(symbols.calls("setLineDash")).toHaveLength(1);
  });

  it("can draw every line style, each leaving the canvas state as it found it", () => {
    for (const style of LINE_STYLES) {
      const c = fakeCanvas();
      strokeLineStyle(c.g, 0, 0, 60, 30, 2, 3, style);
      expect(c.calls("stroke").length + c.calls("fill").length, style).toBeGreaterThan(0);
      expect(c.calls("save").length, style).toBe(c.calls("restore").length);
    }
    // an unknown style still draws a plain line
    const c = fakeCanvas();
    strokeLineStyle(c.g, 0, 0, 10, 0, 2, 3, "line:nonsense");
    expect(c.calls("stroke")).toHaveLength(1);
  });
});

describe("the chart", () => {
  const chart = () => {
    const p = createPattern(20, 10);
    const red = addEntry(p, { t: "thread", src: "dmc:321", n: 2, st: "full" }, ALL_SYMBOLS);
    const bead = addEntry(p, { t: "bead", src: "bead:00557" }, ALL_SYMBOLS);
    const back = addEntry(p, { t: "back", src: "dmc:310", n: 1 }, ALL_SYMBOLS);
    const knot = addEntry(p, { t: "knot", src: "dmc:310", n: 2 }, ALL_SYMBOLS);
    p.layers.stitches.set([red, red]);
    p.layers.beads[5] = bead;
    p.layers.partials.set(7, [{ kind: "quarter", corner: 0, k: red }]);
    p.layers.segments.push({ x1: 0, y1: 0, x2: 2, y2: 2, k: back });
    p.layers.knots.push({ x: 3, y: 3, k: knot });
    return { p, palette: buildPalette(p) };
  };

  it("draws thin lines per cell and heavy lines every 10, following the numbering", () => {
    const { p } = chart(), c = fakeCanvas();
    drawGrid(c.g, p, fullFrame(p, 10, 0, 0), theme, false);
    // 21 vertical + 11 horizontal lines; heavy ones at 0, 10, 20 across and 0, 10 down
    expect(c.calls("moveTo")).toHaveLength(32);
    expect(c.values("strokeStyle")).toEqual([theme.grid.minor, theme.grid.major, theme.grid.border]);
    const heavy = c.log.slice(c.log.findIndex((l) => l[2] === theme.grid.major)).filter((l) => l[0] === "moveTo");
    expect(heavy).toHaveLength(5);
    p.grid = { ...p.grid, x0: 5 }; // first column is number 5: heavy lines move with the labels
    const shifted = fakeCanvas();
    drawGrid(shifted.g, p, fullFrame(p, 10, 0, 0), theme, false);
    const xs = shifted.log.slice(shifted.log.findIndex((l) => l[2] === theme.grid.major)).filter((l) => l[0] === "moveTo" && l[2] === 0).map((l) => l[1]);
    expect(xs).toEqual([60.5, 160.5]);
  });

  it("leaves out the thin lines when zoomed far out", () => {
    const { p } = chart(), c = fakeCanvas();
    drawGrid(c.g, p, fullFrame(p, theme.grid.minMinorZoom - 1, 0, 0), theme, false);
    expect(c.values("strokeStyle")).toEqual([theme.grid.major, theme.grid.border]);
  });

  it("paints the fabric, then stitches, partial stitches and beads; lines and knots go on top", () => {
    const { p, palette } = chart(), c = fakeCanvas();
    drawCells(c.g, p, palette, fullFrame(p, 12, 0, 0), viewStyle("color", theme));
    expect(c.values("fillStyle")[0]).toBe(p.fabric);
    expect(c.calls("fillRect").slice(0, 3)).toEqual([[0, 0, 240, 120], [0, 0, 12, 12], [12, 0, 12, 12]]);
    expect(c.calls("arc").length).toBeGreaterThan(0); // the bead
    const top = fakeCanvas();
    drawLines(top.g, p, palette, fullFrame(p, 12, 0, 0), viewStyle("color", theme));
    expect(top.calls("translate")[0]).toEqual([0, 0]); // the backstitch line starts at its first point
    expect(top.calls("arc")[0]!.slice(0, 2)).toEqual([36, 36]); // the knot at (3, 3)
  });

  it("draws the image behind the chart at its opacity, turned around its own middle, clipped to the chart", () => {
    const { p } = chart(), c = fakeCanvas();
    const u = { image: {} as CanvasImageSource, crop: { x: 0, y: 0, w: 100, h: 50 }, rect: { x: 2, y: 2, w: 10, h: 5 }, opacity: 0.4, rotation: 90 };
    drawUnderlay(c.g, p, u, fullFrame(p, 10, 0, 0), true);
    expect(c.calls("clip")).toHaveLength(1);
    expect(c.values("globalAlpha")).toEqual([0.4]);
    expect(c.calls("translate")).toEqual([[70, 45], [-70, -45]]);
    expect(c.calls("rotate")[0]![0]).toBeCloseTo(Math.PI / 2);
    expect(c.calls("drawImage")[0]!.slice(1)).toEqual([0, 0, 100, 50, 20, 20, 100, 50]);
    const straight = fakeCanvas();
    drawUnderlay(straight.g, p, { ...u, rotation: 0 }, fullFrame(p, 10, 0, 0), false);
    expect(straight.calls("rotate")).toEqual([]);
    expect(straight.calls("clip")).toEqual([]);
  });
});
