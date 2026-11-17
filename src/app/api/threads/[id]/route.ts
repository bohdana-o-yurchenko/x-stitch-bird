import type { NextRequest } from "next/server";
import { currentUserId } from "@/server/auth";
import { deleteThread, putThread, validThread } from "@/server/threads";

const unauthorized = () => Response.json({ error: "Sign in first" }, { status: 401 });

/** Saves one of the user's own threads (new or changed). */
export async function PUT(req: NextRequest, ctx: RouteContext<"/api/threads/[id]">) {
  const user = await currentUserId();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  const c: unknown = await req.json().catch(() => null);
  if (!validThread(c, id)) return Response.json({ error: "Not a thread" }, { status: 400 });
  await putThread(user, c);
  return new Response(null, { status: 204 });
}

export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/threads/[id]">) {
  const user = await currentUserId();
  if (!user) return unauthorized();
  await deleteThread(user, (await ctx.params).id);
  return new Response(null, { status: 204 });
}
