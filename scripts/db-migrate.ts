import { runMigrations } from "../src/db/migrate";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  await runMigrations(url);
  console.log("migrations applied");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
