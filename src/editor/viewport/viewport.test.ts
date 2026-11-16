import { beforeEach, describe, expect, it } from "vitest";
import { testEditor } from "../../../tests/support/editorHarness";
import { wheelGesture } from "./viewport";

let ed: ReturnType<typeof testEditor>["ed"];
const RULER = 26;

beforeEach(() => {
  ed = testEditor(20, 10).ed;
  ed.viewport.setSize(426, 326); // 400 × 300 beside the rulers
});

describe("viewport (SPEC §5.1)", () => {
  it("fits the whole chart, centred, on a half-step zoom", () => {
    ed.viewport.fit();
    const { zoom, offX, offY } = ed.state.viewport;
    expect(zoom).toBe(18.5); // (400 − 30) / 20
    expect(offX).toBe((400 - 20 * zoom) / 2);
    expect(offY).toBe((300 - 10 * zoom) / 2);
    expect(ed.viewport.percent).toBe(Math.round((18.5 / 12) * 100));
  });

  it("converts between screen, grid and cells both ways", () => {
    ed.store.setState({ viewport: { zoom: 10, offX: 5, offY: 7 } });
    expect(ed.viewport.toGrid(RULER + 5 + 25, RULER + 7 + 10)).toEqual({ x: 2.5, y: 1 });
    expect(ed.viewport.toCell(RULER + 5 + 25, RULER + 7 + 19)).toEqual({ x: 2, y: 1 });
    expect(ed.viewport.toScreen({ x: 2.5, y: 1 })).toEqual({ x: RULER + 30, y: RULER + 17 });
    expect(ed.viewport.visibleGrid()).toEqual({ x: -0.5, y: -0.7, w: 40, h: 30 });
    expect(ed.viewport.centreOnScreen()).toEqual({ x: 226, y: 176 });
  });

  it("zooms around the pointer and stays within limits", () => {
    ed.store.setState({ viewport: { zoom: 10, offX: 0, offY: 0 } });
    const before = ed.viewport.toGrid(200, 150);
    ed.viewport.zoomAt(2, 200, 150);
    expect(ed.state.viewport.zoom).toBe(20);
    const after = ed.viewport.toGrid(200, 150);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
    ed.viewport.zoomAt(100);
    expect(ed.state.viewport.zoom).toBe(60);
    ed.viewport.zoomAt(0.0001);
    expect(ed.state.viewport.zoom).toBe(2);
  });

  it("pans with the trackpad, sideways with Shift + wheel, and zooms with a mouse wheel", () => {
    ed.store.setState({ viewport: { zoom: 10, offX: 0, offY: 0 } });
    const wheel = (o: Partial<Parameters<typeof ed.viewport.wheel>[0]>) => ed.viewport.wheel({ deltaX: 0, deltaY: 0, deltaMode: 0, ctrlKey: false, metaKey: false, shiftKey: false, ...o }, 100, 100);
    wheel({ deltaX: 4, deltaY: 7.5 });
    expect(ed.state.viewport).toEqual({ zoom: 10, offX: -4, offY: -7.5 });
    wheel({ deltaY: 100, shiftKey: true });
    expect(ed.state.viewport).toEqual({ zoom: 10, offX: -104, offY: -7.5 });
    wheel({ deltaY: -100 }); // a wheel notch up: zoom in
    expect(ed.state.viewport.zoom).toBeGreaterThan(10);
    const z = ed.state.viewport.zoom;
    wheel({ deltaY: 3, deltaMode: 1 }); // line-based wheels zoom too
    expect(ed.state.viewport.zoom).toBeLessThan(z);
  });

  it("centres a cell, zooming in when it would be too small, and flashes it", () => {
    ed.store.setState({ viewport: { zoom: 4, offX: 0, offY: 0 } });
    ed.viewport.centreOn(25); // cell (5, 1)
    expect(ed.state.viewport.zoom).toBe(10);
    expect(ed.viewport.toGrid(RULER + 200, RULER + 150)).toEqual({ x: 5.5, y: 1.5 });
    expect(ed.state.flash?.cell).toBe(25);
  });

  it("reads wheel gestures the same for the chart and the photo windows: pinch zooms, two fingers move", () => {
    const ev = (o: Partial<Parameters<typeof wheelGesture>[0]>) => ({ deltaX: 0, deltaY: 0, deltaMode: 0, ctrlKey: false, metaKey: false, shiftKey: false, ...o });
    // two fingers on a trackpad: small pixel deltas, no Ctrl — a move, never a zoom
    expect(wheelGesture(ev({ deltaX: 3, deltaY: -7.5 }))).toEqual({ zoom: 0, dx: -3, dy: 7.5 });
    // a pinch arrives as Ctrl + small deltas: a zoom (in for a negative delta)
    expect(wheelGesture(ev({ deltaY: -4, ctrlKey: true })).zoom).toBeGreaterThan(1);
    expect(wheelGesture(ev({ deltaY: 4, ctrlKey: true })).zoom).toBeLessThan(1);
    // a real mouse wheel zooms; with Shift it moves sideways
    expect(wheelGesture(ev({ deltaY: 100 })).zoom).toBeLessThan(1);
    expect(wheelGesture(ev({ deltaY: 100, shiftKey: true }))).toEqual({ zoom: 0, dx: -100, dy: 0 });
  });
});

