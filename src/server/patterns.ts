import { parsePattern } from "@/core/formats/json/parse";
import type { PatternFile } from "@/core/formats/json/serialize";
import { patternStats, type PatternDetails, type PatternStats } from "@/core/pattern/stats";
import { MAX_SIZE } from "@/core/pattern/createPattern";
import { ALL_SYMBOLS } from "@/core/symbols/symbols";
import { sql } from "./db";
import { MAX_PATTERNS } from "./limits";
import { collectPictures } from "./pictures";
import { assets } from "./storage";

/** One user's saved patterns in Postgres (SPEC §15.23). Every query is scoped to the user. */

export interface CloudSummary {
  id: string;
  name: string;
  w: number;
  h: number;
  designer?: string;
  updatedAt: number;
  hasPreview: boolean;
  /** The patterns list's figures (SPEC §15.36). */
  details?: PatternDetails;
}

/** The figures of a pattern file; null when it can't be read. */
function statsOf(doc: unknown): PatternStats | null {
  try {
    return patternStats(parsePattern(doc, ALL_SYMBOLS).pattern);
  } catch {
    return null;
  }
}

const MAX_DOC = 20_000_000;

export async function listPatterns(userId: string): Promise<CloudSummary[]> {
  const rows = await sql`
    select p.id, p.name, p.w, p.h, p.designer, p.preview_key, p.updated_at, p.stats, octet_length(p.doc::text) as bytes,
      coalesce(jsonb_array_length(p.refs), 0) + (case when p.underlay is null then 0 else 1 end) as photo_count,
      (select coalesce(sum(i.size), 0)::bigint from pictures i
        where i.user_id = p.user_id and (coalesce(p.refs::text, '') || coalesce(p.underlay::text, '')) like '%' || i.id || '%') as photo_bytes,
      (select count(*)::int from pattern_versions v where v.user_id = p.user_id and v.pattern_id = p.id) as versions
    from patterns p where p.user_id = ${userId} order by p.updated_at desc`;
  // saved before the figures were kept: worked out once, now
  for (const r of rows.filter((r) => !r.stats)) {
    const doc = (await sql`select doc from patterns where user_id = ${userId} and id = ${r.id}`)[0]?.doc;
    r.stats = statsOf(doc);
    if (r.stats) await sql`update patterns set stats = ${JSON.stringify(r.stats)}::jsonb where user_id = ${userId} and id = ${r.id}`;
  }
  return rows.map((r) => ({
    id: r.id, name: r.name, w: r.w, h: r.h, ...(r.designer ? { designer: r.designer } : {}), updatedAt: new Date(r.updated_at).getTime(), hasPreview: !!r.preview_key,
    ...(r.stats && { details: { ...(r.stats as PatternStats), bytes: Number(r.bytes), photos: { count: Number(r.photo_count), bytes: Number(r.photo_bytes) }, versions: r.versions as number } }),
  }));
}

/** The pattern file and its revision (how many saves it has had). */
export async function getPattern(userId: string, id: string): Promise<{ doc: PatternFile; rev: number } | null> {
  const rows = await sql`select doc, rev from patterns where user_id = ${userId} and id = ${id}`;
  return rows[0] ? { doc: rows[0].doc as PatternFile, rev: rows[0].rev as number } : null;
}

/** A pattern file as the app writes it; anything else is refused. */
export function validPattern(v: unknown, id: string): v is PatternFile {
  const d = v as Partial<PatternFile> | null;
  return !!d && d.app === "stitchwork" && d.id === id && typeof d.name === "string" && Number.isInteger(d.w) && Number.isInteger(d.h) && d.w! <= MAX_SIZE && d.h! <= MAX_SIZE && JSON.stringify(d).length < MAX_DOC;
}

export type PutResult =
  | { ok: true; updatedAt: number; rev: number }
  | { ok: false; current: { doc: PatternFile; rev: number } }
  | { ok: false; limit: number };

