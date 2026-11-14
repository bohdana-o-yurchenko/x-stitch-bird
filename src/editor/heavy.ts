import { DMC, libraryColor } from "@/core/catalog/catalog";
import { imageToPattern, type ImageToPatternInput } from "@/core/imageToPattern/candidates";
import { findBlends } from "@/core/imageToPattern/findBlends";
import type { QuantizeResult } from "@/core/imageToPattern/quantize";
import type { ColorEntry } from "@/core/color/colorEntry";
import { straightenImage, type StraightenJob } from "@/workers/straightenImage";

/** Runs `job` in a Web Worker; falls back to the main thread if workers are unavailable. */
function inWorker<I, O>(make: () => Worker, input: I, fallback: (i: I) => O | Promise<O>): Promise<O> {
  return new Promise((resolve) => {
    let w: Worker;
    try {
      w = make();
    } catch {
      return resolve(fallback(input));
    }
    w.onmessage = (e: MessageEvent<O>) => {
      resolve(e.data);
      w.terminate();
    };
    w.onerror = () => {
      w.terminate();
      resolve(fallback(input));
    };
    w.postMessage(input);
  });
}

export const runImageToPattern = (input: ImageToPatternInput): Promise<QuantizeResult> =>
  inWorker(() => new Worker(new URL("../workers/imageToPattern.worker.ts", import.meta.url), { type: "module" }), input, imageToPattern);

export interface BlendSuggestionView {
  a: ColorEntry;
  b: ColorEntry;
  deltaE: number;
}

export async function runFindBlends(hex: string): Promise<BlendSuggestionView[]> {
  const raw = await inWorker<string, { a: string; b: string; deltaE: number }[]>(
    () => new Worker(new URL("../workers/findBlends.worker.ts", import.meta.url), { type: "module" }),
    hex,
    (h) => findBlends(h, DMC).map((s) => ({ a: s.a.id, b: s.b.id, deltaE: s.deltaE })),
  );
  return raw.map((s) => ({ a: libraryColor(s.a)!, b: libraryColor(s.b)!, deltaE: s.deltaE }));
}

/** Perspective-straightens part of a photo (SPEC §15.15) off the main thread. */
export const runStraighten = (job: StraightenJob): Promise<Blob> =>
  inWorker(() => new Worker(new URL("../workers/straighten.worker.ts", import.meta.url), { type: "module" }), job, straightenImage);
