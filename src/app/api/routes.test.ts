import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * The API's gate (SPEC §15.23): nothing is answered without a session, and every answer is about the signed-in user
 * only. The database, the bucket and the sign-in service are replaced; only the routes' own decisions run.
 */
const session = vi.hoisted(() => ({ user: null as { id: string; email: string } | null }));
vi.mock("@/server/auth", () => ({
  currentUserId: async () => session.user?.id ?? null,
  currentUser: async () => session.user,
}));
vi.mock("@/server/db", () => ({ sql: vi.fn() }));
vi.mock("@/server/storage", () => ({ assets: {} }));
vi.mock("@/server/account", () => ({ deleteAccount: vi.fn(async () => {}) }));
vi.mock("@/server/patterns", async (orig) => ({
  ...(await orig<typeof import("@/server/patterns")>()),
  listPatterns: vi.fn(async () => []),
  getPattern: vi.fn(async () => null),
  putPattern: vi.fn(),
  deletePattern: vi.fn(async () => {}),
  putPreview: vi.fn(async () => false),
  previewUrl: vi.fn(async () => null),
  usage: vi.fn(async () => ({ patterns: 1, maxPatterns: 20 })),
}));
vi.mock("@/server/threads", async (orig) => ({
  ...(await orig<typeof import("@/server/threads")>()),
  listThreads: vi.fn(async () => []),
  putThread: vi.fn(async () => {}),
  deleteThread: vi.fn(async () => {}),
}));
vi.mock("@/server/readerChecks", async (orig) => ({
  ...(await orig<typeof import("@/server/readerChecks")>()),
  listChecks: vi.fn(async () => []),
  putCheck: vi.fn(async () => true),
  deleteCheck: vi.fn(async () => {}),
}));
vi.mock("@/server/pictures", async (orig) => ({
  ...(await orig<typeof import("@/server/pictures")>()),
  photoUsage: vi.fn(async () => 0),
  pictureUrl: vi.fn(async () => null),
  photoRoom: vi.fn(async () => ({ ok: true })),
  confirmPicture: vi.fn(),
  getPatternPictures: vi.fn(async () => null),
  putPatternPictures: vi.fn(),
  collectPictures: vi.fn(async () => {}),
}));
vi.mock("@/server/live", () => ({ checkIn: vi.fn(async () => null), claim: vi.fn(async () => null), release: vi.fn(async () => {}), listVersions: vi.fn(async () => []), getVersions: vi.fn(async () => []), addVersions: vi.fn(async () => false) }));

const ID = `img:${"a".repeat(32)}`;
const ctx = (params: Record<string, string> = { id: "p1" }) => ({ params: Promise.resolve(params) });
const req = (method: string, body?: unknown, headers: Record<string, string> = {}) =>
  new Request("http://x/api", { method, headers: { "content-type": "application/json", ...headers }, ...(body === undefined || method === "GET" ? {} : { body: JSON.stringify(body) }) }) as never;

type Handler = (r: never, c: ReturnType<typeof ctx>) => Promise<Response>;
const routes: [string, () => Promise<Record<string, Handler>>, string[]][] = [
  ["/api/account", () => import("./account/route") as never, ["DELETE"]],
  ["/api/usage", () => import("./usage/route") as never, ["GET"]],
  ["/api/patterns", () => import("./patterns/route") as never, ["GET"]],
  ["/api/patterns/[id]", () => import("./patterns/[id]/route") as never, ["GET", "PUT", "DELETE"]],
  ["/api/patterns/[id]/pictures", () => import("./patterns/[id]/pictures/route") as never, ["GET", "PUT"]],
  ["/api/patterns/[id]/versions", () => import("./patterns/[id]/versions/route") as never, ["GET", "POST"]],
  ["/api/patterns/[id]/live", () => import("./patterns/[id]/live/route") as never, ["POST"]],
  ["/api/patterns/[id]/preview", () => import("./patterns/[id]/preview/route") as never, ["GET", "PUT"]],
  ["/api/pictures/[id]", () => import("./pictures/[id]/route") as never, ["GET", "POST", "PUT"]],
  ["/api/threads", () => import("./threads/route") as never, ["GET"]],
  ["/api/threads/[id]", () => import("./threads/[id]/route") as never, ["PUT", "DELETE"]],
  ["/api/checks", () => import("./checks/route") as never, ["GET"]],
  ["/api/checks/[id]", () => import("./checks/[id]/route") as never, ["PUT", "DELETE"]],
];

