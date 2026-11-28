// Migrations after 0004 run automatically on the user's real data (make prod-up / prod-update), so a statement that
// can destroy data must have been looked at by a human: the file then carries REVIEW_MARKER on a line of its own.
export const REVIEW_MARKER = "-- destructive: reviewed";

const PATTERNS: Array<[string, RegExp]> = [
  ["DROP TABLE", /\bdrop\s+table\b/i],
  ["DROP SCHEMA", /\bdrop\s+schema\b/i],
  // `ALTER TABLE ... DROP <column>` with or without the COLUMN keyword; dropping constraints, defaults, NOT NULL or an
  // index loses no rows
  ["DROP COLUMN", /\bdrop\s+column\b|\balter\s+table\b[^;]*?\bdrop\s+(?!constraint\b|default\b|not\s+null\b|identity\b|expression\b|index\b)["\w]/i],
  ["TRUNCATE", /\btruncate\b/i],
  ["DELETE FROM", /\bdelete\s+from\b/i],
  // a statement that starts with UPDATE (not the `ON UPDATE cascade` of a foreign key)
  ["UPDATE ... SET", /(?:^|;)\s*update\s+(?:only\s+)?(?:"[^"]+"|[\w.]+)(?:\s+(?:as\s+)?\w+)?\s+set\b/im],
  ["ALTER ... TYPE", /\balter\s+(?:column\s+)?(?:"[^"]+"|\w+)\s+(?:set\s+data\s+)?type\b/i],
];

/** Names of the destructive statements found in a migration's SQL (empty when none, or when it carries the marker). */
export function findDestructive(sql: string): string[] {
  if (sql.split("\n").some((l) => l.trim() === REVIEW_MARKER)) return [];
  const code = sql
    .split("\n")
    .map((l) => l.replace(/--.*$/, ""))
    .join("\n");
  return PATTERNS.filter(([, re]) => re.test(code)).map(([name]) => name);
}
