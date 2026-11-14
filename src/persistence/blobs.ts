/** Conversions between stored images (Blobs) and the data URLs used inside .json pattern files. */

export function dataUrlToBlob(url: string): Blob {
  const comma = url.indexOf(",");
  const meta = url.slice(5, comma), body = url.slice(comma + 1);
  const type = meta.split(";")[0] || "application/octet-stream";
  if (!meta.endsWith(";base64")) return new Blob([decodeURIComponent(body)], { type });
  const bin = atob(body), bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

export async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${blob.type || "application/octet-stream"};base64,${btoa(bin)}`;
}

/** Content id: the same picture is stored once however often it is used. */
export async function imageId(blob: Blob): Promise<string> {
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()));
  return "img:" + [...hash.slice(0, 16)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const isDataUrl = (s: unknown): s is string => typeof s === "string" && s.startsWith("data:");
