// Client-safe: no node:* or src/db imports. Rule is documented in docs/CONTENT_SCHEMA.md.
import { canonicalAnswer } from "./equivalents";

/**
 * Strip zero-width characters (U+200B-U+200D, U+FEFF); map the apostrophe look-alikes ’ ‘ ʼ ´ ` to '
 * (before NFKC, which would turn ´ into a combining accent); apply NFKC (fullwidth forms, the ellipsis
 * character becomes "..."); lower-case; `. ! ? ,` anywhere become spaces; collapse and trim whitespace.
 */
export function normalizeAnswer(s: string): string {
  return s
    .replace(/[​-‍﻿]/g, "")
    .replace(/[’‘ʼ´`]/g, "'")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[.!?,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** The form two answers are compared in: normalised, then contractions and digits folded (equivalents.ts). */
const comparable = (s: string): string => canonicalAnswer(normalizeAnswer(s));

/** True when `input` equals one of `accepted` after normalising both and folding contractions and digits. Empty input never matches. */
export function matchesAny(input: string, accepted: readonly string[]): boolean {
  const n = comparable(input);
  return n !== "" && accepted.some((a) => comparable(a) === n);
}
