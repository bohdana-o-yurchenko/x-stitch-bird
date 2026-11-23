import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPattern } from "@/core/pattern/createPattern";
import { addEntry } from "@/core/pattern/keyEntries";
import { ALL_SYMBOLS } from "@/core/symbols/symbols";
import type { Snapshot } from "@/persistence/ports";
import { memoryPersistence } from "../../tests/support/memoryPersistence";
import { loadPattern } from "./actions/pattern";
import { LIBRARY_EVERY, LIBRARY_QUIET } from "./autosave";
import { patternFile } from "./actions/importExport";
import { serializePattern, XBIRD_VERSION } from "@/core/formats/json/serialize";
import { gridToImage } from "@/core/underlay/underlay";
import { Editor } from "./createEditor";
import { keyNames, shortcutLabel, shortcutLabels } from "./shortcuts/keymap";
import { resolveTool } from "./tools/registry";
import type { ToolPointer } from "./tools/types";

const at = (x: number, y: number, o: Partial<ToolPointer> = {}): ToolPointer => ({ sx: 0, sy: 0, grid: { x: x + 0.5, y: y + 0.5 }, cell: { x, y }, button: 0, shift: false, alt: false, ...o });
const key = (k: string, o: Partial<{ shift: boolean; ctrl: boolean; repeat: boolean; inField: boolean; code: string }> = {}) => ({
  key: k, code: o.code, shiftKey: !!o.shift, ctrlKey: !!o.ctrl, metaKey: false, altKey: k === "Alt", repeat: o.repeat, inField: o.inField, preventDefault() {},
});

let ed: Editor, snaps: Snapshot[], red: number;

beforeEach(() => {
  snaps = [];
  ed = new Editor(memoryPersistence(snaps), false);
  ed.store.setState({ symbols: [...ALL_SYMBOLS] });
  const p = createPattern(10, 10);
  red = addEntry(p, { t: "thread", src: "dmc:321", n: 2, st: "full" }, ALL_SYMBOLS);
  loadPattern(ed, p);
});

describe("drawing and history", () => {
  it("records a pencil stroke as one undo step and drops empty strokes", () => {
    ed.tools.down(at(1, 1));
    ed.tools.move(at(4, 1));
    ed.tools.up(at(4, 1));
    expect([...ed.doc.layers.stitches.slice(11, 15)]).toEqual([red, red, red, red]);
    ed.tools.down(at(1, 1));
    ed.tools.up(at(1, 1));
    ed.history.undo();
    expect(ed.doc.layers.stitches.some(Boolean)).toBe(false);
    expect(ed.state.canUndo).toBe(false);
    ed.history.redo();
    expect(ed.doc.layers.stitches[12]).toBe(red);
  });

  it("undoes a resize including the size, and a key deletion including its stitches", async () => {
    ed.doc.layers.stitches[0] = red;
    await ed.commands.run("pattern.resize", { w: 20, h: 6, anchor: "topLeft" });
    expect([ed.doc.w, ed.doc.h]).toEqual([20, 6]);
    await ed.commands.run("key.delete", red);
    expect(ed.doc.key[red]).toBeNull();
    ed.history.undo();
    ed.history.undo();
    expect([ed.doc.w, ed.doc.h, ed.doc.layers.stitches[0]]).toEqual([10, 10, red]);
    expect(snaps.map((s) => s.reason)).toEqual(["resize", "deleteKey"]);
  });

  it("mirror drawing reuses the entry: a half cross keeps its direction, no new entries", () => {
    const half = addEntry(ed.doc, { t: "thread", src: "dmc:321", n: 2, st: "half" }, ALL_SYMBOLS);
    ed.changed({ keys: true });
    ed.setActiveEntry(half);
    ed.store.setState({ mirror: "quad" });
    const entries = ed.doc.key.length;
    ed.tools.down(at(1, 1));
    ed.tools.up(at(1, 1));
    expect([11, 18, 81, 88].map((i) => ed.doc.layers.stitches[i])).toEqual([half, half, half, half]);
    expect(ed.doc.key).toHaveLength(entries);
  });

  it("uses the backstitch behaviour for backstitch entries", () => {
    const back = addEntry(ed.doc, { t: "back", src: "dmc:310", n: 1 }, ALL_SYMBOLS);
    ed.changed({ keys: true });
    ed.setActiveEntry(back);
    ed.tools.down(at(0, 0, { grid: { x: 0, y: 0 } }));
    ed.tools.up(at(0, 0, { grid: { x: 0, y: 0 } }));
    ed.tools.down(at(3, 0, { grid: { x: 3, y: 0 } }));
    ed.tools.up(at(3, 0, { grid: { x: 3, y: 0 } }));
    expect(ed.doc.layers.segments).toEqual([{ x1: 0, y1: 0, x2: 3, y2: 0, k: back }]);
    ed.shortcuts.keyDown(key("Escape"));
    expect(ed.state.overlay.chain).toBeNull();
  });
});

