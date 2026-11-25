// Dev only: drop and recreate the dev database, then migrate it.
// `--check` only runs the guard (so `make` can refuse before starting postgres).
import { assertResettable, databaseName, recreateDatabase } from "../src/db/admin";
import { runMigrations } from "../src/db/migrate";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  assertResettable(url, process.env.CONFIRM);
  if (process.argv.includes("--check")) return;
  console.log(`dropping and recreating ${databaseName(url)} ...`);
  await recreateDatabase(url);
  const applied = await runMigrations(url);
  console.log(`done (applied ${applied} migration(s))`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
