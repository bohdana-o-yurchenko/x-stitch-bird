import { beforeEach, describe, expect, it, vi } from "vitest";
import { serializePattern, type PatternFile } from "@/core/formats/json/serialize";
import { createPattern } from "@/core/pattern/createPattern";
import { addEntry } from "@/core/pattern/keyEntries";
import { ALL_SYMBOLS } from "@/core/symbols/symbols";
import type { Pattern } from "@/core/pattern/types";

/*
 * One pattern in several windows (SPEC §15.34). What matters: a change made elsewhere is never replaced unseen, and
 * work done here is never thrown away without the user choosing. The account and the editor are replaced.
 */
const api = vi.hoisted(() => ({
  live: { checkIn: vi.fn(), claim: vi.fn(), release: vi.fn(async () => {}), leave: vi.fn(async () => {}) },
  patterns: { get: vi.fn() },
  revs: new Map<string, { rev: number; pending?: boolean }>(),
}));
vi.mock("@/persistence", () => ({ liveApi: api.live, accountPatternApi: api.patterns, accountRevs: api.revs }));

const { LiveSync } = await import("./LiveSync");

const file = (p: Pattern): PatternFile => serializePattern(p);
function pattern(name: string, stitched = 0): Pattern {
  const p = createPattern(5, 5, name);
  const k = addEntry(p, { t: "thread", src: "dmc:310", n: 2, st: "full" }, ALL_SYMBOLS);
  for (let i = 0; i < stitched; i++) p.layers.stitches[i] = k;
  return p;
}

function fakeEditor(doc: Pattern) {
  const ed = {
    doc,
    state: { live: { role: "off", others: 0, nudge: 0 }, account: { id: "u" }, ready: true, docRevision: 1, dialog: null as { type: string } | null, symbols: ALL_SYMBOLS },
    store: { setState: (s: object) => Object.assign(ed.state, s) },
    openDialog: vi.fn((d: { type: string }) => (ed.state.dialog = d)),
    closeDialog: vi.fn(() => (ed.state.dialog = null)),
    replaceDoc: vi.fn((p: Pattern) => {
      ed.doc = p;
      ed.state.docRevision++;
    }),
    snapshots: { addVersion: vi.fn(async () => {}), take: vi.fn(async () => {}), sync: vi.fn(async () => {}) },
    autosave: { saveNow: vi.fn(), settle: vi.fn(async () => {}), pending: false },
    persistence: { patterns: { save: vi.fn(async () => ({ ok: true })) } },
  };
  return ed;
}

type Ed = ReturnType<typeof fakeEditor>;
const make = (ed: Ed) => new LiveSync(ed as never);
const check = (s: unknown) => (s as { check(): Promise<void> }).check();
const state = (o: Partial<{ rev: number; editor: "me" | "other" | null; handOver: boolean; waiting: boolean; others: number }> = {}) => ({ rev: 1, editor: "me", handOver: false, waiting: false, others: 0, ...o });

beforeEach(() => {
  vi.clearAllMocks();
  api.revs.clear();
  vi.stubGlobal("document", { visibilityState: "visible", addEventListener: () => {} });
});

describe("what a save is made over", () => {
  it("a pattern opened from the account is based on its revision, and saves name it and this window", () => {
    const ed = fakeEditor(pattern("A"));
    api.revs.set("p", { rev: 4 });
    const s = make(ed);
    s.opened("p");
    expect(s.saveOptions()).toEqual({ base: 4, window: s.windowId });
    expect(s.changedHere).toBe(false);
  });

  it("one not in the account has no base; one with its upload still pending counts as changed", () => {
    const ed = fakeEditor(pattern("A"));
    const s = make(ed);
    s.opened("new");
    expect(s.saveOptions().base).toBeNull();
    expect(s.changedHere).toBe(true);
    api.revs.set("p", { rev: 2, pending: true });
    s.opened("p");
    expect(s.changedHere).toBe(true);
  });

  it("a save that reached the account moves the base on, and the pattern counts as unchanged until it is edited again", () => {
    const ed = fakeEditor(pattern("A"));
    const s = make(ed);
    s.opened("p");
    s.saved(7, 1);
    expect(s.saveOptions().base).toBe(7);
    expect(s.changedHere).toBe(false);
    ed.state.docRevision = 2;
    expect(s.changedHere).toBe(true);
  });

  it("each window has its own id", () => {
    const ed = fakeEditor(pattern("A"));
    expect(make(ed).windowId).not.toBe(make(ed).windowId);
    expect(make(ed).windowId).toMatch(/^[\w-]{8,64}$/);
  });
});

