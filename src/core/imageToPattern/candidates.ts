import { DMC } from "../catalog/catalog";
import type { ColorEntry } from "../color/colorEntry";
import { createPattern } from "../pattern/createPattern";
import { makeBlendColor } from "../pattern/resolve";
import type { Blend } from "../pattern/types";
import { quantize, type Pixels, type QuantizeResult } from "./quantize";

export interface ImageToPatternInput {
  pixels: Pixels;
  maxColours: number;
  skipLightest: boolean;
  /** "DMC + my blends": the current pattern's blends are candidates too. */
  blends: Record<string, Blend> | null;
}

export function candidateColours(blends: Record<string, Blend> | null): ColorEntry[] {
  if (!blends) return [...DMC];
  const scratch = createPattern(1, 1);
  scratch.blends = blends;
  return [...DMC, ...Object.entries(blends).map(([id, b]) => makeBlendColor(scratch, id, b))];
}

export const imageToPattern = (input: ImageToPatternInput): QuantizeResult =>
  quantize(input.pixels, candidateColours(input.blends), input.maxColours, input.skipLightest);
