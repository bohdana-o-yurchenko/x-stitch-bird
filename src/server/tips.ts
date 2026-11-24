import { mergeTipState, validTipState, type TipState } from "@/core/tips/tips";
import { sql } from "./db";

export { validTipState };

/** A signed-in user's tip of the day state (SPEC §15.60) in Postgres; every query is scoped to the user. */

export async function getTips(userId: string): Promise<TipState | null> {
  const rows = await sql`select state from user_tips where user_id = ${userId}`;
  const s: unknown = rows[0]?.state;
  return validTipState(s) ? s : null;
}

/**
 * Saves a browser's state merged into the account's (another device may have saved since): nothing seen or used
 * there is lost. Returns what the account holds now.
 */
export async function putTips(userId: string, s: TipState): Promise<TipState> {
  const had = await getTips(userId);
  const next = had ? mergeTipState(had, s) : s;
  await sql`
    insert into user_tips (user_id, state, updated_at) values (${userId}, ${JSON.stringify(next)}::jsonb, now())
    on conflict (user_id) do update set state = excluded.state, updated_at = now()`;
  return next;
}
