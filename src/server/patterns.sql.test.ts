import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { serializePattern, type PatternFile } from "@/core/formats/json/serialize";
import { createPattern } from "@/core/pattern/createPattern";
import { addEntry } from "@/core/pattern/keyEntries";
import { ALL_SYMBOLS } from "@/core/symbols/symbols";
import { createTestDb, fakeBucket } from "../../tests/support/pgliteDb";

const h = vi.hoisted(() => ({ db: null as null | { sql: (s: TemplateStringsArray, ...v: unknown[]) => Promise<Record<string, unknown>[]> }, bucket: null as unknown, max: 3 }));
vi.mock("./db", () => ({ sql: (s: TemplateStringsArray, ...v: unknown[]) => h.db!.sql(s, ...v) }));
vi.mock("./storage", () => ({ assets: new Proxy({}, { get: (_t, k) => (h.bucket as Record<string, unknown>)[k as string] }) }));
vi.mock("./limits", () => ({ get MAX_PATTERNS() { return h.max; }, PHOTO_QUOTA: 1000, VERSIONS_QUOTA: 25 * 1024 * 1024 }));

const patterns = await import("./patterns");

let db: Awaited<ReturnType<typeof createTestDb>>, bucket: ReturnType<typeof fakeBucket>, u1: string, u2: string;
const file = (id: string, name = id, stitched = 0): PatternFile => {
  const p = createPattern(5, 5, name);
  p.id = id;
  const k = addEntry(p, { t: "thread", src: "dmc:310", n: 2, st: "full" }, ALL_SYMBOLS);
  for (let i = 0; i < stitched; i++) p.layers.stitches[i] = k;
  return serializePattern(p);
};

beforeAll(async () => {
  db = await createTestDb();
  h.db = db;
});
afterAll(() => db.close());
beforeEach(async () => {
  await db.clear();
  bucket = fakeBucket();
  h.bucket = bucket;
  h.max = 3;
  u1 = await db.user();
  u2 = await db.user();
});

describe("saving over a revision", () => {
  it("a new pattern is revision 1; each save after it names the one it was made over and moves it on", async () => {
    expect(await patterns.putPattern(u1, file("a"))).toMatchObject({ ok: true, rev: 1 });
    expect(await patterns.putPattern(u1, file("a", "A2"), 1)).toMatchObject({ ok: true, rev: 2 });
    expect((await patterns.getPattern(u1, "a"))!.doc.name).toBe("A2");
    expect((await patterns.getPattern(u1, "a"))!.rev).toBe(2);
  });

  it("made over an older revision it is refused, with the account's copy, and nothing is overwritten", async () => {
    await patterns.putPattern(u1, file("a", "first"));
    await patterns.putPattern(u1, file("a", "second"), 1);
    const r = await patterns.putPattern(u1, file("a", "stale"), 1);
    expect(r).toMatchObject({ ok: false, current: { rev: 2 } });
    expect((r as { current: { doc: PatternFile } }).current.doc.name).toBe("second");
    expect((await patterns.getPattern(u1, "a"))!.doc.name).toBe("second");
  });

  it("made over a revision from the future is refused too", async () => {
    await patterns.putPattern(u1, file("a"));
    expect(await patterns.putPattern(u1, file("a", "x"), 9)).toMatchObject({ ok: false });
  });

  it("without a base (an older app) it always saves", async () => {
    await patterns.putPattern(u1, file("a"));
    await patterns.putPattern(u1, file("a", "x"), 1);
    expect(await patterns.putPattern(u1, file("a", "old app"))).toMatchObject({ ok: true, rev: 3 });
  });

  it("the window that saves keeps (or takes) the editing", async () => {
    await patterns.putPattern(u1, file("a"), undefined, "win-aaaaaaaa");
    expect((await db.sql`select editor from patterns where id = 'a'`)[0]!.editor).toBe("win-aaaaaaaa");
    await patterns.putPattern(u1, file("a", "x"), undefined, "win-bbbbbbbb");
    expect((await db.sql`select editor from patterns where id = 'a'`)[0]!.editor).toBe("win-bbbbbbbb");
    await patterns.putPattern(u1, file("a", "y"));
    expect((await db.sql`select editor from patterns where id = 'a'`)[0]!.editor).toBe("win-bbbbbbbb");
  });

  it("keeps the small columns and the figures of the file for the list", async () => {
    await patterns.putPattern(u1, { ...file("a", "Bird", 4), meta: { designer: "A. Designer" } });
    const [s] = await patterns.listPatterns(u1);
    expect(s).toMatchObject({ id: "a", name: "Bird", w: 5, h: 5, designer: "A. Designer", hasPreview: false });
    expect(s!.details).toMatchObject({ colours: 1, stitches: 4, versions: 0, photos: { count: 0, bytes: 0 } });
    expect(s!.details!.bytes).toBeGreaterThan(100);
  });
});

