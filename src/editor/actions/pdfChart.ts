import type { PdfContent } from "@/core/formats/pdfChart/content";
import type { KeyThread } from "@/core/formats/pdfChart/key";
import { chartToPattern, linedUpPages, type ChartRead } from "@/core/formats/pdfChart/read";
import type { PagePlace, UnderlayData } from "@/core/underlay/underlay";
import { PDF_PAGE_SIDE } from "@/platform/pdf";
import type { Editor } from "../createEditor";
import { drawPdfPage } from "../images/pdfPages";
import { photoFits } from "../images/photoRoom";
import { saveToLibrary } from "./importExport";
import { loadPattern } from "./pattern";

/** What the user settled for a symbol or a line style: a thread (or bead), or "skip" — its cells left empty. */
export type ChartChoice<T> = T | "skip";

export interface ReadChartOpen {
  file: File;
  content: PdfContent;
  read: ChartRead;
  /** By symbol id: the user's choice over what the key said. */
  symbols: Record<string, ChartChoice<KeyThread>>;
  /** By line style index. */
  lines: Record<number, ChartChoice<string>>;
  fadedEmpty: boolean;
}

/** The read chart with the user's choices in it; "skip" leaves a symbol or line out. */
export function settledRead(o: Pick<ReadChartOpen, "read" | "symbols" | "lines">): ChartRead {
  const { read } = o;
  return {
    ...read,
    symbols: read.symbols.map((s) => {
      const c = o.symbols[s.id];
      return { ...s, thread: c === "skip" ? null : (c ?? s.thread) };
    }),
    lineStyles: read.lineStyles.map((s, i) => {
      const c = o.lines[i];
      return { ...s, thread: c === "skip" ? null : (c ?? s.thread) };
    }),
  };
}

/** Every symbol and line style has a thread, or is left out on purpose. */
export const allSettled = (o: Pick<ReadChartOpen, "read" | "symbols" | "lines">) =>
  o.read.symbols.every((s) => s.thread || o.symbols[s.id]) && o.read.lineStyles.every((s, i) => s.thread || o.lines[i]);

/**
 * The chart read from another app's PDF, settled, opens as a new pattern (SPEC §15.48) — always with its PDF, to check
 * it against: behind the chart, each chart page lined up over the cells it shows, and in a floating window on the key.
 */
export async function openReadChart(ed: Editor, o: ReadChartOpen) {
  const pattern = chartToPattern(settledRead(o), ed.state.symbols, { fadedEmpty: o.fadedEmpty, strands: ed.doc.strands || 2 });
  // no windows of its own to wait for: the one added below isn't overwritten
  loadPattern(ed, pattern, []);
  ed.autosave.markSaved();
  void saveToLibrary(ed, { quiet: true });
  ed.toast("toasts.loaded", { name: o.file.name });
  // stored once, for both (no room in the account: said, and neither)
  if (!(await photoFits(ed, o.file))) return;
  const source = await ed.images.put(o.file);
  await inWindow(ed, source, o);
  await lineUp(ed, pattern.id, source, o);
}

/** The PDF in a floating window, on its key's page. */
async function inWindow(ed: Editor, source: string, o: ReadChartOpen) {
  const page = (o.read.symbols.find((s) => s.keyText && s.sample)?.sample?.page ?? 0) + 1;
  const drawn = await drawPdfPage(ed, source, page);
  if (drawn) ed.references.add({ image: drawn.image, name: o.file.name.replace(/\.[^.]+$/, ""), pdf: { source, page, pages: o.content.pages.length } });
}

async function lineUp(ed: Editor, patternId: string, source: string, o: ReadChartOpen) {
  const places = linedUpPages(o.read, o.content.pages, PDF_PAGE_SIDE);
  if (!places.size) return;
  // first the page with the biggest cells (not an overview), the earliest of those
  const pitch = (page: number) => places.get(page)!.crop.w / places.get(page)!.rect.w;
  const first = [...places.keys()].sort((a, b) => pitch(b) - pitch(a) || a - b)[0]!;
  const drawn = await drawPdfPage(ed, source, first + 1);
  if (!drawn) return ed.toast("toasts.badPdf");
  const shown = places.get(first)!, k = drawn.w / shown.imageW;
  const others: Record<string, PagePlace> = {};
  for (const [page, p] of places) if (page !== first) others[page + 1] = p;
  const u: UnderlayData = {
    image: drawn.image, imageW: drawn.w, imageH: drawn.h,
    crop: { x: shown.crop.x * k, y: shown.crop.y * k, w: shown.crop.w * k, h: shown.crop.h * k }, rect: shown.rect,
    opacity: 0.5, behind: true, visible: true, tool: "move",
    pdf: { source, page: first + 1, pages: o.content.pages.length, ...(Object.keys(others).length ? { places: others } : {}) },
  };
  await ed.underlay.put(patternId, u);
}
