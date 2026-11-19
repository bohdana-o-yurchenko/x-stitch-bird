import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "../../tests/support/pgliteDb";

const h = vi.hoisted(() => ({ db: null as null | { sql: (s: TemplateStringsArray, ...v: unknown[]) => Promise<Record<string, unknown>[]> } }));
vi.mock("./db", () => ({ sql: (s: TemplateStringsArray, ...v: unknown[]) => h.db!.sql(s, ...v) }));

const checks = await import("./readerChecks");

let db: Awaited<ReturnType<typeof createTestDb>>, u1: string, u2: string;
const check = (id: string, o: Record<string, unknown> = {}) => ({ id, kind: "oxs" as const, app: "Хрестики", marks: {}, ...o });

beforeAll(async () => {
  db = await createTestDb();
  h.db = db;
});
afterAll(() => db.close());
beforeEach(async () => {
  await db.clear();
  u1 = await db.user();
  u2 = await db.user();
});

describe("an account's checks of reader apps (SPEC §15.51)", () => {
  it("are stored with their marks, changed in place, listed latest first, each account its own", async () => {
    await checks.putCheck(u1, check("a", { app: "  Ruta Stitch " }));
    await checks.putCheck(u1, check("b", { kind: "pk", app: "Pattern Keeper" }));
    await checks.putCheck(u1, check("a", { app: "Ruta Stitch", marks: { dmc310: { v: "ok" }, beadPetite: { v: "issue", note: "missing" } } }));
    await checks.putCheck(u2, check("a", { app: "Other" }));
    const list = await checks.listChecks(u1);
    expect(list.map(({ updated, ...c }) => (expect(updated).toBeGreaterThan(0), c))).toEqual([
      { id: "a", kind: "oxs", app: "Ruta Stitch", marks: { dmc310: { v: "ok" }, beadPetite: { v: "issue", note: "missing" } } },
      { id: "b", kind: "pk", app: "Pattern Keeper", marks: {} },
    ]);
    await checks.deleteCheck(u1, "a");
    expect((await checks.listChecks(u1)).map((c) => c.id)).toEqual(["b"]);
    expect((await checks.listChecks(u2)).map((c) => c.app)).toEqual(["Other"]);
  });

  it("an account keeps at most MAX_CHECKS; those it has can still change; gone with the account", async () => {
    for (let i = 0; i < checks.MAX_CHECKS; i++) expect(await checks.putCheck(u1, check(`c${i}`))).toBe(true);
    expect(await checks.putCheck(u1, check("one-more"))).toBe(false);
    expect(await checks.putCheck(u1, check("c0", { app: "changed" }))).toBe(true);
    await db.sql`delete from neon_auth."user" where id = ${u1}`;
    expect(await checks.listChecks(u1)).toEqual([]);
  });
});
