"use client";

import { useEffect } from "react";
import { useRouter } from "@/i18n/navigation";
import { authClient } from "./authClient";

/**
 * My patterns, Threads, Beads and Account are for signed-in users only (SPEC §15.39): signed out there is just the
 * editor. Once the session is known to be missing, the page gives way to the editor (`stay`: not now — the account
 * was just deleted, and the page says so). `allowed`: render the page; until then, nothing of it.
 */
export function useSignedInOnly(stay = false) {
  const { data: session, isPending } = authClient.useSession();
  const router = useRouter();
  const out = !isPending && !session?.user;
  useEffect(() => {
    if (out && !stay) router.replace("/");
  }, [out, stay, router]);
  return { session, isPending, allowed: !isPending && !!session?.user };
}
