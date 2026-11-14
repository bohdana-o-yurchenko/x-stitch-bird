const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export interface RetentionPolicy {
  keepLatest: number;
  hourlyFor: number;
  dailyFor: number;
  max: number;
}

export const DEFAULT_RETENTION: RetentionPolicy = { keepLatest: 10, hourlyFor: DAY, dailyFor: 14 * DAY, max: 50 };

/**
 * Which snapshot times to delete (SPEC §15.7): keep the newest N, then one per hour for a day,
 * then one per day for two weeks, and never more than `max` in total.
 */
export function snapshotsToDelete(times: readonly number[], now: number, policy = DEFAULT_RETENTION): number[] {
  const sorted = [...times].sort((a, b) => b - a);
  const keep = new Set(sorted.slice(0, policy.keepLatest));
  const buckets = new Set<string>();
  for (const t of sorted.slice(policy.keepLatest)) {
    const age = now - t;
    const bucket = age <= policy.hourlyFor ? `h${Math.floor(t / HOUR)}` : age <= policy.dailyFor ? `d${Math.floor(t / DAY)}` : null;
    if (bucket && !buckets.has(bucket)) {
      buckets.add(bucket);
      keep.add(t);
    }
  }
  const kept = sorted.filter((t) => keep.has(t)).slice(0, policy.max);
  const keptSet = new Set(kept);
  return sorted.filter((t) => !keptSet.has(t));
}
