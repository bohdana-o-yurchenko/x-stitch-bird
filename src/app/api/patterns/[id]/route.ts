import type { NextRequest } from "next/server";
import { currentUserId } from "@/server/auth";
import { deletePattern, getPattern, putPattern, validPattern } from "@/server/patterns";

const unauthorized = () => Response.json({ error: "Sign in first" }, { status: 401 });

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/patterns/[id]">) {
  const user = await currentUserId();
  if (!user) return unauthorized();
  const doc = await getPattern(user, (await ctx.params).id);
  return doc ? Response.json(doc) : Response.json({ error: "Not found" }, { status: 404 });
}

/** Saves the whole pattern file (the same as a downloaded .xbird). */
export async function PUT(req: NextRequest, ctx: RouteContext<"/api/patterns/[id]">) {
  const user = await currentUserId();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  const doc: unknown = await req.json().catch(() => null);
  if (!validPattern(doc, id)) return Response.json({ error: "Not a pattern file" }, { status: 400 });
  return Response.json({ updatedAt: await putPattern(user, doc) });
}

export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/patterns/[id]">) {
  const user = await currentUserId();
  if (!user) return unauthorized();
  await deletePattern(user, (await ctx.params).id);
  return new Response(null, { status: 204 });
}
