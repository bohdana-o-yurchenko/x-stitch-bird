import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { serializePattern, XBIRD_VERSION } from "@/core/formats/json/serialize";
import { DEFAULT_PRINT } from "@/core/formats/pdf/printOptions";
import { createPattern } from "@/core/pattern/createPattern";
import { addEntry } from "@/core/pattern/keyEntries";
import { ALL_SYMBOLS } from "@/core/symbols/symbols";
import { fakeCanvas, FakePath2D } from "../../../tests/support/fakeCanvas";
import { memoryPersistence } from "../../../tests/support/memoryPersistence";

/*
 * The parts of importing and exporting that end in the browser (pictures, PDFs, the account's preview): those few
 * browser calls are stood in for, everything else is the real thing.
 */

const browser = vi.hoisted(() => ({
  downloads: [] as [string, string | Blob][],
  attachments: [] as Uint8Array[],
  content: { title: "", pages: [] } as unknown,
  pdfFails: false,
  imageFails: false,
  previews: [] as string[],
}));
vi.mock("@/platform/files", async (orig) => ({ ...(await orig<typeof import("@/platform/files")>()), downloadFile: (name: string, data: string | Blob) => void browser.downloads.push([name, data]) }));
vi.mock("@/platform/images", async (orig) => ({
  ...(await orig<typeof import("@/platform/images")>()),
  canvasToBlob: async () => new Blob(["png"], { type: "image/png" }),
  loadImage: async () => { if (browser.imageFails) throw new Error("not a picture"); return { width: 10, height: 10 } as HTMLImageElement; },
}));
vi.mock("@/platform/pdf", async (orig) => ({
  ...(await orig<typeof import("@/platform/pdf")>()),
  pdfAttachments: async () => { if (browser.pdfFails) throw new Error("broken"); return browser.attachments; },
  pdfContent: async () => browser.content,
}));
vi.mock("@/persistence", async (orig) => {
  const real = await orig<typeof import("@/persistence")>();
  return { ...real, accountPatternApi: { ...real.accountPatternApi, putPreview: async (id: string) => void browser.previews.push(id) } };
});

const io = await import("./importExport");
const { loadPattern } = await import("./pattern");
const { Editor } = await import("../createEditor");
const { resetScratch } = await import("@/render/cellBitmap");

let ed: InstanceType<typeof Editor>;
const toasts = () => ed.state.toasts.map((t) => t.key);
const names = () => browser.downloads.map((d) => d[0]);

function bird(name = "Bird") {
  const p = createPattern(6, 4, name);
  const red = addEntry(p, { t: "thread", src: "dmc:321", n: 2, st: "full" }, ALL_SYMBOLS);
  addEntry(p, { t: "thread", src: "dmc:310", n: 2, st: "full" }, ALL_SYMBOLS);
  p.layers.stitches.fill(red, 0, 5);
  return p;
}

/** The app's fonts, as the PDFs fetch them. */
const fontFetch = vi.fn(async (url: string) => ({ arrayBuffer: async () => readFileSync(new URL(`../../../public${url}`, import.meta.url)).buffer }));

beforeEach(() => {
  Object.assign(browser, { downloads: [], attachments: [], content: { title: "", pages: [] }, pdfFails: false, imageFails: false, previews: [] });
  const c = fakeCanvas();
  vi.stubGlobal("Path2D", FakePath2D);
  vi.stubGlobal("document", { createElement: () => ({ width: 0, height: 0, getContext: () => c.g }) });
  vi.stubGlobal("OffscreenCanvas", class { getContext() { return null; } });
  vi.stubGlobal("fetch", fontFetch);
  resetScratch();
  vi.spyOn(console, "error").mockImplementation(() => {});
  ed = new Editor(memoryPersistence(), false);
  ed.store.setState({ symbols: [...ALL_SYMBOLS], ready: true });
  loadPattern(ed, bird());
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  resetScratch();
});

