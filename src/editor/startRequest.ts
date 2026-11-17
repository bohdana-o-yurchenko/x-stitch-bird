/*
 * A file picked on the patterns page for the editor to take on arrival (SPEC §15.26): a picture to turn into a
 * pattern, or a work file to open. Kept in memory across the page change (the app doesn't reload), so the file
 * itself needn't go anywhere.
 */
export type StartRequest = { kind: "image" | "file"; file: File };

let pending: StartRequest | null = null;

export function requestStart(r: StartRequest) {
  pending = r;
}

/** The waiting request, once: taking it clears it. */
export function takeStartRequest(): StartRequest | null {
  const r = pending;
  pending = null;
  return r;
}
