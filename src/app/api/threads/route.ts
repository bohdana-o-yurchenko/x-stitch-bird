import { currentUserId } from "@/server/auth";
import { listThreads } from "@/server/threads";

/** The signed-in user's own threads and beads. */
export async function GET() {
  const user = await currentUserId();
  if (!user) return Response.json({ error: "Sign in first" }, { status: 401 });
  return Response.json(await listThreads(user));
}
