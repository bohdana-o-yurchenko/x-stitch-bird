import { beforeEach, describe, expect, it, vi } from "vitest";
import { serializePattern, type PatternFile } from "@/core/formats/json/serialize";
import { createPattern } from "@/core/pattern/createPattern";
import { addEntry } from "@/core/pattern/keyEntries";
import { ALL_SYMBOLS } from "@/core/symbols/symbols";
import type { Snapshot } from "@/persistence/ports";
import { memoryPersistence } from "../../../tests/support/memoryPersistence";

/*
 * Versions of one pattern from every device in one history (SPEC §15.34, §15.7), and what happens when the browser's
 * storage refuses one. The account is replaced.
 */
const remote = vi.hoisted(() => ({ list: vi.fn(), get: vi.fn(), add: vi.fn() }));
vi.mock("@/persistence", async (orig) => ({ ...(await orig<typeof import("@/persistence")>()), versionApi: remote }));

const { loadPattern } = await import("../actions/pattern");
const { Editor } = await import("../createEditor");

const HOUR = 3_600_000;
let ed: InstanceType<typeof Editor>, snaps: Snapshot[], id: string, now: number;
const file = (name: string, stitched = 0): PatternFile => {
  const p = createPattern(10, 10, name);
  p.id = id;
  const k = addEntry(p, { t: "thread", src: "dmc:321", n: 2, st: "full" }, ALL_SYMBOLS);
  for (let i = 0; i < stitched; i++) p.layers.stitches[i] = k;
  return serializePattern(p);
};
const stored = (time: number, reason = "timer", doc = file("Old")): Snapshot => ({ projectId: id, time, reason, w: 10, h: 10, data: JSON.stringify(doc), thumb: null }) as Snapshot;

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  now = 1_800_000_000_000;
  vi.setSystemTime(now);
  snaps = [];
  ed = new Editor(memoryPersistence(snaps), false);
  ed.store.setState({ symbols: [...ALL_SYMBOLS], account: { id: "u" } as never });
  const p = createPattern(10, 10, "Rose");
  loadPattern(ed, p);
  id = ed.doc.id;
  remote.list.mockResolvedValue([]);
  remote.get.mockResolvedValue([]);
  remote.add.mockResolvedValue(true);
});

describe("bringing the devices' versions together", () => {
  it("does nothing signed out, or when the account can't be reached", async () => {
    ed.store.setState({ account: null as never });
    await ed.snapshots.sync();
    expect(remote.list).not.toHaveBeenCalled();
    ed.store.setState({ account: { id: "u" } as never });
    remote.list.mockResolvedValue(null);
    snaps.push(stored(now - 1000));
    await ed.snapshots.sync();
    expect(remote.add).not.toHaveBeenCalled();
  });

  it("sends up the versions only this browser has, and brings down only the account's own", async () => {
    snaps.push(stored(now - 2 * 60_000, "resize"));
    remote.list.mockResolvedValue([{ time: now - 60_000, reason: "otherDevice" }]);
    remote.get.mockResolvedValue([{ time: now - 60_000, reason: "otherDevice", doc: file("Other", 2) }]);
    await ed.snapshots.sync();
    expect(remote.add).toHaveBeenCalledTimes(1);
    expect(remote.add).toHaveBeenCalledWith(id, [expect.objectContaining({ time: now - 2 * 60_000, reason: "resize" })]);
    expect(remote.get).toHaveBeenCalledWith(id, [now - 60_000]);
    expect(snaps.map((s) => s.reason).sort()).toEqual(["otherDevice", "resize"]);
  });

  it("a version both have goes nowhere", async () => {
    snaps.push(stored(now - 60_000));
    remote.list.mockResolvedValue([{ time: now - 60_000, reason: "timer" }]);
    await ed.snapshots.sync();
    expect(remote.add).not.toHaveBeenCalled();
    expect(remote.get).not.toHaveBeenCalled();
  });

  it("versions the history would thin away aren't passed back and forth", async () => {
    const old = now - 40 * 24 * HOUR;
    const recent = Array.from({ length: 10 }, (_, i) => now - (i + 1) * 60_000);
    snaps.push(...recent.map((t) => stored(t)), stored(old));
    remote.list.mockResolvedValue([...recent.map((time) => ({ time, reason: "timer" })), { time: old - 1, reason: "timer" }]);
    await ed.snapshots.sync();
    expect(remote.add).not.toHaveBeenCalled();
    expect(remote.get).not.toHaveBeenCalled();
  });

  it("stops at the first upload the account refuses or can't take, keeping what is here", async () => {
    snaps.push(stored(now - 3 * 60_000), stored(now - 2 * 60_000));
    remote.add.mockResolvedValueOnce(false);
    await ed.snapshots.sync();
    expect(remote.add).toHaveBeenCalledTimes(1);
    remote.add.mockRejectedValueOnce(new Error("offline"));
    await ed.snapshots.sync();
    expect(snaps).toHaveLength(2);
  });

  it("fetches the account's versions ten at a time, and says the list changed", async () => {
    const times = Array.from({ length: 23 }, (_, i) => now - (i + 1) * HOUR);
    remote.list.mockResolvedValue(times.map((time) => ({ time, reason: "x" })));
    remote.get.mockImplementation(async (_id: string, t: number[]) => t.map((time) => ({ time, reason: "x", doc: file("R") })));
    const before = ed.state.versionsRevision;
    await ed.snapshots.sync();
    expect(remote.get.mock.calls.map((c) => c[1].length)).toEqual([10, 10, 3]);
    expect(snaps).toHaveLength(23);
    expect(ed.state.versionsRevision).toBe(before + 1);
  });

  it("a fetch that fails leaves what came so far and no false 'changed'", async () => {
    const times = Array.from({ length: 12 }, (_, i) => now - (i + 1) * HOUR);
    remote.list.mockResolvedValue(times.map((time) => ({ time, reason: "x" })));
    remote.get.mockResolvedValueOnce(times.slice(0, 10).map((time) => ({ time, reason: "x", doc: file("R") }))).mockResolvedValueOnce(null);
    const before = ed.state.versionsRevision;
    await ed.snapshots.sync();
    expect(snaps).toHaveLength(10);
    expect(ed.state.versionsRevision).toBe(before);
  });
});

