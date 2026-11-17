import type { CustomColor } from "@/core/pattern/types";
import { account } from "./accountPatterns";

/*
 * The signed-in user's own threads and beads (SPEC §15.28), through the app's API (/api/threads). Signed out,
 * nothing here runs: custom colours then live only in their patterns.
 */

async function call(path: string, init?: RequestInit): Promise<Response | null> {
  if (!account.signedIn) return null;
  try {
    const res = await fetch(`/api/threads${path}`, { credentials: "same-origin", ...init });
    return res.ok ? res : null;
  } catch {
    return null;
  }
}

export const accountThreadApi = {
  /** All of them; null when the account can't be reached. */
  async list(): Promise<CustomColor[] | null> {
    const res = await call("");
    return res ? ((await res.json()) as CustomColor[]) : null;
  },
  async save(c: CustomColor): Promise<boolean> {
    const body = { id: c.id, kind: c.kind, brand: c.brand, code: c.code, name: c.name, hex: c.hex };
    return !!(await call(`/${encodeURIComponent(c.id)}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
  },
  async remove(id: string): Promise<boolean> {
    return !!(await call(`/${encodeURIComponent(id)}`, { method: "DELETE" }));
  },
};
