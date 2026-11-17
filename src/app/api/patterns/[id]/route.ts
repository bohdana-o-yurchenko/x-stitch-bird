import type { NextRequest } from "next/server";
import { currentUserId } from "@/server/auth";
import { deletePattern, getPattern, putPattern, validPattern } from "@/server/patterns";

const unauthorized = () => Response.json({ error: "Sign in first" }, { status: 401 });

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/patterns/[id]">) {
  const user = await currentUserId();
  if (!user) return unauthorized();
  const found = await getPattern(user, (await ctx.params).id);
  // the revision in a header: the body stays the pattern file, as older app versions read it
  return found ? Response.json(found.doc, { headers: { "x-rev": String(found.rev) } }) : Response.json({ error: "Not found" }, { status: 404 });
}

/**
 * Saves the whole pattern file (the same as a downloaded .xbird). Header `x-base-rev`: the revision the change was
 * made over — 409 `{ rev, doc }` with the account's copy when it has had another save since. `x-window`: the window.
 */
export async function PUT(req: NextRequest, ctx: RouteContext<"/api/patterns/[id]">) {
  const user = await currentUserId();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  const doc: unknown = await req.json().catch(() => null);
  if (!validPattern(doc, id)) return Response.json({ error: "Not a pattern file" }, { status: 400 });
  const baseHeader = req.headers.get("x-base-rev"), base = baseHeader === null ? undefined : Number(baseHeader);
  if (base !== undefined && !Number.isInteger(base)) return Response.json({ error: "Bad x-base-rev" }, { status: 400 });
  const r = await putPattern(user, doc, base, req.headers.get("x-window")?.slice(0, 64) || undefined);
  if (r.ok) return Response.json({ updatedAt: r.updatedAt, rev: r.rev });
  // the account is full (SPEC §15.35): the browser keeps it
  if ("limit" in r) return Response.json({ error: "patternLimit", max: r.limit }, { status: 403 });
  return Response.json({ rev: r.current.rev, doc: r.current.doc }, { status: 409 });
}

export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/patterns/[id]">) {
  const user = await currentUserId();
  if (!user) return unauthorized();
  await deletePattern(user, (await ctx.params).id);
  return new Response(null, { status: 204 });
}
