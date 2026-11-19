import type { CheckRun } from "@/core/readerCheck/types";
import { account } from "./accountPatterns";

/* The signed-in user's checks of reader apps (SPEC §15.51), through the app's API (/api/checks). */

async function call(path: string, init?: RequestInit): Promise<Response | null> {
  if (!account.signedIn) return null;
  try {
    return await fetch(`/api/checks${path}`, { credentials: "same-origin", ...init });
  } catch {
    return null;
  }
}

/** Saved; or not: the account keeps as many checks as it may already; or it can't be reached. */
export type CheckSaved = "saved" | "full" | "failed";

export const accountCheckApi = {
  /** All of them, the latest first; null when the account can't be reached. */
  async list(): Promise<CheckRun[] | null> {
    const res = await call("");
    return res?.ok ? ((await res.json()) as CheckRun[]) : null;
  },
  async save(c: CheckRun): Promise<CheckSaved> {
    const body = { id: c.id, kind: c.kind, app: c.app, marks: c.marks };
    const res = await call(`/${encodeURIComponent(c.id)}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return res?.ok ? "saved" : res?.status === 409 ? "full" : "failed";
  },
  async remove(id: string): Promise<boolean> {
    return !!(await call(`/${encodeURIComponent(id)}`, { method: "DELETE" }))?.ok;
  },
};
