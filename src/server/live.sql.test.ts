import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { serializePattern, type PatternFile } from "@/core/formats/json/serialize";
import { createPattern } from "@/core/pattern/createPattern";
import { createTestDb, fakeBucket } from "../../tests/support/pgliteDb";

const h = vi.hoisted(() => ({ db: null as null | { sql: (s: TemplateStringsArray, ...v: unknown[]) => Promise<Record<string, unknown>[]> }, quota: 25 * 1024 * 1024 }));
vi.mock("./db", () => ({ sql: (s: TemplateStringsArray, ...v: unknown[]) => h.db!.sql(s, ...v) }));
vi.mock("./storage", () => ({ assets: fakeBucket() }));
vi.mock("./limits", () => ({ MAX_PATTERNS: 20, PHOTO_QUOTA: 1000, get VERSIONS_QUOTA() { return h.quota; } }));

const live = await import("./live");
const { putPattern } = await import("./patterns");

let db: Awaited<ReturnType<typeof createTestDb>>, u1: string, u2: string;
const W1 = "window-aaaaaaaa", W2 = "window-bbbbbbbb", W3 = "window-cccccccc";
const file = (id: string, name = id): PatternFile => {
  const p = createPattern(5, 5, name);
  p.id = id;
  return serializePattern(p);
};
const ago = (s: number) => new Date(Date.now() - s * 1000);

beforeAll(async () => {
  db = await createTestDb();
  h.db = db;
});
afterAll(() => db.close());
beforeEach(async () => {
  await db.clear();
  h.quota = 25 * 1024 * 1024;
  u1 = await db.user();
  u2 = await db.user();
  await putPattern(u1, file("a"));
});

describe("windows checking in", () => {
  it("a pattern the account doesn't have is null, for anyone else's too", async () => {
    expect(await live.checkIn(u1, "nope", W1, false)).toBeNull();
    expect(await live.checkIn(u2, "a", W1, false)).toBeNull();
    expect(await live.claim(u2, "a", W1)).toBeNull();
  });

  it("nobody editing: the first window finds no editor, then claims and is the editor", async () => {
    expect(await live.checkIn(u1, "a", W1, false)).toMatchObject({ rev: 1, editor: null, handOver: false, waiting: false, others: 0 });
    expect(await live.claim(u1, "a", W1)).toEqual({ waiting: false });
    expect(await live.checkIn(u1, "a", W1, true)).toMatchObject({ editor: "me" });
  });

  it("another window sees the editor as 'other', and counts the windows besides itself that are still here", async () => {
    await live.claim(u1, "a", W1);
    await live.checkIn(u1, "a", W1, true);
    expect(await live.checkIn(u1, "a", W2, false)).toMatchObject({ editor: "other", others: 1 });
    await live.checkIn(u1, "a", W3, false);
    expect(await live.checkIn(u1, "a", W1, true)).toMatchObject({ editor: "me", others: 2 });
  });

  it("a window that hasn't checked in for 15 seconds is no longer counted", async () => {
    await live.checkIn(u1, "a", W1, false);
    await live.checkIn(u1, "a", W2, false);
    await db.sql`update pattern_windows set seen_at = ${ago(20)} where window_id = ${W2}`;
    expect(await live.checkIn(u1, "a", W1, false)).toMatchObject({ others: 0 });
  });

  it("an editor that has gone quiet is no editor: the others see nobody editing", async () => {
    await live.claim(u1, "a", W1);
    await db.sql`update patterns set editor_at = ${ago(30)} where id = 'a'`;
    expect(await live.checkIn(u1, "a", W2, false)).toMatchObject({ editor: null });
  });

  it("the editing window's check-in keeps it editing; a non-editing one's doesn't", async () => {
    await live.claim(u1, "a", W1);
    await db.sql`update patterns set editor_at = ${ago(10)} where id = 'a'`;
    await live.checkIn(u1, "a", W2, true);
    const quiet = (await db.sql`select editor_at from patterns where id = 'a'`)[0]!.editor_at as Date;
    expect(Date.now() - quiet.getTime()).toBeGreaterThan(9000);
    await live.checkIn(u1, "a", W1, true);
    const fresh = (await db.sql`select editor_at from patterns where id = 'a'`)[0]!.editor_at as Date;
    expect(Date.now() - fresh.getTime()).toBeLessThan(5000);
  });
});

