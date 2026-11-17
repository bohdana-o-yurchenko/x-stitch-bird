import { sql } from "./db";
import { PHOTO_QUOTA } from "./limits";
import { assets } from "./storage";

/*
 * A pattern's pictures in the account (SPEC §15.33): photos, their marks and the image behind the chart, in the
 * "assets" bucket as they came (never scaled down); the records that use them on the pattern's row. The browser
 * uploads straight to the bucket through a signed form, so photo size isn't limited by the app's own server.
 */

/** Largest picture taken: all the room an account has for photos (SPEC §15.35). */
export const MAX_PICTURE = PHOTO_QUOTA;
/** Pictures nothing uses are removed only after this long: their record may be on its way. */
const GRACE = "1 day";
const MAX_RECORDS = 1_000_000;
const MAX_WINDOWS = 100;

const ID = /^img:[0-9a-f]{32}$/;
export const isPictureId = (v: unknown): v is string => typeof v === "string" && ID.test(v);
export const isPictureType = (v: unknown): v is string => typeof v === "string" && /^(image\/[a-z0-9.+-]+|application\/octet-stream)$/.test(v);

const pictureKey = (userId: string, id: string) => `users/${userId}/pictures/${id.slice(4)}`;

export interface PatternPictures {
  refs: unknown[];
  underlay: unknown;
  rev: number;
}

/** Every picture id the records use: window photos and marks, the underlay and its straighten source. */
export function pictureIds(refs: unknown[], underlay: unknown): string[] {
  const ids = new Set<string>();
  for (const r of refs as { image?: unknown; marks?: unknown }[]) {
    if (isPictureId(r?.image)) ids.add(r.image);
    if (isPictureId(r?.marks)) ids.add(r.marks);
  }
  const u = underlay as { image?: unknown; straighten?: { source?: unknown } } | null;
  if (isPictureId(u?.image)) ids.add(u.image);
  if (isPictureId(u?.straighten?.source)) ids.add(u.straighten.source);
  return [...ids];
}

/** Records as the app writes them: windows each with a stored photo, an underlay with its picture, or none. */
export function validPictures(refs: unknown, underlay: unknown): refs is unknown[] {
  if (!Array.isArray(refs) || refs.length > MAX_WINDOWS) return false;
  const ok = refs.every((r) => r && typeof r === "object" && isPictureId((r as { image?: unknown }).image) && ((r as { marks?: unknown }).marks == null || isPictureId((r as { marks?: unknown }).marks)));
  const u = underlay as { image?: unknown; straighten?: { source?: unknown } } | null;
  const okUnderlay = u === null || (typeof u === "object" && isPictureId(u.image) && (u.straighten == null || isPictureId(u.straighten.source)));
  return ok && okUnderlay && JSON.stringify([refs, underlay]).length < MAX_RECORDS;
}

/** Of these pictures, the ones the account doesn't have. */
export async function missingPictures(userId: string, ids: string[]): Promise<string[]> {
  if (!ids.length) return [];
  const rows = await sql`select id from pictures where user_id = ${userId} and id = any(${ids})`;
  const have = new Set(rows.map((r) => r.id as string));
  return ids.filter((id) => !have.has(id));
}

/**
 * Bytes of photos the account holds for its patterns (SPEC §15.35): pictures a pattern uses, each once, and ones
 * uploaded within the last hour that no record uses yet (on their way). Old marks and removed photos don't count.
 */
export async function photoUsage(userId: string, except?: string): Promise<number> {
  const rows = await sql`
    select coalesce(sum(i.size), 0)::bigint as used from pictures i
    where i.user_id = ${userId} and i.id <> ${except ?? ""} and (
      i.created_at > now() - interval '1 hour'
      or exists (select 1 from patterns p where p.user_id = ${userId} and (coalesce(p.refs::text, '') || coalesce(p.underlay::text, '')) like '%' || i.id || '%')
    )`;
  return Number(rows[0]!.used);
}

export type Room = { ok: true } | { ok: false; used: number; max: number };

/** Whether a picture of `size` bytes still fits in the account's room for photos. */
export async function photoRoom(userId: string, size: number, except?: string): Promise<Room> {
  const used = await photoUsage(userId, except);
  return used + size <= PHOTO_QUOTA ? { ok: true } : { ok: false, used, max: PHOTO_QUOTA };
}