/**
 * Saves the pattern over revision `base` (SPEC §15.34): refused, with the account's copy, when it has had another save
 * since — a change made elsewhere is never replaced unseen. Without `base` (older app versions) it always saves.
 * `windowId`: the window saving keeps (or takes) the editing.
 */
export async function putPattern(userId: string, doc: PatternFile, base?: number, windowId?: string): Promise<PutResult> {
  // a new pattern only while the account has room (SPEC §15.35); changes to the ones it has always go
  const room = await sql`
    select exists (select 1 from patterns where user_id = ${userId} and id = ${doc.id}) as has,
      (select count(*)::int from patterns where user_id = ${userId}) as n`;
  if (!room[0]!.has && (room[0]!.n as number) >= MAX_PATTERNS) return { ok: false, limit: MAX_PATTERNS };
  const stats = statsOf(doc);
  const rows = await sql`
    insert into patterns (user_id, id, name, w, h, designer, doc, updated_at, rev, editor, editor_at, stats)
    values (${userId}, ${doc.id}, ${doc.name}, ${doc.w}, ${doc.h}, ${doc.meta?.designer ?? null}, ${JSON.stringify(doc)}::jsonb, now(), 1, ${windowId ?? null}, ${windowId ? new Date() : null}, ${stats ? JSON.stringify(stats) : null}::jsonb)
    on conflict (user_id, id) do update set name = excluded.name, w = excluded.w, h = excluded.h, designer = excluded.designer, doc = excluded.doc, stats = excluded.stats,
      updated_at = now(), rev = patterns.rev + 1,
      editor = coalesce(excluded.editor, patterns.editor), editor_at = coalesce(excluded.editor_at, patterns.editor_at)
    where ${base ?? null}::integer is null or patterns.rev = ${base ?? null}::integer
    returning updated_at, rev`;
  if (rows[0]) return { ok: true, updatedAt: new Date(rows[0].updated_at).getTime(), rev: rows[0].rev as number };
  const current = await getPattern(userId, doc.id);
  // gone in between: saved as new
  return current ? { ok: false, current } : putPattern(userId, doc, undefined, windowId);
}

/** What the account holds against its limits (SPEC §15.35). */
export async function usage(userId: string): Promise<{ patterns: number; maxPatterns: number }> {
  const rows = await sql`select count(*)::int as n from patterns where user_id = ${userId}`;
  return { patterns: rows[0]!.n as number, maxPatterns: MAX_PATTERNS };
}

export async function deletePattern(userId: string, id: string): Promise<void> {
  const rows = await sql`delete from patterns where user_id = ${userId} and id = ${id} returning preview_key`;
  const key = rows[0]?.preview_key as string | undefined;
  if (key) await assets.delete(key).catch(() => {});
  // its photos and marks, unless another pattern uses them too
  await collectPictures(userId).catch(() => {});
}

const previewKey = (userId: string, id: string) => `users/${userId}/previews/${encodeURIComponent(id)}.png`;

/** The preview picture: stored in the bucket, its key on the row. False when there is no such pattern. */
export async function putPreview(userId: string, id: string, png: Uint8Array): Promise<boolean> {
  const exists = await sql`select 1 from patterns where user_id = ${userId} and id = ${id}`;
  if (!exists.length) return false;
  const key = previewKey(userId, id);
  await assets.upload(key, png, { contentType: "image/png" });
  await sql`update patterns set preview_key = ${key} where user_id = ${userId} and id = ${id}`;
  return true;
}

/** A short-lived link to the preview picture, or null. */
export async function previewUrl(userId: string, id: string): Promise<string | null> {
  const rows = await sql`select preview_key from patterns where user_id = ${userId} and id = ${id}`;
  const key = rows[0]?.preview_key as string | undefined;
  return key ? assets.url(key, { expiresIn: 600 }) : null;
}
