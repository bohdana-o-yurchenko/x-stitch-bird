import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { serializePattern } from "@/core/formats/json/serialize";
import { createPattern } from "@/core/pattern/createPattern";
import { createTestDb, fakeBucket } from "../../tests/support/pgliteDb";

const h = vi.hoisted(() => ({ db: null as null | { sql: (s: TemplateStringsArray, ...v: unknown[]) => Promise<Record<string, unknown>[]> }, bucket: null as unknown }));
vi.mock("./db", () => ({ sql: (s: TemplateStringsArray, ...v: unknown[]) => h.db!.sql(s, ...v) }));
vi.mock("./storage", () => ({ assets: new Proxy({}, { get: (_t, k) => (h.bucket as Record<string, unknown>)[k as string] }) }));

const threads = await import("./threads");
const { deleteAccount } = await import("./account");
const { putPattern } = await import("./patterns");

let db: Awaited<ReturnType<typeof createTestDb>>, bucket: ReturnType<typeof fakeBucket>, u1: string, u2: string;
const thread = (id: string, o: Record<string, unknown> = {}) => ({ id, kind: "thread" as const, brand: "Anchor", code: "403", name: "Black", hex: "#0a0b0c", ...o });

beforeAll(async () => {
  db = await createTestDb();
  h.db = db;
});
afterAll(() => db.close());
beforeEach(async () => {
  await db.clear();
  bucket = fakeBucket();
  h.bucket = bucket;
  u1 = await db.user();
  u2 = await db.user();
});

describe("an account's own threads and beads", () => {
  it("are stored trimmed, with the colour in capitals, and changed in place", async () => {
    await threads.putThread(u1, thread("custom:a", { brand: "  Anchor ", code: " 403 " }));
    await threads.putThread(u1, thread("custom:a", { name: "Darker", hex: "#111111" }));
    expect(await threads.listThreads(u1)).toEqual([{ id: "custom:a", kind: "thread", brand: "Anchor", code: "403", name: "Darker", hex: "#111111" }]);
  });

  it("are listed by brand and code; a bead says it is a custom series", async () => {
    await threads.putThread(u1, thread("custom:z", { brand: "Zweigart", code: "1" }));
    await threads.putThread(u1, thread("custom:b", { brand: "Anchor", code: "9" }));
    await threads.putThread(u1, thread("custom:c", { brand: "Anchor", code: "10", kind: "bead" }));
    const list = await threads.listThreads(u1);
    expect(list.map((t) => t.id)).toEqual(["custom:c", "custom:b", "custom:z"]);
    expect(list[0]).toMatchObject({ kind: "bead", series: "Custom" });
    expect(list[1]).not.toHaveProperty("series");
  });

  it("the same id in two accounts is two threads; deleting reaches only one's own", async () => {
    await threads.putThread(u1, thread("custom:a", { name: "Mine" }));
    await threads.putThread(u2, thread("custom:a", { name: "Theirs" }));
    await threads.deleteThread(u1, "custom:a");
    expect(await threads.listThreads(u1)).toEqual([]);
    expect((await threads.listThreads(u2))[0]!.name).toBe("Theirs");
  });

  it("the database itself refuses a kind that is neither", async () => {
    await expect(threads.putThread(u1, thread("custom:a", { kind: "combo" }) as never)).rejects.toThrow();
  });
});

describe("deleting an account", () => {
  it("takes its files, patterns, versions, pictures and threads — and leaves every other account whole", async () => {
    for (const u of [u1, u2]) {
      const p = createPattern(5, 5, "P");
      p.id = "p";
      await putPattern(u, serializePattern(p));
      await threads.putThread(u, thread("custom:a"));
      await db.sql`insert into pattern_versions (user_id, pattern_id, time, reason, doc) values (${u}, 'p', 1, 'r', ${new Uint8Array([1])})`;
      await db.sql`insert into pictures (user_id, id, size, type) values (${u}, ${"img:" + "a".repeat(32)}, 1, 'image/png')`;
      bucket.files.set(`users/${u}/pictures/x`, { size: 1, contentType: "image/png" });
      bucket.files.set(`users/${u}/previews/p.png`, { size: 1, contentType: "image/png" });
    }
    await deleteAccount(u1);
    expect([...bucket.files.keys()].every((k) => k.startsWith(`users/${u2}/`))).toBe(true);
    expect(bucket.files.size).toBe(2);
    for (const table of ["patterns", "pattern_versions", "pictures", "threads"]) {
      const rows = await db.pg.query<{ user_id: string }>(`select user_id from ${table}`);
      expect(rows.rows.map((r) => r.user_id), table).toEqual([u2]);
    }
    expect((await db.sql`select id from neon_auth."user"`).map((r) => r.id)).toEqual([u2]);
  });

  it("a file the bucket can't delete doesn't stop the account from going", async () => {
    bucket.files.set(`users/${u1}/pictures/x`, { size: 1, contentType: "x" });
    bucket.delete = async () => { throw new Error("bucket down"); };
    await expect(deleteAccount(u1)).resolves.toBeUndefined();
    expect((await db.sql`select id from neon_auth."user"`).map((r) => r.id)).toEqual([u2]);
  });

  it("another account keeps its files", async () => {
    bucket.files.set(`users/${u2}/pictures/x`, { size: 1, contentType: "x" });
    await deleteAccount(u1);
    expect(bucket.files.size).toBe(1);
  });
});
