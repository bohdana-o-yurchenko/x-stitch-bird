import { cleanUnderlay, type UnderlayData } from "@/core/underlay/underlay";
import { blobToDataUrl, dataUrlToBlob, isDataUrl } from "@/persistence/blobs";
import type { ImageRepository, RefWindowData, RefWindowFile } from "@/persistence/ports";
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

  async refsToFile(refs: RefWindowData[]): Promise<RefWindowFile[]> {
    const out: RefWindowFile[] = [];
    for (const { image, marks, ...r } of refs) {
      const src = await this.toDataUrl(image);
      if (src) out.push({ ...r, src, marks: marks ? await this.toDataUrl(marks) : null });
    }
    return out;
  }

  async refsFromFile(raw: unknown[]): Promise<RefWindowData[]> {
    const out: RefWindowData[] = [];
    for (const r of raw as Partial<RefWindowFile & RefWindowData>[]) {
      const src = r?.image ?? r?.src;
      if (!r || typeof src !== "string" || !src) continue;
      const ref = { ...r } as RefWindowData & { src?: string };
      delete ref.src;
      out.push({ ...ref, image: await this.fromDataUrl(src), marks: typeof r.marks === "string" && r.marks ? await this.fromDataUrl(r.marks) : null });
    }
    return out;
  }

  /** The underlay as written into a .json file: `src` (and `straighten.src`) are data URLs. */
  async underlayToFile(u: UnderlayData): Promise<object | undefined> {
    const src = await this.toDataUrl(u.image);
    if (!src) return undefined;
    const file: Record<string, unknown> = { ...u, src };
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
    const image = await this.fromDataUrl(clean.image);
    const straighten = clean.straighten && { ...clean.straighten, source: await this.fromDataUrl(clean.straighten.source) };
    return { ...clean, image, ...(straighten && { straighten }) };
  }
}
