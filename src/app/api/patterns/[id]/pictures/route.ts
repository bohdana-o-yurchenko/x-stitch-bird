import type { NextRequest } from "next/server";
import { currentUserId } from "@/server/auth";
import { collectPictures, getPatternPictures, putPatternPictures, validPictures } from "@/server/pictures";

const unauthorized = () => Response.json({ error: "Sign in first" }, { status: 401 });

/** The pattern's photo windows and underlay as the account has them: `{ refs, underlay, rev }`. */
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/patterns/[id]/pictures">) {
  const user = await currentUserId();
  if (!user) return unauthorized();
  const found = await getPatternPictures(user, (await ctx.params).id);
  return found ? Response.json(found) : Response.json({ error: "Not found" }, { status: 404 });
}

/**
 * Stores them over revision `base`. 409 `{ current }`: changed elsewhere since — merge and try again;
 * 409 `{ missing }`: upload these pictures first.
 */
export async function PUT(req: NextRequest, ctx: RouteContext<"/api/patterns/[id]/pictures">) {
  const user = await currentUserId();
  if (!user) return unauthorized();
  const body = (await req.json().catch(() => null)) as { refs?: unknown; underlay?: unknown; base?: unknown } | null;
  const underlay = body?.underlay ?? null;
  if (!validPictures(body?.refs, underlay) || !Number.isInteger(body?.base)) return Response.json({ error: "Not pattern pictures" }, { status: 400 });
  const r = await putPatternPictures(user, (await ctx.params).id, body.refs, underlay, body.base as number);
  if (r.ok) {
    await collectPictures(user).catch(() => {});
    return Response.json({ rev: r.rev });
  }
  if (r.reason === "notFound") return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(r.reason === "conflict" ? { current: r.current } : { missing: r.missing }, { status: 409 });
}
