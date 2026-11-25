/** A score is a fraction 0..1. Null, undefined and non-finite values mean "ungraded"; others are clamped. */
export function normalizeScore(score: number | null | undefined): number | null {
  if (score === null || score === undefined || !Number.isFinite(score)) return null;
  return Math.min(1, Math.max(0, score));
}
