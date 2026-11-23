import { describe, expect, it } from "vitest";
import { deltaE2000, visibleOn, type Lab } from "./colorMath";

const o = { minDelta: 16, dark: "#7F776D", light: "#F4EFE6" };

describe("visibleOn", () => {
  it("keeps the fabric when the floss stands out on it", () => {
    expect(visibleOn("#F7F4EC", "#C72B3B", o)).toBe("#F7F4EC");
    expect(visibleOn("#F7F4EC", "#FDED54", o)).toBe("#F7F4EC"); // light but clearly yellow
    expect(visibleOn("#F7F4EC", "#000000", o)).toBe("#F7F4EC");
  });

  it("switches to a contrasting tile when the floss would vanish", () => {
    expect(visibleOn("#F7F4EC", "#FFFFFF", o)).toBe(o.dark); // white on white fabric
    expect(visibleOn("#F7F4EC", "#F0EADA", o)).toBe(o.dark); // ecru
    expect(visibleOn("#1B1B1B", "#000000", o)).toBe(o.light); // black on black fabric
  });
});

describe("deltaE2000", () => {
  // Sharma, Wu & Dalal (2005), test data pairs 1, 7, 13, 17, 25, 34
  const pairs: [Lab, Lab, number][] = [
    [[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425],
    [[50, 0, 0], [50, -1, 2], 2.3669],
    [[50, 2.4900, -0.0010], [50, -2.4900, 0.0011], 7.2195],
    [[50, 2.5, 0], [73, 25, -18], 27.1492],
    [[60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387], 1.2644],
    [[2.0776, 0.0795, -1.1350], [0.9033, -0.0636, -0.5514], 0.9082],
  ];
  it.each(pairs)("%j vs %j is %f", (a, b, want) => {
    expect(deltaE2000(a, b)).toBeCloseTo(want, 3);
    expect(deltaE2000(b, a)).toBeCloseTo(want, 3);
  });
});
