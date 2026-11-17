import { afterEach, describe, expect, it, vi } from "vitest";
import type { PatternFile } from "@/core/formats/json/serialize";
import type { PatternRepository, PatternSummary } from "../ports";
import { account, withAccount } from "./accountPatterns";

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
      return new Response(null, { status: putOk ? 200 : 500 });
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
    expect(await repo.save(file("a"))).toEqual({ ok: true, account: true });
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
