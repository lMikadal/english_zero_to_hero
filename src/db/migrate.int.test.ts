// @vitest-environment node
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import { recreateDatabase, dropDatabase, withDatabaseName } from "./admin";
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

    await runMigrations(scratchUrl);
    expect(await listTables(scratchUrl)).toEqual(EXPECTED_TABLES);
    const applied = await appliedMigrations(scratchUrl);
    expect(applied).toBeGreaterThan(0);

    await runMigrations(scratchUrl);
    expect(await listTables(scratchUrl)).toEqual(EXPECTED_TABLES);
    expect(await appliedMigrations(scratchUrl)).toBe(applied);
  });
});
