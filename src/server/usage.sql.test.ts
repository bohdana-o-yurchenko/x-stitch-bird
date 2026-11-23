import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createTestDb } from "../../tests/support/pgliteDb";

const h = vi.hoisted(() => ({ db: null as null | { sql: (s: TemplateStringsArray, ...v: unknown[]) => Promise<Record<string, unknown>[]> } }));
vi.mock("./db", () => ({ sql: (s: TemplateStringsArray, ...v: unknown[]) => h.db!.sql(s, ...v) }));

const usage = await import("./usage");
const { isAdmin } = await import("./roles");

let db: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  db = await createTestDb();
  h.db = db;
});
afterAll(() => db.close());

describe("feature usage in the database (SPEC §15.54)", () => {
  it("each batch adds to today's counts, per feature and signed in or not", async () => {
    await usage.addUsage([["history.undo", false, 2, 5], ["view.fit", true, 1, 0]]);
    await usage.addUsage([["history.undo", false, 1, 1], ["history.undo", true, 0, 4]]);
    await usage.addUsage([]);
    const rows = await db.sql`select feature, signed_in, clicks::int, keys::int, day = (now() at time zone 'utc')::date as today from feature_usage order by feature, signed_in`;
    expect(rows).toEqual([
      { feature: "history.undo", signed_in: false, clicks: 3, keys: 6, today: true },
      { feature: "history.undo", signed_in: true, clicks: 0, keys: 4, today: true },
      { feature: "view.fit", signed_in: true, clicks: 1, keys: 0, today: true },
    ]);
  });

  it("totals per feature over a range of days, signed out and in apart, the most used first", async () => {
    await db.pg.exec(`delete from feature_usage; insert into feature_usage values
      ('2026-01-01', 'view.fit', false, 2, 3), ('2026-02-01', 'view.fit', true, 1, 0), ('2026-02-01', 'history.undo', false, 0, 9)`);
    expect(await usage.usageTotals(null, null)).toEqual([
      { feature: "history.undo", clicksOut: 0, keysOut: 9, clicksIn: 0, keysIn: 0 },
      { feature: "view.fit", clicksOut: 2, keysOut: 3, clicksIn: 1, keysIn: 0 },
    ]);
    expect(await usage.usageTotals("2026-01-15", null)).toEqual([
      { feature: "history.undo", clicksOut: 0, keysOut: 9, clicksIn: 0, keysIn: 0 },
      { feature: "view.fit", clicksOut: 0, keysOut: 0, clicksIn: 1, keysIn: 0 },
    ]);
    expect(await usage.usageTotals(null, "2026-01-31")).toEqual([{ feature: "view.fit", clicksOut: 2, keysOut: 3, clicksIn: 0, keysIn: 0 }]);
  });
});

describe("roles (SPEC §15.55)", () => {
  it("an admin is a user whose role is admin (alone or among others); nobody else", async () => {
    const plain = await db.user(), admin = await db.user(), both = await db.user();
    await db.sql`update neon_auth."user" set role = 'admin' where id = ${admin}`;
    await db.sql`update neon_auth."user" set role = 'user, admin' where id = ${both}`;
    expect(await isAdmin(plain)).toBe(false);
    expect(await isAdmin(admin)).toBe(true);
    expect(await isAdmin(both)).toBe(true);
    expect(await isAdmin("00000000-0000-0000-0000-000000000000")).toBe(false);
  });
});
