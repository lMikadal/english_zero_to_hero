// Runs once before the integration project: make sure the test database exists and is migrated.
import { ensureDatabase } from "./admin";
import { runMigrations } from "./migrate";
import { testDatabaseUrl } from "./test-utils";

export default async function setup() {
  const url = testDatabaseUrl();
  await ensureDatabase(url);
  await runMigrations(url);
}
