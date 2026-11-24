import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createPattern } from "@/core/pattern/createPattern";
import { addEntry } from "@/core/pattern/keyEntries";
import { buildPalette } from "@/core/pattern/palette";
import { ALL_SYMBOLS } from "@/core/symbols/symbols";
import { fakeCanvas, FakePath2D } from "../../tests/support/fakeCanvas";
import { ChartRenderer, type ChartScene } from "./ChartRenderer";
import { defaultCanvasTheme as theme } from "./theme";

beforeAll(() => vi.stubGlobal("Path2D", FakePath2D));

function setup() {
  const p = createPattern(20, 15, "R");
  const cross = addEntry(p, { t: "thread", src: "dmc:310", n: 2, st: "full" }, ALL_SYMBOLS);
  const back = addEntry(p, { t: "back", src: "dmc:321", n: 1 }, ALL_SYMBOLS);
  const knot = addEntry(p, { t: "knot", src: "dmc:321", n: 2 }, ALL_SYMBOLS);
  const bead = addEntry(p, { t: "bead", src: "bead:02011" }, ALL_SYMBOLS);
  p.layers.stitches.fill(cross, 0, 40);
  p.layers.beads[45] = bead;
  p.layers.partials.set(50, [{ kind: "quarter", corner: 1, k: cross }]);
  p.layers.segments.push({ x1: 0, y1: 0, x2: 5, y2: 0, k: back });
  p.layers.knots.push({ x: 3.5, y: 2.5, k: knot });
  p.layers.ambiguous.add(3);
  const palette = buildPalette(p);
  const scene: ChartScene = {
    pattern: p, palette, view: "both", viewport: { zoom: 20, offX: 0, offY: 0 }, mirror: "off", hover: null, pickerHighlight: null, preview: null, partialPreview: null, knotPreview: null, chain: null, hoverPoint: null,
    selection: null, floating: null, marquee: null, eraseHighlight: null, flash: null, underlay: null, underlayFrame: null, underlayHot: null, underlayButtons: [], highlight: null, checks: null, match: null,
  };
  const c = fakeCanvas();
  const canvas = { getContext: () => c.g, width: 0, height: 0 } as unknown as HTMLCanvasElement;
  let current = scene;
  // the cached chart image draws into the same log: a test sees everything drawn, cached or on screen
  const r = new ChartRenderer(canvas, theme, () => current, () => ({ getContext: () => c.g, width: 0, height: 0 }));
  r.resize(600, 400, 2);
  return {
    r, c, canvas, scene, p, cross, back, knot, bead,
    set: (s: Partial<ChartScene>) => (current = { ...current, ...s }),
    /** The next frame: only what changed is drawn again. */
    draw: () => { c.log.length = 0; r.draw(); },
    /** A frame drawn from scratch, the cached chart included (as after a resize). */
    fresh: () => { c.log.length = 0; r.resize(600, 400, 2); },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("requestAnimationFrame", (f: () => void) => setTimeout(f, 16));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.stubGlobal("Path2D", FakePath2D);
});

