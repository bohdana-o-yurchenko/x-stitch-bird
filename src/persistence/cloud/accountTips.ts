import { type TipState, validTipState } from "@/core/tips/tips";
import { account } from "./accountPatterns";

/* The signed-in user's tip of the day state (SPEC §15.60), through the app's API (/api/tips). */

export const accountTipApi = {
  /** The account's state (null: it has none yet); undefined when it can't be reached. */
  async get(): Promise<TipState | null | undefined> {
    if (!account.signedIn) return undefined;
    try {
      const res = await fetch("/api/tips", { credentials: "same-origin" });
      if (!res.ok) return undefined;
      const v: unknown = await res.json();
      return v === null ? null : validTipState(v) ? v : undefined;
    } catch {
      return undefined;
    }
  },
  /** Merges this browser's state into the account's; the merged one back, or null when it couldn't be saved. */
  async put(s: TipState, keepalive = false): Promise<TipState | null> {
    if (!account.signedIn) return null;
    try {
      const res = await fetch("/api/tips", { method: "PUT", credentials: "same-origin", keepalive, headers: { "Content-Type": "application/json" }, body: JSON.stringify(s) });
      if (!res.ok) return null;
      const v: unknown = await res.json();
      return validTipState(v) ? v : null;
    } catch {
      return null;
    }
  },
};
