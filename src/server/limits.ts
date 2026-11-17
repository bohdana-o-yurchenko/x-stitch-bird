/*
 * What one account may keep (SPEC §15.35), sized to the Neon free plan (1 GB Postgres, 5 GB object storage per
 * project). Over a limit nothing is lost: the work stays in the browser, and the app says what to remove.
 */

/** Patterns in the account. Saving one more (a new pattern) is refused; changing those it has never is. */
export const MAX_PATTERNS = 20;
/** Photos attached to the account's patterns: photos, their marks, images behind the chart (each counted once). */
export const PHOTO_QUOTA = 100 * 1024 * 1024;
/** The account's versions, all patterns together; past it the oldest versions of the least recently changed go. */
export const VERSIONS_QUOTA = 25 * 1024 * 1024;
