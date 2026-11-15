/** No action for this long means a pause: the timer stops (SPEC §15.17). */
export const IDLE_AFTER = 3 * 60_000;

/**
 * Work time between two actions: the whole gap counts, unless it is longer than `idle` — then the user had
 * stopped, and none of it counts. `last` is null before the first action.
 */
export function workGap(last: number | null, now: number, idle = IDLE_AFTER): number {
  if (last === null || now <= last) return 0;
  const gap = now - last;
  return gap > idle ? 0 : gap;
}

/** Whole hours and minutes, for display. */
export function splitDuration(ms: number): { h: number; m: number } {
  const minutes = Math.floor(Math.max(0, ms) / 60_000);
  return { h: Math.floor(minutes / 60), m: minutes % 60 };
}
