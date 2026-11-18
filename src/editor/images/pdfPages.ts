import { pdfPageCount, renderPdfPage } from "@/platform/pdf";
import type { Editor } from "../createEditor";
import { photoFits } from "./photoRoom";

/** A drawn page: its stored picture (this browser only) and size. */
export interface DrawnPage {
  image: string;
  w: number;
  h: number;
}

/** Pages drawn this session, by PDF and page: going back and forth doesn't draw them again. */
const drawn = new Map<string, DrawnPage>();

/**
 * Page `page` of a stored PDF as a picture (SPEC §15.41) — drawn now, or the one drawn before if this browser still
 * has it. Null when the PDF isn't here or can't be read.
 */
export async function drawPdfPage(ed: Editor, source: string, page: number): Promise<DrawnPage | null> {
  const key = `${source}#${page}`, known = drawn.get(key);
  if (known && (await ed.images.blob(known.image))) return known;
  const pdf = await ed.images.blob(source);
  if (!pdf) return null;
  try {
    const r = await renderPdfPage(pdf, page);
    const out = { image: await ed.images.put(r.blob), w: r.w, h: r.h };
    drawn.set(key, out);
    return out;
  } catch {
    return null;
  }
}

/**
 * A PDF being added (SPEC §15.41): asked about room in the account first, stored as it came; with several pages the
 * user picks the one to start with (§15.44), which is drawn. `to`: behind the chart, or a photo window. Null (said why,
 * or no page picked) when it doesn't fit, can't be read or is put aside.
 */
export async function addPdf(ed: Editor, f: File, to: "underlay" | "window"): Promise<{ source: string; pages: number; page: number; drawn: DrawnPage } | null> {
  if (!(await photoFits(ed, f))) return null;
  let pages: number;
  try {
    pages = await pdfPageCount(f);
  } catch {
    ed.toast("toasts.badPdf");
    return null;
  }
  const source = await ed.images.put(f);
  const page = pages > 1 ? await new Promise<number | null>((answer) => ed.openDialog({ type: "pdfPage", source, pages, name: f.name, to, answer })) : 1;
  if (!page) return null;
  const drawn = await drawPdfPage(ed, source, page);
  if (!drawn) {
    ed.toast("toasts.badPdf");
    return null;
  }
  return { source, pages, page, drawn };
}
