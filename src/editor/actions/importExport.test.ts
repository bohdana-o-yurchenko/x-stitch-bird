import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { serializePattern, XBIRD_VERSION } from "@/core/formats/json/serialize";
import { exportOxs } from "@/core/formats/oxs/exportOxs";
import { createPattern } from "@/core/pattern/createPattern";
import { addEntry } from "@/core/pattern/keyEntries";
import { ALL_SYMBOLS } from "@/core/symbols/symbols";
import type { PatternFile } from "@/core/formats/json/serialize";
import type { Snapshot } from "@/persistence/ports";
import { memoryPersistence } from "../../../tests/support/memoryPersistence";

const downloaded = vi.hoisted(() => ({ calls: [] as [string, string | Blob][], fail: false }));
vi.mock("@/platform/files", async (orig) => ({
  ...(await orig<typeof import("@/platform/files")>()),
  downloadFile: (name: string, data: string | Blob) => {
    if (downloaded.fail) throw new Error("blocked");
    downloaded.calls.push([name, data]);
  },
}));

const io = await import("./importExport");
const { loadPattern } = await import("./pattern");
const { Editor } = await import("../createEditor");

let ed: InstanceType<typeof Editor>, snaps: Snapshot[];
const toasts = () => ed.state.toasts.map((t) => t.key);
const file = (text: string, name = "x.xbird") => new File([text], name);

function seeded(name = "Bird") {
  const p = createPattern(6, 4, name);
  const red = addEntry(p, { t: "thread", src: "dmc:321", n: 2, st: "full" }, ALL_SYMBOLS);
  p.layers.stitches[0] = red;
  p.layers.stitches[1] = red;
  return p;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  downloaded.calls = [];
  downloaded.fail = false;
  snaps = [];
  ed = new Editor(memoryPersistence(snaps), false);
  ed.store.setState({ symbols: [...ALL_SYMBOLS], ready: true });
  loadPattern(ed, seeded());
});

afterEach(() => vi.useRealTimers());

describe("what a downloaded file holds", () => {
  it(".xbird: the pattern with its format version, named after it with unsafe characters removed", async () => {
    ed.doc.name = "My / bird: №1?";
    await io.exportAs(ed, "pattern");
    const [name, data] = downloaded.calls[0]!;
    expect(name).toBe("My-bird-1.xbird");
    const doc = JSON.parse(data as string) as PatternFile;
    expect(doc).toMatchObject({ app: "stitchwork", xbird: XBIRD_VERSION, w: 6, h: 4 });
    expect(toasts()).toContain("toasts.downloaded");
  });

  it(".oxs: the same as the exporter writes", async () => {
    await io.exportAs(ed, "oxs");
    expect(downloaded.calls[0]).toEqual(["Bird.oxs", exportOxs(ed.doc)]);
  });

  it("shopping list: a CSV named after the pattern", async () => {
    await io.exportAs(ed, "csv");
    const [name, data] = downloaded.calls[0]!;
    expect(name).toBe("Bird-shopping-list.csv");
    expect(data).toContain("321");
  });

  it("a name with nothing usable in it falls back to 'pattern'", () => {
    expect(io.safeName({ name: "???" })).toBe("pattern");
    expect(io.safeName({ name: "" })).toBe("pattern");
    expect(io.safeName({ name: "  Два  слова " })).toBe("Два-слова");
  });

  it("when the browser blocks the download, the text is shown to copy instead", async () => {
    downloaded.fail = true;
    await io.exportAs(ed, "oxs");
    expect(ed.state.dialog).toMatchObject({ type: "textFallback", ext: "oxs" });
  });

  it("the .xbird carries the versions, so a pattern keeps its history", async () => {
    await ed.snapshots.take("timer");
    const f = await io.patternFile(ed);
    expect(f.versions?.map((v) => v.reason)).toEqual(["timer"]);
  });
});

