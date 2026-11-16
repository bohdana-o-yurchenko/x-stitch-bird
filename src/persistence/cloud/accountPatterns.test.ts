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
