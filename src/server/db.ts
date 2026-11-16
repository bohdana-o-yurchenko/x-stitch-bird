import { neon } from "@neondatabase/serverless";

/** Lakebase Postgres over HTTP — one query per request suits serverless route handlers. Pooled connection. */
export const sql = neon(process.env.DATABASE_URL!);
