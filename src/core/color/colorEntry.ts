import { hexToRgb, linearToLab, luma, srgbToLinear, type Lab, type Rgb } from "./colorMath";

export type ColorKind = "thread" | "bead" | "combo";

export interface ColorInput {
  id: string;
  kind: ColorKind;
  brand: string;
  code: string;
  name: string;
  hex: string;
  order: number;
  series?: string;
  dmc?: string;
}

/** A thread, bead, blend or combo with everything the app needs precomputed (SPEC §2.4). */
export interface ColorEntry extends ColorInput {
  rgb: Rgb;
  lin: [number, number, number];
  lab: Lab;
  /** Sort key for "by colour": greys after all hues. */
  hue: number;
  /** Symbol colour readable on this colour. */
  ink: string;
  isBlend?: boolean;
  parts?: { entry: ColorEntry; n: number }[];
  isCombo?: boolean;
  thread?: ColorEntry;
  bead?: ColorEntry;
}

export const DARK_INK = "#1d1a16";

export function makeColor<T extends ColorInput>(input: T): T & ColorEntry {
  let hex = input.hex.toUpperCase();
  if (hex[0] !== "#") hex = "#" + hex;
  const rgb = hexToRgb(hex);
  const lin = rgb.map(srgbToLinear) as [number, number, number];
  const [r, g, b] = rgb.map((v) => v / 255) as [number, number, number];
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) {
    h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const L = (mx + mn) / 2;
  const S = d ? d / (1 - Math.abs(2 * L - 1)) : 0;
  return {
    ...input,
    hex,
    rgb,
    lin,
    lab: linearToLab(lin),
    hue: S < 0.12 ? 1000 + (1 - L) : h + L * 0.001,
    ink: luma(rgb) > 150 ? DARK_INK : "#fff",
  };
}
