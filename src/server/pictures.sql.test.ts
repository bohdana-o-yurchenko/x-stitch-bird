import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { serializePattern, type PatternFile } from "@/core/formats/json/serialize";
import { createPattern } from "@/core/pattern/createPattern";
import { createTestDb, fakeBucket } from "../../tests/support/pgliteDb";

const h = vi.hoisted(() => ({ db: null as null | { sql: (s: TemplateStringsArray, ...v: unknown[]) => Promise<Record<string, unknown>[]> }, bucket: null as unknown }));
vi.mock("./db", () => ({ sql: (s: TemplateStringsArray, ...v: unknown[]) => h.db!.sql(s, ...v) }));
vi.mock("./storage", () => ({ assets: new Proxy({}, { get: (_t, k) => (h.bucket as Record<string, unknown>)[k as string] }) }));
vi.mock("./limits", () => ({ MAX_PATTERNS: 20, PHOTO_QUOTA: 1000, VERSIONS_QUOTA: 25 * 1024 * 1024 }));

const pics = await import("./pictures");
const { putPattern, deletePattern } = await import("./patterns");

let db: Awaited<ReturnType<typeof createTestDb>>, bucket: ReturnType<typeof fakeBucket>, u1: string, u2: string;
const id = (c: string) => `img:${c.repeat(32)}`;
const A = id("a"), B = id("b"), C = id("c");
const key = (u: string, i: string) => `users/${u}/pictures/${i.slice(4)}`;
const file = (pid: string): PatternFile => {
  const p = createPattern(5, 5, pid);
  p.id = pid;
  return serializePattern(p);
};
/** A picture the bucket has and the account has confirmed. */
async function have(u: string, i: string, size: number, o: { ageHours?: number } = {}) {
  bucket.files.set(key(u, i), { size, contentType: "image/png" });
  await db.sql`insert into pictures (user_id, id, size, type, created_at) values (${u}, ${i}, ${size}, 'image/png', ${new Date(Date.now() - (o.ageHours ?? 0) * 3_600_000)})`;
}
const use = (pid: string, ...ids: string[]) => db.sql`update patterns set refs = ${JSON.stringify(ids.map((image) => ({ image })))}::jsonb where id = ${pid}`;

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
  await putPattern(u1, file("p"));
  await putPattern(u1, file("q"));
});

describe("what an account holds in photos (limit 1000 bytes here)", () => {
  it("counts pictures a pattern uses, each once, and those uploaded in the last hour; old unused ones and removed photos don't count", async () => {
    await have(u1, A, 100, { ageHours: 5 });
    await have(u1, B, 200, { ageHours: 5 });
    await have(u1, C, 50, { ageHours: 0 });
    await have(u1, id("d"), 400, { ageHours: 5 });
    await use("p", A, B);
    await db.sql`update patterns set refs = refs || ${JSON.stringify([{ image: A }])}::jsonb where id = 'q'`;
    expect(await pics.photoUsage(u1)).toBe(350);
  });

  it("can leave one picture out (the one being re-sent)", async () => {
    await have(u1, A, 100, { ageHours: 5 });
    await use("p", A);
    expect(await pics.photoUsage(u1, A)).toBe(0);
  });

  it("is each account's own", async () => {
    await have(u2, A, 900);
    expect(await pics.photoUsage(u1)).toBe(0);
  });

  it("room: a picture fits up to the limit exactly, not a byte over", async () => {
    await have(u1, A, 600, { ageHours: 0 });
    expect(await pics.photoRoom(u1, 400)).toEqual({ ok: true });
    expect(await pics.photoRoom(u1, 401)).toEqual({ ok: false, used: 600, max: 1000 });
  });
});

describe("after the browser uploaded a picture", () => {
  it("it counts as the account's only once the bucket really has it", async () => {
    expect(await pics.confirmPicture(u1, A)).toBe(false);
    bucket.files.set(key(u1, A), { size: 0, contentType: "image/png" });
    expect(await pics.confirmPicture(u1, A)).toBe(false);
    expect(await db.sql`select 1 from pictures`).toHaveLength(0);
    bucket.files.set(key(u1, A), { size: 300, contentType: "image/png" });
    expect(await pics.confirmPicture(u1, A)).toBe(true);
    expect(await db.sql`select size, type from pictures`).toEqual([{ size: 300, type: "image/png" }]);
  });

  it("one that doesn't fit is taken out of the bucket again, and not recorded", async () => {
    await have(u1, A, 800, { ageHours: 0 });
    bucket.files.set(key(u1, B), { size: 300, contentType: "image/png" });
    expect(await pics.confirmPicture(u1, B)).toEqual({ ok: false, used: 800, max: 1000 });
    expect(bucket.files.has(key(u1, B))).toBe(false);
    expect(await db.sql`select id from pictures`).toEqual([{ id: A }]);
  });

  it("one the account already has is not checked against the room again, and confirming twice is quiet", async () => {
    await have(u1, A, 900, { ageHours: 0 });
    expect(await pics.confirmPicture(u1, A)).toBe(true);
    expect(await pics.confirmPicture(u1, A)).toBe(true);
    expect(await db.sql`select 1 from pictures`).toHaveLength(1);
  });

  it("the same picture id in two accounts is two pictures", async () => {
    await have(u1, A, 100);
    bucket.files.set(key(u2, A), { size: 50, contentType: "image/png" });
    expect(await pics.confirmPicture(u2, A)).toBe(true);
    expect(await pics.pictureUrl(u1, A)).toContain(`users/${u1}/`);
    expect(await pics.pictureUrl(u2, A)).toContain(`users/${u2}/`);
  });

  it("a download link only for a picture the account has", async () => {
    await have(u1, A, 100);
    expect(await pics.pictureUrl(u1, A)).toContain(key(u1, A));
    expect(await pics.pictureUrl(u1, B)).toBeNull();
    expect(await pics.pictureUrl(u2, A)).toBeNull();
  });

  it("which of some pictures the account doesn't have", async () => {
    await have(u1, A, 1);
    expect(await pics.missingPictures(u1, [A, B, C])).toEqual([B, C]);
    expect(await pics.missingPictures(u1, [])).toEqual([]);
    expect(await pics.missingPictures(u2, [A])).toEqual([A]);
  });
});

