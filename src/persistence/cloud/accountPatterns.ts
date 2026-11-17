import type { PatternFile } from "@/core/formats/json/serialize";
import type { PatternRepository, PatternSummary, PictureSync, SaveOptions } from "../ports";

/*
 * Patterns in the signed-in user's account (SPEC §15.23), through the app's own API (/api/patterns). Local-first:
 * this browser stays the working copy; while signed in, every save also goes to the account, and the Open dialog
 * lists both. Signed out, nothing here runs.
 */

/** Set by the editor when someone signs in or out. */
export const account = { signedIn: false };

type CloudSummary = Omit<PatternSummary, "where">;

/**
 * Per pattern, what this browser knows of the account's copy (SPEC §15.34): its revision (null: not known), and
 * whether this browser's copy has changes the account hasn't taken (offline, or refused as made over an older one).
 */
export interface AccountRev {
  rev: number | null;
  pending?: boolean;
}

const REVS_KEY = "stitchwork.accountRevs";

export const accountRevs = {
  all(): Record<string, AccountRev> {
    try {
      return JSON.parse(localStorage.getItem(REVS_KEY) || "{}") as Record<string, AccountRev>;
    } catch {
      return {};
    }
  },
  get(id: string): AccountRev | null {
    return this.all()[id] ?? null;
  },
  set(id: string, r: AccountRev | null) {
    const all = this.all();
    if (r) all[id] = r;
    else delete all[id];
    try {
      localStorage.setItem(REVS_KEY, JSON.stringify(all));
    } catch {}
  },
  /** This browser has changes the account didn't take. */
  markPending(id: string) {
    this.set(id, { rev: this.get(id)?.rev ?? null, pending: true });
  },
};

export type AccountSave = { ok: true; rev: number } | { ok: false; conflict?: { rev: number; doc: PatternFile } };

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
  /** The account's copy and its revision (which this browser now knows). */
  async get(id: string): Promise<{ doc: PatternFile; rev: number } | null> {
    const res = await call(`/${encodeURIComponent(id)}`);
    if (!res) return null;
    const doc = (await res.json()) as PatternFile, rev = Number(res.headers.get("x-rev") ?? 0);
    return { doc, rev };
  },
  async load(id: string): Promise<PatternFile | null> {
    const got = await this.get(id);
    if (got) accountRevs.set(id, { rev: got.rev });
    return got?.doc ?? null;
  },
  /** Saves over `o.base` (default: the revision this browser last had). Refused with the account's copy when stale. */
  async save(doc: PatternFile, o: SaveOptions = {}): Promise<AccountSave> {
    if (!account.signedIn) return { ok: false };
    const base = o.base === undefined ? accountRevs.get(doc.id)?.rev ?? null : o.base;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (base !== null) headers["x-base-rev"] = String(base);
    if (o.window) headers["x-window"] = o.window;
    try {
      const res = await fetch(`/api/patterns/${encodeURIComponent(doc.id)}`, { method: "PUT", credentials: "same-origin", headers, body: JSON.stringify(doc) });
      if (res.status === 401) account.signedIn = false;
      if (res.ok) {
        const { rev } = (await res.json()) as { rev: number };
        accountRevs.set(doc.id, { rev });
        return { ok: true, rev };
      }
      accountRevs.markPending(doc.id);
      return res.status === 409 ? { ok: false, conflict: (await res.json()) as { rev: number; doc: PatternFile } } : { ok: false };
    } catch {
      // offline: the browser copy carries on, and goes up later
      accountRevs.markPending(doc.id);
      return { ok: false };
    }
  },
  async remove(id: string): Promise<void> {
    await call(`/${encodeURIComponent(id)}`, { method: "DELETE" });
  },
  async putPreview(id: string, png: Blob): Promise<boolean> {
    return !!(await call(`/${encodeURIComponent(id)}/preview`, { method: "PUT", headers: { "Content-Type": "image/png" }, body: png }));
  },
  previewUrl: (id: string) => `/api/patterns/${encodeURIComponent(id)}/preview`,
};

/** Signed in, how many of the account's patterns this browser keeps as a cache (besides the open one). */
export const CACHE_SIZE = 10;

/** Browser and server clocks differ a little; a browser copy has to be this much newer to count as newer. */
const CLOCK_SLACK = 5_000;

/** This browser's library, and the account's alongside it while signed in; `pictures` follow each pattern up. */
export function withAccount(local: PatternRepository, pictures?: Pick<PictureSync, "push" | "catchUp">): PatternRepository {
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
    async save(doc, o = {}) {
      const r = await local.save(doc);
      if (!account.signedIn || o.localOnly) return r;
      const up = await accountPatternApi.save(doc, o);
      if (up.ok) pictures?.push(doc.id);
      if (!r.ok) return r;
      return up.ok ? { ...r, account: true, rev: up.rev } : { ...r, account: false, ...(up.conflict && { conflict: up.conflict }) };
    },
    async remove(id) {
      await local.remove(id);
      await accountPatternApi.remove(id);
    },
    async trimCache({ keep = [], all = false }) {
      // without the account's list nothing is known to be safe there: nothing goes
      const theirs = account.signedIn ? await accountPatternApi.list() : null;
      if (!theirs) return [];
      const there = new Map(theirs.map((c) => [c.id, c.updatedAt]));
      // only copies the account has caught up with: a newer one here is work not uploaded yet
      const safe = (p: PatternSummary) => there.has(p.id) && p.updatedAt <= there.get(p.id)! + CLOCK_SLACK && !accountRevs.get(p.id)?.pending;
      const cached = (await local.list()).filter((p) => safe(p) && !keep.includes(p.id)).sort((a, b) => b.updatedAt - a.updatedAt);
      const gone = cached.slice(all ? 0 : CACHE_SIZE).map((p) => p.id);
      for (const id of gone) await local.remove(id);
      return gone;
    },
    async catchUp() {
      const theirs = account.signedIn ? await accountPatternApi.list() : null;
      if (!theirs) return;
      const there = new Map(theirs.map((c) => [c.id, c.updatedAt]));
      // only patterns already in the account: moving the rest of this browser's library is the user's choice
      for (const p of await local.list()) {
        const at = there.get(p.id), known = accountRevs.get(p.id);
        if (at === undefined) continue;
        // known: over the revision it was made on (refused if the account's changed since — that is settled when
        // the pattern is opened); from before revisions: a clearly newer copy, as before
        if (known ? !known.pending : p.updatedAt <= at + CLOCK_SLACK) continue;
        const doc = await local.load(p.id);
        if (doc) await accountPatternApi.save(doc, known ? {} : { base: null });
      }
      await pictures?.catchUp();
    },
  };
}