describe("PDF exports ask before, and say when they can't", () => {
  beforeEach(() => vi.spyOn(console, "error").mockImplementation(async () => {}));

  it("the printed chart needs a key", async () => {
    loadPattern(ed, createPattern(3, 3, "Empty"));
    await io.exportChartPdf(ed);
    expect(toasts()).toContain("toasts.needKeyEmpty");
  });

  it("Pattern Keeper: nothing to track says so; unsupported parts are explained first, unless confirmed", async () => {
    loadPattern(ed, createPattern(3, 3, "Empty"));
    await io.exportPatternKeeper(ed);
    expect(toasts()).toContain("toasts.pkNothing");

    const p = seeded();
    const half = addEntry(p, { t: "thread", src: "dmc:310", n: 2, st: "half" }, ALL_SYMBOLS);
    p.layers.stitches[5] = half;
    loadPattern(ed, p);
    await io.exportPatternKeeper(ed);
    expect(ed.state.dialog).toMatchObject({ type: "patternKeeper" });
    expect(downloaded.calls).toHaveLength(0);
  });

  it("a PDF that can't be made (fonts unreachable) is a message, not a crash or a half file", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    await io.exportChartPdf(ed);
    expect(toasts()).toContain("toasts.pdfFailed");
    expect(downloaded.calls).toHaveLength(0);
    vi.unstubAllGlobals();
  });
});

describe("opening a file", () => {
  it("an .xbird replaces the pattern, goes into the saved patterns at once, and brings its versions", async () => {
    const other = createPattern(8, 8, "Other");
    const versions = [{ time: 1_700_000_000_000, reason: "timer", doc: serializePattern(createPattern(8, 8, "Other")) }];
    const save = vi.spyOn(ed.persistence.patterns, "save");
    await io.loadFile(ed, file(JSON.stringify({ ...serializePattern(other), xbird: XBIRD_VERSION, versions })));
    expect(ed.doc.name).toBe("Other");
    expect(toasts()).toContain("toasts.loaded");
    await vi.advanceTimersByTimeAsync(0);
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ name: "Other" }), expect.anything());
    expect((await ed.snapshots.list()).map((s) => s.reason)).toEqual(["timer"]);
  });

  it("an older .json opens the same way", async () => {
    await io.loadFile(ed, file(JSON.stringify(serializePattern(createPattern(2, 2, "Old"))), "old.json"));
    expect(ed.doc.name).toBe("Old");
  });

  it("an .oxs opens, with a count of what had to be simplified", async () => {
    const p = seeded("FromOxs");
    await io.loadFile(ed, file(exportOxs(p), "chart.oxs"));
    expect(ed.doc.name).toBe("FromOxs");
    expect(ed.doc.layers.stitches[0]).toBeGreaterThan(0);
    expect(toasts()).toContain("toasts.loaded");
  });

  it("a file that is nothing of ours says so and leaves the open pattern alone", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const before = ed.doc;
    await io.loadFile(ed, file("this is not a pattern"));
    await io.loadFile(ed, file(JSON.stringify({ hello: "world" })));
    expect(toasts()).toEqual(["toasts.badFile", "toasts.badFile"]);
    expect(ed.doc).toBe(before);
  });

  it("a file made by a newer app is refused with its own message", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const before = ed.doc;
    await io.loadFile(ed, file(JSON.stringify({ ...serializePattern(createPattern(2, 2, "Future")), xbird: XBIRD_VERSION + 1 })));
    expect(toasts()).toEqual(["toasts.newerFile"]);
    expect(ed.doc).toBe(before);
  });

  it("dropping: a pattern file loads, a picture asks what to do, anything else gives a hint", () => {
    const run = vi.spyOn(ed.commands, "run").mockImplementation(async () => {});
    const pattern = file("{}", "a.xbird"), picture = new File(["x"], "p.png", { type: "image/png" });
    io.handleDrop(ed, [picture, pattern]);
    expect(run).toHaveBeenCalledWith("file.load", pattern);
    io.handleDrop(ed, [picture]);
    expect(ed.state.dialog).toMatchObject({ type: "dropChoice", file: picture });
    io.handleDrop(ed, [new File(["x"], "notes.txt", { type: "text/plain" })]);
    expect(toasts()).toContain("toasts.dropHint");
  });

  it("from the saved patterns: one that isn't there, or is damaged, is a message; a good one opens", async () => {
    await io.openFromLibrary(ed, "nope");
    expect(toasts()).toEqual(["toasts.openFailed"]);
    const good = serializePattern(createPattern(3, 3, "Saved"));
    vi.spyOn(ed.persistence.patterns, "load").mockResolvedValueOnce({ ...good, xbird: 999 } as PatternFile);
    await io.openFromLibrary(ed, good.id);
    expect(ed.doc.name).toBe("Bird");
    vi.spyOn(ed.persistence.patterns, "load").mockResolvedValueOnce(good);
    await io.openFromLibrary(ed, good.id);
    expect(ed.doc.name).toBe("Saved");
  });
});

