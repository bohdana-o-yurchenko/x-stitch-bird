import type { Editor } from "@/editor/createEditor";

/*
 * ☰ ▸ Toolbar (SPEC §15.25): groups of the toolbar each person can hide, remembered in this browser. Only the
 * buttons go; the tools and their shortcuts still work.
 */
export interface ToolbarHide {
  /** Line, rectangle outline, filled rectangle, fill area. */
  shapes: boolean;
  /** Partial stitches and their kinds. */
  partials: boolean;
}

export const SHOW_ALL: ToolbarHide = { shapes: false, partials: false };
const KEY = "stitchwork.toolbar";

export function savedToolbarHide(): ToolbarHide {
  try {
    return { ...SHOW_ALL, ...(JSON.parse(localStorage.getItem(KEY) || "{}") as Partial<ToolbarHide>) };
  } catch {
    return SHOW_ALL;
  }
}

export function setToolbarHide(ed: Editor, next: ToolbarHide) {
  ed.store.setState({ toolbarHide: next });
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // private mode: the choice just isn't remembered
  }
}
