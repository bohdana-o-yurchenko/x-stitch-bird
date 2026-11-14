import { TRANSFORMS, type TransformId } from "@/core/transform/cellTransform";
import { cropToContent, extendCanvas, mirrorFromCentre, transformPattern, type Margins, type MirrorFromCentre, type TransformReport } from "@/core/transform/wholeChart";
import type { Editor } from "../createEditor";

function finish(ed: Editor, report?: TransformReport) {
  ed.store.setState({ selection: null });
  ed.changed({ keys: true, structural: true });
  if (report?.newTwins) ed.toast("toasts.newTwins", { count: report.newTwins });
}

/** Flip or rotate the whole chart: one undo step, history kept (SPEC §15.3). */
export function transformChart(ed: Editor, id: TransformId) {
  const report = ed.history.transaction(id, () => transformPattern(ed.doc, TRANSFORMS[id], ed.state.symbols));
  finish(ed, report);
  ed.viewport.fit();
}

export function mirrorChart(ed: Editor, dir: MirrorFromCentre) {
  finish(ed, ed.history.transaction("mirror", () => mirrorFromCentre(ed.doc, dir, ed.state.symbols)));
}

export function cropChart(ed: Editor, margin = 2) {
  const ok = ed.history.transaction("crop", () => cropToContent(ed.doc, margin));
  if (!ok) return ed.toast("toasts.nothingToCrop");
  finish(ed);
  ed.viewport.fit();
}

export function extendChart(ed: Editor, m: Margins) {
  ed.history.transaction("extend", () => extendCanvas(ed.doc, m));
  finish(ed);
  ed.viewport.fit();
}
