import { cleanUnderlay, type UnderlayData } from "@/core/underlay/underlay";
import { blobToDataUrl, dataUrlToBlob, isDataUrl } from "@/persistence/blobs";
import type { ImageRepository, PdfFile, RefWindowData, RefWindowFile } from "@/persistence/ports";
import { loadImage } from "@/platform/images";

const CACHE = 16;

/**
 * Pictures by id (ARCHITECTURE §17): stores Blobs, hands out decoded images (cached), and converts to and from
 * the data URLs that .json files carry.
 */
export class ImageService {
  private cache = new Map<string, Promise<HTMLImageElement>>();

  constructor(private repo: ImageRepository) {}

  put(blob: Blob): Promise<string> {
    return this.repo.put(blob);
  }

  blob(id: string): Promise<Blob | null> {
    return this.repo.get(id);
  }

  load(id: string): Promise<HTMLImageElement> {
    let p = this.cache.get(id);
    if (!p) {
      p = this.repo.get(id).then((b) => (b ? loadImage(b) : Promise.reject(new Error(`missing image ${id}`))));
      p.catch(() => this.cache.delete(id));
      this.cache.set(id, p);
      if (this.cache.size > CACHE) this.cache.delete(this.cache.keys().next().value!);
    }
    return p;
  }

  /** A data URL for a file; data URLs pass through (pictures that came from a file and were not stored). */
  async toDataUrl(ref: string): Promise<string | null> {
    if (isDataUrl(ref)) return ref;
    const b = await this.repo.get(ref);
    return b ? blobToDataUrl(b) : null;
  }

  /** An id for a data URL from a file; ids pass through. */
  async fromDataUrl(ref: string): Promise<string> {
    return isDataUrl(ref) ? this.repo.put(dataUrlToBlob(ref)) : ref;
  }

  /**
   * The windows as written into a file. A PDF window (SPEC §15.41) carries the PDF and its pages' marks — and the
   * page shown as a picture too, so older versions still show that page.
   */
  async refsToFile(refs: RefWindowData[]): Promise<RefWindowFile[]> {
    const out: RefWindowFile[] = [];
    for (const { image, marks, pdf, ...r } of refs) {
      const pdfFile = pdf ? await this.pdfToFile(pdf) : undefined;
      if (pdf && !pdfFile) continue;
      const src = (await this.toDataUrl(image)) ?? (pdfFile ? "" : null);
      if (src !== null) out.push({ ...r, src, marks: marks ? await this.toDataUrl(marks) : null, ...(pdfFile && { pdf: pdfFile }) });
    }
    return out;
  }

  async refsFromFile(raw: unknown[]): Promise<RefWindowData[]> {
    const out: RefWindowData[] = [];
    for (const r of raw as Partial<RefWindowFile & Omit<RefWindowData, "pdf">>[]) {
      const src = r?.image ?? r?.src;
      const pdf = r?.pdf ? await this.pdfFromFile(r.pdf) : undefined;
      // a PDF window may come without its page drawn: it's drawn when shown
      if (!r || typeof src !== "string" || (!src && !pdf)) continue;
      const ref = { ...r } as RefWindowData & { src?: string };
      delete ref.src;
      delete ref.pdf;
      out.push({ ...ref, image: src ? await this.fromDataUrl(src) : "", marks: typeof r.marks === "string" && r.marks ? await this.fromDataUrl(r.marks) : null, ...(pdf && { pdf }) });
    }
    return out;
  }

  private async pdfToFile(pdf: NonNullable<RefWindowData["pdf"]>): Promise<PdfFile | undefined> {
    const src = await this.toDataUrl(pdf.source);
    if (!src) return undefined;
    const marks: Record<string, string> = {};
    for (const [page, id] of Object.entries(pdf.marks ?? {})) {
      const m = await this.toDataUrl(id);
      if (m) marks[page] = m;
    }
    return { src, page: pdf.page, pages: pdf.pages, ...(Object.keys(marks).length ? { marks } : {}) };
  }

  private async pdfFromFile(raw: unknown): Promise<RefWindowData["pdf"] | undefined> {
    const f = raw as Partial<PdfFile & { source: string }>;
    const src = f?.src ?? f?.source, pages = Math.round(Number(f?.pages));
    if (typeof src !== "string" || !src || !(pages >= 1)) return undefined;
    const marks: Record<string, string> = {};
    for (const [page, m] of Object.entries(f.marks ?? {})) if (typeof m === "string" && m) marks[page] = await this.fromDataUrl(m);
    return { source: await this.fromDataUrl(src), page: Math.min(pages, Math.max(1, Math.round(Number(f.page)) || 1)), pages, ...(Object.keys(marks).length ? { marks } : {}) };
  }

  /**
   * The underlay as written into a .json file: `src` (and `straighten.src`) are data URLs. A page of a PDF (SPEC
   * §15.41) carries the PDF as `pdf.src` too — and the page shown, so older versions show it.
   */
  async underlayToFile(u: UnderlayData): Promise<object | undefined> {
    const pdfSrc = u.pdf ? await this.toDataUrl(u.pdf.source) : null;
    if (u.pdf && !pdfSrc) return undefined;
    const src = (await this.toDataUrl(u.image)) ?? (pdfSrc ? "" : null);
    if (src === null) return undefined;
    const file: Record<string, unknown> = { ...u, src };
    if (u.pdf) {
      const pdf: Record<string, unknown> = { ...u.pdf, src: pdfSrc };
      delete pdf.source;
      file.pdf = pdf;
    }
    delete file.image;
    delete file.straighten;
    const source = u.straighten && (await this.toDataUrl(u.straighten.source));
    if (u.straighten && source) {
      const s: Record<string, unknown> = { ...u.straighten, src: source };
      delete s.source;
      file.straighten = s;
    }
    return file;
  }

  async underlayFromFile(u: UnderlayData | null): Promise<UnderlayData | null> {
    const clean = cleanUnderlay(u);
    if (!clean) return null;
    const image = clean.image ? await this.fromDataUrl(clean.image) : "";
    const straighten = clean.straighten && { ...clean.straighten, source: await this.fromDataUrl(clean.straighten.source) };
    const pdf = clean.pdf && { ...clean.pdf, source: await this.fromDataUrl(clean.pdf.source) };
    return { ...clean, image, ...(straighten && { straighten }), ...(pdf && { pdf }) };
  }
}