describe("the account's room for patterns (SPEC §15.35)", () => {
  it("a new pattern is refused once the account has its most; ones it has can still be changed", async () => {
    for (const id of ["a", "b", "c"]) await patterns.putPattern(u1, file(id));
    expect(await patterns.putPattern(u1, file("d"))).toEqual({ ok: false, limit: 3 });
    expect(await patterns.putPattern(u1, file("a", "changed"), 1)).toMatchObject({ ok: true });
    expect((await patterns.usage(u1))).toEqual({ patterns: 3, maxPatterns: 3 });
  });

  it("room is each account's own, and room comes back when a pattern is deleted", async () => {
    for (const id of ["a", "b", "c"]) await patterns.putPattern(u1, file(id));
    expect(await patterns.putPattern(u2, file("a"))).toMatchObject({ ok: true });
    await patterns.deletePattern(u1, "c");
    expect(await patterns.putPattern(u1, file("d"))).toMatchObject({ ok: true });
  });
});

describe("one account never sees another's", () => {
  it("the same pattern id is two patterns; list, read and delete only reach one's own", async () => {
    await patterns.putPattern(u1, file("same", "mine"));
    await patterns.putPattern(u2, file("same", "theirs"));
    expect((await patterns.getPattern(u1, "same"))!.doc.name).toBe("mine");
    expect((await patterns.listPatterns(u2)).map((p) => p.name)).toEqual(["theirs"]);
    await patterns.deletePattern(u1, "same");
    expect(await patterns.getPattern(u1, "same")).toBeNull();
    expect((await patterns.getPattern(u2, "same"))!.doc.name).toBe("theirs");
  });

  it("a preview can't be put on, or looked up for, someone else's pattern", async () => {
    await patterns.putPattern(u1, file("a"));
    expect(await patterns.putPreview(u2, "a", new Uint8Array([1]))).toBe(false);
    expect(await patterns.previewUrl(u2, "a")).toBeNull();
    expect(bucket.files.size).toBe(0);
  });
});

describe("previews and deleting", () => {
  it("a preview is stored under the account's own folder and linked; a pattern without one has none", async () => {
    await patterns.putPattern(u1, file("a b"));
    expect(await patterns.previewUrl(u1, "a b")).toBeNull();
    expect(await patterns.putPreview(u1, "a b", new Uint8Array([137, 80, 78, 71]))).toBe(true);
    expect([...bucket.files.keys()]).toEqual([`users/${u1}/previews/a%20b.png`]);
    expect(await patterns.previewUrl(u1, "a b")).toContain(`users/${u1}/previews/`);
    expect((await patterns.listPatterns(u1))[0]!.hasPreview).toBe(true);
  });

  it("deleting takes the row, its versions and its preview, and nobody else's", async () => {
    await patterns.putPattern(u1, file("a"));
    await patterns.putPattern(u1, file("b"));
    await patterns.putPreview(u1, "a", new Uint8Array([1]));
    await db.sql`insert into pattern_versions (user_id, pattern_id, time, reason, doc) values (${u1}, 'a', 1, 'r', ${new Uint8Array([1])})`;
    await patterns.deletePattern(u1, "a");
    expect((await patterns.listPatterns(u1)).map((p) => p.id)).toEqual(["b"]);
    expect(bucket.files.size).toBe(0);
    expect(await db.sql`select 1 from pattern_versions`).toHaveLength(0);
  });

  it("deleting one that isn't there is quiet", async () => {
    await expect(patterns.deletePattern(u1, "nope")).resolves.toBeUndefined();
  });
});

describe("a pattern saved before figures were kept", () => {
  it("gets them worked out once, on the first list", async () => {
    await patterns.putPattern(u1, file("a", "Old", 3));
    await db.sql`update patterns set stats = null where id = 'a'`;
    const [s] = await patterns.listPatterns(u1);
    expect(s!.details).toMatchObject({ stitches: 3 });
    expect((await db.sql`select stats from patterns where id = 'a'`)[0]!.stats).toMatchObject({ stitches: 3 });
  });

  it("one that can't be read has no figures, and listing still works", async () => {
    await patterns.putPattern(u1, file("a"));
    await db.sql`update patterns set stats = null, doc = '{"app":"stitchwork","id":"a","name":"x","w":5,"h":5,"xbird":99}'::jsonb where id = 'a'`;
    const [s] = await patterns.listPatterns(u1);
    expect(s).toMatchObject({ id: "a" });
    expect(s!.details).toBeUndefined();
  });
});
