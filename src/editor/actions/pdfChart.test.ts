import { describe, expect, it, vi } from "vitest";
import { contentOf, FADED_FROM, otherAppChart, otherCell } from "../../../tests/support/otherAppChart";
import { testEditor } from "../../../tests/support/editorHarness";
import { readChart } from "@/core/formats/pdfChart/read";
import { drawPdfPage } from "../images/pdfPages";
import { allSettled, openReadChart, settledRead } from "./pdfChart";

// pages drawn as pictures named after them, 1000 px on the long side (the app draws them bigger: scaled to match)
vi.mock("../images/pdfPages", () => ({ drawPdfPage: vi.fn(async (_ed: unknown, source: string, page: number) => ({ image: `img:${source}#${page}`, w: 707, h: 1000 })) }));
vi.mock("../images/photoRoom", () => ({ photoFits: async () => true }));

const read = async (messy: boolean) => {
  const content = await contentOf(await otherAppChart({ messy }));
  return { content, read: readChart(content), file: new File([new Uint8Array([37, 80, 68, 70])], "owl.pdf", { type: "application/pdf" }) };
};

describe("another app's chart, settled, opens (SPEC §15.48)", () => {
  it("settled only once every symbol and line has a thread or is left out; the user's choice over the key's", async () => {
    const { read: r } = await read(true);
    const white = r.symbols.find((s) => !s.thread)!;
    expect(allSettled({ read: r, symbols: {}, lines: {} })).toBe(false);
    expect(allSettled({ read: r, symbols: { [white.id]: "skip" }, lines: {} })).toBe(true);
    const chosen = settledRead({ read: r, symbols: { [white.id]: { kind: "thread", ids: ["dmc:3865"] } }, lines: { 0: "dmc:817" } });
    expect(chosen.symbols.find((s) => s.id === white.id)!.thread).toEqual({ kind: "thread", ids: ["dmc:3865"] });
    expect(chosen.lineStyles[0]!.thread).toBe("dmc:817");
    expect(settledRead({ read: r, symbols: {}, lines: { 0: "skip" } }).lineStyles[0]!.thread).toBeNull();
  });

  it("a new pattern from the choices — faded cells left empty — with the PDF behind it, each chart page over its cells", async () => {
    const { ed } = testEditor();
    const before = ed.doc.id, { content, read: r, file } = await read(true);
    const white = r.symbols.find((s) => !s.thread)!;
    await openReadChart(ed, { file, content, read: r, symbols: { [white.id]: { kind: "thread", ids: ["dmc:3865"] } }, lines: {}, fadedEmpty: true, keepReference: true });
    const p = ed.doc;
    expect([p.id === before, p.name, p.w, p.h]).toEqual([false, "Snowy Owl", 30, 20]);
    const src = (x: number, y: number) => {
      const i = y * p.w + x, k = p.layers.beads[i] || p.layers.stitches[i];
      return k ? p.key[k]!.src : null;
    };
    for (let y = 0; y < 20; y++) for (let x = 0; x < 30; x++) expect(src(x, y), `${x},${y}`).toBe(x >= FADED_FROM ? null : [null, "dmc:310", "dmc:3865", "bead:00557"][otherCell(x, y)]);
    expect(ed.state.toasts.some((t) => t.key === "toasts.loaded")).toBe(true);

    const u = ed.state.underlay!;
    // page 1 shown, over columns 1–16; its grid cut out of the page drawn 707 × 1000 (the place reckoned at 4600)
    const k = 1000 / 842;
    expect(u).toMatchObject({ image: "img:" + u.pdf!.source + "#1", behind: true, rect: { x: 0, y: 0, w: 16, h: 20 }, pdf: { page: 1, pages: 3 } });
    expect(u.crop.x).toBeCloseTo(60 * k, 0);
    expect(u.crop.w).toBeCloseTo(16 * 12 * k, 0);
    expect(u.pdf!.places!["2"]!.rect).toEqual({ x: 14, y: 0, w: 16, h: 20 });
    // its picture can't be loaded here (no browser): drawn again once, not over and over
    expect(vi.mocked(drawPdfPage)).toHaveBeenCalledTimes(2);
  });

  it("without the reference: no picture behind the chart", async () => {
    const { ed } = testEditor();
    const { content, read: r, file } = await read(false);
    await openReadChart(ed, { file, content, read: r, symbols: {}, lines: {}, fadedEmpty: false, keepReference: false });
    expect(ed.doc.name).toBe("Snowy Owl");
    expect(ed.state.underlay).toBeNull();
  });
});
