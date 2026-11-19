"use client";

import { useEffect } from "react";
import { useRouter } from "@/i18n/navigation";
import { useAccountSession } from "./session";

/**
 * My patterns, Threads, Beads and Account are for signed-in users only (SPEC §15.39): signed out there is just the
 * editor. Once the session is known to be missing, the page gives way to the editor (`stay`: not now — the account
 * was just deleted, and the page says so). `allowed`: render the page; until then, nothing of it. Offline, whoever
 * was signed in here stays (SPEC §15.53): the page shows what this browser has.
 */
export function useSignedInOnly(stay = false) {
  const { user, isPending, offline } = useAccountSession();
  const router = useRouter();
  const out = !isPending && !user;
  useEffect(() => {
    if (out && !stay) router.replace("/");
  }, [out, stay, router]);
  return { user, isPending, offline, allowed: !isPending && !!user };
}
