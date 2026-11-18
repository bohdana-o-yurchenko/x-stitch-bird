import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UnderlayData } from "@/core/underlay/underlay";
import { testEditor } from "../../../tests/support/editorHarness";

const imgs = vi.hoisted(() => ({ size: { naturalWidth: 400, naturalHeight: 200 } as { naturalWidth: number; naturalHeight: number } | null }));
vi.mock("@/platform/images", () => ({ loadImage: vi.fn(async () => { if (!imgs.size) throw new Error("bad"); return { ...imgs.size }; }), canvasToBlob: vi.fn(), downscaleToBlob: vi.fn() }));
const straightened = vi.hoisted(() => ({ calls: [] as unknown[] }));
vi.mock("../heavy", () => ({ runStraighten: vi.fn(async (job: unknown) => (straightened.calls.push(job), new Blob(["flat"], { type: "image/png" }))), runImageToPattern: vi.fn(), runFindBlends: vi.fn() }));

const stored = (o: Partial<UnderlayData> = {}): UnderlayData => ({ image: "img:1", imageW: 100, imageH: 100, crop: { x: 0, y: 0, w: 100, h: 100 }, rect: { x: 2, y: 2, w: 5, h: 5 }, opacity: 0.5, behind: true, visible: true, tool: "move", ...o });
const SAVE = 700;

function setup() {
  const t = testEditor(10, 10);
  const saves: (UnderlayData | null)[] = [];
  t.ed.persistence.underlays.save = async (_id, u) => (saves.push(u), { ok: true });
  t.ed.viewport.setSize(800, 600);
  return { ...t, saves };
}
const ready = async (t: ReturnType<typeof setup>, u: UnderlayData | null = stored()) => {
  t.ed.persistence.underlays.load = async () => u;
  await t.ed.underlay.switchTo(t.ed.doc.id, null);
  t.saves.length = 0;
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  imgs.size = { naturalWidth: 400, naturalHeight: 200 };
  straightened.calls = [];
});
afterEach(() => vi.useRealTimers());

describe("changes are kept for the pattern, soon, and only when it is ready", () => {
  it("a change is saved a moment after the last one, once", async () => {
    const t = setup();
    await ready(t);
    t.ed.underlay.nudge(1, 0);
    t.ed.underlay.nudge(1, 0);
    expect(t.saves).toHaveLength(0);
    vi.advanceTimersByTime(SAVE);
    expect(t.saves).toHaveLength(1);
    expect(t.saves[0]!.rect.x).toBe(4);
  });

  it("nothing is saved while the pattern's own image is still loading (it would overwrite it with nothing)", async () => {
    const t = setup();
    t.ed.store.setState({ underlay: stored() });
    t.ed.underlay.nudge(1, 0);
    vi.advanceTimersByTime(SAVE * 2);
    expect(t.saves).toHaveLength(0);
  });

  it("a change waiting is saved at once before another pattern's image is loaded", async () => {
    const t = setup();
    await ready(t);
    t.ed.underlay.nudge(1, 0);
    await t.ed.underlay.switchTo("other", null);
    expect(t.saves.length).toBeGreaterThanOrEqual(1);
    expect(t.saves[0]!.rect.x).toBe(3);
  });

  it("an image that came with a loaded file is saved to the pattern; one read from storage isn't saved again", async () => {
    const t = setup();
    await t.ed.underlay.switchTo(t.ed.doc.id, stored({ image: "data:image/png;base64,iVBORw0KGgo=" }));
    vi.advanceTimersByTime(SAVE);
    expect(t.saves).toHaveLength(1);
    expect(t.saves[0]!.image).toMatch(/^img:/);
    t.saves.length = 0;
    await ready(t);
    vi.advanceTimersByTime(SAVE * 2);
    expect(t.saves).toHaveLength(0);
  });

  it("when another pattern was opened meanwhile, the slow one's image is not shown", async () => {
    const t = setup();
    let release!: (u: UnderlayData | null) => void;
    t.ed.persistence.underlays.load = () => new Promise((r) => (release = r));
    const first = t.ed.underlay.switchTo("a", null);
    t.ed.persistence.underlays.load = async () => null;
    await t.ed.underlay.switchTo("b", null);
    release(stored());
    await first;
    expect(t.ed.state.underlay).toBeNull();
  });

  it("a store that is full says so", async () => {
    const t = setup();
    await ready(t);
    t.ed.persistence.underlays.save = async () => ({ ok: false, reason: "quota" });
    t.ed.underlay.nudge(1, 0);
    vi.advanceTimersByTime(SAVE);
    await vi.advanceTimersByTimeAsync(0);
    expect(t.lastToast()).toBe("toasts.refsTooBig");
  });

  it("flush saves what is waiting and nothing otherwise", async () => {
    const t = setup();
    await ready(t);
    t.ed.underlay.flush();
    expect(t.saves).toHaveLength(0);
    t.ed.underlay.nudge(1, 0);
    t.ed.underlay.flush();
    expect(t.saves).toHaveLength(1);
  });
});

