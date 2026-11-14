import { warpQuad } from "@/core/geometry/homography";
import type { Point } from "@/core/pattern/types";

export interface StraightenJob {
  blob: Blob;
  /** Corners of the area on the photo, in the photo's pixels: top-left, top-right, bottom-right, bottom-left. */
  corners: Point[];
  w: number;
  h: number;
}

/** Decodes the photo, straightens the marked area into a `w`×`h` picture and encodes it as JPEG. */
export async function straightenImage(job: StraightenJob): Promise<Blob> {
  const bmp = await createImageBitmap(job.blob);
  const src = new OffscreenCanvas(bmp.width, bmp.height), sg = src.getContext("2d")!;
  sg.drawImage(bmp, 0, 0);
  bmp.close();
  const out = warpQuad(sg.getImageData(0, 0, src.width, src.height), job.corners, job.w, job.h);
  const dst = new OffscreenCanvas(job.w, job.h);
  dst.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(out.data), job.w, job.h), 0, 0);
  return dst.convertToBlob({ type: "image/jpeg", quality: 0.92 });
}
