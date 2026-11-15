import type { Pixels } from "@/core/imageToPattern/quantize";
import type { GreyImage } from "@/core/matching/match";
import type { Rect } from "@/core/pattern/types";

export function loadImage(src: string | Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = typeof src === "string" ? src : URL.createObjectURL(src);
    img.onload = () => {
      if (typeof src !== "string") URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => reject(new Error("image"));
    img.src = url;
  });
}

/** JPEG with the longest side at most `max` px, on white (reference photos, SPEC §11.1). */
export function downscaleToBlob(img: HTMLImageElement, max = 1600, quality = 0.86): Promise<Blob> {
  const k = Math.min(1, max / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round((img.naturalWidth || img.width) * k));
  c.height = Math.max(1, Math.round((img.naturalHeight || img.height) * k));
  const g = c.getContext("2d")!;
  g.fillStyle = "#fff";
  g.fillRect(0, 0, c.width, c.height);
  g.drawImage(img, 0, 0, c.width, c.height);
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("jpeg"))), "image/jpeg", quality));
}

/** The image scaled to `w` stitches wide (height keeps the aspect ratio), as raw RGBA pixels. */
export function scaledPixels(img: HTMLImageElement, w: number): Pixels {
  const h = Math.max(1, Math.round((img.height / img.width) * w));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.imageSmoothingQuality = "high";
  g.drawImage(img, 0, 0, w, h);
  const d = g.getImageData(0, 0, w, h);
  return { width: w, height: h, data: d.data };
}

export const canvasToBlob = (c: HTMLCanvasElement): Promise<Blob> =>
  new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("png"))), "image/png"));

/** Part of an image (`r`, in image pixels) as grey values, for symbol matching (SPEC §15.11). */
export function greyRegion(img: HTMLImageElement, r: Rect): GreyImage {
  const c = document.createElement("canvas");
  c.width = Math.max(1, r.w);
  c.height = Math.max(1, r.h);
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.drawImage(img, r.x, r.y, c.width, c.height, 0, 0, c.width, c.height);
  const d = g.getImageData(0, 0, c.width, c.height).data, data = new Uint8Array(c.width * c.height);
  for (let i = 0; i < data.length; i++) data[i] = Math.round(0.299 * d[i * 4]! + 0.587 * d[i * 4 + 1]! + 0.114 * d[i * 4 + 2]!);
  return { x: r.x, y: r.y, w: c.width, h: c.height, data };
}
