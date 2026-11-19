import { currentUserId } from "@/server/auth";
import { listChecks } from "@/server/readerChecks";

/** The signed-in user's checks of reader apps (SPEC §15.51), the latest first. */
export async function GET() {
  const user = await currentUserId();
  if (!user) return Response.json({ error: "Sign in first" }, { status: 401 });
  return Response.json(await listChecks(user));
}
