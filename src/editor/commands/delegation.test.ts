import { beforeEach, describe, expect, it, vi } from "vitest";
import { testEditor } from "../../../tests/support/editorHarness";
import type { Editor } from "../createEditor";

/*
 * Each button, menu item and shortcut reaches the part of the editor that does the work, with what it was given
 * (ARCHITECTURE §6.2). The file pickers stand in for the browser's: they hand back `picked`.
 */
const picker = vi.hoisted(() => ({ picked: null as File | null, accept: [] as string[] }));
vi.mock("@/platform/files", async (orig) => ({
  ...(await orig<typeof import("@/platform/files")>()),
  pickFile: async (accept: string) => (picker.accept.push(accept), picker.picked),
}));

let ed: Editor;
const file = new File(["x"], "x.png", { type: "image/png" });

beforeEach(() => {
  ed = testEditor(8, 8).ed;
  picker.picked = file;
  picker.accept = [];
});

/** [command, its argument, the object it hands the work to, that object's method, what the method gets]. */
const DELEGATES: [string, unknown, (ed: Editor) => object, string, unknown[]][] = [
  ["file.load", file, (e) => e.commands, "run", ["file.load", file]],
  ["reference.open", file, (e) => e, "addReferenceFromFile", [file]],
  ["underlay.open", file, (e) => e.underlay, "addFromFile", [file]],
  ["underlay.page", "3", (e) => e.underlay, "showPage", [3]],
  ["underlay.update", { opacity: 0.5 }, (e) => e.underlay, "update", [{ opacity: 0.5 }]],
  ["underlay.nudge", { dx: 1, dy: -1 }, (e) => e.underlay, "nudge", [1, -1]],
  ["underlay.straighten", { corners: [] }, (e) => e.underlay, "straighten", [{ corners: [] }]],
  ["underlay.undo", undefined, (e) => e.underlay, "undo", []],
  ["underlay.rotate", "-1", (e) => e.underlay, "rotate", [-1]],
  ["underlay.setRotation", "12", (e) => e.underlay, "setRotation", [12]],
  ["underlay.fit", undefined, (e) => e.underlay, "fit", []],
  ["underlay.resetCrop", undefined, (e) => e.underlay, "resetCrop", []],
  ["underlay.remove", undefined, (e) => e.underlay, "remove", []],
  ["snapshot.restore", 1234, (e) => e.snapshots, "restore", [1234]],
  ["selection.all", undefined, (e) => e.selection, "all", []],
  ["selection.none", undefined, (e) => e.selection, "none", []],
  ["clipboard.copy", undefined, (e) => e.selection, "copy", []],
  ["clipboard.cut", undefined, (e) => e.selection, "cut", []],
  ["clipboard.paste", undefined, (e) => e.selection, "paste", []],
  ["floating.commit", undefined, (e) => e.selection, "commitFloating", []],
  ["floating.cancel", undefined, (e) => e.selection, "cancelFloating", []],
  ["selection.crop", undefined, (e) => e.selection, "cropToSelection", []],
  ["selection.replaceKey", { from: 1, to: 2 }, (e) => e.selection, "replaceKey", [1, 2]],
  ["file.versions", undefined, (e) => e, "showSection", ["versions"]],
  ["pattern.editInfo", undefined, (e) => e, "showSection", ["info"]],
  ["tool.cancel", undefined, (e) => e.tools, "cancel", []],
  ["view.fit", undefined, (e) => e.viewport, "fit", []],
];

