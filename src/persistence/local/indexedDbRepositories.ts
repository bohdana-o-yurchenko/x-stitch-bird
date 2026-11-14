import type { ReferenceRepository, RefWindowData, Snapshot, SnapshotRepository, SnapshotSummary, UnderlayRepository } from "../ports";
import { cleanUnderlay } from "@/core/underlay/underlay";
import { isDataUrl } from "../blobs";
import { run } from "./indexedDb";
import { storeIfDataUrl } from "./indexedDbImages";

const legacyRefsKey = (patternId: string) => `stitchwork.refs.${patternId}`;

type StoredRef = RefWindowData & { src?: string };

/** Older records kept the photo and marks inline as data URLs (`src`); they move into the image store once. */
async function upgradeRefs(list: StoredRef[]): Promise<{ refs: RefWindowData[]; changed: boolean }> {
  let changed = false;
  const refs: RefWindowData[] = [];
  for (const r of list) {
    if (!r) continue;
    const old = isDataUrl(r.src) || isDataUrl(r.marks);
    const image = await storeIfDataUrl(r.image ?? r.src);
    if (!image) continue;
    const ref = { ...r };
    delete ref.src;
    refs.push({ ...ref, image, marks: await storeIfDataUrl(r.marks) });
    changed ||= old;
  }
  return { refs, changed };
}

/** Reference windows per pattern. Reads (and then removes) the old localStorage copy once (SPEC §11.4). */
export const indexedDbReferenceRepository: ReferenceRepository = {
  async load(patternId) {
    let stored = await run<StoredRef[]>("refs", "readonly", (s) => s.get(patternId)).catch(() => undefined);
    let fromLegacy = false;
    if (!stored)
      try {
        stored = JSON.parse(localStorage.getItem(legacyRefsKey(patternId)) || "[]") as StoredRef[];
        fromLegacy = stored.length > 0;
      } catch {
        stored = [];
      }
    const { refs, changed } = await upgradeRefs(stored);
    if (changed || fromLegacy) await this.save(patternId, refs);
    return refs;
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
    const u = cleanUnderlay(await run<unknown>("underlays", "readonly", (s) => s.get(patternId)).catch(() => undefined));
    if (!u || (!isDataUrl(u.image) && !isDataUrl(u.straighten?.source))) return u;
    // older records kept the picture inline as a data URL
    const image = (await storeIfDataUrl(u.image))!;
    const upgraded = { ...u, image, ...(u.straighten && { straighten: { ...u.straighten, source: (await storeIfDataUrl(u.straighten.source))! } }) };
    await this.save(patternId, upgraded);
    return upgraded;
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
