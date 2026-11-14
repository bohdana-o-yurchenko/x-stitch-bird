import { describe, expect, it } from "vitest";
import { cleanUnderlay, dragUnderlay, fitToChart, handleAt, newUnderlay, resetCrop } from "./underlay";

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

  it("keeps at least one cell when shrinking", () => {
    expect(dragUnderlay(base(), "e", -100, 0, false).rect.w).toBe(1);
  });

  it("rejects malformed stored underlays", () => {
    expect(cleanUnderlay({ src: "http://x" })).toBeNull();
    expect(cleanUnderlay(base())).toMatchObject({ opacity: 0.5, behind: false, tool: "move" });
  });
});
