import { calculator } from "@/core/calculator/registry";
import { computeUsage, entryCount, partialCount } from "@/core/calculator/usage";
import { exportCsv } from "@/core/formats/csv/exportCsv";
import { NewerFileError, parsePattern } from "@/core/formats/json/parse";
import { serializePattern, XBIRD_VERSION, type FileVersion, type PatternFile } from "@/core/formats/json/serialize";
import { exportOxs } from "@/core/formats/oxs/exportOxs";
import { chartPdf } from "@/core/formats/pdf/chartPdf";
import { checkPatternKeeper, patternKeeperPdf, type PdfFonts } from "@/core/formats/pdf/patternKeeper";
import { SYMBOL_INKS, symbolColours } from "@/core/formats/pdf/symbolColours";
import { TEXT_FONTS } from "@/core/formats/pdf/textFonts";
import { importOxs } from "@/core/formats/oxs/importOxs";
import type { QuantizeResult } from "@/core/imageToPattern/quantize";
import { formatLabel, keyLabelData } from "@/core/labels/keyLabel";
import { addEntry } from "@/core/pattern/keyEntries";
import { createPattern } from "@/core/pattern/createPattern";
import { buildPalette, type Palette, type PaletteSlot } from "@/core/pattern/palette";
import { SYMBOL_FONT } from "@/core/symbols/symbolFont";
import type { Pattern } from "@/core/pattern/types";
import type { UnderlayData } from "@/core/underlay/underlay";
import { renderChartImage, type ImageView, type KeyLine } from "@/render/exportChart";
import { defaultCanvasTheme } from "@/render/theme";
import type { Ctx } from "@/render/primitives/cells";
import { strokeLineStyle } from "@/render/primitives/lineStyles";
import { downloadFile, isImageFile, isPatternFile, readText } from "@/platform/files";
import { canvasToBlob, downscaleToBlob, loadImage } from "@/platform/images";
import { photoFits } from "../images/photoRoom";
import { accountPatternApi } from "@/persistence";
import type { Editor } from "../createEditor";
import { loadPattern } from "./pattern";

/** "pattern": our own file — the pattern, key, reference windows and underlay, as text in a `.xbird` file. */
export type ExportFormat = "png-both" | "png-symbols" | "png-symbols-ink" | "png-color" | "png-stitched" | "csv" | "oxs" | "pattern";

/** Extension of our own pattern files. Older files ended in `.json`; they hold the same text and still open. */
export const PATTERN_EXT = "xbird";

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

/** The PDF symbol chart's inks (symbolColours.ts): the few entries it prints red, green or blue, by palette slot. */
function printInks(p: Pattern, palette: Palette): Map<PaletteSlot, string> {
  const inks = new Map<PaletteSlot, string>();
  for (const [k, c] of symbolColours(p)) if (c !== "black" && palette[k]) inks.set(palette[k], SYMBOL_INKS[c]);
  return inks;
}

export const shoppingList = (p: Pattern) => calculator().calculate({ pattern: p, usage: computeUsage(p), settings: {} });

export async function exportAs(ed: Editor, format: ExportFormat) {
  const p = ed.doc, base = safeName(p);
  if (format === "pattern") {
    return offer(ed, `${base}.${PATTERN_EXT}`, JSON.stringify(await patternFile(ed)), PATTERN_EXT);
  }
  if (format === "oxs") return offer(ed, `${base}.oxs`, exportOxs(p), "oxs");
  if (format === "csv") return offer(ed, `${base}-shopping-list.csv`, exportCsv(p, shoppingList(p), ed.t), "csv");
  const view: ImageView = format === "png-color" ? "color" : format === "png-stitched" ? "stitched" : format === "png-symbols" || format === "png-symbols-ink" ? "symbols" : "both";
  const byline = [p.meta.designer, p.meta.copyright && `© ${p.meta.copyright}`].filter(Boolean).join(" · ") || undefined;
  // the same line as at the end of the PDFs and the CSV, in the interface's language
  const footer = `${ed.t("csv.generatedBy", { url: ed.t("app.url") })} · ${ed.t("app.glory")}`;
  const canvas = renderChartImage(p, ed.state.palette, view, { ...ed.theme, accent: defaultCanvasTheme.accent }, { heading: ed.t("png.keyHeading", { name: p.name }), byline, key: keyLines(ed), footer, symbolInks: format === "png-symbols-ink" ? printInks(p, ed.state.palette) : undefined });
  const suffix = view === "stitched" ? "-stitched" : view === "color" ? "-preview" : format === "png-symbols-ink" ? "-chart-print" : "-chart";
  offer(ed, `${base}${suffix}.png`, await canvasToBlob(canvas), "png");
}

