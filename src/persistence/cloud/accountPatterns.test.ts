import { afterEach, describe, expect, it, vi } from "vitest";
import type { PatternFile } from "@/core/formats/json/serialize";
import type { PatternRepository, PatternSummary } from "../ports";
import { account, accountRevs, withAccount } from "./accountPatterns";

const file = (id: string) => ({ app: "stitchwork", id, name: id }) as unknown as PatternFile;
const summary = (id: string, updatedAt: number): PatternSummary => ({ id, name: id, w: 10, h: 10, updatedAt });

/** A browser library holding these patterns. */
const localWith = (items: PatternSummary[]): PatternRepository => ({
  list: async () => items,
  load: async (id) => file(id),
  save: async () => ({ ok: true }),
  remove: async () => {},
});

/** The account's API: lists `there`, records what's PUT, answers PUTs with `putOk`. */
function serverWith(there: PatternSummary[], putOk = true) {
  const put: string[] = [];
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    if (init?.method === "PUT") {
      put.push(decodeURIComponent(url.split("/").pop()!));
      return new Response(putOk ? JSON.stringify({ rev: 1 }) : null, { status: putOk ? 200 : 500 });
    }
    return new Response(JSON.stringify(there), { status: 200 });
  });
  return put;
}

afterEach(() => {
  vi.unstubAllGlobals();
  account.signedIn = false;
});

describe("patterns in the account", () => {
  it("a save says whether the account got it too; signed out it doesn't ask", async () => {
    const repo = withAccount(localWith([]));
    serverWith([], false);
    expect(await repo.save(file("a"))).toEqual({ ok: true });
    account.signedIn = true;
    expect(await repo.save(file("a"))).toEqual({ ok: true, account: false });
    serverWith([]);
    expect(await repo.save(file("a"))).toEqual({ ok: true, account: true, rev: 1 });
  });

  it("a save names the revision it was made over; refused when the account changed since, with the account's copy (SPEC §15.34)", async () => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) });
    account.signedIn = true;
    let rev = 0;
    const bases: (string | null)[] = [];
    vi.stubGlobal("fetch", async (_url: string, init?: RequestInit) => {
      const base = new Headers(init?.headers).get("x-base-rev");
      bases.push(base);
      if (base !== null && Number(base) !== rev) return new Response(JSON.stringify({ rev, doc: file("theirs") }), { status: 409 });
      return new Response(JSON.stringify({ rev: ++rev }), { status: 200 });
    });
    const repo = withAccount(localWith([]));
    expect(await repo.save(file("a"))).toMatchObject({ account: true, rev: 1 });
    expect(await repo.save(file("a"))).toMatchObject({ account: true, rev: 2 });
    // another device saved meanwhile
    rev = 5;
    const r = await repo.save(file("a"));
    expect(r).toMatchObject({ ok: true, account: false, conflict: { rev: 5, doc: { id: "theirs" } } });
    expect(bases).toEqual([null, "1", "2"]);
    expect(accountRevs.get("a")).toEqual({ rev: 2, pending: true });
    // the window that chose its version saves over the account's
    expect(await repo.save(file("a"), { base: 5 })).toMatchObject({ account: true, rev: 6 });
    expect(accountRevs.get("a")).toEqual({ rev: 6 });
  });

  it("catches up: browser copies clearly newer than the account's go up; browser-only patterns stay put", async () => {
    account.signedIn = true;
    const now = Date.now();
    const repo = withAccount(localWith([summary("cut-off", now), summary("same", now), summary("only-here", now)]));
    const put = serverWith([summary("cut-off", now - 60_000), summary("same", now - 1_000)]);
    await repo.catchUp!();
    expect(put).toEqual(["cut-off"]);
  });
});

describe("this browser as the account's cache", () => {
  it("keeps the most recent few and the open one; signing out takes them all; never one newer than the account's", async () => {
    account.signedIn = true;
    const now = Date.now();
    const here = Array.from({ length: 13 }, (_, i) => summary(`p${i}`, now - i * 60_000));
    const removed: string[] = [];
    const local = { ...localWith([...here, summary("only-here", now), summary("newer-here", now)]), remove: async (id: string) => void removed.push(id) };
    serverWith([...here, summary("newer-here", now - 3_600_000)]);
    const repo = withAccount(local);
    expect(await repo.trimCache!({ keep: ["p12"] })).toEqual(["p10", "p11"]);
    removed.length = 0;
    expect(await repo.trimCache!({ all: true })).toHaveLength(13);
    expect(removed).not.toContain("only-here");
    expect(removed).not.toContain("newer-here");
  });

  it("removes nothing when the account can't be reached", async () => {
    account.signedIn = true;
    vi.stubGlobal("fetch", async () => new Response(null, { status: 500 }));
    const removed: string[] = [];
    const repo = withAccount({ ...localWith([summary("a", 1)]), remove: async (id: string) => void removed.push(id) });
    expect(await repo.trimCache!({ all: true })).toEqual([]);
    expect(removed).toEqual([]);
  });
});