describe("adding a photo behind the chart", () => {
  const file = new File(["x"], "photo.jpg", { type: "image/jpeg" });

  it("is stored as it came, fitted to the chart in edit mode, and the straighten dialog opens", async () => {
    const t = setup();
    await ready(t, null);
    await t.ed.underlay.addFromFile(file);
    const u = t.ed.state.underlay!;
    expect(u).toMatchObject({ image: expect.stringMatching(/^img:/), imageW: 400, imageH: 200, behind: false });
    expect(t.ed.state.dialog).toMatchObject({ type: "straighten" });
    expect(t.ed.state.pendingTip).toBe("underlay");
    vi.advanceTimersByTime(SAVE);
    expect(t.saves).toHaveLength(1);
  });

  it("a file that isn't a picture is a message and changes nothing", async () => {
    const t = setup();
    await ready(t);
    imgs.size = null;
    await t.ed.underlay.addFromFile(file);
    expect(t.lastToast()).toBe("toasts.badImage");
    expect(t.ed.state.underlay).toMatchObject({ image: "img:1" });
  });

  it("a very large photo the user doesn't want is not added", async () => {
    const t = setup();
    await ready(t, null);
    imgs.size = { naturalWidth: 9000, naturalHeight: 9000 };
    const added = t.ed.underlay.addFromFile(file);
    await vi.advanceTimersByTimeAsync(0);
    (t.ed.state.dialog as unknown as { answer(v: boolean): void }).answer(false);
    await added;
    expect(t.ed.state.underlay).toBeNull();
  });

  it("replacing keeps where the old one was and how see-through it was, with the new photo's proportions", async () => {
    const t = setup();
    await ready(t, stored({ rect: { x: 3, y: 4, w: 6, h: 6 }, opacity: 0.8 }));
    await t.ed.underlay.addFromFile(file, true);
    expect(t.ed.state.underlay).toMatchObject({ opacity: 0.8, rect: { x: 3, y: 4, w: 6, h: 3 } });
  });
});

