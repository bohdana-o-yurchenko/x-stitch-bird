import type { CustomColor } from "@/core/pattern/types";
import { sql } from "./db";

/** One user's own threads and beads in Postgres (SPEC §15.28). Every query is scoped to the user. */

const TEXT = 120;
const ok = (v: unknown, max = TEXT) => typeof v === "string" && v.trim().length > 0 && v.length <= max;

/** A thread as the app writes it (a pattern's custom colour); anything else is refused. */
export function validThread(v: unknown, id: string): v is CustomColor {
  const c = v as Partial<CustomColor> | null;
  return !!c && c.id === id && id.startsWith("custom:") && (c.kind === "thread" || c.kind === "bead") && ok(c.brand) && ok(c.code, 40) && typeof c.name === "string" && c.name.length <= TEXT && /^#[0-9A-Fa-f]{6}$/.test(c.hex ?? "");
}

export async function listThreads(userId: string): Promise<CustomColor[]> {
  const rows = await sql`select id, kind, brand, code, name, hex from threads where user_id = ${userId} order by brand, code`;
  return rows.map((r) => ({ id: r.id, kind: r.kind, brand: r.brand, code: r.code, name: r.name, hex: r.hex, ...(r.kind === "bead" ? { series: "Custom" } : {}) }));
}

export async function putThread(userId: string, c: CustomColor): Promise<void> {
  await sql`
    insert into threads (user_id, id, kind, brand, code, name, hex, updated_at)
    values (${userId}, ${c.id}, ${c.kind}, ${c.brand.trim()}, ${c.code.trim()}, ${c.name}, ${c.hex.toUpperCase()}, now())
    on conflict (user_id, id) do update set kind = excluded.kind, brand = excluded.brand, code = excluded.code, name = excluded.name, hex = excluded.hex, updated_at = now()`;
}

export async function deleteThread(userId: string, id: string): Promise<void> {
  await sql`delete from threads where user_id = ${userId} and id = ${id}`;
}
