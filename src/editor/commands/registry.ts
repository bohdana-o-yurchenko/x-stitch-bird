import { CHART_GROUPS, type ChartGroup } from "@/core/pattern/groups";
import { PARTIAL_KINDS } from "@/core/stitches/partialKinds";
import { toolById } from "../tools/registry";
import { openReadChart, type ReadChartOpen } from "../actions/pdfChart";
import type { CheckOptions } from "@/core/checks/checks";
import { acceptMatching, declineBlock } from "../matching/matching";
import { closeChecks, goToFinding, ignoreFinding, runChartChecks, stepFinding } from "../checks/checks";
import type { TransformId } from "@/core/transform/cellTransform";
import { MIRROR_MODES } from "@/core/transform/mirror";
import type { Margins, MirrorFromCentre } from "@/core/transform/wholeChart";
import type { GridNumbering, KeyIndex, PatternMeta } from "@/core/pattern/types";
import type { ChartView } from "@/render/chart";
import { pickFile } from "@/platform/files";
import { clearAmbiguous, nextAmbiguous, toggleAmbiguous } from "../actions/ambiguous";
import { exportAs, exportChartPdf, exportPatternKeeper, handleDrop, loadFile, loadPdfPattern, openFromLibrary, openImageDialog, saveToLibrary, type ExportFormat } from "../actions/importExport";
import { deleteEntry, usageCount } from "../actions/keyEntries";
import { newPattern, resize, setPatternSettings } from "../actions/pattern";
import { cropChart, extendChart, mirrorChart, transformChart } from "../actions/transforms";
import type { Editor } from "../createEditor";
import type { ToolId } from "../store/editorStore";
import type { Materials } from "@/core/pattern/brands";
import type { Command } from "./types";

const hasSelection = (ed: Editor) => !!ed.state.selection || !!ed.state.floating;

export const COMMANDS: readonly Command[] = [
  // tools & drawing
  { id: "tool.select", run: (ed, id) => ed.setTool(id as ToolId), enabled: (ed) => !ed.underlay.editing },
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
  // the size buttons and Shift+1…5: a tool without a brush gives way to Draw
  { id: "draw.pickBrush", run: (ed, n) => { ed.store.setState({ brush: Number(n) }); if (!toolById(ed.state.tool).usesBrush) ed.setTool("pencil"); } },
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
  { id: "view.toggleGroup", run: (ed, g) => {
    const hidden = ed.state.hiddenGroups, group = g as ChartGroup;
    if (!CHART_GROUPS.includes(group)) return;
    ed.store.setState({ hiddenGroups: hidden.includes(group) ? hidden.filter((x) => x !== group) : [...hidden, group] });
    ed.setOverlay({ pickerHighlight: null, eraseHighlight: null, eraseKnots: null });
  } },
  { id: "view.showAll", run: (ed) => ed.store.setState({ hiddenGroups: [] }) },
  { id: "help.guide", run: (ed) => ed.store.setState({ guide: "intro" }) },
  { id: "help.changelog", run: (ed) => ed.openDialog({ type: "changelog" }) },
  { id: "panel.toggle", run: (ed) => ed.store.setState({ panelCollapsed: !ed.state.panelCollapsed }) },
  // key
  { id: "key.selectNth", run: (ed, n) => { const list = ed.doc.key.flatMap((e, i) => (e && i ? [i] : [])); const k = list[Number(n) - 1]; if (k) ed.setActiveEntry(k); } },
  { id: "key.select", run: (ed, i) => ed.setActiveEntry(i as KeyIndex) },
  { id: "key.add", run: (ed) => ed.openKeyForm() },
  { id: "key.edit", run: (ed, i) => ed.openKeyForm(i as KeyIndex) },
  { id: "key.duplicate", run: (ed, i) => ed.doc.key[i as KeyIndex] && ed.openKeyForm(undefined, i as KeyIndex) },
  { id: "key.requestDelete", run: (ed, i) => ed.doc.key[i as KeyIndex] && ed.openDialog({ type: "deleteEntry", index: i as KeyIndex, count: usageCount(ed, i as KeyIndex) }) },
  { id: "key.delete", run: (ed, i) => deleteEntry(ed, i as KeyIndex), destructive: "deleteKey" },
  // pattern & files
  { id: "file.new", run: (ed) => ed.openDialog({ type: "newPattern" }) },
  { id: "file.create", run: (ed, o) => newPattern(ed, o as Parameters<typeof newPattern>[1]), destructive: "new", replacesPattern: true },
  { id: "file.openSaved", run: (ed, id) => openFromLibrary(ed, id as string), destructive: "open", replacesPattern: true },
  { id: "file.save", run: (ed) => saveToLibrary(ed) },
  { id: "file.versions", run: (ed) => ed.showSection("versions") },
  { id: "file.export", run: (ed, f) => exportAs(ed, f as ExportFormat) },
  { id: "file.exportPatternKeeper", run: (ed, confirmed) => exportPatternKeeper(ed, confirmed === true) },
  { id: "file.exportChartPdf", run: (ed) => exportChartPdf(ed) },
  // the work file: what it is — and that the .oxs is another thing — said before it's saved (SPEC §15.45)
  { id: "file.chooseFile", run: (ed) => ed.openDialog({ type: "fileChoice" }) },
  { id: "file.pickToLoad", run: async (ed) => { const f = await pickFile(".xbird,.oxs,.xsd,.json,.xml"); if (f) await ed.commands.run("file.load", f); } },
  { id: "file.load", run: (ed, f) => loadFile(ed, f as File), destructive: "import", replacesPattern: true },
  // New ▸ From an .oxs file… / From a PDF chart… (SPEC §15.46): the PDF one says first what it is — and isn't
  { id: "file.newFromOxs", run: async (ed) => { const f = await pickFile(".oxs,.xsd"); if (f) await ed.commands.run("file.load", f); } },
  { id: "file.newFromPdf", run: (ed) => ed.openDialog({ type: "pdfPatternIntro" }) },
  { id: "file.pickPdfPattern", run: async (ed) => { const f = await pickFile(".pdf,application/pdf"); if (f) await ed.commands.run("file.loadPdf", f); } },
  { id: "file.loadPdf", run: (ed, f) => loadPdfPattern(ed, f as File), destructive: "import", replacesPattern: true },
  // the read chart, settled in its steps (SPEC §15.48); replacing the open pattern was asked about before reading
  { id: "file.openReadChart", run: (ed, o) => openReadChart(ed, o as ReadChartOpen) },
  { id: "file.drop", run: (ed, files) => handleDrop(ed, files as File[]) },
  { id: "image.pick", run: async (ed) => { const f = await pickFile("image/*"); if (f) await openImageDialog(ed, f); } },
  { id: "image.open", run: (ed, f) => openImageDialog(ed, f as File) },
  { id: "image.create", run: (ed, a) => { const { result, image, keepReference } = a as never; ed.createFromImage(result, image, keepReference); }, destructive: "image", replacesPattern: true },
  { id: "reference.pick", run: async (ed) => { const f = await pickFile(PICTURES); if (f) await ed.addReferenceFromFile(f); } },
  { id: "reference.open", run: (ed, f) => ed.addReferenceFromFile(f as File) },
  { id: "pattern.editInfo", run: (ed) => ed.showSection("info") },
  { id: "pattern.setInfo", run: (ed, meta) => setPatternSettings(ed, { meta: meta as PatternMeta }) },
  { id: "pattern.setGrid", run: (ed, g) => setPatternSettings(ed, { grid: g as GridNumbering }) },
  { id: "pattern.rename", run: (ed, name) => setPatternSettings(ed, { name: name as string }) },
  { id: "pattern.setBrands", run: (ed, brands) => setPatternSettings(ed, { brands: brands as string[] }) },
  { id: "pattern.setMaterials", run: (ed, m) => setPatternSettings(ed, { materials: m as Materials }) },
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
  { id: "underlay.pick", run: async (ed) => { const f = await pickFile(PICTURES); if (f) await ed.underlay.addFromFile(f); } },
  { id: "underlay.replacePick", run: async (ed) => { const f = await pickFile(PICTURES); if (f) await ed.underlay.addFromFile(f, true); } },
  { id: "underlay.page", run: (ed, n) => ed.underlay.showPage(Number(n)) },
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
  // chart checks (SPEC §15.4)
  { id: "checks.run", run: (ed, o) => runChartChecks(ed, o as CheckOptions) },
  { id: "checks.go", run: (ed, i) => goToFinding(ed, Number(i)) },
  { id: "checks.next", run: (ed) => stepFinding(ed, 1) },
  { id: "checks.prev", run: (ed) => stepFinding(ed, -1) },
  { id: "checks.ignore", run: (ed, id) => ignoreFinding(ed, String(id)) },
  { id: "checks.close", run: (ed) => closeChecks(ed) },
  // symbol matching in a block (SPEC §15.11)
  { id: "match.accept", run: (ed) => acceptMatching(ed) },
  { id: "match.decline", run: (ed) => declineBlock(ed) },
  // snapshots
  { id: "snapshot.restore", run: (ed, time) => ed.snapshots.restore(time as number) },
];

