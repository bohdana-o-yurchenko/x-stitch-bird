const MIME: Record<string, string> = { xbird: "text/plain;charset=utf-8", json: "application/json", oxs: "application/xml", csv: "text/csv;charset=utf-8", png: "image/png" };

/** Save `data` as a file through a normal browser download. CSV gets a BOM so Excel reads UTF-8 symbols. */
export function downloadFile(filename: string, data: string | Blob): void {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const blob = data instanceof Blob ? data : new Blob([ext === "csv" ? "﻿" + data : data], { type: MIME[ext] ?? "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Opens the file chooser; resolves with the picked file or null. */
export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.addEventListener("cancel", () => resolve(null));
    input.click();
  });
}

export const readText = async (f: File) => (await f.text()).replace(/^﻿/, "").trim();

export const isPatternFile = (f: File) => /\.(xbird|json|oxs|xml)$/i.test(f.name) || /json|xml/.test(f.type);
export const isImageFile = (f: File) => f.type.startsWith("image/");

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
