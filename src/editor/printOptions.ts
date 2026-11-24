import { normalizePrint, type PrintOptions } from "@/core/formats/pdf/printOptions";

/*
 * The Print dialog's settings (SPEC §15.10c), remembered per browser — not in the pattern, so .xbird files don't
 * change.
 */
const KEY = "stitchwork.printOptions";

export function loadPrintOptions(): PrintOptions {
  try {
    return normalizePrint(JSON.parse(localStorage.getItem(KEY) || "null"));
  } catch {
    return normalizePrint(null);
  }
}

export function savePrintOptions(o: PrintOptions) {
  try {
    localStorage.setItem(KEY, JSON.stringify(o));
  } catch {
    // private window or storage full: just not remembered
  }
}
