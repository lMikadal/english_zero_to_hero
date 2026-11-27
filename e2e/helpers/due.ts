// Makes review cards due for the E2E run, by changing the database directly (docs/plans/vocab-review-plan.md, PR 6).
//
// Why SQL and not the app: a lesson finished on day D creates `en_th` cards due at local midnight of D+1 and `th_en`
// cards at D+2, so in one E2E run nothing is due, and the app must not learn a way to skip its clock (no test route,
// no query parameter, no env flag that changes scheduling). The test therefore does what the learner's calendar would
// do: it moves `due` into the past, in the database the E2E run owns, and then uses the app only through its pages.
//
// Safety: the URL comes from E2E_DATABASE_URL (set by the `e2e` service in docker-compose.yml, never from the app's
// DATABASE_URL), and the database name must end in `_dev` (the same rule as `make db-reset`), so the real
// `english_zero_to_hero` database can never be touched. This file lives under e2e/ and is not part of the app.
import postgres from "postgres";

export type CardDirection = "en_th" | "th_en";

/** The database name of a connection URL (same parsing as src/db/admin.ts). */
export const databaseNameOf = (url: string): string => decodeURIComponent(new URL(url).pathname.slice(1));

/** Throws unless `url` points at a database that may be changed by E2E: its name ends in `_dev` (and is more than that). */
export function assertE2eDatabase(url: string | undefined): string {
  if (!url) throw new Error("E2E_DATABASE_URL is not set: the E2E service in docker-compose.yml sets it; this spec needs it to make cards due");
  const name = databaseNameOf(url);
  if (!name.endsWith("_dev") || name === "_dev") {
    throw new Error(`E2E refuses to change database "${name}": only names ending in "_dev" are allowed (the same rule as make db-reset)`);
  }
  return url;
}

/** Puts every card of `direction` one hour in the past. Returns how many cards changed. */
export async function makeCardsDue(direction: CardDirection, env: Record<string, string | undefined> = process.env): Promise<number> {
  const sql = postgres(assertE2eDatabase(env.E2E_DATABASE_URL), { max: 1, onnotice: () => {} });
  try {
    const rows = await sql`update srs_cards set due = now() - interval '1 hour' where direction = ${direction} returning 1`;
    return rows.length;
  } finally {
    await sql.end();
  }
}
