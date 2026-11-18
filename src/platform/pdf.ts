/*
 * PDFs as references (SPEC §15.41): counting pages and drawing one page as a picture, with pdf.js (Apache-2.0,
 * NOTICE.md). Loaded only when a PDF is opened; its worker keeps the drawing off the page.
 */

import type { PageContent, PdfContent } from "@/core/formats/pdfChart/content";
import { extractPage, type PdfJsLib, type PdfPageLike } from "@/core/formats/pdfChart/extract";

type PdfJs = typeof import("pdfjs-dist");
type PdfDocument = Awaited<ReturnType<PdfJs["getDocument"]>["promise"]>;

/** Longest side of a drawn page, in pixels: a chart page's finest lines stay sharp (about 400 dpi on A4). */
export const PDF_PAGE_SIDE = 4600;

let lib: Promise<PdfJs> | null = null;
function pdfjs(): Promise<PdfJs> {
  lib ??= import("pdfjs-dist").then((m) => {
    m.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
    return m;
  });
  return lib;
}

type LoadingTask = ReturnType<PdfJs["getDocument"]>;

/** The last PDF opened stays open: going page by page doesn't read it again each time. */
let open: { blob: Blob; task: Promise<LoadingTask> } | null = null;
async function documentOf(blob: Blob): Promise<PdfDocument> {
  if (open?.blob !== blob) {
    const task = pdfjs().then(async (m) => m.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }));
    // the one before is let go
    void open?.task.then((t) => t.destroy()).catch(() => {});
    open = { blob, task };
  }
  return (await open.task).promise;
}

export const isPdf = (f: Blob) => f.type === "application/pdf" || (f instanceof File && /\.pdf$/i.test(f.name));

/** How many pages it has; throws when it isn't a PDF that can be read. */
export async function pdfPageCount(blob: Blob): Promise<number> {
  return (await documentOf(blob)).numPages;
}

/** Page `page` (from 1) drawn on white as a PNG, its long side `side` pixels, and its size. */
export async function renderPdfPage(blob: Blob, page: number, side = PDF_PAGE_SIDE): Promise<{ blob: Blob; w: number; h: number }> {
  const doc = await documentOf(blob);
  const p = await doc.getPage(Math.min(Math.max(1, page), doc.numPages));
  const base = p.getViewport({ scale: 1 });
  const viewport = p.getViewport({ scale: side / Math.max(base.width, base.height) });
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const g = canvas.getContext("2d")!;
  g.fillStyle = "#fff";
  g.fillRect(0, 0, canvas.width, canvas.height);
  await p.render({ canvas, canvasContext: g, viewport }).promise;
  p.cleanup();
  const png = await new Promise<Blob>((done, fail) => canvas.toBlob((b) => (b ? done(b) : fail(new Error("png"))), "image/png"));
  return { blob: png, w: canvas.width, h: canvas.height };
}

/** The files carried inside the PDF (its attachments); throws when it isn't a PDF that can be read. */
export async function pdfAttachments(blob: Blob): Promise<Uint8Array[]> {
  const doc = await documentOf(blob), files = await doc.getAttachments();
  const out: Uint8Array[] = [];
  for (const [id, f] of files ?? []) {
    const content = f.content ?? (await doc.getAttachmentContent(id));
    if (content) out.push(content);
  }
  return out;
}

/**
 * What every page draws, for reading a chart from it (SPEC §15.47). A document of its own: pictures come as pixels
 * (not bitmaps), so the same picture gives the same key.
 */
export async function pdfContent(blob: Blob): Promise<PdfContent> {
  const m = await pdfjs();
  const task = m.getDocument({ data: new Uint8Array(await blob.arrayBuffer()), isOffscreenCanvasSupported: false });
  try {
    const doc = await task.promise;
    const pages: PageContent[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      pages.push(await extractPage(page as unknown as PdfPageLike, m as unknown as PdfJsLib, { readBitmap }));
      page.cleanup();
    }
    const info = (await doc.getMetadata().catch(() => null))?.info as { Title?: unknown } | undefined;
    return { title: typeof info?.Title === "string" ? info.Title : "", pages };
  } finally {
    void task.destroy();
  }
}

/** A picture's pixels, when pdf.js hands it over drawn (some browsers). */
function readBitmap(bitmap: unknown, w: number, h: number): Uint8ClampedArray | null {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const g = canvas.getContext("2d")!;
    g.drawImage(bitmap as CanvasImageSource, 0, 0);
    return g.getImageData(0, 0, w, h).data;
  } catch {
    return null;
  }
}
