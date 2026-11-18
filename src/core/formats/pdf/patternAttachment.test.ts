import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { translateEn } from "../../../../tests/support/fixtures";
import { createPattern } from "../../pattern/createPattern";
import { addEntry } from "../../pattern/keyEntries";
import type { Pattern } from "../../pattern/types";
import { ALL_SYMBOLS } from "../../symbols/symbols";
import { parsePattern } from "../json/parse";
import { chartPdf } from "./chartPdf";
import { patternForPdf, patternFromAttachments } from "./patternAttachment";
import { checkPatternKeeper, patternKeeperPdf } from "./patternKeeper";

const file = (name: string) => new Uint8Array(readFileSync(new URL(`../../../../public/fonts/${name}.ttf`, import.meta.url)));
const fonts = { symbols: file("ptashechka-symbols"), regular: file("ptashechka-text-regular"), bold: file("ptashechka-text-bold"), cyrRegular: file("ptashechka-text-cyr-regular"), cyrBold: file("ptashechka-text-cyr-bold") };

/** The PDF's attachments, as a PDF reader (pdf.js, as in the app) finds them. */
async function attachments(pdf: Uint8Array): Promise<{ name: string; content: Uint8Array }[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: pdf.slice() }).promise;
  const out: { name: string; content: Uint8Array }[] = [];
  for (const [id, f] of (await doc.getAttachments()) ?? []) out.push({ name: f.filename, content: f.content ?? (await doc.getAttachmentContent(id))! });
  return out;
}

/** Own threads and beads, a blend of DMC with one's own, backstitch and a bead — what a PDF's key alone can't say. */
function ownPattern(): Pattern {
  const p = createPattern(6, 5, "Своя пташка");
  p.customs["custom:kr"] = { id: "custom:kr", kind: "thread", brand: "Kreinik", code: "032", name: "Pearl", hex: "#EEE8D5" };
  p.customs["custom:bd"] = { id: "custom:bd", kind: "bead", brand: "Toho", code: "11-21", name: "Silver lined", hex: "#C0C0C0" };
  p.blends["blend:k"] = { parts: [{ id: "dmc:310", n: 1 }, { id: "custom:kr", n: 1 }] };
  const k = (e: Parameters<typeof addEntry>[1]) => addEntry(p, e, ALL_SYMBOLS);
  const dmc = k({ t: "thread", src: "dmc:310", n: 2, st: "full", sym: "sym:star" });
  const own = k({ t: "thread", src: "custom:kr", n: 1, st: "full" });
  const blend = k({ t: "thread", src: "blend:k", n: null, st: "full" });
  const bead = k({ t: "bead", src: "custom:bd" });
  const back = k({ t: "back", src: "custom:kr", n: 1 });
  p.layers.stitches.set([dmc, own, blend, dmc]);
  p.layers.beads[12] = bead;
  p.layers.segments.push({ x1: 0, y1: 4, x2: 5, y2: 4, k: back });
  p.samples = { [dmc]: ["data:image/png;base64,AAAA"] };
  return p;
}

describe("this app's PDFs carry the pattern itself (SPEC §15.46)", () => {
  it.each([
    ["PDF chart to print", (p: Pattern) => chartPdf(p, { fonts, t: translateEn })],
    ["PDF for Pattern Keeper", (p: Pattern) => patternKeeperPdf(p, checkPatternKeeper(p), { fonts })],
  ])("%s: read back, the same pattern — own threads and beads, blends, symbols, every stitch; photo examples left out", async (_, make) => {
    const p = ownPattern();
    const files = await attachments(await make(p));
    expect(files.map((f) => f.name)).toEqual(["Своя пташка.xbird"]);
    const doc = patternFromAttachments(files.map((f) => f.content));
    expect(doc).not.toBeNull();
    expect(doc!.samples).toBeUndefined();
    const q = parsePattern(doc!, ALL_SYMBOLS).pattern;
    expect({ name: q.name, w: q.w, h: q.h, key: q.key, customs: q.customs, blends: q.blends }).toEqual({ name: p.name, w: p.w, h: p.h, key: p.key, customs: p.customs, blends: p.blends });
    expect([...q.layers.stitches]).toEqual([...p.layers.stitches]);
    expect([...q.layers.beads]).toEqual([...p.layers.beads]);
    expect(q.layers.segments).toEqual(p.layers.segments);
  });

  it("finds only this app's pattern among the attachments", () => {
    const enc = (s: string) => new TextEncoder().encode(s);
    const ours = enc(JSON.stringify(patternForPdf(ownPattern())));
    expect(patternFromAttachments([])).toBeNull();
    expect(patternFromAttachments([enc("%PDF not json"), enc(JSON.stringify({ app: "other", pal: [] }))])).toBeNull();
    expect(patternFromAttachments([enc("{}"), ours])?.name).toBe("Своя пташка");
  });
});
