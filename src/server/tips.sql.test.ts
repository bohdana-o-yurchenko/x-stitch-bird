import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { newTipState } from "@/core/tips/tips";
import { createTestDb } from "../../tests/support/pgliteDb";

const h = vi.hoisted(() => ({ db: null as null | { sql: (s: TemplateStringsArray, ...v: unknown[]) => Promise<Record<string, unknown>[]> } }));
vi.mock("./db", () => ({ sql: (s: TemplateStringsArray, ...v: unknown[]) => h.db!.sql(s, ...v) }));

const tips = await import("./tips");

let db: Awaited<ReturnType<typeof createTestDb>>, u1: string, u2: string;

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

describe("an account's tip of the day state (SPEC §15.60)", () => {
  it("is kept per account, merged with each save, and gone with the account", async () => {
    expect(await tips.getTips(u1)).toBeNull();
    const laptop = { ...newTipState("2026-11-20"), day: "2026-11-21", shown: { override: 10 }, used: { "history.undo": [2, 0] as [number, number] } };
    await tips.putTips(u1, laptop);
    const tablet = { ...newTipState("2026-11-22"), day: "2026-11-23", shown: { picker: 20 }, used: { "history.undo": [0, 1] as [number, number] } };
    const now = await tips.putTips(u1, tablet);
    expect(now).toEqual({ v: 1, since: "2026-11-20", day: "2026-11-23", off: false, offAt: 0, shown: { override: 10, picker: 20 }, used: { "history.undo": [2, 1] } });
    expect(await tips.getTips(u1)).toEqual(now);
    expect(await tips.getTips(u2)).toBeNull();
    await db.sql`delete from neon_auth."user" where id = ${u1}`;
    expect(await tips.getTips(u1)).toBeNull();
  });
});
