// Helpers for integration tests. They only ever talk to the *_test database.
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { withDatabaseName } from "./admin";
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
  if (!new URL(url).pathname.slice(1).endsWith("_test")) {
    throw new Error("refusing to run integration tests against a non-test database");
  }
  const sql = postgres(url, { max: 4, onnotice: () => {} });
  return { sql, db: drizzle(sql, { schema }) };
}

/** Empty every user-owned table; children go with the `user` rows via ON DELETE CASCADE. */
export async function cleanDatabase(sql: postgres.Sql) {
  await sql`TRUNCATE TABLE "user" CASCADE`;
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