describe("a pattern's photo windows and image behind the chart", () => {
  const body = (...ids: string[]) => ids.map((image) => ({ image }));

  it("start empty at revision 0; none for a pattern the account doesn't have or someone else's", async () => {
    expect(await pics.getPatternPictures(u1, "p")).toEqual({ refs: [], underlay: null, rev: 0 });
    expect(await pics.getPatternPictures(u1, "nope")).toBeNull();
    expect(await pics.getPatternPictures(u2, "p")).toBeNull();
    expect(await pics.putPatternPictures(u2, "p", [], null, 0)).toEqual({ ok: false, reason: "notFound" });
  });

  it("are stored over a revision that moves on; a stale one gets the account's to merge, and nothing is overwritten", async () => {
    await have(u1, A, 10);
    await have(u1, B, 10);
    expect(await pics.putPatternPictures(u1, "p", body(A), null, 0)).toEqual({ ok: true, rev: 1 });
    const stale = await pics.putPatternPictures(u1, "p", body(B), null, 0);
    expect(stale).toMatchObject({ ok: false, reason: "conflict", current: { rev: 1, refs: body(A) } });
    expect(await pics.putPatternPictures(u1, "p", body(A, B), null, 1)).toEqual({ ok: true, rev: 2 });
    expect((await pics.getPatternPictures(u1, "p"))!.refs).toEqual(body(A, B));
  });

  it("never point at a picture the account doesn't have yet: those are listed to upload first", async () => {
    await have(u1, A, 10);
    const r = await pics.putPatternPictures(u1, "p", body(A, B), { image: C, straighten: { source: A } }, 0);
    expect(r).toEqual({ ok: false, reason: "missing", missing: [B, C] });
    expect((await pics.getPatternPictures(u1, "p"))!.rev).toBe(0);
  });

  it("another account's picture is not one the account has", async () => {
    await have(u2, A, 10);
    expect(await pics.putPatternPictures(u1, "p", body(A), null, 0)).toMatchObject({ ok: false, reason: "missing" });
  });

  it("the image behind the chart is stored, and cleared with null", async () => {
    await have(u1, A, 10);
    await pics.putPatternPictures(u1, "p", [], { image: A }, 0);
    expect((await pics.getPatternPictures(u1, "p"))!.underlay).toEqual({ image: A });
    await pics.putPatternPictures(u1, "p", [], null, 1);
    expect((await pics.getPatternPictures(u1, "p"))!.underlay).toBeNull();
  });
});

describe("removing pictures nothing uses (a day's grace)", () => {
  it("takes old unused ones from the bucket and the account; keeps used ones, new ones, and other accounts'", async () => {
    await have(u1, A, 10, { ageHours: 48 });
    await have(u1, B, 10, { ageHours: 48 });
    await have(u1, C, 10, { ageHours: 2 });
    await have(u2, A, 10, { ageHours: 48 });
    await use("p", A);
    await pics.collectPictures(u1);
    expect((await db.sql`select user_id, id from pictures order by id`).map((r) => [r.user_id === u1 ? "u1" : "u2", r.id])).toEqual([["u1", A], ["u2", A], ["u1", C]]);
    expect([...bucket.files.keys()].sort()).toEqual([key(u1, A), key(u1, C), key(u2, A)].sort());
  });

  it("a picture used only as a straighten source, or only in the image behind the chart, is used", async () => {
    await have(u1, A, 10, { ageHours: 48 });
    await have(u1, B, 10, { ageHours: 48 });
    await db.sql`update patterns set underlay = ${JSON.stringify({ image: A, straighten: { source: B } })}::jsonb where id = 'p'`;
    await pics.collectPictures(u1);
    expect(await db.sql`select 1 from pictures`).toHaveLength(2);
  });

  it("deleting the only pattern that used a picture frees it once the grace is over", async () => {
    await have(u1, A, 10, { ageHours: 48 });
    await use("p", A);
    await deletePattern(u1, "p");
    expect(await db.sql`select 1 from pictures`).toHaveLength(0);
    expect(bucket.files.size).toBe(0);
  });

  it("a picture shared by two patterns stays while one of them uses it", async () => {
    await have(u1, A, 10, { ageHours: 48 });
    await use("p", A);
    await use("q", A);
    await deletePattern(u1, "p");
    expect(await db.sql`select 1 from pictures`).toHaveLength(1);
  });
});
