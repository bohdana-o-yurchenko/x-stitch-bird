import type { PatternFile } from "@/core/formats/json/serialize";
import type { PatternRepository, PatternSummary } from "../ports";

/*
 * Patterns in the signed-in user's account (SPEC §15.23), through the app's own API (/api/patterns). Local-first:
 * this browser stays the working copy; while signed in, every save also goes to the account, and the Open dialog
 * lists both. Signed out, nothing here runs.
 */

/** Set by the editor when someone signs in or out. */
export const account = { signedIn: false };

type CloudSummary = Omit<PatternSummary, "where">;

async function call(path: string, init?: RequestInit): Promise<Response | null> {
  if (!account.signedIn) return null;
  try {
    const res = await fetch(`/api/patterns${path}`, { credentials: "same-origin", ...init });
    if (res.status === 401) account.signedIn = false;
    return res.ok ? res : null;
  } catch {
    // offline: the browser copy carries on
    return null;
  }
}

export const accountPatternApi = {
  async list(): Promise<CloudSummary[] | null> {
    const res = await call("");
    return res ? ((await res.json()) as CloudSummary[]) : null;
  },
  async load(id: string): Promise<PatternFile | null> {
    const res = await call(`/${encodeURIComponent(id)}`);
    return res ? ((await res.json()) as PatternFile) : null;
  },
  async save(doc: PatternFile): Promise<boolean> {
    return !!(await call(`/${encodeURIComponent(doc.id)}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(doc) }));
  },
  async remove(id: string): Promise<void> {
    await call(`/${encodeURIComponent(id)}`, { method: "DELETE" });
  },
  async putPreview(id: string, png: Blob): Promise<boolean> {
    return !!(await call(`/${encodeURIComponent(id)}/preview`, { method: "PUT", headers: { "Content-Type": "image/png" }, body: png }));
  },
  previewUrl: (id: string) => `/api/patterns/${encodeURIComponent(id)}/preview`,
};

/** This browser's library, and the account's alongside it while signed in. */
export function withAccount(local: PatternRepository): PatternRepository {
  return {
    async list() {
      const [mine, theirs] = await Promise.all([local.list(), account.signedIn ? accountPatternApi.list() : Promise.resolve(null)]);
      if (!theirs) return mine;
      const byId = new Map<string, PatternSummary>(mine.map((p) => [p.id, { ...p, where: "browser" }]));
      for (const c of theirs) {
        const here = byId.get(c.id);
        byId.set(c.id, here ? { ...(here.updatedAt >= c.updatedAt ? here : c), where: "both", hasPreview: c.hasPreview } : { ...c, where: "account" });
      }
      return [...byId.values()].sort((a, b) => b.updatedAt - a.updatedAt);
    },
    async load(id) {
      return (await local.load(id)) ?? (await accountPatternApi.load(id));
    },
    async save(doc) {
      const r = await local.save(doc);
      if (account.signedIn) await accountPatternApi.save(doc);
      return r;
    },
    async remove(id) {
      await local.remove(id);
      await accountPatternApi.remove(id);
    },
  };
}
