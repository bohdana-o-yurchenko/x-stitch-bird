import { gunzipSync, gzipSync } from "node:zlib";
import type { FileVersion, PatternFile } from "@/core/formats/json/serialize";
import { snapshotsToDelete } from "@/core/snapshots/retention";
import { sql } from "./db";

export type { FileVersion };

/*
 * One pattern open in several windows or devices (SPEC §15.34): which window edits, the others following it, and
 * the pattern's versions from every device in one history.
 */

/** A window that hasn't checked in for this long has gone (closed, asleep, offline). */
const ALIVE = "15 seconds";

export interface LiveState {
  rev: number;
  /** "me": this window edits; "other": another live window does; null: nobody does. */
  editor: "me" | "other" | null;
  /** Another window took over from this one: save what you have, then say so (`release`). */
  handOver: boolean;
  /** A window that was editing hasn't handed over yet: wait for its last changes. */
  waiting: boolean;
  /** Other windows that have the pattern open. */
  others: number;
}

/**
 * A window checks in (every few seconds while the pattern is open) and learns the pattern's state. `editing`: it is
 * the editing window and still here. Null when the account doesn't have the pattern.
 */
export async function checkIn(userId: string, patternId: string, windowId: string, editing: boolean): Promise<LiveState | null> {
  const rows = await sql`
    with seen as (
      insert into pattern_windows (user_id, pattern_id, window_id, seen_at)
      select user_id, id, ${windowId}, now() from patterns where user_id = ${userId} and id = ${patternId}
      on conflict (user_id, pattern_id, window_id) do update set seen_at = now()
      returning 1
    ), kept as (
      update patterns set editor_at = now()
      where ${editing} and user_id = ${userId} and id = ${patternId} and editor = ${windowId}
      returning 1
    )
    select rev, editor, handoff_from, (editor_at > now() - ${ALIVE}::interval or exists (select 1 from kept)) as alive,
      -- the window asked to hand over is still here (gone or offline: no use waiting for it)
      exists (select 1 from pattern_windows h
        where h.user_id = ${userId} and h.pattern_id = ${patternId} and h.window_id = patterns.handoff_from and h.seen_at > now() - ${ALIVE}::interval) as handing,
      (select count(*)::int from pattern_windows w
        where w.user_id = ${userId} and w.pattern_id = ${patternId} and w.window_id <> ${windowId} and w.seen_at > now() - ${ALIVE}::interval) as others
    from patterns where user_id = ${userId} and id = ${patternId}`;
  const r = rows[0];
  if (!r) return null;
  // now and then: windows long gone
  if (Math.random() < 0.05) await sql`delete from pattern_windows where user_id = ${userId} and seen_at < now() - interval '1 hour'`;
  const mine = r.editor === windowId;
  return {
    rev: r.rev as number,
    editor: mine ? "me" : r.editor && r.alive ? "other" : null,
    handOver: r.handoff_from === windowId,
    waiting: mine && !!r.handoff_from && !!r.handing,
    others: r.others as number,
  };
}

/**
 * This window starts editing. When another live window was, it is asked to hand over (save first); `waiting` says
 * whether to wait for that. Null when the account doesn't have the pattern.
 */
export async function claim(userId: string, patternId: string, windowId: string): Promise<{ waiting: boolean } | null> {
  const rows = await sql`
    update patterns p set editor = ${windowId}, editor_at = now(),
      handoff_from = case when p.editor is not null and p.editor <> ${windowId} and p.editor_at > now() - ${ALIVE}::interval then p.editor else null end
    where user_id = ${userId} and id = ${patternId}
    returning handoff_from`;
  return rows[0] ? { waiting: !!rows[0].handoff_from } : null;
}

/** The window that was editing has saved what it had: the new one can go on. */
export async function release(userId: string, patternId: string, windowId: string): Promise<void> {
  await sql`update patterns set handoff_from = null where user_id = ${userId} and id = ${patternId} and handoff_from = ${windowId}`;
}

/** The pattern's versions in the account: times and reasons, oldest first. */
export async function listVersions(userId: string, patternId: string): Promise<{ time: number; reason: string }[]> {
  const rows = await sql`select time, reason from pattern_versions where user_id = ${userId} and pattern_id = ${patternId} order by time`;
  return rows.map((r) => ({ time: Number(r.time), reason: r.reason as string }));
}

export async function getVersions(userId: string, patternId: string, times: number[]): Promise<FileVersion[]> {
  if (!times.length) return [];
  const rows = await sql`select time, reason, doc from pattern_versions where user_id = ${userId} and pattern_id = ${patternId} and time = any(${times.map(String)}::bigint[])`;
  return rows.map((r) => ({ time: Number(r.time), reason: r.reason as string, doc: JSON.parse(gunzipSync(r.doc as Buffer).toString("utf8")) as PatternFile }));
}

/**
 * Versions from a device join the account's (ones it has are kept), then the history is thinned the same way every
 * browser thins its own (SPEC §15.7), so all devices end up with the same versions. False: no such pattern.
 */
export async function addVersions(userId: string, patternId: string, versions: FileVersion[]): Promise<boolean> {
  const exists = await sql`select 1 from patterns where user_id = ${userId} and id = ${patternId}`;
  if (!exists.length) return false;
  for (const v of versions) {
    const doc = gzipSync(JSON.stringify(v.doc));
    await sql`insert into pattern_versions (user_id, pattern_id, time, reason, doc) values (${userId}, ${patternId}, ${v.time}, ${v.reason}, ${doc}) on conflict do nothing`;
  }
  const times = (await listVersions(userId, patternId)).map((v) => v.time);
  const drop = snapshotsToDelete(times, Date.now());
  if (drop.length) await sql`delete from pattern_versions where user_id = ${userId} and pattern_id = ${patternId} and time = any(${drop.map(String)}::bigint[])`;
  return true;
}