describe("placing and editing it", () => {
  it("edit mode is when it is shown and not behind; going behind forgets the image's own undo", async () => {
    const t = setup();
    await ready(t);
    expect(t.ed.underlay.editing).toBe(false);
    t.ed.underlay.setBehind(false);
    expect(t.ed.underlay.editing).toBe(true);
    t.ed.underlay.nudge(1, 0);
    t.ed.underlay.setBehind(true);
    t.ed.underlay.undo();
    expect(t.ed.state.underlay!.rect.x).toBe(3);
  });

  it("each placement change can be undone, in order", async () => {
    const t = setup();
    await ready(t);
    t.ed.underlay.nudge(1, 0);
    t.ed.underlay.nudge(0, 2);
    t.ed.underlay.undo();
    expect(t.ed.state.underlay!.rect).toMatchObject({ x: 3, y: 2 });
    t.ed.underlay.undo();
    expect(t.ed.state.underlay!.rect).toMatchObject({ x: 2, y: 2 });
    t.ed.underlay.undo();
    expect(t.ed.state.underlay!.rect).toMatchObject({ x: 2, y: 2 });
  });

  it("only the last 50 are remembered", async () => {
    const t = setup();
    await ready(t);
    for (let i = 0; i < 60; i++) t.ed.underlay.nudge(1, 0);
    for (let i = 0; i < 60; i++) t.ed.underlay.undo();
    expect(t.ed.state.underlay!.rect.x).toBe(2 + 10);
  });

  it("fit puts it over the chart, reset crop shows the whole picture, remove takes it away", async () => {
    const t = setup();
    await ready(t, stored({ rect: { x: 7, y: 7, w: 1, h: 1 }, crop: { x: 10, y: 10, w: 50, h: 50 } }));
    t.ed.underlay.fit();
    expect(t.ed.state.underlay!.rect).toMatchObject({ x: 0, y: 0 });
    t.ed.underlay.resetCrop();
    expect(t.ed.state.underlay!.crop).toEqual({ x: 0, y: 0, w: 100, h: 100 });
    t.ed.setActiveEntry(t.red);
    t.ed.underlay.remove();
    expect(t.ed.state.underlay).toBeNull();
    vi.advanceTimersByTime(SAVE);
    expect(t.saves.at(-1)).toBeNull();
  });

  it("removing it while Autofill is the tool goes back to the pencil (Autofill needs the photo)", async () => {
    const t = setup();
    await ready(t);
    t.ed.store.setState({ tool: "autofill" });
    t.ed.underlay.remove();
    expect(t.ed.state.tool).toBe("pencil");
  });

  it("with nothing behind the chart every call is quiet", async () => {
    const t = setup();
    await ready(t, null);
    const u = t.ed.underlay;
    expect(() => (u.nudge(1, 1), u.fit(), u.resetCrop(), u.rotate(1), u.setRotation(5), u.undo(), u.update({ opacity: 1 }), u.pointerDown({ x: 1, y: 1 }, { x: 1, y: 1 }))).not.toThrow();
    expect(t.ed.state.underlay).toBeNull();
    expect(u.rotateButtons()).toEqual([]);
    expect(u.frame()).toBeNull();
  });

  it("an exact angle is kept within ±45°, and a nonsense one is ignored", async () => {
    const t = setup();
    await ready(t);
    t.ed.underlay.setRotation(10);
    expect(t.ed.state.underlay!.rotation).toBeCloseTo(10);
    t.ed.underlay.setRotation(90);
    expect(Math.abs(t.ed.state.underlay!.rotation!)).toBeLessThanOrEqual(45);
    t.ed.underlay.setRotation(NaN);
    expect(Math.abs(t.ed.state.underlay!.rotation!)).toBeLessThanOrEqual(45);
    t.ed.underlay.setRotation(Infinity);
    expect(Number.isFinite(t.ed.state.underlay!.rotation)).toBe(true);
  });

  it("a small step turns it, and turning undoes with the rest", async () => {
    const t = setup();
    await ready(t);
    t.ed.underlay.rotate(1);
    const turned = t.ed.state.underlay!.rotation!;
    expect(turned).toBeGreaterThan(0);
    t.ed.underlay.undo();
    expect(t.ed.state.underlay!.rotation ?? 0).toBe(0);
  });
});

describe("dragging it with the pointer", () => {
  it("pressing inside moves it; releasing saves; a press with nothing under it does nothing", async () => {
    const t = setup();
    await ready(t, stored({ behind: false }));
    t.ed.viewport.setSize(800, 600);
    t.ed.underlay.pointerDown({ x: 4, y: 4 }, { x: 100, y: 100 });
    t.ed.underlay.pointerMove({ x: 5, y: 4 }, { x: 120, y: 100 }, false);
    expect(t.ed.state.underlay!.rect.x).toBe(3);
    expect(t.saves).toHaveLength(0);
    t.ed.underlay.pointerUp();
    vi.advanceTimersByTime(SAVE);
    expect(t.saves).toHaveLength(1);
    t.saves.length = 0;
    t.ed.underlay.pointerDown({ x: 50, y: 50 }, { x: 1, y: 1 });
    t.ed.underlay.pointerMove({ x: 51, y: 50 }, { x: 5, y: 1 }, false);
    t.ed.underlay.pointerUp();
    vi.advanceTimersByTime(SAVE);
    expect(t.saves).toHaveLength(0);
  });

  it("a release with no press does nothing", async () => {
    const t = setup();
    await ready(t, stored({ behind: false }));
    t.ed.underlay.pointerUp();
    vi.advanceTimersByTime(SAVE);
    expect(t.saves).toHaveLength(0);
  });
});

