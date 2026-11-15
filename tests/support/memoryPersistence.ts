import type { ImageRepository, Persistence, Snapshot } from "@/persistence/ports";

function memoryImages(): ImageRepository {
  const blobs = new Map<string, Blob>();
  return {
    put: async (b) => {
      const id = `img:${blobs.size + 1}`;
      blobs.set(id, b);
      return id;
    },
    get: async (id) => blobs.get(id) ?? null,
    collectGarbage: async () => {},
  };
}

/** Storage for editor tests. Snapshots live in `snaps`, so tests can look at and seed them. */
export function memoryPersistence(snaps: Snapshot[] = []): Persistence {
  return {
    patterns: { list: async () => [], load: async () => null, save: async () => ({ ok: true }), remove: async () => {} },
    references: { load: async () => [], save: async () => ({ ok: true }) },
    underlays: { load: async () => null, save: async () => ({ ok: true }) },
    draft: { load: () => null, save: () => {} },
    snapshots: {
      add: async (s) => {
        const i = snaps.findIndex((x) => x.projectId === s.projectId && x.time === s.time);
        if (i >= 0) snaps[i] = s;
        else snaps.push(s);
      },
      list: async (projectId) => snaps.filter((s) => s.projectId === projectId).sort((a, b) => b.time - a.time).map(({ data: _, ...rest }) => rest),
      get: async (projectId, time) => snaps.find((s) => s.projectId === projectId && s.time === time) ?? null,
      removeMany: async (keys) => {
        for (const [projectId, time] of keys) {
          const i = snaps.findIndex((s) => s.projectId === projectId && s.time === time);
          if (i >= 0) snaps.splice(i, 1);
        }
      },
    },
    images: memoryImages(),
  };
}