describe("a save was refused: the account's copy had another save since", () => {
  const theirs = () => ({ rev: 9, doc: file(pattern("Theirs", 3)) });

  it("the same content: nothing to choose, this window just adopts the revision", async () => {
    const ed = fakeEditor(pattern("Same", 2));
    const s = make(ed);
    s.opened("p");
    s.refused({ rev: 9, doc: file(ed.doc) });
    await Promise.resolve();
    expect(ed.openDialog).not.toHaveBeenCalled();
    expect(ed.replaceDoc).not.toHaveBeenCalled();
    expect(s.saveOptions().base).toBe(9);
    expect(api.revs.get("p")).toEqual({ rev: 9 });
  });

  it("nothing changed here: the account's version replaces this one at once and is kept in this browser", async () => {
    const ed = fakeEditor(pattern("Mine"));
    const s = make(ed);
    api.revs.set("p", { rev: 4 });
    s.opened("p");
    s.refused(theirs());
    await Promise.resolve();
    expect(ed.replaceDoc).toHaveBeenCalledTimes(1);
    expect(ed.doc.name).toBe("Theirs");
    expect(ed.openDialog).not.toHaveBeenCalled();
    expect(s.saveOptions().base).toBe(9);
    expect(api.revs.get("p")).toEqual({ rev: 9 });
    expect(ed.persistence.patterns.save).toHaveBeenCalledWith(expect.objectContaining({ name: "Theirs" }), { localOnly: true });
  });

  it("changed here too: the user is asked, and neither version is touched meanwhile", async () => {
    const ed = fakeEditor(pattern("Mine", 1));
    const s = make(ed);
    s.opened("p"); // never matched the account: changed here
    const t = theirs();
    s.refused(t);
    await Promise.resolve();
    expect(ed.openDialog).toHaveBeenCalledWith({ type: "liveConflict", theirs: t });
    expect(ed.replaceDoc).not.toHaveBeenCalled();
    expect(ed.doc.name).toBe("Mine");
    expect(s.saveOptions().base).toBeNull();
    // a second refusal while the question is open doesn't ask again
    s.refused(t);
    await Promise.resolve();
    expect(ed.openDialog).toHaveBeenCalledTimes(1);
  });

  it("the time spent only grows when the account's version is taken", async () => {
    const ed = fakeEditor(pattern("Mine"));
    ed.doc.spent = 500_000;
    const s = make(ed);
    api.revs.set("p", { rev: 4 });
    s.opened("p");
    const t = theirs();
    t.doc.spent = 1; // seconds in the file
    s.refused(t);
    await Promise.resolve();
    expect(ed.doc.spent).toBe(500_000);
  });

  it("a file this app can't read is ignored, never half-applied", async () => {
    const ed = fakeEditor(pattern("Mine"));
    const s = make(ed);
    api.revs.set("p", { rev: 4 });
    s.opened("p");
    s.refused({ rev: 9, doc: { ...file(pattern("X", 1)), xbird: 999 } as PatternFile });
    await Promise.resolve();
    expect(ed.replaceDoc).not.toHaveBeenCalled();
    expect(s.saveOptions().base).toBe(4);
  });
});

