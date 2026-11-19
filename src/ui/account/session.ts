"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { authClient } from "./authClient";

/** The signed-in user, as the pages use it. */
export interface AccountUser {
  id: string;
  email: string;
  name?: string;
  /** When the account was made (ISO). */
  createdAt?: string;
}

/**
 * Who was signed in here last (SPEC §15.53): the app starts with them at once rather than waiting for the sign-in
 * check, and stays signed in when the check gets no answer (offline). Forgotten when the server says no one is.
 */
const KEY = "stitchwork.account";

export function parseRemembered(raw: string | null): AccountUser | null {
  try {
    const v = JSON.parse(raw ?? "null") as AccountUser | null;
    return v && typeof v.id === "string" && typeof v.email === "string" ? v : null;
  } catch {
    return null;
  }
}

function remember(u: AccountUser | null) {
  try {
    if (u) localStorage.setItem(KEY, JSON.stringify(u));
    else localStorage.removeItem(KEY);
  } catch {}
}

export interface SessionCheck {
  /** The user the check answered with. */
  user: AccountUser | null;
  isPending: boolean;
  /** No answer: offline, or the server can't be reached (a "no one is signed in" is an answer). */
  failed: boolean;
}

export interface AccountSession {
  user: AccountUser | null;
  /** Not known yet, and no one remembered: nothing to show for the account. */
  isPending: boolean;
  /** Signed in, but the account can't be reached: what needs it waits or is greyed. */
  offline: boolean;
}

/** What the pages go by, from the check, who was remembered and the browser's connection; `remember`: to keep (null: forget). */
export function resolveSession(check: SessionCheck, remembered: AccountUser | null, online: boolean): AccountSession & { remember?: AccountUser | null } {
  if (check.user) return { user: check.user, isPending: false, offline: check.failed || !online, remember: check.user };
  if (check.failed) return { user: remembered, isPending: false, offline: true };
  if (check.isPending) return { user: remembered, isPending: !remembered, offline: !online };
  return { user: null, isPending: false, offline: !online, remember: null };
}

const onEvents = (names: string[]) => (changed: () => void) => {
  names.forEach((n) => window.addEventListener(n, changed));
  return () => names.forEach((n) => window.removeEventListener(n, changed));
};
const watchOnline = onEvents(["online", "offline"]);
const watchStorage = onEvents(["storage"]);
const readRemembered = () => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
};

/** The session for the pages and the editor: the sign-in check, but not waited for, and kept while offline. */
export function useAccountSession(): AccountSession {
  const { data, isPending, error } = authClient.useSession();
  const raw = useSyncExternalStore(watchStorage, readRemembered, () => null);
  const online = useSyncExternalStore(watchOnline, () => navigator.onLine, () => true);
  const u = data?.user;
  const status = (error as { status?: number } | null)?.status;
  const user = useMemo<AccountUser | null>(
    () => (u ? { id: u.id, email: u.email, ...(u.name ? { name: u.name } : {}), ...(u.createdAt ? { createdAt: new Date(u.createdAt).toISOString() } : {}) } : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [u?.id, u?.email, u?.name],
  );
  const remembered = useMemo(() => parseRemembered(raw), [raw]);
  const r = resolveSession({ user, isPending, failed: !!error && status !== 401 }, remembered, online);
  const keep = r.remember === undefined ? undefined : r.remember && JSON.stringify(r.remember);
  useEffect(() => {
    if (keep !== undefined && keep !== raw) remember(keep ? (JSON.parse(keep) as AccountUser) : null);
  }, [keep, raw]);
  return useMemo(() => ({ user: r.user, isPending: r.isPending, offline: r.offline }), [r.user, r.isPending, r.offline]);
}
