"use client";

import { authClient } from "./authClient";

/**
 * The signed-in user has the admin role (SPEC §15.55): the sign-in service's `role`, carried in the session. It only
 * shows the admin pages' tabs — the server checks the role itself before answering them.
 */
export function useIsAdmin(): boolean {
  const { data } = authClient.useSession();
  const role = (data?.user as { role?: unknown } | undefined)?.role;
  return typeof role === "string" && role.split(",").map((r) => r.trim()).includes("admin");
}
