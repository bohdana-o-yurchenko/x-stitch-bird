import type { NextRequest } from "next/server";
import { currentUserId } from "@/server/auth";
import { addVersions, getVersions, listVersions, type FileVersion } from "@/server/live";
import { validPattern } from "@/server/patterns";

const unauthorized = () => Response.json({ error: "Sign in first" }, { status: 401 });
const MAX_AT_ONCE = 20;

/** The pattern's versions from every device (SPEC §15.34): `?times=1,2` → those, in full; otherwise times and reasons. */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/patterns/[id]/versions">) {
  const user = await currentUserId();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  const times = req.nextUrl.searchParams.get("times");
  if (times === null) return Response.json(await listVersions(user, id));
  const list = times.split(",").map(Number).filter(Number.isSafeInteger).slice(0, MAX_AT_ONCE);
  return Response.json(await getVersions(user, id, list));
}

/** Versions from this device join the account's. */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/patterns/[id]/versions">) {
  const user = await currentUserId();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as FileVersion[] | null;
  const ok = Array.isArray(body) && body.length <= MAX_AT_ONCE && body.every((v) => Number.isSafeInteger(v?.time) && typeof v.reason === "string" && v.reason.length < 64 && validPattern(v.doc, id));
  if (!ok) return Response.json({ error: "Not versions" }, { status: 400 });
  return (await addVersions(user, id, body)) ? new Response(null, { status: 204 }) : Response.json({ error: "Not found" }, { status: 404 });
}