/** Where the browser sends a picture: a signed form, valid for a while, that takes at most MAX_PICTURE bytes. */
export function pictureUploadTarget(userId: string, id: string, type: string) {
  return assets.signedUploadUrl(pictureKey(userId, id), { expiresIn: 3600, maxSize: MAX_PICTURE, contentType: type });
}

/**
 * After an upload: the picture counts as in the account only once the bucket really has it — and only if it fits;
 * one that doesn't is taken out again (the browser keeps it).
 */
export async function confirmPicture(userId: string, id: string): Promise<true | false | Room> {
  const info = await assets.head(pictureKey(userId, id)).catch(() => null);
  if (!info || !info.size) return false;
  const known = await sql`select 1 from pictures where user_id = ${userId} and id = ${id}`;
  if (!known.length) {
    const room = await photoRoom(userId, info.size, id);
    if (!room.ok) {
      await assets.delete(pictureKey(userId, id)).catch(() => {});
      return room;
    }
  }
  await sql`insert into pictures (user_id, id, size, type) values (${userId}, ${id}, ${info.size}, ${info.contentType}) on conflict do nothing`;
  return true;
}

/** A short-lived link to download a picture, or null when the account doesn't have it. */
export async function pictureUrl(userId: string, id: string): Promise<string | null> {
  const rows = await sql`select 1 from pictures where user_id = ${userId} and id = ${id}`;
  return rows.length ? assets.url(pictureKey(userId, id), { expiresIn: 3600 }) : null;
}

/** The pattern's windows and underlay as the account has them; null when the account doesn't have the pattern. */
export async function getPatternPictures(userId: string, patternId: string): Promise<PatternPictures | null> {
  const rows = await sql`select refs, underlay, pictures_rev from patterns where user_id = ${userId} and id = ${patternId}`;
  const r = rows[0];
  return r ? { refs: (r.refs as unknown[] | null) ?? [], underlay: r.underlay ?? null, rev: r.pictures_rev as number } : null;
}

export type PutPicturesResult =
  | { ok: true; rev: number }
  | { ok: false; reason: "notFound" }
  | { ok: false; reason: "conflict"; current: PatternPictures }
  | { ok: false; reason: "missing"; missing: string[] };

/**
 * Stores the records over revision `base`. Refused when someone else changed them since (the caller gets theirs to
 * merge), or when a picture they use isn't in the account yet (the caller uploads it first) — so the account never
 * points at a picture it doesn't have.
 */
export async function putPatternPictures(userId: string, patternId: string, refs: unknown[], underlay: unknown, base: number): Promise<PutPicturesResult> {
  const current = await getPatternPictures(userId, patternId);
  if (!current) return { ok: false, reason: "notFound" };
  if (current.rev !== base) return { ok: false, reason: "conflict", current };
  const missing = await missingPictures(userId, pictureIds(refs, underlay));
  if (missing.length) return { ok: false, reason: "missing", missing };
  const rows = await sql`
    update patterns set refs = ${JSON.stringify(refs)}::jsonb, underlay = ${underlay === null ? null : JSON.stringify(underlay)}::jsonb, pictures_rev = pictures_rev + 1
    where user_id = ${userId} and id = ${patternId} and pictures_rev = ${base}
    returning pictures_rev`;
  if (!rows.length) {
    const now = await getPatternPictures(userId, patternId);
    return now ? { ok: false, reason: "conflict", current: now } : { ok: false, reason: "notFound" };
  }
  return { ok: true, rev: rows[0]!.pictures_rev as number };
}

/** Removes the user's pictures no pattern uses any more (old marks, replaced photos, deleted patterns). */
export async function collectPictures(userId: string): Promise<void> {
  const rows = await sql`
    select i.id from pictures i
    where i.user_id = ${userId} and i.created_at < now() - ${GRACE}::interval
      and not exists (
        select 1 from patterns p
        where p.user_id = ${userId} and (coalesce(p.refs::text, '') || coalesce(p.underlay::text, '')) like '%' || i.id || '%'
      )`;
  for (const r of rows) {
    const id = r.id as string;
    await assets.delete(pictureKey(userId, id)).catch(() => {});
    await sql`delete from pictures where user_id = ${userId} and id = ${id}`;
  }
}
