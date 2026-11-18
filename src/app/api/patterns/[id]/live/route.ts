import type { NextRequest } from "next/server";
import { currentUserId } from "@/server/auth";
import { checkIn, claim, leave, release } from "@/server/live";

const unauthorized = () => Response.json({ error: "Sign in first" }, { status: 401 });
const notFound = () => Response.json({ error: "Not found" }, { status: 404 });

/**
 * A window with the pattern open (SPEC §15.34), `{ window, action, editing }`: "checkIn" every few seconds → the
 * pattern's state; "claim" → this window edits now (`{ waiting }`: for the one before to hand over); "release" → this
 * window has handed over; "leave" → this window has gone (closed, reloaded, the editor left).
 */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/patterns/[id]/live">) {
  const user = await currentUserId();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as { window?: unknown; action?: unknown; editing?: unknown } | null;
  const win = typeof body?.window === "string" && /^[\w-]{8,64}$/.test(body.window) ? body.window : null;
  if (!win) return Response.json({ error: "No window" }, { status: 400 });
  if (body!.action === "claim") {
    const r = await claim(user, id, win);
    return r ? Response.json(r) : notFound();
  }
  if (body!.action === "release") {
    await release(user, id, win);
    return new Response(null, { status: 204 });
  }
  if (body!.action === "leave") {
    await leave(user, id, win);
    return new Response(null, { status: 204 });
  }
  const state = await checkIn(user, id, win, body!.editing === true);
  return state ? Response.json(state) : notFound();
}
