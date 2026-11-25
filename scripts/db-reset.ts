// Dev only: drop and recreate the dev database, then migrate it.
import { databaseName, recreateDatabase } from "../src/db/admin";
import { runMigrations } from "../src/db/migrate";

async function main() {
  const url = process.env.DATABASE_URL;
  if (process.env.NODE_ENV === "production") throw new Error("db-reset refuses to run with NODE_ENV=production");
  if (!url) throw new Error("DATABASE_URL is not set");
  const host = new URL(url).hostname;
  if (!["postgres", "localhost", "127.0.0.1"].includes(host)) {
    throw new Error(`db-reset refuses to touch non-local host "${host}"`);
  }
  console.log(`dropping and recreating ${databaseName(url)} ...`);
  await recreateDatabase(url);
  await runMigrations(url);
  console.log("done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
