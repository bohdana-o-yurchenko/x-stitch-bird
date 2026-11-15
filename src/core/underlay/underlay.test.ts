import { describe, expect, it } from "vitest";
import { cleanUnderlay, dragUnderlay, fitToChart, handleAt, newUnderlay, frameHandleAt, frameNeeded, gridToImage, imageToGrid, pinImagePoint, resetCrop, resizeRect, rotateUnderlay, ROTATION_STEP, straightenedSize, turnedBounds } from "./underlay";

// image 200×100 px placed over a 40×40 chart
const base = () => ({ ...newUnderlay("data:image/jpeg;base64,x", 200, 100, { w: 40, h: 40 }) });

describe("chart underlay geometry (SPEC §15.15)", () => {
  it("fits the visible part to the chart, centred, aspect kept", () => {
    expect(fitToChart({ x: 0, y: 0, w: 200, h: 100 }, { w: 40, h: 40 })).toEqual({ x: 0, y: 10, w: 40, h: 20 });
  });

  it.each([
    [{ x: 0, y: 10 }, "nw"], [{ x: 20, y: 10 }, "n"], [{ x: 40, y: 30 }, "se"], [{ x: 0, y: 20 }, "w"], [{ x: 10, y: 15 }, "inside"], [{ x: 50, y: 15 }, null],
  ] as const)("finds the handle at %o", (p, h) => {
    expect(handleAt(base().rect, p, 0.5)).toBe(h);
  });

  it("moves, resizes a corner with the aspect kept and an edge freely", () => {
    const u = base();
    expect(dragUnderlay(u, "inside", 2, -1, false).rect).toEqual({ x: 2, y: 9, w: 40, h: 20 });
    expect(dragUnderlay(u, "se", -20, 0, false).rect).toEqual({ x: 0, y: 10, w: 20, h: 10 });
    expect(dragUnderlay(u, "nw", 10, 0, false).rect).toEqual({ x: 10, y: 15, w: 30, h: 15 });
    expect(dragUnderlay(u, "se", -20, 0, true).rect).toEqual({ x: 0, y: 10, w: 20, h: 20 });
    expect(dragUnderlay(u, "e", 5, 3, false).rect).toEqual({ x: 0, y: 10, w: 45, h: 20 });
  });

  it("crops without moving or rescaling what stays visible, and never past the image", () => {
    const u = { ...base(), tool: "crop" as const };
    const left = dragUnderlay(u, "w", 10, 0, false);
    expect(left.rect).toEqual({ x: 10, y: 10, w: 30, h: 20 });
    expect(left.crop).toEqual({ x: 50, y: 0, w: 150, h: 100 });
    expect(dragUnderlay(u, "e", 30, 0, false).rect.w).toBe(40);
    expect(dragUnderlay({ ...u, ...left }, "w", -50, 0, false).crop.x).toBe(0);
    expect(resetCrop({ ...u, ...left })).toEqual({ crop: { x: 0, y: 0, w: 200, h: 100 }, rect: { x: 0, y: 10, w: 40, h: 20 } });
  });

  it("maps image pixels to the chart and back, turn included, and pins a pixel back in place", () => {
    const u = { ...base(), rect: { x: 2, y: 3, w: 40, h: 20 }, rotation: 3 };
    const px = { x: 37, y: 81 }, g = imageToGrid(u, px), back = gridToImage(u, g);
    expect([back.x, back.y].map((v) => +v.toFixed(6))).toEqual([37, 81]);
    const moved = pinImagePoint({ ...u, rect: { ...u.rect, w: 44 } }, px, g), again = imageToGrid(moved, px);
    expect(Math.hypot(again.x - g.x, again.y - g.y)).toBeLessThan(1e-6);
  });

  it("turns in small steps around a pivot, which stays on the same image spot, within ±45°", () => {
    const u = { ...base(), rect: { x: 0, y: 0, w: 40, h: 20 } };
    const pivot = { x: 30, y: 5 }, under = gridToImage(u, pivot);
    const r = rotateUnderlay(u, ROTATION_STEP, pivot);
    expect(r.rotation).toBe(0.2);
    const still = gridToImage(r, pivot);
    expect(Math.hypot(still.x - under.x, still.y - under.y)).toBeLessThan(1e-6);
    expect(rotateUnderlay({ ...u, rotation: 44.9 }, 1, pivot).rotation).toBe(45);
    expect(turnedBounds({ ...u, rotation: 90 })).toMatchObject({ w: expect.closeTo(20, 6), h: expect.closeTo(40, 6) });
  });

  it("resizing a turned image keeps the opposite side where it was", () => {
    const u = { ...base(), rect: { x: 0, y: 0, w: 40, h: 20 }, rotation: 10 };
    const leftMid = imageToGrid(u, { x: 0, y: 50 });
    const next = { ...u, ...dragUnderlay(u, "e", 4, 0, false) };
    const after = imageToGrid(next, { x: 0, y: 50 });
    expect(Math.hypot(after.x - leftMid.x, after.y - leftMid.y)).toBeLessThan(1e-6);
    expect(next.rect.w).toBeGreaterThan(40);
  });


  it("asks for the edit frame only when the image covers the view and 3+ of its sides are off-screen", () => {
    const img = { x: 0, y: 0, w: 100, h: 80 };
    expect(frameNeeded(img, { x: 40, y: 30, w: 10, h: 8 })).toBe(true);
    expect(frameNeeded(img, { x: -5, y: 30, w: 10, h: 8 })).toBe(true);
    expect(frameNeeded(img, { x: -5, y: -5, w: 10, h: 8 })).toBe(false);
    expect(frameNeeded(img, { x: -10, y: -10, w: 120, h: 100 })).toBe(false);
    expect(frameNeeded(img, { x: 200, y: 200, w: 10, h: 8 })).toBe(false);
  });

  it("lets the edit frame be grabbed anywhere along a side, corners first", () => {
    const f = { x: 0, y: 0, w: 240, h: 160 };
    expect([frameHandleAt(f, { x: 241, y: 30 }, 8), frameHandleAt(f, { x: 2, y: 158 }, 8), frameHandleAt(f, { x: 120, y: 80 }, 8)]).toEqual(["e", "sw", null]);
    // a band along the whole outline, inside and outside; corners win where two sides meet
    expect([frameHandleAt(f, { x: 228, y: 30 }, 14), frameHandleAt(f, { x: 252, y: 30 }, 14), frameHandleAt(f, { x: 256, y: 30 }, 14)]).toEqual(["e", "e", null]);
    expect([frameHandleAt(f, { x: 250, y: 170 }, 14), frameHandleAt(f, { x: 120, y: 172 }, 14), frameHandleAt(f, { x: 120, y: 176 }, 14)]).toEqual(["se", "s", null]);
    // a frame smaller than the band: the nearer side wins, so every side can still be taken
    const tiny = { x: 0, y: 0, w: 20, h: 20 };
    expect([frameHandleAt(tiny, { x: 4, y: 10 }, 14), frameHandleAt(tiny, { x: 16, y: 10 }, 14)].map((h) => h![h!.length - 1])).toEqual(["w", "e"]);
  });

  it("resizes a box from a side, or a corner with the aspect kept", () => {
    expect(resizeRect({ x: 0, y: 0, w: 200, h: 100 }, "e", 20, 5, false, 10)).toEqual({ x: 0, y: 0, w: 220, h: 100 });
    expect(resizeRect({ x: 0, y: 0, w: 200, h: 100 }, "nw", -20, 0, false, 10)).toEqual({ x: -20, y: -10, w: 220, h: 110 });
  });


  it("sizes a straightened picture like the photo, within the limit", () => {
    const corners = [{ x: 0, y: 0 }, { x: 800, y: 0 }, { x: 800, y: 600 }, { x: 0, y: 600 }] as const;
    expect(straightenedSize({ corners: [...corners] as never, cols: 80, rows: 60 })).toEqual({ w: 800, h: 600 });
    expect(straightenedSize({ corners: [...corners] as never, cols: 80, rows: 60 }, 400)).toEqual({ w: 400, h: 300 });
  });

  it("keeps at least one cell when shrinking", () => {
    expect(dragUnderlay(base(), "e", -100, 0, false).rect.w).toBe(1);
  });

  it("rejects malformed stored underlays", () => {
    expect(cleanUnderlay({ src: "http://x" })).toBeNull();
    // files and older storage call the picture `src`; a broken straighten record is dropped, the rest kept
    const legacy = cleanUnderlay({ ...base(), image: undefined, src: "data:image/jpeg;base64,x", straighten: { corners: [1, 2] } });
    expect(legacy).toMatchObject({ image: "data:image/jpeg;base64,x" });
    expect(legacy!.straighten).toBeUndefined();
    expect(cleanUnderlay({ ...base(), rotation: 80 })!.rotation).toBe(45);
    expect(cleanUnderlay(base())).toMatchObject({ opacity: 0.5, behind: false, tool: "move" });
  });
});
