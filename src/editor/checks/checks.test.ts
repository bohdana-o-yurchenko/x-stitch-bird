import { beforeEach, describe, expect, it } from "vitest";
import { testEditor } from "../../../tests/support/editorHarness";
import { visibleFindings } from "./checks";

let t: ReturnType<typeof testEditor>;
const all = { holes: { on: true, max: 3 }, lone: { on: true, max: 1, alone: true }, symmetry: { on: false } } as const;

beforeEach(() => {
  t = testEditor(8, 8);
  t.ed.viewport.setSize(400, 400);
  // a red block with two holes, and a lone blue stitch on the fabric
  for (let y = 1; y < 6; y++) for (let x = 1; x < 6; x++) t.ed.doc.layers.stitches[y * 8 + x] = t.red;
  t.ed.doc.layers.stitches[2 * 8 + 2] = 0;
  t.ed.doc.layers.stitches[4 * 8 + 4] = 0;
  t.entry({ t: "thread", src: "dmc:797", n: 2, st: "full" });
  t.ed.doc.layers.stitches[7 * 8 + 7] = t.ed.state.activeEntry;
  t.ed.changed();
});

describe("chart checks in the editor (SPEC §15.4)", () => {
  it("runs on demand and steps through the findings, wrapping around, centring the chart on each", async () => {
    const { ed } = t;
    await ed.commands.run("checks.run", all);
    expect(visibleFindings(ed.state.checks).map((f) => f.check)).toEqual(["holes", "holes", "lone"]);
    expect(ed.state.checks!.current).toBe(-1);
    await ed.commands.run("checks.next");
    expect(ed.state.checks!.current).toBe(0);
    expect(ed.state.flash?.cell).toBe(2 * 8 + 2);
    await ed.commands.run("checks.prev");
    expect(ed.state.checks!.current).toBe(2);
    await ed.commands.run("checks.next");
    expect(ed.state.checks!.current).toBe(0);
    await ed.commands.run("checks.go", 1);
    expect(ed.state.flash?.cell).toBe(4 * 8 + 4);
  });

  it("ignores a finding for the session, keeping the place in the list", async () => {
    const { ed } = t;
    await ed.commands.run("checks.run", all);
    await ed.commands.run("checks.go", 2);
    await ed.commands.run("checks.ignore", visibleFindings(ed.state.checks)[0]!.id);
    expect(visibleFindings(ed.state.checks)).toHaveLength(2);
    expect(visibleFindings(ed.state.checks)[ed.state.checks!.current]!.check).toBe("lone");
  });

  it("notices when the chart changed since the run, and closes", async () => {
    const { ed, drag } = t;
    await ed.commands.run("checks.run", all);
    expect(ed.state.checks!.revision).toBe(ed.state.docRevision);
    drag([0, 0]);
    expect(ed.state.checks!.revision).not.toBe(ed.state.docRevision);
    await ed.commands.run("checks.close");
    expect(ed.state.checks).toBeNull();
  });
});
