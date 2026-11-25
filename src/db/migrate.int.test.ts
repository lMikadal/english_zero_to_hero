// @vitest-environment node
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import { dropDatabase, ensureDatabase, recreateDatabase, withDatabaseName } from "./admin";
import { runMigrations } from "./migrate";
import { testDatabaseUrl } from "./test-utils";

const scratchUrl = withDatabaseName(testDatabaseUrl(), `${new URL(testDatabaseUrl()).pathname.slice(1)}_scratch`);

const EXPECTED_TABLES = [
  "attempts",
  "profiles",
  "progress",
  "push_subscriptions",
  "recordings",
  "reminder_settings",
  "srs_cards",
  "srs_reviews",
  "streaks",
  "user",
];

async function listTables(url: string) {
  const sql = postgres(url, { max: 1 });
  try {
    const rows = await sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY 1`;
    return rows.map((r) => r.table_name as string);
  } finally {
    await sql.end();
  }
}

async function appliedMigrations(url: string) {
  const sql = postgres(url, { max: 1 });
  try {
    const rows = await sql`SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations`;
    return rows[0].n as number;
  } finally {
    await sql.end();
  }
}

describe("migrations", () => {
  afterAll(async () => {
    await dropDatabase(scratchUrl);
  });

  it("apply cleanly to an empty database and are idempotent", async () => {
    await recreateDatabase(scratchUrl);
    expect(await listTables(scratchUrl)).toEqual([]);

    const first = await runMigrations(scratchUrl);
    expect(first).toBeGreaterThan(0);
    expect(await listTables(scratchUrl)).toEqual(EXPECTED_TABLES);
    const applied = await appliedMigrations(scratchUrl);
    expect(applied).toBe(first);

    expect(await runMigrations(scratchUrl)).toBe(0);
    expect(await listTables(scratchUrl)).toEqual(EXPECTED_TABLES);
    expect(await appliedMigrations(scratchUrl)).toBe(applied);
  });

  it("takes the migrations folder from MIGRATIONS_DIR", async () => {
    const before = process.env.MIGRATIONS_DIR;
    process.env.MIGRATIONS_DIR = "/nonexistent/migrations";
    try {
      await expect(runMigrations(scratchUrl)).rejects.toThrow(/nonexistent|migrations/i);
    } finally {
      if (before === undefined) delete process.env.MIGRATIONS_DIR;
      else process.env.MIGRATIONS_DIR = before;
    }
  });

  it("ensureDatabase tolerates concurrent callers (duplicate_database race)", async () => {
    const racy = withDatabaseName(scratchUrl, `${new URL(scratchUrl).pathname.slice(1)}_race`);
    await dropDatabase(racy);
    try {
      await expect(Promise.all(Array.from({ length: 6 }, () => ensureDatabase(racy)))).resolves.toBeDefined();
    } finally {
      await dropDatabase(racy);
    }
  });
});