describe("eraser on a backstitch line (SPEC §6.2)", () => {
  beforeEach(() => {
    ed.doc.layers.stitches.fill(red, 0, 30);
    ed.doc.layers.segments.push({ x1: 0, y1: 1, x2: 5, y2: 1, k: red });
    ed.store.setState({ viewport: { zoom: 20, offX: 0, offY: 0 } });
    ed.setTool("eraser");
  });

  it("highlights the line on hover and hides the cell cursor", () => {
    ed.tools.move(at(2, 0, { grid: { x: 2.5, y: 1.1 } }));
    expect(ed.state.overlay.eraseHighlight).toHaveLength(1);
    expect(ed.state.overlay.hover).toBeNull();
    ed.tools.move(at(2, 2, { grid: { x: 2.5, y: 2.5 } }));
    expect(ed.state.overlay.eraseHighlight).toBeNull();
  });

  it("deletes only backstitch when the press starts on the line", () => {
    ed.tools.down(at(2, 0, { grid: { x: 2.5, y: 1.1 } }));
    ed.tools.up(at(2, 0, { grid: { x: 2.5, y: 1.1 } }));
    expect(ed.doc.layers.segments).toHaveLength(0);
    expect(ed.doc.layers.stitches[2]).toBe(red);
    ed.history.undo();
    expect(ed.doc.layers.segments).toHaveLength(1);
  });

  it("erases cells and nearby backstitch when the press starts elsewhere", () => {
    ed.tools.down(at(2, 2, { grid: { x: 2.5, y: 2.5 } }));
    ed.tools.up(at(2, 2, { grid: { x: 2.5, y: 2.5 } }));
    expect(ed.doc.layers.stitches[22]).toBe(0);
    expect(ed.doc.layers.segments).toHaveLength(1);
  });

  it("also hits the mirror image of the line", () => {
    ed.store.setState({ mirror: "vertical" });
    ed.doc.layers.segments = [{ x1: 8, y1: 4, x2: 9, y2: 4, k: red }];
    ed.doc.layers.stitches[41] = red;
    ed.tools.down(at(1, 3, { grid: { x: 1.5, y: 4 } }));
    ed.tools.up(at(1, 3, { grid: { x: 1.5, y: 4 } }));
    expect(ed.doc.layers.segments).toHaveLength(0);
    expect(ed.doc.layers.stitches[41]).toBe(red);
  });
});

