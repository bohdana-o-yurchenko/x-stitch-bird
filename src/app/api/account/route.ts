import type { NextRequest } from "next/server";
import { deleteAccount } from "@/server/account";
import { currentUser } from "@/server/auth";

/**
 * Deletes the signed-in account and everything in it (SPEC §15.38). `{ email }` must be the account's own, typed by
 * the user to confirm; 400 when it isn't.
 */
export async function DELETE(req: NextRequest) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Sign in first" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { email?: unknown } | null;
  const typed = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!typed || typed !== user.email.trim().toLowerCase()) return Response.json({ error: "Type the account's email to confirm" }, { status: 400 });
  await deleteAccount(user.id);
  return new Response(null, { status: 204 });
}