describe("the chart canvas", () => {
  it("outlines the picked bead, knot, segment and partial with the picker accent instead of a cell square", () => {
    const t = setup();
    const assertOutline = (hit: NonNullable<ChartScene["pickerHighlight"]>, check: () => void) => {
      t.set({ pickerHighlight: hit });
      t.draw();
      expect(t.c.values("strokeStyle")).toContain(theme.accent);
      check();
      expect(t.c.calls("strokeRect")).not.toContainEqual([26 + 5 * 20 + 1, 26 + 2 * 20 + 1, 18, 18]);
    };
    assertOutline({ kind: "bead", cell: 45, key: t.bead }, () => {
      expect(t.c.calls("arc")).toContainEqual([26 + 5.5 * 20, 26 + 2.5 * 20, 20 * (t.scene.palette[t.bead]!.bead!.shape.r ?? 0.4), 0, Math.PI * 2]);
    });
    assertOutline({ kind: "knot", point: t.p.layers.knots[0]!, key: t.knot }, () => {
      expect(t.c.calls("arc")).toContainEqual([26 + 3.5 * 20, 26 + 2.5 * 20, Math.max(2, 20 * theme.knots.radius) + 1, 0, Math.PI * 2]);
    });
    assertOutline({ kind: "segment", segment: t.p.layers.segments[0]!, key: t.back }, () => {
      expect(t.c.calls("moveTo")).toContainEqual([26, 26]);
      expect(t.c.calls("lineTo")).toContainEqual([126, 26]);
    });
    assertOutline({ kind: "partial", cell: 50, stitch: t.p.layers.partials.get(50)![0]!, key: t.cross }, () => {
      expect(t.c.calls("closePath").length).toBeGreaterThan(0);
      expect(t.c.calls("stroke").length).toBeGreaterThan(0);
    });
  });
  it("leaves out the kinds of stitches that are hidden, and only those", () => {
    const t = setup();
    const at = (x: number, y: number) => t.c.calls("arc").some((a) => a[0] === 26 + x * 20 && a[1] === 26 + y * 20);
    const count = (hidden: ChartScene["hidden"], call: string) => { t.set({ hidden }); t.fresh(); return t.c.calls(call).length; };
    t.fresh();
    expect(at(5.5, 2.5) && at(3.5, 2.5)).toBe(true);
    t.set({ hidden: ["beads"] });
    t.draw();
    expect([at(5.5, 2.5), at(3.5, 2.5)]).toEqual([false, true]);
    t.set({ hidden: ["knots"] });
    t.draw();
    expect([at(5.5, 2.5), at(3.5, 2.5)]).toEqual([true, false]);
    // crosses: their cells and symbols go; backstitch and partial stitches: their own strokes and shapes
    expect(count(["crosses"], "fillRect")).toBeLessThan(count([], "fillRect"));
    expect(count(["backstitch"], "stroke")).toBeLessThan(count([], "stroke"));
    expect(count(["partials"], "fill")).toBeLessThan(count([], "fill"));
    // floss + bead in a cell goes with the beads, not the crosses
    t.p.combos["combo:x"] = { thread: "dmc:310", bead: "bead:00557" };
    const combo = addEntry(t.p, { t: "combo", src: "combo:x", n: 2, st: "full" }, ALL_SYMBOLS);
    t.p.layers.stitches.fill(0);
    t.p.layers.stitches[60] = combo;
    t.set({ palette: buildPalette(t.p) });
    expect(count(["crosses"], "fillRect")).toBeGreaterThan(count(["beads"], "fillRect"));
    expect(count(["beads"], "fillRect")).toBe(count(["crosses", "beads"], "fillRect"));
  });

  it("is sized for the screen's pixel density and drawn straight away", () => {
    const t = setup();
    expect(t.canvas.width).toBe(1200);
    expect(t.canvas.height).toBe(800);
    expect(t.c.calls("setTransform")).toContainEqual([2, 0, 0, 2, 0, 0]);
    expect(t.c.calls("fillRect").length).toBeGreaterThan(0);
  });

  it("starts from the stage background over the whole canvas, then draws the chart", () => {
    const t = setup();
    t.fresh();
    expect(t.c.log.find((l) => l[0] === "set" && l[1] === "fillStyle")![2]).toBe(theme.stageBackground);
    expect(t.c.calls("fillRect")[0]).toEqual([0, 0, 600, 400]);
    expect(t.c.log.length).toBeGreaterThan(100);
  });

  it("many requests make one redraw in the next frame", () => {
    const t = setup();
    t.c.log.length = 0;
    t.r.request();
    t.r.request();
    t.r.request();
    expect(t.c.calls("drawImage")).toHaveLength(0);
    vi.advanceTimersByTime(20);
    // one frame: the cached chart copied to the screen once
    expect(t.c.calls("drawImage")).toHaveLength(1);
  });

  it("a new theme is drawn in the next frame", () => {
    const t = setup();
    t.c.log.length = 0;
    t.r.setTheme({ ...theme, stageBackground: "#123456" });
    vi.advanceTimersByTime(20);
    expect(t.c.values("fillStyle")[0]).toBe("#123456");
  });

  it("draws more when more is zoomed in on: a cell off the screen is not drawn", () => {
    const t = setup();
    t.set({ viewport: { zoom: 20, offX: 0, offY: 0 } });
    t.fresh();
    const whole = t.c.log.length;
    t.set({ viewport: { zoom: 20, offX: -20 * 12, offY: -20 * 10 } });
    t.fresh();
    expect(t.c.log.length).toBeLessThan(whole);
  });

  it("highlighting draws the other entries faded, then the chosen one at full strength", () => {
    const t = setup();
    t.set({ highlight: t.cross });
    t.draw();
    const alphas = t.c.values("globalAlpha");
    expect(alphas).toContain(theme.highlight.dimAlpha);
    expect(alphas.slice(alphas.indexOf(theme.highlight.dimAlpha))).toContain(1);
    expect(alphas.indexOf(theme.highlight.dimAlpha)).toBeLessThan(alphas.indexOf(1, alphas.indexOf(theme.highlight.dimAlpha)));
  });

  it("a highlighted entry that no longer exists is ignored", () => {
    const t = setup();
    t.set({ highlight: 99 });
    expect(() => t.draw()).not.toThrow();
    expect(t.c.values("globalAlpha")).not.toContain(theme.highlight.dimAlpha);
  });

  it("a selection or a flash keeps the marching ants going, and nothing else needs a timer", () => {
    const t = setup();
    t.draw();
    expect(vi.getTimerCount()).toBe(0);
    t.set({ selection: { mask: new Uint8Array(300), bounds: { x: 0, y: 0, w: 2, h: 2 } } });
    t.draw();
    expect(vi.getTimerCount()).toBe(1);
    t.c.log.length = 0;
    vi.advanceTimersByTime(130);
    vi.advanceTimersByTime(20);
    expect(t.c.calls("setTransform").length).toBeGreaterThanOrEqual(1);
  });

  it("draws every overlay without trouble: previews, chain, hover, selection, floating piece, marquee, erase highlight, checks and the matching block", () => {
    const t = setup();
    const floating = { pattern: t.p, palette: t.scene.palette, at: { x: 2, y: 2 } };
    t.set({
      preview: { cells: [1, 2, 3], key: t.cross }, partialPreview: { cell: 5, stitch: { kind: "quarter", corner: 0, k: t.cross } }, knotPreview: { point: { x: 2, y: 2 }, key: t.knot },
      chain: { last: { x: 1, y: 1 }, hover: { x: 3, y: 2 }, key: t.back }, hoverPoint: { x: 4.5, y: 4 }, hover: { x: 3, y: 3, size: 2 },
      selection: { mask: new Uint8Array(300).fill(1, 0, 10), bounds: { x: 0, y: 0, w: 10, h: 1 } }, floating, marquee: { x: 1, y: 1, w: 4, h: 3 },
      eraseHighlight: [{ x1: 0, y1: 0, x2: 5, y2: 0, k: t.back }], eraseKnots: [{ x: 2, y: 2, k: t.knot }], flash: { cell: 7, until: Date.now() + 1000 },
      checks: { all: [[1, 2], [30]], current: [1, 2] }, match: { block: { x: 0, y: 0, w: 10, h: 10 }, chosen: true, ghosts: t.p, view: "both" },
    });
    expect(() => t.draw()).not.toThrow();
    expect(t.c.log.length).toBeGreaterThan(300);
  });

  it("an unknown preview entry is skipped quietly, in every view", () => {
    const t = setup();
    for (const view of ["color", "symbols", "both"] as const) {
      t.set({ view, preview: { cells: [1], key: 99 }, partialPreview: { cell: 1, stitch: { kind: "quarter", corner: 0, k: 99 } }, knotPreview: { point: { x: 1, y: 1 }, key: 99 }, chain: { last: { x: 0, y: 0 }, hover: { x: 1, y: 1 }, key: 99 } });
      expect(() => t.draw(), view).not.toThrow();
    }
  });

  it("the rulers show the numbering, and none when the chart is empty of room", () => {
    const t = setup();
    t.draw();
    const texts = t.c.calls("fillText").map((c) => String(c[0]));
    expect(texts).toContain("10");
    expect(texts).toContain("20");
  });

  it("the image behind the chart is drawn under the stitches, and in edit mode over them with its handles", () => {
    const t = setup();
    const image = { naturalWidth: 100, naturalHeight: 100 } as unknown as HTMLImageElement;
    const u = { image, crop: { x: 0, y: 0, w: 100, h: 100 }, rect: { x: 2, y: 2, w: 8, h: 8 }, opacity: 0.5, rotation: 5 };
    t.set({ underlay: { ...u, editing: false } as never });
    t.draw();
    const behind = t.c.calls("drawImage").length;
    expect(behind).toBeGreaterThan(0);
    t.set({ underlay: { ...u, editing: true } as never, underlayFrame: { x: 50, y: 50, w: 200, h: 100 }, underlayHot: "e", underlayButtons: [{ x: 100, y: 40, dir: -1 }, { x: 130, y: 40, dir: 1 }] });
    expect(() => t.draw()).not.toThrow();
    expect(t.c.calls("drawImage").length).toBeGreaterThan(0);
  });
});