describe("chart underlay (SPEC §15.15)", () => {
  beforeEach(() => {
    ed.store.setState({
      underlay: { image: "img:1", imageW: 100, imageH: 100, crop: { x: 0, y: 0, w: 100, h: 100 }, rect: { x: 2, y: 2, w: 5, h: 5 }, opacity: 0.5, behind: false, visible: true, tool: "move" },
      viewport: { zoom: 20, offX: 0, offY: 0 },
    });
  });

  it("edit mode: the pointer moves the image and never paints", () => {
    ed.tools.down(at(4, 4));
    ed.tools.move(at(6, 5));
    ed.tools.up(at(6, 5));
    expect(ed.state.underlay!.rect).toMatchObject({ x: 4, y: 3 });
    expect(ed.doc.layers.stitches.some(Boolean)).toBe(false);
  });

  it("behind mode: tools work as usual; Esc and U switch modes, arrows nudge", () => {
    ed.shortcuts.keyDown(key("ArrowRight", { shift: true }));
    expect(ed.state.underlay!.rect.x).toBe(3);
    ed.shortcuts.keyDown(key("Escape"));
    expect(ed.state.underlay!.behind).toBe(true);
    ed.tools.down(at(4, 4));
    ed.tools.up(at(4, 4));
    expect(ed.doc.layers.stitches[44]).toBe(red);
    ed.shortcuts.keyDown(key("u"));
    expect(ed.underlay.editing).toBe(true);
  });
  it("zoomed in, the edit frame stretches the photo from its own opposite side; the photo under the dragged side follows the pointer; Ctrl+Z undoes", () => {
    ed.viewport.setSize(826, 626);
    ed.store.setState({ underlay: { ...ed.state.underlay!, rect: { x: -50, y: -50, w: 200, h: 200 } }, viewport: { zoom: 20, offX: 0, offY: 0 } });
    const f = ed.underlay.frame()!;
    expect(f).toEqual({ x: 266, y: 216, w: 320, h: 220 });
    const sp = (x: number, y: number): ToolPointer => ({ ...at(0, 0), sx: x, sy: y, grid: ed.viewport.toGrid(x, y) });
    const imageAt = (x: number, y: number) => {
      const g = ed.viewport.toGrid(x, y), r = ed.state.underlay!.rect;
      return [+((g.x - r.x) / r.w).toFixed(6), +((g.y - r.y) / r.h).toFixed(6)];
    };
    const grabbed = imageAt(f.x + f.w, f.y + 50);
    ed.tools.down(sp(f.x + f.w, f.y + 50));
    ed.tools.move(sp(f.x + f.w + 30, f.y + 50));
    ed.tools.up(sp(f.x + f.w + 30, f.y + 50));
    // the photo's west side, top and height stay; only its east side moves
    const r = ed.state.underlay!.rect;
    expect([r.x, r.y, r.h]).toEqual([-50, -50, 200]);
    expect(r.w).toBeGreaterThan(200);
    expect(imageAt(f.x + f.w + 30, f.y + 50)).toEqual(grabbed);
    expect(ed.underlay.frame()!.w).toBe(350);
    ed.shortcuts.keyDown(key("z", { ctrl: true }));
    expect(ed.state.underlay!.rect).toEqual({ x: -50, y: -50, w: 200, h: 200 });
    // fitted (all sides visible) → no frame
    ed.store.setState({ viewport: { zoom: 2, offX: 150, offY: 150 } });
    expect(ed.underlay.frame()).toBeNull();
  });

  it("the edit frame's sides are easy to grab: a press close to a side resizes, only the middle of the frame moves the photo", () => {
    ed.viewport.setSize(826, 626);
    ed.store.setState({ underlay: { ...ed.state.underlay!, rect: { x: -50, y: -50, w: 200, h: 200 } }, viewport: { zoom: 20, offX: 0, offY: 0 } });
    const f = ed.underlay.frame()!;
    const sp = (x: number, y: number): ToolPointer => ({ ...at(0, 0), sx: x, sy: y, grid: ed.viewport.toGrid(x, y) });
    const pull = (x: number, y: number, dx: number) => {
      ed.store.setState({ underlay: { ...ed.state.underlay!, rect: { x: -50, y: -50, w: 200, h: 200 } }, underlayFrame: null });
      ed.tools.down(sp(x, y));
      ed.tools.move(sp(x + dx, y));
      ed.tools.up(sp(x + dx, y));
      const r = ed.state.underlay!.rect;
      return r.x === -50 && r.w !== 200 ? "resized" : r.x !== -50 && r.w === 200 ? "moved" : "nothing";
    };
    // a little inside or outside the right side, anywhere along it — not just exactly on the line
    for (const off of [-12, -6, 0, 6, 12]) expect(pull(f.x + f.w + off, f.y + 40, 30), `off ${off}`).toBe("resized");
    // just past a corner still takes the corner
    expect(pull(f.x + f.w + 10, f.y + f.h + 10, 30)).toBe("resized");
    expect(pull(f.x + f.w / 2, f.y + f.h / 2, 30)).toBe("moved");
  });

  it("hovering shows which side of the edit frame a press would take, even inside one chart cell; leaving clears it", () => {
    ed.viewport.setSize(826, 626);
    ed.store.setState({ underlay: { ...ed.state.underlay!, rect: { x: -50, y: -50, w: 200, h: 200 } }, viewport: { zoom: 20, offX: 0, offY: 0 } });
    const f = ed.underlay.frame()!;
    const sp = (x: number, y: number): ToolPointer => {
      const grid = ed.viewport.toGrid(x, y);
      return { ...at(Math.floor(grid.x), Math.floor(grid.y)), sx: x, sy: y, grid };
    };
    // both points are in the same chart cell (cells are 20 px): the highlight and the cursor still follow
    ed.tools.move(sp(f.x + f.w - 19, f.y + 100));
    expect([ed.state.underlayHot, ed.tools.cursor()]).toEqual([null, "move"]);
    ed.tools.move(sp(f.x + f.w - 5, f.y + 100));
    expect([ed.state.underlayHot, ed.tools.cursor()]).toEqual(["e", "ew-resize"]);
    ed.tools.move(sp(f.x + 2, f.y + 3));
    expect(ed.state.underlayHot).toBe("nw");
    ed.tools.leave();
    expect(ed.state.underlayHot).toBeNull();
  });

  it("the ↻ button above the frame turns the image a small step around the frame's middle; [ turns back", () => {
    ed.viewport.setSize(826, 626);
    ed.store.setState({ underlay: { ...ed.state.underlay!, rect: { x: -50, y: -50, w: 200, h: 200 } }, viewport: { zoom: 20, offX: 0, offY: 0 } });
    const f = ed.underlay.frame()!, cw = ed.underlay.rotateButtons().find((b) => b.dir === 1)!;
    const mid = ed.viewport.toGrid(f.x + f.w / 2, f.y + f.h / 2), under = gridToImage(ed.state.underlay!, mid);
    ed.tools.down({ ...at(0, 0), sx: cw.x, sy: cw.y, grid: ed.viewport.toGrid(cw.x, cw.y) });
    ed.tools.up({ ...at(0, 0), sx: cw.x, sy: cw.y });
    expect(ed.state.underlay!.rotation).toBe(0.2);
    const still = gridToImage(ed.state.underlay!, mid);
    expect(Math.hypot(still.x - under.x, still.y - under.y)).toBeLessThan(1e-6);
    ed.shortcuts.keyDown(key("["));
    expect(ed.state.underlay!.rotation).toBe(0);
  });

  it("a downloaded .xbird says which file format version it is", async () => {
    expect((await patternFile(ed)).xbird).toBe(XBIRD_VERSION);
  });

  it("pictures go to the image store and travel in .json files as data URLs", async () => {
    const png = "data:image/png;base64,iVBORw0KGgo=";
    const [ref] = await ed.images.refsFromFile([{ id: "r1", name: "Photo", src: png, marks: null, x: 0, y: 0, w: 300, h: 200, min: false, op: 1, view: null, tool: "pan", color: "#000", size: 4, grid: false, showSt: false }]);
    expect(ref!.image).toMatch(/^img:/);
    expect((await ed.images.refsToFile([ref!]))[0]).toMatchObject({ src: png, marks: null });
    const u = (await ed.images.underlayFromFile({ ...ed.state.underlay!, image: png, straighten: { source: png, sourceW: 4, sourceH: 4, corners: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }], cols: 2, rows: 2, at: { x: 0, y: 0 } } }))!;
    expect([u.image, u.straighten!.source].every((id) => id.startsWith("img:"))).toBe(true);
    expect(await ed.images.underlayToFile(u)).toMatchObject({ src: png, straighten: { src: png, cols: 2 } });
  });

});

