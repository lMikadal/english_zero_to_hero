// Client-safe: no node:* or src/db imports. Rule is documented in docs/CONTENT_SCHEMA.md.

/** Lower-case; ’ ‘ → '; `. ! ? ,` anywhere → space; collapse and trim whitespace. */
export function normalizeAnswer(s: string): string {
  return s
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[.!?,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** True when `input` equals one of `accepted` after normalising both. Empty input never matches. */
export function matchesAny(input: string, accepted: readonly string[]): boolean {
  const n = normalizeAnswer(input);
  return n !== "" && accepted.some((a) => normalizeAnswer(a) === n);
}
