// Dev only: drop and recreate the dev database, then migrate it.
import { databaseName, recreateDatabase } from "../src/db/admin";
import { runMigrations } from "../src/db/migrate";

const url = process.env.DATABASE_URL;
if (process.env.NODE_ENV === "production") {
  console.error("db-reset refuses to run with NODE_ENV=production");
  process.exit(1);
}
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}
const host = new URL(url).hostname;
if (!["postgres", "localhost", "127.0.0.1"].includes(host)) {
  console.error(`db-reset refuses to touch non-local host "${host}"`);
  process.exit(1);
}
console.log(`dropping and recreating ${databaseName(url)} ...`);
await recreateDatabase(url);
await runMigrations(url);
console.log("done");
