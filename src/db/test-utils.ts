// Helpers for integration tests. They only ever talk to the *_test database.
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { databaseName, withDatabaseName } from "./admin";
import * as schema from "./schema";

export function testDatabaseUrl(): string {
  const dev = process.env.DATABASE_URL;
  if (!dev) throw new Error("DATABASE_URL is not set (run tests through `make test`)");
  const name = new URL(dev).pathname.slice(1);
  const base = name.endsWith("_test") ? name.slice(0, -"_test".length) : name;
  return withDatabaseName(dev, `${base}_test`);
}

export function connectTestDb() {
  const url = testDatabaseUrl();
  const name = databaseName(url);
  if (!name.endsWith("_test") || name === databaseName(process.env.DATABASE_URL ?? "")) {
    throw new Error(`refusing to run integration tests against "${name}"`);
  }
  const sql = postgres(url, { max: 4, onnotice: () => {} });
  return { sql, db: drizzle(sql, { schema }) };
}

/** Empty every table in `public` (not only the ones reachable from "user"). */
export async function cleanDatabase(sql: postgres.Sql) {
  const tables = await sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`;
  if (tables.length === 0) return;
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(", ");
  await sql.unsafe(`TRUNCATE TABLE ${list} CASCADE`);
}

/** Run a query and return the Postgres error code (23505 unique, 23503 fk, 23514 check, ...). */
export async function pgErrorCode(run: PromiseLike<unknown>): Promise<string | undefined> {
  try {
    await run;
  } catch (e) {
    const err = e as { code?: string; cause?: { code?: string } };
    return err.cause?.code ?? err.code ?? "unknown";
  }
  return undefined;
}