describe("the user's choice", () => {
  const theirs = { rev: 9, doc: file(pattern("Theirs", 3)) };

  it("go on with the account's: this window's version goes to Versions first, then the account's is shown", async () => {
    const ed = fakeEditor(pattern("Mine", 1));
    const s = make(ed);
    s.opened("p");
    await s.useTheirs(theirs);
    expect(ed.closeDialog).toHaveBeenCalled();
    expect(ed.snapshots.take).toHaveBeenCalledWith("thisDevice");
    expect(ed.doc.name).toBe("Theirs");
    expect(s.saveOptions().base).toBe(9);
  });

  it("go on with this one while editing: the account's goes to Versions, this is saved over it", async () => {
    const ed = fakeEditor(pattern("Mine", 1));
    const s = make(ed);
    s.opened("p");
    ed.state.live.role = "editing";
    await s.keepMine(theirs);
    expect(ed.snapshots.addVersion).toHaveBeenCalledWith(theirs.doc, "otherDevice");
    expect(s.saveOptions().base).toBe(9);
    expect(ed.autosave.saveNow).toHaveBeenCalledTimes(1);
    expect(ed.doc.name).toBe("Mine");
    expect(s.changedHere).toBe(true);
  });

  it("go on with this one while another window edits: this window takes over first, the save waits for it", async () => {
    const ed = fakeEditor(pattern("Mine", 1));
    const s = make(ed);
    s.opened("p");
    ed.state.live.role = "following";
    api.live.claim.mockResolvedValue({ waiting: true });
    await s.keepMine(theirs);
    expect(api.live.claim).toHaveBeenCalledWith("p", s.windowId);
    expect(ed.state.live.role).toBe("takingOver");
    expect(ed.autosave.saveNow).not.toHaveBeenCalled();
    expect(s.readOnly).toBe(true);
    // once this window is the editing one, the kept version goes up
    api.live.checkIn.mockResolvedValue(state({ rev: 9, editor: "me", waiting: false }));
    await check(s);
    expect(ed.state.live.role).toBe("editing");
    expect(ed.autosave.saveNow).toHaveBeenCalledTimes(1);
  });
});

