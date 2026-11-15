import { beforeEach, describe, expect, it } from "vitest";
import { createPattern } from "@/core/pattern/createPattern";
import { addEntry } from "@/core/pattern/keyEntries";
import { ALL_SYMBOLS } from "@/core/symbols/symbols";
import { memoryPersistence } from "../../../tests/support/memoryPersistence";
import { loadPattern } from "../actions/pattern";
import { Editor } from "../createEditor";
import { WorkTimer } from "./WorkTimer";

const MIN = 60_000;
let ed: Editor, clock: number, timer: WorkTimer;
const at = (t: number) => {
  clock = t;
  timer.activity();
};

beforeEach(() => {
  ed = new Editor(memoryPersistence(), false);
  ed.store.setState({ symbols: [...ALL_SYMBOLS] });
  loadPattern(ed, createPattern(10, 10));
  clock = 0;
  timer = new WorkTimer(ed, () => clock);
});

describe("work timer (SPEC §15.17)", () => {
  it("runs while actions keep coming and stops after 3 idle minutes, without counting the pause", () => {
    at(0);
    at(1 * MIN);
    at(2.5 * MIN);
    expect(ed.doc.spent).toBe(2.5 * MIN);
    expect(timer.running).toBe(true);
    clock = 6 * MIN;
    expect(timer.running).toBe(false);
    at(20 * MIN); // back after a break: starts again from here
    at(21 * MIN);
    expect(ed.doc.spent).toBe(3.5 * MIN);
  });

  it("counts for the open pattern only and starts afresh after switching", () => {
    at(0);
    at(MIN);
    const first = ed.doc;
    loadPattern(ed, createPattern(5, 5));
    at(1.5 * MIN);
    at(2 * MIN);
    expect([first.spent, ed.doc.spent]).toEqual([MIN, 0.5 * MIN]);
  });

  it("is not part of undo, and restoring an earlier version keeps the time spent", async () => {
    const red = addEntry(ed.doc, { t: "thread", src: "dmc:321", n: 2, st: "full" }, ALL_SYMBOLS);
    ed.changed({ keys: true });
    await ed.snapshots.take("timer");
    at(0);
    at(2 * MIN);
    ed.history.transaction("paint", () => void (ed.doc.layers.stitches[0] = red));
    ed.history.undo();
    expect(ed.doc.spent).toBe(2 * MIN);
    const [version] = await ed.snapshots.list();
    await ed.snapshots.restore(version!.time);
    expect(ed.doc.spent).toBe(2 * MIN);
  });
});
