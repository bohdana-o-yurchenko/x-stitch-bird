import { indexedDbReferenceRepository, indexedDbSnapshotRepository, indexedDbUnderlayRepository } from "./local/indexedDbRepositories";
import { indexedDbImageRepository } from "./local/indexedDbImages";
import { indexedDbDraftStore, indexedDbPatternRepository } from "./local/browserLibrary";
import { withAccount } from "./cloud/accountPatterns";
import { accountPictures } from "./cloud/accountPictures";
import type { Persistence } from "./ports";

/** The one place that chooses where things are stored. Signed-in users will get API repositories here. */
export function createPersistence(): Persistence {
  const { references, underlays, ...pictures } = accountPictures({ references: indexedDbReferenceRepository, underlays: indexedDbUnderlayRepository, images: indexedDbImageRepository });
  return {
    patterns: withAccount(indexedDbPatternRepository, pictures),
    references,
    underlays,
    draft: indexedDbDraftStore,
    snapshots: indexedDbSnapshotRepository,
    images: indexedDbImageRepository,
    pictures,
  };
}

export type * from "./ports";
export { account, accountPatternApi } from "./cloud/accountPatterns";
export { accountThreadApi } from "./cloud/accountThreads";