describe("commands hand their work on", () => {
  it.each(DELEGATES)("%s", async (id, args, target, method, expected) => {
    const spy = vi.spyOn(target(ed) as Record<string, () => unknown>, method).mockImplementation((() => {}) as never);
    // file.load is checked as the destination of the pickers below
    if (id === "file.load") return;
    await ed.commands.run(id, args);
    expect(spy).toHaveBeenCalledWith(...expected);
  });

  it.each([
    ["file.pickToLoad", ".xbird", "file.load"],
    ["file.newFromOxs", ".oxs,.xsd", "file.load"],
    ["file.pickPdfPattern", ".pdf,application/pdf", "file.loadPdf"],
  ])("%s asks for %s and opens what was picked", async (id, accept, then) => {
    const run = vi.spyOn(ed.commands, "run");
    await ed.commands.run(id);
    expect(picker.accept).toEqual([accept]);
    expect(run).toHaveBeenCalledWith(then, file);
  });

  it("a picker closed without a file does nothing more", async () => {
    picker.picked = null;
    const run = vi.spyOn(ed.commands, "run");
    await ed.commands.run("file.pickToLoad");
    await ed.commands.run("reference.pick");
    await ed.commands.run("underlay.pick");
    expect(run.mock.calls.map((c) => c[0])).toEqual(["file.pickToLoad", "reference.pick", "underlay.pick"]);
  });

  it("pictures behind the chart and photo windows take photos and PDFs", async () => {
    const add = vi.spyOn(ed.underlay, "addFromFile").mockResolvedValue(undefined as never);
    const ref = vi.spyOn(ed, "addReferenceFromFile").mockResolvedValue();
    await ed.commands.run("underlay.pick");
    await ed.commands.run("underlay.replacePick");
    await ed.commands.run("reference.pick");
    expect(add.mock.calls).toEqual([[file], [file, true]]);
    expect(ref).toHaveBeenCalledWith(file);
    expect(picker.accept).toEqual(Array(3).fill("image/*,application/pdf,.pdf"));
  });

  it("the image behind: in front or behind, and straightening, only when there is one", async () => {
    const behind = vi.spyOn(ed.underlay, "setBehind");
    await ed.commands.run("underlay.toggleBehind");
    await ed.commands.run("underlay.openStraighten");
    expect(behind).not.toHaveBeenCalled();
    expect(ed.state.dialog).toBeNull();
    vi.spyOn(ed.underlay, "data", "get").mockReturnValue({ behind: true } as never);
    await ed.commands.run("underlay.toggleBehind");
    await ed.commands.run("underlay.openStraighten");
    expect(behind).toHaveBeenCalledWith(false);
    expect(ed.state.dialog).toMatchObject({ type: "straighten" });
  });
});

describe("commands that change what's shown or open a dialog", () => {
  it("zoom in and out step by a quarter", async () => {
    ed.store.setState({ viewport: { zoom: 12, offX: 0, offY: 0 } });
    const z = ed.state.viewport.zoom;
    await ed.commands.run("view.zoomIn");
    expect(ed.state.viewport.zoom).toBeGreaterThan(z);
    await ed.commands.run("view.zoomOut");
    await ed.commands.run("view.zoomOut");
    expect(ed.state.viewport.zoom).toBeLessThan(z);
  });

  it("hiding a kind of stitch: a known kind toggles, anything else is ignored", async () => {
    await ed.commands.run("view.toggleGroup", "beads");
    expect(ed.state.hiddenGroups).toEqual(["beads"]);
    await ed.commands.run("view.toggleGroup", "nonsense");
    expect(ed.state.hiddenGroups).toEqual(["beads"]);
    await ed.commands.run("view.toggleGroup", "beads");
    expect(ed.state.hiddenGroups).toEqual([]);
  });

  it.each([
    ["file.new", "newPattern"], ["file.chooseFile", "fileChoice"], ["file.newFromPdf", "pdfPatternIntro"], ["view.goToCell", "goToCell"],
    ["help.changelog", "changelog"], ["pattern.requestResize", "resize"], ["transform.requestMirror", "mirrorFromCentre"],
    ["transform.requestExtend", "extendCanvas"], ["selection.requestReplaceKey", "replaceKey"],
  ])("%s opens the %s dialog", async (id, dialog) => {
    await ed.commands.run(id);
    expect(ed.state.dialog).toMatchObject({ type: dialog });
  });

  it("the drop of a file: a pattern opens, a picture asks what it's for", async () => {
    await ed.commands.run("file.drop", [file]);
    expect(ed.state.dialog).toMatchObject({ type: "dropChoice", file });
  });

  it("checks: run, step, ignore, close", async () => {
    const { red } = { red: ed.doc.key.findIndex((e, i) => i > 0 && !!e) };
    ed.doc.layers.stitches[9] = red;
    ed.changed();
    await ed.commands.run("checks.run", { holes: { on: false, max: 3 }, lone: { on: true, max: 1, alone: true }, symmetry: { on: false } });
    expect(ed.state.checks?.findings.length).toBeGreaterThan(0);
    await ed.commands.run("checks.next");
    expect(ed.state.checks?.current).toBe(0);
    await ed.commands.run("checks.prev");
    await ed.commands.run("checks.go", "0");
    expect(ed.state.checks?.current).toBe(0);
    await ed.commands.run("checks.ignore", ed.state.checks!.findings[0]!.id);
    expect(ed.state.checks?.ignored).toHaveLength(1);
    await ed.commands.run("checks.close");
    expect(ed.state.checks).toBeNull();
  });
});
