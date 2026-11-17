/*
 * The side panel's sections (SPEC §15.32): which ones are shown below the key (picked in the bar along its bottom),
 * and which are folded. Both are per-browser preferences, kept in localStorage; the editor holds the shown list so a
 * command (Pattern ▸ …, a guide, adding a picture behind the chart) can bring one into view.
 */

const SHOWN_KEY = "stitchwork.panelSections";
const FOLDS_KEY = "stitchwork.sections";

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

/** A section comes into the panel open. */
export function unfold(id: string) {
  try {
    const folds = JSON.parse(localStorage.getItem(FOLDS_KEY) || "{}") as Record<string, boolean>;
    localStorage.setItem(FOLDS_KEY, JSON.stringify({ ...folds, [id]: true }));
  } catch {
    // it opens by its default
  }
}
