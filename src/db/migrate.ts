// Apply the SQL migrations in src/db/migrations. Used by `make db-migrate`, the test
// global setup and (later) the production entrypoint. Safe to run repeatedly.
import path from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

/** Dev default; set MIGRATIONS_DIR (or pass `folder`) to point elsewhere, e.g. in a prod image. */
export const defaultMigrationsFolder = path.join(process.cwd(), "src/db/migrations");

async function countApplied(sql: postgres.Sql): Promise<number> {
  const [t] = await sql`SELECT to_regclass('drizzle.__drizzle_migrations') AS t`;
  if (!t.t) return 0;
  const [r] = await sql`SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations`;
  return r.n as number;
}

/** Applies pending migrations and returns how many were applied (0 = already up to date). */
export async function runMigrations(
  url: string,
  folder: string = process.env.MIGRATIONS_DIR ?? defaultMigrationsFolder,
): Promise<number> {
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    const before = await countApplied(sql);
    await migrate(drizzle(sql), { migrationsFolder: folder });
    return (await countApplied(sql)) - before;
  } finally {
    await sql.end();
  }
}
