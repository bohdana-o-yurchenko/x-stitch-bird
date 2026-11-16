import { currentUserId } from "@/server/auth";
import { listPatterns } from "@/server/patterns";

const unauthorized = () => Response.json({ error: "Sign in first" }, { status: 401 });

/** The signed-in user's patterns: names, sizes, dates (not the files). */
export async function GET() {
  const user = await currentUserId();
  if (!user) return unauthorized();
  return Response.json(await listPatterns(user));
}
