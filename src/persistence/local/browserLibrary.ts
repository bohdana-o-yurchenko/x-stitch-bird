import type { PatternFile } from "@/core/formats/json/serialize";
import type { DraftStore, PatternRepository, PatternSummary } from "../ports";
import { run } from "./indexedDb";

/*
 * Saved patterns and the working draft in IndexedDB (SPEC §9.1): localStorage holds only ~5 MB for the whole site,
 * and one 1000 × 1000 pattern is ~1.75 MB. (Libraries saved in localStorage by 1.2.1 and earlier are no longer read:
 * signed out there is one pattern, the draft — SPEC §15.37.)
 */

// Shared with the single-file app (SPEC §9.1): the draft, while it fits in localStorage.
const DRAFT_KEY = "stitchwork.current";
const DRAFT_ID = "current";

type Meta = PatternSummary;

const summary = (doc: PatternFile, updatedAt: number): Meta => ({ id: doc.id, name: doc.name, w: doc.w, h: doc.h, updatedAt, ...(doc.meta?.designer ? { designer: doc.meta.designer } : {}) });

const isQuota = (e: unknown) => e instanceof DOMException && (e.name === "QuotaExceededError" || e.code === 22);

export const indexedDbPatternRepository: PatternRepository = {
  async list() {
    const all = (await run<Meta[]>("patternMeta", "readonly", (s) => s.getAll())) ?? [];
    return all.sort((a, b) => b.updatedAt - a.updatedAt);
  },
  async load(id) {
    return (await run<PatternFile>("patterns", "readonly", (s) => s.get(id))) ?? null;
  },
  async save(doc) {
    try {
      await run("patterns", "readwrite", (s) => s.put(doc, doc.id));
      await run("patternMeta", "readwrite", (s) => s.put(summary(doc, Date.now()), doc.id));
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: isQuota(e) ? "quota" : "error" };
    }
  },
  async remove(id) {
    await run("patterns", "readwrite", (s) => s.delete(id));
    await run("patternMeta", "readwrite", (s) => s.delete(id));
  },
};

/**
 * The working draft: always in IndexedDB; also in localStorage while it fits there, as that write is the one that
 * surely finishes when the page closes. On start the newer of the two is used.
 */
export const indexedDbDraftStore: DraftStore = {
  async load() {
    let local: { savedAt: number; doc: PatternFile } | null = null;
    try {
      const s = localStorage.getItem(DRAFT_KEY);
      if (s) {
        const v = JSON.parse(s) as PatternFile | { savedAt: number; doc: PatternFile };
        // drafts written before the move are the bare file
        local = "savedAt" in v && "doc" in v ? v : { savedAt: 0, doc: v as PatternFile };
      }
    } catch {}
    const stored = await run<{ savedAt: number; doc: PatternFile }>("drafts", "readonly", (s) => s.get(DRAFT_ID)).catch(() => undefined);
    if (stored && (!local || stored.savedAt >= local.savedAt)) return stored.doc;
    return local?.doc ?? null;
  },
  save(doc) {
    const v = { savedAt: Date.now(), doc };
    void run("drafts", "readwrite", (s) => s.put(v, DRAFT_ID)).catch(() => {});
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(v));
    } catch {
      // too big for localStorage: the IndexedDB copy is the draft; drop the stale small one so it isn't preferred
      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch {}
    }
  },
  async clear() {
    await run("drafts", "readwrite", (s) => s.delete(DRAFT_ID)).catch(() => {});
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {}
  },
};