describe("checking in", () => {
  function opened(doc = pattern("A", 1)) {
    const ed = fakeEditor(doc);
    const s = make(ed);
    api.revs.set("p", { rev: 1 });
    s.opened("p");
    return { ed, s };
  }

  it("does nothing, and shows no roles, signed out, before the editor is ready or without a pattern", async () => {
    const { ed, s } = opened();
    ed.state.account = null as never;
    await check(s);
    expect(api.live.checkIn).not.toHaveBeenCalled();
    expect(ed.state.live.role).toBe("off");
    const fresh = make(fakeEditor(pattern("B")));
    await check(fresh);
    expect(api.live.checkIn).not.toHaveBeenCalled();
  });

  it("waits while the window is hidden", async () => {
    const { s } = opened();
    vi.stubGlobal("document", { visibilityState: "hidden", addEventListener: () => {} });
    await check(s);
    expect(api.live.checkIn).not.toHaveBeenCalled();
  });

  it("a pattern the account doesn't have yet: off", async () => {
    const { ed, s } = opened();
    api.live.checkIn.mockResolvedValue(null);
    await check(s);
    expect(ed.state.live.role).toBe("off");
  });

  it("nobody edits: this window does", async () => {
    const { ed, s } = opened();
    api.live.checkIn.mockResolvedValue(state({ editor: null }));
    api.live.claim.mockResolvedValue({ waiting: false });
    await check(s);
    expect(api.live.claim).toHaveBeenCalled();
    expect(ed.state.live.role).toBe("editing");
    expect(s.readOnly).toBe(false);
  });

  it("another live window edits: this one follows and is read-only, knowing how many others there are", async () => {
    const { ed, s } = opened();
    api.live.checkIn.mockResolvedValue(state({ editor: "other", others: 2 }));
    await check(s);
    expect(ed.state.live).toMatchObject({ role: "following", others: 2 });
    expect(s.readOnly).toBe(true);
    expect(api.live.claim).not.toHaveBeenCalled();
  });

  it("the editing window says it is editing when it checks in", async () => {
    const { s } = opened();
    api.live.checkIn.mockResolvedValue(state());
    await check(s);
    await check(s);
    expect(api.live.checkIn).toHaveBeenNthCalledWith(1, "p", s.windowId, false);
    expect(api.live.checkIn).toHaveBeenNthCalledWith(2, "p", s.windowId, true);
  });

  it("asked to hand over: saves what it has, tells the account, then follows", async () => {
    const { ed, s } = opened();
    ed.state.live.role = "editing";
    api.live.checkIn.mockResolvedValue(state({ editor: "other", handOver: true }));
    await check(s);
    expect(ed.autosave.settle).toHaveBeenCalled();
    expect(api.live.release).toHaveBeenCalledWith("p", s.windowId);
    expect(ed.state.live.role).toBe("following");
    expect(ed.autosave.settle.mock.invocationCallOrder[0]).toBeLessThan(api.live.release.mock.invocationCallOrder[0]!);
  });

  it("taking over: waits for the window before, and fetches nothing meanwhile", async () => {
    const { ed, s } = opened();
    api.live.checkIn.mockResolvedValue(state({ rev: 5, editor: "me", waiting: true }));
    await check(s);
    expect(ed.state.live.role).toBe("takingOver");
    expect(api.patterns.get).not.toHaveBeenCalled();
  });

  it("the account has a newer revision and nothing changed here: it is shown", async () => {
    const { ed, s } = opened(pattern("Mine"));
    api.live.checkIn.mockResolvedValue(state({ rev: 5, editor: "other" }));
    api.patterns.get.mockResolvedValue({ rev: 5, doc: file(pattern("Newer", 2)) });
    await check(s);
    expect(ed.doc.name).toBe("Newer");
    expect(s.saveOptions().base).toBe(5);
  });

  it("the account has a newer revision and this window changed too: it asks", async () => {
    const { ed, s } = opened(pattern("Mine", 1));
    ed.state.docRevision = 2; // edited here
    api.live.checkIn.mockResolvedValue(state({ rev: 5, editor: "me" }));
    api.patterns.get.mockResolvedValue({ rev: 5, doc: file(pattern("Newer", 2)) });
    await check(s);
    expect(ed.state.dialog?.type).toBe("liveConflict");
    expect(ed.doc.name).toBe("Mine");
  });

  it("the account's copy is the same pattern with its keys in another order (as its database keeps them): nothing to choose", async () => {
    const mine = pattern("Mine", 3);
    const { ed, s } = opened(mine);
    ed.state.docRevision = 2; // counted as changed here, as after a reload
    const reorder = (v: unknown): unknown => (v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).reverse().map(([k, x]) => [k, reorder(x)])) : v);
    const theirs = reorder({ ...file(mine), spent: 999 }) as PatternFile;
    expect(JSON.stringify(theirs)).not.toBe(JSON.stringify(file(mine)));
    api.live.checkIn.mockResolvedValue(state({ rev: 5, editor: "me" }));
    api.patterns.get.mockResolvedValue({ rev: 5, doc: theirs });
    await check(s);
    expect(ed.state.dialog).toBeNull();
    expect(ed.replaceDoc).not.toHaveBeenCalled();
    expect([s.saveOptions().base, s.changedHere]).toEqual([5, false]);
  });

  it("the account's copy written in an older form (empty info fields kept) is the same pattern too", async () => {
    const mine = pattern("Mine", 2);
    mine.meta = { designer: "Me" } as never;
    const { ed, s } = opened(mine);
    ed.state.docRevision = 2;
    api.live.checkIn.mockResolvedValue(state({ rev: 3, editor: "me" }));
    api.patterns.get.mockResolvedValue({ rev: 3, doc: { ...file(mine), meta: { designer: "Me", copyright: "", instructions: "" } } });
    await check(s);
    expect(ed.state.dialog).toBeNull();
    expect(s.changedHere).toBe(false);
  });

  it("restored at start-up: the browser's copy the same but for the order of its keys counts as unchanged", async () => {
    const mine = pattern("Mine", 3);
    const ed = fakeEditor(mine);
    const reversed = Object.fromEntries(Object.entries(file(mine)).reverse()) as PatternFile;
    (ed.persistence.patterns as unknown as { load: () => Promise<PatternFile> }).load = async () => reversed;
    const s = make(ed);
    api.revs.set("p", { rev: 1 });
    s.opened("p", { unsure: true });
    await vi.waitFor(() => Promise.resolve());
    await new Promise((r) => setTimeout(r, 0));
    expect(s.changedHere).toBe(false);
  });

  it("an own save under way: its answer brings the revision, nothing is fetched", async () => {
    const { ed, s } = opened();
    ed.autosave.pending = true;
    api.live.checkIn.mockResolvedValue(state({ rev: 5, editor: "me" }));
    await check(s);
    expect(api.patterns.get).not.toHaveBeenCalled();
  });

  it("the same revision: nothing to fetch", async () => {
    const { s } = opened();
    api.live.checkIn.mockResolvedValue(state({ rev: 1, editor: "other" }));
    await check(s);
    expect(api.patterns.get).not.toHaveBeenCalled();
  });

  it("an answer that arrives after another pattern was opened is dropped", async () => {
    const { ed, s } = opened();
    api.live.checkIn.mockImplementation(async () => {
      api.revs.set("q", { rev: 1 });
      s.opened("q");
      return state({ editor: "other", rev: 8 });
    });
    await check(s);
    expect(ed.state.live.role).toBe("off");
    expect(api.patterns.get).not.toHaveBeenCalled();
  });

  it("brings the versions of the devices together once per opened pattern", async () => {
    const { ed, s } = opened();
    api.live.checkIn.mockResolvedValue(state({ editor: "other" }));
    await check(s);
    await check(s);
    expect(ed.snapshots.sync).toHaveBeenCalledTimes(1);
    api.revs.set("q", { rev: 1 });
    s.opened("q");
    await check(s);
    expect(ed.snapshots.sync).toHaveBeenCalledTimes(2);
  });
});

