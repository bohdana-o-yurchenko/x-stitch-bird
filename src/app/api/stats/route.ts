import type { NextRequest } from "next/server";
import { currentUserId } from "@/server/auth";
import { isAdmin } from "@/server/roles";
import { addUsage, DAY, parseUsage, usageTotals } from "@/server/usage";

/** Larger than any real batch (a few hundred features): read no further. */
const MAX_BODY = 32_000;

/**
 * A browser's feature usage counts (SPEC §15.54), added to everyone's. No sign-in check and nothing about the
 * sender is read or kept; the browser never looks at the answer.
 */
export async function POST(request: Request) {
  const text = await request.text();
  const rows = text.length <= MAX_BODY ? parseUsage(text) : null;
  if (!rows) return new Response(null, { status: 400 });
  try {
    await addUsage(rows);
  } catch {
    // statistics may be lost
  }
  return new Response(null, { status: 204 });
}

/** The totals per feature for `?from=YYYY-MM-DD&to=YYYY-MM-DD` (either left out: open) — admins only (SPEC §15.55). */
export async function GET(req: NextRequest) {
  const user = await currentUserId();
  if (!user) return Response.json({ error: "Sign in first" }, { status: 401 });
  if (!(await isAdmin(user))) return Response.json({ error: "Admins only" }, { status: 403 });
  const from = req.nextUrl.searchParams.get("from") || null, to = req.nextUrl.searchParams.get("to") || null;
  if ((from && !DAY.test(from)) || (to && !DAY.test(to))) return Response.json({ error: "Days are YYYY-MM-DD" }, { status: 400 });
  return Response.json(await usageTotals(from, to));
}
