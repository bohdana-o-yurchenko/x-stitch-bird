import type { PatternFile } from "@/core/formats/json/serialize";
import type { DraftStore, PatternRepository, PatternSummary } from "../ports";

// Keys shared with the single-file app (SPEC §9.1), so existing work shows up.
const LIBRARY_KEY = "stitchwork.library";
const CURRENT_KEY = "stitchwork.current";

interface LibraryEntry {
  name: string;
  updated: number;
  w: number;
  h: number;
  designer?: string;
  data: string;
}

const readLibrary = (): Record<string, LibraryEntry> => {
  try {
    return JSON.parse(localStorage.getItem(LIBRARY_KEY) || "{}");
  } catch {
    return {};
  }
};

const isQuota = (e: unknown) => e instanceof DOMException && (e.name === "QuotaExceededError" || e.code === 22);

export const localPatternRepository: PatternRepository = {
  async list() {
    return Object.entries(readLibrary())
      .map(([id, e]): PatternSummary => ({ id, name: e.name, w: e.w, h: e.h, updatedAt: e.updated, designer: e.designer }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  },
  async load(id) {
    const e = readLibrary()[id];
    return e ? (JSON.parse(e.data) as PatternFile) : null;
  },
  async save(doc) {
    const lib = readLibrary();
    lib[doc.id] = { name: doc.name, updated: Date.now(), w: doc.w, h: doc.h, designer: doc.meta?.designer, data: JSON.stringify(doc) };
    try {
      localStorage.setItem(LIBRARY_KEY, JSON.stringify(lib));
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: isQuota(e) ? "quota" : "error" };
    }
  },
  async remove(id) {
    const lib = readLibrary();
    delete lib[id];
    try {
      localStorage.setItem(LIBRARY_KEY, JSON.stringify(lib));
    } catch {}
  },
};

export const localDraftStore: DraftStore = {
  load() {
    try {
      const s = localStorage.getItem(CURRENT_KEY);
      return s ? (JSON.parse(s) as PatternFile) : null;
    } catch {
      return null;
    }
  },
  save(doc) {
    try {
      localStorage.setItem(CURRENT_KEY, JSON.stringify(doc));
    } catch {}
  },
};
