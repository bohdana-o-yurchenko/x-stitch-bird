import { CHECK_KINDS, MAX_APP_NAME, MAX_NOTE, type CheckRun, type Marks } from "@/core/readerCheck/types";
import { sql } from "./db";

/** A signed-in user's checks of reader apps (SPEC §15.51) in Postgres. Every query is scoped to the user. */

/** Checks one account may keep: one per app and file is plenty. */
export const MAX_CHECKS = 30;
/** Marks in one check: more than any test chart has samples. */
const MAX_MARKS = 200;

const validMarks = (v: unknown): v is Marks =>
  !!v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).length <= MAX_MARKS &&
  Object.entries(v).every(([k, m]) => k.length <= 60 && !!m && typeof m === "object" && (m.v === "ok" || m.v === "issue") && (m.note === undefined || (typeof m.note === "string" && m.note.length <= MAX_NOTE)) && Object.keys(m).every((f) => f === "v" || f === "note"));

/** A check as the app writes it (`updated` is the server's); anything else is refused. */
export function validCheck(v: unknown, id: string): v is Omit<CheckRun, "updated"> {
  const c = v as Partial<CheckRun> | null;
  return !!c && c.id === id && /^[a-z0-9-]{1,40}$/i.test(id) && CHECK_KINDS.includes(c.kind!) && typeof c.app === "string" && c.app.length <= MAX_APP_NAME && validMarks(c.marks);
}

export async function listChecks(userId: string): Promise<CheckRun[]> {
  const rows = await sql`select id, kind, app, marks, updated_at from reader_checks where user_id = ${userId} order by updated_at desc`;
  return rows.map((r) => ({ id: r.id as string, kind: r.kind as CheckRun["kind"], app: r.app as string, marks: r.marks as Marks, updated: new Date(r.updated_at as string).getTime() }));
}

/** Saves a check, new or changed; false when the account already has as many as it may keep. */
export async function putCheck(userId: string, c: Omit<CheckRun, "updated">): Promise<boolean> {
  const rows = await sql`
    insert into reader_checks (user_id, id, kind, app, marks, updated_at)
    select ${userId}, ${c.id}, ${c.kind}, ${c.app.trim()}, ${JSON.stringify(c.marks)}::jsonb, now()
    where exists (select 1 from reader_checks where user_id = ${userId} and id = ${c.id})
       or (select count(*) from reader_checks where user_id = ${userId}) < ${MAX_CHECKS}
    on conflict (user_id, id) do update set kind = excluded.kind, app = excluded.app, marks = excluded.marks, updated_at = now()
    returning id`;
  return rows.length > 0;
}

export async function deleteCheck(userId: string, id: string): Promise<void> {
  await sql`delete from reader_checks where user_id = ${userId} and id = ${id}`;
}
