// Server-only seam: what the current learner may open. The day page reads the learner's current day here.
// TODO(wiring PR): replace this stub with the DB-backed lookup (profiles.current_day for getCurrentUserId()).
// Until then every day is unlocked.
export async function getCurrentDay(): Promise<number> {
  return 365;
}
