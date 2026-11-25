// Shared Drizzle client. Server-only: never import this from a client component.
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

if (typeof window !== "undefined") {
  throw new Error("src/db/client.ts is server-only and must not be bundled for the browser");
}

type Db = PostgresJsDatabase<typeof schema>;
// Next.js dev hot reload re-evaluates modules; keeping the connection on globalThis
// stops it from opening a new pool on every reload.
const globalForDb = globalThis as unknown as { __ezhDb?: { sql: postgres.Sql; db: Db } };

export function getDb(): Db {
  if (!globalForDb.__ezhDb) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set (see .env.example)");
    const sql = postgres(url, { max: 10, connect_timeout: 5 });
    globalForDb.__ezhDb = { sql, db: drizzle(sql, { schema }) };
  }
  return globalForDb.__ezhDb.db;
}

export async function closeDb(): Promise<void> {
  const current = globalForDb.__ezhDb;
  globalForDb.__ezhDb = undefined;
  await current?.sql.end();
}
