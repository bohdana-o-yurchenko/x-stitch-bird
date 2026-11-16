import type { PatternFile } from "@/core/formats/json/serialize";
import { sql } from "./db";
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
}

const MAX_DOC = 20_000_000;

export async function listPatterns(userId: string): Promise<CloudSummary[]> {
  const rows = await sql`select id, name, w, h, designer, preview_key, updated_at from patterns where user_id = ${userId} order by updated_at desc`;
  return rows.map((r) => ({ id: r.id, name: r.name, w: r.w, h: r.h, ...(r.designer ? { designer: r.designer } : {}), updatedAt: new Date(r.updated_at).getTime(), hasPreview: !!r.preview_key }));
}

export async function getPattern(userId: string, id: string): Promise<PatternFile | null> {
  const rows = await sql`select doc from patterns where user_id = ${userId} and id = ${id}`;
  return (rows[0]?.doc as PatternFile | undefined) ?? null;
}

/** A pattern file as the app writes it; anything else is refused. */
export function validPattern(v: unknown, id: string): v is PatternFile {
  const d = v as Partial<PatternFile> | null;
  return !!d && d.app === "stitchwork" && d.id === id && typeof d.name === "string" && Number.isInteger(d.w) && Number.isInteger(d.h) && JSON.stringify(d).length < MAX_DOC;
}

export async function putPattern(userId: string, doc: PatternFile): Promise<number> {
  const rows = await sql`
    insert into patterns (user_id, id, name, w, h, designer, doc, updated_at)
    values (${userId}, ${doc.id}, ${doc.name}, ${doc.w}, ${doc.h}, ${doc.meta?.designer ?? null}, ${JSON.stringify(doc)}::jsonb, now())
    on conflict (user_id, id) do update set name = excluded.name, w = excluded.w, h = excluded.h, designer = excluded.designer, doc = excluded.doc, updated_at = now()
    returning updated_at`;
  return new Date(rows[0]!.updated_at).getTime();
}

export async function deletePattern(userId: string, id: string): Promise<void> {
  const rows = await sql`delete from patterns where user_id = ${userId} and id = ${id} returning preview_key`;
  const key = rows[0]?.preview_key as string | undefined;
  if (key) await assets.delete(key).catch(() => {});
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
