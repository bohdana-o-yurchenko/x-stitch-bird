import type { UsageTotal } from "@/core/usage/featureUsage";

/**
 * Sends a batch of feature usage counts (SPEC §15.54). A beacon: the browser sends it even as the page closes, never
 * answers back, and nothing waits for it. No beacon (old browser, tests): the counts are dropped.
 */
export function sendUsage(body: string): void {
  if (typeof navigator === "undefined" || typeof navigator.sendBeacon !== "function") return;
  navigator.sendBeacon("/api/stats", new Blob([body], { type: "text/plain" }));
}

/** The stats page's numbers (SPEC §15.55): totals per feature for days `from`…`to`; null when not allowed or offline. */
export async function fetchUsageTotals(from: string | null, to: string | null): Promise<UsageTotal[] | null> {
  const q = new URLSearchParams({ ...(from ? { from } : {}), ...(to ? { to } : {}) });
  try {
    const res = await fetch(`/api/stats?${q}`, { credentials: "same-origin" });
    return res.ok ? ((await res.json()) as UsageTotal[]) : null;
  } catch {
    return null;
  }
}
