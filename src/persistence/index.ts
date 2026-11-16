import { indexedDbReferenceRepository, indexedDbSnapshotRepository, indexedDbUnderlayRepository } from "./local/indexedDbRepositories";
import { indexedDbImageRepository } from "./local/indexedDbImages";
import { indexedDbDraftStore, indexedDbPatternRepository } from "./local/browserLibrary";
import type { Persistence } from "./ports";

/** The one place that chooses where things are stored. Signed-in users will get API repositories here. */
export function createPersistence(): Persistence {
  return {
    patterns: indexedDbPatternRepository,
    references: indexedDbReferenceRepository,
    underlays: indexedDbUnderlayRepository,
    draft: indexedDbDraftStore,
    snapshots: indexedDbSnapshotRepository,
    images: indexedDbImageRepository,
  };
}

export type * from "./ports";
