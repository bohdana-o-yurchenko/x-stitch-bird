import { sql } from "./db";
import { assets } from "./storage";

/**
 * Deletes an account and everything in it (SPEC §15.38): its files in storage (photos, marks, images behind the
 * chart, previews), then the user — and with the user, through the database's cascades, its sessions, patterns,
 * versions, records of pictures and windows, and its own threads and beads. Can't be undone.
 */
export async function deleteAccount(userId: string): Promise<void> {
  for await (const file of assets.listAll({ prefix: `users/${userId}/` })) await assets.delete(file.key).catch(() => {});
  await sql`delete from neon_auth."user" where id = ${userId}`;
}