describe("the chart is kept between frames and drawn again only where it changed", () => {
  /** The areas redrawn in the cached chart, in device px: the clip rects. */
  const redrawn = (t: ReturnType<typeof setup>) => t.c.calls("clip").length;
  const fabricFills = (t: ReturnType<typeof setup>) => t.c.calls("fillRect").filter((r) => r[2] === 20 * 20 && r[3] === 15 * 20).length;

  it("hover, picker outline, previews and the like don't draw the chart again", () => {
    const t = setup();
    t.set({ hover: { x: 3, y: 3, size: 1 }, hoverPoint: { x: 2, y: 2 }, preview: { cells: [5, 6], key: t.cross } });
    t.draw();
    expect(redrawn(t)).toBe(0);
    expect(fabricFills(t)).toBe(0);
    // the cached chart is copied to the screen, the hover square drawn over it
    expect(t.c.calls("drawImage")).toHaveLength(1);
    expect(t.c.calls("strokeRect").length).toBeGreaterThan(0);
  });

  it("a painted cell: only its tile is drawn again, and only once", () => {
    const t = setup();
    t.p.layers.stitches[2 * 20 + 18] = t.cross;
    t.draw();
    // the tile from cell (16,0): 4 × 15 cells of 20 px, at device px (×2) past the 26 px ruler
    expect(t.c.calls("rect")[0]).toEqual([2 * (26 + 16 * 20), 2 * 26, 2 * 4 * 20, 2 * 15 * 20]);
    expect(redrawn(t)).toBe(1);
    t.draw();
    expect(redrawn(t)).toBe(0);
  });

  it("undo, a new line or a knot: drawn again where they are", () => {
    const t = setup();
    t.p.layers.segments.push({ x1: 1, y1: 1, x2: 2, y2: 2, k: t.back });
    t.draw();
    expect(redrawn(t)).toBe(1);
    t.p.layers.knots = [];
    t.draw();
    expect(redrawn(t)).toBe(1);
  });

  it("panning moves the chart along and draws only the uncovered strip", () => {
    const t = setup();
    t.set({ viewport: { zoom: 20, offX: -10, offY: 0 } });
    t.draw();
    expect(t.c.values("globalCompositeOperation")).toContain("copy");
    expect(t.c.calls("drawImage")[0]!.slice(1)).toEqual([-20, 0]);
    // the right-hand strip, 10 px wide
    expect(t.c.calls("rect")).toContainEqual([2 * 590, 0, 20, 800]);
    expect(redrawn(t)).toBe(1);
  });

  it("zooming, another view, other colours or highlighting draw it all again", () => {
    const t = setup();
    for (const change of [{ viewport: { zoom: 21, offX: 0, offY: 0 } }, { view: "symbols" }, { palette: buildPalette(t.p) }, { highlight: t.cross }] as Partial<ChartScene>[]) {
      t.set(change);
      t.draw();
      expect(t.c.calls("rect")[0]).toEqual([0, 0, 1200, 800]);
    }
  });

  it("panning by a fraction of a device pixel draws it all again, not blurred", () => {
    const t = setup();
    t.set({ viewport: { zoom: 20, offX: -0.25, offY: 0 } });
    t.draw();
    expect(t.c.values("globalCompositeOperation")).not.toContain("copy");
    expect(t.c.calls("rect")[0]).toEqual([0, 0, 1200, 800]);
  });
});
