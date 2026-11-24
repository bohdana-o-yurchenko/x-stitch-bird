import { describe, expect, it } from "vitest";
import { createPattern } from "@/core/pattern/createPattern";
import { extractFragment, insertFragment } from "@/core/pattern/fragment";
import { ALL_SYMBOLS } from "@/core/symbols/symbols";
import { at, testEditor } from "../../../tests/support/editorHarness";

function setup(stamp = "smyrna2") {
  const t = testEditor(12, 10);
  const k = t.entry({ t: "back", src: "dmc:310", n: 1, stamp });
  t.ed.setTool("pencil");
  return { ...t, k, stamps: () => t.ed.doc.layers.stamps };
}

describe("placing stamps", () => {
  it("the draw tools place the active stamp entry as a block, its middle under the pointer", () => {
    const { ed, stamps, k } = setup();
    expect(ed.tools.resolve().id).toBe("stamp");
    ed.tools.down(at(4, 4));
    ed.tools.up(at(4, 4));
    expect(stamps()).toEqual([{ x: 4, y: 4, w: 2, h: 2, def: "smyrna2", k }]);
  });

  it("one click is one undo step", () => {
    const { ed, stamps } = setup();
    ed.tools.down(at(4, 4));
    ed.tools.up(at(4, 4));
    ed.history.undo();
    expect(stamps()).toEqual([]);
  });

  it("near the edge it stays inside the chart", () => {
    const { ed, stamps } = setup();
    ed.tools.down(at(11, 9));
    ed.tools.up(at(11, 9));
    expect(stamps()[0]).toMatchObject({ x: 10, y: 8 });
  });

  it("a drag places the next one only where it won't cover the last", () => {
    const { ed, stamps } = setup();
    ed.tools.down(at(0, 0));
    ed.tools.move(at(1, 0));
    ed.tools.move(at(2, 0));
    ed.tools.move(at(3, 0));
    ed.tools.move(at(4, 0));
    ed.tools.up(at(4, 0));
    expect(stamps().map((s) => s.x)).toEqual([0, 2, 4]);
  });

  it("the same block again keeps the stamp there, unless overriding", () => {
    const { ed, stamps, entry } = setup();
    ed.tools.down(at(4, 4));
    ed.tools.up(at(4, 4));
    const other = entry({ t: "back", src: "dmc:321", n: 1, stamp: "smyrna2" });
    ed.setTool("pencil");
    ed.tools.down(at(4, 4));
    ed.tools.up(at(4, 4));
    expect(stamps()).toHaveLength(1);
    ed.store.setState({ override: true });
    ed.tools.down(at(4, 4));
    ed.tools.up(at(4, 4));
    expect(stamps().map((s) => s.k)).toEqual([other]);
  });

  it("mirror mode places its mirror image too", () => {
    const { ed, stamps } = setup();
    ed.store.setState({ mirror: "vertical" });
    ed.tools.down(at(1, 4));
    ed.tools.up(at(1, 4));
    expect(stamps().map((s) => [s.x, s.y])).toEqual([[1, 4], [9, 4]]);
  });

  it("hovering shows the stamp's lines where a click would put them", () => {
    const { ed, k } = setup("smyrna1");
    ed.tools.move(at(2, 3));
    expect(ed.state.overlay.linePreview).toMatchObject({ key: k });
    expect(ed.state.overlay.linePreview!.lines).toHaveLength(4);
    expect(ed.state.overlay.hover).toBeNull();
    ed.tools.leave();
    expect(ed.state.overlay.linePreview).toBeNull();
  });

  it("the eraser takes a whole stamp; the picker picks its entry", () => {
    const { ed, stamps, k, red } = setup();
    ed.tools.down(at(4, 4));
    ed.tools.up(at(4, 4));
    ed.setActiveEntry(red);
    ed.setTool("picker");
    ed.tools.down(at(5, 5, { grid: { x: 5.2, y: 5.4 } }));
    expect(ed.state.activeEntry).toBe(k);
    ed.setTool("eraser");
    ed.tools.down(at(5, 5));
    ed.tools.up(at(5, 5));
    expect(stamps()).toEqual([]);
  });

  it("hiding backstitch hides stamps from the eraser too", () => {
    const { ed, stamps } = setup();
    ed.tools.down(at(4, 4));
    ed.tools.up(at(4, 4));
    ed.store.setState({ hiddenGroups: ["backstitch"] });
    ed.setTool("eraser");
    ed.tools.down(at(5, 5));
    ed.tools.up(at(5, 5));
    expect(stamps()).toHaveLength(1);
  });

  it("a piece cut out carries its stamps; a stamp drawn by the user goes along to another pattern", () => {
    const { ed } = setup();
    ed.doc.stamps = { "own:tick": { id: "own:tick", name: "Tick", w: 1, h: 1, lines: [{ x1: 0, y1: 0.5, x2: 0.5, y2: 1 }, { x1: 0.5, y1: 1, x2: 1, y2: 0 }] } };
    const own = ed.doc.key.findIndex((e) => e?.stamp === "smyrna2");
    ed.doc.key[own] = { ...ed.doc.key[own]!, stamp: "own:tick" };
    ed.changed({ keys: true });
    ed.tools.down(at(2, 2));
    ed.tools.up(at(2, 2));
    const piece = extractFragment(ed.doc, new Uint8Array(ed.doc.w * ed.doc.h).fill(1))!;
    const other = createPattern(6, 6);
    insertFragment(other, piece, { x: 0, y: 0 }, false, ALL_SYMBOLS);
    expect(other.stamps?.["own:tick"]?.lines).toHaveLength(2);
    expect(other.layers.stamps).toHaveLength(1);
    expect(other.key[other.layers.stamps[0]!.k]?.stamp).toBe("own:tick");
  });
});