describe("pictures of the chart (PNG)", () => {
  it.each([
    ["png-both", "Bird-chart.png"],
    ["png-symbols", "Bird-chart.png"],
    ["png-symbols-ink", "Bird-chart-print.png"],
    ["png-color", "Bird-preview.png"],
    ["png-stitched", "Bird-stitched.png"],
  ] as const)("%s is saved as %s", async (format, name) => {
    await io.exportAs(ed, format);
    expect(names()).toEqual([name]);
    expect(toasts()).toContain("toasts.downloaded");
  });

  it("the key under the chart: only the entries on it, labelled, with their counts", () => {
    expect(io.keyLines(ed).map((l) => [l.title, l.count])).toEqual([["DMC 321", 5]]);
  });
});

describe("the PDF chart to print and the Pattern Keeper PDF", () => {
  it("with settings, the chart is made, saved and said done", async () => {
    expect(await io.exportChartPdf(ed, DEFAULT_PRINT)).toBe("done");
    expect(names()).toEqual(["Bird-chart.pdf"]);
    const pdf = browser.downloads[0]![1] as Blob;
    expect(new TextDecoder().decode(new Uint8Array(await pdf.arrayBuffer()).slice(0, 5))).toBe("%PDF-");
  });

  it("stopped part way: said cancelled, nothing saved", async () => {
    const stop = new AbortController();
    stop.abort();
    expect(await io.exportChartPdf(ed, DEFAULT_PRINT, { signal: stop.signal })).toBe("cancelled");
    expect(names()).toEqual([]);
  });

  it("the Print dialog's plan and its one-page previews", async () => {
    const plan = io.chartPdfPlan(ed, DEFAULT_PRINT);
    expect(plan.total).toBeGreaterThan(0);
    expect(plan.pages).toHaveLength(plan.total);
    const page = await io.chartPdfPage(ed, DEFAULT_PRINT, 1);
    expect(new TextDecoder().decode(page.slice(0, 5))).toBe("%PDF-");
  });

  it("Pattern Keeper: a pattern it can track all of is saved straight away", async () => {
    await io.exportPatternKeeper(ed);
    expect(names()).toEqual(["Bird-pattern-keeper.pdf"]);
  });
});

describe("signed in, an .xbird of a pattern already here (SPEC §15.43)", () => {
  const xbird = (p: ReturnType<typeof bird>, saved?: number) => new File([JSON.stringify({ ...serializePattern(p), xbird: XBIRD_VERSION, ...(saved ? { saved } : {}) })], "b.xbird");

  function signedInWith(mine: ReturnType<typeof bird>, updatedAt = 1_000) {
    ed.store.setState({ account: { id: "u", email: "a@b" } });
    vi.spyOn(ed.persistence.patterns, "list").mockResolvedValue([{ id: mine.id, name: mine.name, updatedAt } as never]);
    vi.spyOn(ed.persistence.patterns, "load").mockResolvedValue(serializePattern(mine));
  }

  it("just as it is here: that one opens, said so, no question", async () => {
    const mine = bird("Mine");
    signedInWith(mine);
    await io.loadFile(ed, xbird(mine));
    expect(ed.doc.id).toBe(mine.id);
    expect(toasts()).toContain("toasts.alreadyHave");
    expect(ed.state.dialog).toBeNull();
  });

  it("different: asked — not at all, as a new pattern, or in place of mine (mine kept in its versions)", async () => {
    const mine = bird("Mine"), theirs = structuredClone(mine);
    theirs.layers.stitches.fill(0);
    signedInWith(mine, 5_000);
    const answer = async (choice: unknown) => {
      const done = io.loadFile(ed, xbird(theirs, 9_000));
      await vi.waitFor(() => expect(ed.state.dialog).toMatchObject({ type: "samePattern", age: "newer" }));
      (ed.state.dialog as unknown as { answer: (c: unknown) => void }).answer(choice);
      ed.closeDialog();
      await done;
    };
    await answer(null);
    expect(ed.doc.id).not.toBe(mine.id);
    await answer({ kind: "new", name: "Theirs" });
    expect([ed.doc.name, ed.doc.id === mine.id]).toEqual(["Theirs", false]);
    const kept = vi.spyOn(ed.snapshots, "addVersion");
    await answer({ kind: "replace" });
    expect(ed.doc.id).toBe(mine.id);
    expect(kept).toHaveBeenCalledWith(expect.objectContaining({ id: mine.id }), "import");
  });
});

