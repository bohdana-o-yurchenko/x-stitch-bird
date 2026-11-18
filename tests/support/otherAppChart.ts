import { readFileSync } from "node:fs";
import { PdfPage, PdfWriter, type Raster } from "../../src/core/formats/pdf/pdfWriter";
import type { PdfFonts } from "../../src/core/formats/pdf/patternKeeper";
import { extractPage } from "../../src/core/formats/pdfChart/extract";
import type { PdfContent } from "../../src/core/formats/pdfChart/content";

/*
 * A chart as another app would print it (SPEC §15.47), made here so tests needn't carry anyone's design: symbols
 * stamped as small pictures, the chart over two pages that share two columns, numbers every ten along the edges,
 * a red backstitch, and a key — each symbol followed by its thread, a bead among them, a backstitch thread listed
 * without a symbol. `messy`: what needs the steps (SPEC §15.48) — a size that doesn't match the grids (31 × 20), the
 * last two columns printed faded, the white thread a brand the app doesn't know.
 */

const font = (name: string) => new Uint8Array(readFileSync(new URL(`../../public/fonts/${name}.ttf`, import.meta.url)));
export const FONTS: PdfFonts = { symbols: font("ptashechka-symbols"), regular: font("ptashechka-text-regular"), bold: font("ptashechka-text-bold"), cyrRegular: font("ptashechka-text-cyr-regular"), cyrBold: font("ptashechka-text-cyr-bold") };

export const OTHER_W = 30, OTHER_H = 20;
/** The symbol in cell (x, y): 0 none, 1 black cross, 2 white cross, 3 a bead. */
export const otherCell = (x: number, y: number) => (y < 2 ? 0 : (x * 7 + y * 3) % 5 === 0 ? 3 : (x + y) % 3 === 0 ? 0 : (x + y) % 3 === 1 ? 1 : 2);

/** An 8 × 8 picture of a symbol: black dots in a pattern of its own. */
function symbolPicture(kind: number): Raster {
  const rgb = new Uint8Array(8 * 8 * 3).fill(255);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const on = kind === 1 ? x === y || x === 7 - y : kind === 2 ? x === 0 || y === 0 || x === 7 || y === 7 : (x - 3.5) ** 2 + (y - 3.5) ** 2 < 9;
    if (on) rgb.fill(0, (y * 8 + x) * 3, (y * 8 + x) * 3 + 3);
  }
  return { w: 8, h: 8, rgb };
}

/** The columns printed faded in the messy chart. */
export const FADED_FROM = 28;

export async function otherAppChart(o: { messy?: boolean } = {}): Promise<Uint8Array> {
  const pdf = new PdfWriter();
  await pdf.embedTextFonts(FONTS);
  const pictures = [0, await pdf.image(symbolPicture(1)), await pdf.image(symbolPicture(2)), await pdf.image(symbolPicture(3))];
  const P = 12, L = 60, T = 80;
  // two pages of columns 1–16 and 15–30
  for (const [from, to] of [[0, 16], [14, 30]] as const) {
    const page = new PdfPage(595, 842), cols = to - from;
    page.text("bold", 14, L, 40, "Snowy Owl");
    for (let x = from; x < to; x++) for (let y = 0; y < OTHER_H; y++) {
      const k = otherCell(x, y), faded = o.messy && x >= FADED_FROM;
      if (!k) continue;
      if (faded) {
        page.save();
        page.opacity(0.35);
      }
      page.image(pictures[k]!, L + (x - from) * P + 1.5, T + y * P + 1.5, P - 3, P - 3);
      if (faded) page.restore();
    }
    const thin: [number, number, number, number][] = [], bold: [number, number, number, number][] = [];
    for (let i = 0; i <= cols; i++) ((from + i) % 10 ? thin : bold).push([L + i * P, T, L + i * P, T + OTHER_H * P]);
    for (let j = 0; j <= OTHER_H; j++) (j % 10 ? thin : bold).push([L, T + j * P, L + cols * P, T + j * P]);
    page.lines(thin, 0.2, 0.6);
    page.lines(bold, 0.8);
    // numbers on the line after every tenth column and row
    for (let n = 10; n <= to; n += 10) if (n > from) page.text("regular", 7, L + (n - from) * P, T - 4, String(n), "centre");
    for (let n = 10; n <= OTHER_H; n += 10) page.text("regular", 7, L - 4, T + n * P + 2.5, String(n), "right");
    // a backstitch in DMC 321's red, from corner (2, 2) to (6, 2) to (6, 5) — on the first page
    if (from === 0) page.path(`${L + 2 * P} ${842 - (T + 2 * P)} m ${L + 6 * P} ${842 - (T + 2 * P)} l ${L + 6 * P} ${842 - (T + 5 * P)} l`, { stroke: "#C72B3B", width: 2.5, cap: "round" });
    await pdf.addPage(page);
  }
  const key = new PdfPage(595, 842);
  key.text("regular", 10, L, 50, `Design size: ${o.messy ? 31 : 30} x 20 stitches, Aida 16`);
  key.text("bold", 10, L, 80, "Symbol    Thread");
  ["DMC 310 Black", o.messy ? "Kreinik 032 Pearl" : "DMC 3865 Winter White", "Mill Hill 00557 Gold"].forEach((row, i) => {
    key.image(pictures[i + 1]!, L, 92 + i * 20, 12, 12);
    key.text("regular", 10, L + 40, 102 + i * 20, row);
  });
  key.text("bold", 10, L, 180, "Backstitch");
  key.text("regular", 10, L + 40, 200, "DMC 321 Red");
  await pdf.addPage(key);
  return pdf.build({ title: "Snowy Owl", producer: "another app" });
}

/** What every page draws, read as the app reads it (pdf.js, here its Node build). */
export async function contentOf(data: Uint8Array): Promise<PdfContent> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({ data: data.slice(), isOffscreenCanvasSupported: false }), doc = await task.promise;
  const pages = [];
  for (let n = 1; n <= doc.numPages; n++) pages.push(await extractPage((await doc.getPage(n)) as never, pdfjs as never));
  const info = (await doc.getMetadata()).info as { Title?: string };
  await task.destroy();
  return { title: info.Title ?? "", pages };
}
