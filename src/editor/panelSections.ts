/*
 * The side panel's sections (SPEC §15.32): which ones are shown below the key (picked in the bar along its bottom),
 * which one is unfolded (one at a time), and its height. Both are per-browser preferences, kept in localStorage; the editor holds the shown list so a
 * command (Pattern ▸ …, a guide, adding a picture behind the chart) can bring one into view.
 */

const SHOWN_KEY = "stitchwork.panelSections";
const OPEN_KEY = "stitchwork.openSection";
const HEIGHT_KEY = "stitchwork.sectionHeight";

/** The unfolded section's height, at first. */
export const SECTION_HEIGHT = 320;

export function savedSections(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(SHOWN_KEY) || "null") as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : ["totals"];
  } catch {
    return ["totals"];
  }
}

export function saveSections(list: string[]) {
  try {
    localStorage.setItem(SHOWN_KEY, JSON.stringify(list));
  } catch {
    // private mode: not remembered
  }
}

/** The one unfolded section (null: all folded). */
export function savedOpen(): string | null {
  try {
    const v = localStorage.getItem(OPEN_KEY);
    return v === null ? "totals" : v || null;
  } catch {
    return "totals";
  }
}

export function saveOpen(id: string | null) {
  try {
    localStorage.setItem(OPEN_KEY, id ?? "");
  } catch {
    // not remembered
  }
}

export function savedHeight(): number {
  try {
    return Number(localStorage.getItem(HEIGHT_KEY)) || SECTION_HEIGHT;
  } catch {
    return SECTION_HEIGHT;
  }
}

export function saveHeight(h: number) {
  try {
    localStorage.setItem(HEIGHT_KEY, String(Math.round(h)));
  } catch {
    // not remembered
  }
}