/** The fonts every PDF embeds: chart symbols and the text font (regular, bold). */
async function pdfFonts(): Promise<PdfFonts> {
  const load = async (url: string) => new Uint8Array(await (await fetch(url)).arrayBuffer());
  const [symbols, regular, bold, cyrRegular, cyrBold] = await Promise.all([SYMBOL_FONT.url, TEXT_FONTS.regular.url, TEXT_FONTS.bold.url, TEXT_FONTS.cyrRegular.url, TEXT_FONTS.cyrBold.url].map(load));
  return { symbols: symbols!, regular: regular!, bold: bold!, cyrRegular: cyrRegular!, cyrBold: cyrBold! };
}

async function offerPdf(ed: Editor, filename: string, make: (fonts: PdfFonts) => Promise<Uint8Array>) {
  try {
    const pdf = await make(await pdfFonts());
    offer(ed, filename, new Blob([pdf as BlobPart], { type: "application/pdf" }), "pdf");
  } catch (e) {
    console.error(e);
    ed.toast("toasts.pdfFailed");
  }
}

/**
 * PDF for Pattern Keeper (SPEC §15.10): only what it can track. When the pattern has more, a dialog explains first;
 * `confirmed` skips it.
 */
export async function exportPatternKeeper(ed: Editor, confirmed = false) {
  const p = ed.doc, report = checkPatternKeeper(p);
  if (!report.supported.size) return ed.toast("toasts.pkNothing");
  if (report.issues.length && !confirmed) return ed.openDialog({ type: "patternKeeper", issues: report.issues });
  await offerPdf(ed, `${safeName(p)}-pattern-keeper.pdf`, (fonts) => patternKeeperPdf(p, report, { fonts }));
}

/** The PDF chart to print and read (SPEC §15.10b): symbols, symbols on colour, colour with backstitch, the key. */
export async function exportChartPdf(ed: Editor) {
  const p = ed.doc;
  if (!p.key.some(Boolean)) return ed.toast("toasts.needKeyEmpty");
  // backstitch in the screen's own line styles
  await offerPdf(ed, `${safeName(p)}-chart.pdf`, (fonts) => chartPdf(p, { fonts, t: ed.t, lineStyle: (g, x1, y1, x2, y2, w, u, sym) => strokeLineStyle(g as unknown as Ctx, x1, y1, x2, y2, w, u, sym) }));
}

/** Everything a .xbird file holds: the pattern, its reference windows, underlay and versions. */
export async function patternFile(ed: Editor): Promise<PatternFile> {
  const underlay = ed.underlay.data ? await ed.images.underlayToFile(ed.underlay.data) : undefined;
  const versions = await ed.snapshots.exportFile();
  return { ...serializePattern(ed.doc), xbird: XBIRD_VERSION, refs: await ed.references.exportFile(), underlay, ...(versions.length ? { versions } : {}) };
}

/** Read a .xbird (or older .json) or .oxs file into a pattern — told apart by content; throws on anything else. */
export async function readPatternFile(ed: Editor, file: File): Promise<{ pattern: Pattern; refs: unknown[] | null; underlay: UnderlayData | null; versions: FileVersion[]; simplified: number }> {
  const text = await readText(file);
  if (text.startsWith("<")) {
    const { pattern, report } = importOxs(text, ed.state.symbols);
    return { pattern, refs: null, underlay: null, versions: [], simplified: report.simplified };
  }
  return { ...parsePattern(JSON.parse(text), ed.state.symbols), simplified: 0 };
}

export async function loadFile(ed: Editor, file: File) {
  try {
    const { pattern, refs, underlay, versions, simplified } = await readPatternFile(ed, file);
    loadPattern(ed, pattern, refs as never, underlay);
    // straight into the library, like a pattern opened from it: listed under Open saved right away
    ed.autosave.markSaved();
    void saveToLibrary(ed, { quiet: true });
    await ed.snapshots.importFile(pattern.id, versions);
    ed.toast(simplified ? "toasts.loadedReport" : "toasts.loaded", { name: file.name, count: simplified });
  } catch (e) {
    console.error(e);
    ed.toast(e instanceof NewerFileError ? "toasts.newerFile" : "toasts.badFile");
  }
}

