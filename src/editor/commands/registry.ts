import { PARTIAL_KINDS } from "@/core/stitches/partialKinds";
import type { TransformId } from "@/core/transform/cellTransform";
import { MIRROR_MODES } from "@/core/transform/mirror";
import type { Margins, MirrorFromCentre } from "@/core/transform/wholeChart";
import type { GridNumbering, KeyIndex, PatternMeta } from "@/core/pattern/types";
import type { ChartView } from "@/render/chart";
import { pickFile } from "@/platform/files";
import { clearAmbiguous, nextAmbiguous, toggleAmbiguous } from "../actions/ambiguous";
import { exportAs, exportChartPdf, exportPatternKeeper, handleDrop, loadFile, openFromLibrary, openImageDialog, saveToLibrary, type ExportFormat } from "../actions/importExport";
import { deleteEntry, usageCount } from "../actions/keyEntries";
import { newPattern, resize, setPatternSettings } from "../actions/pattern";
import { cropChart, extendChart, mirrorChart, transformChart } from "../actions/transforms";
import type { Editor } from "../createEditor";
import type { ToolId } from "../store/editorStore";
import type { Command } from "./types";

const hasSelection = (ed: Editor) => !!ed.state.selection || !!ed.state.floating;

export const COMMANDS: readonly Command[] = [
  // tools & drawing
  { id: "tool.select", run: (ed, id) => ed.setTool(id as ToolId) },
  { id: "tool.cancel", run: (ed) => ed.tools.cancel() },
  { id: "draw.toggleOverride", run: (ed) => { const on = !ed.state.override; ed.store.setState({ override: on }); ed.toast(on ? "toasts.overrideOn" : "toasts.overrideOff"); } },
  {
    id: "draw.cycleMirror",
    run(ed) {
      const next = MIRROR_MODES[(MIRROR_MODES.indexOf(ed.state.mirror) + 1) % MIRROR_MODES.length]!;
      ed.store.setState({ mirror: next });
      ed.toast(`tools.mirror${next[0]!.toUpperCase()}${next.slice(1)}`);
    },
  },
  {
    id: "draw.cyclePartialKind",
    run(ed) {
      const ids = PARTIAL_KINDS.map((k) => k.id), next = ids[(ids.indexOf(ed.state.partialKind) + 1) % ids.length]!;
      ed.store.setState({ partialKind: next });
      if (ed.state.tool !== "partial") ed.setTool("partial");
      ed.toast("toasts.partialKind", { kind: ed.t(`tools.partialKind.${next}`) });
    },
  },
  { id: "draw.setBrush", run: (ed, n) => ed.store.setState({ brush: Number(n) }) },
  { id: "draw.setPartialKind", run: (ed, k) => ed.store.setState({ partialKind: k as never }) },
  // history
  { id: "history.undo", run: (ed) => { ed.cancelInteractions(); ed.history.undo(); }, enabled: (ed) => ed.state.canUndo || !!ed.state.floating },
  { id: "history.redo", run: (ed) => ed.history.redo(), enabled: (ed) => ed.state.canRedo },
  // view
  { id: "view.set", run: (ed, v) => ed.store.setState({ view: v as ChartView }) },
  { id: "view.zoomIn", run: (ed) => ed.viewport.zoomAt(1.25) },
  { id: "view.zoomOut", run: (ed) => ed.viewport.zoomAt(0.8) },
  { id: "view.fit", run: (ed) => ed.viewport.fit() },
  { id: "view.goToCell", run: (ed) => ed.openDialog({ type: "goToCell" }) },
  { id: "view.toggleHighlight", run: (ed) => ed.store.setState({ highlight: !ed.state.highlight }) },
  { id: "help.guide", run: (ed) => ed.store.setState({ guide: "intro" }) },
  { id: "help.changelog", run: (ed) => ed.openDialog({ type: "changelog" }) },
  { id: "panel.toggle", run: (ed) => ed.store.setState({ panelCollapsed: !ed.state.panelCollapsed }) },
  // key
  { id: "key.selectNth", run: (ed, n) => { const list = ed.doc.key.flatMap((e, i) => (e && i ? [i] : [])); const k = list[Number(n) - 1]; if (k) ed.setActiveEntry(k); } },
  { id: "key.select", run: (ed, i) => ed.setActiveEntry(i as KeyIndex) },
  { id: "key.add", run: (ed) => ed.openKeyForm() },
  { id: "key.edit", run: (ed, i) => ed.openKeyForm(i as KeyIndex) },
  { id: "key.requestDelete", run: (ed, i) => ed.doc.key[i as KeyIndex] && ed.openDialog({ type: "deleteEntry", index: i as KeyIndex, count: usageCount(ed, i as KeyIndex) }) },
  { id: "key.delete", run: (ed, i) => deleteEntry(ed, i as KeyIndex), destructive: "deleteKey" },
  // pattern & files
  { id: "file.new", run: (ed) => ed.openDialog({ type: "newPattern" }) },
  { id: "file.create", run: (ed, o) => newPattern(ed, o as Parameters<typeof newPattern>[1]), destructive: "new" },
  { id: "file.open", run: (ed) => ed.openDialog({ type: "open" }) },
  { id: "file.openSaved", run: (ed, id) => openFromLibrary(ed, id as string), destructive: "open" },
  { id: "file.save", run: (ed) => saveToLibrary(ed) },
  { id: "file.versions", run: (ed) => ed.openDialog({ type: "versions" }) },
  { id: "file.export", run: (ed, f) => exportAs(ed, f as ExportFormat) },
  { id: "file.exportPatternKeeper", run: (ed, confirmed) => exportPatternKeeper(ed, confirmed === true) },
  { id: "file.exportChartPdf", run: (ed) => exportChartPdf(ed) },
  { id: "file.pickToLoad", run: async (ed) => { const f = await pickFile(".xbird,.oxs,.json,.xml"); if (f) await ed.commands.run("file.load", f); } },
  { id: "file.load", run: (ed, f) => loadFile(ed, f as File), destructive: "import" },
  { id: "file.drop", run: (ed, files) => handleDrop(ed, files as File[]) },
  { id: "image.pick", run: async (ed) => { const f = await pickFile("image/*"); if (f) await openImageDialog(ed, f); } },
  { id: "image.open", run: (ed, f) => openImageDialog(ed, f as File) },
  { id: "image.create", run: (ed, a) => { const { result, image, keepReference } = a as never; ed.createFromImage(result, image, keepReference); }, destructive: "image" },
  { id: "reference.pick", run: async (ed) => { const f = await pickFile("image/*"); if (f) await ed.addReferenceFromFile(f); } },
  { id: "reference.open", run: (ed, f) => ed.addReferenceFromFile(f as File) },
  { id: "pattern.editInfo", run: (ed) => ed.openDialog({ type: "patternInfo" }) },
  { id: "pattern.setInfo", run: (ed, meta) => setPatternSettings(ed, { meta: meta as PatternMeta }) },
  { id: "pattern.setGrid", run: (ed, g) => setPatternSettings(ed, { grid: g as GridNumbering }) },
  { id: "pattern.rename", run: (ed, name) => setPatternSettings(ed, { name: name as string }) },
  { id: "pattern.setFabric", run: (ed, o) => setPatternSettings(ed, o as { count?: number; fabric?: string }) },
  { id: "pattern.requestResize", run: (ed) => ed.openDialog({ type: "resize" }) },
  { id: "pattern.resize", run: (ed, a) => { const { w, h, anchor } = a as { w: number; h: number; anchor: "centre" | "topLeft" }; resize(ed, w, h, anchor); }, destructive: "resize" },
  // whole-chart transforms
  { id: "transform.apply", run: (ed, id) => transformChart(ed, id as TransformId), destructive: "transform" },
  { id: "transform.requestMirror", run: (ed) => ed.openDialog({ type: "mirrorFromCentre" }) },
  { id: "transform.mirror", run: (ed, dir) => mirrorChart(ed, dir as MirrorFromCentre), destructive: "mirror" },
  { id: "transform.crop", run: (ed) => cropChart(ed), destructive: "crop" },
  { id: "transform.requestExtend", run: (ed) => ed.openDialog({ type: "extendCanvas" }) },
  { id: "transform.extend", run: (ed, m) => extendChart(ed, m as Margins), destructive: "extend" },
  // ambiguous marks
  { id: "ambiguous.toggleAtHover", run: (ed) => toggleAmbiguous(ed) },
  { id: "ambiguous.next", run: (ed) => nextAmbiguous(ed) },
  { id: "ambiguous.clearAll", run: (ed) => clearAmbiguous(ed) },
  // selection & clipboard
  { id: "selection.all", run: (ed) => ed.selection.all() },
  { id: "selection.none", run: (ed) => ed.selection.none() },
  { id: "selection.clear", run: (ed) => ed.selection.clear(), enabled: hasSelection },
  { id: "selection.nudge", run: (ed, d) => { const { dx, dy } = d as { dx: number; dy: number }; ed.selection.nudge(dx, dy); }, enabled: hasSelection },
  { id: "selection.flipH", run: (ed) => ed.selection.transform("flipH"), enabled: hasSelection },
  { id: "selection.flipV", run: (ed) => ed.selection.transform("flipV"), enabled: hasSelection },
  { id: "selection.rotate", run: (ed) => ed.selection.transform("rot90cw"), enabled: hasSelection },
  { id: "selection.requestReplaceKey", run: (ed) => ed.openDialog({ type: "replaceKey" }) },
  { id: "selection.replaceKey", run: (ed, a) => { const { from, to } = a as { from: number; to: number }; ed.selection.replaceKey(from, to); }, destructive: "replaceKey" },
  { id: "selection.crop", run: (ed) => ed.selection.cropToSelection(), destructive: "crop" },
  { id: "clipboard.copy", run: (ed) => ed.selection.copy() },
  { id: "clipboard.cut", run: (ed) => ed.selection.cut() },
  { id: "clipboard.paste", run: (ed) => ed.selection.paste() },
  { id: "floating.commit", run: (ed) => ed.selection.commitFloating() },
  { id: "floating.cancel", run: (ed) => ed.selection.cancelFloating() },
  // chart underlay (SPEC §15.15)
  { id: "underlay.pick", run: async (ed) => { const f = await pickFile("image/*"); if (f) await ed.underlay.addFromFile(f); } },
  { id: "underlay.replacePick", run: async (ed) => { const f = await pickFile("image/*"); if (f) await ed.underlay.addFromFile(f, true); } },
  { id: "underlay.open", run: (ed, f) => ed.underlay.addFromFile(f as File) },
  { id: "underlay.toggleBehind", run: (ed) => ed.underlay.data && ed.underlay.setBehind(!ed.underlay.data.behind) },
  { id: "underlay.update", run: (ed, patch) => ed.underlay.update(patch as never) },
  { id: "underlay.nudge", run: (ed, d) => { const { dx, dy } = d as { dx: number; dy: number }; ed.underlay.nudge(dx, dy); } },
  { id: "underlay.openStraighten", run: (ed) => ed.underlay.data && ed.openDialog({ type: "straighten" }) },
  { id: "underlay.straighten", run: (ed, o) => ed.underlay.straighten(o as never) },
  { id: "underlay.undo", run: (ed) => ed.underlay.undo() },
  { id: "underlay.rotate", run: (ed, dir) => ed.underlay.rotate(Number(dir)) },
  { id: "underlay.setRotation", run: (ed, deg) => ed.underlay.setRotation(Number(deg)) },
  { id: "underlay.fit", run: (ed) => ed.underlay.fit() },
  { id: "underlay.resetCrop", run: (ed) => ed.underlay.resetCrop() },
  { id: "underlay.remove", run: (ed) => ed.underlay.remove() },
  // snapshots
  { id: "snapshot.restore", run: (ed, time) => ed.snapshots.restore(time as number) },
];

export class CommandRegistry {
  private byId = new Map(COMMANDS.map((c) => [c.id, c]));

  constructor(private ed: Editor) {}

  enabled(id: string): boolean {
    const c = this.byId.get(id);
    return !!c && (c.enabled?.(this.ed) ?? true);
  }

  async run(id: string, args?: unknown): Promise<void> {
    const c = this.byId.get(id);
    if (!c || !this.enabled(id)) return;
    if (c.destructive) this.ed.snapshots.before(c.destructive);
    await c.run(this.ed, args);
  }
}