describe("viewport", () => {
  it("zooms noticeably on a trackpad pinch, and by a notch on a mouse wheel", () => {
    vi.useFakeTimers({ now: 1_000_000 });
    ed.viewport.setSize(800, 600);
    const zoom = () => ed.state.viewport.zoom;
    const z0 = zoom();
    for (let i = 0; i < 10; i++) ed.viewport.wheel({ deltaX: 0, deltaY: -4.5, deltaMode: 0, ctrlKey: true, metaKey: false, shiftKey: false }, 400, 300);
    expect(zoom() / z0).toBeGreaterThan(1.6);
    const z1 = zoom();
    // a mouse, a moment after the trackpad
    vi.setSystemTime(Date.now() + 1000);
    ed.viewport.wheel({ deltaX: 0, deltaY: -100, deltaMode: 0, ctrlKey: false, metaKey: false, shiftKey: false }, 400, 300);
    expect(zoom() / z1).toBeCloseTo(Math.exp(0.25), 5);
    vi.useRealTimers();
  });
});

describe("autosave", () => {
  it("saves changes a few seconds after editing stops, at least every half minute while it goes on; not after opening an unchanged pattern", async () => {
    vi.useFakeTimers();
    const saved: string[] = [];
    ed.persistence.patterns.save = async (d) => (saved.push(d.name), { ok: true });
    ed.autosave.markSaved();
    vi.advanceTimersByTime(LIBRARY_EVERY * 2);
    expect(saved).toEqual([]);
    ed.changed();
    ed.changed();
    expect(ed.autosave.pending).toBe(true);
    await vi.advanceTimersByTimeAsync(LIBRARY_QUIET);
    expect(saved).toHaveLength(1);
    expect(ed.autosave.pending).toBe(false);
    // a change every second, without stopping: still saved within the half minute
    for (let i = 0; i < 31; i++) {
      ed.changed();
      await vi.advanceTimersByTimeAsync(1_000);
    }
    expect(saved).toHaveLength(2);
    vi.useRealTimers();
  });

  it("only the time spent grown (looking around, a key): nothing to ask about on leaving, nor rushed up as the page closes — but kept and saved with the next save (SPEC §15.17)", async () => {
    vi.useFakeTimers();
    const saved: number[] = [], drafts: number[] = [];
    ed.persistence.patterns.save = async (d) => (saved.push(d.spent ?? 0), { ok: true });
    ed.persistence.draft.save = (d) => void drafts.push(d.spent ?? 0);
    ed.store.setState({ ready: true });
    ed.autosave.markSaved();
    ed.timer.activity();
    vi.advanceTimersByTime(60_000);
    ed.timer.activity();
    expect(ed.doc.spent).toBe(60_000);
    expect(ed.autosave.pending).toBe(false);
    ed.flush();
    expect(drafts.at(-1)).toBe(60);
    expect(saved).toEqual([]);
    // not lost: it goes up with the regular save
    await vi.advanceTimersByTimeAsync(LIBRARY_QUIET);
    expect(saved).toEqual([60]);
    vi.useRealTimers();
  });

  it("the demo (or an empty start) isn't kept — no draft, no saved pattern — however long it's looked at; once edited, it is (SPEC §15.37)", async () => {
    vi.useFakeTimers();
    const saved: string[] = [], drafts: string[] = [];
    ed.persistence.patterns.save = async (d) => (saved.push(d.id), { ok: true });
    ed.persistence.draft.save = (d) => void drafts.push(d.id);
    ed.store.setState({ ready: true });
    ed.autosave.untouched();
    ed.timer.activity();
    vi.advanceTimersByTime(60_000);
    ed.timer.activity();
    await vi.advanceTimersByTimeAsync(LIBRARY_EVERY);
    ed.flush();
    expect([drafts, saved, ed.autosave.pending]).toEqual([[], [], false]);
    // a stitch: from now on it's a pattern of its own
    ed.tools.down(at(1, 1));
    ed.tools.up(at(1, 1));
    await vi.advanceTimersByTimeAsync(LIBRARY_QUIET);
    expect(drafts.at(-1)).toBe(ed.doc.id);
    expect(saved).toEqual([ed.doc.id]);
    vi.useRealTimers();
  });

  it("doesn't save the blank placeholder over the draft when the page closes before start-up finished", () => {
    const drafts: string[] = [];
    const early = new Editor({ ...memoryPersistence([]), draft: { load: async () => null, save: (d) => void drafts.push(d.name) } }, false);
    early.flush();
    expect(drafts).toEqual([]);
    early.store.setState({ ready: true });
    early.flush();
    expect(drafts).toHaveLength(1);
  });

  it("puts a file opened from the computer into the library at once, and saves changes before another pattern replaces them", async () => {
    const saved: string[] = [];
    ed.persistence.patterns.save = async (d) => (saved.push(d.name), { ok: true });
    ed.autosave.markSaved();
    const file = new File([JSON.stringify(serializePattern(createPattern(5, 5, "Imported")))], "imported.xbird");
    await ed.commands.run("file.load", file);
    expect(ed.doc.name).toBe("Imported");
    expect(saved).toEqual(["Imported"]);
    // changed, then straight away another pattern opens: the change is not lost
    ed.doc.layers.stitches[0] = red;
    ed.changed();
    loadPattern(ed, createPattern(5, 5, "Other"));
    expect(saved).toEqual(["Imported", "Imported"]);
    // a brand-new pattern counts as unsaved too (it would have been saved within the minute)
    loadPattern(ed, createPattern(5, 5, "Third"));
    expect(saved).toEqual(["Imported", "Imported", "Other"]);
  });
});

