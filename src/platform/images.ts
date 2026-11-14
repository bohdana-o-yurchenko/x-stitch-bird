import type { Pixels } from "@/core/imageToPattern/quantize";

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

/** JPEG data URL with the longest side at most `max` px, on white (reference photos, SPEC §11.1). */
export function downscaleToDataUrl(img: HTMLImageElement, max = 1600): string {
  const k = Math.min(1, max / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round((img.naturalWidth || img.width) * k));
  c.height = Math.max(1, Math.round((img.naturalHeight || img.height) * k));
  const g = c.getContext("2d")!;
  g.fillStyle = "#fff";
  g.fillRect(0, 0, c.width, c.height);
  g.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.86);
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
