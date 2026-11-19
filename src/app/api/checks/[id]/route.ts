import type { NextRequest } from "next/server";
import { currentUserId } from "@/server/auth";
import { deleteCheck, MAX_CHECKS, putCheck, validCheck } from "@/server/readerChecks";

const unauthorized = () => Response.json({ error: "Sign in first" }, { status: 401 });

/** Saves one check of a reader app (new or changed). */
export async function PUT(req: NextRequest, ctx: RouteContext<"/api/checks/[id]">) {
  const user = await currentUserId();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  const c: unknown = await req.json().catch(() => null);
  if (!validCheck(c, id)) return Response.json({ error: "Not a check" }, { status: 400 });
  if (!(await putCheck(user, { id: c.id, kind: c.kind, app: c.app, marks: c.marks }))) return Response.json({ error: `At most ${MAX_CHECKS} checks` }, { status: 409 });
  return new Response(null, { status: 204 });
}

export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/checks/[id]">) {
  const user = await currentUserId();
  if (!user) return unauthorized();
  await deleteCheck(user, (await ctx.params).id);
  return new Response(null, { status: 204 });
}