describe("shortcuts", () => {
  it("labels tool shortcuts for display", () => {
    expect([shortcutLabel("tool.select", "pencil"), shortcutLabel("tool.select", "filledRect"), shortcutLabel("nope")]).toEqual(["P", "⇧R", null]);
    expect(shortcutLabels("view.zoomIn", undefined, false)).toEqual(["+", "="]);
    expect(shortcutLabels("history.redo", undefined, false)).toEqual(["Ctrl+Shift+Z", "Ctrl+Y"]);
  });

  it("reports the tool that will act: held tools win, and drawing with a backstitch entry draws lines", () => {
    ed.setTool("rect");
    const back = addEntry(ed.doc, { t: "back", src: "dmc:310", n: 1 }, ALL_SYMBOLS);
    ed.store.setState({ activeEntry: back });
    expect(resolveTool(ed.state).id).toBe("backstitch");
    ed.store.setState({ momentaryTool: "pan" });
    expect(resolveTool(ed.state).id).toBe("pan");
  });

  it("labels keys as each computer's keyboard shows them: ⌘ ⌥ ⇧ on a Mac, Ctrl Alt Shift elsewhere", () => {
    expect(shortcutLabel("tool.select", "filledRect", false)).toBe("Shift+R");
    expect(keyNames(true)).toEqual({ alt: "⌥", undo: "⌘Z", redo: "⌘⇧Z", copy: "⌘C" });
    expect(keyNames(false)).toEqual({ alt: "Alt", undo: "Ctrl+Z", redo: "Ctrl+Y", copy: "Ctrl+C" });
  });

  it("works in a Ukrainian (or any non-Latin) layout: the physical key decides", () => {
    ed.shortcuts.keyDown(key("к", { code: "KeyR" }));
    expect(ed.state.tool).toBe("rect");
    ed.shortcuts.keyDown(key("К", { shift: true, code: "KeyR" }));
    expect(ed.state.tool).toBe("filledRect");
    ed.shortcuts.keyDown(key("у", { code: "KeyE" }));
    expect(ed.state.tool).toBe("eraser");
    ed.doc.layers.stitches[0] = red;
    ed.history.transaction("t", () => (ed.doc.layers.stitches[1] = red));
    ed.shortcuts.keyDown(key("я", { ctrl: true, code: "KeyZ" }));
    expect(ed.doc.layers.stitches[1]).toBe(0);
    // a Latin letter is taken as typed (AZERTY's A sits where QWERTY has Q)
    ed.shortcuts.keyDown(key("p", { code: "KeyR" }));
    expect(ed.state.tool).toBe("pencil");
  });

  it("Shift+1…5 sets the brush size (switching to Draw from a tool without a brush); 1–9 still pick key entries", () => {
    ed.setTool("picker");
    ed.shortcuts.keyDown(key("#", { shift: true, code: "Digit3" }));
    expect(ed.state.brush).toBe(3);
    expect(ed.state.tool).toBe("pencil");
    ed.setTool("eraser");
    ed.shortcuts.keyDown(key("%", { shift: true, code: "Digit5" }));
    expect([ed.state.brush, ed.state.tool]).toEqual([5, "eraser"]);
    ed.store.setState({ activeEntry: 0 });
    ed.shortcuts.keyDown(key("1", { code: "Digit1" }));
    expect([ed.state.activeEntry, ed.state.brush]).toEqual([red, 5]);
    expect(shortcutLabels("draw.pickBrush", 2, false)).toEqual(["Shift+2"]);
  });

  it("tells R from Shift+R and ignores keys while typing", () => {
    ed.shortcuts.keyDown(key("R", { shift: true }));
    expect(ed.state.tool).toBe("filledRect");
    ed.shortcuts.keyDown(key("r"));
    expect(ed.state.tool).toBe("rect");
    ed.shortcuts.keyDown(key("e", { inField: true }));
    expect(ed.state.tool).toBe("rect");
  });

  it("holding Alt picks; releasing returns to the pencil after picking while erasing", () => {
    ed.doc.layers.stitches[0] = red;
    ed.setTool("eraser");
    ed.store.setState({ activeEntry: 0 });
    ed.shortcuts.keyDown(key("Alt"));
    ed.shortcuts.keyDown(key("Alt", { repeat: true }));
    ed.tools.down(at(0, 0));
    expect(ed.state.activeEntry).toBe(red);
    expect(ed.state.tool).toBe("eraser");
    ed.shortcuts.keyUp(key("Alt"));
    expect(ed.state.tool).toBe("pencil");
  });

  it("Esc cancels a floating move before it deselects", () => {
    ed.doc.layers.stitches[0] = red;
    ed.selection.all();
    ed.shortcuts.keyDown(key("ArrowRight"));
    expect(ed.state.floating).not.toBeNull();
    ed.shortcuts.keyDown(key("Escape"));
    expect(ed.state.floating).toBeNull();
    expect(ed.doc.layers.stitches[0]).toBe(red);
    ed.selection.all();
    ed.shortcuts.keyDown(key("Escape"));
    expect(ed.state.selection).toBeNull();
  });
});

