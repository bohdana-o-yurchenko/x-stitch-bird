import type { CustomColor } from "@/core/pattern/types";

/**
 * How the Threads and Beads pages show and order your own colours. Each view and each sort is one entry of a list,
 * so a new one is one line here, one message key and (for a view) one branch in `ThreadList`.
 */
export const VIEWS = ["gallery", "compact", "large"] as const;
export type InventoryView = (typeof VIEWS)[number];

export const SORTS = ["code", "name", "colour"] as const;
export type InventorySort = (typeof SORTS)[number];

const code = (a: CustomColor, b: CustomColor) => a.code.localeCompare(b.code, undefined, { numeric: true });
const name = (a: CustomColor, b: CustomColor) => (a.name || a.code).localeCompare(b.name || b.code, undefined, { numeric: true, sensitivity: "base" });

/** Position around the colour wheel (0–360), with greys (little colour) after the colours, dark to light. */
function hueKey(hex: string) {
  const n = parseInt(hex.replace("#", ""), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((x) => x / 255) as [number, number, number];
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (d < 0.08) return 1000 + (1 - (max + min) / 2);
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

const BY: Record<InventorySort, (a: CustomColor, b: CustomColor) => number> = {
  // by brand, then number — the order the page always had
  code: (a, b) => a.brand.localeCompare(b.brand) || code(a, b),
  name: (a, b) => name(a, b) || a.brand.localeCompare(b.brand) || code(a, b),
  colour: (a, b) => hueKey(a.hex) - hueKey(b.hex) || a.brand.localeCompare(b.brand) || code(a, b),
};

export const sortColours = (list: readonly CustomColor[], by: InventorySort) => [...list].sort(BY[by]);
