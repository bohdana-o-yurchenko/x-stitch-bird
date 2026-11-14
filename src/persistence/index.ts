import { indexedDbReferenceRepository, indexedDbSnapshotRepository, indexedDbUnderlayRepository } from "./local/indexedDbRepositories";
import { indexedDbImageRepository } from "./local/indexedDbImages";
import { localDraftStore, localPatternRepository } from "./local/localStorageRepositories";
import type { Persistence } from "./ports";

/** The one place that chooses where things are stored. Signed-in users will get API repositories here. */
export function createPersistence(): Persistence {
  return {
    patterns: localPatternRepository,
    references: indexedDbReferenceRepository,
    underlays: indexedDbUnderlayRepository,
    draft: localDraftStore,
    snapshots: indexedDbSnapshotRepository,
    images: indexedDbImageRepository,
  };
}

export type * from "./ports";
