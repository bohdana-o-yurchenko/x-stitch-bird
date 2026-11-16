import type { NextRequest } from "next/server";
import { currentUserId } from "@/server/auth";
import { previewUrl, putPreview } from "@/server/patterns";

const unauthorized = () => Response.json({ error: "Sign in first" }, { status: 401 });
const MAX_PREVIEW = 2_000_000;

/** The pattern's preview picture (PNG), kept in object storage. */
export async function PUT(req: NextRequest, ctx: RouteContext<"/api/patterns/[id]/preview">) {
  const user = await currentUserId();
  if (!user) return unauthorized();
  const png = new Uint8Array(await req.arrayBuffer());
  const isPng = png.length > 8 && png[0] === 0x89 && png[1] === 0x50 && png[2] === 0x4e && png[3] === 0x47;
  if (!isPng || png.length > MAX_PREVIEW) return Response.json({ error: "Not a PNG preview" }, { status: 400 });
  return (await putPreview(user, (await ctx.params).id, png)) ? new Response(null, { status: 204 }) : Response.json({ error: "Not found" }, { status: 404 });
}

/** Sends the browser to a short-lived link to the picture. */
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/patterns/[id]/preview">) {
  const user = await currentUserId();
  if (!user) return unauthorized();
  const url = await previewUrl(user, (await ctx.params).id);
  return url ? Response.redirect(url, 302) : Response.json({ error: "Not found" }, { status: 404 });
}
