import { describe, expect, it } from "vitest";
import { visibleOn } from "./colorMath";

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