describe("keeping a version of another device", () => {
  it("the one not chosen in a conflict is kept here with its reason, and the list says so", async () => {
    const before = ed.state.versionsRevision;
    await ed.snapshots.addVersion(file("Theirs", 2), "otherDevice");
    expect((await ed.snapshots.list()).map((s) => s.reason)).toEqual(["otherDevice"]);
    expect(ed.state.versionsRevision).toBe(before + 1);
  });

  it("two kept in the same millisecond don't overwrite each other", async () => {
    await ed.snapshots.addVersion(file("A", 1), "otherDevice");
    await ed.snapshots.addVersion(file("B", 2), "otherDevice");
    await ed.snapshots.take("timer");
    await ed.snapshots.take("timer");
    expect(new Set(snaps.map((s) => s.time)).size).toBe(4);
  });
});

describe("files and storage trouble", () => {
  it("a version that can't be read is skipped, the rest are kept", async () => {
    await ed.snapshots.importFile(id, [
      { time: now - 5000, reason: "ok", doc: file("Fine") },
      { time: now - 4000, reason: "bad", doc: { ...file("X"), xbird: 999 } },
    ]);
    expect(snaps.map((s) => s.reason)).toEqual(["ok"]);
  });

  it("exporting skips a version whose text is damaged, oldest first", async () => {
    snaps.push(stored(now - 1000, "b"), { ...stored(now - 2000, "broken"), data: "{nope" }, stored(now - 3000, "a"));
    expect((await ed.snapshots.exportFile()).map((v) => v.reason)).toEqual(["a", "b"]);
  });

  it("when storage is full, the oldest versions go to make room and the new one is kept", async () => {
    const repo = ed.persistence.snapshots;
    for (let i = 1; i <= 12; i++) snaps.push(stored(now - i * 60_000, `old${i}`));
    const realAdd = repo.add.bind(repo);
    let first = true;
    repo.add = async (s) => {
      if (first) {
        first = false;
        throw new DOMException("full", "QuotaExceededError");
      }
      return realAdd(s);
    };
    await ed.snapshots.take("fresh");
    expect(snaps.some((s) => s.reason === "fresh")).toBe(true);
    expect(snaps.some((s) => s.reason === "old12")).toBe(false);
    expect(snaps.some((s) => s.reason === "old1")).toBe(true);
  });

  it("restoring a version that is gone does nothing, not even a new version", async () => {
    await ed.snapshots.restore(12345);
    expect(snaps).toHaveLength(0);
    expect(ed.doc.name).toBe("Rose");
  });

  it("restoring keeps the time spent so far when the version had less", async () => {
    snaps.push(stored(now - 1000, "timer", file("Back")));
    ed.doc.spent = 900_000;
    await ed.snapshots.restore(now - 1000);
    expect(ed.doc.name).toBe("Back");
    expect(ed.doc.spent).toBe(900_000);
  });
});
