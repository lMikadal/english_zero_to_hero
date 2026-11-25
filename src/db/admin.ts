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
    if (!row) await sql.unsafe(`CREATE DATABASE ${quote(name)}`);
  });
}

export async function dropDatabase(url: string): Promise<void> {
  const name = databaseName(url);
  await withAdmin(url, (sql) => sql.unsafe(`DROP DATABASE IF EXISTS ${quote(name)} WITH (FORCE)`));
}

export async function recreateDatabase(url: string): Promise<void> {
  await dropDatabase(url);
  await ensureDatabase(url);
}
