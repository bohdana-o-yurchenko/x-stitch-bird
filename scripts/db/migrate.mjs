// Applies db/migrations/*.sql in order, once each (recorded in public.schema_migrations).
// Usage: node scripts/db/migrate.mjs --target <database host>
// (reads DATABASE_URL from the environment or .env.local). Naming the host is required: run without it, the script
// only says which database it would change — so it never touches one (production!) by accident.
import { neon } from "@neondatabase/serverless";
import { readdirSync, readFileSync, existsSync } from "node:fs";

if (!process.env.DATABASE_URL && existsSync(".env.local"))
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
  }
// migrations change the schema: the direct (unpooled) connection
const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) throw new Error("No DATABASE_URL: copy .env.example to .env.local and fill it in");
const host = new URL(url).hostname;
const target = process.argv[process.argv.indexOf("--target") + 1];
if (!process.argv.includes("--target") || target !== host) {
  console.log(`This would change the database at ${host} (branch: ${process.env.NEON_BRANCH ?? "not named"}).`);
  console.log(`If that is the one you mean, run: node scripts/db/migrate.mjs --target ${host}`);
  process.exit(1);
}
const sql = neon(url);
await sql`create table if not exists public.schema_migrations (name text primary key, applied_at timestamptz not null default now())`;
const done = new Set((await sql`select name from public.schema_migrations`).map((r) => r.name));
for (const file of readdirSync("db/migrations").filter((f) => f.endsWith(".sql")).sort()) {
  if (done.has(file)) continue;
  const text = readFileSync(`db/migrations/${file}`, "utf8");
  const statements = text.split(/;\s*$/m).map((s) => s.replace(/^\s*--.*$/gm, "").trim()).filter(Boolean);
  await sql.transaction(statements.map((s) => sql.query(s)).concat([sql`insert into public.schema_migrations (name) values (${file})`]));
  console.log(`applied ${file}`);
}
console.log("schema up to date");
