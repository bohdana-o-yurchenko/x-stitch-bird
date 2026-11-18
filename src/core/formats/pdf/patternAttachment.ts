import { serializePattern, type PatternFile } from "../json/serialize";
import type { Pattern } from "../../pattern/types";
import type { PdfWriter } from "./pdfWriter";

/*
 * The pattern itself inside the PDFs this app makes (SPEC §15.46): read back, the PDF gives the very same pattern —
 * its own threads and beads, symbols, every stitch. Viewers list it as an attachment; chart apps ignore it.
 */

/** The attachment's description, shown by viewers that list attachments. */
const DESCRIPTION = "ptashechka pattern: opens back in ptashechka (New ▸ From a PDF chart…)";

/** The pattern as it goes into a PDF: everything but the learned photo examples (photos stay out). */
export function patternForPdf(p: Pattern): PatternFile {
  const file = serializePattern(p);
  delete file.samples;
  return file;
}

/** Puts the pattern into the PDF being written, as `<name>.xbird`. */
export function attachPattern(pdf: PdfWriter, p: Pattern): Promise<void> {
  const name = `${(p.name || "pattern").replace(/[\\/:*?"<>|]+/g, "-")}.xbird`;
  return pdf.attach(name, new TextEncoder().encode(JSON.stringify(patternForPdf(p))), "application/json", DESCRIPTION);
}

/** The pattern among a PDF's attachments, if one of them is this app's; null otherwise. */
export function patternFromAttachments(files: readonly Uint8Array[]): PatternFile | null {
  for (const data of files) {
    try {
      const doc = JSON.parse(new TextDecoder().decode(data)) as PatternFile;
      if (doc?.app === "stitchwork" && Array.isArray(doc.pal)) return doc;
    } catch {
      // not ours
    }
  }
  return null;
}