describe("straightening a photo by its four corners (SPEC §15.15)", () => {
  const corners = [{ x: 10, y: 10 }, { x: 90, y: 12 }, { x: 88, y: 90 }, { x: 8, y: 88 }] as never;

  it("starts from the photo as it is, then from the original and the corners it was made with", async () => {
    const t = setup();
    await ready(t);
    expect(t.ed.underlay.straightenStart()).toMatchObject({ source: "img:1", sourceW: 100, cols: 10, rows: 10 });
    t.ed.images.put = async () => "img:flat";
    t.ed.images.blob = async () => new Blob(["orig"]);
    await t.ed.underlay.straighten({ corners, cols: 8, rows: 6, at: { x: 1, y: 2 } });
    expect(t.ed.underlay.straightenStart()).toMatchObject({ source: "img:1", cols: 8, rows: 6, at: { x: 1, y: 2 } });
  });

  it("the flat picture takes the cells it stands for; the original stays, so it can be redone", async () => {
    const t = setup();
    await ready(t, stored({ rotation: 3 }));
    t.ed.images.blob = async () => new Blob(["orig"]);
    t.ed.images.put = async () => "img:flat";
    await t.ed.underlay.straighten({ corners, cols: 8, rows: 6, at: { x: 1, y: 2 } });
    const u = t.ed.state.underlay!;
    expect(u).toMatchObject({ image: "img:flat", rect: { x: 1, y: 2, w: 8, h: 6 }, rotation: 0, visible: true, straighten: { source: "img:1", cols: 8, rows: 6 } });
    expect(u.crop).toEqual({ x: 0, y: 0, w: u.imageW, h: u.imageH });
    expect(straightened.calls).toHaveLength(1);
    expect(t.lastToast()).toBe("toasts.straightened");
    vi.advanceTimersByTime(SAVE);
    expect(t.saves.at(-1)!.straighten!.source).toBe("img:1");
  });

  it("a second time starts again from the original, not from the flat picture", async () => {
    const t = setup();
    await ready(t);
    t.ed.images.blob = vi.fn(async () => new Blob(["orig"]));
    t.ed.images.put = async () => "img:flat";
    await t.ed.underlay.straighten({ corners, cols: 8, rows: 6, at: { x: 0, y: 0 } });
    await t.ed.underlay.straighten({ corners, cols: 9, rows: 9, at: { x: 0, y: 0 } });
    expect(vi.mocked(t.ed.images.blob).mock.calls.map((c) => c[0])).toEqual(["img:1", "img:1"]);
  });

  it("when the original is gone it says so and changes nothing", async () => {
    const t = setup();
    await ready(t);
    t.ed.images.blob = async () => null;
    await t.ed.underlay.straighten({ corners, cols: 8, rows: 6, at: { x: 0, y: 0 } });
    expect(t.lastToast()).toBe("toasts.badImage");
    expect(t.ed.state.underlay!.image).toBe("img:1");
    expect(straightened.calls).toHaveLength(0);
  });
});

describe("the edit frame, when zoomed in (SPEC §15.15)", () => {
  // 800 × 600 canvas, rulers of 26 px; offsets 0, so the view starts at grid 0, 0
  const at = async (rect: UnderlayData["rect"], zoom: number) => {
    const t = setup();
    await ready(t, stored({ rect, behind: false }));
    t.ed.store.setState({ viewport: { zoom, offX: 0, offY: 0 } });
    return t;
  };

  it("not shown when the whole image is in view, nor when it is off to one side", async () => {
    expect((await at({ x: 100, y: 60, w: 180, h: 160 }, 2)).ed.underlay.frame()).toBeNull();
    expect((await at({ x: 0, y: 0, w: 10, h: 10 }, 20)).ed.underlay.frame()).toBeNull();
  });

  it("shown when the image is under the middle with one of its corners in view: the sides' handles are out of reach", async () => {
    expect((await at({ x: 10, y: 10, w: 100, h: 80 }, 20)).ed.underlay.frame()).not.toBeNull();
  });

  it("shown when only one side is cut off: that side's handle is out of reach", async () => {
    const t = await at({ x: 5, y: 5, w: 50, h: 20 }, 20);
    expect(t.ed.underlay.frame()).not.toBeNull();
    // its own rotate buttons and the other handles are still there, beside the frame's
    expect(t.ed.underlay.rotateButtons()).toHaveLength(4);
  });

  it("stays as it was while a drag is under way, so it never flickers", async () => {
    const t = await at({ x: 100, y: 60, w: 180, h: 160 }, 2);
    t.ed.underlay.pointerDown({ x: 280, y: 140 }, { x: 586, y: 306 });
    t.ed.underlay.pointerMove({ x: 400, y: 140 }, { x: 826, y: 306 }, false);
    expect(t.ed.state.underlay!.rect.w).toBeGreaterThan(180);
    expect(t.ed.underlay.frame()).toBeNull();
    t.ed.underlay.pointerUp();
    expect(t.ed.underlay.frame()).not.toBeNull();
  });
});
