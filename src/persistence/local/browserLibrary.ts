import type { PatternFile } from "@/core/formats/json/serialize";
import type { DraftStore, PatternRepository, PatternSummary } from "../ports";
import { run } from "./indexedDb";

/*
 * Saved patterns and the working draft in IndexedDB (SPEC §9.1): localStorage holds only ~5 MB for the whole site,
 * and one 1000 × 1000 pattern is ~1.75 MB. Patterns saved by earlier versions (localStorage "stitchwork.library") are
 * copied in once; that old copy is kept, untouched, as a backup — only a pattern deleted here leaves it too.
 */

// Keys shared with the single-file app (SPEC §9.1).
const LEGACY_LIBRARY_KEY = "stitchwork.library";
const LEGACY_DRAFT_KEY = "stitchwork.current";
/** Set once the old localStorage library has been copied in. */
const MOVED_KEY = "stitchwork.libraryMoved";
const DRAFT_ID = "current";

interface LegacyEntry {
  name: string;
  updated: number;
  w: number;
  h: number;
  designer?: string;
  data: string;
}

type Meta = PatternSummary;

const summary = (doc: PatternFile, updatedAt: number): Meta => ({ id: doc.id, name: doc.name, w: doc.w, h: doc.h, updatedAt, ...(doc.meta?.designer ? { designer: doc.meta.designer } : {}) });

const readLegacyLibrary = (): Record<string, LegacyEntry> => {
  try {
    return JSON.parse(localStorage.getItem(LEGACY_LIBRARY_KEY) || "{}");
  } catch {
    return {};
  }
};

let moving: Promise<void> | null = null;

/** Copies the old localStorage library in, once; a pattern already here (and newer) is never overwritten. */
function moveLegacyLibrary(): Promise<void> {
  moving ??= (async () => {
    try {
      if (localStorage.getItem(MOVED_KEY)) return;
    } catch {
      return;
    }
    const legacy = readLegacyLibrary();
    for (const [id, e] of Object.entries(legacy)) {
      const have = await run<Meta>("patternMeta", "readonly", (s) => s.get(id));
      if (have && have.updatedAt >= e.updated) continue;
      let doc: PatternFile;
      try {
        doc = JSON.parse(e.data) as PatternFile;
      } catch {
        continue;
      }
      await run("patterns", "readwrite", (s) => s.put(doc, id));
      await run("patternMeta", "readwrite", (s) => s.put({ ...summary(doc, e.updated), id, name: e.name, designer: e.designer }, id));
    }
    try {
      localStorage.setItem(MOVED_KEY, String(Date.now()));
    } catch {}
  })().catch((err) => {
    // try again next time — nothing was lost, the old copy is still there
    moving = null;
    throw err;
  });
  return moving;
}

const isQuota = (e: unknown) => e instanceof DOMException && (e.name === "QuotaExceededError" || e.code === 22);

export const indexedDbPatternRepository: PatternRepository = {
  async list() {
    await moveLegacyLibrary().catch(() => {});
    const all = (await run<Meta[]>("patternMeta", "readonly", (s) => s.getAll())) ?? [];
    return all.sort((a, b) => b.updatedAt - a.updatedAt);
  },
  async load(id) {
    await moveLegacyLibrary().catch(() => {});
    return (await run<PatternFile>("patterns", "readonly", (s) => s.get(id))) ?? null;
  },
  async save(doc) {
    try {
      await moveLegacyLibrary().catch(() => {});
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
    // deleted on purpose: gone from the old backup too
    const legacy = readLegacyLibrary();
    if (legacy[id])
      try {
        delete legacy[id];
        localStorage.setItem(LEGACY_LIBRARY_KEY, JSON.stringify(legacy));
      } catch {}
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
      const s = localStorage.getItem(LEGACY_DRAFT_KEY);
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
      localStorage.setItem(LEGACY_DRAFT_KEY, JSON.stringify(v));
    } catch {
      // too big for localStorage: the IndexedDB copy is the draft; drop the stale small one so it isn't preferred
      try {
        localStorage.removeItem(LEGACY_DRAFT_KEY);
      } catch {}
    }
  },
};
