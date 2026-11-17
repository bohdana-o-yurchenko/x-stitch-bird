import type { NextRequest } from "next/server";
import { currentUserId } from "@/server/auth";
import { confirmPicture, isPictureId, isPictureType, MAX_PICTURE, photoRoom, pictureUploadTarget, pictureUrl } from "@/server/pictures";

const unauthorized = () => Response.json({ error: "Sign in first" }, { status: 401 });
const badId = () => Response.json({ error: "Not a picture id" }, { status: 400 });

/** A short-lived link to download the picture: `{ url }`. */
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/pictures/[id]">) {
  const user = await currentUserId();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  if (!isPictureId(id)) return badId();
  const url = await pictureUrl(user, id);
  return url ? Response.json({ url }) : Response.json({ error: "Not found" }, { status: 404 });
}

/** Where to upload the picture (`{ type, size }` in the body): a signed form straight to storage. */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/pictures/[id]">) {
  const user = await currentUserId();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  if (!isPictureId(id)) return badId();
  const body = (await req.json().catch(() => null)) as { type?: unknown; size?: unknown } | null;
  if (!isPictureType(body?.type)) return Response.json({ error: "Not a picture" }, { status: 400 });
  if (typeof body.size !== "number" || body.size > MAX_PICTURE) return Response.json({ error: "quota", used: 0, max: MAX_PICTURE }, { status: 413 });
  // the account's room for photos (SPEC §15.35): 413 `{ error: "quota", used, max }`
  const room = await photoRoom(user, body.size, id);
  if (!room.ok) return Response.json({ error: "quota", used: room.used, max: room.max }, { status: 413 });
  return Response.json(await pictureUploadTarget(user, id, body.type));
}

/** After the upload: the account checks it has the picture. 409 when it doesn't. */
export async function PUT(_req: NextRequest, ctx: RouteContext<"/api/pictures/[id]">) {
  const user = await currentUserId();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  if (!isPictureId(id)) return badId();
  const r = await confirmPicture(user, id);
  if (r === true) return new Response(null, { status: 204 });
  if (r === false) return Response.json({ error: "Not uploaded" }, { status: 409 });
  return Response.json({ error: "quota", used: r.ok ? 0 : r.used, max: r.ok ? 0 : r.max }, { status: 413 });
}
