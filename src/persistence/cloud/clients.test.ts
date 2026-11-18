import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PatternFile } from "@/core/formats/json/serialize";
import type { PatternRepository, PatternSummary } from "../ports";
import { account, accountApi, accountPatternApi, accountRevs, accountUsageApi, withAccount } from "./accountPatterns";
import { accountThreadApi } from "./accountThreads";
import { liveApi, versionApi } from "./livePatterns";

/* The browser's side of the account's API: what it sends, and what it does with each answer (SPEC §15.23, §15.34). */
const doc = (id: string) => ({ app: "stitchwork", id, name: id }) as unknown as PatternFile;
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers });
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async () => json({}));
  vi.stubGlobal("fetch", fetchMock);
  account.signedIn = true;
  const data = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) });
});
afterEach(() => {
  vi.unstubAllGlobals();
  account.signedIn = false;
});

describe("saving a pattern to the account", () => {
  it("names the revision it was made over and the window, and remembers the revision that comes back", async () => {
    accountRevs.set("p", { rev: 3 });
    fetchMock.mockImplementation(async () => json({ rev: 4 }));
    expect(await accountPatternApi.save(doc("p"), { window: "win-12345678" })).toEqual({ ok: true, rev: 4 });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/patterns/p");
    expect(init.method).toBe("PUT");
    expect(init.headers).toMatchObject({ "x-base-rev": "3", "x-window": "win-12345678" });
    expect(accountRevs.get("p")).toEqual({ rev: 4 });
  });

  it("with no known revision, or base: null, sends none (it saves regardless)", async () => {
    fetchMock.mockImplementation(async () => json({ rev: 1 }));
    await accountPatternApi.save(doc("new"));
    accountRevs.set("old", { rev: 8 });
    await accountPatternApi.save(doc("old"), { base: null });
    expect(fetchMock.mock.calls[0]![1].headers).not.toHaveProperty("x-base-rev");
    expect(fetchMock.mock.calls[1]![1].headers).not.toHaveProperty("x-base-rev");
  });

  it("refused because the account has another save: the account's copy comes back, and the pattern stays marked as not up", async () => {
    accountRevs.set("p", { rev: 3 });
    const theirs = { rev: 9, doc: doc("p") };
    fetchMock.mockImplementation(async () => json(theirs, 409));
    expect(await accountPatternApi.save(doc("p"))).toEqual({ ok: false, conflict: theirs });
    expect(accountRevs.get("p")?.pending).toBe(true);
  });

  it("the account is full: says how many it keeps; unreachable or failing: not saved, to go up later", async () => {
    fetchMock.mockResolvedValueOnce(json({ error: "patternLimit", max: 20 }, 403));
    expect(await accountPatternApi.save(doc("a"))).toEqual({ ok: false, limit: 20 });
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 500 }));
    expect(await accountPatternApi.save(doc("b"))).toEqual({ ok: false });
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    expect(await accountPatternApi.save(doc("c"))).toEqual({ ok: false });
    expect(["a", "b", "c"].map((id) => accountRevs.get(id)?.pending)).toEqual([true, true, true]);
  });

  it("a session that ended (401) is noticed: signed out from then on, nothing more is sent", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 401 }));
    expect(await accountPatternApi.save(doc("a"))).toEqual({ ok: false });
    expect(account.signedIn).toBe(false);
    fetchMock.mockClear();
    expect(await accountPatternApi.save(doc("b"))).toEqual({ ok: false });
    expect(await accountPatternApi.list()).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("reading from the account", () => {
  it("the pattern comes with its revision, which the browser remembers when it loads it", async () => {
    fetchMock.mockImplementation(async () => json(doc("p"), 200, { "x-rev": "7" }));
    expect(await accountPatternApi.get("p")).toEqual({ doc: doc("p"), rev: 7 });
    expect(await accountPatternApi.load("p")).toEqual(doc("p"));
    expect(accountRevs.get("p")).toEqual({ rev: 7 });
  });

  it("a pattern it doesn't have, or an unreachable account, is null", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 404 }));
    expect(await accountPatternApi.load("x")).toBeNull();
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    expect(await accountPatternApi.list()).toBeNull();
  });

  it("ids with odd characters are encoded in the address", async () => {
    await accountPatternApi.get("a/b c?");
    expect(fetchMock.mock.calls[0]![0]).toBe("/api/patterns/a%2Fb%20c%3F");
  });

  it("usage: nothing signed out, the figures signed in, null when it fails", async () => {
    fetchMock.mockResolvedValueOnce(json({ patterns: 2, maxPatterns: 20, photos: 5, maxPhotos: 100 }));
    expect(await accountUsageApi.get()).toMatchObject({ patterns: 2 });
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 500 }));
    expect(await accountUsageApi.get()).toBeNull();
    account.signedIn = false;
    fetchMock.mockClear();
    expect(await accountUsageApi.get()).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("deleting the account sends the email typed, and signs out only when it worked", async () => {
    fetchMock.mockResolvedValueOnce(json({ error: "x" }, 400));
    expect(await accountApi.remove("wrong@x.y")).toBe(false);
    expect(account.signedIn).toBe(true);
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    expect(await accountApi.remove("me@x.y")).toBe(true);
    expect(account.signedIn).toBe(false);
    expect(fetchMock.mock.calls[1]![1]).toMatchObject({ method: "DELETE", body: JSON.stringify({ email: "me@x.y" }) });
    account.signedIn = true;
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    expect(await accountApi.remove("me@x.y")).toBe(false);
  });
});

