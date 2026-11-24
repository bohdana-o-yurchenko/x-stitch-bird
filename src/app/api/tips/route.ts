import type { NextRequest } from "next/server";
import { currentUserId } from "@/server/auth";
import { getTips, putTips, validTipState } from "@/server/tips";

/* Tip of the day (SPEC §15.60): the signed-in user's state — tips seen, the last tip's day, on or off, feature use. */

const unauthorized = () => Response.json({ error: "Sign in first" }, { status: 401 });
/** Far more than a real state (a few KB): a bigger body is not one. */
const MAX_BODY = 64_000;

export async function GET() {
  const user = await currentUserId();
  if (!user) return unauthorized();
  return Response.json(await getTips(user));
}

/** Merges this browser's state into the account's and answers with the result. POST too: a page closing sends a beacon. */
export async function PUT(req: NextRequest) {
  const user = await currentUserId();
  if (!user) return unauthorized();
  const text = await req.text().catch(() => "");
  if (text.length > MAX_BODY) return Response.json({ error: "Too big" }, { status: 413 });
  let s: unknown;
  try {
    s = JSON.parse(text);
  } catch {
    s = null;
  }
  if (!validTipState(s)) return Response.json({ error: "Not a tips state" }, { status: 400 });
  return Response.json(await putTips(user, s));
}

export const POST = PUT;
