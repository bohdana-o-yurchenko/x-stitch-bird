import { indexedDbReferenceRepository, indexedDbSnapshotRepository, indexedDbUnderlayRepository } from "./local/indexedDbRepositories";
import { indexedDbImageRepository } from "./local/indexedDbImages";
import { indexedDbDraftStore, indexedDbPatternRepository } from "./local/browserLibrary";
import { withAccount } from "./cloud/accountPatterns";
import type { Persistence } from "./ports";

/** The one place that chooses where things are stored. Signed-in users will get API repositories here. */
export function createPersistence(): Persistence {
  return {
    patterns: withAccount(indexedDbPatternRepository),
    references: indexedDbReferenceRepository,
    underlays: indexedDbUnderlayRepository,
    draft: indexedDbDraftStore,
    snapshots: indexedDbSnapshotRepository,
    images: indexedDbImageRepository,
  };
}

export type * from "./ports";
export { account, accountPatternApi } from "./cloud/accountPatterns";
export { accountThreadApi } from "./cloud/accountThreads";
