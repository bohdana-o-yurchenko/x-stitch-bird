import type { ReferenceRepository, RefWindowData, Snapshot, SnapshotRepository, SnapshotSummary, UnderlayRepository } from "../ports";
import { cleanUnderlay, type UnderlayData } from "@/core/underlay/underlay";
import { run } from "./indexedDb";

const legacyRefsKey = (patternId: string) => `stitchwork.refs.${patternId}`;

/** Reference windows per pattern. Reads (and then removes) the old localStorage copy once (SPEC §11.4). */
export const indexedDbReferenceRepository: ReferenceRepository = {
  async load(patternId) {
    const stored = await run<RefWindowData[]>("refs", "readonly", (s) => s.get(patternId)).catch(() => undefined);
    if (stored) return stored;
    try {
      return JSON.parse(localStorage.getItem(legacyRefsKey(patternId)) || "[]");
    } catch {
      return [];
    }
  },
  async save(patternId, refs) {
    try {
      await run("refs", "readwrite", (s) => (refs.length ? s.put(refs, patternId) : s.delete(patternId)));
      try {
        localStorage.removeItem(legacyRefsKey(patternId));
      } catch {}
      return { ok: true };
    } catch {
      return { ok: false, reason: "quota" };
    }
  },
};

const snapKey = (projectId: string, time: number) => [projectId, time];

export const indexedDbSnapshotRepository: SnapshotRepository = {
  async add(s) {
    await run("snaps", "readwrite", (store) => store.put(s, snapKey(s.projectId, s.time)));
  },
  async list(projectId) {
    const range = IDBKeyRange.bound([projectId, 0], [projectId, Number.MAX_SAFE_INTEGER]);
    const all = (await run<Snapshot[]>("snaps", "readonly", (s) => s.getAll(range))) ?? [];
    return all
      .map((s): SnapshotSummary => ({ projectId: s.projectId, time: s.time, reason: s.reason, w: s.w, h: s.h, thumb: s.thumb }))
      .sort((a, b) => b.time - a.time);
  },
  async get(projectId, time) {
    return (await run<Snapshot>("snaps", "readonly", (s) => s.get(snapKey(projectId, time)))) ?? null;
  },
  async removeMany(keys) {
    if (!keys.length) return;
    await run("snaps", "readwrite", (s) => void keys.forEach(([id, t]) => s.delete(snapKey(id, t))));
  },
};

export const indexedDbUnderlayRepository: UnderlayRepository = {
  async load(patternId) {
    const raw = await run<UnderlayData>("underlays", "readonly", (s) => s.get(patternId)).catch(() => undefined);
    return cleanUnderlay(raw);
  },
  async save(patternId, underlay) {
    try {
      await run("underlays", "readwrite", (s) => (underlay ? s.put(underlay, patternId) : s.delete(patternId)));
      return { ok: true };
    } catch {
      return { ok: false, reason: "quota" };
    }
  },
};
