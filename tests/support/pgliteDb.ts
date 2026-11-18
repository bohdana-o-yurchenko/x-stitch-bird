import { readdirSync, readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

/**
 * A real Postgres (PGlite, in memory) with the app's own migrations, answering the same tagged-template calls as the
 * Neon driver in src/server/db.ts. Only the sign-in service's user table is a stand-in.
 */
export async function createTestDb() {
  const pg = new PGlite();
  await pg.exec(`create schema neon_auth; create table neon_auth."user" (id uuid primary key default gen_random_uuid(), email text);`);
  const dir = new URL("../../db/migrations/", import.meta.url);
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) await pg.exec(readFileSync(new URL(f, dir), "utf8"));

  const sql = async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.reduce((acc, s, i) => acc + s + (i < values.length ? `$${i + 1}` : ""), "");
    const params = values.map((v) => (v instanceof Buffer ? new Uint8Array(v) : v));
    return (await pg.query<Record<string, unknown>>(text, params)).rows;
  };
  let n = 0;
  return {
    sql,
    pg,
    /** A new account. */
    async user(email = `user${++n}@example.com`): Promise<string> {
      return (await pg.query<{ id: string }>(`insert into neon_auth."user" (email) values ($1) returning id`, [email])).rows[0]!.id;
    },
    async clear() {
      await pg.exec(`delete from neon_auth."user"`);
    },
    close: () => pg.close(),
  };
}

/** The bucket, in memory: the calls the server makes of `assets`. */
export function fakeBucket() {
  const files = new Map<string, { size: number; contentType: string }>();
  return {
    files,
    upload: async (key: string, body: Uint8Array, o: { contentType: string }) => void files.set(key, { size: body.length, contentType: o.contentType }),
    head: async (key: string) => {
      const f = files.get(key);
      if (!f) throw new Error("not found");
      return f;
    },
    delete: async (key: string) => void files.delete(key),
    url: (key: string) => `https://bucket/${key}`,
    signedUploadUrl: async (key: string, o: { maxSize: number; contentType: string }) => ({ url: "https://bucket", key, ...o }),
    async *listAll({ prefix }: { prefix: string }) {
      for (const key of [...files.keys()].filter((k) => k.startsWith(prefix))) yield { key };
    },
  };
}
