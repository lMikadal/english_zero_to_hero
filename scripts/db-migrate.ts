// Create the database if missing, then apply pending migrations.
// `--ensure-only` creates the database and stops (used by `make up`).
import { ensureDatabase } from "../src/db/admin";
import { runMigrations } from "../src/db/migrate";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  await ensureDatabase(url);
  if (process.argv.includes("--ensure-only")) return;
  const applied = await runMigrations(url);
  console.log(applied === 0 ? "already up to date" : `applied ${applied} migration(s)`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
