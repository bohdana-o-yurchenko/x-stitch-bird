import { indexedDbReferenceRepository, indexedDbSnapshotRepository } from "./local/indexedDbRepositories";
import { localDraftStore, localPatternRepository } from "./local/localStorageRepositories";
import type { Persistence } from "./ports";

/** The one place that chooses where things are stored. Signed-in users will get API repositories here. */
export function createPersistence(): Persistence {
  return {
    patterns: localPatternRepository,
    references: indexedDbReferenceRepository,
    draft: localDraftStore,
    snapshots: indexedDbSnapshotRepository,
  };
}

export type * from "./ports";
