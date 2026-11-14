import { describe, expect, it } from "vitest";
import { cleanUnderlay, dragUnderlay, fitToChart, handleAt, newUnderlay, resetCrop, straightenedSize, stretchUnderlay } from "./underlay";

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

  it("stretches around an anchor point, which stays on the same image spot", () => {
    const r = stretchUnderlay({ x: 0, y: 0, w: 100, h: 50 }, { x: 25, y: 10 }, 2, 1);
    expect([r.x, r.y, r.w, r.h].map((v) => +v.toFixed(6))).toEqual([-0.5, -0.2, 102, 51]);
    expect((25 - r.x) / r.w).toBeCloseTo(0.25);
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
    expect(cleanUnderlay(base())).toMatchObject({ opacity: 0.5, behind: false, tool: "move" });
  });
});
