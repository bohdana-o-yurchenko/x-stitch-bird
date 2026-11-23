import { sql } from "./db";

/**
 * Roles (SPEC §15.55): the sign-in service's own `role` column on its user table — "admin" there (set by hand in the
 * database) opens the admin pages. Read from the database each time, so it holds even when a session is old.
 * Better Auth may keep several roles comma-separated.
 */
export async function isAdmin(userId: string): Promise<boolean> {
  const rows = await sql`select role from neon_auth."user" where id = ${userId}`;
  const role = rows[0]?.role;
  return typeof role === "string" && role.split(",").map((r) => r.trim()).includes("admin");
}
