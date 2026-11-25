// Create / drop databases (dev reset, test database setup). Connects to the `postgres`
// maintenance database of the same server.
import postgres from "postgres";

export function databaseName(url: string): string {
  return decodeURIComponent(new URL(url).pathname.slice(1));
}

export function withDatabaseName(url: string, name: string): string {
  const u = new URL(url);
  u.pathname = `/${encodeURIComponent(name)}`;
  return u.toString();
}

const quote = (name: string) => `"${name.replace(/"/g, '""')}"`;

async function withAdmin<T>(url: string, fn: (sql: postgres.Sql) => Promise<T>): Promise<T> {
  const sql = postgres(withDatabaseName(url, "postgres"), { max: 1, onnotice: () => {} });
  try {
    return await fn(sql);
  } finally {
    await sql.end();
  }
}

export async function ensureDatabase(url: string): Promise<void> {
  const name = databaseName(url);
  await withAdmin(url, async (sql) => {
    const [row] = await sql`SELECT 1 AS found FROM pg_database WHERE datname = ${name}`;
    if (row) return;
    try {
      await sql.unsafe(`CREATE DATABASE ${quote(name)}`);
    } catch (e) {
      // another process created it between the check and the CREATE: Postgres reports either
      // 42P04 duplicate_database or 23505 (unique violation on pg_database) for that race
      const code = (e as { code?: string }).code;
      if (code !== "42P04" && code !== "23505") throw e;
    }
  });
}

/**
 * Guard for `make db-reset`. Only a database whose name ends in `_dev` may be reset, whatever
 * the host or NODE_ENV, and the caller must type that exact name (CONFIRM=<name>).
 */
export function assertResettable(url: string, confirm: string | undefined): void {
  const name = databaseName(url);
  if (!name.endsWith("_dev") || name === "_dev") {
    throw new Error(`db-reset refuses to touch database "${name}": only names ending in "_dev" can be reset`);
  }
  if (confirm !== name) {
    throw new Error(`db-reset drops and recreates "${name}". To confirm, run: make db-reset CONFIRM=${name}`);
  }
}

export async function dropDatabase(url: string): Promise<void> {
  const name = databaseName(url);
  await withAdmin(url, (sql) => sql.unsafe(`DROP DATABASE IF EXISTS ${quote(name)} WITH (FORCE)`));
}

export async function recreateDatabase(url: string): Promise<void> {
  await dropDatabase(url);
  await ensureDatabase(url);
}
