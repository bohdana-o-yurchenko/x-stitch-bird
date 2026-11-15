import { beforeEach, describe, expect, it } from "vitest";
import { createPattern } from "@/core/pattern/createPattern";
import { addEntry } from "@/core/pattern/keyEntries";
import { ALL_SYMBOLS } from "@/core/symbols/symbols";
import type { Snapshot } from "@/persistence/ports";
import { memoryPersistence } from "../../../tests/support/memoryPersistence";
import { parsePattern } from "@/core/formats/json/parse";
import { patternFile } from "../actions/importExport";
import { loadPattern } from "../actions/pattern";
import { Editor } from "../createEditor";

/** Versions of the open pattern (SPEC §15.7). */
let ed: Editor, snaps: Snapshot[], red: number;

beforeEach(() => {
  snaps = [];
  ed = new Editor(memoryPersistence(snaps), false);
  ed.store.setState({ symbols: [...ALL_SYMBOLS] });
  const p = createPattern(10, 10, "Rose");
  red = addEntry(p, { t: "thread", src: "dmc:321", n: 2, st: "full" }, ALL_SYMBOLS);
  loadPattern(ed, p);
});

describe("versions", () => {
  it("stores the pattern as it was, and lists only this pattern's versions", async () => {
    ed.doc.layers.stitches[0] = red;
    await ed.snapshots.take("timer");
    snaps.push({ ...snaps[0]!, projectId: "other", time: 1 });
    const list = await ed.snapshots.list();
    expect(list.map((s) => [s.reason, s.w, s.h])).toEqual([["timer", 10, 10]]);
    expect(JSON.parse(snaps[0]!.data)).toMatchObject({ app: "stitchwork", name: "Rose", id: ed.doc.id });
  });

  it("restoring keeps the pattern id and first saves the current state as a version", async () => {
    await ed.snapshots.take("timer");
    snaps[0]!.time -= 60_000;
    const [first] = await ed.snapshots.list();
    const id = ed.doc.id;
    ed.doc.layers.stitches[0] = red;
    ed.changed();
    await ed.snapshots.restore(first!.time);
    expect(ed.doc.id).toBe(id);
    expect(ed.doc.layers.stitches[0]).toBe(0);
    expect(snaps.map((s) => s.reason)).toEqual(["timer", "restore"]);
    expect(JSON.parse(snaps[1]!.data).s).not.toEqual(JSON.parse(snaps[0]!.data).s);
  });

  it("thins old versions out after each new one", async () => {
    const day = 24 * 3_600_000;
    for (let i = 1; i <= 15; i++) snaps.push({ ...{ projectId: ed.doc.id, reason: "timer", w: 10, h: 10, data: "{}", thumb: null }, time: Date.now() - 30 * day - i });
    await ed.snapshots.take("timer");
    expect(snaps.length).toBe(10);
  });
});

describe("versions in .xbird files", () => {
  it("travel with the pattern and join another browser's versions without duplicates", async () => {
    ed.doc.layers.stitches[0] = red;
    await ed.snapshots.take("resize");
    snaps[0]!.time -= 60_000;
    await ed.snapshots.take("timer");
    const file = JSON.parse(JSON.stringify(await patternFile(ed)));
    expect(file.versions.map((v: { reason: string }) => v.reason)).toEqual(["resize", "timer"]);
    expect(file.versions[0].doc).toMatchObject({ app: "stitchwork", id: ed.doc.id });

    const elsewhere: Snapshot[] = [];
    const other = new Editor(memoryPersistence(elsewhere), false);
    other.store.setState({ symbols: [...ALL_SYMBOLS] });
    const { pattern, versions } = parsePattern(file, ALL_SYMBOLS);
    loadPattern(other, pattern);
    await other.snapshots.importFile(pattern.id, versions);
    await other.snapshots.importFile(pattern.id, versions);
    expect((await other.snapshots.list()).map((s) => s.reason)).toEqual(["timer", "resize"]);
    expect(JSON.parse(elsewhere.find((s) => s.reason === "resize")!.data).s).toEqual(file.versions[0].doc.s);
  });

  it("leave the file out when the pattern has none", async () => {
    expect(await patternFile(ed)).not.toHaveProperty("versions");
  });
});