describe("taking over the editing", () => {
  it("from a live editor: asked to hand over, the new one waits; once the old one has saved and released, it goes on", async () => {
    await live.claim(u1, "a", W1);
    await live.checkIn(u1, "a", W1, true);
    expect(await live.claim(u1, "a", W2)).toEqual({ waiting: true });
    expect(await live.checkIn(u1, "a", W1, true)).toMatchObject({ editor: "other", handOver: true });
    expect(await live.checkIn(u1, "a", W2, false)).toMatchObject({ editor: "me", waiting: true });
    await live.release(u1, "a", W1);
    expect(await live.checkIn(u1, "a", W2, true)).toMatchObject({ editor: "me", waiting: false });
    expect(await live.checkIn(u1, "a", W1, false)).toMatchObject({ editor: "other", handOver: false });
  });

  it("from an editor that has gone: no waiting", async () => {
    await live.claim(u1, "a", W1);
    await db.sql`update patterns set editor_at = ${ago(60)} where id = 'a'`;
    expect(await live.claim(u1, "a", W2)).toEqual({ waiting: false });
  });

  it("the new editor stops waiting when the window it waits for is gone (no use waiting for a closed tab)", async () => {
    await live.claim(u1, "a", W1);
    await live.checkIn(u1, "a", W1, true);
    await live.claim(u1, "a", W2);
    await db.sql`update pattern_windows set seen_at = ${ago(40)} where window_id = ${W1}`;
    expect(await live.checkIn(u1, "a", W2, false)).toMatchObject({ editor: "me", waiting: false });
  });

  it("claiming again, as the editor, asks nobody to hand over", async () => {
    await live.claim(u1, "a", W1);
    expect(await live.claim(u1, "a", W1)).toEqual({ waiting: false });
  });

  it("a release from a window that wasn't asked does nothing", async () => {
    await live.claim(u1, "a", W1);
    await live.checkIn(u1, "a", W1, true);
    await live.claim(u1, "a", W2);
    await live.release(u1, "a", W3);
    expect(await live.checkIn(u1, "a", W1, true)).toMatchObject({ handOver: true });
  });
});

describe("versions from every device", () => {
  const v = (time: number, reason = "timer", name = "v") => ({ time, reason, doc: file("a", name) });

  it("none for a pattern the account doesn't have; and a stranger's pattern is not reachable", async () => {
    expect(await live.addVersions(u1, "nope", [v(1)])).toBe(false);
    expect(await live.addVersions(u2, "a", [v(1)])).toBe(false);
    expect(await live.listVersions(u2, "a")).toEqual([]);
  });

  it("are stored compressed and come back whole, oldest first in the list; ones the account has are kept as they are", async () => {
    const now = Date.now();
    await live.addVersions(u1, "a", [v(now - 2000, "resize", "two"), v(now - 3000, "timer", "one")]);
    await live.addVersions(u1, "a", [v(now - 2000, "OTHER", "changed")]);
    expect(await live.listVersions(u1, "a")).toEqual([{ time: now - 3000, reason: "timer" }, { time: now - 2000, reason: "resize" }]);
    const got = await live.getVersions(u1, "a", [now - 2000]);
    expect(got[0]).toMatchObject({ time: now - 2000, reason: "resize", doc: { name: "two", id: "a" } });
    expect(await live.getVersions(u1, "a", [])).toEqual([]);
  });

  it("are thinned the way every browser thins its own: the newest ten stay, very old ones go", async () => {
    const now = Date.now(), day = 86_400_000;
    const recent = Array.from({ length: 10 }, (_, i) => v(now - (i + 1) * 60_000));
    const old = [v(now - 40 * day), v(now - 41 * day)];
    await live.addVersions(u1, "a", [...recent, ...old]);
    expect((await live.listVersions(u1, "a"))).toHaveLength(10);
  });

  it("past the account's room for versions, the oldest of the least recently changed patterns go first", async () => {
    await putPattern(u1, file("b"));
    await db.sql`update patterns set updated_at = now() - interval '1 day' where id = 'a'`;
    const now = Date.now();
    const mk = (id: string, t: number) => ({ time: t, reason: "r", doc: file(id, "x") });
    await live.addVersions(u1, "a", [mk("a", now - 3000), mk("a", now - 2000), mk("a", now - 1000)]);
    await live.addVersions(u1, "b", [mk("b", now - 3000), mk("b", now - 2000), mk("b", now - 1000)]);
    const size = Number((await db.sql`select max(octet_length(doc)) as s from pattern_versions`)[0]!.s);
    h.quota = size * 4 + 1;
    await live.addVersions(u1, "b", [mk("b", now - 500)]);
    // b (changed last): all four kept; a: nothing fits after them
    expect((await live.listVersions(u1, "b")).length).toBe(4);
    expect((await live.listVersions(u1, "a")).length).toBe(0);
  });

  it("the quota is each account's own", async () => {
    await putPattern(u2, file("a"));
    const now = Date.now();
    await live.addVersions(u1, "a", [{ time: now - 1000, reason: "r", doc: file("a") }]);
    h.quota = 1;
    await live.addVersions(u2, "a", [{ time: now - 1000, reason: "r", doc: file("a") }]);
    expect(await live.listVersions(u2, "a")).toHaveLength(0);
    expect(await live.listVersions(u1, "a")).toHaveLength(1);
  });
});