describe("the list of patterns: this browser's and the account's together", () => {
  const s = (id: string, updatedAt: number, extra: Partial<PatternSummary> = {}): PatternSummary => ({ id, name: id, w: 5, h: 5, updatedAt, ...extra });
  const local = (items: PatternSummary[]): PatternRepository & { removed: string[]; saved: PatternFile[] } => {
    const removed: string[] = [], saved: PatternFile[] = [];
    return { list: async () => items, load: async (id) => (items.some((i) => i.id === id) ? doc(id) : null), save: async (d) => (saved.push(d), { ok: true }), remove: async (id) => void removed.push(id), removed, saved };
  };

  it("says where each one is kept, newest first, and the newer side's name wins", async () => {
    fetchMock.mockImplementation(async () => json([s("both", 20, { name: "Renamed there", hasPreview: true }), s("account-only", 10)]));
    const list = await withAccount(local([s("both", 5, { name: "Old here" }), s("here-only", 30)])).list();
    expect(list.map((p) => [p.id, p.where, p.name])).toEqual([["here-only", "browser", "here-only"], ["both", "both", "Renamed there"], ["account-only", "account", "account-only"]]);
    expect(list.find((p) => p.id === "both")!.hasPreview).toBe(true);
  });

  it("the browser's own copy wins when it's the newer, and the account's figures still come along", async () => {
    const details = { colours: 1, stitches: 2, beads: 0, backstitch: 0, count: 14, spent: 0, bytes: 1, photos: { count: 0, bytes: 0 }, versions: 0 };
    fetchMock.mockImplementation(async () => json([s("both", 5, { details })]));
    const [p] = await withAccount(local([s("both", 20, { name: "Newer here" })])).list();
    expect(p).toMatchObject({ name: "Newer here", where: "both", details });
  });

  it("when the account can't be reached the browser's list is shown as it is", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    const list = await withAccount(local([s("a", 1)])).list();
    expect(list.map((p) => p.id)).toEqual(["a"]);
  });

  it("opens from this browser first, then from the account", async () => {
    fetchMock.mockImplementation(async () => json(doc("far"), 200, { "x-rev": "2" }));
    const repo = withAccount(local([s("near", 1)]));
    expect((await repo.load("near"))?.id).toBe("near");
    expect(fetchMock).not.toHaveBeenCalled();
    expect((await repo.load("far"))?.id).toBe("far");
  });

  it("deleting removes it here and from the account", async () => {
    const l = local([s("a", 1)]);
    await withAccount(l).remove("a");
    expect(l.removed).toEqual(["a"]);
    expect(fetchMock.mock.calls[0]).toEqual(["/api/patterns/a", expect.objectContaining({ method: "DELETE" })]);
  });

  it("a save made while another window edits stays in this browser only", async () => {
    const l = local([]);
    const r = await withAccount(l).save(doc("a"), { localOnly: true });
    expect(r).toEqual({ ok: true });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(l.saved).toHaveLength(1);
  });

  it("a save refused for a conflict or a full account still keeps the browser copy and reports why", async () => {
    const repo = withAccount(local([]));
    const theirs = { rev: 5, doc: doc("a") };
    fetchMock.mockResolvedValueOnce(json(theirs, 409));
    expect(await repo.save(doc("a"))).toEqual({ ok: true, account: false, conflict: theirs });
    fetchMock.mockResolvedValueOnce(json({ max: 20 }, 403));
    expect(await repo.save(doc("b"))).toEqual({ ok: true, account: false, limit: 20 });
  });

  it("when the browser can't store it, that is what is reported, even if the account took it", async () => {
    const l = { ...local([]), save: async () => ({ ok: false as const, reason: "quota" as const }) };
    fetchMock.mockImplementation(async () => json({ rev: 1 }));
    expect(await withAccount(l).save(doc("a"))).toEqual({ ok: false, reason: "quota" });
  });

  it("catching up sends a pattern whose last upload was cut off, not ones the account already has, and not ones only here", async () => {
    accountRevs.set("cut", { rev: 2, pending: true });
    accountRevs.set("fine", { rev: 2 });
    fetchMock.mockImplementation(async (_u: string, init?: RequestInit) => (init?.method === "PUT" ? json({ rev: 3 }) : json([s("cut", 1), s("fine", 1)])));
    const repo = withAccount(local([s("cut", 1), s("fine", 1), s("only-here", 1)]));
    await repo.catchUp!();
    const puts = fetchMock.mock.calls.filter((c) => c[1]?.method === "PUT").map((c) => c[0]);
    expect(puts).toEqual(["/api/patterns/cut"]);
  });
});