/** The file each opened photo came from: kept as the reference window's photo, as it came. */
const sourceFiles = new WeakMap<HTMLImageElement, Blob>();

export async function openImageDialog(ed: Editor, file: File) {
  try {
    const image = await loadImage(file);
    sourceFiles.set(image, file);
    ed.openDialog({ type: "imageImport", image });
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
  if (keepReference)
    void (sourceFiles.has(image) ? Promise.resolve(sourceFiles.get(image)!) : downscaleToBlob(image, Infinity, 0.95))
      // no room in the account for it: the pattern is made, the photo window isn't (SPEC §15.35)
      .then(async (b) => ((await photoFits(ed, b)) ? b : Promise.reject(new Error("no room"))))
      .then((b) => ed.images.put(b))
      .then((id) => ed.references.add({ image: id, name: ed.t("references.photo"), grid: true }))
      .catch(() => {});
}

/** Into the saved patterns (and the account, signed in). `quiet`: the automatic save — no toast unless it fails. */
export async function saveToLibrary(ed: Editor, o: { quiet?: boolean } = {}) {
  const doc = serializePattern(ed.doc), revision = ed.state.docRevision;
  if (!o.quiet) ed.autosave.markSaved();
  ed.store.setState({ saveState: "saving" });
  // following another window: nothing of this one's goes to the account (SPEC §15.34)
  const r = await ed.persistence.patterns.save(doc, ed.live.readOnly ? { localOnly: true } : ed.live.saveOptions());
  if (r.ok && r.conflict && doc.id === ed.doc.id) ed.live.refused(r.conflict);
  if (r.ok && r.rev !== undefined && doc.id === ed.doc.id) ed.live.saved(r.rev, revision);
  // the account has its most patterns: this one stays in the browser; said once per pattern (SPEC §15.35)
  if (r.ok && r.limit && !limitSaid.has(doc.id)) {
    limitSaid.add(doc.id);
    ed.toast("toasts.patternLimit", { max: r.limit });
  }
  if (r.ok) {
    ed.store.setState({ savedAt: Date.now(), saveState: r.limit ? "full" : r.account === false ? "offline" : "saved" });
    // in the account: safe, never taken out of this browser by the one-pattern rule
    if (r.account) ed.keep.keep(doc.id);
    if (!o.quiet) ed.toast(ed.state.account ? "toasts.savedAccount" : "toasts.savedLocal", { name: doc.name });
    // signed in: the account also gets a small colour preview, for the list of patterns — not on every save
    if (r.account && Date.now() - (previewAt.get(doc.id) ?? 0) > PREVIEW_EVERY) {
      previewAt.set(doc.id, Date.now());
      void uploadPreview(ed).catch(() => previewAt.delete(doc.id));
    }
    if (!ed.state.hasOtherPatterns) void ed.refreshPatterns();
  } else {
    ed.store.setState({ saveState: null });
    ed.toast(r.reason === "quota" ? "toasts.tooLarge" : "toasts.saveFailed");
  }
}

/** Patterns already told they don't fit in the account. */
const limitSaid = new Set<string>();

/** The account's preview of a pattern is redrawn at most this often while it's being edited. */
const PREVIEW_EVERY = 60_000;
const previewAt = new Map<string, number>();

/** A small colour picture of the chart (~240 px on its long side) for the account's list of patterns. */
async function uploadPreview(ed: Editor) {
  const p = ed.doc, cell = Math.max(1, Math.floor(240 / Math.max(p.w, p.h)));
  const canvas = renderChartImage(p, ed.state.palette, "color", ed.theme, { heading: "", key: [] }, cell);
  await accountPatternApi.putPreview(p.id, await canvasToBlob(canvas));
}

export async function openFromLibrary(ed: Editor, id: string) {
  const doc = await ed.persistence.patterns.load(id);
  if (!doc) return ed.toast("toasts.openFailed");
  try {
    const { pattern } = parsePattern(doc, ed.state.symbols);
    loadPattern(ed, pattern);
    ed.autosave.markSaved();
    ed.toast("toasts.opened", { name: pattern.name });
  } catch {
    ed.toast("toasts.openFailed");
  }
}

export const previewPalette = (p: Pattern) => buildPalette(p);
