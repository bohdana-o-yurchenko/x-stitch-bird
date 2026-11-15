import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { testEditor } from "../../../tests/support/editorHarness";

let ed: ReturnType<typeof testEditor>["ed"];

beforeEach(async () => {
  vi.useFakeTimers();
  ed = testEditor().ed;
  await vi.runAllTimersAsync(); // the pattern's (empty) windows are loaded
});
afterEach(() => vi.useRealTimers());

describe("reference photo windows (SPEC §11)", () => {
  it("adds windows stepped across the screen, with the marker ready, and asks for the feature tip", () => {
    ed.references.add({ image: "img:1", name: "Chart scan" });
    ed.references.add({ image: "img:2", name: "Key", grid: true });
    const [a, b] = ed.state.references;
    expect(a).toMatchObject({ image: "img:1", name: "Chart scan", tool: "marker", min: false, grid: false, marks: null });
    expect(b).toMatchObject({ name: "Key", grid: true, y: a!.y + 28 });
    expect(a!.id).not.toBe(b!.id);
    expect(ed.state.pendingTip).toBe("reference");
  });

  it("saves a little after the last change, once, and at once when asked to flush", async () => {
    const save = vi.spyOn(ed.persistence.references, "save");
    ed.references.add({ image: "img:1", name: "A" });
    const id = ed.state.references[0]!.id;
    ed.references.update(id, { op: 0.5 });
    ed.references.update(id, { min: true });
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(800);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]![1]).toMatchObject([{ id, op: 0.5, min: true }]);
    ed.references.remove(id);
    ed.flush();
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1]![1]).toEqual([]);
    ed.flush(); // nothing new: no extra save
    expect(save).toHaveBeenCalledTimes(2);
  });

  it("warns once when the windows no longer fit in storage", async () => {
    vi.spyOn(ed.persistence.references, "save").mockResolvedValue({ ok: false, reason: "quota" });
    ed.references.add({ image: "img:1", name: "A" });
    await vi.advanceTimersByTimeAsync(800);
    ed.references.add({ image: "img:2", name: "B" });
    await vi.advanceTimersByTimeAsync(800);
    expect(ed.state.toasts.filter((x) => x.key === "toasts.refsTooBig")).toHaveLength(1);
  });

  it("switching patterns stores unsaved changes first and shows the other pattern's windows", async () => {
    const stored = [{ id: "r1", name: "Stored", image: "img:9" }, { id: "broken", name: "No picture", image: "" }];
    const save = vi.spyOn(ed.persistence.references, "save");
    vi.spyOn(ed.persistence.references, "load").mockResolvedValue(stored as never);
    ed.references.add({ image: "img:1", name: "A" });
    const first = ed.doc.id;
    await ed.references.switchTo("other-pattern", null);
    expect(save.mock.calls.map((c) => c[0])).toEqual([first]);
    expect(ed.state.references.map((r) => r.name)).toEqual(["Stored"]);
  });

  it("stores a window's marks as a picture, and null clears them", async () => {
    ed.references.add({ image: "img:1", name: "A" });
    const id = ed.state.references[0]!.id;
    await ed.references.setMarks(id, null);
    expect(ed.state.references[0]!.marks).toBeNull();
    await ed.references.setMarks("gone", null); // a closed window: ignored
    expect(ed.state.references).toHaveLength(1);
  });
});
