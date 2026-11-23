import type { UsageRow, UsageTotal } from "@/core/usage/featureUsage";
import { sql } from "./db";

export { DAY, parseUsage } from "@/core/usage/featureUsage";

/** Feature usage (SPEC §15.54) in Postgres: counts only, summed per UTC day — nothing about who. */

/** Adds a batch to today's counts: one statement however many features it has. */
export async function addUsage(rows: readonly UsageRow[]): Promise<void> {
  if (!rows.length) return;
  await sql`
    insert into feature_usage as u (day, feature, signed_in, clicks, keys)
    select (now() at time zone 'utc')::date, f, s, c, k
    from unnest(${rows.map((r) => r[0])}::text[], ${rows.map((r) => r[1])}::boolean[], ${rows.map((r) => r[2])}::int[], ${rows.map((r) => r[3])}::int[]) as t(f, s, c, k)
    on conflict (day, feature, signed_in) do update set clicks = u.clicks + excluded.clicks, keys = u.keys + excluded.keys`;
}

/** Totals per feature for days `from`…`to` (inclusive, UTC; either open), the most used first. */
export async function usageTotals(from: string | null, to: string | null): Promise<UsageTotal[]> {
  const rows = await sql`
    select feature,
      coalesce(sum(clicks) filter (where not signed_in), 0)::int as c_out, coalesce(sum(keys) filter (where not signed_in), 0)::int as k_out,
      coalesce(sum(clicks) filter (where signed_in), 0)::int as c_in, coalesce(sum(keys) filter (where signed_in), 0)::int as k_in
    from feature_usage
    where day >= coalesce(${from}::date, '-infinity') and day <= coalesce(${to}::date, 'infinity')
    group by feature order by sum(clicks + keys) desc, feature`;
  return rows.map((r) => ({ feature: r.feature as string, clicksOut: r.c_out as number, keysOut: r.k_out as number, clicksIn: r.c_in as number, keysIn: r.k_in as number }));
}
