import { encodeUsage, featureOf, MAX_FEATURES, type UsageRow, type UsageVia } from "@/core/usage/featureUsage";

/** Counts go up at most this often (and when the page is hidden or closed). */
export const USAGE_FLUSH_MS = 10 * 60_000;

/**
 * Feature usage counting (SPEC §15.54). Counting is one Map update: key "<signed in><via><feature>", value a number.
 * Now and then the counts go up in one fire-and-forget request and start again from zero; a request that fails just
 * loses them — nothing is retried, kept or shown.
 */
export class UsageCounter {
  private counts = new Map<string, number>();
  private timer: ReturnType<typeof setTimeout> | null = null;

  /** `tap`: each counted use as it happens — tip of the day keeps its own, per person (SPEC §15.60). */
  constructor(private signedIn: () => boolean, private send: (body: string) => void, private tap?: (feature: string, via: UsageVia) => void) {}

  count(command: string, args: unknown, via: UsageVia): void {
    const feature = featureOf(command, args);
    if (!feature) return;
    this.tap?.(feature, via);
    const key = `${this.signedIn() ? 1 : 0}${via === "key" ? "k" : "c"}${feature}`;
    const n = this.counts.get(key);
    if (n === undefined && this.counts.size >= MAX_FEATURES) return;
    this.counts.set(key, (n ?? 0) + 1);
    this.timer ??= setTimeout(() => this.flush(), USAGE_FLUSH_MS);
  }

  flush(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (!this.counts.size) return;
    const rows = new Map<string, UsageRow>();
    for (const [key, n] of this.counts) {
      const signed = key[0] === "1", feature = key.slice(2), id = key[0] + feature;
      const row = rows.get(id) ?? [feature, signed, 0, 0];
      row[key[1] === "k" ? 3 : 2] += n;
      rows.set(id, row);
    }
    this.counts.clear();
    try {
      this.send(encodeUsage([...rows.values()]));
    } catch {
      // statistics are not worth an error
    }
  }
}