describe("saving to the saved patterns", () => {
  const saveWith = (result: Awaited<ReturnType<typeof ed.persistence.patterns.save>>) => vi.spyOn(ed.persistence.patterns, "save").mockResolvedValue(result);

  it("signed out: saved here, with a word about it unless it is the automatic save", async () => {
    await io.saveToLibrary(ed);
    expect(ed.state.saveState).toBe("saved");
    expect(toasts()).toEqual(["toasts.savedLocal"]);
    ed.store.setState({ toasts: [] });
    await io.saveToLibrary(ed, { quiet: true });
    expect(toasts()).toEqual([]);
  });

  it("signed in: it says it is in the account", async () => {
    ed.store.setState({ account: { id: "u" } as never });
    await io.saveToLibrary(ed);
    expect(toasts()).toEqual(["toasts.savedAccount"]);
  });

  it("the account didn't get it (offline): it is kept here and shown as offline", async () => {
    saveWith({ ok: true, account: false });
    await io.saveToLibrary(ed, { quiet: true });
    expect(ed.state.saveState).toBe("offline");
  });

  it("the account is full: the pattern stays here, said once per pattern, shown as full", async () => {
    saveWith({ ok: true, limit: 20 });
    await io.saveToLibrary(ed, { quiet: true });
    await io.saveToLibrary(ed, { quiet: true });
    expect(toasts().filter((k) => k === "toasts.patternLimit")).toHaveLength(1);
    expect(ed.state.saveState).toBe("full");
  });

  it("the account's revision comes back and is remembered for the next save", async () => {
    const saved = vi.spyOn(ed.live, "saved");
    saveWith({ ok: true, rev: 6 });
    await io.saveToLibrary(ed, { quiet: true });
    expect(saved).toHaveBeenCalledWith(6, expect.any(Number));
  });

  it("a refused save (the account changed meanwhile) hands over the account's copy and sends nothing else", async () => {
    const refused = vi.spyOn(ed.live, "refused");
    const conflict = { rev: 9, doc: serializePattern(createPattern(6, 4, "Theirs")) };
    saveWith({ ok: true, conflict });
    await io.saveToLibrary(ed, { quiet: true });
    expect(refused).toHaveBeenCalledWith(conflict);
  });

  it("an answer that arrives after another pattern was opened isn't applied to it", async () => {
    const saved = vi.spyOn(ed.live, "saved"), refused = vi.spyOn(ed.live, "refused");
    vi.spyOn(ed.persistence.patterns, "save").mockImplementation(async () => {
      loadPattern(ed, createPattern(3, 3, "Another"));
      return { ok: true, rev: 3, conflict: { rev: 3, doc: serializePattern(createPattern(3, 3, "x")) } };
    });
    await io.saveToLibrary(ed, { quiet: true });
    expect(saved).not.toHaveBeenCalled();
    expect(refused).not.toHaveBeenCalled();
  });

  it("while another window edits, nothing of this one's goes to the account", async () => {
    ed.store.setState({ live: { ...ed.state.live, role: "following" } });
    const save = saveWith({ ok: true });
    await io.saveToLibrary(ed, { quiet: true });
    expect(save).toHaveBeenCalledWith(expect.anything(), { localOnly: true });
  });

  it("storage full: 'too large'; any other failure: 'save failed'; and the state doesn't claim to be saving", async () => {
    saveWith({ ok: false, reason: "quota" });
    await io.saveToLibrary(ed);
    expect(toasts()).toEqual(["toasts.tooLarge"]);
    expect(ed.state.saveState).toBeNull();
    ed.store.setState({ toasts: [] });
    saveWith({ ok: false, reason: "error" });
    await io.saveToLibrary(ed);
    expect(toasts()).toEqual(["toasts.saveFailed"]);
  });
});
