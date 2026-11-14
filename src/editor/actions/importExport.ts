import { calculator } from "@/core/calculator/registry";
import { computeUsage, entryCount, partialCount } from "@/core/calculator/usage";
import { exportCsv } from "@/core/formats/csv/exportCsv";
import { parsePattern } from "@/core/formats/json/parse";
import { serializePattern } from "@/core/formats/json/serialize";
import { exportOxs } from "@/core/formats/oxs/exportOxs";
import { importOxs } from "@/core/formats/oxs/importOxs";
import type { QuantizeResult } from "@/core/imageToPattern/quantize";
import { formatLabel, keyLabelData } from "@/core/labels/keyLabel";
import { addEntry } from "@/core/pattern/keyEntries";
import { createPattern } from "@/core/pattern/createPattern";
import { buildPalette } from "@/core/pattern/palette";
import type { Pattern } from "@/core/pattern/types";
import type { UnderlayData } from "@/core/underlay/underlay";
import { renderChartImage, type KeyLine } from "@/render/exportChart";
import type { ChartView } from "@/render/chart";
import { downloadFile, isImageFile, isPatternFile, readText } from "@/platform/files";
import { canvasToBlob, downscaleToDataUrl, loadImage } from "@/platform/images";
import type { Editor } from "../createEditor";
import { loadPattern } from "./pattern";

export type ExportFormat = "png-both" | "png-symbols" | "png-color" | "csv" | "oxs" | "json";

const safeName = (p: Pattern) => (p.name || "pattern").replace(/[^\p{L}\p{N}\- ]+/gu, "").trim().replace(/\s+/g, "-") || "pattern";

function offer(ed: Editor, filename: string, data: string | Blob, ext: string) {
  try {
    downloadFile(filename, data);
    ed.toast("toasts.downloaded", { name: filename });
  } catch {
    if (typeof data === "string") ed.openDialog({ type: "textFallback", ext, text: data });
  }
}

export function keyLines(ed: Editor): KeyLine[] {
  const p = ed.doc, usage = computeUsage(p).perEntry, palette = ed.state.palette;
  return p.key.flatMap((e, i) => {
    const count = entryCount(usage.get(i)) + partialCount(usage.get(i));
    const slot = palette[i];
    if (!e || !i || !count || !slot) return [];
    return [{ slot, ...formatLabel(keyLabelData(p, e), ed.t), count }];
  });
}

export const shoppingList = (p: Pattern) => calculator().calculate({ pattern: p, usage: computeUsage(p), settings: {} });

export async function exportAs(ed: Editor, format: ExportFormat) {
  const p = ed.doc, base = safeName(p);
  if (format === "json") return offer(ed, `${base}.json`, JSON.stringify({ ...serializePattern(p), refs: ed.references.exportAll(), underlay: ed.underlay.data ?? undefined }), "json");
  if (format === "oxs") return offer(ed, `${base}.oxs`, exportOxs(p), "oxs");
  if (format === "csv") return offer(ed, `${base}-shopping-list.csv`, exportCsv(p, shoppingList(p), ed.t), "csv");
  const view: ChartView = format === "png-color" ? "color" : format === "png-symbols" ? "symbols" : "both";
  const byline = [p.meta.designer, p.meta.copyright && `© ${p.meta.copyright}`].filter(Boolean).join(" · ") || undefined;
  const canvas = renderChartImage(p, ed.state.palette, view, ed.theme, { heading: ed.t("png.keyHeading", { name: p.name }), byline, key: keyLines(ed) });
  offer(ed, `${base}${view === "color" ? "-preview" : "-chart"}.png`, await canvasToBlob(canvas), "png");
}

/** Read a .json or .oxs file into a pattern; throws on anything else. */
export async function readPatternFile(ed: Editor, file: File): Promise<{ pattern: Pattern; refs: unknown[] | null; underlay: UnderlayData | null; simplified: number }> {
  const text = await readText(file);
  if (text.startsWith("<")) {
    const { pattern, report } = importOxs(text, ed.state.symbols);
    return { pattern, refs: null, underlay: null, simplified: report.simplified };
  }
  const { pattern, refs, underlay } = parsePattern(JSON.parse(text), ed.state.symbols);
  return { pattern, refs, underlay, simplified: 0 };
}

export async function loadFile(ed: Editor, file: File) {
  try {
    const { pattern, refs, underlay, simplified } = await readPatternFile(ed, file);
    loadPattern(ed, pattern, refs as never, underlay);
    ed.toast(simplified ? "toasts.loadedReport" : "toasts.loaded", { name: file.name, count: simplified });
  } catch (e) {
    console.error(e);
    ed.toast("toasts.badFile");
  }
}

export async function openImageDialog(ed: Editor, file: File) {
  try {
    ed.openDialog({ type: "imageImport", image: await loadImage(file) });
  } catch {
    ed.toast("toasts.badImage");
  }
}

export function handleDrop(ed: Editor, files: File[]) {
  const pattern = files.find(isPatternFile), image = files.find(isImageFile);
  if (pattern) return void ed.commands.run("file.load", pattern);
  if (image) return ed.openDialog({ type: "dropChoice", file: image });
  ed.toast("toasts.dropHint");
}

/** Image → pattern result becomes a new pattern: one full-cross entry per colour (SPEC §12.3). */
export function createFromImage(ed: Editor, r: QuantizeResult, image: HTMLImageElement, keepReference: boolean) {
  const old = ed.doc, strands = old.strands || 2;
  const p = createPattern(r.w, r.h, "Image pattern");
  p.count = 14;
  p.strands = strands;
  p.blends = { ...old.blends };
  const keys = new Map<string, number>();
  r.cells.forEach((id, i) => {
    if (!id) return;
    let k = keys.get(id);
    if (!k) keys.set(id, (k = addEntry(p, { t: "thread", src: id, n: id.startsWith("blend:") ? null : strands, st: "full" }, ed.state.symbols)));
    p.layers.stitches[i] = k;
  });
  loadPattern(ed, p, []);
  ed.toast("toasts.imageCreated", { count: keys.size });
  if (keepReference) ed.references.add({ src: downscaleToDataUrl(image), name: ed.t("references.photo"), grid: true });
}

export async function saveToLibrary(ed: Editor) {
  const doc = serializePattern(ed.doc);
  const r = await ed.persistence.patterns.save(doc);
  if (r.ok) {
    ed.store.setState({ savedAt: Date.now() });
    ed.toast("toasts.savedLocal", { name: doc.name });
  } else ed.toast(r.reason === "quota" ? "toasts.tooLarge" : "toasts.saveFailed");
}

export async function openFromLibrary(ed: Editor, id: string) {
  const doc = await ed.persistence.patterns.load(id);
  if (!doc) return ed.toast("toasts.openFailed");
  try {
    const { pattern } = parsePattern(doc, ed.state.symbols);
    loadPattern(ed, pattern);
    ed.toast("toasts.opened", { name: pattern.name });
  } catch {
    ed.toast("toasts.openFailed");
  }
}

export const previewPalette = (p: Pattern) => buildPalette(p);