/**
 * Commands that change the open pattern: not while another window edits it (SPEC §15.34). Opening or making another
 * pattern, the view, the photos and exports stay free.
 */
/** What a reference can be: a photo, or a PDF (SPEC §15.41). */
const PICTURES = "image/*,application/pdf,.pdf";

const EDITS = new Set([
  "history.undo", "history.redo", "key.add", "key.edit", "key.duplicate", "key.requestDelete", "key.delete",
  "pattern.setInfo", "pattern.setGrid", "pattern.rename", "pattern.setBrands", "pattern.setMaterials", "pattern.setFabric", "pattern.requestResize", "pattern.resize",
  "transform.apply", "transform.requestMirror", "transform.mirror", "transform.crop", "transform.requestExtend", "transform.extend",
  "ambiguous.toggleAtHover", "ambiguous.clearAll",
  "selection.clear", "selection.nudge", "selection.flipH", "selection.flipV", "selection.rotate", "selection.requestReplaceKey", "selection.replaceKey", "selection.crop",
  "clipboard.cut", "clipboard.paste", "floating.commit", "match.accept", "match.decline", "snapshot.restore",
]);

export class CommandRegistry {
  private byId = new Map(COMMANDS.map((c) => [c.id, c]));

  constructor(private ed: Editor) {}

  enabled(id: string): boolean {
    const c = this.byId.get(id);
    return !!c && (c.enabled?.(this.ed) ?? true);
  }

  /** `confirmed`: the question about the open pattern was answered (signed out, SPEC §15.25). */
  async run(id: string, args?: unknown, confirmed = false): Promise<void> {
    const c = this.byId.get(id);
    if (!c || !this.enabled(id)) return;
    if (EDITS.has(id) && this.ed.live.readOnly) return this.ed.live.blocked();
    const keep = this.ed.keep;
    if (c.replacesPattern && !confirmed && keep.mustAsk) return this.ed.openDialog({ type: "keepPattern", then: { command: id, args } });
    if (c.destructive) this.ed.snapshots.before(c.destructive);
    if (c.replacesPattern && keep.leaves) return keep.replace(async () => void (await c.run(this.ed, args)));
    await c.run(this.ed, args);
  }
}