describe("the account's threads and beads", () => {
  const c = { id: "custom:a", kind: "thread" as const, brand: "Anchor", code: "403", name: "Black", hex: "#111111" };

  it("lists, saves only the fields the account keeps, and deletes", async () => {
    fetchMock.mockResolvedValueOnce(json([c]));
    expect(await accountThreadApi.list()).toEqual([c]);
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    expect(await accountThreadApi.save({ ...c, series: "Custom" } as never)).toBe(true);
    expect(JSON.parse(fetchMock.mock.calls[1]![1].body)).toEqual(c);
    expect(fetchMock.mock.calls[1]![0]).toBe("/api/threads/custom%3Aa");
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    expect(await accountThreadApi.remove("custom:a")).toBe(true);
  });

  it("false or null when refused, offline or signed out — never a throw", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 400 }));
    expect(await accountThreadApi.save(c)).toBe(false);
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    expect(await accountThreadApi.list()).toBeNull();
    account.signedIn = false;
    expect(await accountThreadApi.remove("x")).toBe(false);
  });
});

describe("checking in, taking over and versions", () => {
  it("check-in: the state; null when the account doesn't have the pattern; undefined when it can't be reached", async () => {
    const state = { rev: 2, editor: "me", handOver: false, waiting: false, others: 1 };
    fetchMock.mockResolvedValueOnce(json(state));
    expect(await liveApi.checkIn("p", "win-12345678", true)).toEqual(state);
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({ window: "win-12345678", editing: true });
    fetchMock.mockResolvedValueOnce(json({ error: "Not found" }, 404));
    expect(await liveApi.checkIn("p", "win-12345678", false)).toBeNull();
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 }));
    expect(await liveApi.checkIn("p", "win-12345678", false)).toBeUndefined();
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    expect(await liveApi.checkIn("p", "win-12345678", false)).toBeUndefined();
  });

  it("an ended session reads as unreachable and signs out", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }));
    expect(await liveApi.checkIn("p", "win-12345678", false)).toBeUndefined();
    expect(account.signedIn).toBe(false);
  });

  it("claim says whether to wait; null when refused; release sends the action", async () => {
    fetchMock.mockResolvedValueOnce(json({ waiting: true }));
    expect(await liveApi.claim("p", "win-12345678")).toEqual({ waiting: true });
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toMatchObject({ action: "claim" });
    fetchMock.mockResolvedValueOnce(json({}, 404));
    expect(await liveApi.claim("p", "win-12345678")).toBeNull();
    await liveApi.release("p", "win-12345678");
    expect(JSON.parse(fetchMock.mock.calls[2]![1].body)).toMatchObject({ action: "release" });
  });

  it("versions: list, fetch by time, add — each null/false when it fails", async () => {
    fetchMock.mockResolvedValueOnce(json([{ time: 1, reason: "r" }]));
    expect(await versionApi.list("p")).toEqual([{ time: 1, reason: "r" }]);
    fetchMock.mockResolvedValueOnce(json([{ time: 1, reason: "r", doc: doc("p") }]));
    expect(await versionApi.get("p", [1, 2])).toHaveLength(1);
    expect(fetchMock.mock.calls[1]![0]).toBe("/api/patterns/p/versions?times=1,2");
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    expect(await versionApi.add("p", [])).toBe(true);
    fetchMock.mockResolvedValueOnce(json({}, 400));
    expect(await versionApi.add("p", [])).toBe(false);
    fetchMock.mockRejectedValue(new Error("offline"));
    expect(await versionApi.list("p")).toBeNull();
    expect(await versionApi.get("p", [1])).toBeNull();
    expect(await versionApi.add("p", [])).toBe(false);
  });

  it("nothing is asked signed out", async () => {
    account.signedIn = false;
    expect(await liveApi.checkIn("p", "w", false)).toBeUndefined();
    expect(await versionApi.list("p")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