describe("taking over by hand, and being told no", () => {
  it("'Edit here' claims the pattern; the window before is waited for only if it was live", async () => {
    const ed = fakeEditor(pattern("A"));
    const s = make(ed);
    s.opened("p");
    api.live.claim.mockResolvedValueOnce({ waiting: false });
    await s.takeOver();
    expect(ed.state.live.role).toBe("editing");
    api.live.claim.mockResolvedValueOnce({ waiting: true });
    await s.takeOver();
    expect(ed.state.live.role).toBe("takingOver");
  });

  it("does nothing without an open pattern, or when the account doesn't have it", async () => {
    const ed = fakeEditor(pattern("A"));
    const s = make(ed);
    await s.takeOver();
    expect(api.live.claim).not.toHaveBeenCalled();
    s.opened("p");
    api.live.claim.mockResolvedValueOnce(null);
    await s.takeOver();
    expect(ed.state.live.role).toBe("off");
  });

  it("a try to edit while following only nudges the banner", () => {
    const ed = fakeEditor(pattern("A"));
    const s = make(ed);
    s.blocked();
    s.blocked();
    expect(ed.state.live.nudge).toBe(2);
  });
});

describe("the window going: the editor left for another page, or the page closing", () => {
  const listeners = new Map<string, () => void>();
  beforeEach(() => {
    listeners.clear();
    const target = { addEventListener: (n: string, f: () => void) => listeners.set(n, f), removeEventListener: (n: string) => listeners.delete(n) };
    vi.stubGlobal("document", { visibilityState: "visible", ...target });
    vi.stubGlobal("window", target);
    vi.useFakeTimers();
  });

  async function editing() {
    const ed = fakeEditor(pattern("A"));
    const s = make(ed);
    api.live.checkIn.mockResolvedValue(state());
    s.opened("p");
    s.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(ed.state.live.role).toBe("editing");
    return { ed, s };
  }

  it("left for another page: no more checking in, and once its last save is in, this window goes", async () => {
    const { ed, s } = await editing();
    const order: string[] = [];
    ed.autosave.settle.mockImplementation(async () => void order.push("settled"));
    api.live.leave.mockImplementation(async () => void order.push("left"));
    s.stop();
    await vi.advanceTimersByTimeAsync(0);
    expect(order).toEqual(["settled", "left"]);
    expect(api.live.leave).toHaveBeenCalledWith("p", s.windowId);
    const calls = api.live.checkIn.mock.calls.length;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(api.live.checkIn.mock.calls.length).toBe(calls);
    expect(listeners.size).toBe(0);
  });

  it("left before its first check-in (its save may have made it the editor already): it still goes", async () => {
    const ed = fakeEditor(pattern("A"));
    const s = make(ed);
    api.live.checkIn.mockReturnValue(new Promise(() => {}));
    s.opened("p");
    s.start();
    expect(ed.state.live.role).toBe("off");
    s.stop();
    await vi.advanceTimersByTimeAsync(0);
    expect(api.live.leave).toHaveBeenCalledWith("p", s.windowId);
  });

  it("a check-in under way when it is left doesn't take the editing afterwards", async () => {
    const { s } = await editing();
    let answer!: (v: unknown) => void;
    api.live.checkIn.mockReturnValue(new Promise((r) => (answer = r)));
    const running = check(s);
    s.stop();
    answer(state({ editor: null }));
    await running;
    expect(api.live.claim).not.toHaveBeenCalled();
  });

  it("the page closing: goes at once — unless a save is still on its way (that save keeps the editing)", async () => {
    const { ed, s } = await editing();
    listeners.get("pagehide")!();
    expect(api.live.leave).toHaveBeenCalledWith("p", s.windowId, true);
    api.live.leave.mockClear();
    ed.autosave.pending = true;
    listeners.get("pagehide")!();
    expect(api.live.leave).not.toHaveBeenCalled();
  });
});
