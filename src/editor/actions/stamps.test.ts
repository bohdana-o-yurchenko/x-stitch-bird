import { describe, expect, it } from "vitest";
import { at, testEditor } from "../../../tests/support/editorHarness";
import { commitEntry, draftFor } from "./keyEntries";
import { addOwnStamp } from "./stamps";

const tick = { name: "Tick", w: 1, h: 1, lines: [{ x1: 0, y1: 0.5, x2: 0.5, y2: 1 }, { x1: 0.5, y1: 1, x2: 1, y2: 0 }] };

describe("stamps in the key", () => {
  it("a backstitch entry made with a stamp places stamps", () => {
    const { ed } = testEditor(10, 10);
    const k = commitEntry(ed, { ...draftFor(ed), t: "back", n: 1, sym: "line:solid", stamp: "smyrna1" })!;
    expect(ed.doc.key[k]!.stamp).toBe("smyrna1");
    ed.tools.down(at(3, 3));
    ed.tools.up(at(3, 3));
    expect(ed.doc.layers.stamps).toHaveLength(1);
    expect(draftFor(ed, k).stamp).toBe("smyrna1");
  });

  it("one's own stamp is kept in the pattern once, however often it's drawn the same", () => {
    const { ed } = testEditor();
    const a = addOwnStamp(ed, tick), b = addOwnStamp(ed, { ...tick, name: "Tick 2" });
    expect(a).toMatch(/^own:/);
    expect(b).toBe(a);
    expect(Object.keys(ed.doc.stamps!)).toEqual([a]);
    expect(ed.doc.stamps![a]!.name).toBe("Tick 2");
  });

  it("a drawing with nothing in it isn't kept", () => {
    const { ed } = testEditor();
    expect(addOwnStamp(ed, { ...tick, lines: [] })).toBe("");
    expect(ed.doc.stamps ?? {}).toEqual({});
  });

  it("an entry with stamps on the chart keeps its stamp, and doesn't turn into plain lines", () => {
    const { ed, lastToast } = testEditor(10, 10);
    const k = commitEntry(ed, { ...draftFor(ed), t: "back", n: 1, sym: "line:solid", stamp: "smyrna2" })!;
    ed.tools.down(at(3, 3));
    ed.tools.up(at(3, 3));
    expect(commitEntry(ed, { ...draftFor(ed, k), stamp: "smyrna1" }, k)).toBeNull();
    expect(lastToast()).toBe("keyDialog.layerLocked");
    expect(commitEntry(ed, { ...draftFor(ed, k), stamp: "" }, k)).toBeNull();
    // its colour may change
    expect(commitEntry(ed, { ...draftFor(ed, k), thread: "dmc:321" }, k)).toBe(k);
  });

  it("not yet on the chart, it may switch between lines and stamps freely", () => {
    const { ed } = testEditor();
    const k = commitEntry(ed, { ...draftFor(ed), t: "back", n: 1, sym: "line:solid", stamp: "smyrna2" })!;
    expect(commitEntry(ed, { ...draftFor(ed, k), stamp: "" }, k)).toBe(k);
    expect(ed.doc.key[k]!.stamp).toBeUndefined();
  });
});
