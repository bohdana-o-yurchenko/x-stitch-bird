import { currentUserId } from "@/server/auth";
import { usage } from "@/server/patterns";
import { photoUsage } from "@/server/pictures";
import { PHOTO_QUOTA } from "@/server/limits";

/** What the signed-in account holds against its limits (SPEC §15.35). */
export async function GET() {
  const user = await currentUserId();
  if (!user) return Response.json({ error: "Sign in first" }, { status: 401 });
  const [patterns, photos] = await Promise.all([usage(user), photoUsage(user)]);
  return Response.json({ ...patterns, photos, maxPhotos: PHOTO_QUOTA });
}