beforeEach(() => {
  session.user = null;
  vi.clearAllMocks();
});

describe("signed out, every route says 401 and touches nothing", () => {
  for (const [path, load, methods] of routes)
    for (const method of methods)
      it(`${method} ${path}`, async () => {
        const handler = (await load())[method]!;
        const res = await handler(req(method, {}), ctx({ id: ID }));
        expect(res.status).toBe(401);
      });

  it("and the list of routes is complete", async () => {
    const { readdirSync, statSync } = await import("node:fs");
    const { join, relative } = await import("node:path");
    const dir = new URL(".", import.meta.url).pathname;
    const found: string[] = [];
    const walk = (d: string) => {
      for (const f of readdirSync(d)) {
        const p = join(d, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (f === "route.ts") found.push("/api/" + relative(dir, d));
      }
    };
    walk(dir);
    // sign-in itself (/api/auth/...) is the sign-in service's own
    expect(found.filter((p) => !p.startsWith("/api/auth")).sort()).toEqual(routes.map((r) => r[0]).sort());
  });
});

describe("DELETE /api/account asks for the account's own email", () => {
  beforeEach(() => {
    session.user = { id: "u1", email: "Me@Example.com" };
  });

  it("deletes when the typed email is the account's, whatever its case and spaces", async () => {
    const { DELETE } = (await import("./account/route")) as unknown as Record<string, Handler>;
    const { deleteAccount } = await import("@/server/account");
    const res = await DELETE!(req("DELETE", { email: "  me@example.COM " }), ctx());
    expect(res.status).toBe(204);
    expect(deleteAccount).toHaveBeenCalledWith("u1");
  });

  it.each([["another email", { email: "you@example.com" }], ["none", {}], ["not text", { email: 5 }], ["blank", { email: "  " }]])("refuses %s and deletes nothing", async (_n, body) => {
    const { DELETE } = (await import("./account/route")) as unknown as Record<string, Handler>;
    const { deleteAccount } = await import("@/server/account");
    expect((await DELETE!(req("DELETE", body), ctx())).status).toBe(400);
    expect(deleteAccount).not.toHaveBeenCalled();
  });

  it("refuses a body that isn't JSON", async () => {
    const { DELETE } = (await import("./account/route")) as unknown as Record<string, Handler>;
    const bad = new Request("http://x", { method: "DELETE", body: "nope" }) as never;
    expect((await DELETE!(bad, ctx())).status).toBe(400);
  });
});

describe("PUT /api/patterns/[id] saves for the signed-in user only", () => {
  const doc = { app: "stitchwork", id: "p1", name: "Bird", w: 3, h: 3 };
  beforeEach(() => {
    session.user = { id: "u1", email: "a@b.c" };
  });

  it("saves under the session's user, with the base revision and window, and answers with the new revision", async () => {
    const { PUT } = (await import("./patterns/[id]/route")) as unknown as Record<string, Handler>;
    const { putPattern } = await import("@/server/patterns");
    vi.mocked(putPattern).mockResolvedValue({ ok: true, updatedAt: 5, rev: 4 });
    const res = await PUT!(req("PUT", doc, { "x-base-rev": "3", "x-window": "w".repeat(100) }), ctx());
    expect(await res.json()).toEqual({ updatedAt: 5, rev: 4 });
    expect(putPattern).toHaveBeenCalledWith("u1", doc, 3, "w".repeat(64));
  });

  it("answers 409 with the account's copy when it changed meanwhile, and 403 when the account is full", async () => {
    const { PUT } = (await import("./patterns/[id]/route")) as unknown as Record<string, Handler>;
    const { putPattern } = await import("@/server/patterns");
    vi.mocked(putPattern).mockResolvedValueOnce({ ok: false, current: { doc: doc as never, rev: 9 } });
    const conflict = await PUT!(req("PUT", doc, { "x-base-rev": "3" }), ctx());
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toEqual({ rev: 9, doc });
    vi.mocked(putPattern).mockResolvedValueOnce({ ok: false, limit: 20 });
    const full = await PUT!(req("PUT", doc), ctx());
    expect(full.status).toBe(403);
    expect(await full.json()).toEqual({ error: "patternLimit", max: 20 });
  });

  it("refuses a file that isn't this pattern's, and a base revision that isn't a whole number", async () => {
    const { PUT } = (await import("./patterns/[id]/route")) as unknown as Record<string, Handler>;
    const { putPattern } = await import("@/server/patterns");
    expect((await PUT!(req("PUT", { ...doc, id: "other" }), ctx())).status).toBe(400);
    expect((await PUT!(req("PUT", doc, { "x-base-rev": "abc" }), ctx())).status).toBe(400);
    expect((await PUT!(req("PUT", doc, { "x-base-rev": "1.5" }), ctx())).status).toBe(400);
    expect(putPattern).not.toHaveBeenCalled();
  });
});

describe("pictures and live routes refuse what is not theirs", () => {
  beforeEach(() => {
    session.user = { id: "u1", email: "a@b.c" };
  });

  it("a picture id that isn't one is 400 on every method", async () => {
    const m = (await import("./pictures/[id]/route")) as unknown as Record<string, Handler>;
    for (const method of ["GET", "POST", "PUT"]) expect((await m[method]!(req(method, { type: "image/png", size: 1 }), ctx({ id: "../x" }))).status).toBe(400);
  });

  it("an upload is refused for a type that isn't an image, and 413 when it can't fit", async () => {
    const m = (await import("./pictures/[id]/route")) as unknown as Record<string, Handler>;
    const { photoRoom } = await import("@/server/pictures");
    expect((await m.POST!(req("POST", { type: "text/html", size: 1 }), ctx({ id: ID }))).status).toBe(400);
    expect((await m.POST!(req("POST", { type: "image/png", size: 10 ** 12 }), ctx({ id: ID }))).status).toBe(413);
    vi.mocked(photoRoom).mockResolvedValueOnce({ ok: false, used: 90, max: 100 });
    const res = await m.POST!(req("POST", { type: "image/png", size: 20 }), ctx({ id: ID }));
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: "quota", used: 90, max: 100 });
  });

  it("confirming an upload: 204 when the bucket has it, 409 when not, 413 when it doesn't fit", async () => {
    const m = (await import("./pictures/[id]/route")) as unknown as Record<string, Handler>;
    const { confirmPicture } = await import("@/server/pictures");
    vi.mocked(confirmPicture).mockResolvedValueOnce(true);
    expect((await m.PUT!(req("PUT"), ctx({ id: ID }))).status).toBe(204);
    vi.mocked(confirmPicture).mockResolvedValueOnce(false);
    expect((await m.PUT!(req("PUT"), ctx({ id: ID }))).status).toBe(409);
    vi.mocked(confirmPicture).mockResolvedValueOnce({ ok: false, used: 1, max: 2 });
    expect((await m.PUT!(req("PUT"), ctx({ id: ID }))).status).toBe(413);
  });

  it("pattern pictures: only well-formed records are stored; a conflict gives the account's, a missing picture is listed", async () => {
    const m = (await import("./patterns/[id]/pictures/route")) as unknown as Record<string, Handler>;
    const { putPatternPictures } = await import("@/server/pictures");
    expect((await m.PUT!(req("PUT", { refs: [{ image: "data:x" }], underlay: null, base: 0 }), ctx())).status).toBe(400);
    expect((await m.PUT!(req("PUT", { refs: [], underlay: null, base: "0" }), ctx())).status).toBe(400);
    expect(putPatternPictures).not.toHaveBeenCalled();
    vi.mocked(putPatternPictures).mockResolvedValueOnce({ ok: false, reason: "conflict", current: { refs: [], underlay: null, rev: 3 } });
    const conflict = await m.PUT!(req("PUT", { refs: [], underlay: null, base: 0 }), ctx());
    expect([conflict.status, await conflict.json()]).toEqual([409, { current: { refs: [], underlay: null, rev: 3 } }]);
    vi.mocked(putPatternPictures).mockResolvedValueOnce({ ok: false, reason: "missing", missing: [ID] });
    const missing = await m.PUT!(req("PUT", { refs: [{ image: ID }], underlay: null, base: 0 }), ctx());
    expect([missing.status, await missing.json()]).toEqual([409, { missing: [ID] }]);
    vi.mocked(putPatternPictures).mockResolvedValueOnce({ ok: false, reason: "notFound" });
    expect((await m.PUT!(req("PUT", { refs: [], underlay: null, base: 0 }), ctx())).status).toBe(404);
  });

  it("previews: only a PNG within the size, 404 for a pattern the account doesn't have", async () => {
    const m = (await import("./patterns/[id]/preview/route")) as unknown as Record<string, Handler>;
    const raw = (bytes: Uint8Array) => new Request("http://x", { method: "PUT", body: bytes as BodyInit }) as never;
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4, 5, 6]);
    expect((await m.PUT!(raw(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])), ctx())).status).toBe(400);
    expect((await m.PUT!(raw(Object.assign(new Uint8Array(2_000_001), [0x89, 0x50, 0x4e, 0x47])), ctx())).status).toBe(400);
    expect((await m.PUT!(raw(png), ctx())).status).toBe(404);
    expect((await m.GET!(req("GET"), ctx())).status).toBe(404);
  });

  it("live: a window needs a proper id; unknown patterns are 404", async () => {
    const m = (await import("./patterns/[id]/live/route")) as unknown as Record<string, Handler>;
    expect((await m.POST!(req("POST", { action: "claim", window: "short" }), ctx())).status).toBe(400);
    expect((await m.POST!(req("POST", { action: "claim", window: "bad window!!" }), ctx())).status).toBe(400);
    expect((await m.POST!(req("POST", { action: "claim", window: "window-12345678" }), ctx())).status).toBe(404);
    expect((await m.POST!(req("POST", { window: "window-12345678" }), ctx())).status).toBe(404);
    expect((await m.POST!(req("POST", { action: "release", window: "window-12345678" }), ctx())).status).toBe(204);
  });

  it("versions: at most 20 at once, each a pattern file for this id", async () => {
    const m = (await import("./patterns/[id]/versions/route")) as unknown as Record<string, Handler>;
    const doc = { app: "stitchwork", id: "p1", name: "B", w: 1, h: 1 };
    const v = { time: 1, reason: "r", doc };
    expect((await m.POST!(req("POST", Array.from({ length: 21 }, () => v)), ctx())).status).toBe(400);
    expect((await m.POST!(req("POST", [{ ...v, doc: { ...doc, id: "other" } }]), ctx())).status).toBe(400);
    expect((await m.POST!(req("POST", [{ ...v, time: 1.5 }]), ctx())).status).toBe(400);
    expect((await m.POST!(req("POST", { not: "a list" }), ctx())).status).toBe(400);
    expect((await m.POST!(req("POST", [v]), ctx())).status).toBe(404);
  });

  it("checks of reader apps: only well-formed ones are stored; over the limit, 409", async () => {
    const m = (await import("./checks/[id]/route")) as unknown as Record<string, Handler>;
    const { putCheck } = await import("@/server/readerChecks");
    const ok = { id: "c1", kind: "oxs", app: "Хрестики", marks: { dmc310: { v: "ok" }, beadPetite: { v: "issue", note: "missing" } } };
    for (const bad of [{ ...ok, id: "c2" }, { ...ok, kind: "png" }, { ...ok, app: "x".repeat(61) }, { ...ok, marks: { a: { v: "maybe" } } }, { ...ok, marks: { a: { v: "ok", extra: 1 } } }, { ...ok, marks: { a: { v: "issue", note: "x".repeat(301) } } }, { ...ok, marks: [] }])
      expect((await m.PUT!(req("PUT", bad), ctx({ id: "c1" }))).status).toBe(400);
    expect(putCheck).not.toHaveBeenCalled();
    expect((await m.PUT!(req("PUT", ok), ctx({ id: "c1" }))).status).toBe(204);
    expect(putCheck).toHaveBeenCalledWith("u1", ok);
    vi.mocked(putCheck).mockResolvedValueOnce(false);
    expect((await m.PUT!(req("PUT", ok), ctx({ id: "c1" }))).status).toBe(409);
  });

  it("threads: only well-formed own threads are stored", async () => {
    const m = (await import("./threads/[id]/route")) as unknown as Record<string, Handler>;
    const { putThread } = await import("@/server/threads");
    expect((await m.PUT!(req("PUT", { id: "custom:b", kind: "thread", brand: "A", code: "1", name: "", hex: "#000000" }), ctx({ id: "custom:a" }))).status).toBe(400);
    expect(putThread).not.toHaveBeenCalled();
    const ok = { id: "custom:a", kind: "thread", brand: "A", code: "1", name: "", hex: "#000000" };
    expect((await m.PUT!(req("PUT", ok), ctx({ id: "custom:a" }))).status).toBe(204);
    expect(putThread).toHaveBeenCalledWith("u1", ok);
  });
});