describe("New ▸ From a PDF chart (SPEC §15.46)", () => {
  const pdf = new File(["%PDF"], "chart.pdf", { type: "application/pdf" });

  it("a PDF this app made gives back its pattern, as a new one, kept at once", async () => {
    const p = bird("From PDF");
    browser.attachments = [new TextEncoder().encode("not ours"), new TextEncoder().encode(JSON.stringify(serializePattern(p)))];
    const save = vi.spyOn(ed.persistence.patterns, "save");
    await io.loadPdfPattern(ed, pdf);
    expect(ed.doc.name).toBe("From PDF");
    expect(ed.doc.id).not.toBe(p.id);
    await vi.waitFor(() => expect(save).toHaveBeenCalled());
  });

  it("another app's chart is read, and its steps open", async () => {
    vi.spyOn(ed.jobs, "run").mockResolvedValue({ symbols: [{}], grids: [] } as never);
    await io.loadPdfPattern(ed, pdf);
    expect(ed.state.dialog).toMatchObject({ type: "pdfChart" });
    expect(toasts()).toContain("toasts.readingPdf");
  });

  it("nothing readable in it, or a broken file: said so, with the way to trace it instead", async () => {
    vi.spyOn(ed.jobs, "run").mockResolvedValue({ symbols: [], grids: [] } as never);
    await io.loadPdfPattern(ed, pdf);
    expect(ed.state.dialog).toMatchObject({ type: "pdfUnreadable", name: "chart.pdf" });
    ed.closeDialog();
    browser.pdfFails = true;
    await io.loadPdfPattern(ed, pdf);
    expect(ed.state.dialog).toMatchObject({ type: "pdfUnreadable" });
  });

  it("a pattern from a newer app is refused with its own message", async () => {
    browser.attachments = [new TextEncoder().encode(JSON.stringify({ ...serializePattern(bird()), xbird: XBIRD_VERSION + 1 }))];
    await io.loadPdfPattern(ed, pdf);
    expect(toasts()).toContain("toasts.newerFile");
  });
});

describe("a picture becomes a pattern", () => {
  it("one full cross per colour, the cells as read", () => {
    io.createFromImage(ed, { w: 2, h: 2, cells: ["dmc:310", "dmc:310", "", "dmc:321"] } as never, {} as HTMLImageElement, false);
    expect(ed.doc.key.filter(Boolean).map((e) => e!.src)).toEqual(["dmc:310", "dmc:321"]);
    expect([...ed.doc.layers.stitches]).toEqual([1, 1, 0, 2]);
    expect(toasts()).toContain("toasts.imageCreated");
  });

  it("kept beside it: the picture opened becomes a photo window, as it came", async () => {
    const add = vi.spyOn(ed.references, "add").mockImplementation(() => {});
    await io.openImageDialog(ed, new File(["img"], "photo.png", { type: "image/png" }));
    const image = (ed.state.dialog as { image: HTMLImageElement }).image;
    io.createFromImage(ed, { w: 1, h: 1, cells: ["dmc:310"] } as never, image, true);
    await vi.waitFor(() => expect(add).toHaveBeenCalledWith(expect.objectContaining({ image: expect.stringMatching(/^img:/), grid: true })));
  });

  it("not a picture: said so", async () => {
    browser.imageFails = true;
    await io.openImageDialog(ed, new File(["x"], "x.png"));
    expect(toasts()).toContain("toasts.badImage");
  });
});

describe("the account's list of patterns", () => {
  it("gets a small picture of the pattern when it's saved there — not on every save", async () => {
    vi.spyOn(ed.persistence.patterns, "save").mockResolvedValue({ ok: true, account: true });
    await io.saveToLibrary(ed, { quiet: true });
    await io.saveToLibrary(ed, { quiet: true });
    await vi.waitFor(() => expect(browser.previews).toEqual([ed.doc.id]));
  });
});