describe("selection", () => {
  it("flips, replaces keys in and crops to the selection", async () => {
    const half = addEntry(ed.doc, { t: "thread", src: "dmc:321", n: 2, st: "half" }, ALL_SYMBOLS);
    ed.changed({ keys: true });
    ed.doc.layers.stitches.set([half, red], 11);
    ed.selection.selectRect({ x: 1, y: 1, w: 2, h: 1 }, false);
    await ed.commands.run("selection.flipH");
    expect(ed.doc.key[ed.doc.layers.stitches[12]!]).toMatchObject({ st: "halfb" });
    expect(ed.doc.layers.stitches[11]).toBe(red);
    await ed.commands.run("selection.replaceKey", { from: red, to: half });
    expect(ed.doc.layers.stitches[11]).toBe(half);
    ed.selection.selectSame({ x: 1, y: 1 }, true, false);
    await ed.commands.run("selection.crop");
    expect([ed.doc.w, ed.doc.h]).toEqual([1, 1]);
  });

  it("moves the selection as one undo step and pastes into another pattern", () => {
    ed.doc.layers.stitches[0] = red;
    ed.selection.selectRect({ x: 0, y: 0, w: 1, h: 1 }, false);
    ed.selection.nudge(2, 1);
    ed.selection.commitFloating();
    expect(ed.doc.layers.stitches[12]).toBe(red);
    expect(ed.doc.layers.stitches[0]).toBe(0);
    ed.selection.copy();
    ed.history.undo();
    expect(ed.doc.layers.stitches[0]).toBe(red);

    loadPattern(ed, createPattern(5, 5));
    ed.store.setState({ hoverCell: { x: 1, y: 1 } });
    ed.selection.paste();
    ed.selection.commitFloating();
    const k = ed.doc.layers.stitches[6]!;
    expect(ed.doc.key[k]).toMatchObject({ src: "dmc:321", st: "full" });
  });
});
